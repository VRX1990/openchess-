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
  Cpu,
  Eye,
  FileText,
  Flame,
  GitBranch,
  GraduationCap,
  History,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Undo2,
  UserSearch,
  Zap,
} from 'lucide-react';
import { ChessBoard, type BoardTheme } from './ChessBoard';
import { EvaluationBar } from './EvaluationBar';
import { EvalAdvantageChart } from './EvalAdvantageChart';
import { BottomSheet } from './BottomSheet';
import { CoachWorkspace } from './CoachWorkspace';
import { BotAvatar } from './BotAvatar';
import { PlayerAvatar } from './PlayerAvatar';
import { CoachPickerModal } from './CoachPickerModal';
import { GameReviewSummaryScreen } from './GameReviewSummaryScreen';
import { MOVE_QUALITY_META, MoveBadge } from './MoveBadge';
import { NavReviewIcon } from './ChessIcons';
import {
  buildPostGameReviewSummary,
  extractGameSkeleton,
  summarizeGameReview,
  type EvaluatedMove,
} from '../chess/engine';
import {
  REVIEW_SPEED_PRESETS,
  formatEvalDisplay,
  parsePgnMetadata,
  type ReviewSpeedPreset,
} from '../chess/reviewAnalysis';
import {
  scanGameWithStockfish19,
  type ScanProgressTelemetry,
} from '../chess/stockfishWorker';
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
import { playMoveSound } from '../chess/sound';
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

