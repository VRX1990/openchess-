import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type Move, type PieceSymbol } from 'chess.js';
import {
  Flag,
  Lightbulb,
  RotateCcw,
  ArrowLeftRight,
  ChevronFirst,
  ChevronLeft,
  ChevronRight,
  ChevronLast,
  SearchCheck,
  Undo2,
  Bot,
  Users,
  SlidersHorizontal,
  MessageSquare,
  ShieldCheck,
  Clock,
  ArrowLeft,
  Settings,
  Copy,
  Check,
  Handshake,
  Wifi,
  Send,
  LogOut,
  GraduationCap,
  RotateCw,
} from 'lucide-react';
import {
  BOT_PROFILES,
  MAX_BOT_ELO,
  MIN_BOT_ELO,
  type BotId,
  analyzeClientStockfish19Nnue,
  checkBlunderFast,
  chooseBotMove,
  computeClientStockfish19NnueMultiPv,
  evaluatePosition,
  findBestMove,
  getMaterialBalance,
  getNearestBotForElo,
  pickCalibratedEngineLine,
  resolveSingleHintMove,
  type HintCandidate,
  type MoveQuality,
} from '../chess/engine';
import {
  COACH_PROFILES,
  COACH_STRENGTH_LEVELS,
  evaluateCoachStudentMove,
  explainCoachReplyMove,
  getCoachProfile,
  loadSelectedCoachId,
  loadSelectedCoachStrength,
  saveSelectedCoachId,
  saveSelectedCoachStrength,
  type CoachLessonFeedback,
  type CoachPersonaId,
  type CoachStrengthId,
} from '../chess/coach';
import {
  calculateUpdatedElo,
  countryCodeToFlagEmoji,
  loadGuestPerfs,
  loadGuestPlayerName,
  recordBotWin,
  savePlayedGame,
} from '../chess/analytics';
import { parseUciMovesToGameState, type LichessAccount, type LichessUserGame } from '../chess/lichess';
import {
  playErrorSound,
  playGameOverSound,
  playMoveSound,
  playPremoveSound,
} from '../chess/sound';
import { ChessBoard, type BoardTheme } from './ChessBoard';
import { ChessPiece } from './ChessPiece';
import { EvaluationBar } from './EvaluationBar';
import { CoachWorkspace } from './CoachWorkspace';
import { GameOverModal } from './GameOverModal';
import { GameReviewSummaryScreen } from './GameReviewSummaryScreen';
import { BottomSheet } from './BottomSheet';
import { BotAvatar } from './BotAvatar';
import { PlayerAvatar } from './PlayerAvatar';
import { MoveSanText } from './MoveSanText';
import { loadUserAvatar } from '../chess/avatars';
import {
  computeLiveInterpolatedClockMs,
  enqueuePremoveMove,
  formatHighPrecisionClock,
  formatOnlinePlayerDisplay,
  formatOnlineTimeControl,
  formatOpponentPresenceText,
  isPlaceholderPlayerUsername,
  resolveOnlineSignalQuality,
  stripPlatformFromText,
  type ChessServerName,
  type OpponentPresenceStatus,
  type QueuedPremove,
} from '../chess/onlineHelpers';
import { MOVE_QUALITY_META, MoveBadge } from './MoveBadge';
import { CoachPickerModal } from './CoachPickerModal';

export interface TimeControl {
  id: string;
  label: string;
  category: string;
  initialSeconds: number;
  incrementSeconds: number;
}

export const TIME_CONTROLS: TimeControl[] = [
  { id: '1+0', label: '1 min', category: 'Bullet', initialSeconds: 60, incrementSeconds: 0 },
  { id: '1+1', label: '1 | 1', category: 'Bullet', initialSeconds: 60, incrementSeconds: 1 },
  { id: '2+1', label: '2 | 1', category: 'Bullet', initialSeconds: 120, incrementSeconds: 1 },
  { id: '3+0', label: '3 min', category: 'Blitz', initialSeconds: 180, incrementSeconds: 0 },
  { id: '3+2', label: '3 | 2', category: 'Blitz', initialSeconds: 180, incrementSeconds: 2 },
  { id: '5+0', label: '5 min', category: 'Blitz', initialSeconds: 300, incrementSeconds: 0 },
  { id: '10+0', label: '10 min', category: 'Rapid', initialSeconds: 600, incrementSeconds: 0 },
  { id: '15+10', label: '15 | 10', category: 'Rapid', initialSeconds: 900, incrementSeconds: 10 },
];

export type PlayMode = 'coach' | 'bot' | 'local' | 'online-ws' | 'online-lichess';

export interface PlayPreset {
  botId?: BotId;
  botElo?: number;
  timeId?: string;
  matchedInitialSeconds?: number;
  matchedIncrementSeconds?: number;
  rated?: boolean;
  serverSource?: ChessServerName;
  mode?: PlayMode;
  color?: Color | 'random';
  coachGuard?: boolean;
  coachId?: CoachPersonaId;
  coachStrength?: CoachStrengthId;
  lichessGameId?: string;
  wsRoomId?: string;
  wsAction?: 'create' | 'join';
  nonce: number;
}

interface OnlineChatMessage {
  id: string;
  sender: string;
  color: 'w' | 'b';
  text: string;
  timestamp: number;
  senderAvatarUrl?: string;
  senderFlag?: string;
}

interface PlayViewProps {
  boardTheme: BoardTheme;
  preset?: PlayPreset | null;
  lichessToken?: string | null;
  lichessUsername?: string | null;
  lichessFlag?: string | null;
  lichessPerfs?: LichessAccount['perfs'];
  coachId?: CoachPersonaId;
  onCoachChange?: (id: CoachPersonaId) => void;
  onBack?: () => void;
  onActiveGameChange?: (active: boolean) => void;
  onSendToReview: (pgn: string, playerColor: Color, resultLabel: string) => void;
  onRecordGamePlayed: () => void;
  onRecordAccountResult?: (params: {
    category: 'rapid' | 'blitz' | 'bullet';
    outcome: 'win' | 'loss' | 'draw';
    opponentRating?: number;
    gameId?: string;
  }) => void;
  onSavePlayedGame?: (game: LichessUserGame) => void;
  onOpenPlayerProfile?: (username: string) => void;
  friends?: string[];
  onAddFriend?: (username: string) => void;
  onMessagePlayer?: (username: string) => void;
  onLaunchRoom?: (opts: { roomId: string; timeId: string; color: 'w' | 'b' }) => void;
}

