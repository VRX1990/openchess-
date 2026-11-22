import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Chess, type Color, type Move, type PieceSymbol } from 'chess.js';
import {
  ArrowLeft,
  ArrowLeftRight,
  BookOpen,
  ChevronDown,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Compass,
  Filter,
  Lock,
  RotateCcw,
  Search,
  SearchCheck,
  X,
} from 'lucide-react';
import { ChessBoard, type BoardTheme } from './ChessBoard';
import { EvaluationBar } from './EvaluationBar';
import { MoveSanText } from './MoveSanText';
import { PlayerAvatar } from './PlayerAvatar';
import { loadPlayedGames } from '../chess/analytics';
import { playMoveSound } from '../chess/sound';
import { getStepNavigationSound } from '../chess/boardMotion';
import {
  analyzeLivePositionWithStockfish19,
  getCachedPositionAnalysis,
} from '../chess/stockfishWorker';
import {
  formatEvalDisplay,
  type PositionAnalysisSnapshot,
} from '../chess/reviewAnalysis';
import {
  DEFAULT_EXPLORER_FILTER,
  buildLocalFallbackExplorer,
  buildMyGamesExplorer,
  computeWinDrawLossPct,
  detectOpeningForPosition,
  formatCompactGamesCount,
  formatMoveLabelForTurn,
  formatPopularityPct,
  getFenTurnAndMoveNumber,
  normalizeExplorerPayload,
  normalizeFenKey,
  type ExplorerDatabase,
  type ExplorerFilterConfig,
  type ExplorerMoveStat,
  type ExplorerPositionData,
  type ExplorerSpeed,
  type ExplorerTopGame,
  type RawExplorerPayload,
} from '../chess/explorer';

export interface BoardExplorerModalProps {
  open: boolean;
  onClose: () => void;
  boardTheme: BoardTheme;
  initialHistory: Move[];
  initialViewPly: number | null;
  initialOrientation: Color;
  playerColor: Color;
  whiteName: string;
  blackName: string;
  whiteRating?: number;
  blackRating?: number;
  whiteAvatarUrl?: string;
  blackAvatarUrl?: string;
  isLiveOnlineGame: boolean;
  onOpenReview?: (pgn: string, playerColor: Color, resultLabel: string) => void;
}

interface ExploredMoveItem {
  san: string;
  from: string;
  to: string;
  fen: string;
  capture: boolean;
  check: boolean;
  castle: boolean;
  promotion?: PieceSymbol;
}

const START_FEN = new Chess().fen();

function buildExploredLineFromHistory(history: Move[]): ExploredMoveItem[] {
  const board = new Chess();
  const items: ExploredMoveItem[] = [];
  for (const mv of history) {
    try {
      const played = board.move({
        from: mv.from,
        to: mv.to,
        promotion: mv.promotion,
      });
      if (!played) break;
      items.push({
        san: played.san,
        from: played.from,
        to: played.to,
        fen: board.fen(),
        capture: Boolean(played.captured),
        check: played.san.includes('+') || played.san.includes('#'),
        castle: played.san.startsWith('O-O'),
        promotion: played.promotion,
      });
    } catch {
      break;
    }
  }
  return items;
}

function buildExploredLineFromPgn(pgn: string): ExploredMoveItem[] {
  const replay = new Chess();
  try {
    replay.loadPgn(pgn);
  } catch {
    return [];
  }
  return buildExploredLineFromHistory(replay.history({ verbose: true }));
}

function buildPgnFromLine(line: ExploredMoveItem[]): string {
  const chess = new Chess();
  for (const item of line) {
    try {
      chess.move({ from: item.from, to: item.to, promotion: item.promotion });
    } catch {
      break;
    }
  }
  return chess.pgn();
}

function formatPvLineWithMoveNumbers(
  lineSan: string[],
  startMoveNumber: number,
  startTurn: Color,
): string {
  const parts: string[] = [];
  let moveNum = startMoveNumber;
  let turn: Color = startTurn;
  for (let i = 0; i < lineSan.length && i < 8; i++) {
    const san = lineSan[i];
    if (turn === 'w') {
      parts.push(`${moveNum}. ${san}`);
      turn = 'b';
    } else {
      parts.push(i === 0 ? `${moveNum}... ${san}` : san);
      turn = 'w';
      moveNum += 1;
    }
  }
  return parts.join(' ');
}

const SPEED_PRESETS: Array<{ id: string; label: string; speeds: ExplorerSpeed[] }> = [
  { id: 'rapid-blitz', label: 'Rapid, Blitz', speeds: ['rapid', 'blitz'] },
  { id: 'all', label: 'Bullet, Blitz, Rapid, Classical', speeds: ['bullet', 'blitz', 'rapid', 'classical'] },
  { id: 'rapid', label: 'Rapid', speeds: ['rapid'] },
  { id: 'blitz', label: 'Blitz', speeds: ['blitz'] },
  { id: 'bullet', label: 'Bullet', speeds: ['bullet'] },
  { id: 'classical', label: 'Classical', speeds: ['classical'] },
];

const RATING_OPTIONS = [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];

const DATABASE_LABELS: Record<ExplorerDatabase, string> = {
  masters: 'Master Games',
  community: 'All OpenChess Games',
  'my-games': 'My Games',
};