function parsePgnHeaders(pgnText: string, fallbackSans?: string[]): Partial<LoadedGameMeta> {
  const parsed = parsePgnMetadata(pgnText, fallbackSans);
  return {
    whiteName: parsed.whiteName,
    blackName: parsed.blackName,
    whiteRating: parsed.whiteRating,
    blackRating: parsed.blackRating,
    opening: parsed.opening,
    speed: parsed.speed,
    result: parsed.result,
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
  if (game.status === 'draw' || game.status === 'stalemate') return '1/2-1/2';
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
      speed: parsed.speed || 'rapid',
      opening: parsed.opening,
      result: (initialResult && initialResult !== '*' ? initialResult : undefined) || parsed.result || '*',
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
  const [scanSpeed, setScanSpeed] = useState<ReviewSpeedPreset>('standard');
  const [scanTelemetry, setScanTelemetry] = useState<ScanProgressTelemetry | null>(null);
  const [selectedPly, setSelectedPly] = useState(1);
  const [pgnError, setPgnError] = useState<string | null>(null);
  const [cloudArrow, setCloudArrow] = useState<{ from: string; to: string } | null>(null);

  // What-If Variation Exploration state (drag any piece in review to test lines with live Stockfish 19)
  const [explorationSteps, setExplorationSteps] = useState<
    Array<{ fen: string; san: string; from: string; to: string }>
  >([]);
  const [liveExploreEval, setLiveExploreEval] = useState<{
    evalCp: number;
    mateIn: number | null;
    bestMoveFrom: string;
    bestMoveTo: string;
    bestMoveSan: string;
    depth: number;
  } | null>(null);

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
  const runProgressiveAnalysis = useCallback((pgn: string, preset: ReviewSpeedPreset) => {
    if (!pgn.trim()) {
      setMoves([]);
      setAnalyzedCount(0);
      setScanTelemetry(null);
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
      setScanTelemetry(null);
      setSelectedPly(0);
      return null;
    }

    if (skeleton.length === 0) {
      setPgnError('No valid moves found in PGN.');
      setMoves([]);
      setAnalyzedCount(0);
      setScanTelemetry(null);
      setSelectedPly(0);
      return null;
    }

    setPgnError(null);
    setMoves(skeleton);
    setAnalyzedCount(0);
    setScanTelemetry({
      analyzedPlies: 0,
      totalPlies: skeleton.length,
      analyzedPositions: 0,
      totalPositions: skeleton.length + 1,
      currentMoveSan: `${skeleton[0].moveNumber}. ${skeleton[0].san}`,
      currentPly: 1,
      activeDepth: REVIEW_SPEED_PRESETS[preset].depth,
      nps: 0,
      cacheHits: 0,
      cloudHits: 0,
      engineLabel: 'Analysis Engine',
      preset,
      isComplete: false,
    });
    // Start Game Review at Move 1 (ply 1) so the user reviews from the beginning to the end!
    setSelectedPly(1);
    recordedIdRef.current = null;

    const controller = new AbortController();
    void scanGameWithStockfish19({
      skeleton,
      preset,
      signal: controller.signal,
      onMovesUpdate: (updated, telemetry) => {
        if (controller.signal.aborted) return;
        setMoves(updated);
        setAnalyzedCount(telemetry.analyzedPlies);
        setScanTelemetry(telemetry);
      },
    });

    return () => {
      controller.abort();
    };
  }, []);

  // Only analyze & evaluate when user enters the board stage
  useEffect(() => {
    if (viewStage !== 'board' || !pgnInput.trim()) return;
    const cancel = runProgressiveAnalysis(pgnInput, scanSpeed);
    return () => {
      cancel?.();
    };
  }, [pgnInput, runProgressiveAnalysis, scanSpeed, viewStage]);

  const analysis = useMemo(() => summarizeGameReview(moves), [moves]);
  const reviewSummary = useMemo(
    () =>
      buildPostGameReviewSummary({
        evaluated: analysis.moves,
        resultLabel: loadedMeta.result,
        whiteBaseRating: loadedMeta.whiteRating,
        blackBaseRating: loadedMeta.blackRating,
      }),
    [analysis.moves, loadedMeta.blackRating, loadedMeta.result, loadedMeta.whiteRating],
  );

  useEffect(() => {
    if (viewStage === 'board' && moves.length > 0 && analyzedCount === moves.length) {
      const signature = `${pgnInput.slice(0, 64)}-${playerColor}-${moves.length}-${scanSpeed}`;
      if (recordedIdRef.current !== signature) {
        recordedIdRef.current = signature;
        const record = buildReviewedGameRecord(`rev-${Date.now()}`, moves, playerColor);
        saveReviewedGame(record);
        onReviewRecorded?.();
      }
    }
  }, [analyzedCount, moves, onReviewRecorded, pgnInput, playerColor, scanSpeed, viewStage]);

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
    setExplorationSteps([]);
    setLiveExploreEval(null);
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

  const prevSoundPlyRef = useRef<number>(selectedPly);
  useEffect(() => {
    const prev = prevSoundPlyRef.current;
    prevSoundPlyRef.current = selectedPly;
    if (viewStage !== 'board' || summaryOpen || prev === selectedPly) return;
    if (selectedPly > prev) {
      const moved = moves[selectedPly - 1];
      if (moved) {
        const san = moved.san ?? '';
        playMoveSound({
          capture: san.includes('x'),
          check: san.includes('+') || san.includes('#'),
          castle: san.startsWith('O-O'),
          promotion: san.includes('='),
          toSquare: moved.to,
        });
      }
    } else if (selectedPly < prev) {
      const undone = moves[prev - 1];
      playMoveSound({ toSquare: undone?.from });
    }
  }, [moves, selectedPly, summaryOpen, viewStage]);

  const isRetryingCurrent =
    Boolean(retryState?.active && currentMove && retryState.ply === currentMove.ply && !retryState.solved);
  const isExploring = !isRetryingCurrent && explorationSteps.length > 0;

  const basePositionFen = useMemo(() => {
    if (isRetryingCurrent && currentMove) {
      return currentMove.fenBefore;
    }
    if (currentMove) return currentMove.fenAfter;
    if (moves.length > 0 && selectedPly === 0) return moves[0].fenBefore;
    return new Chess().fen();
  }, [currentMove, isRetryingCurrent, moves, selectedPly]);

  const displayFen = isExploring
    ? explorationSteps[explorationSteps.length - 1].fen
    : basePositionFen;

  const displayEval = isExploring && liveExploreEval
    ? liveExploreEval.evalCp
    : currentMove
      ? currentMove.evalCp
      : 20;

  const displayMateIn = isExploring && liveExploreEval
    ? liveExploreEval.mateIn
    : currentMove?.mateIn ?? null;

  const canRetryCurrentMove = Boolean(
    !isExploring &&
      currentMove &&
      currentMove.bestMoveSan &&
      currentMove.bestMoveSan !== currentMove.san &&
      (currentMove.quality === 'Inaccuracy' ||
        currentMove.quality === 'Mistake' ||
        currentMove.quality === 'Miss' ||
        currentMove.quality === 'Blunder' ||
        currentMove.cpLoss >= 30),
  );

  const showBestMoveArrow =
    !isRetryingCurrent &&
    !isExploring &&
    currentMove &&
    currentMove.bestMoveSan !== currentMove.san &&
    (forceShowBestArrow ||
      retryState?.solved ||
      currentMove.quality === 'Inaccuracy' ||
      currentMove.quality === 'Mistake' ||
      currentMove.quality === 'Miss' ||
      currentMove.quality === 'Blunder');

  const bestMoveArrow = useMemo(() => {
    if (isExploring && liveExploreEval?.bestMoveFrom && liveExploreEval?.bestMoveTo) {
      return { from: liveExploreEval.bestMoveFrom, to: liveExploreEval.bestMoveTo };
    }
    if (showBestMoveArrow && currentMove?.bestMoveFrom && currentMove.bestMoveTo) {
      return { from: currentMove.bestMoveFrom, to: currentMove.bestMoveTo };
    }
    return null;
  }, [currentMove, isExploring, liveExploreEval, showBestMoveArrow]);

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

  const handlePlayVariationLine = useCallback((lineSan: string[], baseFen: string) => {
    if (!lineSan.length) return;
    setAutoPlaying(false);
    setRetryState(null);
    const probe = new Chess(baseFen);
    const steps: Array<{ fen: string; san: string; from: string; to: string }> = [];
    for (const san of lineSan.slice(0, 4)) {
      try {
        const played = probe.move(san);
        if (!played) break;
        steps.push({
          fen: probe.fen(),
          san: played.san,
          from: played.from,
          to: played.to,
        });
      } catch {
        break;
      }
    }
    if (steps.length > 0) {
      setExplorationSteps(steps);
    }
  }, []);

  const handleBoardMove = useCallback(
    (from: string, to: string, promotion: PieceSymbol = 'q'): boolean => {
      // 1. Retry mistake puzzle mode
      if (isRetryingCurrent && currentMove) {
        const probe = new Chess(currentMove.fenBefore);
        try {
          const played = probe.move({ from, to, promotion });
          if (!played) return false;
          if (
            played.san === currentMove.bestMoveSan ||
            (from === currentMove.bestMoveFrom && to === currentMove.bestMoveTo)
          ) {
            playMoveSound({
              capture: Boolean(played.captured) || played.flags.includes('e'),
              check: probe.inCheck(),
              castle: played.flags.includes('k') || played.flags.includes('q'),
              promotion: Boolean(played.promotion),
              toSquare: played.to,
            });
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
      }

      // 2. What-If Free Exploration mode directly from any reviewed position
      const probe = new Chess(displayFen);
      try {
        const played = probe.move({ from, to, promotion });
        if (!played) return false;
        playMoveSound({
          capture: Boolean(played.captured) || played.flags.includes('e'),
          check: probe.inCheck(),
          castle: played.flags.includes('k') || played.flags.includes('q'),
          promotion: Boolean(played.promotion),
          toSquare: played.to,
        });
        setAutoPlaying(false);
        setCloudArrow(null);
        setExplorationSteps((prev) => [
          ...prev,
          {
            fen: probe.fen(),
            san: played.san,
            from: played.from,
            to: played.to,
          },
        ]);
        return true;
      } catch {
        return false;
      }
    },
    [currentMove, displayFen, isRetryingCurrent],
  );

  const keyMoves = useMemo(
    () =>
      analysis.moves.filter(
        (m) =>
          m.quality === 'Brilliant' ||
          m.quality === 'Great' ||
          m.quality === 'Inaccuracy' ||
          m.quality === 'Mistake' ||
          m.quality === 'Miss' ||
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
    let skeleton: EvaluatedMove[] = [];
    try {
      skeleton = extractGameSkeleton(trimmed);
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
    const parsed = parsePgnHeaders(
      trimmed,
      skeleton.map((m) => m.san),
    );
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
      speed: parsed.speed || 'rapid',
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
        gameRating: reviewSummary.whiteGameRating,
      }
    : {
        name: loadedMeta.blackName,
        rating: loadedMeta.blackRating,
        avatarUrl: loadedMeta.blackAvatarUrl,
        color: 'b' as Color,
        accuracy: analysis.blackAccuracy,
        gameRating: reviewSummary.blackGameRating,
      };

  const bottomPlayer = flipped
    ? {
        name: loadedMeta.blackName,
        rating: loadedMeta.blackRating,
        avatarUrl: loadedMeta.blackAvatarUrl,
        color: 'b' as Color,
        accuracy: analysis.blackAccuracy,
        gameRating: reviewSummary.blackGameRating,
      }
    : {
        name: loadedMeta.whiteName,
        rating: loadedMeta.whiteRating,
        avatarUrl: loadedMeta.whiteAvatarUrl,
        color: 'w' as Color,
        accuracy: analysis.whiteAccuracy,
        gameRating: reviewSummary.whiteGameRating,
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
  // STAGE 1: CHESS.COM 2-COLUMN ANALYSIS BOARD + GAME REVIEW PICKER PANEL
  // ============================================================================
  if (viewStage === 'select') {
    return (
      <div className="max-w-[1160px] mx-auto px-2.5 sm:px-4 py-3 pb-20 lg:pb-4">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_390px] xl:grid-cols-[minmax(0,1fr)_420px] gap-4 lg:gap-5 items-start">
          {/* Left Column (Desktop): Analysis Board + Eval Bar */}
          <div className="hidden lg:flex flex-col gap-2 w-full max-w-[min(calc(100dvh-112px),760px)] mx-auto">
            <div className="flex items-center gap-2.5 pl-[34px]">
              <div className="w-[36px] h-[36px] rounded-[3px] bg-[#454340] flex items-center justify-center shrink-0">
                <svg viewBox="0 0 36 36" className="w-6 h-6" aria-hidden="true">
                  <circle cx="18" cy="13" r="6" fill="#2A2825" />
                  <path d="M7 33c1.5-6.5 6-10 11-10s9.5 3.5 11 10H7z" fill="#2A2825" />
                </svg>
              </div>
              <span className="text-[14px] font-bold text-white">Black</span>
            </div>

            <div className="flex items-stretch gap-2">
              <EvaluationBar evalCp={30} orientation="w" />
              <div className="flex-1 aspect-square pointer-events-none select-none">
                <ChessBoard
                  fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                  theme={boardTheme}
                  interactive={false}
                  onMove={() => false}
                />
              </div>
            </div>

            <div className="flex items-center gap-2.5 pl-[34px]">
              <PlayerAvatar
                username={username || 'White'}
                avatarUrl={userAvatarUrl}
                isCurrentUser={Boolean(username)}
                size={36}
                rounded="rounded-[3px]"
              />
              <span className="text-[14px] font-bold text-white">
                {username || 'White'}
              </span>
            </div>
          </div>

          {/* Right Column: Flush #262421 Analysis / Game Review Panel */}
          <aside className="w-full rounded-[5px] bg-[#262421] overflow-hidden flex flex-col lg:min-h-[min(calc(100dvh-2rem),836px)] shadow-[0_6px_22px_rgba(0,0,0,0.28)]">
            {/* Flush Dark Header */}
            <div className="h-[52px] bg-[#1F1E1B] px-4 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <NavReviewIcon className="w-6 h-6 shrink-0" />
                <h1 className="text-[17px] font-extrabold text-white font-display tracking-tight">
                  Game Review
                </h1>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCoachModalOpen(true)}
                  className="h-[32px] px-2.5 rounded-[5px] bg-[#2D2B28] hover:bg-[#3A3834] text-[11px] font-bold text-white flex items-center gap-1.5 cursor-pointer"
                  title="Choose Review Coach"
                >
                  <BotAvatar botId={activeCoach.id} size={18} />
                  <span className="truncate max-w-[90px]">{activeCoach.name}</span>
                </button>
                <button
                  type="button"
                  onClick={handleLoadSampleGame}
                  className="h-[32px] px-2.5 rounded-[5px] cc-btn-secondary text-[11px] font-extrabold text-white cursor-pointer whitespace-nowrap"
                >
                  Sample
                </button>
              </div>
            </div>

            {/* Flush 3-Tab Source Switcher */}
            <div
              role="tablist"
              aria-label="Game source"
              className="grid grid-cols-3 bg-[#1F1E1B] border-t border-white/[0.05] shrink-0"
            >
              <button
                type="button"
                role="tab"
                aria-selected={pickerTab === 'mine'}
                onClick={() => setPickerTab('mine')}
                className={`py-2.5 px-1.5 text-[12px] font-bold cursor-pointer flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap min-w-0 ${
                  pickerTab === 'mine'
                    ? 'bg-[#262421] text-white'
                    : 'text-[#9B9A97] hover:text-white'
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
                className={`py-2.5 px-1.5 text-[12px] font-bold cursor-pointer flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap min-w-0 ${
                  pickerTab === 'player'
                    ? 'bg-[#262421] text-white'
                    : 'text-[#9B9A97] hover:text-white'
                }`}
              >
                <UserSearch className="w-3.5 h-3.5 text-[#58A3D1] shrink-0" />
                <span className="truncate">Search Player</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={pickerTab === 'pgn'}
                onClick={() => setPickerTab('pgn')}
                className={`py-2.5 px-1.5 text-[12px] font-bold cursor-pointer flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap min-w-0 ${
                  pickerTab === 'pgn'
                    ? 'bg-[#262421] text-white'
                    : 'text-[#9B9A97] hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-[#F7C045] shrink-0" />
                <span className="truncate">Paste PGN</span>
              </button>
            </div>

            <div className="p-4 flex-1 flex flex-col gap-3.5 overflow-y-auto">
              {pickerTab === 'mine' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                      <Search className="w-3.5 h-3.5 text-[#9B9A97] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={gameSearchFilter}
                        onChange={(e) => setGameSearchFilter(e.target.value)}
                        placeholder="Filter opponent or opening..."
                        aria-label="Filter recent games"
                        className="w-full h-[38px] pl-8 pr-3 rounded-[6px] bg-[#1F1E1B] text-xs text-white placeholder:text-[#847F76] focus:outline-none focus:ring-1 focus:ring-[#81B64C]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void refreshMyGames()}
                      disabled={myGamesLoading}
                      aria-label="Sync Games"
                      title="Sync Games"
                      className="h-[38px] px-2.5 rounded-[6px] bg-[#363431] hover:bg-[#43403C] text-xs font-bold text-[#DEDAD2] flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${myGamesLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-1 bg-[#1F1E1B] p-1 rounded-[6px]">
                    {(['all', 'win', 'loss', 'draw'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setOutcomeFilter(f)}
                        className={`py-1.5 rounded-[4px] text-[11px] font-bold cursor-pointer ${
                          outcomeFilter === f
                            ? 'bg-[#363431] text-white'
                            : 'text-[#9B9A97] hover:text-white'
                        }`}
                      >
                        {f === 'all' ? 'All' : f === 'win' ? 'Wins' : f === 'loss' ? 'Losses' : 'Draws'}
                      </button>
                    ))}
                  </div>

                  {myGamesLoading && myGames.length === 0 ? (
                    <div className="py-10 flex items-center justify-center gap-2 text-sm text-[#9B9A97]">
                      <Loader2 className="w-4 h-4 animate-spin text-[#81B64C]" />
                      <span>Syncing your recent games...</span>
                    </div>
                  ) : filteredMyGames.length === 0 ? (
                    <div className="space-y-3">
                      <div className="p-3.5 rounded-[7px] bg-[#1F1E1B] text-xs text-[#9B9A97] space-y-2.5">
                        <p>
                          {myGames.length === 0
                            ? username
                              ? `No saved games yet for ${username}. Open a master game below or search any player.`
                              : 'Play a match to review it here, or inspect a master game below.'
                            : 'No games match that filter.'}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleLoadSampleGame}
                            className="flex-1 h-[36px] rounded-[6px] cc-btn-primary-sm text-xs text-white font-extrabold cursor-pointer"
                          >
                            Review Sample Game
                          </button>
                          <button
                            type="button"
                            onClick={() => setPickerTab('player')}
                            className="flex-1 h-[36px] rounded-[6px] cc-btn-secondary text-xs text-white font-bold cursor-pointer"
                          >
                            Search Player
                          </button>
                        </div>
                      </div>

                      {myGames.length === 0 && (
                        <div className="space-y-2">
                          <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#9B9A97] px-0.5">
                            Featured Master Games
                          </div>
                          <div className="space-y-2">
                            {FEATURED_MASTER_GAMES.map((g) => renderGamePickerRow(g, null))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[520px] overflow-y-auto pr-0.5">
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
                      placeholder="Player username (e.g. DrNykterstein)..."
                      aria-label="Search player username"
                      className="flex-1 min-w-0 h-[40px] bg-[#1F1E1B] rounded-[6px] px-3 text-xs text-white placeholder:text-[#847F76] focus:outline-none focus:ring-1 focus:ring-[#81B64C]"
                    />
                    <button
                      type="button"
                      onClick={() => void handleSearchPlayerGames()}
                      disabled={playerSearchLoading || playerSearchQuery.trim().length < 2}
                      className="h-[40px] px-3.5 rounded-[6px] cc-btn-primary-sm text-xs font-extrabold text-white disabled:opacity-45 cursor-pointer flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                    >
                      {playerSearchLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5" />
                      )}
                      <span>Find</span>
                    </button>
                  </div>
                  {playerSearchError && (
                    <p className="text-xs text-[#F5B8B0]">{playerSearchError}</p>
                  )}
                  {playerSearchGames.length > 0 && (
                    <div className="space-y-2 max-h-[520px] overflow-y-auto pr-0.5">
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
                    rows={7}
                    placeholder="Paste a PGN or moves (e.g. 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ...)"
                    aria-label="Paste PGN moves"
                    className="w-full bg-[#1F1E1B] rounded-[6px] p-3 text-xs font-mono text-white placeholder:text-[#847F76] focus:outline-none focus:ring-1 focus:ring-[#81B64C]"
                  />
                  {customPgnError && (
                    <p className="text-xs text-[#F5B8B0]">{customPgnError}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleLoadCustomPgn}
                    disabled={!customPgnDraft.trim()}
                    className="w-full h-[46px] rounded-[8px] cc-btn-primary text-sm font-extrabold font-display text-white cursor-pointer disabled:opacity-45"
                  >
                    Load &amp; Review PGN
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>

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
  const isScanning = totalPlies > 0 && analyzedCount < totalPlies;
  const scanPct =
    totalPlies > 0 ? Math.min(100, Math.round((analyzedCount / totalPlies) * 100)) : 100;
  const activeStepExplore = isExploring
    ? explorationSteps[explorationSteps.length - 1]
    : null;

  // ============================================================================
  // STAGE 2: ACTIVE GAME REVIEW BOARD + STOCKFISH 19 WASM + WHAT-IF EXPLORATION
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

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Stockfish 19 Engine Depth/Speed Preset Selector */}
            <div
              role="group"
              aria-label="Analysis speed"
              className="hidden sm:inline-flex items-center rounded-lg bg-[#1A1917] border border-white/[0.08] p-0.5"
            >
              {(['fast', 'standard', 'deep'] as const).map((presetKey) => {
                const preset = REVIEW_SPEED_PRESETS[presetKey];
                const active = scanSpeed === presetKey;
                return (
                  <button
                    key={presetKey}
                    type="button"
                    onClick={() => setScanSpeed(presetKey)}
                    title={preset.shortDesc}
                    className={`px-2 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#81B64C] text-white'
                        : 'text-[#9E998F] hover:text-white'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              data-testid="review-open-report-btn"
              onClick={() => {
                setAutoPlaying(false);
                setSummaryOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-[#393734] hover:bg-[#45423E] text-xs font-bold text-[#E6E2DA] flex items-center gap-1.5 cursor-pointer"
              title="Open full match report card"
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#81B64C]" />
              <span>Game Report</span>
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

      {/* Visualized Stockfish 19 WASM Analysis Progress Banner */}
      {totalPlies > 0 && (
        <div
          data-testid="review-scan-banner"
          className="shrink-0 bg-[#1E1C19] border-b border-white/[0.06] px-3 sm:px-5 py-1.5"
        >
          <div className="flex items-center justify-between gap-2 sm:gap-3 text-[11px] font-mono tabular-nums">
            <div className="flex items-center gap-2 min-w-0">
              {isScanning ? (
                <Loader2 className="w-3.5 h-3.5 text-[#81B64C] animate-spin shrink-0" />
              ) : (
                <Cpu className="w-3.5 h-3.5 text-[#81B64C] shrink-0" />
              )}
              <span className="font-bold text-[#E6E2DA] truncate">
                {isScanning
                  ? `Engine · Analyzing ${scanTelemetry?.currentMoveSan || `move ${Math.max(1, Math.ceil((analyzedCount + 1) / 2))}`}...`
                  : `Engine · Depth ${REVIEW_SPEED_PRESETS[scanSpeed].depth}`}
              </span>
              {scanTelemetry && scanTelemetry.nps > 0 && isScanning && (
                <span className="hidden md:inline text-[#9E998F] shrink-0">
                  {Math.round(scanTelemetry.nps / 1000)} kn/s
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Compact mobile speed preset switcher */}
              <div
                role="group"
                aria-label="Mobile analysis speed"
                className="inline-flex sm:hidden items-center rounded bg-[#262421] border border-white/[0.08] p-0.5 font-sans"
              >
                {(['fast', 'standard', 'deep'] as const).map((presetKey) => {
                  const active = scanSpeed === presetKey;
                  const shortLbl = presetKey === 'fast' ? 'Fast' : presetKey === 'standard' ? 'Std' : 'Deep';
                  return (
                    <button
                      key={presetKey}
                      type="button"
                      onClick={() => setScanSpeed(presetKey)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        active ? 'bg-[#81B64C] text-white' : 'text-[#9E998F]'
                      }`}
                    >
                      {shortLbl}
                    </button>
                  );
                })}
              </div>
              {!isScanning && (
                <div className="hidden sm:flex items-center gap-2 text-[10px]">
                  {analysis.counts.Brilliant > 0 && (
                    <span className="text-[#26C6BE] font-bold">
                      !! {analysis.counts.Brilliant}
                    </span>
                  )}
                  {analysis.counts.Great > 0 && (
                    <span className="text-[#74A7CE] font-bold">
                      ! {analysis.counts.Great}
                    </span>
                  )}
                  {analysis.counts.Mistake > 0 && (
                    <span className="text-[#E68F3C] font-bold">
                      ? {analysis.counts.Mistake}
                    </span>
                  )}
                  {analysis.counts.Miss > 0 && (
                    <span className="text-[#F07E6D] font-bold">
                      × {analysis.counts.Miss}
                    </span>
                  )}
                  {analysis.counts.Blunder > 0 && (
                    <span className="text-[#E0524B] font-bold">
                      ?? {analysis.counts.Blunder}
                    </span>
                  )}
                </div>
              )}
              <span className="text-[#AEE076] font-bold">
                {analyzedCount}/{totalPlies} · {scanPct}%
              </span>
            </div>
          </div>
          {isScanning && (
            <div className="mt-1 h-1 w-full rounded-full bg-[#2C2925] overflow-hidden">
              <div
                className="h-full bg-[#81B64C] transition-all duration-150"
                style={{ width: `${scanPct}%` }}
              />
            </div>
          )}
        </div>
      )}

      {pgnError && (
        <div className="px-4 py-2 bg-[#5C2320] text-xs font-semibold text-[#F7C7C1] text-center">
          {pgnError}
        </div>
      )}

      {/* Main Board + Coach Inspector Split */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-start p-2 pb-24 sm:p-3 sm:pb-24 lg:px-5 lg:py-2 lg:pb-2 overflow-y-auto min-h-0">
          <div className="w-full max-w-[540px] lg:max-w-[min(640px,calc(100dvh-16rem))] lg:my-auto space-y-1.5">
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
              <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                <span className="font-extrabold text-[#C8C4BC]">
                  {topPlayer.accuracy}%
                </span>
                <span className="px-1.5 py-0.5 rounded bg-[#1A1917] text-[10px] font-extrabold text-[#AEE076]">
                  Est. {topPlayer.gameRating}
                </span>
              </div>
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

            {/* What-If Variation Breadcrumb Bar (visible whenever user drags pieces or plays a line) */}
            {isExploring && (
              <div
                data-testid="whatif-variation-bar"
                className="px-2.5 py-1.5 rounded-lg bg-[#2A3323] border border-[#81B64C]/40 flex items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <GitBranch className="w-3.5 h-3.5 text-[#AEE076] shrink-0" />
                  <span className="font-bold text-[#AEE076] shrink-0">Variation:</span>
                  <span className="font-mono text-white truncate">
                    {explorationSteps.map((s) => s.san).join(' ')}
                  </span>
                  {liveExploreEval && (
                    <span className="font-mono font-bold text-[#C8E89C] tabular-nums shrink-0">
                      ({formatEvalDisplay(liveExploreEval.evalCp, liveExploreEval.mateIn)} · d{liveExploreEval.depth})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setExplorationSteps((prev) => prev.slice(0, -1))}
                    className="px-2 py-1 rounded bg-[#1E2419] hover:bg-[#2E3827] text-[11px] font-bold text-[#E6E2DA] flex items-center gap-1 cursor-pointer"
                    title="Step back one variation move"
                  >
                    <Undo2 className="w-3 h-3" />
                    <span>Undo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setExplorationSteps([]);
                      setLiveExploreEval(null);
                    }}
                    className="px-2 py-1 rounded bg-[#81B64C] hover:bg-[#8EC556] text-[11px] font-extrabold text-white cursor-pointer"
                  >
                    Back to Game
                  </button>
                </div>
              </div>
            )}

            {/* Eval Bar + Interactive Chess Board */}
            <div className="flex items-stretch justify-center gap-2 sm:gap-3">
              <EvaluationBar
                evalCp={displayEval}
                mateIn={displayMateIn}
                orientation={flipped ? 'b' : 'w'}
              />
              <div className="flex-1 aspect-square min-w-0">
                <ChessBoard
                  fen={displayFen}
                  orientation={flipped ? 'b' : 'w'}
                  interactive={true}
                  theme={boardTheme}
                  lastMove={
                    activeStepExplore
                      ? { from: activeStepExplore.from, to: activeStepExplore.to }
                      : !isRetryingCurrent && currentMove
                        ? { from: currentMove.from, to: currentMove.to }
                        : null
                  }
                  bestMoveArrow={bestMoveArrow}
                  extraArrows={extraArrows}
                  moveBadge={
                    !isRetryingCurrent && !isExploring && currentMove
                      ? { square: currentMove.to, quality: currentMove.quality }
                      : null
                  }
                  onMove={handleBoardMove}
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
              <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                <span className="font-extrabold text-[#81B64C]">
                  {bottomPlayer.accuracy}%
                </span>
                <span className="px-1.5 py-0.5 rounded bg-[#1A1917] text-[10px] font-extrabold text-[#AEE076]">
                  Est. {bottomPlayer.gameRating}
                </span>
              </div>
            </div>

            {/* Interactive Evaluation Advantage Graph on Mobile/Tablet (Desktop displays it cleanly in right Coach dock) */}
            {analysis.moves.length > 0 && (
              <div className="lg:hidden">
                <EvalAdvantageChart
                  moves={analysis.moves}
                  selectedPly={selectedPly}
                  analyzedCount={analyzedCount}
                  heightClass="h-[52px]"
                  onSelectPly={(ply) => {
                    setAutoPlaying(false);
                    setSelectedPly(ply);
                  }}
                />
              </div>
            )}

            {/* On-Board Smart Coach Analysis Card — Authentic Chess.com White Speech Bubble */}
            <div
              data-testid="smart-coach-review-card"
              className="rounded-[8px] bg-[#262421] p-2.5 space-y-2 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-[5px] overflow-hidden bg-[#1F1E1B] shrink-0 mt-0.5">
                    <BotAvatar botId={activeCoach.id} size={44} />
                  </div>
                  <div className="relative flex-1 min-w-0 cc-speech-bubble rounded-[10px] px-3 py-2 space-y-0.5">
                    <svg
                      viewBox="0 0 10 14"
                      className="w-2.5 h-3.5 absolute -left-2 top-4 text-white fill-current"
                      aria-hidden="true"
                    >
                      <path d="M10 0 L0 7 L10 14 Z" />
                    </svg>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {!isExploring && currentMove && (
                        <MoveBadge quality={currentMove.quality} size="sm" />
                      )}
                      <span className="text-xs sm:text-[13px] font-extrabold text-[#262421]">
                        {isExploring
                          ? `Exploring ${activeStepExplore?.san ?? 'Variation'}`
                          : smartMove
                            ? smartMove.headline
                            : smartInsights.summaryHeadline}
                      </span>
                      {!isExploring && smartMove && (
                        <span className="px-1.5 py-0.5 rounded bg-[#EAE8E4] font-mono text-[10px] font-bold text-[#4A4742] tabular-nums">
                          Win {smartMove.winChanceMover}%
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-[#3B3936] font-medium leading-snug">
                      {isExploring
                        ? liveExploreEval
                          ? `Top reply: ${liveExploreEval.bestMoveSan} (${formatEvalDisplay(liveExploreEval.evalCp, liveExploreEval.mateIn)} at depth ${liveExploreEval.depth}). Keep playing moves to test this line.`
                          : 'Move any piece on the board to test a variation.'
                        : retryState?.feedback
                          ? retryState.feedback
                          : currentMove?.classificationNote && currentMove.quality !== 'Book'
                            ? `${currentMove.classificationNote}. ${smartMove?.why ?? ''}`
                            : smartMove
                              ? smartMove.why
                              : smartInsights.coachVerdict}
                    </p>
                    {!isExploring && smartMove?.betterPlan && !retryState?.active && (
                      <p className="text-[11px] font-bold text-[#457524] leading-snug">
                        {smartMove.betterPlan}
                      </p>
                    )}
                  </div>
                </div>

                {/* Retry Move / Show Follow-Up / Show Answer Buttons */}
                {!isExploring && currentMove && (
                  <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                    {!isRetryingCurrent &&
                      currentMove.bestLineSan &&
                      currentMove.bestLineSan.length > 0 &&
                      currentMove.bestMoveSan !== currentMove.san && (
                        <button
                          type="button"
                          onClick={() =>
                            handlePlayVariationLine(
                              currentMove.bestLineSan ?? [currentMove.bestMoveSan],
                              currentMove.fenBefore,
                            )
                          }
                          className="px-2 py-1.5 rounded-lg bg-[#2E3628] hover:bg-[#3A4532] text-[11px] font-bold text-[#AEE076] flex items-center gap-1 cursor-pointer"
                          title={`Play engine follow-up: ${currentMove.bestLineSan.slice(0, 4).join(' ')}`}
                        >
                          <GitBranch className="w-3 h-3" />
                          <span>Follow-Up</span>
                        </button>
                      )}
                    {canRetryCurrentMove && (
                      <button
                        type="button"
                        onClick={() => {
                          setAutoPlaying(false);
                          setExplorationSteps([]);
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
                    )}
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
                      : `Move ${currentMoveNum} of ${totalMoveCount}`}
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
                    className="min-h-[36px] col-span-2 rounded-[6px] cc-btn-primary-sm text-white text-xs font-extrabold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40"
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
            lastMoveSan={activeStepExplore?.san ?? currentMove?.san ?? ''}
            suggestedMoveSan={
              isExploring && liveExploreEval
                ? liveExploreEval.bestMoveSan
                : currentMove?.bestMoveSan ?? ''
            }
            externalMoves={moves}
            externalAnalyzedCount={analyzedCount}
            selectedPly={selectedPly}
            onSelectPly={(ply) => {
              setAutoPlaying(false);
              setSelectedPly(ply);
            }}
            onHighlightArrow={setCloudArrow}
            onPlayVariation={handlePlayVariationLine}
            onLiveEvalUpdate={setLiveExploreEval}
            isExploring={isExploring}
            defaultTab="report"
            coachId={activeCoachId}
            whiteName={loadedMeta.whiteName}
            blackName={loadedMeta.blackName}
            whiteRating={loadedMeta.whiteRating}
            blackRating={loadedMeta.blackRating}
            onOpenFullReport={() => {
              setAutoPlaying(false);
              setSummaryOpen(true);
            }}
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
            lastMoveSan={activeStepExplore?.san ?? currentMove?.san ?? ''}
            suggestedMoveSan={
              isExploring && liveExploreEval
                ? liveExploreEval.bestMoveSan
                : currentMove?.bestMoveSan ?? ''
            }
            externalMoves={moves}
            externalAnalyzedCount={analyzedCount}
            selectedPly={selectedPly}
            onSelectPly={(ply) => {
              setAutoPlaying(false);
              setSelectedPly(ply);
            }}
            onHighlightArrow={setCloudArrow}
            onPlayVariation={(lineSan, baseFen) => {
              handlePlayVariationLine(lineSan, baseFen);
              setMobileSheet('none');
            }}
            onLiveEvalUpdate={setLiveExploreEval}
            isExploring={isExploring}
            defaultTab="report"
            onMoveStepCloseSheet={() => setMobileSheet('none')}
            coachId={activeCoachId}
            whiteName={loadedMeta.whiteName}
            blackName={loadedMeta.blackName}
            whiteRating={loadedMeta.whiteRating}
            blackRating={loadedMeta.blackRating}
            onOpenFullReport={() => {
              setMobileSheet('none');
              setAutoPlaying(false);
              setSummaryOpen(true);
            }}
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
          coachId={activeCoachId}
          initialMoves={moves}
          initialAnalyzedCount={analyzedCount}
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
          onSelectPly={(ply) => {
            setAutoPlaying(false);
            setSelectedPly(ply);
          }}
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