export function PlayView({
  boardTheme,
  preset = null,
  lichessToken = null,
  lichessUsername = null,
  lichessFlag = null,
  lichessPerfs,
  coachId: externalCoachId,
  onCoachChange,
  onBack,
  onActiveGameChange,
  onSendToReview,
  onRecordGamePlayed,
  onRecordAccountResult,
  onSavePlayedGame,
  onOpenPlayerProfile,
  friends = [],
  onAddFriend,
  onMessagePlayer,
  onLaunchRoom,
}: PlayViewProps) {
  const [opponentType, setOpponentType] = useState<PlayMode>(preset?.mode ?? 'bot');
  const [botId, setBotId] = useState<BotId>(preset?.botId ?? 'viktor');
  const [botElo, setBotElo] = useState<number | null>(preset?.botElo ?? null);
  const [internalCoachId, setInternalCoachId] = useState<CoachPersonaId>(
    () => preset?.coachId ?? loadSelectedCoachId(),
  );
  const activeCoachId = externalCoachId ?? internalCoachId;
  const activeCoach = useMemo(() => getCoachProfile(activeCoachId), [activeCoachId]);
  const [coachStrength, setCoachStrength] = useState<CoachStrengthId>(
    () => preset?.coachStrength ?? loadSelectedCoachStrength(),
  );
  const [coachPickerOpen, setCoachPickerOpen] = useState(false);
  const [timeControlId, setTimeControlId] = useState<string>(preset?.timeId ?? '10+0');
  const [playerColor, setPlayerColor] = useState<Color>('w');
  const [flipped, setFlipped] = useState(false);

  const isOnlineMode = opponentType === 'online-ws' || opponentType === 'online-lichess';
  const isCoachMode = opponentType === 'coach';
  const isBotOrCoach = opponentType === 'bot' || isCoachMode;

  // Online WebSocket & Lichess multiplayer state
  const wsRef = useRef<WebSocket | null>(null);
  const [onlineInfo, setOnlineInfo] = useState<{
    roomId: string;
    lichessGameId: string;
    opponentConnected: boolean;
    opponentStatus: OpponentPresenceStatus;
    opponentGoneSeconds: number | null;
    bridgeLagMs: number | null;
    whiteName: string;
    blackName: string;
    whiteRating?: number;
    blackRating?: number;
    whiteAvatarUrl?: string;
    blackAvatarUrl?: string;
    whiteFlag?: string;
    blackFlag?: string;
    whiteTitle?: string;
    blackTitle?: string;
    rated?: boolean;
    matchedClock?: { initialSeconds: number; incrementSeconds: number };
    serverSource?: ChessServerName;
    drawOfferBy: 'w' | 'b' | null;
    rematchOfferBy: 'w' | 'b' | null;
    error: string | null;
  }>(() => {
    const ownName = lichessUsername?.trim() || loadGuestPlayerName();
    const guestPerfs = loadGuestPerfs();
    const initSec =
      typeof preset?.matchedInitialSeconds === 'number'
        ? preset.matchedInitialSeconds
        : TIME_CONTROLS.find((t) => t.id === (preset?.timeId ?? '10+0'))?.initialSeconds ?? 600;
    const incSec =
      typeof preset?.matchedIncrementSeconds === 'number'
        ? preset.matchedIncrementSeconds
        : TIME_CONTROLS.find((t) => t.id === (preset?.timeId ?? '10+0'))?.incrementSeconds ?? 0;
    const catName = formatOnlineTimeControl(initSec, incSec).category;
    const catKey: 'bullet' | 'blitz' | 'rapid' =
      catName === 'Bullet' ? 'bullet' : catName === 'Blitz' ? 'blitz' : 'rapid';
    const ownRating =
      (catKey === 'bullet'
        ? lichessPerfs?.bullet?.rating
        : catKey === 'blitz'
          ? lichessPerfs?.blitz?.rating
          : lichessPerfs?.rapid?.rating) ?? guestPerfs[catKey].rating;
    const isWsOnline = preset?.mode === 'online-ws';
    const assignedW = isWsOnline && preset?.color === 'w';
    const assignedB = isWsOnline && preset?.color === 'b';
    return {
      roomId: preset?.wsRoomId ?? '',
      lichessGameId: preset?.lichessGameId ?? '',
      opponentConnected: Boolean(isWsOnline && preset?.wsAction === 'join'),
      opponentStatus: isWsOnline && preset?.wsAction === 'join' ? 'active' : 'joining',
      opponentGoneSeconds: null,
      bridgeLagMs: null,
      whiteName: assignedW ? ownName : isWsOnline ? 'Connecting...' : 'White',
      blackName: assignedB ? ownName : isWsOnline ? 'Connecting...' : 'Black',
      whiteRating: assignedW ? ownRating : undefined,
      blackRating: assignedB ? ownRating : undefined,
      rated: preset?.rated,
      matchedClock:
        typeof preset?.matchedInitialSeconds === 'number'
          ? {
              initialSeconds: preset.matchedInitialSeconds,
              incrementSeconds: preset.matchedIncrementSeconds ?? 0,
            }
          : undefined,
      serverSource: preset?.serverSource,
      drawOfferBy: null,
      rematchOfferBy: null,
      error: null,
    };
  });
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [wsConnectionState, setWsConnectionState] = useState<
    'connecting' | 'connected' | 'reconnecting'
  >('connecting');
  const [wsLatencyMs, setWsLatencyMs] = useState<number | null>(null);
  const wsLatencyMsRef = useRef<number | null>(null);
  wsLatencyMsRef.current = wsLatencyMs;
  const everConnectedOpponentRef = useRef(false);
  const [opponentTyping, setOpponentTyping] = useState(false);
  const typingTimerRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const pendingWsMovesRef = useRef<Array<{ from: string; to: string; promotion?: PieceSymbol }>>([]);
  const optimisticMoveRef = useRef<{
    ply: number;
    from: string;
    to: string;
    prevFen: string;
    createdAt: number;
  } | null>(null);
  const optimisticSyncTimerRef = useRef<number | null>(null);
  const justJoinedWsRoomRef = useRef(false);

  const chessRef = useRef<Chess>(new Chess());
  const [fen, setFen] = useState(() => chessRef.current.fen());
  const [pgn, setPgn] = useState('');
  const [history, setHistory] = useState<Move[]>([]);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [lastMove, setLastMove] = useState<{
    from: string;
    to: string;
    san: string;
    captured?: boolean;
  } | null>(null);
  const [hintSquares, setHintSquares] = useState<{ from?: string; to?: string } | null>(null);

  const tc = useMemo(
    () => TIME_CONTROLS.find((t) => t.id === timeControlId) ?? TIME_CONTROLS.find((t) => t.id === '10+0') ?? TIME_CONTROLS[0],
    [timeControlId],
  );
  const effectiveTc = useMemo(() => {
    if (isOnlineMode && onlineInfo.matchedClock) {
      return formatOnlineTimeControl(
        onlineInfo.matchedClock.initialSeconds,
        onlineInfo.matchedClock.incrementSeconds,
      );
    }
    return { id: tc.id, label: tc.label, category: tc.category };
  }, [isOnlineMode, onlineInfo.matchedClock, tc.category, tc.id, tc.label]);

  const [whiteClockMs, setWhiteClockMs] = useState(tc.initialSeconds * 1000);
  const [blackClockMs, setBlackClockMs] = useState(tc.initialSeconds * 1000);
  const [clockRunning, setClockRunning] = useState(false);
  const clockAnchorRef = useRef<{
    whiteMs: number;
    blackMs: number;
    syncedAtMs: number;
    turn: Color;
    running: boolean;
  }>({
    whiteMs: tc.initialSeconds * 1000,
    blackMs: tc.initialSeconds * 1000,
    syncedAtMs: Date.now(),
    turn: 'w',
    running: false,
  });

  const [gameOverState, setGameOverState] = useState<{
    title: string;
    subtitle: string;
    playerWon: boolean | null;
    resultLabel: string;
    modalOpen: boolean;
    whiteName?: string;
    blackName?: string;
    whiteRating?: number;
    blackRating?: number;
    whiteRatingDelta?: number | null;
    blackRatingDelta?: number | null;
    isRatedMatch?: boolean;
    pgnSnapshot?: string;
  } | null>(null);

  const [rightTab, setRightTab] = useState<'match' | 'moves' | 'tutor' | 'chat'>(
    preset?.mode === 'coach'
      ? 'tutor'
      : preset?.mode === 'online-ws' || preset?.mode === 'online-lichess'
        ? 'chat'
        : 'moves',
  );
  const [mobileSheet, setMobileSheet] = useState<'none' | 'setup' | 'tutor' | 'chat' | 'options'>('none');
  const rightTabRef = useRef(rightTab);
  rightTabRef.current = rightTab;
  const mobileSheetRef = useRef(mobileSheet);
  mobileSheetRef.current = mobileSheet;
  const [chatMessages, setChatMessages] = useState<OnlineChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [unreadChat, setUnreadChat] = useState(0);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const mobileStepperScrollRef = useRef<HTMLDivElement | null>(null);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  useEffect(() => {
    if (rightTab === 'chat' || mobileSheet === 'chat') {
      setUnreadChat(0);
    }
  }, [rightTab, mobileSheet]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages.length, rightTab, mobileSheet]);

  const [coachGuard, setCoachGuard] = useState(false);
  const [pendingBlunder, setPendingBlunder] = useState<{
    from: string;
    to: string;
    promotion?: PieceSymbol;
    san: string;
    reason: string;
    bestSan: string;
    bestFrom: string;
    bestTo: string;
    cpLoss: number;
  } | null>(null);
  const [coachFeedback, setCoachFeedback] = useState<CoachLessonFeedback | null>(null);
  const [coachMoveBadge, setCoachMoveBadge] = useState<{
    square: string;
    quality: MoveQuality;
  } | null>(null);
  const [premoveQueue, setPremoveQueue] = useState<QueuedPremove[]>([]);
  const clearCoachMoveBadge = useCallback(() => {
    setCoachMoveBadge(null);
  }, []);
  const [coachReplyNote, setCoachReplyNote] = useState<string | null>(null);
  const [coachReplyMeta, setCoachReplyMeta] = useState<{
    san: string;
    quality: MoveQuality;
    note: string;
  } | null>(null);
  const [queuedCoachPrompt, setQueuedCoachPrompt] = useState<{ id: number; text: string } | null>(
    null,
  );
  const [cloudArrow, setCloudArrow] = useState<{ from: string; to: string } | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [hintSan, setHintSan] = useState<string | null>(null);

  const botTimeoutRef = useRef<number | null>(null);
  const hintAbortRef = useRef<AbortController | null>(null);
  const matchNonceRef = useRef<string>(`match-${Date.now()}`);
  const matchStartedAtRef = useRef<number>(Date.now());
  const savedGameNonceRef = useRef<string | null>(null);
  const recordedStatsNonceRef = useRef<string | null>(null);
  const latestOnlineRef = useRef(onlineInfo);
  useEffect(() => {
    latestOnlineRef.current = onlineInfo;
  }, [onlineInfo]);
  const hintCacheRef = useRef<Map<string, HintCandidate>>(new Map());
  const bestEvalCacheRef = useRef<{
    fen: string;
    san: string;
    from: string;
    to: string;
    evalCp: number;
  } | null>(null);
  const activeBot = useMemo(
    () => BOT_PROFILES.find((b) => b.id === botId) ?? BOT_PROFILES[2],
    [botId],
  );
  const activeCoachLevel = useMemo(
    () =>
      COACH_STRENGTH_LEVELS.find((l) => l.id === coachStrength) ??
      COACH_STRENGTH_LEVELS[1],
    [coachStrength],
  );
  const effectiveBotElo = isCoachMode
    ? activeCoachLevel.elo
    : (botElo ?? activeBot.rating);
  const activeOpponentName = isCoachMode ? activeCoach.name : activeBot.name;

  const liveChess = useMemo(() => new Chess(fen), [fen]);

  useEffect(() => {
    if (mobileStepperScrollRef.current) {
      mobileStepperScrollRef.current.scrollLeft = mobileStepperScrollRef.current.scrollWidth;
    }
  }, [history.length]);

  const displayedFen = useMemo(() => {
    if (viewPly === null || viewPly === history.length) return fen;
    const replay = new Chess();
    for (let i = 0; i < viewPly; i++) {
      replay.move(history[i].san);
    }
    return replay.fen();
  }, [fen, history, viewPly]);

  const displayedEval = useMemo(() => {
    try {
      return evaluatePosition(new Chess(displayedFen));
    } catch {
      return 0;
    }
  }, [displayedFen]);

  const [bestSuggestion, setBestSuggestion] = useState('');

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      try {
        const c = new Chess(displayedFen);
        if (c.isGameOver()) {
          setBestSuggestion('');
          bestEvalCacheRef.current = null;
          return;
        }
        const best = findBestMove(displayedFen, 2);
        if (!active) return;
        if (best) {
          setBestSuggestion(best.move.san);
          bestEvalCacheRef.current = {
            fen: displayedFen,
            san: best.move.san,
            from: best.move.from,
            to: best.move.to,
            evalCp: best.evalCp,
          };
        } else {
          setBestSuggestion('');
        }
      } catch {
        setBestSuggestion('');
      }
    }, 50);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [displayedFen]);

  const material = useMemo(() => getMaterialBalance(displayedFen), [displayedFen]);

  useEffect(() => {
    hintAbortRef.current?.abort();
    hintAbortRef.current = null;
    setHintLoading(false);
    setHintSan(null);
  }, [fen]);

  const orientation: Color = flipped
    ? playerColor === 'w'
      ? 'b'
      : 'w'
    : playerColor;

  const finishGame = useCallback(
    (title: string, subtitle: string, playerWon: boolean | null, resultLabel: string) => {
      setClockRunning(false);
      if (playerWon === true && opponentType === 'bot') {
        recordBotWin(botId);
      }
      const info = latestOnlineRef.current;
      const categorySource =
        isOnlineMode && info.matchedClock
          ? formatOnlineTimeControl(
              info.matchedClock.initialSeconds,
              info.matchedClock.incrementSeconds,
            ).category
          : tc.category;
      const category: 'bullet' | 'blitz' | 'rapid' =
        categorySource === 'Bullet'
          ? 'bullet'
          : categorySource === 'Blitz'
            ? 'blitz'
            : 'rapid';
      const outcome: 'win' | 'loss' | 'draw' =
        playerWon === true ? 'win' : playerWon === false ? 'loss' : 'draw';
      const moveHistory = chessRef.current.history();
      const titleLower = title.toLowerCase();
      const subtitleLower = subtitle.toLowerCase();
      const isAbortedMatch =
        titleLower.includes('abort') ||
        subtitleLower.includes('abort') ||
        subtitleLower.includes('left before game started') ||
        (opponentType !== 'local' && moveHistory.length === 0 && resultLabel === '1/2-1/2');
      const isUnratedOnline =
        opponentType === 'online-ws' &&
        (info.rated === false ||
          (info.rated === undefined &&
            typeof (playerColor === 'w' ? info.blackRating : info.whiteRating) !== 'number'));
      const isRatedMatch = opponentType !== 'local' && !isUnratedOnline;
      const rawOppRating = isBotOrCoach
        ? effectiveBotElo
        : playerColor === 'w'
          ? info.blackRating
          : info.whiteRating;
      const oppRating = rawOppRating ?? 1200;
      const guestPerfs = loadGuestPerfs();
      const currentPlayerRating =
        (category === 'bullet'
          ? lichessPerfs?.bullet?.rating
          : category === 'blitz'
            ? lichessPerfs?.blitz?.rating
            : lichessPerfs?.rapid?.rating) ?? guestPerfs[category].rating;
      const nextPlayerRating =
        opponentType === 'local' || isAbortedMatch || isUnratedOnline
          ? currentPlayerRating
          : calculateUpdatedElo(currentPlayerRating, oppRating, outcome);
      const ratingDelta = nextPlayerRating - currentPlayerRating;
      const oppOutcome: 'win' | 'loss' | 'draw' =
        outcome === 'win' ? 'loss' : outcome === 'loss' ? 'win' : 'draw';
      const oppDelta =
        isOnlineMode &&
        typeof rawOppRating === 'number' &&
        !isAbortedMatch &&
        !isUnratedOnline
          ? calculateUpdatedElo(rawOppRating, currentPlayerRating, oppOutcome) - rawOppRating
          : null;
      const nextOppRating =
        typeof rawOppRating === 'number'
          ? rawOppRating + (oppDelta ?? 0)
          : undefined;
      const ratingBanner =
        opponentType === 'local' || isAbortedMatch || isUnratedOnline
          ? ''
          : ` · Rating: ${currentPlayerRating} → ${nextPlayerRating} (${ratingDelta >= 0 ? `+${ratingDelta}` : ratingDelta})`;
      const enrichedSubtitle = subtitle.includes('Rating:')
        ? subtitle
        : `${subtitle}${ratingBanner}`;

      const safeWhiteName =
        info.whiteName && info.whiteName !== 'Waiting for Friend...' ? info.whiteName : '';
      const safeBlackName =
        info.blackName && info.blackName !== 'Waiting for Friend...' ? info.blackName : '';
      const whiteNameResolved =
        isBotOrCoach
          ? playerColor === 'w'
            ? lichessUsername || 'You'
            : activeOpponentName
          : opponentType === 'local'
            ? 'White'
            : safeWhiteName || (playerColor === 'w' ? lichessUsername || 'You' : 'Opponent');
      const blackNameResolved =
        isBotOrCoach
          ? playerColor === 'b'
            ? lichessUsername || 'You'
            : activeOpponentName
          : opponentType === 'local'
            ? 'Black'
            : safeBlackName || (playerColor === 'b' ? lichessUsername || 'You' : 'Opponent');
      const oppNameIsGuest =
        playerColor === 'w'
          ? blackNameResolved === 'Guest Opponent' || blackNameResolved === 'Anonymous (Guest)' || blackNameResolved === 'Anonymous'
          : whiteNameResolved === 'Guest Opponent' || whiteNameResolved === 'Anonymous (Guest)' || whiteNameResolved === 'Anonymous';
      const resolvedOppRatingFinal =
        oppNameIsGuest || (isUnratedOnline && typeof rawOppRating !== 'number')
          ? undefined
          : nextOppRating;
      const whiteRatingResolved =
        isBotOrCoach
          ? playerColor === 'b'
            ? effectiveBotElo
            : nextPlayerRating
          : opponentType === 'local'
            ? undefined
            : playerColor === 'w'
              ? nextPlayerRating
              : resolvedOppRatingFinal;
      const blackRatingResolved =
        isBotOrCoach
          ? playerColor === 'w'
            ? effectiveBotElo
            : nextPlayerRating
          : opponentType === 'local'
            ? undefined
            : playerColor === 'b'
              ? nextPlayerRating
              : resolvedOppRatingFinal;
      const whiteRatingDelta =
        opponentType === 'local' || isAbortedMatch || isUnratedOnline
          ? null
          : playerColor === 'w'
            ? ratingDelta
            : oppDelta;
      const blackRatingDelta =
        opponentType === 'local' || isAbortedMatch || isUnratedOnline
          ? null
          : playerColor === 'b'
            ? ratingDelta
            : oppDelta;

      chessRef.current.setHeader('White', whiteNameResolved);
      chessRef.current.setHeader('Black', blackNameResolved);
      chessRef.current.setHeader('Result', resultLabel);
      if (whiteRatingResolved) chessRef.current.setHeader('WhiteElo', String(whiteRatingResolved));
      if (blackRatingResolved) chessRef.current.setHeader('BlackElo', String(blackRatingResolved));
      const enrichedPgn = chessRef.current.pgn() || moveHistory.join(' ');
      if (moveHistory.length > 0) {
        setPgn(enrichedPgn);
      }

      setGameOverState({
        title,
        subtitle: enrichedSubtitle,
        playerWon,
        resultLabel,
        modalOpen: true,
        whiteName: whiteNameResolved,
        blackName: blackNameResolved,
        whiteRating: whiteRatingResolved,
        blackRating: blackRatingResolved,
        whiteRatingDelta,
        blackRatingDelta,
        isRatedMatch,
        pgnSnapshot: enrichedPgn,
      });

      const gameId =
        info.lichessGameId ||
        (info.roomId ? `ws-${info.roomId}` : `oc-${matchStartedAtRef.current}`);

      if (moveHistory.length > 0 && savedGameNonceRef.current !== matchNonceRef.current) {
        savedGameNonceRef.current = matchNonceRef.current;
        const nowMs = Date.now();
        const statusLower = title.toLowerCase();
        const status =
          resultLabel === '1/2-1/2'
            ? 'draw'
            : statusLower.includes('resign')
              ? 'resign'
              : statusLower.includes('time')
                ? 'outoftime'
                : 'mate';
        const winner =
          resultLabel === '1-0' ? 'white' : resultLabel === '0-1' ? 'black' : undefined;

        const record: LichessUserGame = {
          id: info.roomId ? `ws-${info.roomId}-${matchStartedAtRef.current}` : gameId,
          rated: isRatedMatch,
          speed: category,
          status,
          winner,
          white: { name: whiteNameResolved, rating: whiteRatingResolved },
          black: { name: blackNameResolved, rating: blackRatingResolved },
          pgn: enrichedPgn,
          createdAt: matchStartedAtRef.current,
          lastMoveAt: nowMs,
        };
        if (!isAbortedMatch) {
          savePlayedGame(record);
          onSavePlayedGame?.(record);
        }
      }
      if (recordedStatsNonceRef.current !== matchNonceRef.current) {
        recordedStatsNonceRef.current = matchNonceRef.current;
        if (opponentType !== 'local' && !isAbortedMatch && !isUnratedOnline && onRecordAccountResult) {
          onRecordAccountResult({
            category,
            outcome,
            opponentRating: oppRating,
            gameId,
          });
        }
        playGameOverSound(playerWon === true);
        if (!isAbortedMatch) {
          onRecordGamePlayed();
        }
      }
    },
    [
      activeOpponentName,
      botId,
      effectiveBotElo,
      isBotOrCoach,
      lichessPerfs?.blitz?.rating,
      lichessPerfs?.bullet?.rating,
      lichessPerfs?.rapid?.rating,
      lichessUsername,
      onRecordAccountResult,
      onRecordGamePlayed,
      onSavePlayedGame,
      opponentType,
      playerColor,
      tc.category,
    ],
  );

  const checkEndConditions = useCallback(
    (c: Chess) => {
      if (!c.isGameOver()) return false;
      if (c.isCheckmate()) {
        const winner: Color = c.turn() === 'w' ? 'b' : 'w';
        const playerWon =
          opponentType === 'local' ? true : winner === playerColor;
        const winnerName = winner === 'w' ? 'White' : 'Black';
        finishGame(
          `${winnerName} Wins by Checkmate`,
          isBotOrCoach
            ? playerWon
              ? `You defeated ${activeOpponentName} (${effectiveBotElo}).`
              : `${activeOpponentName} delivered checkmate.`
            : `${winnerName} delivered checkmate.`,
          opponentType === 'local' ? null : playerWon,
          winner === 'w' ? '1-0' : '0-1',
        );
        return true;
      }
      const reason = c.isStalemate()
        ? 'Stalemate'
        : c.isThreefoldRepetition()
          ? 'Threefold Repetition'
          : c.isInsufficientMaterial()
            ? 'Insufficient Material'
            : 'Draw by 50-Move Rule';
      finishGame('Draw', reason, null, '1/2-1/2');
      return true;
    },
    [activeOpponentName, effectiveBotElo, finishGame, isBotOrCoach, opponentType, playerColor],
  );

  const applyMoveOnBoard = useCallback(
    (from: string, to: string, promotion?: PieceSymbol, bypassGuard = false): boolean => {
      if (gameOverState || viewPly !== null) return false;
      const game = chessRef.current;
      const moverColor = game.turn();
      const fenBefore = game.fen();

      // Online WebSocket multiplayer: optimistic 0ms local execution + authoritative server sync (queues if WS is connecting/reconnecting)
      if (opponentType === 'online-ws') {
        if (moverColor !== playerColor) return false;
        const ws = wsRef.current;
        const canQueueWhileJoining =
          onlineInfo.opponentConnected ||
          everConnectedOpponentRef.current ||
          preset?.wsAction === 'join';
        if (!canQueueWhileJoining) return false;
        try {
          const moved = game.move({ from, to, promotion: promotion ?? 'q' });
          if (!moved) return false;
          optimisticMoveRef.current = {
            ply: game.history().length,
            from: moved.from,
            to: moved.to,
            prevFen: fenBefore,
            createdAt: Date.now(),
          };
          if (optimisticSyncTimerRef.current) {
            window.clearTimeout(optimisticSyncTimerRef.current);
          }
          optimisticSyncTimerRef.current = window.setTimeout(() => {
            optimisticSyncTimerRef.current = null;
            if (!optimisticMoveRef.current) return;
            const curWs = wsRef.current;
            if (curWs && curWs.readyState === WebSocket.OPEN) {
              try {
                curWs.send(JSON.stringify({ type: 'room:sync' }));
              } catch {
                // ignore
              }
            }
          }, 1500);
          setPendingBlunder(null);
          setCloudArrow(null);
          setFen(game.fen());
          setPgn(game.pgn());
          setHistory(game.history({ verbose: true }));
          setLastMove({
            from: moved.from,
            to: moved.to,
            san: moved.san,
            captured: Boolean(moved.captured) || moved.flags.includes('e'),
          });
          setHintSquares(null);
          setClockRunning(true);
          playMoveSound({
            capture: Boolean(moved.captured),
            check: game.inCheck(),
            castle: moved.flags.includes('k') || moved.flags.includes('q'),
          });
          const movePayload = {
            from: moved.from,
            to: moved.to,
            promotion: (moved.promotion ?? 'q') as PieceSymbol,
          };
          if (ws && ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(
                JSON.stringify({
                  type: 'move',
                  ...movePayload,
                }),
              );
            } catch {
              pendingWsMovesRef.current.push(movePayload);
            }
          } else {
            pendingWsMovesRef.current.push(movePayload);
          }
          return true;
        } catch {
          return false;
        }
      }

      // Online Lichess Board API: submit UCI move to Lichess server
      if (opponentType === 'online-lichess') {
        if (moverColor !== playerColor || !lichessToken || !onlineInfo.lichessGameId) return false;
        const probe = new Chess(fenBefore);
        try {
          const moved = probe.move({ from, to, promotion: promotion ?? 'q' });
          if (!moved) return false;
          const uci = `${moved.from}${moved.to}${moved.promotion ?? ''}`;
          // Optimistically show move while Lichess stream confirms
          game.move({ from, to, promotion: promotion ?? 'q' });
          setFen(game.fen());
          setPgn(game.pgn());
          setHistory(game.history({ verbose: true }));
          setLastMove({
            from: moved.from,
            to: moved.to,
            san: moved.san,
            captured: Boolean(moved.captured) || moved.flags.includes('e'),
          });
          playMoveSound({
            capture: Boolean(moved.captured),
            check: game.inCheck(),
            castle: moved.flags.includes('k') || moved.flags.includes('q'),
          });
          fetch(`/api/lichess/board/move/${encodeURIComponent(onlineInfo.lichessGameId)}/${uci}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${lichessToken}` },
          })
            .then(async (res) => {
              if (!res.ok) {
                // Revert if Lichess rejected the move without losing prior PGN history
                chessRef.current.undo();
                setFen(chessRef.current.fen());
                setPgn(chessRef.current.pgn());
                setHistory(chessRef.current.history({ verbose: true }));
              }
            })
            .catch(() => {});
          return true;
        } catch {
          return false;
        }
      }

      // Interactive Teaching Feedback + Guard in Play Coach mode
      if (isCoachMode && moverColor === playerColor) {
        const lesson = evaluateCoachStudentMove(
          fenBefore,
          from,
          to,
          promotion ?? 'q',
          game.history().length,
          activeCoach.id,
        );
        if (lesson) {
          setCoachFeedback(bypassGuard ? { ...lesson, shouldPause: false } : lesson);
          setCoachReplyNote(null);
          setCoachReplyMeta(null);
          setCoachMoveBadge({ square: to, quality: lesson.quality });
          if (!bypassGuard && coachGuard && lesson.shouldPause) {
            playErrorSound();
            setPendingBlunder({
              from,
              to,
              promotion,
              san: lesson.san,
              reason: lesson.tacticalWarning ?? lesson.explanation,
              bestSan: lesson.bestSan,
              bestFrom: lesson.bestFrom,
              bestTo: lesson.bestTo,
              cpLoss: lesson.cpLoss,
            });
            setHintSquares({ from: lesson.bestFrom, to: lesson.bestTo });
            return false;
          }
        }
      }

      // Instant Coach OpenChess Blunder Guard on every player turn (offline/bot games)
      if (
        !bypassGuard &&
        coachGuard &&
        opponentType === 'bot' &&
        moverColor === playerColor
      ) {
        const cached =
          bestEvalCacheRef.current?.fen === fenBefore
            ? bestEvalCacheRef.current
            : (() => {
                const freshBest = findBestMove(fenBefore, 2);
                if (!freshBest) return null;
                const entry = {
                  fen: fenBefore,
                  san: freshBest.move.san,
                  from: freshBest.move.from,
                  to: freshBest.move.to,
                  evalCp: freshBest.evalCp,
                };
                bestEvalCacheRef.current = entry;
                return entry;
              })();
        const guardHit = checkBlunderFast(
          fenBefore,
          from,
          to,
          promotion ?? 'q',
          cached,
        );
        if (guardHit?.isBlunder) {
          const probe = new Chess(fenBefore);
          const attempted = probe.move({ from, to, promotion: promotion ?? 'q' });
          if (attempted) {
            playErrorSound();
            setPendingBlunder({
              from,
              to,
              promotion,
              san: attempted.san,
              reason: guardHit.reason,
              bestSan: guardHit.bestSan,
              bestFrom: guardHit.bestFrom,
              bestTo: guardHit.bestTo,
              cpLoss: guardHit.cpLoss,
            });
            setHintSquares({ from: guardHit.bestFrom, to: guardHit.bestTo });
            return false;
          }
        }
      }

      try {
        const move = game.move({ from, to, promotion: promotion ?? 'q' });
        if (!move) return false;

        setPendingBlunder(null);
        setCloudArrow(null);
        setFen(game.fen());
        setPgn(game.pgn());
        setHistory(game.history({ verbose: true }));
        setLastMove({
          from: move.from,
          to: move.to,
          san: move.san,
          captured: Boolean(move.captured) || move.flags.includes('e'),
        });
        setHintSquares(null);
        setClockRunning(true);

        const nowMs = Date.now();
        const elapsedSinceAnchor = clockAnchorRef.current.running
          ? Math.max(0, nowMs - clockAnchorRef.current.syncedAtMs)
          : 0;
        const curWhiteMs =
          clockAnchorRef.current.turn === 'w'
            ? Math.max(0, clockAnchorRef.current.whiteMs - elapsedSinceAnchor)
            : clockAnchorRef.current.whiteMs;
        const curBlackMs =
          clockAnchorRef.current.turn === 'b'
            ? Math.max(0, clockAnchorRef.current.blackMs - elapsedSinceAnchor)
            : clockAnchorRef.current.blackMs;
        const incMs = tc.incrementSeconds > 0 ? tc.incrementSeconds * 1000 : 0;
        const nextWMs = move.color === 'w' ? curWhiteMs + incMs : curWhiteMs;
        const nextBMs = move.color === 'b' ? curBlackMs + incMs : curBlackMs;
        clockAnchorRef.current = {
          whiteMs: nextWMs,
          blackMs: nextBMs,
          syncedAtMs: nowMs,
          turn: game.turn(),
          running: !game.isGameOver(),
        };
        setWhiteClockMs(nextWMs);
        setBlackClockMs(nextBMs);

        playMoveSound({
          capture: Boolean(move.captured),
          check: game.inCheck(),
          castle: move.flags.includes('k') || move.flags.includes('q'),
        });

        checkEndConditions(game);
        return true;
      } catch {
        return false;
      }
    },
      [
      activeCoach.id,
      checkEndConditions,
      coachGuard,
      gameOverState,
      isCoachMode,
      lichessToken,
      onlineInfo.lichessGameId,
      onlineInfo.opponentConnected,
      opponentType,
      playerColor,
      tc.incrementSeconds,
      viewPly,
    ],
  );

  const applyMoveOnBoardRef = useRef(applyMoveOnBoard);
  applyMoveOnBoardRef.current = applyMoveOnBoard;
  const playerColorRef = useRef<Color>(playerColor);
  playerColorRef.current = playerColor;

  // Automatically execute the head of the queued premoves instantaneously (0ms) when it becomes the player's turn
  useEffect(() => {
    if (premoveQueue.length === 0 || gameOverState || viewPly !== null) return;
    if (liveChess.turn() !== playerColor) return;
    if (opponentType === 'online-ws' && !onlineInfo.opponentConnected) return;
    const [nextMove, ...restQueue] = premoveQueue;
    const timer = window.setTimeout(() => {
      const ok = applyMoveOnBoardRef.current(
        nextMove.from,
        nextMove.to,
        nextMove.promotion,
      );
      if (ok) {
        setPremoveQueue(restQueue);
      } else {
        setPremoveQueue([]);
        playErrorSound();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    gameOverState,
    liveChess,
    onlineInfo.opponentConnected,
    opponentType,
    playerColor,
    premoveQueue,
    viewPly,
  ]);

  // Cancel queued premoves quickly with Escape key
  useEffect(() => {
    if (premoveQueue.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPremoveQueue([]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [premoveQueue.length]);

  const startNewGame = useCallback(
    (nextColor?: Color, nextTc?: TimeControl, keepOnlineMode = false) => {
      if (botTimeoutRef.current) window.clearTimeout(botTimeoutRef.current);
      clearCoachMoveBadge();
      setPremoveQueue([]);
      pendingWsMovesRef.current = [];
      optimisticMoveRef.current = null;
      if (optimisticSyncTimerRef.current) {
        window.clearTimeout(optimisticSyncTimerRef.current);
        optimisticSyncTimerRef.current = null;
      }
      justJoinedWsRoomRef.current = false;
      everConnectedOpponentRef.current = false;
      if (!keepOnlineMode && (opponentType === 'online-ws' || opponentType === 'online-lichess')) {
        setOpponentType('bot');
        wsRef.current?.close();
        wsRef.current = null;
      }
      const chosenTc = nextTc ?? tc;
      const chosenColor = nextColor ?? playerColor;
      matchNonceRef.current = `match-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      matchStartedAtRef.current = Date.now();
      savedGameNonceRef.current = null;
      const fresh = new Chess();
      chessRef.current = fresh;
      setFen(fresh.fen());
      setPgn('');
      setHistory([]);
      setViewPly(null);
      setLastMove(null);
      setHintSquares(null);
      setCloudArrow(null);
      setPendingBlunder(null);
      setCoachFeedback(null);
      setCoachReplyNote(null);
      setCoachReplyMeta(null);
      setGameOverState(null);
      setClockRunning(false);
      setFlipped(false);
      const resetMs = chosenTc.initialSeconds * 1000;
      setWhiteClockMs(resetMs);
      setBlackClockMs(resetMs);
      clockAnchorRef.current = {
        whiteMs: resetMs,
        blackMs: resetMs,
        syncedAtMs: Date.now(),
        turn: 'w',
        running: false,
      };
      setPlayerColor(chosenColor);
      setMobileSheet('none');
    },
    [clearCoachMoveBadge, opponentType, playerColor, tc],
  );

  // Respond to Quick Play / New Game / Bots / Coach / Online presets
  useEffect(() => {
    if (!preset) return;
    const nextMode: PlayMode = preset.mode ?? 'bot';
    setOpponentType(nextMode);
    if (preset.botId) setBotId(preset.botId);
    if (preset.coachId) {
      setInternalCoachId(preset.coachId);
      saveSelectedCoachId(preset.coachId);
    }
    if (preset.coachStrength) {
      setCoachStrength(preset.coachStrength);
      saveSelectedCoachStrength(preset.coachStrength);
    }
    setBotElo(typeof preset.botElo === 'number' ? preset.botElo : null);
    setChatError(null);
    if (nextMode === 'online-ws' || nextMode === 'online-lichess') {
      setCoachGuard(false);
      setChatMessages([]);
      setUnreadChat(0);
      setRightTab('chat');
      setWsLatencyMs(null);
      const chosenInitColor: Color | undefined =
        preset.color === 'w' ? 'w' : preset.color === 'b' ? 'b' : undefined;
      const ownName = lichessUsername?.trim() || loadGuestPlayerName();
      const guestPerfs = loadGuestPerfs();
      const presetInitSec =
        typeof preset.matchedInitialSeconds === 'number'
          ? preset.matchedInitialSeconds
          : (TIME_CONTROLS.find((t) => t.id === preset.timeId)?.initialSeconds ?? tc.initialSeconds);
      const presetIncSec =
        typeof preset.matchedIncrementSeconds === 'number'
          ? preset.matchedIncrementSeconds
          : (TIME_CONTROLS.find((t) => t.id === preset.timeId)?.incrementSeconds ?? tc.incrementSeconds);
      const catName = formatOnlineTimeControl(presetInitSec, presetIncSec).category;
      const catKey: 'bullet' | 'blitz' | 'rapid' =
        catName === 'Bullet' ? 'bullet' : catName === 'Blitz' ? 'blitz' : 'rapid';
      const ownRating =
        (catKey === 'bullet'
          ? lichessPerfs?.bullet?.rating
          : catKey === 'blitz'
            ? lichessPerfs?.blitz?.rating
            : lichessPerfs?.rapid?.rating) ?? guestPerfs[catKey].rating;
      const isJoiningLive = nextMode === 'online-ws' && preset.wsAction === 'join';
      const resetOnline = {
        roomId: preset.wsRoomId ?? '',
        lichessGameId: preset.lichessGameId ?? '',
        opponentConnected: isJoiningLive,
        opponentStatus: (isJoiningLive ? 'active' : 'joining') as OpponentPresenceStatus,
        opponentGoneSeconds: null,
        bridgeLagMs: null,
        whiteName:
          chosenInitColor === 'w'
            ? ownName
            : nextMode === 'online-ws'
              ? 'Connecting...'
              : 'White',
        blackName:
          chosenInitColor === 'b'
            ? ownName
            : nextMode === 'online-ws'
              ? 'Connecting...'
              : 'Black',
        whiteRating: chosenInitColor === 'w' ? ownRating : undefined,
        blackRating: chosenInitColor === 'b' ? ownRating : undefined,
        whiteAvatarUrl: undefined,
        blackAvatarUrl: undefined,
        whiteFlag: undefined,
        blackFlag: undefined,
        whiteTitle: undefined,
        blackTitle: undefined,
        rated: preset.rated !== false,
        matchedClock:
          typeof preset.matchedInitialSeconds === 'number'
            ? {
                initialSeconds: preset.matchedInitialSeconds,
                incrementSeconds: preset.matchedIncrementSeconds ?? 0,
              }
            : undefined,
        serverSource: preset.serverSource,
        drawOfferBy: null,
        rematchOfferBy: null,
        error: null,
      };
      latestOnlineRef.current = resetOnline;
      setOnlineInfo(resetOnline);
      setOpponentTyping(false);
    } else {
      setChatMessages([]);
      setUnreadChat(0);
      setWsLatencyMs(null);
      if (nextMode === 'coach') {
        setRightTab('tutor');
        setCoachGuard(preset.coachGuard ?? false);
      } else {
        setRightTab('moves');
        if (typeof preset.coachGuard === 'boolean') {
          setCoachGuard(preset.coachGuard);
        }
      }
    }
    const presetMatchedTc =
      typeof preset.matchedInitialSeconds === 'number'
        ? {
            id: formatOnlineTimeControl(
              preset.matchedInitialSeconds,
              preset.matchedIncrementSeconds ?? 0,
            ).id,
            label: formatOnlineTimeControl(
              preset.matchedInitialSeconds,
              preset.matchedIncrementSeconds ?? 0,
            ).label,
            category: formatOnlineTimeControl(
              preset.matchedInitialSeconds,
              preset.matchedIncrementSeconds ?? 0,
            ).category,
            initialSeconds: preset.matchedInitialSeconds,
            incrementSeconds: preset.matchedIncrementSeconds ?? 0,
          }
        : null;
    const chosenTc =
      (preset.timeId ? TIME_CONTROLS.find((t) => t.id === preset.timeId) : undefined) ??
      presetMatchedTc ??
      tc;
    if (TIME_CONTROLS.some((t) => t.id === chosenTc.id)) {
      setTimeControlId(chosenTc.id);
    }
    const chosenColor: Color =
      preset.color === 'random'
        ? Math.random() < 0.5
          ? 'w'
          : 'b'
        : preset.color ?? 'w';
    startNewGame(chosenColor, chosenTc, nextMode === 'online-ws' || nextMode === 'online-lichess');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset?.nonce]);

  const gameOverStateRef = useRef(gameOverState);
  gameOverStateRef.current = gameOverState;

  useEffect(() => {
    const active = !gameOverState && (isOnlineMode || history.length > 0);
    onActiveGameChange?.(active);
  }, [gameOverState, history.length, isOnlineMode, onActiveGameChange]);

  useEffect(() => {
    return () => {
      onActiveGameChange?.(false);
    };
  }, [onActiveGameChange]);

  // Connect live WebSocket room when in online-ws mode with keepalive & auto-reconnect
  useEffect(() => {
    if (opponentType !== 'online-ws') {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    let disposed = false;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let isReconnect = false;
    let reconnectAttempts = 0;
    let lastPongAt = Date.now();
    everConnectedOpponentRef.current = false;
    setWsConnectionState('connecting');

    const connectSocket = () => {
      if (disposed) return;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const existing = wsRef.current;
      if (
        existing &&
        (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/chess`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        reconnectAttempts = 0;
        lastPongAt = Date.now();
        setWsConnectionState('connected');

        if (pingTimer) window.clearInterval(pingTimer);
        try {
          ws.send(JSON.stringify({ type: 'ping', clientTs: Date.now() }));
        } catch {
          // ignore
        }
        pingTimer = window.setInterval(() => {
          if (ws.readyState !== WebSocket.OPEN) return;
          if (Date.now() - lastPongAt > 36_000) {
            setWsConnectionState('reconnecting');
            try {
              ws.close();
            } catch {
              // ignore
            }
            return;
          }
          try {
            ws.send(JSON.stringify({ type: 'ping', clientTs: Date.now() }));
          } catch {
            // ignore
          }
        }, 10_000);

        const currentRoomId = latestOnlineRef.current.roomId || preset?.wsRoomId;
        const action =
          isReconnect && currentRoomId
            ? 'join'
            : (preset?.wsAction ?? (preset?.wsRoomId ? 'join' : 'create'));
        const avatarUrl = loadUserAvatar(lichessUsername) || undefined;
        const flag = lichessFlag || undefined;
        const guestPerfs = loadGuestPerfs();
        const cat: 'bullet' | 'blitz' | 'rapid' =
          tc.category === 'Bullet' ? 'bullet' : tc.category === 'Blitz' ? 'blitz' : 'rapid';
        const playerElo =
          (cat === 'bullet'
            ? lichessPerfs?.bullet?.rating
            : cat === 'blitz'
              ? lichessPerfs?.blitz?.rating
              : lichessPerfs?.rapid?.rating) ?? guestPerfs[cat].rating;

        const resolvedPlayerName = lichessUsername?.trim() || loadGuestPlayerName();
        if (action === 'join' && currentRoomId) {
          justJoinedWsRoomRef.current = pendingWsMovesRef.current.length === 0;
          const preferredSide = isReconnect
            ? playerColorRef.current
            : preset?.color === 'w' || preset?.color === 'b'
              ? preset.color
              : undefined;
          ws.send(
            JSON.stringify({
              type: 'join_room',
              token: lichessToken || undefined,
              roomId: currentRoomId,
              preferredColor: preferredSide,
              name: resolvedPlayerName,
              rating: playerElo,
              playerElo,
              avatarUrl,
              flag,
            }),
          );
          if (pendingWsMovesRef.current.length > 0) {
            const queued = pendingWsMovesRef.current.splice(0, pendingWsMovesRef.current.length);
            for (const qm of queued) {
              try {
                ws.send(JSON.stringify({ type: 'move', ...qm }));
              } catch {
                // ignore
              }
            }
          }
        } else {
          ws.send(
            JSON.stringify({
              type: 'create_room',
              token: lichessToken || undefined,
              roomId: currentRoomId || undefined,
              name: resolvedPlayerName,
              rating: playerElo,
              playerElo,
              avatarUrl,
              flag,
              initialSeconds: tc.initialSeconds,
              incrementSeconds: tc.incrementSeconds,
              rated: preset?.rated !== false,
              color: preset?.color === 'b' ? 'b' : preset?.color === 'w' ? 'w' : 'random',
            }),
          );
        }
      };

      ws.onmessage = (event) => {
        lastPongAt = Date.now();
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.type === 'pong') {
            if (typeof msg.clientTs === 'number') {
              setWsLatencyMs(Math.max(1, Date.now() - msg.clientTs));
            }
            return;
          }
          if (msg.type === 'move:rejected') {
            pendingWsMovesRef.current = [];
            optimisticMoveRef.current = null;
            if (optimisticSyncTimerRef.current) {
              window.clearTimeout(optimisticSyncTimerRef.current);
              optimisticSyncTimerRef.current = null;
            }
            setPremoveQueue([]);
            playErrorSound();
            if (typeof msg.fen === 'string') {
              try {
                const reverted = new Chess(msg.fen);
                chessRef.current = reverted;
                setFen(reverted.fen());
                setPgn(reverted.pgn());
                setHistory(reverted.history({ verbose: true }));
              } catch {
                // room:state follows immediately from server
              }
            }
            return;
          }
          if (msg.type === 'room:error') {
            setOnlineInfo((prev) => ({ ...prev, error: String(msg.error || 'Room error') }));
            return;
          }
          if (msg.type === 'room:state') {
            const myColor: Color = msg.yourColor === 'b' ? 'b' : 'w';
            setPlayerColor(myColor);
            playerColorRef.current = myColor;
            if (msg.opponentConnected) {
              everConnectedOpponentRef.current = true;
            }
            const rebuilt = new Chess();
            if (typeof msg.pgn === 'string' && msg.pgn.trim()) {
              try {
                rebuilt.loadPgn(msg.pgn);
              } catch {
                rebuilt.load(msg.fen);
              }
            } else if (typeof msg.fen === 'string') {
              rebuilt.load(msg.fen);
            }

            const prevLen = chessRef.current.history().length;
            const nextHistory = rebuilt.history({ verbose: true });
            const latestMove = nextHistory[nextHistory.length - 1];
            const opt = optimisticMoveRef.current;
            const forceAuthoritativeSync = Boolean(
              justJoinedWsRoomRef.current &&
                pendingWsMovesRef.current.length === 0 &&
                (!opt || Date.now() - opt.createdAt > 1500 || nextHistory.length >= opt.ply),
            );
            justJoinedWsRoomRef.current = false;
            const matchedOptimistic = Boolean(
              opt &&
                nextHistory.length === opt.ply &&
                msg.lastMove?.from === opt.from &&
                msg.lastMove?.to === opt.to,
            );
            const isStalePreOptimisticState = Boolean(
              !forceAuthoritativeSync &&
                opt &&
                !msg.winner &&
                !matchedOptimistic &&
                nextHistory.length === opt.ply - 1 &&
                rebuilt.fen() === opt.prevFen &&
                Date.now() - opt.createdAt <= 1800,
            );
            if (!isStalePreOptimisticState) {
              chessRef.current = rebuilt;
              if (
                forceAuthoritativeSync ||
                matchedOptimistic ||
                Boolean(msg.winner) ||
                (opt && nextHistory.length >= opt.ply) ||
                (opt && Date.now() - opt.createdAt > 1800)
              ) {
                optimisticMoveRef.current = null;
                if (optimisticSyncTimerRef.current) {
                  window.clearTimeout(optimisticSyncTimerRef.current);
                  optimisticSyncTimerRef.current = null;
                }
              }
              setFen(rebuilt.fen());
              setPgn(rebuilt.pgn());
              setHistory(nextHistory);
              if (msg.lastMove) {
                setLastMove(msg.lastMove);
                if (nextHistory.length > prevLen && !matchedOptimistic) {
                  playMoveSound({
                    capture: Boolean(msg.lastMove.captured),
                    check: rebuilt.inCheck(),
                    castle: Boolean(latestMove && (latestMove.flags.includes('k') || latestMove.flags.includes('q'))),
                  });
                }
              }
            }
            const nextMatchedClock =
              typeof msg.initialSeconds === 'number'
                ? {
                    initialSeconds: msg.initialSeconds,
                    incrementSeconds: typeof msg.incrementSeconds === 'number' ? msg.incrementSeconds : 0,
                  }
                : latestOnlineRef.current.matchedClock;
            if (typeof msg.initialSeconds === 'number') {
              const matchedTc = TIME_CONTROLS.find(
                (item) =>
                  item.initialSeconds === msg.initialSeconds &&
                  item.incrementSeconds === (msg.incrementSeconds ?? 0),
              );
              if (matchedTc) setTimeControlId(matchedTc.id);
            }
            const rawWhiteClockMs = Math.max(
              0,
              typeof msg.whiteClockMs === 'number' ? msg.whiteClockMs : tc.initialSeconds * 1000,
            );
            const rawBlackClockMs = Math.max(
              0,
              typeof msg.blackClockMs === 'number' ? msg.blackClockMs : tc.initialSeconds * 1000,
            );
            const isClockActive = Boolean(
              msg.opponentConnected && !msg.winner && nextHistory.length > 0,
            );
            const activeTurnAfter = rebuilt.turn();
            const oneWayCompMs =
              isClockActive && typeof msg.serverTimeMs === 'number'
                ? Math.min(250, Math.max(0, (wsLatencyMsRef.current ?? 0) / 2))
                : 0;
            const syncedWhiteMs =
              activeTurnAfter === 'w' ? Math.max(0, rawWhiteClockMs - oneWayCompMs) : rawWhiteClockMs;
            const syncedBlackMs =
              activeTurnAfter === 'b' ? Math.max(0, rawBlackClockMs - oneWayCompMs) : rawBlackClockMs;
            clockAnchorRef.current = {
              whiteMs: syncedWhiteMs,
              blackMs: syncedBlackMs,
              syncedAtMs: Date.now(),
              turn: activeTurnAfter,
              running: isClockActive,
            };
            setWhiteClockMs(syncedWhiteMs);
            setBlackClockMs(syncedBlackMs);
            setClockRunning(isClockActive);
            const guestPerfs = loadGuestPerfs();
            const stateCat = formatOnlineTimeControl(
              typeof msg.initialSeconds === 'number' ? msg.initialSeconds : tc.initialSeconds,
              typeof msg.incrementSeconds === 'number' ? msg.incrementSeconds : tc.incrementSeconds,
            ).category;
            const stateCatKey: 'bullet' | 'blitz' | 'rapid' =
              stateCat === 'Bullet' ? 'bullet' : stateCat === 'Blitz' ? 'blitz' : 'rapid';
            const fallbackOwnRating =
              (stateCatKey === 'bullet'
                ? lichessPerfs?.bullet?.rating
                : stateCatKey === 'blitz'
                  ? lichessPerfs?.blitz?.rating
                  : lichessPerfs?.rapid?.rating) ?? guestPerfs[stateCatKey].rating;
            const resolvedPresenceStatus: OpponentPresenceStatus =
              msg.opponentStatus === 'joining' ||
              msg.opponentStatus === 'active' ||
              msg.opponentStatus === 'disconnected'
                ? msg.opponentStatus
                : msg.opponentConnected
                  ? 'active'
                  : everConnectedOpponentRef.current
                    ? 'disconnected'
                    : 'joining';
            const nextOnline = {
              ...latestOnlineRef.current,
              roomId: msg.roomId || latestOnlineRef.current.roomId,
              opponentConnected: Boolean(msg.opponentConnected),
              opponentStatus: resolvedPresenceStatus,
              opponentGoneSeconds:
                typeof msg.opponentGoneSeconds === 'number' ? msg.opponentGoneSeconds : null,
              bridgeLagMs: typeof msg.bridgeLagMs === 'number' ? msg.bridgeLagMs : null,
              whiteName: msg.whiteName || (msg.opponentConnected ? 'Guest Opponent' : 'Connecting...'),
              blackName: msg.blackName || (msg.opponentConnected ? 'Guest Opponent' : 'Connecting...'),
              whiteRating:
                typeof msg.whiteRating === 'number'
                  ? msg.whiteRating
                  : myColor === 'w'
                    ? fallbackOwnRating
                    : undefined,
              blackRating:
                typeof msg.blackRating === 'number'
                  ? msg.blackRating
                  : myColor === 'b'
                    ? fallbackOwnRating
                    : undefined,
              whiteAvatarUrl:
                typeof msg.whiteAvatarUrl === 'string' ? msg.whiteAvatarUrl : undefined,
              blackAvatarUrl:
                typeof msg.blackAvatarUrl === 'string' ? msg.blackAvatarUrl : undefined,
              whiteFlag:
                typeof msg.whiteFlag === 'string' ? msg.whiteFlag : undefined,
              blackFlag:
                typeof msg.blackFlag === 'string' ? msg.blackFlag : undefined,
              whiteTitle:
                typeof msg.whiteTitle === 'string' ? msg.whiteTitle : undefined,
              blackTitle:
                typeof msg.blackTitle === 'string' ? msg.blackTitle : undefined,
              rated: typeof msg.rated === 'boolean' ? msg.rated : latestOnlineRef.current.rated,
              matchedClock: nextMatchedClock,
              serverSource:
                typeof msg.serverSource === 'string'
                  ? (msg.serverSource as ChessServerName)
                  : latestOnlineRef.current.serverSource,
              drawOfferBy: msg.drawOfferBy ?? null,
              rematchOfferBy: msg.rematchOfferBy ?? null,
              error: null,
            };
            latestOnlineRef.current = nextOnline;
            setOnlineInfo(nextOnline);

            if (Array.isArray(msg.chatMessages)) {
              const incoming = msg.chatMessages as OnlineChatMessage[];
              setChatMessages((prev) => {
                if (
                  incoming.length > prev.length &&
                  rightTabRef.current !== 'chat' &&
                  mobileSheetRef.current !== 'chat'
                ) {
                  const added = incoming.slice(prev.length).filter((m) => m.color !== myColor);
                  if (added.length > 0) {
                    setUnreadChat((u) => u + added.length);
                  }
                }
                return incoming;
              });
            }

            if (msg.winner && !gameOverStateRef.current) {
              const cleanEndReason = stripPlatformFromText(String(msg.endReason || ''));
              const isAborted =
                Boolean(msg.aborted) ||
                msg.winner === 'aborted' ||
                /abort|before (?:the )?(?:game started|first move)/i.test(cleanEndReason);
              if (isAborted) {
                finishGame(
                  'Game Aborted',
                  cleanEndReason || 'Game aborted before starting.',
                  null,
                  '*',
                );
              } else {
                const won = msg.winner === 'draw' ? null : msg.winner === myColor;
                const label = msg.winner === 'w' ? '1-0' : msg.winner === 'b' ? '0-1' : '1/2-1/2';
                const title =
                  msg.winner === 'draw'
                    ? 'Draw'
                    : `${msg.winner === 'w' ? 'White' : 'Black'} Wins`;
                finishGame(title, cleanEndReason || 'Online match ended.', won, label);
              }
            }
          } else if (msg.type === 'chat:typing') {
            setOpponentTyping(true);
            if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
            typingTimerRef.current = window.setTimeout(() => {
              setOpponentTyping(false);
            }, 2200);
          } else if (msg.type === 'rematch:started' && msg.roomId) {
            onLaunchRoom?.({
              roomId: String(msg.roomId),
              timeId: typeof msg.timeId === 'string' ? msg.timeId : tc.id,
              color: msg.yourColor === 'b' ? 'b' : 'w',
            });
          }
        } catch {
          // ignore invalid json
        }
      };

      ws.onerror = () => {
        // Handled by onclose auto-reconnect
      };

      ws.onclose = () => {
        if (pingTimer) {
          window.clearInterval(pingTimer);
          pingTimer = null;
        }
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        if (disposed) return;
        isReconnect = true;
        setWsConnectionState('reconnecting');
        const delay = Math.min(4000, 900 * Math.pow(1.4, reconnectAttempts));
        reconnectAttempts += 1;
        reconnectTimer = window.setTimeout(() => {
          connectSocket();
        }, delay);
      };
    };

    const handleWakeOrOnline = () => {
      if (disposed || document.visibilityState === 'hidden') return;
      const cur = wsRef.current;
      if (!cur || cur.readyState === WebSocket.CLOSED || cur.readyState === WebSocket.CLOSING) {
        isReconnect = true;
        connectSocket();
      } else if (cur.readyState === WebSocket.OPEN) {
        try {
          cur.send(JSON.stringify({ type: 'ping', clientTs: Date.now() }));
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('online', handleWakeOrOnline);
    document.addEventListener('visibilitychange', handleWakeOrOnline);
    connectSocket();

    return () => {
      disposed = true;
      window.removeEventListener('online', handleWakeOrOnline);
      document.removeEventListener('visibilitychange', handleWakeOrOnline);
      if (pingTimer) window.clearInterval(pingTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (optimisticSyncTimerRef.current) {
        window.clearTimeout(optimisticSyncTimerRef.current);
        optimisticSyncTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentType, preset?.nonce]);

  // Subscribe to Lichess Board API SSE stream when in online-lichess mode
  useEffect(() => {
    if (opponentType !== 'online-lichess' || !onlineInfo.lichessGameId || !lichessToken) return;
    const controller = new AbortController();
    let initialFen = 'startpos';
    let myColor: Color = 'w';
    let finished = false;

    const handleStatusEnd = (status?: string, winner?: string) => {
      if (finished || !status) return;
      const ended = ['mate', 'resign', 'stalemate', 'timeout', 'draw', 'outoftime', 'aborted', 'cheat', 'noStart'].includes(status);
      if (!ended) return;
      finished = true;
      const won =
        winner === 'white'
          ? myColor === 'w'
          : winner === 'black'
            ? myColor === 'b'
            : null;
      const isAborted = status === 'aborted' || status === 'noStart';
      const resultLabel = isAborted
        ? '*'
        : winner === 'white'
          ? '1-0'
          : winner === 'black'
            ? '0-1'
            : '1/2-1/2';
      const title =
        winner === 'white'
          ? 'White Wins'
          : winner === 'black'
            ? 'Black Wins'
            : isAborted
              ? 'Game Aborted'
              : 'Draw';
      finishGame(
        title,
        isAborted ? 'Game aborted before starting.' : `Online game ended (${status}).`,
        won,
        resultLabel,
      );
    };

    const run = async () => {
      try {
        const res = await fetch(
          `/api/lichess/board/stream/${encodeURIComponent(onlineInfo.lichessGameId)}`,
          {
            headers: { Authorization: `Bearer ${lichessToken}` },
            signal: controller.signal,
          },
        );
        if (!res.ok || !res.body) {
          setOnlineInfo((prev) => ({ ...prev, error: `Online game stream failed (${res.status}).` }));
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            const dataLine = frame
              .split('\n')
              .find((l) => l.startsWith('data:'))
              ?.slice(5)
              .trim();
            if (!dataLine) continue;
            try {
              const ev = JSON.parse(dataLine);
              if (ev.type === 'gameFull') {
                initialFen = ev.initialFen || 'startpos';
                const wName = ev.white?.user?.name || ev.white?.name || ev.white?.id || 'White';
                const bName = ev.black?.user?.name || ev.black?.name || ev.black?.id || 'Black';
                const lowerUser = lichessUsername?.toLowerCase();
                if (
                  lowerUser &&
                  (ev.black?.name?.toLowerCase() === lowerUser ||
                    ev.black?.id?.toLowerCase() === lowerUser)
                ) {
                  myColor = 'b';
                } else {
                  myColor = 'w';
                }
                setPlayerColor(myColor);
                const clockInit =
                  typeof ev.clock?.initial === 'number'
                    ? ev.clock.initial
                    : latestOnlineRef.current.matchedClock?.initialSeconds;
                const clockInc =
                  typeof ev.clock?.increment === 'number'
                    ? ev.clock.increment
                    : (latestOnlineRef.current.matchedClock?.incrementSeconds ?? 0);
                  const nextOnline = {
                    ...latestOnlineRef.current,
                    opponentConnected: true,
                    opponentStatus: 'active' as OpponentPresenceStatus,
                    opponentGoneSeconds: null,
                    whiteName: wName,
                    blackName: bName,
                    whiteRating: ev.white?.rating,
                    blackRating: ev.black?.rating,
                    rated: typeof ev.rated === 'boolean' ? ev.rated : latestOnlineRef.current.rated,
                    serverSource: 'Lichess' as ChessServerName,
                    matchedClock:
                      typeof clockInit === 'number'
                        ? { initialSeconds: clockInit, incrementSeconds: clockInc }
                        : latestOnlineRef.current.matchedClock,
                    error: null,
                  };
                  latestOnlineRef.current = nextOnline;
                  setOnlineInfo(nextOnline);

                  const st = ev.state;
                  if (st) {
                    const parsed = parseUciMovesToGameState(st.moves || '', initialFen);
                    const rebuilt = new Chess(initialFen === 'startpos' ? undefined : initialFen);
                    if (parsed.pgn) {
                      try {
                        rebuilt.loadPgn(parsed.pgn);
                      } catch {
                        rebuilt.load(parsed.fen);
                      }
                    }
                    chessRef.current = rebuilt;
                    setFen(rebuilt.fen());
                    setPgn(rebuilt.pgn());
                    setHistory(rebuilt.history({ verbose: true }));
                    setLastMove(parsed.lastMove);
                    const wMs = typeof st.wtime === 'number' ? Math.max(0, st.wtime) : clockAnchorRef.current.whiteMs;
                    const bMs = typeof st.btime === 'number' ? Math.max(0, st.btime) : clockAnchorRef.current.blackMs;
                    const isRun = st.status === 'started' && parsed.plyCount > 0;
                    clockAnchorRef.current = {
                      whiteMs: wMs,
                      blackMs: bMs,
                      syncedAtMs: Date.now(),
                      turn: rebuilt.turn(),
                      running: isRun,
                    };
                    setWhiteClockMs(wMs);
                    setBlackClockMs(bMs);
                    setClockRunning(isRun);
                    handleStatusEnd(st.status, st.winner);
                  }
              } else if (ev.type === 'gameState') {
                const parsed = parseUciMovesToGameState(ev.moves || '', initialFen);
                const prevLen = chessRef.current.history().length;
                const rebuilt = new Chess(initialFen === 'startpos' ? undefined : initialFen);
                if (parsed.pgn) {
                  try {
                    rebuilt.loadPgn(parsed.pgn);
                  } catch {
                    rebuilt.load(parsed.fen);
                  }
                }
                chessRef.current = rebuilt;
                setFen(rebuilt.fen());
                setPgn(rebuilt.pgn());
                setHistory(rebuilt.history({ verbose: true }));
                setLastMove(parsed.lastMove);
                if (parsed.plyCount > prevLen && parsed.lastMove) {
                  playMoveSound({
                    capture: Boolean(parsed.lastMove.captured),
                    check: rebuilt.inCheck(),
                    castle: false,
                  });
                }
                const wMs = typeof ev.wtime === 'number' ? Math.max(0, ev.wtime) : clockAnchorRef.current.whiteMs;
                const bMs = typeof ev.btime === 'number' ? Math.max(0, ev.btime) : clockAnchorRef.current.blackMs;
                const isRun = ev.status === 'started' && parsed.plyCount > 0;
                clockAnchorRef.current = {
                  whiteMs: wMs,
                  blackMs: bMs,
                  syncedAtMs: Date.now(),
                  turn: rebuilt.turn(),
                  running: isRun,
                };
                setWhiteClockMs(wMs);
                setBlackClockMs(bMs);
                setClockRunning(isRun);
                setOnlineInfo((prev) => ({
                  ...prev,
                  opponentConnected: true,
                  opponentStatus: 'active',
                  drawOfferBy: ev.wdraw ? 'w' : ev.bdraw ? 'b' : null,
                }));
                handleStatusEnd(ev.status, ev.winner);
              } else if (ev.type === 'chatLine' && typeof ev.text === 'string') {
                const lineText = ev.text.trim();
                const senderName = String(ev.username || 'Opponent');
                const isSelf =
                  Boolean(lichessUsername) &&
                  senderName.toLowerCase() === lichessUsername?.toLowerCase();
                if (lineText && senderName.toLowerCase() !== 'lichess') {
                  setChatMessages((prev) => [
                    ...prev.slice(-58),
                    {
                      id: `l-${Date.now()}-${prev.length}`,
                      sender: senderName,
                      color: isSelf ? myColor : myColor === 'w' ? 'b' : 'w',
                      text: lineText,
                      timestamp: Date.now(),
                    },
                  ]);
                  if (!isSelf && rightTabRef.current !== 'chat' && mobileSheetRef.current !== 'chat') {
                    setUnreadChat((u) => u + 1);
                  }
                }
              }
            } catch {
              // ignore unparseable frame
            }
          }
        }
      } catch {
        // aborted
      }
    };

    void run();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentType, onlineInfo.lichessGameId, lichessToken]);

  // Automatic Bot / Coach response (local engine + fast Stockfish 17 NNUE for 1300–3200 ELO)
  useEffect(() => {
    if (!isBotOrCoach || gameOverState) return;
    if (liveChess.isGameOver()) return;
    if (liveChess.turn() === playerColor) return;

    let cancelled = false;
    const useStockfish = effectiveBotElo >= 1650;
    const sfDepth =
      effectiveBotElo >= 2600
        ? 18
        : effectiveBotElo >= 2250
          ? 13
          : effectiveBotElo >= 1950
            ? 9
            : 6;

    const recordCoachExplanation = (
      fenBeforeReply: string,
      fromSq: string,
      toSq: string,
      promo?: PieceSymbol,
    ) => {
      if (!isCoachMode) return;
      try {
        const probe = new Chess(fenBeforeReply);
        const replyMove = probe.move({ from: fromSq, to: toSq, promotion: promo ?? 'q' });
        if (replyMove) {
          const coachEval = evaluateCoachStudentMove(
            fenBeforeReply,
            fromSq,
            toSq,
            promo ?? 'q',
            liveChess.history().length,
            activeCoach.id,
          );
          const quality = coachEval?.quality ?? 'Best';
          const note = explainCoachReplyMove(
            fenBeforeReply,
            replyMove,
            liveChess.history().length,
            activeCoach.id,
          );
          setCoachMoveBadge({
            square: toSq,
            quality,
          });
          setCoachReplyNote(note);
          setCoachReplyMeta({
            san: replyMove.san,
            quality,
            note,
          });
        }
      } catch {
        // ignore probe error
      }
    };

    botTimeoutRef.current = window.setTimeout(async () => {
      if (cancelled) return;
      if (useStockfish) {
        // 1. Run Client-Side Stockfish 19 NNUE Multi-PV directly in the browser (calibrated depth & PV selection)
        const clientSf19 = await analyzeClientStockfish19Nnue(
          fen,
          sfDepth >= 16 ? 19 : sfDepth,
          5,
        );
        if (!cancelled && clientSf19.available && clientSf19.lines.length > 0) {
          const picked =
            pickCalibratedEngineLine(clientSf19.lines, effectiveBotElo, Math.random) ??
            clientSf19.lines[0];
          const chosenFrom = picked?.firstMoveFrom;
          const chosenTo = picked?.firstMoveTo;

          if (chosenFrom && chosenTo) {
            recordCoachExplanation(fen, chosenFrom, chosenTo);
            const applied = applyMoveOnBoard(chosenFrom, chosenTo);
            if (applied) return;
          }
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 2200);
        try {
          const res = await fetch('/api/engine/move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, depth: sfDepth }),
            signal: controller.signal,
          });
          window.clearTimeout(timer);
          if (!cancelled && res.ok) {
            const data = await res.json();
            const lines: Array<{
              evalCp: number;
              firstMoveFrom: string;
              firstMoveTo: string;
            }> = Array.isArray(data.lines) ? data.lines : [];

            const picked =
              lines.length > 0
                ? pickCalibratedEngineLine(lines, effectiveBotElo, Math.random)
                : null;
            const chosenFrom: string | undefined = picked?.firstMoveFrom ?? data.bestMoveFrom;
            const chosenTo: string | undefined = picked?.firstMoveTo ?? data.bestMoveTo;

            if (chosenFrom && chosenTo) {
              recordCoachExplanation(fen, chosenFrom, chosenTo);
              const applied = applyMoveOnBoard(chosenFrom, chosenTo);
              if (applied) return;
            }
          }
        } catch {
          window.clearTimeout(timer);
        }
      }

      if (cancelled) return;
      const botMove = chooseBotMove(
        fen,
        isCoachMode ? activeCoach.id : botId,
        Math.random,
        effectiveBotElo,
      );
      if (botMove) {
        recordCoachExplanation(fen, botMove.from, botMove.to, botMove.promotion);
        applyMoveOnBoard(botMove.from, botMove.to, botMove.promotion);
      }
    }, 320);

    return () => {
      cancelled = true;
      if (botTimeoutRef.current) {
        window.clearTimeout(botTimeoutRef.current);
      }
    };
  }, [activeCoach.id, applyMoveOnBoard, botId, effectiveBotElo, fen, gameOverState, isBotOrCoach, isCoachMode, liveChess, playerColor]);

  // Smooth 100ms server-anchored clock interpolation with tenths display under 20s
  useEffect(() => {
    if (!clockRunning || gameOverState) return;
    clockAnchorRef.current = {
      ...clockAnchorRef.current,
      turn: liveChess.turn(),
      running: true,
    };
    const interval = window.setInterval(() => {
      const anchor = clockAnchorRef.current;
      const computed = computeLiveInterpolatedClockMs({
        baseWhiteClockMs: anchor.whiteMs,
        baseBlackClockMs: anchor.blackMs,
        syncedAtMs: anchor.syncedAtMs,
        nowMs: Date.now(),
        turn: liveChess.turn(),
        running: anchor.running,
      });
      setWhiteClockMs(computed.whiteMs);
      setBlackClockMs(computed.blackMs);
      if (!isOnlineMode) {
        if (liveChess.turn() === 'w' && computed.whiteMs <= 0) {
          const playerWon = isBotOrCoach ? playerColor === 'b' : null;
          finishGame('Black Wins on Time', 'White clock reached 0:00', playerWon, '0-1');
        } else if (liveChess.turn() === 'b' && computed.blackMs <= 0) {
          const playerWon = isBotOrCoach ? playerColor === 'w' : null;
          finishGame('White Wins on Time', 'Black clock reached 0:00', playerWon, '1-0');
        }
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [clockRunning, finishGame, gameOverState, isBotOrCoach, isOnlineMode, liveChess, playerColor]);

  useEffect(() => {
    document.body.dataset.state = gameOverState ? 'gameover' : 'playing';
  }, [gameOverState]);

  const handleTakeback = () => {
    if (isOnlineMode || gameOverState || history.length === 0) return;
    const stepsBack = isBotOrCoach && history.length >= 2 ? 2 : 1;
    const targetHistory = history.slice(0, history.length - stepsBack);
    const rebuilt = new Chess();
    for (const m of targetHistory) {
      rebuilt.move(m.san);
    }
    chessRef.current = rebuilt;
    setFen(rebuilt.fen());
    setPgn(rebuilt.pgn());
    setHistory(rebuilt.history({ verbose: true }));
    setViewPly(null);
    setHintSquares(null);
    setCoachFeedback(null);
    setCoachReplyNote(null);
    setCoachReplyMeta(null);
    clearCoachMoveBadge();
    setPremoveQueue([]);
    const last = targetHistory[targetHistory.length - 1];
    setLastMove(
      last
        ? {
            from: last.from,
            to: last.to,
            san: last.san,
            captured: Boolean(last.captured) || last.flags.includes('e'),
          }
        : null,
    );
  };

  const handleHint = async () => {
    if (isOnlineMode || gameOverState || viewPly !== null || hintLoading) return;
    const targetFen = fen;

    const cachedHint = hintCacheRef.current.get(targetFen);
    if (cachedHint) {
      setHintSquares({ from: cachedHint.from, to: cachedHint.to });
      setHintSan(cachedHint.san);
      return;
    }

    hintAbortRef.current?.abort();
    const controller = new AbortController();
    hintAbortRef.current = controller;
    setHintLoading(true);

    // 1. Run Client-Side Stockfish 19 NNUE directly in the browser for zero-latency hint
    const clientSf19 = computeClientStockfish19NnueMultiPv(targetFen, 19, 3, 220);
    const clientBestLine = clientSf19.lines[0];
    const clientHint: HintCandidate | null =
      clientBestLine?.firstMoveFrom && clientBestLine?.firstMoveTo
        ? {
            from: clientBestLine.firstMoveFrom,
            to: clientBestLine.firstMoveTo,
            san: clientBestLine.firstMoveSan,
          }
        : null;

    const cachedLocal =
      bestEvalCacheRef.current?.fen === targetFen
        ? {
            from: bestEvalCacheRef.current.from,
            to: bestEvalCacheRef.current.to,
            san: bestEvalCacheRef.current.san,
          }
        : null;
    const localFallback =
      clientHint ??
      cachedLocal ??
      (() => {
        const localBest = findBestMove(targetFen, 3);
        return localBest
          ? {
              from: localBest.move.from,
              to: localBest.move.to,
              san: localBest.move.san,
            }
          : null;
      })();

    const chosen = resolveSingleHintMove(
      targetFen,
      chessRef.current.fen(),
      clientHint,
      localFallback,
    );

    setHintLoading(false);
    if (chosen) {
      hintCacheRef.current.set(targetFen, chosen);
      setHintSquares({ from: chosen.from, to: chosen.to });
      setHintSan(chosen.san || null);
      if (chosen.san) setBestSuggestion(chosen.san);
    }
  };

  const handleResign = () => {
    if (gameOverState) return;
    if (opponentType === 'online-ws') {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resign' }));
      }
      return;
    }
    if (opponentType === 'online-lichess' && lichessToken && onlineInfo.lichessGameId) {
      const action = history.length < 2 ? 'abort' : 'resign';
      void fetch(`/api/lichess/board/${action}/${encodeURIComponent(onlineInfo.lichessGameId)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${lichessToken}` },
      });
      return;
    }
    const resigningSide: Color =
      isBotOrCoach ? playerColor : liveChess.turn();
    const winnerName = resigningSide === 'w' ? 'Black' : 'White';
    finishGame(
      `${winnerName} Wins by Resignation`,
      `${resigningSide === 'w' ? 'White' : 'Black'} resigned the game.`,
      isBotOrCoach ? false : null,
      resigningSide === 'w' ? '0-1' : '1-0',
    );
  };

  const handleOfferOrRespondDraw = (accept?: boolean) => {
    if (gameOverState) return;
    if (opponentType === 'online-ws' && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (onlineInfo.drawOfferBy && onlineInfo.drawOfferBy !== playerColor) {
        wsRef.current.send(JSON.stringify({ type: accept ? 'accept_draw' : 'decline_draw' }));
      } else {
        wsRef.current.send(JSON.stringify({ type: 'offer_draw' }));
      }
    } else if (opponentType === 'online-lichess' && lichessToken && onlineInfo.lichessGameId) {
      const yesNo = accept === false ? 'no' : 'yes';
      void fetch(`/api/lichess/board/draw/${encodeURIComponent(onlineInfo.lichessGameId)}/${yesNo}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${lichessToken}` },
      });
    }
  };

  const handleRematchAction = (action: 'offer' | 'accept' | 'decline') => {
    if (opponentType !== 'online-ws' || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    wsRef.current.send(JSON.stringify({ type: `rematch:${action}` }));
  };

  const handleClaimAbandonment = () => {
    if (gameOverState || opponentType !== 'online-ws') return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'claim_abandonment' }));
    }
  };

  const emitTypingIndicator = () => {
    if (opponentType !== 'online-ws' || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1200) return;
    lastTypingSentRef.current = now;
    wsRef.current.send(JSON.stringify({ type: 'chat:typing' }));
  };

  const handleSendChat = (overrideText?: string) => {
    const clean = (overrideText ?? chatInput).trim().slice(0, 240);
    if (!clean) return;
    setChatError(null);
    if (!overrideText) setChatInput('');

    if (opponentType === 'online-ws') {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'chat', text: clean }));
      } else {
        setChatError('Connecting to match room — please try sending again in a moment.');
      }
      return;
    }

    if (opponentType === 'online-lichess' && lichessToken && onlineInfo.lichessGameId) {
      setChatMessages((prev) => [
        ...prev.slice(-58),
        {
          id: `me-${Date.now()}`,
          sender: lichessUsername ?? 'You',
          color: playerColor,
          text: clean,
          timestamp: Date.now(),
        },
      ]);
      void fetch(`/api/lichess/board/chat/${encodeURIComponent(onlineInfo.lichessGameId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lichessToken}`,
        },
        body: JSON.stringify({ text: clean }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            setChatError(d.error || 'Could not deliver chat message to this board.');
          }
        })
        .catch(() => {
          setChatError('Network error while sending chat message.');
        });
    }
  };

  const requestLeaveGame = () => {
    if (!gameOverState && (isOnlineMode || history.length > 0)) {
      setMobileSheet('none');
      setLeaveConfirmOpen(true);
      return;
    }
    onBack?.();
  };

  const confirmLeaveGame = () => {
    setLeaveConfirmOpen(false);
    if (opponentType === 'online-ws' && wsRef.current) {
      if (!gameOverState && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: history.length === 0 ? 'leave_room' : 'resign',
          }),
        );
      }
      wsRef.current.close();
      wsRef.current = null;
    } else if (
      opponentType === 'online-lichess' &&
      !gameOverState &&
      lichessToken &&
      onlineInfo.lichessGameId
    ) {
      const action = history.length < 2 ? 'abort' : 'resign';
      void fetch(`/api/lichess/board/${action}/${encodeURIComponent(onlineInfo.lichessGameId)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${lichessToken}` },
      });
    }
    onBack?.();
  };

  const movePairs = useMemo(() => {
    const pairs: { moveNumber: number; white?: Move; black?: Move; whitePly: number; blackPly: number }[] = [];
    for (let i = 0; i < history.length; i += 2) {
      pairs.push({
        moveNumber: i / 2 + 1,
        white: history[i],
        black: history[i + 1],
        whitePly: i + 1,
        blackPly: i + 2,
      });
    }
    return pairs;
  }, [history]);

  // Live 1-line Coach OpenChess situational prompt (fair-play hidden during online rated/live games)
  const coachStatusLine = useMemo(() => {
    if (gameOverState) {
      return gameOverState.resultLabel === '*'
        ? `${gameOverState.title}.`
        : `${gameOverState.title}. Tap Review!`;
    }
    if (opponentType === 'online-ws') {
      if (onlineInfo.error) return onlineInfo.error;
      if (wsConnectionState === 'reconnecting') return 'Reconnecting to live match server...';
      if (onlineInfo.opponentStatus === 'disconnected' || !onlineInfo.opponentConnected) {
        if (onlineInfo.opponentStatus === 'disconnected' || everConnectedOpponentRef.current || history.length > 0) {
          return typeof onlineInfo.opponentGoneSeconds === 'number' && onlineInfo.opponentGoneSeconds > 0
            ? `Opponent offline · Reconnecting (${onlineInfo.opponentGoneSeconds}s)`
            : 'Opponent offline — you can claim win or wait for reconnect.';
        }
        if (wsConnectionState === 'connecting' || preset?.wsAction === 'join' || onlineInfo.opponentStatus === 'joining') {
          return onlineInfo.roomId && preset?.wsAction === 'create'
            ? 'Share room code or invite link above to start.'
            : `${effectiveTc.category} (${effectiveTc.label}) · Syncing opponent...`;
        }
        return 'Share room code or invite link above to start.';
      }
      if (onlineInfo.drawOfferBy && onlineInfo.drawOfferBy !== playerColor) {
        return 'Opponent offered a draw.';
      }
      return liveChess.turn() === playerColor
        ? `${effectiveTc.category} (${effectiveTc.label}) · Your move`
        : `${effectiveTc.category} (${effectiveTc.label}) · Opponent thinking...`;
    }
    if (opponentType === 'online-lichess') {
      if (onlineInfo.error) return onlineInfo.error;
      return liveChess.turn() === playerColor
        ? `${effectiveTc.category} (${effectiveTc.label}) · Your move`
        : `${effectiveTc.category} (${effectiveTc.label}) · Opponent thinking...`;
    }
    if (pendingBlunder) return `Coach paused ${pendingBlunder.san} — review this move.`;
    if (liveChess.inCheck()) return 'King in check! Escape, block, or capture.';
    if (hintLoading) return 'Calculating strongest move...';
    if (hintSan && hintSquares) return `Engine Hint: Try ${hintSan}`;
    if (history.length === 0) {
      return isCoachMode
        ? 'Play your opening move — Coach OpenChess will review every turn live.'
        : 'Tap or drag a piece to start.';
    }
    if (isBotOrCoach && liveChess.turn() !== playerColor) {
      return `${activeOpponentName} is thinking...`;
    }
    return 'Your move · Check checks, captures, and threats.';
  }, [
    activeOpponentName,
    effectiveTc.category,
    effectiveTc.label,
    gameOverState,
    hintLoading,
    hintSan,
    hintSquares,
    history.length,
    isBotOrCoach,
    isCoachMode,
    liveChess,
    onlineInfo.drawOfferBy,
    onlineInfo.error,
    onlineInfo.opponentConnected,
    onlineInfo.opponentGoneSeconds,
    onlineInfo.opponentStatus,
    onlineInfo.roomId,
    opponentType,
    pendingBlunder,
    playerColor,
    preset?.wsAction,
    wsConnectionState,
  ]);

  const topColor: Color = orientation === 'w' ? 'b' : 'w';
  const bottomColor: Color = orientation;

  const renderPlayerStrip = (side: Color, position: 'top' | 'bottom') => {
    const isBotSide = isBotOrCoach && side !== playerColor;
    const isSelfSide = side === playerColor;
    const isTurn = !gameOverState && liveChess.turn() === side;
    const sideMs = side === 'w' ? whiteClockMs : blackClockMs;
    const capturedPieces =
      side === 'w' ? material.whiteCaptured : material.blackCaptured;
    const adv =
      side === 'w' ? material.advantage : -material.advantage;

    const sideName =
      side === 'w' ? onlineInfo.whiteName : onlineInfo.blackName;
    const sideRating =
      side === 'w' ? onlineInfo.whiteRating : onlineInfo.blackRating;
    const sideFlag = countryCodeToFlagEmoji(
      side === 'w'
        ? onlineInfo.whiteFlag ?? (playerColor === 'w' ? lichessFlag ?? undefined : undefined)
        : onlineInfo.blackFlag ?? (playerColor === 'b' ? lichessFlag ?? undefined : undefined),
    );
    const sideTitle = side === 'w' ? onlineInfo.whiteTitle : onlineInfo.blackTitle;
    const sideAvatarUrl =
      (side === 'w' ? onlineInfo.whiteAvatarUrl : onlineInfo.blackAvatarUrl) ||
      (side === playerColor ? loadUserAvatar(lichessUsername) : undefined);

    const formattedPlayer = formatOnlinePlayerDisplay({
      name: sideName,
      rating: sideRating,
      connected: isSelfSide || onlineInfo.opponentConnected,
      isSelf: isSelfSide,
    });
    const onlineLabel = formattedPlayer.ratingBadge
      ? `${formattedPlayer.displayName} ${formattedPlayer.ratingBadge}`
      : formattedPlayer.displayName;
    const isClickableOnlinePlayer =
      isOnlineMode &&
      Boolean(onOpenPlayerProfile) &&
      !isPlaceholderPlayerUsername(sideName) &&
      /^[a-zA-Z0-9_-]{2,30}$/.test(sideName);

    const presenceMeta =
      isOnlineMode && !isSelfSide && !gameOverState
        ? formatOpponentPresenceText({
            status: onlineInfo.opponentStatus,
            goneSeconds: onlineInfo.opponentGoneSeconds,
            isOpponentTurn: isTurn && onlineInfo.opponentConnected,
            moveCount: history.length,
          })
        : null;
    const signalMeta = isOnlineMode
      ? resolveOnlineSignalQuality(
          isSelfSide ? wsLatencyMs : (onlineInfo.bridgeLagMs ?? wsLatencyMs),
          isSelfSide ? wsConnectionState === 'connected' : onlineInfo.opponentConnected,
        )
      : null;
    const canClaimOfflineAbandonment =
      opponentType === 'online-ws' &&
      !isSelfSide &&
      !gameOverState &&
      onlineInfo.opponentStatus === 'disconnected';

    const playerIdentityContent = (
      <>
        {isBotSide ? (
          <div className="w-[38px] h-[38px] rounded-[3px] bg-[#262421] overflow-hidden flex items-center justify-center text-[11px] font-bold text-[#F2F0EC] shrink-0">
            <BotAvatar id={isCoachMode ? activeCoach.id : activeBot.id} />
          </div>
        ) : (
          <PlayerAvatar
            username={
              isOnlineMode
                ? formattedPlayer.displayName
                : opponentType === 'local'
                  ? side === 'w'
                    ? 'White'
                    : 'Black'
                  : lichessUsername || 'You'
            }
            isCurrentUser={
              isOnlineMode
                ? isSelfSide
                : opponentType !== 'local' && isSelfSide
            }
            avatarUrl={
              isOnlineMode
                ? sideAvatarUrl
                : opponentType !== 'local' && isSelfSide
                  ? loadUserAvatar(lichessUsername)
                  : undefined
            }
            size={38}
            rounded="rounded-[3px]"
          />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {isOnlineMode && sideTitle && (
              <span className="px-1 py-0.5 rounded bg-[#B8860B] text-[9px] font-extrabold text-white shrink-0">
                {sideTitle}
              </span>
            )}
            <span className="text-xs sm:text-sm font-semibold text-[#F2F0EC] truncate max-w-[130px] sm:max-w-[200px]">
              {isBotSide
                ? activeOpponentName
                : isOnlineMode
                  ? formattedPlayer.displayName
                  : opponentType === 'local'
                    ? side === 'w'
                      ? 'White'
                      : 'Black'
                    : 'You'}
            </span>
            {(isBotSide || (isOnlineMode && formattedPlayer.ratingBadge)) && (
              <span
                data-testid="player-rating-badge"
                className="text-xs sm:text-sm font-mono font-semibold text-[#B8B4AC] shrink-0 tabular-nums"
              >
                {isBotSide ? `(${effectiveBotElo})` : formattedPlayer.ratingBadge}
              </span>
            )}
            {isOnlineMode && sideFlag && (
              <span className="text-xs leading-none shrink-0" aria-hidden="true">
                {sideFlag}
              </span>
            )}
            {presenceMeta ? (
              <span
                data-testid="opponent-presence-badge"
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                  presenceMeta.tone === 'bad'
                    ? 'bg-[#5C2320] text-[#F5B8B0]'
                    : presenceMeta.tone === 'warn'
                      ? 'bg-[#3D3118] text-[#F7C045]'
                      : 'bg-[#2C3622] text-[#AEE076]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    presenceMeta.tone === 'bad'
                      ? 'bg-[#E06C5A] animate-pulse'
                      : presenceMeta.tone === 'warn'
                        ? 'bg-[#F7C045] animate-pulse'
                        : isTurn
                          ? 'bg-[#81B64C] animate-pulse'
                          : 'bg-[#81B64C]'
                  }`}
                />
                <span>{presenceMeta.label}</span>
              </span>
            ) : (
              isTurn && (
                <span className="text-[11px] font-medium text-[#81B64C] whitespace-nowrap">
                  · Turn
                </span>
              )
            )}
            {signalMeta && (
              <span
                title={`Connection: ${signalMeta.label} (${signalMeta.lagText})`}
                aria-label={`Connection ${signalMeta.label}`}
                className="inline-flex items-end gap-[1.5px] h-3 shrink-0 ml-0.5"
              >
                {[1, 2, 3, 4].map((barIdx) => (
                  <span
                    key={barIdx}
                    style={{
                      height: `${barIdx * 2.5 + 2}px`,
                      backgroundColor:
                        barIdx <= signalMeta.bars ? signalMeta.color : 'rgba(255,255,255,0.16)',
                    }}
                    className="w-[2.5px] rounded-[1px]"
                  />
                ))}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 min-h-[14px]">
            {capturedPieces.slice(0, 10).map((piece, idx) => (
              <div key={`${position}-${piece}-${idx}`} className="w-3 h-3">
                <ChessPiece
                  type={piece}
                  color={side === 'w' ? 'b' : 'w'}
                />
              </div>
            ))}
            {adv > 0 && (
              <span className="text-[10px] font-mono text-[#B8B4AC] tabular-nums ml-1">
                +{adv}
              </span>
            )}
          </div>
        </div>
      </>
    );

    return (
      <div
        data-testid={`player-strip-${position}`}
        data-side={side}
        className="flex items-center justify-between gap-2 py-1 px-1"
      >
        {isClickableOnlinePlayer ? (
          <button
            type="button"
            onClick={() => onOpenPlayerProfile?.(sideName)}
            className="flex items-center gap-2 min-w-0 text-left cursor-pointer hover:opacity-90"
          >
            {playerIdentityContent}
          </button>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            {playerIdentityContent}
          </div>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          {canClaimOfflineAbandonment && (
            <button
              type="button"
              onClick={handleClaimAbandonment}
              className="px-2.5 py-1 rounded-md bg-[#81B64C] hover:bg-[#8EC556] text-[#191815] text-xs font-extrabold cursor-pointer whitespace-nowrap shadow-sm"
            >
              {history.length >= 2 ? 'Claim Win' : 'Abort Game'}
            </button>
          )}
          <div
            data-testid={`clock-${side}`}
            className={`min-w-[106px] sm:min-w-[122px] h-[36px] sm:h-[40px] px-3 rounded-[4px] font-mono text-[18px] sm:text-[21px] font-bold tabular-nums shrink-0 flex items-center justify-between gap-2 transition-colors ${
              isTurn
                ? sideMs <= 20_000
                  ? 'bg-[#B33430] text-white'
                  : 'bg-[#FFFFFF] text-[#262421]'
                : side === 'w'
                  ? 'bg-[#9E9D9B] text-[#262421]'
                  : 'bg-[#262421] text-[#8B8985]'
            }`}
          >
            <Clock
              className={`w-4 h-4 shrink-0 ${
                isTurn
                  ? sideMs <= 20_000
                    ? 'text-white'
                    : 'text-[#262421]'
                  : side === 'w'
                    ? 'text-[#3C3A36]'
                    : 'text-[#6D6961]'
              }`}
            />
            <span>{formatHighPrecisionClock(sideMs)}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderSetupForm = () => (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="p-3 space-y-2.5 overflow-y-auto flex-1">
        <div>
          <div className="text-xs font-semibold text-[#B8B4AC] mb-1.5">
            Opponent Mode
          </div>
          <div className="grid grid-cols-3 gap-1 p-1 bg-[#1A1917] rounded-md">
            <button
              type="button"
              onClick={() => {
                setOpponentType('coach');
                setRightTab('tutor');
                setCoachGuard(false);
                startNewGame();
              }}
              className={`min-h-[40px] py-1.5 px-2 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                isCoachMode
                  ? 'bg-[#312E2A] text-[#AEE076]'
                  : 'text-[#9E998F] hover:text-[#F2F0EC]'
              }`}
            >
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Play Coach</span>
            </button>
            <button
              type="button"
              onClick={() => setOpponentType('bot')}
              className={`min-h-[40px] py-1.5 px-2 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                opponentType === 'bot'
                  ? 'bg-[#312E2A] text-[#F2F0EC]'
                  : 'text-[#9E998F] hover:text-[#F2F0EC]'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Bot</span>
            </button>
            <button
              type="button"
              onClick={() => setOpponentType('local')}
              className={`min-h-[40px] py-1.5 px-2 rounded text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                opponentType === 'local'
                  ? 'bg-[#312E2A] text-[#F2F0EC]'
                  : 'text-[#9E998F] hover:text-[#F2F0EC]'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Pass &amp; Play</span>
            </button>
          </div>
        </div>

        {isCoachMode && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-[#B8B4AC]">
                Active Coach
              </div>
              <button
                type="button"
                onClick={() => setCoachPickerOpen(true)}
                className="text-[11px] font-bold text-[#81B64C] hover:underline cursor-pointer"
              >
                All Coaches →
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {COACH_PROFILES.map((coach) => {
                const selected = coach.id === activeCoach.id;
                return (
                  <button
                    key={coach.id}
                    type="button"
                    onClick={() => {
                      setInternalCoachId(coach.id);
                      saveSelectedCoachId(coach.id);
                      onCoachChange?.(coach.id);
                    }}
                    className={`p-2 rounded-lg text-left transition-colors flex items-center gap-2 cursor-pointer ${
                      selected
                        ? 'bg-[#363B2F] ring-1 ring-[#81B64C]'
                        : 'bg-[#1A1917] hover:bg-[#2B2925]'
                    }`}
                  >
                    <BotAvatar id={coach.id} size={32} />
                    <div className="min-w-0">
                      <div className="text-[11px] font-extrabold text-white truncate">
                        {coach.name}
                      </div>
                      <div className="text-[10px] text-[#9E998F] truncate">
                        {coach.specialty}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="text-xs font-semibold text-[#B8B4AC]">
              Coach Teaching Strength
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {COACH_STRENGTH_LEVELS.map((lvl) => {
                const selected = lvl.id === coachStrength;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => {
                      setCoachStrength(lvl.id);
                      saveSelectedCoachStrength(lvl.id);
                      startNewGame();
                    }}
                    className={`p-2 rounded border text-left transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#312E2A] border-[#81B64C]'
                        : 'bg-[#1A1917] border-white/8 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-[#F2F0EC]">{lvl.label}</span>
                      <span className="font-mono text-[11px] font-bold text-[#81B64C] tabular-nums">
                        {lvl.elo}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#9E998F] line-clamp-1 mt-0.5">
                      {lvl.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {opponentType === 'bot' && (
          <div className="space-y-2">
            <div className="p-2.5 rounded border border-white/10 bg-[#1A1917] space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#B8B4AC]">Bot Elo</span>
                <span className="font-mono font-bold text-[#F7C045] tabular-nums">
                  {effectiveBotElo}
                </span>
              </div>
              <input
                type="range"
                aria-label="Bot Elo strength"
                min={MIN_BOT_ELO}
                max={MAX_BOT_ELO}
                step={25}
                value={effectiveBotElo}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setBotElo(val);
                  setBotId(getNearestBotForElo(val).id);
                }}
                className="w-full accent-[#81B64C] cursor-pointer"
              />
              <div className="flex items-center justify-between text-[10px] font-mono text-[#8E8980] tabular-nums">
                <span>{MIN_BOT_ELO}</span>
                <span>{MAX_BOT_ELO}</span>
              </div>
            </div>

            <div className="text-xs font-semibold text-[#B8B4AC]">
              Select Sparring Bot
            </div>
            <div className="space-y-1">
              {BOT_PROFILES.map((bot) => {
                const selected = bot.id === botId;
                return (
                  <button
                    key={bot.id}
                    type="button"
                    onClick={() => {
                      setBotId(bot.id);
                      setBotElo(bot.rating);
                      startNewGame();
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border text-left transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#312E2A] border-[#81B64C]/70'
                        : 'bg-[#1A1917] border-white/8 hover:border-white/20'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#F2F0EC]">
                          {bot.name}
                        </span>
                        <span className="text-[11px] text-[#9E998F]">· {bot.title}</span>
                      </div>
                      <p className="text-[11px] text-[#9E998F] truncate">
                        {bot.style}
                      </p>
                    </div>
                    <span className="font-mono text-xs font-bold text-[#E59A28] tabular-nums shrink-0">
                      {bot.rating}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <div className="text-xs font-semibold text-[#B8B4AC] mb-1.5">
            Time Control
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {TIME_CONTROLS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTimeControlId(item.id);
                  startNewGame(undefined, item);
                }}
                className={`min-h-[44px] py-1.5 px-1.5 rounded border text-center transition-colors cursor-pointer ${
                  timeControlId === item.id
                    ? 'bg-[#312E2A] border-[#81B64C] text-[#F2F0EC]'
                    : 'bg-[#1A1917] border-white/8 text-[#B8B4AC] hover:text-white'
                }`}
              >
                <div className="text-xs font-mono font-bold tabular-nums">
                  {item.label}
                </div>
                <div className="text-[10px] text-[#8E8980]">{item.category}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-[#B8B4AC] mb-1.5">
            Play As
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => startNewGame('w')}
              className={`min-h-[40px] py-1.5 rounded border text-xs font-semibold cursor-pointer ${
                playerColor === 'w'
                  ? 'bg-[#EEEED2] text-[#1E1C19] border-[#EEEED2]'
                  : 'bg-[#1A1917] text-[#C8C4BC] border-white/10'
              }`}
            >
              White
            </button>
            <button
              type="button"
              onClick={() => startNewGame('b')}
              className={`min-h-[40px] py-1.5 rounded border text-xs font-semibold cursor-pointer ${
                playerColor === 'b'
                  ? 'bg-[#312E2A] text-[#F2F0EC] border-[#81B64C]'
                  : 'bg-[#1A1917] text-[#C8C4BC] border-white/10'
              }`}
            >
              Black
            </button>
            <button
              type="button"
              onClick={() => startNewGame(Math.random() < 0.5 ? 'w' : 'b')}
              className="min-h-[40px] py-1.5 rounded border border-white/10 bg-[#1A1917] hover:bg-[#2A2824] text-xs font-semibold text-[#C8C4BC] cursor-pointer"
            >
              Random
            </button>
          </div>
        </div>

        {isBotOrCoach && (
          <button
            type="button"
            onClick={() => setCoachGuard((g) => !g)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded border text-left transition-colors cursor-pointer ${
              coachGuard
                ? 'bg-[#81B64C]/12 border-[#81B64C]/50 text-[#F2F0EC]'
                : 'bg-[#1A1917] border-white/10 text-[#9E998F]'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck
                className={`w-4 h-4 shrink-0 ${coachGuard ? 'text-[#81B64C]' : 'text-[#736E66]'}`}
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold">
                  {isCoachMode ? 'Coach Teaching Pause' : 'Coach OpenChess Guard'}
                </div>
                <div className="text-[11px] text-[#9E998F] truncate">
                  {isCoachMode
                    ? 'Pause mistakes & suggest stronger alternatives'
                    : 'Instant warning before hanging pieces or mate'}
                </div>
              </div>
            </div>
            <span className="text-xs font-mono font-bold shrink-0">
              {coachGuard ? 'ON' : 'OFF'}
            </span>
          </button>
        )}
      </div>

      <div className="p-3.5 border-t border-white/10 bg-[#1A1917] space-y-2 shrink-0">
        {!isOnlineMode && (
          <button
            type="button"
            onClick={() => startNewGame()}
            className="w-full min-h-[48px] py-2.5 px-4 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-4 border-[#457524] active:border-b-0 active:translate-y-[2px] text-white font-extrabold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>New Game</span>
          </button>
        )}

        <div className={`hidden lg:grid ${isOnlineMode ? 'grid-cols-3' : 'grid-cols-4'} gap-1.5`}>
          {!isOnlineMode ? (
            <>
              <button
                type="button"
                onClick={() => void handleHint()}
                disabled={Boolean(gameOverState) || hintLoading}
                className="py-2 px-2 rounded bg-[#2B2925] hover:bg-[#383530] text-xs font-medium text-[#E8E5DF] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-45"
              >
                <Lightbulb className="w-3.5 h-3.5 text-[#E59A28]" />
                <span>{hintLoading ? 'Finding...' : 'Hint'}</span>
              </button>
              <button
                type="button"
                onClick={handleTakeback}
                disabled={Boolean(gameOverState) || history.length === 0}
                className="py-2 px-2 rounded bg-[#2B2925] hover:bg-[#383530] text-xs font-medium text-[#E8E5DF] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-45"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => handleOfferOrRespondDraw(true)}
              disabled={Boolean(gameOverState)}
              className="py-2 px-2 rounded bg-[#2B2925] hover:bg-[#383530] text-xs font-medium text-[#E8E5DF] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-45"
            >
              <Handshake className="w-3.5 h-3.5 text-[#81B64C]" />
              <span>{onlineInfo.drawOfferBy && onlineInfo.drawOfferBy !== playerColor ? 'Accept Draw' : 'Draw'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="py-2 px-2 rounded bg-[#2B2925] hover:bg-[#383530] text-xs font-medium text-[#E8E5DF] flex items-center justify-center gap-1 cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Flip</span>
          </button>
          <button
            type="button"
            onClick={handleResign}
            disabled={Boolean(gameOverState)}
            className="py-2 px-2 rounded bg-[#3B2320] hover:bg-[#4F2D28] text-xs font-medium text-[#F5B8B0] flex items-center justify-center gap-1 cursor-pointer disabled:opacity-45"
          >
            <Flag className="w-3.5 h-3.5" />
            <span>{opponentType === 'online-lichess' && history.length < 2 ? 'Abort' : 'Resign'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  const renderOnlineChat = () => (
    <div className="flex flex-col flex-1 min-h-[340px] max-h-[68vh] lg:max-h-none overflow-hidden">
      <div className="px-3 py-2 bg-[#1A1917] border-b border-white/[0.06] flex items-center justify-between gap-2 text-[11px] shrink-0">
        <span className="font-bold text-[#C8C4BC] truncate">
          {onlineInfo.opponentConnected
            ? `${onlineInfo.whiteName} vs ${onlineInfo.blackName}`
            : 'Waiting for opponent — chat is ready'}
        </span>
        <span
          className={`font-semibold shrink-0 tabular-nums ${
            onlineInfo.opponentConnected ? 'text-[#81B64C]' : 'text-[#E59A28]'
          }`}
        >
          {onlineInfo.opponentConnected
            ? wsLatencyMs !== null
              ? `Live · ${wsLatencyMs}ms`
              : 'Live'
            : 'Room Open'}
        </span>
      </div>

      <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {chatMessages.length === 0 ? (
          <div className="py-10 text-center text-xs text-[#9E998F] space-y-1">
            <MessageSquare className="w-6 h-6 text-[#81B64C] mx-auto opacity-80" />
            <p>Say hello or send a quick match message below.</p>
          </div>
        ) : (
          chatMessages.map((m) => {
            const mine = m.color === playerColor;
            const flag = countryCodeToFlagEmoji(m.senderFlag);
            return (
              <div
                key={m.id}
                className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <PlayerAvatar
                  username={m.sender}
                  avatarUrl={
                    m.senderAvatarUrl ||
                    (m.color === 'w' ? onlineInfo.whiteAvatarUrl : onlineInfo.blackAvatarUrl)
                  }
                  isCurrentUser={mine}
                  size={24}
                  rounded="rounded-md"
                />
                <div className={`flex flex-col max-w-[78%] ${mine ? 'items-end' : 'items-start'}`}>
                  <span className="text-[10px] text-[#8E8980] px-1 mb-0.5 flex items-center gap-1">
                    <span>{m.sender}</span>
                    {flag && <span>{flag}</span>}
                  </span>
                  <div
                    className={`rounded-xl px-3 py-2 text-xs leading-snug ${
                      mine
                        ? 'bg-[#81B64C] text-[#191815] font-semibold'
                        : 'bg-[#2B2926] text-[#F2F0EC] border border-white/10'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              </div>
            );
          })
        )}
        {opponentTyping && (
          <div className="text-[11px] italic text-[#9E998F] px-1">
            Opponent is typing...
          </div>
        )}
      </div>

      {/* Quick Chat Chips */}
      <div className="px-3 py-2 border-t border-white/10 bg-[#1A1917] space-y-2 shrink-0">
        {chatError && (
          <div className="px-2.5 py-1.5 rounded bg-[#5C2320] text-[11px] font-semibold text-[#F7C7C1]">
            {chatError}
          </div>
        )}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {['gl hf!', 'Nice move', 'Thanks', 'gg', 'Rematch?'].map((phrase) => (
            <button
              key={phrase}
              type="button"
              onClick={() => handleSendChat(phrase)}
              className="px-2.5 py-1 rounded-lg bg-[#2B2926] hover:bg-[#393734] border border-white/10 text-[11px] font-semibold text-[#DEDAD2] whitespace-nowrap cursor-pointer"
            >
              {phrase}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendChat();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => {
              setChatInput(e.target.value);
              emitTypingIndicator();
            }}
            placeholder="Message opponent..."
            aria-label="Chat message"
            className="flex-1 rounded-lg bg-[#262421] border border-white/10 px-3 py-2 text-xs text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C]"
          />
          <button
            type="submit"
            disabled={!chatInput.trim()}
            aria-label="Send chat message"
            className="px-3 py-2 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-[#191815] font-extrabold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );

  const renderOnlineOptions = () => (
    <div className="p-4 space-y-3">
      <div className="rounded-xl bg-[#262421] border border-white/10 p-3 flex items-center justify-between gap-2 text-xs">
        <div className="min-w-0">
          <div className="font-extrabold text-white truncate">
            {onlineInfo.whiteName} vs {onlineInfo.blackName}
          </div>
          <div className="text-[11px] text-[#9E998F] mt-0.5 tabular-nums">
            Live Match · {effectiveTc.label} ({effectiveTc.category})
            {onlineInfo.roomId ? ` · Room ${onlineInfo.roomId}` : ''}
            {wsLatencyMs !== null ? ` · ${wsLatencyMs} ms` : ''}
          </div>
        </div>
        {onlineInfo.roomId && (
          <button
            type="button"
            onClick={() => {
              const url = `${window.location.origin}/?room=${onlineInfo.roomId}`;
              navigator.clipboard?.writeText(url).catch(() => {});
              setCopiedInvite(true);
              window.setTimeout(() => setCopiedInvite(false), 1800);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-[#393734] hover:bg-[#43403C] text-[11px] font-bold text-[#81B64C] flex items-center gap-1 shrink-0 cursor-pointer"
          >
            {copiedInvite ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            <span>{copiedInvite ? 'Copied' : 'Copy Link'}</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setMobileSheet('none');
            handleOfferOrRespondDraw(true);
          }}
          disabled={Boolean(gameOverState)}
          className="min-h-[46px] px-3 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 text-xs font-bold text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
        >
          <Handshake className="w-4 h-4 text-[#81B64C]" />
          <span>
            {onlineInfo.drawOfferBy && onlineInfo.drawOfferBy !== playerColor
              ? 'Accept Draw'
              : 'Offer Draw'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setMobileSheet('none');
            handleResign();
          }}
          disabled={Boolean(gameOverState)}
          className="min-h-[46px] px-3 rounded-xl bg-[#3B2320] hover:bg-[#4F2D28] border border-[#E06C5A]/30 text-xs font-bold text-[#F5B8B0] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
        >
          <Flag className="w-4 h-4" />
          <span>{opponentType === 'online-lichess' && history.length < 2 ? 'Abort Game' : 'Resign'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setUnreadChat(0);
            setRightTab('chat');
            setMobileSheet('chat');
          }}
          className="min-h-[46px] px-3 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 text-xs font-bold text-white flex items-center justify-center gap-2 cursor-pointer"
        >
          <MessageSquare className="w-4 h-4 text-[#7FC4ED]" />
          <span>Match Chat</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setFlipped((f) => !f);
            setMobileSheet('none');
          }}
          className="min-h-[46px] px-3 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 text-xs font-bold text-white flex items-center justify-center gap-2 cursor-pointer"
        >
          <ArrowLeftRight className="w-4 h-4 text-[#E59A28]" />
          <span>Flip Board</span>
        </button>
      </div>

      {history.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setMobileSheet('none');
            onSendToReview(pgn, playerColor, gameOverState?.resultLabel ?? '*');
          }}
          className="w-full min-h-[44px] px-3 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 text-xs font-bold text-[#DEDAD2] flex items-center justify-center gap-2 cursor-pointer"
        >
          <SearchCheck className="w-4 h-4 text-[#81B64C]" />
          <span>Analyze in Game Review</span>
        </button>
      )}

      <button
        type="button"
        onClick={requestLeaveGame}
        className="w-full min-h-[46px] px-4 rounded-xl bg-[#262421] hover:bg-[#3B2320] border border-white/10 text-xs font-extrabold text-[#F5B8B0] flex items-center justify-center gap-2 cursor-pointer"
      >
        <LogOut className="w-4 h-4" />
        <span>Leave Game</span>
      </button>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_370px] xl:grid-cols-[minmax(0,1fr)_410px] gap-4 lg:gap-5 items-start">
      {/* Left/Center Arena */}
      <div className="flex justify-center">
        <div className="w-full max-w-[min(560px,100vw)] lg:max-w-[min(calc(100dvh-112px),750px)] lg:min-h-0 flex flex-col lg:justify-between pb-[118px] lg:pb-0">
          <div>
            {/* Chess.com Mobile Play Top Header (← · OpenChess · Options/Gear) */}
            <div className="lg:hidden flex items-center justify-between h-10 px-0.5 mb-1">
              <button
                type="button"
                onClick={requestLeaveGame}
                aria-label="Back"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#C8C4BC] hover:text-white cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-1.5">
                <svg viewBox="0 0 28 28" className="w-5 h-5 shrink-0" aria-hidden="true">
                  <circle cx="14" cy="8.5" r="3.4" fill="#81B64C" />
                  <path
                    d="M11 12.2c.8-.5 5.2-.5 6 0l-1.1 5.2c1.4 1 2.4 2.3 2.6 3.9H9.5c.2-1.6 1.2-2.9 2.6-3.9L11 12.2z"
                    fill="#81B64C"
                  />
                  <rect x="8" y="21.8" width="12" height="2.2" rx="1.1" fill="#81B64C" />
                </svg>
                <span className="text-base font-extrabold tracking-tight font-display text-white">
                  OpenChess
                </span>
              </div>

              <button
                type="button"
                onClick={() => setMobileSheet(isOnlineMode ? 'options' : 'setup')}
                aria-label="Game Options"
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#C8C4BC] hover:text-white cursor-pointer"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>

            {/* Live WebSocket Friend Room Invite Banner (pre-start only) */}
            {opponentType === 'online-ws' &&
              !onlineInfo.opponentConnected &&
              !gameOverState &&
              onlineInfo.roomId &&
              !everConnectedOpponentRef.current &&
              history.length === 0 &&
              wsConnectionState !== 'reconnecting' &&
              !(wsConnectionState === 'connecting' && preset?.wsAction === 'join') && (
              <div className="mb-1.5 px-3 py-2 rounded-xl bg-[#262421] border border-[#81B64C]/50 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Wifi className="w-4 h-4 shrink-0 text-[#81B64C]" />
                  <span className="text-[#DEDAD2] truncate">
                    Room <strong className="font-mono text-white tracking-wider">{onlineInfo.roomId}</strong> · Waiting for opponent
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const url = `${window.location.origin}/?room=${onlineInfo.roomId}`;
                    navigator.clipboard?.writeText(url).catch(() => {});
                    setCopiedInvite(true);
                    window.setTimeout(() => setCopiedInvite(false), 1800);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#81B64C] text-[#191815] font-extrabold text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  {copiedInvite ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedInvite ? 'Copied Link' : 'Copy Invite'}</span>
                </button>
              </div>
            )}

            {/* Incoming Draw Offer Banner */}
            {isOnlineMode && onlineInfo.drawOfferBy && onlineInfo.drawOfferBy !== playerColor && !gameOverState && (
              <div className="mb-1.5 px-3 py-2 rounded-xl bg-[#262421] border border-[#E59A28]/60 flex items-center justify-between gap-2 text-xs">
                <span className="text-white font-semibold">Opponent offered a draw</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleOfferOrRespondDraw(true)}
                    className="px-2.5 py-1 rounded-lg bg-[#81B64C] text-[#191815] font-extrabold text-[11px] cursor-pointer"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOfferOrRespondDraw(false)}
                    className="px-2.5 py-1 rounded-lg bg-[#383530] text-[#DEDAD2] font-bold text-[11px] cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}

            {/* Interactive Teaching Card / Blunder Guard / Speech Bubble */}
            {pendingBlunder ? (
              <div
                role="alert"
                className="animate-view-enter mb-1.5 p-2.5 rounded-xl bg-[#4A211B] border border-[#CA3431]/80 text-xs text-white space-y-2 shadow-md"
              >
                <div className="flex items-start gap-2">
                  <MoveBadge quality={coachFeedback?.quality ?? 'Blunder'} size="sm" />
                  <div className="min-w-0 flex-1 leading-snug">
                    <div className="font-extrabold text-[#FF9B91]">
                      {isCoachMode && coachFeedback
                        ? coachFeedback.headline
                        : `Guard paused ${pendingBlunder.san}`}
                    </div>
                    <p className="text-[#F8DAD6] mt-0.5">{pendingBlunder.reason}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const p = pendingBlunder;
                      setPendingBlunder(null);
                      setHintSquares(null);
                      applyMoveOnBoard(p.bestFrom, p.bestTo, undefined, true);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] border-b-2 border-[#457524] text-white text-[11px] font-extrabold cursor-pointer whitespace-nowrap"
                    title={`Play stronger move ${pendingBlunder.bestSan}`}
                  >
                    Play {pendingBlunder.bestSan}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingBlunder(null);
                      setHintSquares(null);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#383530] hover:bg-[#46423D] text-[#DEDAD2] text-[11px] font-bold cursor-pointer whitespace-nowrap"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const p = pendingBlunder;
                      setPendingBlunder(null);
                      setHintSquares(null);
                      applyMoveOnBoard(p.from, p.to, p.promotion, true);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#2B2925] hover:bg-[#383530] text-[#B8B4AC] text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Play Anyway
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const p = pendingBlunder;
                      setQueuedCoachPrompt({
                        id: Date.now(),
                        text: `Why was ${p.san} a mistake here and why is ${p.bestSan} stronger?`,
                      });
                      setRightTab('tutor');
                      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                        setMobileSheet('tutor');
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#1E1C19] border border-white/15 text-[#AEE076] text-[11px] font-bold cursor-pointer whitespace-nowrap ml-auto"
                  >
                    Ask Why?
                  </button>
                </div>
              </div>
            ) : isCoachMode ? (
              <div
                data-testid="coach-speech-panel"
                className="mb-2 flex items-start gap-2.5 sm:gap-3"
              >
                <button
                  type="button"
                  onClick={() => setCoachPickerOpen(true)}
                  title={`Change Coach (${activeCoach.name})`}
                  className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-[#1A1917] border-2 border-[#81B64C]/65 shrink-0 cursor-pointer hover:ring-2 hover:ring-[#81B64C] transition-shadow shadow-md mt-0.5"
                >
                  <BotAvatar id={activeCoach.id} />
                </button>
                <div className="relative flex-1 min-w-0 rounded-2xl bg-[#F4F1EA] text-[#1E1C19] px-3.5 py-2.5 shadow-md border border-[#DED8CC]">
                  {/* Chess.com-style speech bubble pointer tail toward Coach portrait */}
                  <span
                    aria-hidden="true"
                    className="absolute -left-[6px] top-4 w-3 h-3 rotate-45 bg-[#F4F1EA] border-l border-b border-[#DED8CC]"
                  />
                  <div className="relative z-10 flex items-center justify-between gap-2 mb-1">
                    <button
                      type="button"
                      onClick={() => setCoachPickerOpen(true)}
                      className="flex items-center gap-1.5 min-w-0 text-left cursor-pointer group"
                    >
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#5A554C]">
                        {activeCoach.title}
                      </span>
                      <span className="text-xs font-extrabold text-[#1E1C19] group-hover:text-[#457524] transition-colors truncate">
                        {activeCoach.name}
                      </span>
                    </button>
                    <select
                      aria-label="Coach strength"
                      value={coachStrength}
                      onChange={(e) => {
                        const next = e.target.value as CoachStrengthId;
                        setCoachStrength(next);
                        saveSelectedCoachStrength(next);
                      }}
                      className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-[#E7E2D8] border border-[#CEC7B8] text-[#2A2824] cursor-pointer focus:outline-none focus:border-[#457524] shrink-0"
                      title="Adjust Coach playing strength"
                    >
                      {COACH_STRENGTH_LEVELS.map((lvl) => (
                        <option key={lvl.id} value={lvl.id}>
                          {lvl.label} ({lvl.elo})
                        </option>
                      ))}
                    </select>
                  </div>

                  {coachReplyMeta ? (
                    <div className="relative z-10 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <MoveBadge quality={coachReplyMeta.quality} size="sm" />
                        <span className="text-[13px] font-extrabold text-[#1E1C19]">
                          {coachReplyMeta.san}
                        </span>
                        <span
                          className="text-[11px] font-extrabold"
                          style={{ color: MOVE_QUALITY_META[coachReplyMeta.quality].bg === '#F7C045' ? '#9B6B00' : MOVE_QUALITY_META[coachReplyMeta.quality].bg }}
                        >
                          · {coachReplyMeta.quality}
                        </span>
                      </div>
                      <p className="text-[12.5px] text-[#35322C] leading-snug font-medium">
                        {coachReplyMeta.note}
                      </p>
                      {coachFeedback &&
                        (coachFeedback.quality === 'Inaccuracy' ||
                          coachFeedback.quality === 'Mistake' ||
                          coachFeedback.quality === 'Blunder') &&
                        coachFeedback.bestSan !== coachFeedback.san && (
                          <div className="pt-0.5 flex items-center justify-between gap-2 text-[11px] text-[#635D53] border-t border-[#E1DBD0]">
                            <span>
                              Tip on <strong className="text-[#1E1C19]">{coachFeedback.san}</strong>:{' '}
                              <strong className="text-[#457524]">{coachFeedback.bestSan}</strong> was stronger.
                            </span>
                          </div>
                        )}
                    </div>
                  ) : coachFeedback ? (
                    <div className="relative z-10 space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <MoveBadge quality={coachFeedback.quality} size="sm" />
                          <span className="text-[13px] font-extrabold text-[#1E1C19]">
                            {coachFeedback.headline}
                          </span>
                        </div>
                        {coachFeedback.bestSan &&
                          coachFeedback.bestSan !== coachFeedback.san &&
                          (coachFeedback.quality === 'Inaccuracy' ||
                            coachFeedback.quality === 'Mistake' ||
                            coachFeedback.quality === 'Blunder') && (
                            <button
                              type="button"
                              onClick={() =>
                                setHintSquares({
                                  from: coachFeedback.bestFrom,
                                  to: coachFeedback.bestTo,
                                })
                              }
                              className="px-2 py-0.5 rounded-md bg-[#81B64C] hover:bg-[#72A53F] text-white text-[11px] font-extrabold cursor-pointer shrink-0"
                            >
                              Show {coachFeedback.bestSan}
                            </button>
                          )}
                      </div>
                      <p className="text-[12.5px] text-[#35322C] leading-snug font-medium">
                        {coachFeedback.explanation}
                      </p>
                    </div>
                  ) : (
                    <p className="relative z-10 text-[12.5px] text-[#35322C] leading-snug font-medium">
                      Make your move! I&apos;ll grade every turn directly on the board and talk you through ideas as we play.
                    </p>
                  )}
                </div>
              </div>
            ) : opponentType === 'bot' ? (
              <div className="lg:hidden flex items-center gap-2.5 px-1.5 py-2 mb-1">
                <div className="w-[54px] h-[54px] rounded-[6px] overflow-hidden bg-[#262421] shrink-0">
                  <BotAvatar id={activeBot.id} />
                </div>
                <div className="relative flex-1 min-w-0 cc-speech-bubble px-3.5 py-2.5 min-h-[52px] flex items-center">
                  <svg
                    viewBox="0 0 10 14"
                    className="w-2.5 h-3.5 absolute -left-2 top-1/2 -translate-y-1/2 text-white fill-current"
                    aria-hidden="true"
                  >
                    <path d="M10 0 L0 7 L10 14 Z" />
                  </svg>
                  <p className="text-[13.5px] font-semibold text-[#262421] leading-snug">
                    {history.length === 0
                      ? `Hi, I'm ${activeBot.name}! Let's play!`
                      : lastMove?.san?.startsWith('O-O')
                        ? 'Making your king safer, smart.'
                        : lastMove?.san?.includes('+')
                          ? 'Whoa, nice check! Let me find a way out.'
                          : lastMove?.captured
                            ? "Interesting exchange—I'll have to stay sharp!"
                            : history.length === 4
                              ? "Don't forget, you can use hints and takebacks during our game. Good luck!"
                              : liveChess.turn() !== playerColor
                                ? 'Hmm, let me think about this position...'
                                : [
                                    'Nice move! Let me see how to respond.',
                                    'Good development! Your turn.',
                                    'Interesting idea—keep up the pressure!',
                                    'Steady play! Watch the center squares.',
                                  ][history.length % 4]}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="lg:my-auto py-0.5 lg:py-1">
            <div className={opponentType === 'bot' ? 'hidden lg:block' : ''}>
              {renderPlayerStrip(topColor, 'top')}
            </div>

            {/* Edge-to-Edge Full-Width Chessboard on Mobile (Image 2 Reference) */}
            <div className="-mx-2.5 sm:mx-0 flex items-stretch gap-0 sm:gap-2.5">
              <div className="hidden sm:flex">
                {!isOnlineMode && (
                  <EvaluationBar evalCp={displayedEval} orientation={orientation} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <ChessBoard
                  fen={displayedFen}
                  orientation={orientation}
                  interactive={
                    !gameOverState &&
                    viewPly === null &&
                    (!isOnlineMode ||
                      onlineInfo.opponentConnected ||
                      (opponentType === 'online-ws' && everConnectedOpponentRef.current))
                  }
                  allowedColor={isBotOrCoach || isOnlineMode ? playerColor : 'both'}
                  lastMove={
                    viewPly === null
                      ? lastMove
                      : viewPly > 0
                        ? {
                            from: history[viewPly - 1].from,
                            to: history[viewPly - 1].to,
                          }
                        : null
                  }
                  lastMoveCapture={
                    viewPly === null
                      ? Boolean(lastMove?.captured)
                      : viewPly > 0
                        ? Boolean(history[viewPly - 1].captured) || history[viewPly - 1].flags.includes('e')
                        : false
                  }
                  hintSquares={isOnlineMode ? null : hintSquares}
                  moveBadge={
                    viewPly === null
                      ? pendingBlunder
                        ? { square: pendingBlunder.to, quality: coachFeedback?.quality ?? 'Blunder' }
                        : isCoachMode
                          ? coachMoveBadge
                          : null
                      : null
                  }
                  premoves={viewPly === null ? premoveQueue : []}
                  onPremove={(from, to, promo) => {
                    const promotion =
                      promo === 'q' || promo === 'r' || promo === 'b' || promo === 'n'
                        ? promo
                        : undefined;
                    playPremoveSound();
                    setPremoveQueue((prev) =>
                      enqueuePremoveMove(prev, { from, to, promotion }, 5),
                    );
                  }}
                  onClearPremove={() => setPremoveQueue([])}
                  bestMoveArrow={
                    cloudArrow ??
                    (!isOnlineMode && hintSquares?.from && hintSquares?.to
                      ? { from: hintSquares.from, to: hintSquares.to }
                      : null)
                  }
                  theme={boardTheme}
                  onMove={applyMoveOnBoard}
                />
              </div>
            </div>

            {premoveQueue.length > 0 && !gameOverState && (
              <div
                data-testid="premove-queue-bar"
                className="mt-1 px-2 py-1 rounded-lg bg-[#262421] border border-white/10 flex items-center justify-between gap-2 text-[11px]"
              >
                <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto">
                  <span className="font-extrabold text-[#E8C547] uppercase tracking-wider shrink-0">
                    Premoves ({premoveQueue.length}/5)
                  </span>
                  {premoveQueue.map((pm, idx) => (
                    <span
                      key={`${pm.from}-${pm.to}-${idx}`}
                      className="px-1.5 py-0.5 rounded bg-[#1A1917] border border-white/10 font-mono text-[#F2F0EC] whitespace-nowrap"
                    >
                      {idx + 1}. {pm.from}→{pm.to}
                      {pm.promotion ? `=${pm.promotion.toUpperCase()}` : ''}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPremoveQueue([])}
                  className="px-2 py-0.5 rounded bg-[#393734] hover:bg-[#46433E] text-[#DEDAD2] font-bold shrink-0 cursor-pointer"
                >
                  Clear
                </button>
              </div>
            )}

            <div className={opponentType === 'bot' ? 'hidden lg:block' : ''}>
              {renderPlayerStrip(bottomColor, 'bottom')}
            </div>
          </div>

          {/* Chess.com Mobile < 1. e4 > Horizontal Move Stepper */}
          <div
            data-testid="mobile-move-stepper"
            className="lg:hidden fixed bottom-14 left-0 right-0 z-20 h-11 bg-[#2B2926]/95 border-t border-white/5 flex items-center justify-between gap-2 px-2.5"
          >
            <button
              type="button"
              aria-label="Previous move"
              disabled={history.length === 0 || viewPly === 0}
              onClick={() =>
                setViewPly((p) => Math.max(0, (p ?? history.length) - 1))
              }
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[#C8C4BC] hover:text-white disabled:opacity-35 cursor-pointer shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div
              ref={mobileStepperScrollRef}
              className={`flex-1 flex items-center gap-2 overflow-x-auto font-mono text-xs tabular-nums min-h-[28px] no-scrollbar ${
                movePairs.length === 0
                  ? 'justify-center'
                  : 'justify-start px-3 [mask-image:linear-gradient(to_right,transparent,black_14px,black_calc(100%-14px),transparent)]'
              }`}
            >
              {movePairs.length === 0 ? (
                <span className="text-[#847F76] font-sans" />
              ) : (
                movePairs.map((p) => (
                  <span key={p.moveNumber} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span className="text-[#8E8C88] font-sans font-semibold">{p.moveNumber}.</span>
                    {p.white && (
                      <button
                        type="button"
                        onClick={() => setViewPly(p.whitePly)}
                        className={`px-1.5 py-0.5 rounded-[4px] font-sans text-[13px] font-bold cursor-pointer ${
                          (viewPly ?? history.length) === p.whitePly
                            ? 'bg-[#4B4844] text-white border-b-2 border-[#767470]'
                            : 'text-[#DEDCD8]'
                        }`}
                      >
                        <MoveSanText san={p.white.san} />
                      </button>
                    )}
                    {p.black && (
                      <button
                        type="button"
                        onClick={() => setViewPly(p.blackPly)}
                        className={`px-1.5 py-0.5 rounded-[4px] font-sans text-[13px] font-bold cursor-pointer ${
                          (viewPly ?? history.length) === p.blackPly
                            ? 'bg-[#4B4844] text-white border-b-2 border-[#767470]'
                            : 'text-[#DEDCD8]'
                        }`}
                      >
                        <MoveSanText san={p.black.san} />
                      </button>
                    )}
                  </span>
                ))
              )}
            </div>

            <button
              type="button"
              aria-label="Next move"
              disabled={history.length === 0 || viewPly === null || viewPly === history.length}
              onClick={() =>
                setViewPly((p) =>
                  p === null ? null : p + 1 >= history.length ? null : p + 1,
                )
              }
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[#C8C4BC] hover:text-white disabled:opacity-35 cursor-pointer shrink-0"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Mobile Pinned Flat Action Bar (Bot/Local: 4-col Options/Abort-Resign/Hint/Undo; Online: 5-col) */}
          <div
            data-testid="mobile-action-bar"
            className={`lg:hidden fixed bottom-0 left-0 right-0 z-30 h-14 bg-[#262421] border-t border-white/10 grid items-center ${
              isOnlineMode ? 'grid-cols-5' : 'grid-cols-4'
            }`}
          >
            <button
              type="button"
              onClick={() => setMobileSheet(isOnlineMode ? 'options' : 'setup')}
              className="min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-[#C8C4BC] hover:text-white cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Options</span>
            </button>
            {isOnlineMode && (
              <button
                type="button"
                onClick={() => {
                  setUnreadChat(0);
                  setMobileSheet('chat');
                }}
                className="relative min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold text-[#81B64C] cursor-pointer"
              >
                <div className="relative">
                  <MessageSquare className="w-4 h-4" />
                  {unreadChat > 0 && (
                    <span className="absolute -top-1.5 -right-2 px-1 rounded-full bg-[#81B64C] text-[#191815] text-[9px] font-extrabold leading-tight">
                      {unreadChat}
                    </span>
                  )}
                </div>
                <span>Chat</span>
              </button>
            )}
            <button
              type="button"
              onClick={
                history.length > 0 && !gameOverState
                  ? handleResign
                  : requestLeaveGame
              }
              className="min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-[#C8C4BC] hover:text-white cursor-pointer"
            >
              {history.length > 0 && !gameOverState ? (
                <>
                  <Flag className="w-4 h-4" />
                  <span>{opponentType === 'online-lichess' && history.length < 2 ? 'Abort' : 'Resign'}</span>
                </>
              ) : isOnlineMode ? (
                <>
                  <LogOut className="w-4 h-4" />
                  <span>Leave</span>
                </>
              ) : (
                <>
                  <Flag className="w-4 h-4" />
                  <span>Abort</span>
                </>
              )}
            </button>
            {isOnlineMode ? (
              <>
                <button
                  type="button"
                  onClick={() => handleOfferOrRespondDraw(true)}
                  disabled={Boolean(gameOverState)}
                  className="min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-[#C8C4BC] hover:text-white cursor-pointer disabled:opacity-40"
                >
                  <Handshake className="w-4 h-4 text-[#81B64C]" />
                  <span>Draw</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFlipped((f) => !f)}
                  className="min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-[#C8C4BC] hover:text-white cursor-pointer"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  <span>Flip</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleHint()}
                  disabled={Boolean(gameOverState) || hintLoading}
                  className="min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-[#C8C4BC] hover:text-white cursor-pointer disabled:opacity-40"
                >
                  <Lightbulb className="w-4 h-4 text-[#C8C4BC]" />
                  <span>{hintLoading ? 'Finding...' : 'Hint'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleTakeback}
                  disabled={Boolean(gameOverState) || history.length === 0}
                  className="min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-[#C8C4BC] hover:text-white cursor-pointer disabled:opacity-40"
                >
                  <Undo2 className="w-4 h-4" />
                  <span>Undo</span>
                </button>
              </>
            )}
          </div>

          {viewPly !== null && viewPly !== history.length && (
            <div className="mt-1.5 flex items-center justify-between px-3 py-1.5 rounded bg-[#E59A28]/15 border border-[#E59A28]/35 text-xs text-[#F2D199]">
              <span>
                Inspecting move {viewPly} of {history.length} — jump to live board to play.
              </span>
              <button
                type="button"
                onClick={() => setViewPly(null)}
                className="font-semibold underline cursor-pointer ml-2"
              >
                Return to Live
              </button>
            </div>
          )}

          {gameOverState && !gameOverState.modalOpen && history.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#262421] border border-[#81B64C]/40 text-xs">
              <span className="font-bold text-white truncate">
                {gameOverState.title} ({gameOverState.resultLabel})
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {opponentType === 'online-ws' &&
                  (onlineInfo.rematchOfferBy && onlineInfo.rematchOfferBy !== playerColor ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleRematchAction('accept')}
                        className="px-2.5 py-1.5 rounded-lg bg-[#81B64C] text-[#191815] font-extrabold cursor-pointer"
                      >
                        Accept Rematch
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRematchAction('decline')}
                        className="px-2 py-1.5 rounded-lg bg-[#393734] text-[#DEDAD2] font-bold cursor-pointer"
                      >
                        Decline
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={onlineInfo.rematchOfferBy === playerColor}
                      onClick={() => handleRematchAction('offer')}
                      className="px-2.5 py-1.5 rounded-lg bg-[#393734] hover:bg-[#43403C] text-[#F7C045] font-extrabold flex items-center gap-1 cursor-pointer disabled:opacity-55"
                    >
                      <RotateCw className="w-3 h-3" />
                      <span>
                        {onlineInfo.rematchOfferBy === playerColor ? 'Rematch Sent' : 'Rematch'}
                      </span>
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() =>
                    setGameOverState((prev) => (prev ? { ...prev, modalOpen: true } : null))
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-white font-extrabold cursor-pointer shrink-0"
                >
                  Game Review Report
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Desktop Right Dock — Flush #262421 Panel */}
      <aside className="hidden lg:flex bg-[#262421] rounded-[5px] shadow-[0_6px_22px_rgba(0,0,0,0.28)] overflow-hidden flex-col lg:h-[min(calc(100dvh-2rem),836px)]">
        <div
          role="tablist"
          aria-label="Play workspace panels"
          className="grid grid-cols-3 bg-[#1F1E1B] shrink-0"
        >
          {(isOnlineMode
            ? ([
                { id: 'chat', label: unreadChat > 0 ? `Chat (${unreadChat})` : 'Chat' },
                { id: 'moves', label: `Moves (${history.length})` },
                { id: 'match', label: 'Options' },
              ] as const)
            : ([
                { id: 'match', label: 'Setup' },
                { id: 'moves', label: `Moves (${history.length})` },
                { id: 'tutor', label: 'Coach' },
              ] as const)
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={rightTab === tab.id}
              onClick={() => {
                if (tab.id === 'chat') setUnreadChat(0);
                setRightTab(tab.id);
              }}
              className={`py-3 px-2 text-[12px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                rightTab === tab.id
                  ? 'bg-[#262421] text-white'
                  : 'text-[#9B9A97] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {rightTab === 'match' && (isOnlineMode ? renderOnlineOptions() : renderSetupForm())}
        {rightTab === 'chat' && renderOnlineChat()}

        {rightTab === 'moves' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Opening / Status Subheader + Compact Guard Toggle */}
            <div className="px-3 py-2 border-b border-white/[0.06] flex items-center justify-between gap-2 shrink-0 bg-[#23211E]">
              <span className="text-[12px] font-semibold text-[#A9A6A0] truncate">
                {history.length === 0 ? 'Starting Position' : coachStatusLine}
              </span>
              {opponentType === 'bot' && (
                <button
                  type="button"
                  onClick={() => setCoachGuard((g) => !g)}
                  aria-pressed={coachGuard}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-[4px] border whitespace-nowrap cursor-pointer shrink-0 ${
                    coachGuard
                      ? 'bg-[#81B64C]/20 border-[#81B64C]/60 text-[#AEE076]'
                      : 'bg-[#1A1917] border-white/10 text-[#9B9A97] hover:text-white'
                  }`}
                  title="Instant warning before hanging pieces or mate"
                >
                  Guard {coachGuard ? 'On' : 'Off'}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {movePairs.length === 0 ? (
                <div className="text-center py-12 px-4 text-xs text-[#9B9A97]">
                  Play your opening move on the board to record notation.
                </div>
              ) : (
                <div className="font-mono text-[13px] tabular-nums">
                  {movePairs.map((pair) => {
                    const whiteActive = (viewPly ?? history.length) === pair.whitePly;
                    const blackActive = pair.black
                      ? (viewPly ?? history.length) === pair.blackPly
                      : false;
                    return (
                      <div
                        key={pair.moveNumber}
                        className="grid grid-cols-[40px_1fr_1fr] items-center even:bg-[#2B2926]"
                      >
                        <span className="px-2.5 py-1.5 text-[#8B8985] text-[12px]">
                          {pair.moveNumber}.
                        </span>
                        <button
                          type="button"
                          onClick={() => setViewPly(pair.whitePly)}
                          className="px-2 py-1 text-left cursor-pointer hover:bg-white/[0.04] transition-colors"
                        >
                          <span
                            className={`inline-block rounded-[3px] px-1.5 py-0.5 leading-tight ${
                              whiteActive
                                ? 'bg-[#4B4844] text-white font-bold border-b-2 border-[#767470]'
                                : 'text-[#E3E1DD]'
                            }`}
                          >
                            {pair.white?.san && <MoveSanText san={pair.white.san} />}
                          </span>
                        </button>
                        {pair.black ? (
                          <button
                            type="button"
                            onClick={() => setViewPly(pair.blackPly)}
                            className="px-2 py-1 text-left cursor-pointer hover:bg-white/[0.04] transition-colors"
                          >
                            <span
                              className={`inline-block rounded-[3px] px-1.5 py-0.5 leading-tight ${
                                blackActive
                                  ? 'bg-[#4B4844] text-white font-bold border-b-2 border-[#767470]'
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
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-3 bg-[#1F1E1B] border-t border-white/[0.06] space-y-2 shrink-0">
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  aria-label="First move"
                  onClick={() => setViewPly(0)}
                  disabled={history.length === 0}
                  className="py-2 rounded-[5px] cc-btn-secondary flex items-center justify-center disabled:opacity-40 cursor-pointer"
                >
                  <ChevronFirst className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Previous move"
                  onClick={() =>
                    setViewPly((p) => Math.max(0, (p ?? history.length) - 1))
                  }
                  disabled={history.length === 0}
                  className="py-2 rounded-[5px] cc-btn-secondary flex items-center justify-center disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next move"
                  onClick={() =>
                    setViewPly((p) =>
                      p === null ? null : Math.min(history.length, p + 1),
                    )
                  }
                  disabled={history.length === 0}
                  className="py-2 rounded-[5px] cc-btn-secondary flex items-center justify-center disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label="Latest move"
                  onClick={() => setViewPly(null)}
                  disabled={history.length === 0}
                  className="py-2 rounded-[5px] cc-btn-secondary flex items-center justify-center disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLast className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                disabled={history.length === 0}
                onClick={() =>
                  onSendToReview(
                    pgn,
                    playerColor,
                    gameOverState?.resultLabel ?? '*',
                  )
                }
                className="w-full h-[40px] px-3 rounded-[6px] cc-btn-secondary text-[13px] font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
              >
                <SearchCheck className="w-4 h-4 text-[#81B64C]" />
                <span>Game Review</span>
              </button>
            </div>
          </div>
        )}

        {rightTab === 'tutor' && (
          isOnlineMode ? (
            <div className="p-5 text-xs text-[#9E998F] leading-relaxed space-y-2">
              <div className="text-sm font-bold text-white">Fair Play Active</div>
              <p>
                Live Coach hints and engine evaluations are disabled during online multiplayer games. After the game finishes, tap <strong>Analyze in Review</strong> to run full Game Review &amp; Coach analysis.
              </p>
            </div>
          ) : (
            <CoachWorkspace
              fen={displayedFen}
              pgn={pgn}
              mode="play"
              playerColor={playerColor}
              resultLabel={gameOverState?.resultLabel ?? '*'}
              evalCp={displayedEval}
              lastMoveSan={lastMove?.san ?? ''}
              suggestedMoveSan={bestSuggestion}
              contextNote={
                isCoachMode
                  ? `Playing interactive lesson with ${activeCoach.name} (${activeCoachLevel.label} ${effectiveBotElo}, ${tc.id}).`
                  : opponentType === 'bot'
                    ? `Playing ${tc.id} (${tc.category}) against ${activeBot.name} (${effectiveBotElo}).`
                    : `Pass & Play ${tc.id} game.`
              }
              selectedPly={viewPly ?? history.length}
              onSelectPly={(p) => setViewPly(p === history.length ? null : p)}
              onHighlightArrow={setCloudArrow}
              queuedPrompt={queuedCoachPrompt}
              defaultTab={queuedCoachPrompt ? 'tutor' : 'report'}
              coachId={activeCoach.id}
            />
          )
        )}
      </aside>

      {/* Mobile Bottom Sheets */}
      <BottomSheet
        open={mobileSheet === 'setup'}
        title="Match Setup & Coach"
        onClose={() => setMobileSheet('none')}
      >
        {renderSetupForm()}
      </BottomSheet>

      <BottomSheet
        open={mobileSheet === 'options'}
        title="Online Game Options"
        onClose={() => setMobileSheet('none')}
      >
        {renderOnlineOptions()}
      </BottomSheet>

      <BottomSheet
        open={mobileSheet === 'chat'}
        title="Live Match Chat"
        onClose={() => setMobileSheet('none')}
      >
        {renderOnlineChat()}
      </BottomSheet>

      <BottomSheet
        open={mobileSheet === 'tutor'}
        title={activeCoach.name}
        onClose={() => setMobileSheet('none')}
      >
        {isOnlineMode ? (
          <div className="p-5 text-xs text-[#9E998F] leading-relaxed">
            Coach assistance is disabled during live online games for fair play. Review the game with Coach after it ends!
          </div>
        ) : (
          <CoachWorkspace
            fen={displayedFen}
            pgn={pgn}
            mode="play"
            playerColor={playerColor}
            resultLabel={gameOverState?.resultLabel ?? '*'}
            evalCp={displayedEval}
            lastMoveSan={lastMove?.san ?? ''}
            suggestedMoveSan={bestSuggestion}
            contextNote={
              isCoachMode
                ? `Playing interactive lesson with ${activeCoach.name} (${activeCoachLevel.label} ${effectiveBotElo}, ${tc.id}).`
                : opponentType === 'bot'
                  ? `Playing ${tc.id} (${tc.category}) against ${activeBot.name} (${effectiveBotElo}).`
                  : `Pass & Play ${tc.id} game.`
            }
            selectedPly={viewPly ?? history.length}
            onSelectPly={(p) => setViewPly(p === history.length ? null : p)}
            onHighlightArrow={(arrow) => {
              setCloudArrow(arrow);
              setMobileSheet('none');
            }}
            queuedPrompt={queuedCoachPrompt}
            defaultTab={queuedCoachPrompt ? 'tutor' : 'report'}
            onMoveStepCloseSheet={() => setMobileSheet('none')}
            coachId={activeCoach.id}
          />
        )}
      </BottomSheet>

      {leaveConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-game-title"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-[#262421] border border-white/15 p-5 space-y-4 shadow-2xl">
            <div className="space-y-1.5">
              <h2 id="leave-game-title" className="text-lg font-extrabold text-white font-display">
                Leave Game?
              </h2>
              <p className="text-xs text-[#B8B4AC] leading-relaxed">
                {isOnlineMode
                  ? 'Are you sure you want to leave? Leaving an active online match will forfeit or end your current game.'
                  : 'Are you sure you want to leave your active game?'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setLeaveConfirmOpen(false)}
                className="min-h-[44px] rounded-xl bg-[#393734] hover:bg-[#43403C] text-xs font-extrabold text-white cursor-pointer"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={confirmLeaveGame}
                className="min-h-[44px] rounded-xl bg-[#CA3431] hover:bg-[#DC4340] border-b-[3px] border-[#8F1F1D] text-xs font-extrabold text-white cursor-pointer"
              >
                Leave Game
              </button>
            </div>
          </div>
        </div>
      )}

      {gameOverState && gameOverState.modalOpen && history.length > 0 && gameOverState.resultLabel !== '*' && (
        <GameReviewSummaryScreen
          pgn={gameOverState.pgnSnapshot || pgn}
          resultLabel={gameOverState.resultLabel}
          resultTitle={gameOverState.title}
          whiteName={
            gameOverState.whiteName ??
            (isOnlineMode
              ? onlineInfo.whiteName
              : isBotOrCoach
                ? playerColor === 'w'
                  ? lichessUsername || 'You'
                  : activeOpponentName
                : 'White')
          }
          blackName={
            gameOverState.blackName ??
            (isOnlineMode
              ? onlineInfo.blackName
              : isBotOrCoach
                ? playerColor === 'b'
                  ? lichessUsername || 'You'
                  : activeOpponentName
                : 'Black')
          }
          whiteRating={
            gameOverState.whiteRating ??
            (isOnlineMode
              ? onlineInfo.whiteRating
              : isBotOrCoach
                ? playerColor === 'w'
                  ? (tc.category === 'Bullet'
                      ? lichessPerfs?.bullet?.rating
                      : tc.category === 'Blitz'
                        ? lichessPerfs?.blitz?.rating
                        : lichessPerfs?.rapid?.rating) ?? loadGuestPerfs()[tc.category === 'Bullet' ? 'bullet' : tc.category === 'Blitz' ? 'blitz' : 'rapid'].rating
                  : effectiveBotElo
                : undefined)
          }
          blackRating={
            gameOverState.blackRating ??
            (isOnlineMode
              ? onlineInfo.blackRating
              : isBotOrCoach
                ? playerColor === 'b'
                  ? (tc.category === 'Bullet'
                      ? lichessPerfs?.bullet?.rating
                      : tc.category === 'Blitz'
                        ? lichessPerfs?.blitz?.rating
                        : lichessPerfs?.rapid?.rating) ?? loadGuestPerfs()[tc.category === 'Bullet' ? 'bullet' : tc.category === 'Blitz' ? 'blitz' : 'rapid'].rating
                  : effectiveBotElo
                : undefined)
          }
          whiteRatingDelta={gameOverState.whiteRatingDelta}
          blackRatingDelta={gameOverState.blackRatingDelta}
          isRatedMatch={gameOverState.isRatedMatch ?? (opponentType !== 'online-ws' || onlineInfo.rated !== false)}
          whiteAvatarId={
            isBotOrCoach && playerColor === 'b'
              ? isCoachMode
                ? activeCoach.id
                : activeBot.id
              : null
          }
          blackAvatarId={
            isBotOrCoach && playerColor === 'w'
              ? isCoachMode
                ? activeCoach.id
                : activeBot.id
              : null
          }
          whiteAvatarUrl={isOnlineMode ? onlineInfo.whiteAvatarUrl ?? null : null}
          blackAvatarUrl={isOnlineMode ? onlineInfo.blackAvatarUrl ?? null : null}
          whiteFlag={
            isOnlineMode
              ? onlineInfo.whiteFlag ?? (playerColor === 'w' ? lichessFlag : null)
              : null
          }
          blackFlag={
            isOnlineMode
              ? onlineInfo.blackFlag ?? (playerColor === 'b' ? lichessFlag : null)
              : null
          }
          currentUsername={lichessUsername}
          onRematch={
            opponentType === 'online-ws'
              ? () => {
                  if (onlineInfo.rematchOfferBy && onlineInfo.rematchOfferBy !== playerColor) {
                    handleRematchAction('accept');
                  } else {
                    handleRematchAction('offer');
                  }
                }
              : null
          }
          rematchLabel={
            onlineInfo.rematchOfferBy === playerColor
              ? 'Rematch Sent'
              : onlineInfo.rematchOfferBy && onlineInfo.rematchOfferBy !== playerColor
                ? 'Accept Rematch'
                : 'Rematch'
          }
          rematchDisabled={onlineInfo.rematchOfferBy === playerColor}
          onAddFriendOpponent={(() => {
            if (opponentType !== 'online-ws' || !onAddFriend) return null;
            const opp = playerColor === 'w' ? onlineInfo.blackName : onlineInfo.whiteName;
            if (
              isPlaceholderPlayerUsername(opp) ||
              friends.some((f) => f.toLowerCase() === opp.toLowerCase())
            ) {
              return null;
            }
            return () => onAddFriend(opp);
          })()}
          onMessageOpponent={(() => {
            if (opponentType !== 'online-ws' || !onMessagePlayer) return null;
            const opp = playerColor === 'w' ? onlineInfo.blackName : onlineInfo.whiteName;
            if (isPlaceholderPlayerUsername(opp)) {
              return null;
            }
            return () => {
              setGameOverState((prev) => (prev ? { ...prev, modalOpen: false } : null));
              onMessagePlayer(opp);
            };
          })()}
          onStartReview={() => {
            const targetPgn = gameOverState.pgnSnapshot || pgn;
            setGameOverState((prev) => (prev ? { ...prev, modalOpen: false } : null));
            onSendToReview(targetPgn, playerColor, gameOverState.resultLabel);
          }}
          onNewGame={() => startNewGame()}
          onClose={() => {
            if (history.length > 0) {
              setViewPly(1);
            }
            setGameOverState((prev) =>
              prev ? { ...prev, modalOpen: false } : null,
            );
          }}
        />
      )}

      {gameOverState && gameOverState.modalOpen && (history.length === 0 || gameOverState.resultLabel === '*') && (
        <GameOverModal
          title={gameOverState.title}
          subtitle={gameOverState.subtitle}
          playerWon={gameOverState.playerWon}
          moveCount={history.length}
          whiteName={
            gameOverState.whiteName ??
            (isOnlineMode
              ? onlineInfo.whiteName
              : isBotOrCoach
                ? playerColor === 'w'
                  ? lichessUsername || 'You'
                  : activeOpponentName
                : 'White')
          }
          blackName={
            gameOverState.blackName ??
            (isOnlineMode
              ? onlineInfo.blackName
              : isBotOrCoach
                ? playerColor === 'b'
                  ? lichessUsername || 'You'
                  : activeOpponentName
                : 'Black')
          }
          whiteRating={gameOverState.whiteRating ?? (isOnlineMode ? onlineInfo.whiteRating : undefined)}
          blackRating={gameOverState.blackRating ?? (isOnlineMode ? onlineInfo.blackRating : undefined)}
          isRatedMatch={gameOverState.isRatedMatch ?? (opponentType !== 'online-ws' || onlineInfo.rated !== false)}
          onReview={() =>
            onSendToReview(gameOverState.pgnSnapshot || pgn, playerColor, gameOverState.resultLabel)
          }
          onPlayAgain={() => startNewGame()}
          onClose={() =>
            setGameOverState((prev) =>
              prev ? { ...prev, modalOpen: false } : null,
            )
          }
        />
      )}
      <CoachPickerModal
        open={coachPickerOpen}
        coachId={activeCoach.id}
        strengthId={coachStrength}
        confirmLabel="Confirm Coach"
        onSelectCoach={(id) => {
          setInternalCoachId(id);
          saveSelectedCoachId(id);
          onCoachChange?.(id);
        }}
        onSelectStrength={(s) => {
          setCoachStrength(s);
          saveSelectedCoachStrength(s);
        }}
        onClose={() => setCoachPickerOpen(false)}
        onConfirm={(id, s) => {
          setInternalCoachId(id);
          saveSelectedCoachId(id);
          onCoachChange?.(id);
          setCoachStrength(s);
          saveSelectedCoachStrength(s);
          setCoachPickerOpen(false);
        }}
      />
    </div>
  );
}
