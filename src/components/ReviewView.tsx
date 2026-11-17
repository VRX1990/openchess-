import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type PieceSymbol } from 'chess.js';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  BarChart3,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Flame,
  GraduationCap,
  History,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  UserSearch,
  Zap,
} from 'lucide-react';
import { ChessBoard, type BoardTheme } from './ChessBoard';
import { EvaluationBar } from './EvaluationBar';
import { BottomSheet } from './BottomSheet';
import { CoachWorkspace } from './CoachWorkspace';
import { BotAvatar } from './BotAvatar';
import { PlayerAvatar } from './PlayerAvatar';
import { CoachPickerModal } from './CoachPickerModal';
import { GameReviewSummaryScreen } from './GameReviewSummaryScreen';
import { MOVE_QUALITY_META, MoveBadge } from './MoveBadge';
import {
  evaluateMovesBatch,
  extractGameSkeleton,
  summarizeGameReview,
  type EvaluatedMove,
} from '../chess/engine';
import {
  FEATURED_MASTER_GAMES,
  buildReviewedGameRecord,
  formatGamePlayedAgo,
  isGamePlayedAsBlack,
  loadPlayedGames,
  mergeSyncedGames,
  saveReviewedGame,
} from '../chess/analytics';
import type { LichessUserGame } from '../chess/lichess';
import type { LichessSession } from '../chess/useLichessAuth';
import {
  buildSmartGameInsights,
  buildSmartMoveAnalysis,
  getCoachProfile,
  loadSelectedCoachId,
  saveSelectedCoachId,
  type CoachPersonaId,
} from '../chess/coach';

interface ReviewViewProps {
  boardTheme: BoardTheme;
  initialPgn: string;
  initialPlayerColor: Color;
  initialResult: string;
  navNonce?: number;
  lichessSession?: LichessSession | null;
  lastSyncedAt?: number;
  coachId?: CoachPersonaId;
  onCoachChange?: (id: CoachPersonaId) => void;
  onReviewRecorded?: () => void;
}

const SAMPLE_PGN = `1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Na5 10. Bc2 c5 11. d4 Qc7 12. Nbd2 cxd4 13. cxd4 Nc6 14. Nb3 a5 15. Be3 a4 16. Nbd2 Bd7`;

interface LoadedGameMeta {
  id: string;
  whiteName: string;
  whiteRating?: number;
  whiteAvatarUrl?: string;
  blackName: string;
  blackRating?: number;
  blackAvatarUrl?: string;
  speed: string;
  opening?: string;
  result: string;
  createdAt?: number;
}

function getSpeedIcon(speed: string) {
  const s = speed.toLowerCase();
  if (s.includes('bullet') || s.includes('ultrabullet')) {
    return <Flame className="w-3.5 h-3.5 text-[#E59A28] shrink-0" />;
  }
  if (s.includes('blitz')) {
    return <Zap className="w-3.5 h-3.5 text-[#F5C044] shrink-0" />;
  }
  return <Clock className="w-3.5 h-3.5 text-[#81B64C] shrink-0" />;
}