function renderResultBadge(winner: ExplorerTopGame['winner']) {
  if (winner === 'white') {
    return (
      <span className="inline-flex items-center justify-center min-w-[38px] px-1.5 py-0.5 rounded-[3px] bg-[#EFEFEF] text-[#262421] font-bold text-[11px] tabular-nums shrink-0">
        1-0
      </span>
    );
  }
  if (winner === 'black') {
    return (
      <span className="inline-flex items-center justify-center min-w-[38px] px-1.5 py-0.5 rounded-[3px] bg-[#1A1917] text-[#E6E3DE] border border-white/15 font-bold text-[11px] tabular-nums shrink-0">
        0-1
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center min-w-[38px] px-1.5 py-0.5 rounded-[3px] bg-[#666460] text-white font-bold text-[11px] tabular-nums shrink-0">
      ½-½
    </span>
  );
}

export function BoardExplorerModal({
  open,
  onClose,
  boardTheme,
  initialHistory,
  initialViewPly,
  initialOrientation,
  playerColor,
  whiteName,
  blackName,
  whiteRating,
  blackRating,
  whiteAvatarUrl,
  blackAvatarUrl,
  isLiveOnlineGame,
  onOpenReview,
}: BoardExplorerModalProps) {
  const initialLine = useMemo(
    () => buildExploredLineFromHistory(initialHistory),
    [initialHistory],
  );
  const initialPly = useMemo(() => {
    if (initialViewPly !== null && initialViewPly >= 0 && initialViewPly <= initialLine.length) {
      return initialViewPly;
    }
    return initialLine.length;
  }, [initialLine.length, initialViewPly]);

  const [line, setLine] = useState<ExploredMoveItem[]>(initialLine);
  const [ply, setPly] = useState<number>(initialPly);
  const [orientation, setOrientation] = useState<Color>(initialOrientation);
  const [activeTab, setActiveTab] = useState<'analysis' | 'games' | 'explore'>('explore');
  const [gamesSubTab, setGamesSubTab] = useState<'notable' | 'my-games'>('notable');
  const [showAllMoves, setShowAllMoves] = useState(false);
  const [hoveredMove, setHoveredMove] = useState<{ from: string; to: string } | null>(null);

  // Filter state (matching Chess.com Explore Games modal)
  const [filter, setFilter] = useState<ExplorerFilterConfig>(DEFAULT_EXPLORER_FILTER);
  const [draftFilter, setDraftFilter] = useState<ExplorerFilterConfig>(DEFAULT_EXPLORER_FILTER);
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  // Engine Analysis state (disabled by default during live online matches)
  const [engineEnabled, setEngineEnabled] = useState<boolean>(!isLiveOnlineGame);
  const [engineSnap, setEngineSnap] = useState<PositionAnalysisSnapshot | null>(null);
  const [engineSearching, setEngineSearching] = useState(false);

  // Explorer data state
  const [explorerData, setExplorerData] = useState<ExplorerPositionData | null>(null);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [loadedGameTitle, setLoadedGameTitle] = useState<string | null>(null);
  const clientCacheRef = useRef<Map<string, ExplorerPositionData>>(new Map());

  // Re-initialize sandbox cleanly each time the modal opens
  useEffect(() => {
    if (!open) return;
    setLine(initialLine);
    setPly(initialPly);
    setOrientation(initialOrientation);
    setActiveTab('explore');
    setShowAllMoves(false);
    setHoveredMove(null);
    setLoadedGameTitle(null);
    setEngineEnabled(!isLiveOnlineGame);
  }, [open, initialLine, initialPly, initialOrientation, isLiveOnlineGame]);

  const currentFen = ply === 0 ? START_FEN : (line[ply - 1]?.fen ?? START_FEN);
  const currentLastMove =
    ply > 0 && line[ply - 1]
      ? { from: line[ply - 1].from, to: line[ply - 1].to }
      : null;
  const currentHistorySans = useMemo(
    () => line.slice(0, ply).map((m) => m.san),
    [line, ply],
  );
  const { turn: sideToMove, moveNumber } = useMemo(
    () => getFenTurnAndMoveNumber(currentFen),
    [currentFen],
  );

  const gamePositionFen =
    initialPly === 0 ? START_FEN : (initialLine[initialPly - 1]?.fen ?? START_FEN);
  const isAtGamePosition =
    normalizeFenKey(currentFen) === normalizeFenKey(gamePositionFen) && !loadedGameTitle;

  const storedMyGames = useMemo(() => (open ? loadPlayedGames() : []), [open]);

  const myGamesAtFen = useMemo(
    () => buildMyGamesExplorer(currentFen, storedMyGames, currentHistorySans),
    [currentFen, storedMyGames, currentHistorySans],
  );

  // Fetch explorer data for the current position & filter
  useEffect(() => {
    if (!open) return;
    setShowAllMoves(false);

    if (filter.database === 'my-games') {
      setExplorerData(myGamesAtFen);
      setExplorerLoading(false);
      return;
    }

    const ratingsList = RATING_OPTIONS.filter(
      (r) => r >= filter.minRating && r <= filter.maxRating,
    );
    const ratingsParam = (ratingsList.length > 0 ? ratingsList : [1800, 2000, 2200, 2500]).join(',');
    const speedsParam = (filter.speeds.length > 0 ? filter.speeds : ['rapid', 'blitz']).join(',');

    const cacheKey = `${filter.database}|${speedsParam}|${ratingsParam}|${filter.sinceYear}|${filter.untilYear}|${normalizeFenKey(currentFen)}`;
    const cached = clientCacheRef.current.get(cacheKey);
    if (cached) {
      setExplorerData(cached);
      setExplorerLoading(false);
      return;
    }

    // Immediate curated preview so UI never flashes blank while live DB responds
    const fallback = buildLocalFallbackExplorer(currentFen, filter.database, currentHistorySans);
    setExplorerData(fallback);
    setExplorerLoading(true);

    const controller = new AbortController();
    const params = new URLSearchParams({
      fen: currentFen,
      database: filter.database,
      speeds: speedsParam,
      ratings: ratingsParam,
    });
    if (filter.sinceYear.trim()) params.set('since', filter.sinceYear.trim());
    if (filter.untilYear.trim()) params.set('until', filter.untilYear.trim());

    fetch(`/api/explorer?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as RawExplorerPayload;
      })
      .then((raw) => {
        if (controller.signal.aborted) return;
        const normalized = normalizeExplorerPayload(
          raw,
          currentFen,
          filter.database,
          currentHistorySans,
        );
        // If live DB returned moves or games, prefer it; otherwise keep rich local fallback if it has moves
        const resolved =
          normalized.moves.length > 0 || fallback.moves.length === 0
            ? normalized
            : { ...fallback, opening: normalized.opening };
        clientCacheRef.current.set(cacheKey, resolved);
        setExplorerData(resolved);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setExplorerData(fallback);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setExplorerLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [open, currentFen, filter, currentHistorySans, myGamesAtFen]);

  // Live Multi-PV Engine Analysis (strictly disabled during active online matches)
  useEffect(() => {
    if (!open || isLiveOnlineGame || !engineEnabled) {
      setEngineSearching(false);
      if (isLiveOnlineGame || !engineEnabled) {
        setEngineSnap(null);
      }
      return;
    }

    const cached = getCachedPositionAnalysis(currentFen, 14, 3);
    if (cached) {
      setEngineSnap(cached);
    }

    const controller = new AbortController();
    setEngineSearching(true);

    analyzeLivePositionWithStockfish19(currentFen, {
      depth: 16,
      movetimeMs: 650,
      multiPv: 3,
      signal: controller.signal,
      onProgress: (snap) => {
        if (!controller.signal.aborted) {
          setEngineSnap(snap);
        }
      },
    })
      .then((snap) => {
        if (!controller.signal.aborted) {
          setEngineSnap(snap);
        }
      })
      .catch(() => {
        // ignore abort
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setEngineSearching(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [open, currentFen, engineEnabled, isLiveOnlineGame]);

  const playMoveOnSandbox = useCallback(
    (moveInput: string | { from: string; to: string; promotion?: PieceSymbol }): boolean => {
      const board = new Chess(currentFen);
      let played: Move | null = null;
      try {
        played = board.move(moveInput);
      } catch {
        return false;
      }
      if (!played) return false;

      const item: ExploredMoveItem = {
        san: played.san,
        from: played.from,
        to: played.to,
        fen: board.fen(),
        capture: Boolean(played.captured),
        check: played.san.includes('+') || played.san.includes('#'),
        castle: played.san.startsWith('O-O'),
        promotion: played.promotion,
      };

      setLine((prev) => [...prev.slice(0, ply), item]);
      setPly((prev) => prev + 1);
      setHoveredMove(null);

      playMoveSound({
        capture: item.capture,
        check: item.check,
        castle: item.castle,
        promotion: Boolean(item.promotion),
        toSquare: item.to,
      });

      return true;
    },
    [currentFen, ply],
  );

  const handleBoardMove = useCallback(
    (from: string, to: string, promotion?: PieceSymbol) => {
      return playMoveOnSandbox({ from, to, promotion: promotion ?? 'q' });
    },
    [playMoveOnSandbox],
  );

  const handleResetToGame = useCallback(() => {
    setLine(initialLine);
    setPly(initialPly);
    setLoadedGameTitle(null);
    setHoveredMove(null);
  }, [initialLine, initialPly]);

  const handleLoadTopGame = useCallback((game: ExplorerTopGame) => {
    if (!game.pgn) return;
    const parsed = buildExploredLineFromPgn(game.pgn);
    if (parsed.length === 0) return;
    setLine(parsed);
    // Keep cursor on the current FEN if found in the loaded game, else start at ply 0
    const targetKey = normalizeFenKey(currentFen);
    const matchIdx = parsed.findIndex((item) => normalizeFenKey(item.fen) === targetKey);
    setPly(matchIdx >= 0 ? matchIdx + 1 : Math.min(parsed.length, 10));
    setLoadedGameTitle(`${game.whiteName} vs ${game.blackName}`);
    setActiveTab('analysis');
  }, [currentFen]);

  const navigateExplorerPly = useCallback(
    (next: number | ((current: number) => number)) => {
      const targetRaw = typeof next === 'function' ? next(ply) : next;
      const clamped = Math.max(0, Math.min(line.length, targetRaw));
      if (clamped !== ply) {
        const navSound = getStepNavigationSound(line, ply, clamped);
        if (navSound) {
          playMoveSound({
            capture: navSound.capture,
            check: navSound.check,
            castle: navSound.castle,
            promotion: navSound.promotion,
            toSquare: navSound.toSquare,
          });
        }
      }
      setPly(clamped);
    },
    [line, ply],
  );

  // Keyboard navigation (Escape, ArrowLeft, ArrowRight, ArrowUp, ArrowDown)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (filterModalOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setFilterModalOpen(false);
        }
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateExplorerPly((p) => Math.max(0, p - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateExplorerPly((p) => Math.min(line.length, p + 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        navigateExplorerPly(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        navigateExplorerPly(line.length);
      } else if (e.key === 'f' || e.key === 'F') {
        setOrientation((o) => (o === 'w' ? 'b' : 'w'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, filterModalOpen, line.length, navigateExplorerPly, onClose]);

  const movePairs = useMemo(() => {
    const pairs: Array<{
      moveNumber: number;
      white?: ExploredMoveItem;
      whitePly: number;
      black?: ExploredMoveItem;
      blackPly: number;
    }> = [];
    for (let i = 0; i < line.length; i += 2) {
      pairs.push({
        moveNumber: Math.floor(i / 2) + 1,
        white: line[i],
        whitePly: i + 1,
        black: line[i + 1],
        blackPly: i + 2,
      });
    }
    return pairs;
  }, [line]);

  // Map SAN -> engine eval pill text when Engine Analysis is active
  const engineEvalBySan = useMemo(() => {
    const map = new Map<string, { text: string; evalCp: number }>();
    if (!engineEnabled || isLiveOnlineGame || !engineSnap) return map;
    for (const pv of engineSnap.lines) {
      if (pv.firstMoveSan && !map.has(pv.firstMoveSan)) {
        map.set(pv.firstMoveSan, {
          text: formatEvalDisplay(pv.evalCp, pv.mateIn),
          evalCp: pv.evalCp,
        });
      }
    }
    return map;
  }, [engineEnabled, isLiveOnlineGame, engineSnap]);

  const boardArrows = useMemo(() => {
    const arrows: Array<{ from: string; to: string; color?: 'green' | 'red' | 'yellow' | 'blue' }> = [];
    if (hoveredMove) {
      arrows.push({ from: hoveredMove.from, to: hoveredMove.to, color: 'green' });
    } else if (engineEnabled && !isLiveOnlineGame && engineSnap?.bestMoveFrom && engineSnap?.bestMoveTo) {
      arrows.push({
        from: engineSnap.bestMoveFrom,
        to: engineSnap.bestMoveTo,
        color: 'green',
      });
    }
    return arrows;
  }, [hoveredMove, engineEnabled, isLiveOnlineGame, engineSnap]);

  const openingInfo =
    explorerData?.opening ?? detectOpeningForPosition(currentFen, currentHistorySans);
  const allMoves = explorerData?.moves ?? [];
  const visibleMoves = showAllMoves ? allMoves : allMoves.slice(0, 5);
  const positionTotalGames = explorerData?.totalGames ?? 0;

  const topPlayer =
    orientation === 'w'
      ? { name: blackName, rating: blackRating, avatarUrl: blackAvatarUrl }
      : { name: whiteName, rating: whiteRating, avatarUrl: whiteAvatarUrl };
  const bottomPlayer =
    orientation === 'w'
      ? { name: whiteName, rating: whiteRating, avatarUrl: whiteAvatarUrl }
      : { name: blackName, rating: blackRating, avatarUrl: blackAvatarUrl };

  const showEvalBar = engineEnabled && !isLiveOnlineGame;

  if (!open || typeof document === 'undefined') return null;

  const openFilterModal = () => {
    setDraftFilter(filter);
    setFilterModalOpen(true);
  };

  const applyDraftFilter = () => {
    setFilter(draftFilter);
    setFilterModalOpen(false);
  };

  const activeSpeedPresetId =
    SPEED_PRESETS.find(
      (p) =>
        p.speeds.length === draftFilter.speeds.length &&
        p.speeds.every((s) => draftFilter.speeds.includes(s)),
    )?.id ?? 'rapid-blitz';

  const displayedNotableGames =
    gamesSubTab === 'my-games'
      ? myGamesAtFen.topGames
      : explorerData?.topGames ?? [];

  const renderMoveRow = (mv: ExplorerMoveStat) => {
    const pct = computeWinDrawLossPct(mv.white, mv.draws, mv.black);
    const popText = formatPopularityPct(mv.totalGames, positionTotalGames);
    const countText = formatCompactGamesCount(mv.totalGames);
    const moveLabel = formatMoveLabelForTurn(mv.san, moveNumber, sideToMove);
    const evalBadge = engineEvalBySan.get(mv.san);

    return (
      <button
        key={mv.uci}
        type="button"
        onClick={() => playMoveOnSandbox({ from: mv.from, to: mv.to })}
        onMouseEnter={() => setHoveredMove({ from: mv.from, to: mv.to })}
        onMouseLeave={() => setHoveredMove(null)}
        className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors text-left cursor-pointer"
      >
        <span className="w-[68px] text-[13px] font-bold text-white tabular-nums truncate shrink-0">
          {moveLabel}
        </span>

        {showEvalBar && (
          <span className="w-[44px] shrink-0 flex items-center justify-center">
            {evalBadge ? (
              <span
                className={`px-1.5 py-0.5 rounded-[3px] text-[11px] font-extrabold tabular-nums leading-tight ${
                  evalBadge.evalCp >= 0
                    ? 'bg-[#FFFFFF] text-[#262421]'
                    : 'bg-[#403D39] text-[#FFFFFF]'
                }`}
              >
                {evalBadge.text}
              </span>
            ) : (
              <span className="text-[11px] text-[#6B6864]">·</span>
            )}
          </span>
        )}

        <span className="w-[32px] text-right text-[12px] font-semibold text-[#C6C3BE] tabular-nums shrink-0">
          {popText}
        </span>

        <span className="w-[44px] text-right text-[12px] font-medium text-[#C6C3BE] tabular-nums shrink-0">
          {countText}
        </span>

        <div
          className="flex-1 min-w-[116px] h-[22px] rounded-[4px] overflow-hidden flex text-[11px] font-extrabold leading-none select-none border border-white/10"
          aria-label={`White ${pct.whitePct}%, Draw ${pct.drawPct}%, Black ${pct.blackPct}%`}
        >
          {pct.whitePct > 0 && (
            <div
              className="bg-[#EFEFEF] text-[#312E2B] flex items-center justify-center overflow-hidden"
              style={{ width: `${pct.whitePct}%` }}
            >
              {pct.whitePct >= 16 ? `${pct.whitePct}%` : ''}
            </div>
          )}
          {pct.drawPct > 0 && (
            <div
              className="bg-[#7B7875] text-white flex items-center justify-center overflow-hidden"
              style={{ width: `${pct.drawPct}%` }}
            >
              {pct.drawPct >= 16 ? `${pct.drawPct}%` : ''}
            </div>
          )}
          {pct.blackPct > 0 && (
            <div
              className="bg-[#312E2B] text-white flex items-center justify-center overflow-hidden"
              style={{ width: `${pct.blackPct}%` }}
            >
              {pct.blackPct >= 16 ? `${pct.blackPct}%` : ''}
            </div>
          )}
        </div>
      </button>
    );
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Board Explorer"
      data-testid="board-explorer-modal"
      className="fixed inset-0 z-[80] bg-[#302E2B] text-[#E6E3DE] flex flex-col lg:flex-row lg:items-center lg:justify-center overflow-y-auto lg:overflow-hidden"
    >
      {/* Mobile Top Header */}
      <div className="lg:hidden sticky top-0 z-20 flex items-center justify-between h-12 px-2 bg-[#262421] border-b border-white/10 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[40px] px-2 flex items-center gap-1.5 rounded-lg text-sm font-bold text-[#DEDAD2] hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Game</span>
        </button>

        <div className="flex items-center gap-1.5">
          <Compass className="w-4 h-4 text-[#81B64C]" />
          <span className="text-sm font-extrabold text-white">Explorer</span>
        </div>

        <button
          type="button"
          onClick={openFilterModal}
          aria-label="Filter Explorer Games"
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#C8C4BC] hover:text-white cursor-pointer"
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content Container */}
      <div className="w-full max-w-[1360px] mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-center gap-3 lg:gap-5 px-2 sm:px-4 py-2 lg:py-3 lg:h-full">
        {/* Left / Center Interactive Explorer Board */}
        <div className="w-full max-w-[min(560px,100%)] lg:max-w-[min(calc(100dvh-108px),740px)] mx-auto lg:mx-0 flex flex-col shrink-0">
          {/* Top Player Strip */}
          <div className="flex items-center justify-between gap-2 py-1.5 px-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <PlayerAvatar
                username={topPlayer.name}
                avatarUrl={topPlayer.avatarUrl}
                size={28}
                rounded="rounded-[4px]"
              />
              <span className="text-[13px] font-bold text-white truncate">
                {topPlayer.name}
              </span>
              {typeof topPlayer.rating === 'number' && topPlayer.rating > 0 && (
                <span className="text-[12px] text-[#A8A49E] tabular-nums">
                  ({topPlayer.rating})
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!isAtGamePosition && (
                <button
                  type="button"
                  onClick={handleResetToGame}
                  className="px-2.5 py-1 rounded-[4px] bg-[#81B64C]/20 hover:bg-[#81B64C]/30 border border-[#81B64C]/45 text-[11px] font-bold text-[#B8E986] flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset to Game</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}
                aria-label="Flip explorer board"
                className="w-7 h-7 rounded-[4px] bg-[#262421] hover:bg-[#3A3733] text-[#C8C4BC] hover:text-white flex items-center justify-center cursor-pointer"
                title="Flip Board (F)"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Eval Bar + Sandbox Chessboard */}
          <div className="flex items-stretch gap-1.5 sm:gap-2">
            {showEvalBar && (
              <EvaluationBar
                evalCp={engineSnap?.evalCp ?? 0}
                mateIn={engineSnap?.mateIn ?? null}
                orientation={orientation}
              />
            )}
            <div className="flex-1 min-w-0">
              <ChessBoard
                fen={currentFen}
                orientation={orientation}
                interactive={true}
                allowedColor="both"
                lastMove={currentLastMove}
                extraArrows={boardArrows}
                theme={boardTheme}
                onMove={handleBoardMove}
              />
            </div>
          </div>

          {/* Bottom Player Strip */}
          <div className="flex items-center justify-between gap-2 py-1.5 px-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <PlayerAvatar
                username={bottomPlayer.name}
                avatarUrl={bottomPlayer.avatarUrl}
                size={28}
                rounded="rounded-[4px]"
              />
              <span className="text-[13px] font-bold text-white truncate">
                {bottomPlayer.name}
              </span>
              {typeof bottomPlayer.rating === 'number' && bottomPlayer.rating > 0 && (
                <span className="text-[12px] text-[#A8A49E] tabular-nums">
                  ({bottomPlayer.rating})
                </span>
              )}
            </div>

            {loadedGameTitle ? (
              <span className="text-[11px] font-semibold text-[#F7C045] truncate max-w-[200px]">
                Viewing: {loadedGameTitle}
              </span>
            ) : (
              <span className="text-[11px] font-medium text-[#9B9894] tabular-nums">
                Move {Math.ceil(ply / 2)} · {sideToMove === 'w' ? 'White' : 'Black'} to move
              </span>
            )}
          </div>
        </div>

        {/* Right Dock — Exact Chess.com 2026 Explorer Panel */}
        <aside className="w-full lg:w-[400px] xl:w-[420px] lg:h-[min(calc(100dvh-28px),840px)] bg-[#262421] rounded-[6px] shadow-[0_8px_28px_rgba(0,0,0,0.38)] overflow-hidden flex flex-col shrink-0">
          {/* Top Title Bar (Desktop only — Mobile uses sticky top header) */}
          <div className="hidden lg:flex h-[46px] px-3.5 bg-[#211F1C] border-b border-white/[0.06] items-center justify-between shrink-0">
            <div className="w-8" />
            <div className="flex items-center gap-2">
              <Compass className="w-[18px] h-[18px] text-white" />
              <h2 className="text-[16px] font-extrabold tracking-tight text-white">
                Explorer
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Explorer"
              className="w-8 h-8 rounded-[5px] hover:bg-white/10 text-[#A8A49E] hover:text-white flex items-center justify-center cursor-pointer"
              title="Back to Game (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 3-Tab Switcher (Analysis | Games | Explore — exact Chess.com layout) */}
          <div
            role="tablist"
            aria-label="Explorer sections"
            className="grid grid-cols-3 bg-[#1F1D1A] border-b border-white/[0.06] shrink-0"
          >
            {(
              [
                { id: 'analysis', label: 'Analysis', icon: Search },
                { id: 'games', label: 'Games', icon: BookOpen },
                { id: 'explore', label: 'Explore', icon: Compass },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2.5 px-2 flex flex-col items-center justify-center gap-1 text-[12px] font-bold transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#262421] text-white'
                      : 'bg-[#1F1D1A] text-[#989590] hover:text-[#DEDAD2]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Engine Analysis Toggle & Compact 3-Line Multi-PV Strip */}
          {activeTab !== 'games' && (
            <div className="border-b border-white/[0.07] bg-[#262421] shrink-0">
              {isLiveOnlineGame ? (
                <div className="px-3.5 py-2 flex items-center justify-between gap-2 text-[11px] text-[#A8A49E] bg-[#211F1C]">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Lock className="w-3.5 h-3.5 text-[#E59A28] shrink-0" />
                    <span>Engine lines disabled during live match</span>
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#81B64C]">
                    Fair Play
                  </span>
                </div>
              ) : (
                <>
                  <div className="px-3.5 py-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={engineEnabled}
                      onClick={() => setEngineEnabled((v) => !v)}
                      className="flex items-center gap-2 text-[12px] font-semibold text-[#D6D3CE] hover:text-white cursor-pointer"
                    >
                      <span
                        className={`relative inline-flex h-[18px] w-[32px] items-center rounded-full transition-colors ${
                          engineEnabled ? 'bg-[#81B64C]' : 'bg-[#4B4844]'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                            engineEnabled ? 'translate-x-[16px]' : 'translate-x-[2px]'
                          }`}
                        />
                      </span>
                      <span>Analysis</span>
                    </button>

                    <span className="text-[11px] font-medium text-[#989590] tabular-nums truncate">
                      {engineEnabled
                        ? `depth=${engineSnap?.depth ?? (engineSearching ? '…' : 16)} | OpenChess Engine`
                        : 'Engine Off'}
                    </span>
                  </div>

                  {engineEnabled && (
                    <div className="px-2.5 pb-2 space-y-1">
                      {(engineSnap?.lines ?? []).slice(0, 3).map((pv) => {
                        const evalText = formatEvalDisplay(pv.evalCp, pv.mateIn);
                        const whiteLeads = pv.evalCp >= 0;
                        return (
                          <button
                            key={pv.multipv}
                            type="button"
                            onClick={() =>
                              playMoveOnSandbox({
                                from: pv.firstMoveFrom,
                                to: pv.firstMoveTo,
                              })
                            }
                            onMouseEnter={() =>
                              setHoveredMove({ from: pv.firstMoveFrom, to: pv.firstMoveTo })
                            }
                            onMouseLeave={() => setHoveredMove(null)}
                            className="w-full px-1.5 py-1 rounded-[4px] hover:bg-white/[0.06] flex items-center gap-2 text-left transition-colors cursor-pointer"
                          >
                            <span
                              className={`min-w-[46px] text-center px-1.5 py-0.5 rounded-[3px] text-[11px] font-extrabold tabular-nums shrink-0 ${
                                whiteLeads
                                  ? 'bg-[#FFFFFF] text-[#262421]'
                                  : 'bg-[#403D39] text-[#FFFFFF]'
                              }`}
                            >
                              {evalText}
                            </span>
                            <span className="flex-1 text-[12px] font-semibold text-[#E8E5DF] truncate tabular-nums">
                              {formatPvLineWithMoveNumbers(pv.lineSan, moveNumber, sideToMove)}
                            </span>
                          </button>
                        );
                      })}
                      {(!engineSnap || engineSnap.lines.length === 0) && (
                        <div className="px-2 py-1 text-[11px] text-[#989590]">
                          Calculating top lines…
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Opening ECO Banner Strip */}
          <div className="px-3.5 py-2 border-b border-white/[0.07] bg-[#24221F] flex items-center gap-2 shrink-0">
            <Compass className="w-4 h-4 text-[#989590] shrink-0" />
            <span
              data-testid="explorer-opening-name"
              className="text-[13px] font-semibold text-[#D4D1CC] truncate"
            >
              {openingInfo.eco} {openingInfo.name}
            </span>
          </div>

          {/* Scrollable Body for Active Tab */}
          <div className="flex-1 overflow-y-auto min-h-[280px]">
            {activeTab === 'explore' && (
              <div className="flex flex-col">
                {/* Database Header Row + Filter Funnel Button */}
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={openFilterModal}
                    className="flex items-center gap-2 text-left group cursor-pointer min-w-0"
                  >
                    <span className="text-[13px] font-extrabold text-white group-hover:text-[#B8E986] transition-colors truncate">
                      {DATABASE_LABELS[filter.database]}
                    </span>
                    {positionTotalGames > 0 && (
                      <span className="text-[11px] font-semibold text-[#8E8B86] tabular-nums shrink-0">
                        {formatCompactGamesCount(positionTotalGames)}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={openFilterModal}
                    aria-label="Filter Explorer Games"
                    className="w-7 h-7 rounded-[4px] hover:bg-white/10 text-[#A8A49E] hover:text-white flex items-center justify-center cursor-pointer shrink-0"
                    title="Filter Games Database"
                  >
                    <Filter className="w-4 h-4" />
                  </button>
                </div>

                {/* Candidate Moves Table */}
                <div data-testid="explorer-moves-list" className="pb-1">
                  {visibleMoves.length > 0 ? (
                    <>
                      <div className="divide-y divide-white/[0.03]">
                        {visibleMoves.map(renderMoveRow)}
                      </div>

                      {allMoves.length > 5 && (
                        <button
                          type="button"
                          onClick={() => setShowAllMoves((v) => !v)}
                          className="w-full py-2 text-[12px] font-bold text-[#C6C3BE] hover:text-white hover:bg-white/[0.04] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          <span>{showAllMoves ? 'Less' : 'More'}</span>
                          {showAllMoves ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="px-4 py-6 text-center space-y-2">
                      <p className="text-[13px] font-bold text-[#DEDAD2]">
                        {explorerLoading
                          ? 'Loading opening database…'
                          : filter.database === 'my-games'
                            ? 'No personal games reached this position yet'
                            : 'No database games in this position'}
                      </p>
                      <p className="text-[11px] text-[#989590] leading-relaxed">
                        {filter.database === 'my-games'
                          ? 'Switch to Master Games or All OpenChess Games to explore theory, or play moves directly on the board.'
                          : 'You are out of opening theory — drag or click pieces on the board to keep exploring variations.'}
                      </p>
                      {filter.database !== 'masters' && (
                        <button
                          type="button"
                          onClick={() => setFilter((f) => ({ ...f, database: 'masters' }))}
                          className="px-3 py-1.5 rounded-[5px] bg-[#36332F] hover:bg-[#44413C] text-[12px] font-bold text-white cursor-pointer"
                        >
                          Switch to Master Games
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Sub-Tabs Below Moves: Notable Games | My Games */}
                <div className="mt-1 border-t border-white/[0.07]">
                  <div className="grid grid-cols-2 border-b border-white/[0.07]">
                    <button
                      type="button"
                      onClick={() => setGamesSubTab('notable')}
                      className={`py-2.5 text-[12px] font-bold transition-colors cursor-pointer ${
                        gamesSubTab === 'notable'
                          ? 'text-white border-b-2 border-white'
                          : 'text-[#989590] hover:text-[#DEDAD2]'
                      }`}
                    >
                      Notable Games
                    </button>
                    <button
                      type="button"
                      onClick={() => setGamesSubTab('my-games')}
                      className={`py-2.5 text-[12px] font-bold transition-colors cursor-pointer ${
                        gamesSubTab === 'my-games'
                          ? 'text-white border-b-2 border-white'
                          : 'text-[#989590] hover:text-[#DEDAD2]'
                      }`}
                    >
                      My Games ({myGamesAtFen.totalGames})
                    </button>
                  </div>

                  <div className="divide-y divide-white/[0.05]">
                    {displayedNotableGames.length > 0 ? (
                      displayedNotableGames.slice(0, 6).map((game) => (
                        <div
                          key={game.id}
                          className="px-3.5 py-2 hover:bg-white/[0.04] flex items-center justify-between gap-2 text-[12px]"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2 h-2 rounded-[2px] bg-[#EFEFEF] shrink-0" />
                              <span className="font-semibold text-white truncate">
                                {game.whiteName}
                              </span>
                              {typeof game.whiteRating === 'number' && (
                                <span className="text-[11px] text-[#989590] tabular-nums shrink-0">
                                  {game.whiteRating}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2 h-2 rounded-[2px] bg-[#1A1917] border border-white/25 shrink-0" />
                              <span className="font-semibold text-[#D6D3CE] truncate">
                                {game.blackName}
                              </span>
                              {typeof game.blackRating === 'number' && (
                                <span className="text-[11px] text-[#989590] tabular-nums shrink-0">
                                  {game.blackRating}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {game.year && (
                              <span className="text-[11px] text-[#8E8B86] tabular-nums">
                                {game.year}
                              </span>
                            )}
                            {renderResultBadge(game.winner)}
                            {game.pgn && (
                              <button
                                type="button"
                                onClick={() => handleLoadTopGame(game)}
                                className="px-2 py-1 rounded-[4px] bg-[#36332F] hover:bg-[#46433E] text-[11px] font-bold text-[#E6E3DE] cursor-pointer"
                              >
                                Load
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-6 text-center text-[12px] text-[#989590]">
                        {gamesSubTab === 'my-games'
                          ? 'Play and finish games on OpenChess to inspect your personal opening stats here.'
                          : 'No notable games indexed for this exact position.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'analysis' && (
              <div className="flex flex-col">
                <div className="px-3.5 py-2 bg-[#211F1C] border-b border-white/[0.06] flex items-center justify-between text-[11px] text-[#A8A49E]">
                  <span className="font-bold">
                    Explored Line ({line.length} {line.length === 1 ? 'ply' : 'plies'})
                  </span>
                  {!isAtGamePosition && (
                    <button
                      type="button"
                      onClick={handleResetToGame}
                      className="text-[#81B64C] hover:underline font-bold cursor-pointer"
                    >
                      Reset to Game
                    </button>
                  )}
                </div>

                {movePairs.length === 0 ? (
                  <div className="px-4 py-10 text-center text-[12px] text-[#989590]">
                    Make moves on the board or click candidate moves in the Explore tab to build a line.
                  </div>
                ) : (
                  <div className="font-mono text-[13px] tabular-nums">
                    {movePairs.map((pair) => (
                      <div
                        key={pair.moveNumber}
                        className="grid grid-cols-[42px_1fr_1fr] items-center even:bg-[#2B2926]"
                      >
                        <span className="px-3 py-1.5 text-[#8B8985] text-[12px]">
                          {pair.moveNumber}.
                        </span>
                        <button
                          type="button"
                          onClick={() => navigateExplorerPly(pair.whitePly)}
                          className="px-2 py-1 text-left cursor-pointer hover:bg-white/[0.05]"
                        >
                          <span
                            className={`inline-block rounded-[3px] px-1.5 py-0.5 leading-tight ${
                              ply === pair.whitePly
                                ? 'bg-[#4B4844] text-white font-bold border-b-2 border-[#81B64C]'
                                : 'text-[#E3E1DD]'
                            }`}
                          >
                            {pair.white?.san && <MoveSanText san={pair.white.san} />}
                          </span>
                        </button>
                        {pair.black ? (
                          <button
                            type="button"
                            onClick={() => navigateExplorerPly(pair.blackPly)}
                            className="px-2 py-1 text-left cursor-pointer hover:bg-white/[0.05]"
                          >
                            <span
                              className={`inline-block rounded-[3px] px-1.5 py-0.5 leading-tight ${
                                ply === pair.blackPly
                                  ? 'bg-[#4B4844] text-white font-bold border-b-2 border-[#81B64C]'
                                  : 'text-[#E3E1DD]'
                              }`}
                            >
                              <MoveSanText san={pair.black.san} />
                            </span>
                          </button>
                        ) : (
                          <span />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'games' && (
              <div className="divide-y divide-white/[0.06]">
                <div className="px-3.5 py-2.5 bg-[#211F1C] flex items-center justify-between">
                  <span className="text-[12px] font-extrabold text-white">
                    {DATABASE_LABELS[filter.database]} — Matching Games
                  </span>
                  <button
                    type="button"
                    onClick={openFilterModal}
                    className="text-[11px] font-bold text-[#81B64C] hover:underline cursor-pointer"
                  >
                    Filter
                  </button>
                </div>
                {(explorerData?.topGames ?? []).length > 0 ? (
                  (explorerData?.topGames ?? []).map((game) => (
                    <div
                      key={game.id}
                      className="px-3.5 py-2.5 hover:bg-white/[0.04] flex items-center justify-between gap-2 text-[12px]"
                    >
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-[2px] bg-[#EFEFEF] shrink-0" />
                          <span className="font-bold text-white truncate">{game.whiteName}</span>
                          {game.whiteRating && (
                            <span className="text-[11px] text-[#989590] tabular-nums">
                              ({game.whiteRating})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-[2px] bg-[#1A1917] border border-white/25 shrink-0" />
                          <span className="font-bold text-[#D6D3CE] truncate">{game.blackName}</span>
                          {game.blackRating && (
                            <span className="text-[11px] text-[#989590] tabular-nums">
                              ({game.blackRating})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {game.year && (
                          <span className="text-[11px] text-[#8E8B86] tabular-nums">
                            {game.year}
                          </span>
                        )}
                        {renderResultBadge(game.winner)}
                        {game.pgn && (
                          <button
                            type="button"
                            onClick={() => handleLoadTopGame(game)}
                            className="px-2 py-1 rounded-[4px] bg-[#36332F] hover:bg-[#46433E] text-[11px] font-bold text-white cursor-pointer"
                          >
                            Load
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-10 text-center text-[12px] text-[#989590]">
                    No games found in this database for the current position.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Transport & Footer Controls — Exact Chess.com Explorer Footer */}
          <div className="p-3 bg-[#211F1C] border-t border-white/[0.07] space-y-2.5 shrink-0">
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                aria-label="First Move"
                disabled={ply === 0}
                onClick={() => navigateExplorerPly(0)}
                className="h-[40px] rounded-[6px] bg-[#32302D] hover:bg-[#3E3B37] text-[#DEDAD2] hover:text-white flex items-center justify-center disabled:opacity-35 cursor-pointer transition-colors"
              >
                <ChevronFirst className="w-5 h-5" />
              </button>
              <button
                type="button"
                aria-label="Previous Move"
                disabled={ply === 0}
                onClick={() => navigateExplorerPly((p) => Math.max(0, p - 1))}
                className="h-[40px] rounded-[6px] bg-[#32302D] hover:bg-[#3E3B37] text-[#DEDAD2] hover:text-white flex items-center justify-center disabled:opacity-35 cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                aria-label="Next Move"
                disabled={ply >= line.length}
                onClick={() => navigateExplorerPly((p) => Math.min(line.length, p + 1))}
                className="h-[40px] rounded-[6px] bg-[#32302D] hover:bg-[#3E3B37] text-[#DEDAD2] hover:text-white flex items-center justify-center disabled:opacity-35 cursor-pointer transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <button
                type="button"
                aria-label="Last Move"
                disabled={ply >= line.length}
                onClick={() => navigateExplorerPly(line.length)}
                className="h-[40px] rounded-[6px] bg-[#32302D] hover:bg-[#3E3B37] text-[#DEDAD2] hover:text-white flex items-center justify-center disabled:opacity-35 cursor-pointer transition-colors"
              >
                <ChevronLast className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1 pt-0.5">
              <button
                type="button"
                onClick={handleResetToGame}
                className="py-1.5 rounded-[5px] hover:bg-white/[0.06] text-[12px] font-semibold text-[#B5B2AC] hover:text-white flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}
                className="py-1.5 rounded-[5px] hover:bg-white/[0.06] text-[12px] font-semibold text-[#B5B2AC] hover:text-white flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Flip</span>
              </button>
              <button
                type="button"
                disabled={!onOpenReview || line.length === 0 || isLiveOnlineGame}
                onClick={() => {
                  if (!onOpenReview || line.length === 0) return;
                  const pgn = buildPgnFromLine(line);
                  onClose();
                  onOpenReview(pgn, playerColor, '*');
                }}
                className="py-1.5 rounded-[5px] hover:bg-white/[0.06] text-[12px] font-semibold text-[#B5B2AC] hover:text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-35"
                title={isLiveOnlineGame ? 'Available after live match ends' : 'Open line in Game Review'}
              >
                <SearchCheck className="w-3.5 h-3.5" />
                <span>Review</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-1.5 rounded-[5px] hover:bg-white/[0.06] text-[12px] font-bold text-[#81B64C] hover:text-[#98CE62] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Game</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Exact Chess.com "Explore Games" Filter Modal */}
      {filterModalOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/65 flex items-center justify-center p-4"
          onClick={() => setFilterModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Explore Games Filter"
            data-testid="explorer-filter-modal"
            className="w-full max-w-[400px] rounded-[10px] bg-[#262421] border border-white/10 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center justify-between border-b border-white/[0.06]">
              <h3 className="text-[16px] font-extrabold text-white">Explore Games</h3>
              <button
                type="button"
                onClick={() => setFilterModalOpen(false)}
                aria-label="Close Filter"
                className="w-8 h-8 rounded-[5px] hover:bg-white/10 text-[#A8A49E] hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Database Source Select */}
              <div className="space-y-1.5">
                <label
                  htmlFor="explorer-db-select"
                  className="block text-[12px] font-bold text-[#C6C3BE]"
                >
                  Database
                </label>
                <select
                  id="explorer-db-select"
                  value={draftFilter.database}
                  onChange={(e) =>
                    setDraftFilter((prev) => ({
                      ...prev,
                      database: e.target.value as ExplorerDatabase,
                    }))
                  }
                  className="w-full h-11 px-3 rounded-[6px] bg-[#353330] border border-white/10 text-[14px] font-bold text-white focus:outline-none focus:border-[#81B64C] cursor-pointer"
                >
                  <option value="masters">Master Games</option>
                  <option value="community">All OpenChess Games</option>
                  <option value="my-games">My Games</option>
                </select>
              </div>

              {/* Time Controls Select (Community Database) */}
              {draftFilter.database === 'community' && (
                <>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="explorer-speed-select"
                      className="block text-[12px] font-bold text-[#C6C3BE]"
                    >
                      Time Controls
                    </label>
                    <select
                      id="explorer-speed-select"
                      value={activeSpeedPresetId}
                      onChange={(e) => {
                        const preset = SPEED_PRESETS.find((p) => p.id === e.target.value);
                        if (preset) {
                          setDraftFilter((prev) => ({ ...prev, speeds: preset.speeds }));
                        }
                      }}
                      className="w-full h-11 px-3 rounded-[6px] bg-[#353330] border border-white/10 text-[14px] font-bold text-white focus:outline-none focus:border-[#81B64C] cursor-pointer"
                    >
                      {SPEED_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Rating Range */}
                  <div className="space-y-1.5">
                    <div className="text-[12px] font-bold text-[#C6C3BE]">Rating Range</div>
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        aria-label="Minimum rating"
                        value={draftFilter.minRating}
                        onChange={(e) => {
                          const min = Number(e.target.value);
                          setDraftFilter((prev) => ({
                            ...prev,
                            minRating: min,
                            maxRating: Math.max(prev.maxRating, min),
                          }));
                        }}
                        className="h-11 px-3 rounded-[6px] bg-[#353330] border border-white/10 text-[14px] font-bold text-white focus:outline-none focus:border-[#81B64C] cursor-pointer"
                      >
                        {RATING_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Maximum rating"
                        value={draftFilter.maxRating}
                        onChange={(e) => {
                          const max = Number(e.target.value);
                          setDraftFilter((prev) => ({
                            ...prev,
                            maxRating: max,
                            minRating: Math.min(prev.minRating, max),
                          }));
                        }}
                        className="h-11 px-3 rounded-[6px] bg-[#353330] border border-white/10 text-[14px] font-bold text-white focus:outline-none focus:border-[#81B64C] cursor-pointer"
                      >
                        {RATING_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r === 2500 ? 'Max' : r}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* Date Range (Master / Community) */}
              {draftFilter.database !== 'my-games' && (
                <div className="space-y-1.5">
                  <div className="text-[12px] font-bold text-[#C6C3BE]">Date Range</div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Start (e.g. 2010)"
                      aria-label="Start year"
                      value={draftFilter.sinceYear}
                      onChange={(e) =>
                        setDraftFilter((prev) => ({
                          ...prev,
                          sinceYear: e.target.value.replace(/[^0-9-]/g, '').slice(0, 7),
                        }))
                      }
                      className="h-11 px-3 rounded-[6px] bg-[#353330] border border-white/10 text-[13px] font-semibold text-white placeholder:text-[#8E8B86] focus:outline-none focus:border-[#81B64C]"
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="End (e.g. 2026)"
                      aria-label="End year"
                      value={draftFilter.untilYear}
                      onChange={(e) =>
                        setDraftFilter((prev) => ({
                          ...prev,
                          untilYear: e.target.value.replace(/[^0-9-]/g, '').slice(0, 7),
                        }))
                      }
                      className="h-11 px-3 rounded-[6px] bg-[#353330] border border-white/10 text-[13px] font-semibold text-white placeholder:text-[#8E8B86] focus:outline-none focus:border-[#81B64C]"
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={applyDraftFilter}
                className="w-full h-12 rounded-[8px] bg-[#81B64C] hover:bg-[#8EC556] border-b-4 border-[#457524] active:border-b-0 active:translate-y-[2px] text-[15px] font-extrabold text-white transition-all cursor-pointer"
              >
                Filter Results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