function parsePgnHeaders(pgnText: string): Partial<LoadedGameMeta> {
  const getTag = (tag: string): string | undefined => {
    const match = pgnText.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`));
    const val = match?.[1]?.trim();
    return val && val !== '?' ? val : undefined;
  };
  const whiteRatingRaw = Number(getTag('WhiteElo'));
  const blackRatingRaw = Number(getTag('BlackElo'));
  return {
    whiteName: getTag('White'),
    blackName: getTag('Black'),
    whiteRating: Number.isFinite(whiteRatingRaw) && whiteRatingRaw > 0 ? whiteRatingRaw : undefined,
    blackRating: Number.isFinite(blackRatingRaw) && blackRatingRaw > 0 ? blackRatingRaw : undefined,
    opening: getTag('Opening'),
    speed: getTag('Speed') || 'rapid',
    result: getTag('Result'),
  };
}

function countMovesInPgn(pgn: string): number {
  const cleaned = pgn
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, ' ')
    .trim();
  if (!cleaned) return 0;
  const plies = cleaned
    .split(/\s+/)
    .filter((tok) => tok && !/^\d+\.+$/.test(tok) && !/^\d+\.\.\.$/.test(tok)).length;
  return Math.max(1, Math.ceil(plies / 2));
}

function gameResultLabel(game: LichessUserGame): string {
  if (game.winner === 'white') return '1-0';
  if (game.winner === 'black') return '0-1';
  if (game.status === 'draw' || game.status === 'stalemate') return '½-½';
  return '*';
}

export function ReviewView({
  boardTheme,
  initialPgn,
  initialPlayerColor,
  initialResult,
  navNonce = 0,
  lichessSession = null,
  lastSyncedAt = 0,
  coachId: externalCoachId,
  onCoachChange,
  onReviewRecorded,
}: ReviewViewProps) {
  const hasExplicitInitialPgn = Boolean(initialPgn.trim());
  const [internalCoachId, setInternalCoachId] = useState<CoachPersonaId>(() =>
    loadSelectedCoachId(),
  );
  const activeCoachId = externalCoachId ?? internalCoachId;
  const activeCoach = getCoachProfile(activeCoachId);
  const [coachModalOpen, setCoachModalOpen] = useState(false);

  // Explicit stage: show Game Selection UI FIRST whenever user opens Game Review without an incoming PGN
  const [viewStage, setViewStage] = useState<'select' | 'board'>(() =>
    hasExplicitInitialPgn ? 'board' : 'select',
  );

  const [pgnInput, setPgnInput] = useState(() =>
    hasExplicitInitialPgn ? initialPgn : '',
  );
  const [playerColor, setPlayerColor] = useState<Color>(initialPlayerColor);
  const [flipped, setFlipped] = useState<boolean>(initialPlayerColor === 'b');
  const [resultLabel, setResultLabel] = useState(initialResult || '*');
  const [loadedMeta, setLoadedMeta] = useState<LoadedGameMeta>(() => {
    const parsed = parsePgnHeaders(hasExplicitInitialPgn ? initialPgn : '');
    return {
      id: hasExplicitInitialPgn ? 'loaded-initial' : 'none',
      whiteName:
        parsed.whiteName ||
        (initialPlayerColor === 'w' ? lichessSession?.account.username || 'You' : 'Opponent'),
      whiteRating: parsed.whiteRating,
      blackName:
        parsed.blackName ||
        (initialPlayerColor === 'b' ? lichessSession?.account.username || 'You' : 'Opponent'),
      blackRating: parsed.blackRating,
      speed: 'rapid',
      opening: parsed.opening,
      result: initialResult || parsed.result || '*',
    };
  });

  // Game Selector state
  const [pickerTab, setPickerTab] = useState<'mine' | 'player' | 'pgn'>('mine');
  const [myGames, setMyGames] = useState<LichessUserGame[]>(() => loadPlayedGames());
  const [myGamesLoading, setMyGamesLoading] = useState(false);
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'win' | 'loss' | 'draw'>('all');
  const [gameSearchFilter, setGameSearchFilter] = useState('');

  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [playerSearchGames, setPlayerSearchGames] = useState<LichessUserGame[]>([]);
  const [playerSearchLoading, setPlayerSearchLoading] = useState(false);
  const [playerSearchError, setPlayerSearchError] = useState<string | null>(null);
  const [customPgnDraft, setCustomPgnDraft] = useState('');
  const [customPgnError, setCustomPgnError] = useState<string | null>(null);

  const [moves, setMoves] = useState<EvaluatedMove[]>([]);
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [selectedPly, setSelectedPly] = useState(1);
  const [pgnError, setPgnError] = useState<string | null>(null);
  const [cloudArrow, setCloudArrow] = useState<{ from: string; to: string } | null>(null);

  // Auto-Review (Play/Pause walkthrough from beginning to end) & Retry Move state
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [forceShowBestArrow, setForceShowBestArrow] = useState(false);
  const [retryState, setRetryState] = useState<{
    active: boolean;
    ply: number;
    solved: boolean;
    feedback: string | null;
  } | null>(null);

  const [mobileSheet, setMobileSheet] = useState<'none' | 'coach'>('none');
  const [summaryOpen, setSummaryOpen] = useState(false);

  const username = lichessSession?.account.username ?? null;
  const userAvatarUrl = lichessSession?.account.profile?.avatarUrl ?? null;

  // Fetch synced user games on mount / account change
  const refreshMyGames = useCallback(async () => {
    setMyGamesLoading(true);
    const local = loadPlayedGames();
    let combined = local;
    try {
      if (lichessSession?.accessToken) {
        const res = await fetch('/api/account/games', {
          headers: { Authorization: `Bearer ${lichessSession.accessToken}` },
        });
        if (res.ok) {
          const data = (await res.json()) as { games?: LichessUserGame[] };
          if (Array.isArray(data?.games)) {
            combined = mergeSyncedGames(combined, data.games);
          }
        }
      }
      if (username) {
        const headers: Record<string, string> = {};
        if (lichessSession?.accessToken) {
          headers.Authorization = `Bearer ${lichessSession.accessToken}`;
        }
        const res = await fetch(`/api/lichess/games/${encodeURIComponent(username)}`, {
          headers,
        });
        if (res.ok) {
          const data = (await res.json()) as { games?: LichessUserGame[] };
          if (Array.isArray(data?.games)) {
            combined = mergeSyncedGames(combined, data.games);
          }
        }
      }
    } catch {
      // keep local games cleanly
    } finally {
      setMyGames(combined);
      setMyGamesLoading(false);
    }
  }, [lichessSession?.accessToken, username]);

  useEffect(() => {
    void refreshMyGames();
  }, [refreshMyGames, lastSyncedAt]);

  // Keep synced when explicit initialPgn arrives from Play / Profile / Friends, or return to selector on navNonce
  useEffect(() => {
    if (initialPgn.trim()) {
      setAutoPlaying(false);
      setRetryState(null);
      setForceShowBestArrow(false);
      setSelectedPly(1);
      setPgnInput(initialPgn);
      setPlayerColor(initialPlayerColor);
      setFlipped(initialPlayerColor === 'b');
      setResultLabel(initialResult || '*');
      const parsed = parsePgnHeaders(initialPgn);
      setLoadedMeta({
        id: 'external-' + initialPgn.length,
        whiteName:
          parsed.whiteName ||
          (initialPlayerColor === 'w' ? username || 'You' : 'Opponent'),
        whiteRating: parsed.whiteRating,
        blackName:
          parsed.blackName ||
          (initialPlayerColor === 'b' ? username || 'You' : 'Opponent'),
        blackRating: parsed.blackRating,
        speed: parsed.speed || 'rapid',
        opening: parsed.opening,
        result: initialResult || parsed.result || '*',
      });
      setViewStage('board');
    } else if (navNonce > 0) {
      setViewStage('select');
    }
  }, [initialPgn, initialPlayerColor, initialResult, navNonce, username]);

  const loadSelectedGame = useCallback(
    (game: LichessUserGame, perspectiveUsername?: string | null) => {
      const asBlack = isGamePlayedAsBlack(game, perspectiveUsername ?? username);
      const color: Color = asBlack ? 'b' : 'w';
      const resText = gameResultLabel(game);
      setAutoPlaying(false);
      setRetryState(null);
      setForceShowBestArrow(false);
      setSelectedPly(1);
      setPgnInput(game.pgn);
      setPlayerColor(color);
      setFlipped(color === 'b');
      setResultLabel(resText);
      setLoadedMeta({
        id: game.id,
        whiteName: game.white.name,
        whiteRating: game.white.rating,
        whiteAvatarUrl: game.white.avatarUrl,
        blackName: game.black.name,
        blackRating: game.black.rating,
        blackAvatarUrl: game.black.avatarUrl,
        speed: game.speed,
        opening: game.opening,
        result: resText,
        createdAt: game.lastMoveAt ?? game.createdAt,
      });
      setPgnError(null);
      setViewStage('board');
    },
    [username],
  );

  useEffect(() => {
    document.body.dataset.state = viewStage === 'select' ? 'review-select' : 'review';
  }, [viewStage]);

  const recordedIdRef = useRef<string | null>(null);
  const runProgressiveAnalysis = useCallback((pgn: string) => {
    if (!pgn.trim()) {
      setMoves([]);
      setAnalyzedCount(0);
      setSelectedPly(0);
      return null;
    }

    let skeleton: EvaluatedMove[];
    try {
      skeleton = extractGameSkeleton(pgn);
    } catch {
      setPgnError('Could not parse PGN. Please check move formatting.');
      setMoves([]);
      setAnalyzedCount(0);
      setSelectedPly(0);
      return null;
    }

    if (skeleton.length === 0) {
      setPgnError('No valid moves found in PGN.');
      setMoves([]);
      setAnalyzedCount(0);
      setSelectedPly(0);
      return null;
    }

    setPgnError(null);
    setMoves(skeleton);
    setAnalyzedCount(0);
    // Start Game Review at Move 1 (ply 1) so the user reviews from the beginning to the end!
    setSelectedPly(1);
    recordedIdRef.current = null;

    let cancelled = false;
    let index = 0;
    const working = [...skeleton];
    let timerId = 0;

    const step = () => {
      if (cancelled || index >= working.length) return;
      index = evaluateMovesBatch(working, index, 10, 12);
      setMoves([...working]);
      setAnalyzedCount(index);
      if (index < working.length) {
        timerId = window.setTimeout(step, 16);
      } else {
        // Refine positions with Stockfish 17 NNUE / Master Cloud Stockfish
        const fensToQuery = working.slice(0, 48).map((m) => m.fenBefore);
        void fetch('/api/engine/batch-eval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fens: fensToQuery }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (cancelled || !Array.isArray(data?.evaluations)) return;
            const sfByFen = new Map<
              string,
              {
                evalCp: number;
                bestMoveSan: string;
                bestMoveFrom: string;
                bestMoveTo: string;
              }
            >();
            for (const item of data.evaluations) {
              if (item?.fen && item.bestMoveSan) {
                sfByFen.set(item.fen, item);
              }
            }
            const refined = working.map((m) => {
              const sf = sfByFen.get(m.fenBefore);
              if (!sf) return m;
              return {
                ...m,
                bestMoveSan: sf.bestMoveSan || m.bestMoveSan,
                bestMoveFrom: sf.bestMoveFrom || m.bestMoveFrom,
                bestMoveTo: sf.bestMoveTo || m.bestMoveTo,
              };
            });
            setMoves(refined);
          })
          .catch(() => {});
      }
    };

    timerId = window.setTimeout(step, 16);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, []);

  // Only analyze & evaluate when user enters the board stage
  useEffect(() => {
    if (viewStage !== 'board' || !pgnInput.trim()) return;
    const cancel = runProgressiveAnalysis(pgnInput);
    return () => {
      cancel?.();
    };
  }, [pgnInput, runProgressiveAnalysis, viewStage]);

  const analysis = useMemo(() => summarizeGameReview(moves), [moves]);

  useEffect(() => {
    if (viewStage === 'board' && moves.length > 0 && analyzedCount === moves.length) {
      const signature = `${pgnInput.slice(0, 64)}-${playerColor}-${moves.length}`;
      if (recordedIdRef.current !== signature) {
        recordedIdRef.current = signature;
        const record = buildReviewedGameRecord(`rev-${Date.now()}`, moves, playerColor);
        saveReviewedGame(record);
        onReviewRecorded?.();
      }
    }
  }, [analyzedCount, moves, onReviewRecorded, pgnInput, playerColor, viewStage]);

  const currentMove =
    selectedPly > 0 && selectedPly <= analysis.moves.length
      ? analysis.moves[selectedPly - 1]
      : null;

  const prevMove =
    selectedPly > 1 && selectedPly - 1 <= analysis.moves.length
      ? analysis.moves[selectedPly - 2]
      : null;

  const smartMove = useMemo(
    () => (currentMove ? buildSmartMoveAnalysis(currentMove, prevMove, activeCoachId) : null),
    [activeCoachId, currentMove, prevMove],
  );

  const smartInsights = useMemo(
    () => buildSmartGameInsights(analysis.moves, playerColor, activeCoachId),
    [activeCoachId, analysis.moves, playerColor],
  );

  useEffect(() => {
    setCloudArrow(null);
    setForceShowBestArrow(false);
    setRetryState(null);
  }, [selectedPly, pgnInput]);

  const moveRibbonRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (viewStage !== 'board' || !moveRibbonRef.current) return;
    const activeBtn = moveRibbonRef.current.querySelector<HTMLElement>(
      `[data-ply="${selectedPly}"]`,
    );
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [selectedPly, viewStage, analysis.moves.length]);

  // Auto-Review timer: walks through the game move-by-move from beginning to end
  useEffect(() => {
    if (!autoPlaying || viewStage !== 'board' || analysis.moves.length === 0) return;
    if (selectedPly >= analysis.moves.length) {
      setAutoPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setSelectedPly((prev) => Math.min(analysis.moves.length, prev + 1));
    }, 1350);
    return () => window.clearTimeout(timer);
  }, [analysis.moves.length, autoPlaying, selectedPly, viewStage]);

  // Keyboard Left/Right navigation in board review mode
  useEffect(() => {
    if (viewStage !== 'board' || summaryOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setAutoPlaying(false);
        setSelectedPly((p) => Math.min(analysis.moves.length, p + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setAutoPlaying(false);
        setSelectedPly((p) => Math.max(0, p - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setAutoPlaying(false);
        setSelectedPly(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setAutoPlaying(false);
        setSelectedPly(analysis.moves.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [analysis.moves.length, summaryOpen, viewStage]);

  const isRetryingCurrent =
    Boolean(retryState?.active && currentMove && retryState.ply === currentMove.ply && !retryState.solved);

  const displayFen = useMemo(() => {
    if (isRetryingCurrent && currentMove) {
      return currentMove.fenBefore;
    }
    if (currentMove) return currentMove.fenAfter;
    if (moves.length > 0 && selectedPly === 0) return moves[0].fenBefore;
    return new Chess().fen();
  }, [currentMove, isRetryingCurrent, moves, selectedPly]);

  const displayEval = currentMove ? currentMove.evalCp : 25;

  const canRetryCurrentMove = Boolean(
    currentMove &&
      currentMove.bestMoveSan &&
      currentMove.bestMoveSan !== currentMove.san &&
      (currentMove.quality === 'Inaccuracy' ||
        currentMove.quality === 'Mistake' ||
        currentMove.quality === 'Blunder' ||
        currentMove.cpLoss >= 30),
  );

  const showBestMoveArrow =
    !isRetryingCurrent &&
    currentMove &&
    currentMove.bestMoveSan !== currentMove.san &&
    (forceShowBestArrow ||
      retryState?.solved ||
      currentMove.quality === 'Inaccuracy' ||
      currentMove.quality === 'Mistake' ||
      currentMove.quality === 'Blunder');

  const bestMoveArrow = useMemo(() => {
    if (showBestMoveArrow && currentMove?.bestMoveFrom && currentMove.bestMoveTo) {
      return { from: currentMove.bestMoveFrom, to: currentMove.bestMoveTo };
    }
    return null;
  }, [currentMove, showBestMoveArrow]);

  const extraArrows = useMemo(() => {
    const out: Array<{ from: string; to: string; color?: 'green' | 'red' | 'yellow' | 'blue' }> = [];
    if (cloudArrow) {
      out.push({
        from: cloudArrow.from,
        to: cloudArrow.to,
        color: 'blue',
      });
    }
    return out;
  }, [cloudArrow]);

  const handleBoardRetryMove = useCallback(
    (from: string, to: string, promotion: PieceSymbol = 'q'): boolean => {
      if (!isRetryingCurrent || !currentMove) return false;
      const probe = new Chess(currentMove.fenBefore);
      try {
        const played = probe.move({ from, to, promotion });
        if (!played) return false;
        if (
          played.san === currentMove.bestMoveSan ||
          (from === currentMove.bestMoveFrom && to === currentMove.bestMoveTo)
        ) {
          setRetryState({
            active: false,
            ply: currentMove.ply,
            solved: true,
            feedback: `Spot on! ${currentMove.bestMoveSan} is the best move here.`,
          });
          setForceShowBestArrow(true);
          return true;
        }
        setRetryState({
          active: true,
          ply: currentMove.ply,
          solved: false,
          feedback: `${played.san} isn't the strongest continuation—look for a move starting from ${currentMove.bestMoveFrom}.`,
        });
        return false;
      } catch {
        return false;
      }
    },
    [currentMove, isRetryingCurrent],
  );

  const keyMoves = useMemo(
    () =>
      analysis.moves.filter(
        (m) =>
          m.quality === 'Brilliant' ||
          m.quality === 'Great' ||
          m.quality === 'Inaccuracy' ||
          m.quality === 'Mistake' ||
          m.quality === 'Blunder',
      ),
    [analysis.moves],
  );

  const handleToggleAutoReview = () => {
    if (analysis.moves.length === 0) return;
    if (autoPlaying) {
      setAutoPlaying(false);
      return;
    }
    if (selectedPly >= analysis.moves.length || selectedPly === 0) {
      setSelectedPly(1);
    }
    setAutoPlaying(true);
  };

  const handleJumpNextKeyMove = () => {
    setAutoPlaying(false);
    if (keyMoves.length === 0) {
      setSelectedPly((p) => Math.min(analysis.moves.length, p + 1));
      return;
    }
    const next = keyMoves.find((m) => m.ply > selectedPly) ?? keyMoves[0];
    setSelectedPly(next.ply);
  };

  const filteredMyGames = useMemo(() => {
    const term = gameSearchFilter.trim().toLowerCase();
    return myGames.filter((g) => {
      const asBlack = isGamePlayedAsBlack(g, username);
      const userWon =
        (asBlack && g.winner === 'black') || (!asBlack && g.winner === 'white');
      const userLost =
        (asBlack && g.winner === 'white') || (!asBlack && g.winner === 'black');
      const isDraw = !g.winner;

      if (outcomeFilter === 'win' && !userWon) return false;
      if (outcomeFilter === 'loss' && !userLost) return false;
      if (outcomeFilter === 'draw' && !isDraw) return false;

      if (!term) return true;
      return (
        g.white.name.toLowerCase().includes(term) ||
        g.black.name.toLowerCase().includes(term) ||
        (g.opening ?? '').toLowerCase().includes(term) ||
        g.speed.toLowerCase().includes(term)
      );
    });
  }, [gameSearchFilter, myGames, outcomeFilter, username]);

  const handleSearchPlayerGames = async () => {
    const clean = playerSearchQuery.trim();
    if (clean.length < 2 || playerSearchLoading) return;
    setPlayerSearchLoading(true);
    setPlayerSearchError(null);
    try {
      const res = await fetch(`/api/lichess/games/${encodeURIComponent(clean)}`);
      const data = (await res.json()) as { games?: LichessUserGame[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not load player games.');
      const list = Array.isArray(data.games) ? mergeSyncedGames(data.games) : [];
      setPlayerSearchGames(list);
      if (list.length === 0) {
        setPlayerSearchError(`No public games found for "${clean}".`);
      }
    } catch (err: unknown) {
      setPlayerSearchError(
        err instanceof Error ? err.message : 'Unable to look up player games.',
      );
      setPlayerSearchGames([]);
    } finally {
      setPlayerSearchLoading(false);
    }
  };

  const handleLoadCustomPgn = () => {
    const trimmed = customPgnDraft.trim();
    if (!trimmed) return;
    try {
      const skeleton = extractGameSkeleton(trimmed);
      if (skeleton.length === 0) {
        setCustomPgnError('No valid chess moves found in that PGN.');
        return;
      }
    } catch {
      setCustomPgnError('Could not parse PGN. Check move notation and try again.');
      return;
    }

    setCustomPgnError(null);
    setAutoPlaying(false);
    setPgnInput(trimmed);
    const parsed = parsePgnHeaders(trimmed);
    const detectedColor: Color =
      username && parsed.blackName?.toLowerCase() === username.toLowerCase() ? 'b' : 'w';
    setPlayerColor(detectedColor);
    setFlipped(detectedColor === 'b');
    setResultLabel(parsed.result || '*');
    setLoadedMeta({
      id: `custom-${Date.now()}`,
      whiteName: parsed.whiteName || 'White',
      whiteRating: parsed.whiteRating,
      blackName: parsed.blackName || 'Black',
      blackRating: parsed.blackRating,
      speed: 'rapid',
      opening: parsed.opening || 'Custom PGN Game',
      result: parsed.result || '*',
    });
    setViewStage('board');
  };

  const handleLoadSampleGame = () => {
    setAutoPlaying(false);
    setPgnInput(SAMPLE_PGN);
    setPlayerColor('w');
    setFlipped(false);
    setResultLabel('*');
    setLoadedMeta({
      id: 'sample-ruy-lopez',
      whiteName: username || 'You',
      blackName: 'Grandmaster Viktor',
      speed: 'rapid',
      opening: 'Ruy Lopez: Closed Morphy Defense',
      result: '*',
    });
    setPgnError(null);
    setViewStage('board');
  };

  const topPlayer = flipped
    ? {
        name: loadedMeta.whiteName,
        rating: loadedMeta.whiteRating,
        avatarUrl: loadedMeta.whiteAvatarUrl,
        color: 'w' as Color,
        accuracy: analysis.whiteAccuracy,
      }
    : {
        name: loadedMeta.blackName,
        rating: loadedMeta.blackRating,
        avatarUrl: loadedMeta.blackAvatarUrl,
        color: 'b' as Color,
        accuracy: analysis.blackAccuracy,
      };

  const bottomPlayer = flipped
    ? {
        name: loadedMeta.blackName,
        rating: loadedMeta.blackRating,
        avatarUrl: loadedMeta.blackAvatarUrl,
        color: 'b' as Color,
        accuracy: analysis.blackAccuracy,
      }
    : {
        name: loadedMeta.whiteName,
        rating: loadedMeta.whiteRating,
        avatarUrl: loadedMeta.whiteAvatarUrl,
        color: 'w' as Color,
        accuracy: analysis.whiteAccuracy,
      };

  const isPlayerCurrentUser = (name: string) =>
    name.toLowerCase() === 'you' ||
    Boolean(username && name.toLowerCase() === username.toLowerCase());

  const renderGamePickerRow = (g: LichessUserGame, perspectiveName?: string | null) => {
    const asBlack = isGamePlayedAsBlack(g, perspectiveName);
    const opponent = asBlack ? g.white : g.black;
    const isWin =
      (asBlack && g.winner === 'black') || (!asBlack && g.winner === 'white');
    const isLoss =
      (asBlack && g.winner === 'white') || (!asBlack && g.winner === 'black');
    const isActive = viewStage === 'board' && loadedMeta.id === g.id;
    const moveCount = countMovesInPgn(g.pgn);
    const playedAgo = formatGamePlayedAgo(g.lastMoveAt ?? g.createdAt);

    return (
      <button
        key={g.id}
        type="button"
        onClick={() => loadSelectedGame(g, perspectiveName)}
        className={`w-full px-3.5 py-3 rounded-xl text-left transition-colors flex items-center justify-between gap-3 cursor-pointer ${
          isActive
            ? 'bg-[#363B2F] ring-1 ring-[#81B64C]'
            : 'bg-[#262421] hover:bg-[#34322E] border border-white/[0.06]'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <PlayerAvatar
              username={opponent.name}
              avatarUrl={opponent.avatarUrl}
              size={36}
              rounded="rounded-lg"
            />
            <span
              className={`absolute -bottom-1 -right-1 w-4 h-4 rounded font-mono text-[10px] font-extrabold flex items-center justify-center ring-2 ring-[#262421] ${
                isWin
                  ? 'bg-[#81B64C] text-white'
                  : isLoss
                    ? 'bg-[#FA412D] text-white'
                    : 'bg-[#6E6B64] text-white'
              }`}
              title={isWin ? 'Win' : isLoss ? 'Loss' : 'Draw'}
            >
              {isWin ? '+' : isLoss ? '-' : '='}
            </span>
          </div>
          {getSpeedIcon(g.speed)}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-bold text-white truncate">
              <span className="truncate">
                {perspectiveName ? `vs ${opponent.name}` : `${g.white.name} vs ${g.black.name}`}
              </span>
              {opponent.rating && perspectiveName && (
                <span className="text-xs font-mono text-[#9E998F] tabular-nums shrink-0">
                  ({opponent.rating})
                </span>
              )}
              <span className="text-[11px] font-semibold text-[#9E998F] shrink-0">
                · {asBlack ? 'Black' : 'White'}
              </span>
            </div>
            <div className="text-[11px] text-[#9E998F] truncate">
              {g.opening ? `${g.opening} · ` : ''}
              {moveCount} moves
              {playedAgo ? ` · ${playedAgo}` : ''}
            </div>
          </div>
        </div>
        <span
          className={`px-3 py-1.5 rounded-lg text-xs font-extrabold shrink-0 ${
            isActive
              ? 'bg-[#81B64C] text-white'
              : 'bg-[#393734] text-[#E6E2DA]'
          }`}
        >
          {isActive ? 'Loaded' : 'Review'}
        </span>
      </button>
    );
  };

  // ============================================================================
  // STAGE 1: FULL-SCREEN GAME SELECTION UI (SHOWN FIRST BEFORE THE CHESSBOARD)
  // ============================================================================
  if (viewStage === 'select') {
    return (
      <div className="max-w-5xl mx-auto px-3 py-3 sm:p-5 pb-20 lg:pb-10 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white font-display tracking-tight">
              Game Review
            </h1>
            <p className="text-xs sm:text-sm text-[#B8B4AC]">
              Choose a game below to step from Move 1 to the end with Smart Coach Analysis and accuracy scoring.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCoachModalOpen(true)}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 text-xs font-bold text-white flex items-center gap-2 cursor-pointer"
              title="Choose Review Coach"
            >
              <BotAvatar botId={activeCoach.id} size={22} />
              <span>Coach: {activeCoach.name}</span>
            </button>
            <button
              type="button"
              onClick={handleLoadSampleGame}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#393734] hover:bg-[#45423E] text-xs font-bold text-[#E6E2DA] cursor-pointer whitespace-nowrap"
            >
              Sample Game
            </button>
          </div>
        </div>

        <section className="rounded-2xl bg-[#21201D] border border-white/[0.08] p-4 sm:p-5 space-y-4">
          {/* Source Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div
              role="tablist"
              aria-label="Game source"
              className="grid grid-cols-3 w-full sm:w-auto sm:inline-flex rounded-xl bg-[#1A1917] p-1 gap-1 border border-white/[0.06]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={pickerTab === 'mine'}
                onClick={() => setPickerTab('mine')}
                className={`min-h-[38px] px-1.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap min-w-0 ${
                  pickerTab === 'mine'
                    ? 'bg-[#393734] text-white'
                    : 'text-[#9E998F] hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5 text-[#81B64C] shrink-0" />
                <span className="truncate">My Games ({myGames.length})</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={pickerTab === 'player'}
                onClick={() => setPickerTab('player')}
                className={`min-h-[38px] px-1.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap min-w-0 ${
                  pickerTab === 'player'
                    ? 'bg-[#393734] text-white'
                    : 'text-[#9E998F] hover:text-white'
                }`}
              >
                <UserSearch className="w-3.5 h-3.5 text-[#81B64C] shrink-0" />
                <span className="truncate">Search Player</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={pickerTab === 'pgn'}
                onClick={() => setPickerTab('pgn')}
                className={`min-h-[38px] px-1.5 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-extrabold cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 transition-colors whitespace-nowrap min-w-0 ${
                  pickerTab === 'pgn'
                    ? 'bg-[#393734] text-white'
                    : 'text-[#9E998F] hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-[#81B64C] shrink-0" />
                <span className="truncate">Paste PGN</span>
              </button>
            </div>

            {pickerTab === 'mine' && (
              <button
                type="button"
                onClick={() => void refreshMyGames()}
                disabled={myGamesLoading}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 text-xs font-bold text-[#C8C4BC] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${myGamesLoading ? 'animate-spin' : ''}`} />
                <span>Sync Games</span>
              </button>
            )}
          </div>

          {pickerTab === 'mine' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-[#9E998F] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={gameSearchFilter}
                    onChange={(e) => setGameSearchFilter(e.target.value)}
                    placeholder="Filter by opponent, opening, or speed..."
                    aria-label="Filter recent games"
                    className="w-full min-h-[40px] pl-9 pr-3 py-2 rounded-xl bg-[#1A1917] border border-white/[0.08] text-xs text-white placeholder:text-[#847F76] focus:outline-none focus:border-[#81B64C]"
                  />
                </div>
                <div className="inline-flex rounded-xl bg-[#1A1917] p-1 gap-0.5 border border-white/[0.06]">
                  {(['all', 'win', 'loss', 'draw'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setOutcomeFilter(f)}
                      className={`min-h-[32px] px-3 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                        outcomeFilter === f
                          ? 'bg-[#393734] text-white'
                          : 'text-[#9E998F] hover:text-white'
                      }`}
                    >
                      {f === 'all' ? 'All' : f === 'win' ? 'Wins' : f === 'loss' ? 'Losses' : 'Draws'}
                    </button>
                  ))}
                </div>
              </div>

              {myGamesLoading && myGames.length === 0 ? (
                <div className="py-10 flex items-center justify-center gap-2 text-sm text-[#9E998F]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#81B64C]" />
                  <span>Syncing your recent games...</span>
                </div>
              ) : filteredMyGames.length === 0 ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-[#1A1917] border border-white/[0.06] text-xs sm:text-sm text-[#9E998F] flex flex-wrap items-center justify-between gap-3">
                    <span>
                      {myGames.length === 0
                        ? username
                          ? `No synced games found yet for ${username}. Select any featured master game below or look up any handle.`
                          : 'Select any featured master game below to launch the interactive Stockfish Game Viewer, or play a match to save your own.'
                        : 'No games match that filter.'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPickerTab('player')}
                        className="px-3.5 py-2 rounded-lg bg-[#393734] hover:bg-[#45423E] text-xs text-white font-bold cursor-pointer"
                      >
                        Search Player
                      </button>
                      <button
                        type="button"
                        onClick={handleLoadSampleGame}
                        className="px-3.5 py-2 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-xs text-white font-extrabold cursor-pointer"
                      >
                        Review Sample
                      </button>
                    </div>
                  </div>

                  {myGames.length === 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-extrabold uppercase tracking-wider text-[#9E998F] px-0.5">
                        Featured Master Games · Instant Replay
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {FEATURED_MASTER_GAMES.map((g) => renderGamePickerRow(g, null))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[54vh] overflow-y-auto pr-1">
                  {filteredMyGames.slice(0, 20).map((g) => renderGamePickerRow(g, username))}
                </div>
              )}
            </div>
          )}

          {pickerTab === 'player' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={playerSearchQuery}
                  onChange={(e) => setPlayerSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSearchPlayerGames();
                  }}
                  placeholder="Enter player username (e.g. DrNykterstein)..."
                  aria-label="Search player username"
                  className="flex-1 min-w-0 min-h-[42px] bg-[#1A1917] border border-white/[0.08] rounded-xl px-3.5 py-2 text-xs sm:text-sm text-white placeholder:text-[#847F76] focus:outline-none focus:border-[#81B64C]"
                />
                <button
                  type="button"
                  onClick={() => void handleSearchPlayerGames()}
                  disabled={playerSearchLoading || playerSearchQuery.trim().length < 2}
                  className="min-h-[42px] px-3.5 sm:px-4 py-2 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[3px] border-[#457524] text-xs font-extrabold text-white disabled:opacity-45 cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  {playerSearchLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  <span>Find Games</span>
                </button>
              </div>
              {playerSearchError && (
                <p className="text-xs text-[#F5B8B0]">{playerSearchError}</p>
              )}
              {playerSearchGames.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
                  {playerSearchGames.map((g) =>
                    renderGamePickerRow(g, playerSearchQuery.trim()),
                  )}
                </div>
              )}
            </div>
          )}

          {pickerTab === 'pgn' && (
            <div className="space-y-3">
              <textarea
                value={customPgnDraft}
                onChange={(e) => {
                  setCustomPgnDraft(e.target.value);
                  if (customPgnError) setCustomPgnError(null);
                }}
                rows={5}
                placeholder="Paste full PGN moves here (e.g. 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ...)"
                aria-label="Paste PGN moves"
                className="w-full bg-[#1A1917] border border-white/[0.08] rounded-xl p-3 text-xs font-mono text-white placeholder:text-[#847F76] focus:outline-none focus:border-[#81B64C]"
              />
              {customPgnError && (
                <p className="text-xs text-[#F5B8B0]">{customPgnError}</p>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleLoadCustomPgn}
                  disabled={!customPgnDraft.trim()}
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[3px] border-[#457524] text-xs font-extrabold text-white cursor-pointer disabled:opacity-45"
                >
                  Load &amp; Review PGN
                </button>
              </div>
            </div>
          )}
        </section>

        <CoachPickerModal
          open={coachModalOpen}
          coachId={activeCoachId}
          showStrengthPicker={false}
          confirmLabel="Use This Coach"
          onSelectCoach={(id) => {
            setInternalCoachId(id);
            saveSelectedCoachId(id);
            onCoachChange?.(id);
          }}
          onClose={() => setCoachModalOpen(false)}
        />
      </div>
    );
  }

  const totalPlies = analysis.moves.length;
  const currentMoveNum = currentMove
    ? currentMove.moveNumber
    : selectedPly === 0
      ? 0
      : Math.ceil(selectedPly / 2);
  const totalMoveCount = Math.max(1, Math.ceil(totalPlies / 2));

  // ============================================================================
  // STAGE 2: ACTIVE GAME REVIEW BOARD + SMART COACH ANALYSIS + COACH WORKSPACE
  // ============================================================================
  return (
    <div className="flex-1 flex flex-col bg-[#302E2B] min-h-[calc(100dvh-6.5rem)] lg:h-dvh lg:overflow-hidden">
      <h1 className="sr-only">Game Review</h1>
      {/* Top Game Review Control Bar */}
      <div className="relative z-30 shrink-0 bg-[#262421] border-b border-white/[0.06] px-3 sm:px-5 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                setAutoPlaying(false);
                setViewStage('select');
              }}
              className="px-3 py-2 rounded-lg bg-[#393734] hover:bg-[#45423E] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#81B64C]" />
              <span>Choose Game</span>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-extrabold text-white truncate">
                {getSpeedIcon(loadedMeta.speed)}
                <span className="truncate">
                  {loadedMeta.whiteName} vs {loadedMeta.blackName}
                </span>
                <span className="font-mono text-xs text-[#C8C4BC] tabular-nums shrink-0">
                  ({loadedMeta.result})
                </span>
              </div>
              <div className="text-[11px] text-[#9E998F] truncate">
                {loadedMeta.opening || 'Game Review'}
                {totalPlies > 0 ? ` · Move ${currentMoveNum} of ${totalMoveCount}` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setAutoPlaying(false);
                setSummaryOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-[#393734] hover:bg-[#45423E] text-xs font-bold text-[#E6E2DA] flex items-center gap-1.5 cursor-pointer"
              title="Open full match report card"
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#81B64C]" />
              <span>Report</span>
            </button>

            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className="px-2.5 py-1.5 rounded-lg bg-[#393734] hover:bg-[#45423E] text-xs font-bold text-[#E6E2DA] flex items-center gap-1.5 cursor-pointer"
              title="Flip Board"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-[#81B64C]" />
              <span className="hidden sm:inline">Flip</span>
            </button>

            <button
              type="button"
              onClick={() => setCoachModalOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-[#393734] hover:bg-[#45423E] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
              title="Switch Coach"
            >
              <BotAvatar botId={activeCoach.id} size={20} />
              <span className="hidden sm:inline">{activeCoach.name}</span>
              <GraduationCap className="w-3.5 h-3.5 text-[#81B64C] sm:hidden" />
            </button>

            <button
              type="button"
              onClick={() => setMobileSheet('coach')}
              className="lg:hidden px-3 py-1.5 rounded-lg bg-[#393734] hover:bg-[#45423E] text-xs font-bold text-[#AEE076] flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Full Panel</span>
            </button>
          </div>
        </div>
      </div>

      {pgnError && (
        <div className="px-4 py-2 bg-[#5C2320] text-xs font-semibold text-[#F7C7C1] text-center">
          {pgnError}
        </div>
      )}

      {/* Main Board + Coach Inspector Split */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-start lg:justify-center p-2 sm:p-3 lg:px-5 lg:py-2 overflow-y-auto min-h-0">
          <div className="w-full max-w-[540px] lg:max-w-[min(560px,calc(100dvh-16rem))] space-y-1.5">
            {/* Top Player Bar with Player Photo */}
            <div className="px-2.5 py-1.5 rounded-lg bg-[#262421] flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <PlayerAvatar
                  username={topPlayer.name}
                  isCurrentUser={isPlayerCurrentUser(topPlayer.name)}
                  avatarUrl={
                    isPlayerCurrentUser(topPlayer.name)
                      ? userAvatarUrl || topPlayer.avatarUrl
                      : topPlayer.avatarUrl
                  }
                  size={26}
                  rounded="rounded-md"
                />
                <span
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-extrabold shrink-0 ${
                    topPlayer.color === 'w'
                      ? 'bg-[#EAE6DF] text-[#262421]'
                      : 'bg-[#191815] text-white border border-white/15'
                  }`}
                >
                  {topPlayer.color === 'w' ? 'W' : 'B'}
                </span>
                <span className="font-bold text-white truncate">{topPlayer.name}</span>
                {topPlayer.rating && (
                  <span className="font-mono text-[#9E998F] tabular-nums shrink-0">
                    ({topPlayer.rating})
                  </span>
                )}
              </div>
              <span className="font-mono font-extrabold text-[#C8C4BC] tabular-nums shrink-0">
                {topPlayer.accuracy}% Acc
              </span>
            </div>

            {/* Beginning-to-End Horizontal Move Ribbon (Move 1 -> End) */}
            {analysis.moves.length > 0 && (
              <div
                ref={moveRibbonRef}
                data-testid="review-move-ribbon"
                className="flex items-center gap-1 overflow-x-auto py-1 px-1.5 rounded-lg bg-[#21201D] border border-white/[0.07] no-scrollbar"
              >
                <button
                  type="button"
                  data-ply={0}
                  onClick={() => {
                    setAutoPlaying(false);
                    setSelectedPly(0);
                  }}
                  className={`px-2 py-1 rounded text-[11px] font-mono font-bold shrink-0 cursor-pointer transition-colors ${
                    selectedPly === 0
                      ? 'bg-[#81B64C] text-white'
                      : 'bg-[#2B2925] text-[#9E998F] hover:text-white'
                  }`}
                >
                  Start
                </button>
                {analysis.moves.map((m) => {
                  const active = selectedPly === m.ply;
                  return (
                    <button
                      key={m.ply}
                      type="button"
                      data-ply={m.ply}
                      onClick={() => {
                        setAutoPlaying(false);
                        setSelectedPly(m.ply);
                      }}
                      className={`px-2 py-1 rounded text-[11px] font-mono font-bold shrink-0 flex items-center gap-1 cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#81B64C] text-white ring-1 ring-white/30'
                          : 'bg-[#262421] text-[#D8D4CC] hover:bg-[#33302C]'
                      }`}
                    >
                      <span className={active ? 'text-white/85' : 'text-[#8E8980]'}>
                        {m.moveNumber}
                        {m.color === 'w' ? '.' : '...'}
                      </span>
                      <span>{m.san}</span>
                      <MoveBadge quality={m.quality} size="sm" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Eval Bar + Chess Board */}
            <div className="flex items-stretch justify-center gap-2 sm:gap-3">
              <EvaluationBar evalCp={displayEval} orientation={flipped ? 'b' : 'w'} />
              <div className="flex-1 aspect-square min-w-0">
                <ChessBoard
                  fen={displayFen}
                  orientation={flipped ? 'b' : 'w'}
                  interactive={isRetryingCurrent}
                  theme={boardTheme}
                  lastMove={
                    !isRetryingCurrent && currentMove
                      ? { from: currentMove.from, to: currentMove.to }
                      : null
                  }
                  bestMoveArrow={bestMoveArrow}
                  extraArrows={extraArrows}
                  moveBadge={
                    !isRetryingCurrent && currentMove
                      ? { square: currentMove.to, quality: currentMove.quality }
                      : null
                  }
                  onMove={handleBoardRetryMove}
                />
              </div>
            </div>

            {/* Bottom Player Bar with Player Photo */}
            <div className="px-2.5 py-1.5 rounded-lg bg-[#262421] flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <PlayerAvatar
                  username={bottomPlayer.name}
                  isCurrentUser={isPlayerCurrentUser(bottomPlayer.name)}
                  avatarUrl={
                    isPlayerCurrentUser(bottomPlayer.name)
                      ? userAvatarUrl || bottomPlayer.avatarUrl
                      : bottomPlayer.avatarUrl
                  }
                  size={26}
                  rounded="rounded-md"
                />
                <span
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-extrabold shrink-0 ${
                    bottomPlayer.color === 'w'
                      ? 'bg-[#EAE6DF] text-[#262421]'
                      : 'bg-[#191815] text-white border border-white/15'
                  }`}
                >
                  {bottomPlayer.color === 'w' ? 'W' : 'B'}
                </span>
                <span className="font-bold text-white truncate">{bottomPlayer.name}</span>
                {bottomPlayer.rating && (
                  <span className="font-mono text-[#9E998F] tabular-nums shrink-0">
                    ({bottomPlayer.rating})
                  </span>
                )}
              </div>
              <span className="font-mono font-extrabold text-[#81B64C] tabular-nums shrink-0">
                {bottomPlayer.accuracy}% Acc
              </span>
            </div>

            {/* On-Board Smart Coach Analysis Card (Always Visible on Mobile & Desktop) */}
            <div
              data-testid="smart-coach-review-card"
              className="rounded-xl bg-[#21201D] border border-white/10 p-2.5 space-y-2 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="shrink-0 mt-0.5">
                    <BotAvatar botId={activeCoach.id} size={32} />
                  </div>
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {currentMove && <MoveBadge quality={currentMove.quality} size="sm" />}
                      <span
                        className={`text-xs sm:text-sm font-extrabold ${
                          currentMove
                            ? MOVE_QUALITY_META[currentMove.quality].textColor
                            : 'text-[#AEE076]'
                        }`}
                      >
                        {smartMove ? smartMove.headline : smartInsights.summaryHeadline}
                      </span>
                      {smartMove && (
                        <span className="px-1.5 py-0.5 rounded bg-[#1A1917] font-mono text-[10px] font-bold text-[#C8C4BC] tabular-nums">
                          Win {smartMove.winChanceMover}%
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#E6E2DA] leading-snug">
                      {retryState?.feedback
                        ? retryState.feedback
                        : smartMove
                          ? smartMove.why
                          : smartInsights.coachVerdict}
                    </p>
                    {smartMove?.betterPlan && !retryState?.active && (
                      <p className="text-[11px] font-semibold text-[#AEE076] leading-snug">
                        {smartMove.betterPlan}
                      </p>
                    )}
                  </div>
                </div>

                {/* Retry Move / Show Best Action Buttons */}
                {canRetryCurrentMove && currentMove && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setAutoPlaying(false);
                        setRetryState((prev) =>
                          prev?.active
                            ? null
                            : {
                                active: true,
                                ply: currentMove.ply,
                                solved: false,
                                feedback: `Play a better move for ${
                                  currentMove.color === 'w' ? 'White' : 'Black'
                                } on the board instead of ${currentMove.san}.`,
                              },
                        );
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer ${
                        isRetryingCurrent
                          ? 'bg-[#E59A28] text-[#1A1917]'
                          : 'bg-[#393734] hover:bg-[#45423E] text-white'
                      }`}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>{isRetryingCurrent ? 'Cancel Retry' : 'Retry'}</span>
                    </button>
                    {isRetryingCurrent && (
                      <button
                        type="button"
                        onClick={() => {
                          setRetryState({
                            active: false,
                            ply: currentMove.ply,
                            solved: true,
                            feedback: `Best move was ${currentMove.bestMoveSan} (${currentMove.bestMoveFrom}→${currentMove.bestMoveTo}).`,
                          });
                          setForceShowBestArrow(true);
                        }}
                        className="px-2 py-1.5 rounded-lg bg-[#312E2A] hover:bg-[#3C3934] text-[11px] font-bold text-[#AEE076] flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Answer</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Beginning-to-End Progress Scrubber + Full Transport Bar */}
              <div className="pt-1 border-t border-white/[0.07] space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#9E998F] tabular-nums">
                  <span>
                    {selectedPly === 0
                      ? 'Start Position'
                      : `Ply ${selectedPly} of ${totalPlies} (Move ${currentMoveNum}/${totalMoveCount})`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {smartMove?.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 rounded bg-[#2B2925] font-sans text-[10px] font-semibold text-[#C8C4BC]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Clickable Beginning-to-End Progress Bar */}
                {totalPlies > 0 && (
                  <input
                    type="range"
                    min={0}
                    max={totalPlies}
                    value={selectedPly}
                    aria-label="Game review move timeline"
                    onChange={(e) => {
                      setAutoPlaying(false);
                      setSelectedPly(Number(e.target.value));
                    }}
                    className="w-full h-1.5 accent-[#81B64C] bg-[#1A1917] rounded-lg cursor-pointer"
                  />
                )}

                <div className="grid grid-cols-6 gap-1.5">
                  <button
                    type="button"
                    aria-label="Move 1 (Start of game)"
                    disabled={totalPlies === 0}
                    onClick={() => {
                      setAutoPlaying(false);
                      setSelectedPly(totalPlies > 0 ? 1 : 0);
                    }}
                    className="min-h-[36px] rounded-lg bg-[#2B2925] hover:bg-[#383530] text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                    title="Jump to Move 1"
                  >
                    <ChevronFirst className="w-4 h-4" />
                    <span className="hidden sm:inline text-[11px]">Move 1</span>
                  </button>

                  <button
                    type="button"
                    aria-label="Previous move"
                    disabled={totalPlies === 0 || selectedPly <= 0}
                    onClick={() => {
                      setAutoPlaying(false);
                      setSelectedPly((p) => Math.max(0, p - 1));
                    }}
                    className="min-h-[36px] rounded-lg bg-[#2B2925] hover:bg-[#383530] text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="hidden sm:inline text-[11px]">Prev</span>
                  </button>

                  <button
                    type="button"
                    aria-label="Next move"
                    disabled={totalPlies === 0 || selectedPly >= totalPlies}
                    onClick={() => {
                      setAutoPlaying(false);
                      setSelectedPly((p) => Math.min(totalPlies, p + 1));
                    }}
                    className="min-h-[36px] col-span-2 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] border-b-2 border-[#457524] text-white text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <span>Next Move</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    aria-label={autoPlaying ? 'Pause Auto-Review' : 'Auto-Review from beginning to end'}
                    disabled={totalPlies === 0}
                    onClick={handleToggleAutoReview}
                    className={`min-h-[36px] rounded-lg text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 ${
                      autoPlaying
                        ? 'bg-[#E59A28] text-[#1A1917]'
                        : 'bg-[#2B2925] hover:bg-[#383530] text-[#AEE076]'
                    }`}
                    title={autoPlaying ? 'Pause Auto-Review' : 'Auto-Play Review from Move 1 to End'}
                  >
                    {autoPlaying ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline text-[11px]">
                      {autoPlaying ? 'Pause' : 'Auto'}
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-label="Jump to next key move or end"
                    disabled={totalPlies === 0}
                    onClick={
                      keyMoves.length > 0
                        ? handleJumpNextKeyMove
                        : () => {
                            setAutoPlaying(false);
                            setSelectedPly(totalPlies);
                          }
                    }
                    className="min-h-[36px] rounded-lg bg-[#2B2925] hover:bg-[#383530] text-[#F7C045] text-xs font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
                    title="Jump to next key move"
                  >
                    {keyMoves.length > 0 ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline text-[11px]">Key</span>
                      </>
                    ) : (
                      <ChevronLast className="w-4 h-4 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Right Dock */}
        <aside className="hidden lg:flex lg:w-[420px] xl:w-[450px] lg:h-full shrink-0 border-l border-white/[0.06] bg-[#21201D] flex-col min-h-0 overflow-hidden">
          <CoachWorkspace
            fen={displayFen}
            pgn={pgnInput}
            mode="review"
            playerColor={playerColor}
            resultLabel={resultLabel}
            evalCp={displayEval}
            lastMoveSan={currentMove?.san ?? ''}
            suggestedMoveSan={currentMove?.bestMoveSan ?? ''}
            externalMoves={moves}
            externalAnalyzedCount={analyzedCount}
            selectedPly={selectedPly}
            onSelectPly={(ply) => {
              setAutoPlaying(false);
              setSelectedPly(ply);
            }}
            onHighlightArrow={setCloudArrow}
            defaultTab="report"
            coachId={activeCoachId}
          />
        </aside>
      </div>

      {/* Mobile Bottom Sheet */}
      <BottomSheet
        open={mobileSheet === 'coach'}
        title={`${activeCoach.name} · Game Review`}
        onClose={() => setMobileSheet('none')}
      >
        <div className="h-[68vh] flex flex-col">
          <CoachWorkspace
            fen={displayFen}
            pgn={pgnInput}
            mode="review"
            playerColor={playerColor}
            resultLabel={resultLabel}
            evalCp={displayEval}
            lastMoveSan={currentMove?.san ?? ''}
            suggestedMoveSan={currentMove?.bestMoveSan ?? ''}
            externalMoves={moves}
            externalAnalyzedCount={analyzedCount}
            selectedPly={selectedPly}
            onSelectPly={(ply) => {
              setAutoPlaying(false);
              setSelectedPly(ply);
            }}
            onHighlightArrow={setCloudArrow}
            defaultTab="report"
            onMoveStepCloseSheet={() => setMobileSheet('none')}
            coachId={activeCoachId}
          />
        </div>
      </BottomSheet>

      <CoachPickerModal
        open={coachModalOpen}
        coachId={activeCoachId}
        showStrengthPicker={false}
        confirmLabel="Use This Coach"
        onSelectCoach={(id) => {
          setInternalCoachId(id);
          saveSelectedCoachId(id);
          onCoachChange?.(id);
        }}
        onClose={() => setCoachModalOpen(false)}
      />

      {summaryOpen && (
        <GameReviewSummaryScreen
          pgn={pgnInput}
          resultLabel={loadedMeta.result}
          resultTitle={loadedMeta.opening || 'Game Review'}
          whiteName={loadedMeta.whiteName}
          blackName={loadedMeta.blackName}
          whiteRating={loadedMeta.whiteRating}
          blackRating={loadedMeta.blackRating}
          currentUsername={username}
          whiteAvatarUrl={
            isPlayerCurrentUser(loadedMeta.whiteName)
              ? userAvatarUrl || loadedMeta.whiteAvatarUrl
              : loadedMeta.whiteAvatarUrl
          }
          blackAvatarUrl={
            isPlayerCurrentUser(loadedMeta.blackName)
              ? userAvatarUrl || loadedMeta.blackAvatarUrl
              : loadedMeta.blackAvatarUrl
          }
          onStartReview={() => {
            setSummaryOpen(false);
            setSelectedPly(totalPlies > 0 ? 1 : 0);
          }}
          onNewGame={() => {
            setSummaryOpen(false);
            setViewStage('select');
          }}
          onClose={() => setSummaryOpen(false)}
        />
      )}
    </div>
  );
}
