import { useEffect, useRef, useState } from 'react';
import type { Color } from 'chess.js';
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  Users,
  Link2,
  Copy,
  Check,
  X,
  SlidersHorizontal,
  Swords,
  RefreshCw,
  Zap,
  Rocket,
  PlusSquare,
  Grid2x2,
} from 'lucide-react';
import { loadUserAvatar } from '../chess/avatars';
import { BOARD_THEME_PALETTES, type BoardTheme } from '../chess/theme';
import { countryCodeToFlagEmoji, loadGuestPerfs, loadGuestPlayerName } from '../chess/analytics';
import {
  filterNamedOpenChallenges,
  formatOnlineTimeControl,
  getFairMatchmakingEloBand,
  getShareableAppOrigin,
  isPlaceholderPlayerUsername,
  MAX_MATCHMAKING_ELO_GAP,
  type ChessServerName,
  type OpenChallengeItem,
} from '../chess/onlineHelpers';
import type { LichessSession } from '../chess/useLichessAuth';
import {
  COACH_STRENGTH_LEVELS,
  getCoachProfile,
  loadSelectedCoachId,
  loadSelectedCoachStrength,
  saveSelectedCoachId,
  saveSelectedCoachStrength,
  type CoachPersonaId,
  type CoachStrengthId,
} from '../chess/coach';
import { TIME_CONTROLS, type PlayPreset } from './PlayView';
import { BotAvatar } from './BotAvatar';
import { PlayerAvatar } from './PlayerAvatar';
import { CoachPickerModal } from './CoachPickerModal';
import { ChessBoard } from './ChessBoard';
import {
  BlitzBoltIcon,
  BulletIcon,
  CustomChallengeIcon,
  HandshakeIllustratedIcon,
  NavBotsIcon,
  NavFriendsIcon,
  NavPlayIcon,
  RapidStopwatchIcon,
} from './ChessIcons';

const SEARCHING_COACH_TIPS = [
  'Controlling the center gives you more influence and a strong advantage early in the game.',
  'Develop your knights and bishops toward central squares before moving your queen twice.',
  'Castle early to safeguard your king and connect your rooks for the middlegame.',
  'Look for checks, captures, and threats before settling on a quiet positional move.',
  'Keep an eye on undefended pieces—most tactical combinations start with a loose target.',
];

interface NewGameViewProps {
  initialTimeId?: string;
  boardTheme?: BoardTheme;
  lichessSession: LichessSession | null;
  lichessConnecting: boolean;
  lichessAuthError: string | null;
  coachId?: CoachPersonaId;
  onCoachChange?: (id: CoachPersonaId) => void;
  onConnectLichess: () => void;
  onBack: () => void;
  onStartGame: (opts: Omit<PlayPreset, 'nonce'>) => void;
  onOpenBots: () => void;
  onOpenFriends: () => void;
  onOpenPlayerProfile?: (username: string) => void;
}

function generateChallengeRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'OC';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function NewGameView({
  initialTimeId = '10+0',
  boardTheme = 'green',
  lichessSession,
  lichessAuthError,
  coachId: externalCoachId,
  onCoachChange,
  onConnectLichess,
  onBack,
  onStartGame,
  onOpenBots,
  onOpenFriends,
  onOpenPlayerProfile,
}: NewGameViewProps) {
  const [timeId, setTimeId] = useState(initialTimeId);
  const [rightTab, setRightTab] = useState<'new-game' | 'games' | 'players'>('new-game');
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [color, setColor] = useState<Color | 'random'>('w');
  const [rated, setRated] = useState(true);
  const [coachGuard, setCoachGuard] = useState(false);

  const [localCoachId, setLocalCoachId] = useState<CoachPersonaId>(() => loadSelectedCoachId());
  const [coachStrength, setCoachStrength] = useState<CoachStrengthId>(() =>
    loadSelectedCoachStrength(),
  );
  const [coachModalOpen, setCoachModalOpen] = useState(false);
  const activeCoachId = externalCoachId ?? localCoachId;
  const activeCoach = getCoachProfile(activeCoachId);
  const activeStrength =
    COACH_STRENGTH_LEVELS.find((s) => s.id === coachStrength) ?? COACH_STRENGTH_LEVELS[1];

  useEffect(() => {
    if (initialTimeId && TIME_CONTROLS.some((t) => t.id === initialTimeId)) {
      setTimeId(initialTimeId);
    }
  }, [initialTimeId]);

  useEffect(() => {
    if (lichessSession?.hasOnlineToken) {
      setRated(true);
    }
  }, [lichessSession?.hasOnlineToken]);

  const [seekingState, setSeekingState] = useState<'idle' | 'ws-queue' | 'live-seek' | 'rated-empty'>('idle');
  const [searchElapsedSec, setSearchElapsedSec] = useState(0);
  const [wsConnectedSignal, setWsConnectedSignal] = useState(true);
  const [matchStatusInfo, setMatchStatusInfo] = useState<{
    phase: 'searching' | 'waiting_rated_pool' | 'broadening_live_pool' | 'rated_empty';
    elo?: number;
    minElo?: number;
    maxElo?: number;
    rated?: boolean;
  } | null>(null);
  const [seekError, setSeekError] = useState<string | null>(null);
  const wsQueueRef = useRef<WebSocket | null>(null);
  const wsLobbyRef = useRef<WebSocket | null>(null);
  const seekAbortRef = useRef<AbortController | null>(null);
  const intentionalCloseRef = useRef(false);

  useEffect(() => {
    if (seekingState === 'idle') {
      setSearchElapsedSec(0);
      return;
    }
    setSearchElapsedSec(0);
    const id = window.setInterval(() => {
      setSearchElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [seekingState]);

  const [lobbyChallenges, setLobbyChallenges] = useState<OpenChallengeItem[]>([]);
  const [lobbyServers, setLobbyServers] = useState<
    Array<{ name: ChessServerName; ok: boolean; count: number }>
  >([]);
  const [activePoolPlayers, setActivePoolPlayers] = useState<
    Array<{
      username: string;
      rating?: number;
      title?: string;
      flag?: string;
      avatarUrl?: string;
      server: ChessServerName;
      online: boolean;
    }>
  >([]);
  const [lobbyLoading, setLobbyLoading] = useState(false);
  const [lichessOpenSeatsCount, setLichessOpenSeatsCount] = useState(0);
  const [myPostedChallengeId, setMyPostedChallengeId] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState('');
  const [customRoomCode] = useState<string>(() => generateChallengeRoomCode());
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [panel] = useState<'none' | 'friend'>('none');
  const [challengeUsername, setChallengeUsername] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const selectedTc =
    TIME_CONTROLS.find((t) => t.id === timeId) ??
    TIME_CONTROLS.find((t) => t.id === '10+0') ??
    TIME_CONTROLS[0];

  const isGlobalPoolSpeedSupported =
    selectedTc.initialSeconds + 40 * selectedTc.incrementSeconds >= 480;
  const canSeekGlobalAccountPool =
    Boolean(lichessSession?.hasOnlineToken && lichessSession?.accessToken) &&
    isGlobalPoolSpeedSupported;

  const getPlayerCategoryElo = (): number => {
    const guestPerfs = loadGuestPerfs();
    const perfs = lichessSession?.account.perfs;
    const categoryKey =
      selectedTc.category === 'Bullet'
        ? 'bullet'
        : selectedTc.category === 'Blitz'
          ? 'blitz'
          : 'rapid';
    const guestRating = guestPerfs[categoryKey]?.rating;
    const guestGames = guestPerfs[categoryKey]?.games ?? 0;

    if (lichessSession && perfs) {
      const catPerf = perfs[categoryKey];
      if (
        catPerf &&
        typeof catPerf.rating === 'number' &&
        ((catPerf.games ?? 0) > 0 || (catPerf.rating !== 1200 && catPerf.rating !== 1500))
      ) {
        return Math.max(100, Math.min(3200, Math.round(catPerf.rating)));
      }
      const activeAccountPerf = [perfs.rapid, perfs.blitz, perfs.bullet].find(
        (p) =>
          p &&
          typeof p.rating === 'number' &&
          ((p.games ?? 0) > 0 || (p.rating !== 1200 && p.rating !== 1500)),
      );
      if (activeAccountPerf && typeof activeAccountPerf.rating === 'number') {
        return Math.max(100, Math.min(3200, Math.round(activeAccountPerf.rating)));
      }
      if (guestGames > 0 || (typeof guestRating === 'number' && guestRating !== 1200)) {
        return Math.max(100, Math.min(3200, Math.round(guestRating)));
      }
      if (catPerf && typeof catPerf.rating === 'number') {
        return Math.max(100, Math.min(3200, Math.round(catPerf.rating)));
      }
    }

    if (typeof guestRating === 'number' && (guestGames > 0 || guestRating !== 1200)) {
      return Math.max(100, Math.min(3200, Math.round(guestRating)));
    }
    const activeGuestPerf = [guestPerfs.rapid, guestPerfs.blitz, guestPerfs.bullet].find(
      (p) => p && typeof p.rating === 'number' && ((p.games ?? 0) > 0 || p.rating !== 1200),
    );
    if (activeGuestPerf) {
      return Math.max(100, Math.min(3200, Math.round(activeGuestPerf.rating)));
    }
    return typeof guestRating === 'number' ? Math.max(100, Math.round(guestRating)) : 1200;
  };

  const loadLobbyChallenges = async () => {
    setLobbyLoading(true);
    try {
      const targetElo = getPlayerCategoryElo();
      const headers: Record<string, string> = {};
      if (lichessSession?.accessToken) {
        headers.Authorization = `Bearer ${lichessSession.accessToken}`;
      }
      const res = await fetch(`/api/online/lobby?elo=${encodeURIComponent(String(targetElo))}`, {
        headers,
      });
      if (res.ok) {
        const data = (await res.json()) as {
          challenges?: OpenChallengeItem[];
          lichessOpenSeatsCount?: number;
          servers?: Array<{
            name: ChessServerName;
            ok: boolean;
            count: number;
          }>;
          activePoolPlayers?: Array<{
            username: string;
            rating?: number;
            title?: string;
            flag?: string;
            avatarUrl?: string;
            server: ChessServerName;
            online: boolean;
          }>;
        };
        if (Array.isArray(data?.challenges)) {
          setLobbyChallenges(filterNamedOpenChallenges(data.challenges, targetElo));
        }
        if (typeof data?.lichessOpenSeatsCount === 'number') {
          setLichessOpenSeatsCount(data.lichessOpenSeatsCount);
        }
        if (Array.isArray(data?.servers)) {
          setLobbyServers(data.servers);
        }
        if (Array.isArray(data?.activePoolPlayers)) {
          setActivePoolPlayers(
            data.activePoolPlayers.filter((p) => !isPlaceholderPlayerUsername(p.username)),
          );
        }
      }
    } catch {
      // ignore
    } finally {
      setLobbyLoading(false);
    }
  };

  useEffect(() => {
    void loadLobbyChallenges();
    const timer = window.setInterval(() => {
      void loadLobbyChallenges();
    }, 8000);
    return () => {
      window.clearInterval(timer);
      if (seekAbortRef.current) {
        seekAbortRef.current.abort();
        seekAbortRef.current = null;
      }
      if (wsQueueRef.current && wsQueueRef.current.readyState === WebSocket.OPEN) {
        wsQueueRef.current.close();
      }
      if (wsLobbyRef.current && wsLobbyRef.current.readyState === WebSocket.OPEN) {
        wsLobbyRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeId, lichessSession?.account.username]);

  const cancelSearch = () => {
    intentionalCloseRef.current = true;
    if (seekAbortRef.current) {
      seekAbortRef.current.abort();
      seekAbortRef.current = null;
    }
    if (wsQueueRef.current) {
      try {
        if (wsQueueRef.current.readyState === WebSocket.OPEN) {
          wsQueueRef.current.send(JSON.stringify({ type: 'cancel_match' }));
        }
        wsQueueRef.current.close();
      } catch {
        // ignore
      }
      wsQueueRef.current = null;
    }
    setSeekingState('idle');
    setMatchStatusInfo(null);
  };

  const startLiveBoardSeek = async () => {
    if (!lichessSession?.hasOnlineToken || !lichessSession.accessToken) {
      startWsQuickMatch();
      return;
    }
    cancelSearch();
    setSeekError(null);
    setSeekingState('live-seek');

    const controller = new AbortController();
    seekAbortRef.current = controller;

    try {
      const res = await fetch('/api/lichess/seek', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lichessSession.accessToken}`,
        },
        body: JSON.stringify({
          time: Math.max(1, Math.round(selectedTc.initialSeconds / 60)),
          increment: selectedTc.incrementSeconds,
          rated,
          color: color === 'w' ? 'white' : color === 'b' ? 'black' : 'random',
          playerElo: getPlayerCategoryElo(),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errBody?.error || 'Unable to start global account matchmaking.');
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
          const lines = frame.split('\n');
          const eventLine = lines.find((l) => l.startsWith('event:'))?.slice(6).trim();
          const dataLine = lines.find((l) => l.startsWith('data:'))?.slice(5).trim();
          if (!dataLine) continue;

          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(dataLine) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (eventLine === 'error') {
            const rawErr =
              typeof parsed.error === 'string' && parsed.error
                ? parsed.error
                : 'Global pool seek was unavailable. Try Quick Match or Open Room.';
            throw new Error(rawErr);
          }

          if (eventLine === 'gameStart') {
            const gameId =
              (typeof parsed.gameId === 'string' && parsed.gameId) ||
              (typeof parsed.id === 'string' && parsed.id) ||
              '';
            if (gameId) {
              const assignedColor: Color = parsed.color === 'black' ? 'b' : 'w';
              controller.abort();
              seekAbortRef.current = null;
              setSeekingState('idle');
              onStartGame({
                mode: 'online-lichess',
                lichessGameId: gameId,
                timeId: selectedTc.id,
                color: assignedColor,
              });
              return;
            }
          }
        }
      }

      if (!controller.signal.aborted) {
        seekAbortRef.current = null;
        startWsQuickMatch();
      }
    } catch {
      if (controller.signal.aborted) return;
      seekAbortRef.current = null;
      startWsQuickMatch();
    }
  };

  const startWsQuickMatch = (allowUnratedFallback = false) => {
    cancelSearch();
    intentionalCloseRef.current = false;
    setWsConnectedSignal(false);
    setSeekError(null);
    setSeekingState('ws-queue');
    const requestRated = allowUnratedFallback ? false : rated;
    const playerElo = getPlayerCategoryElo();
    const band = getFairMatchmakingEloBand(playerElo, MAX_MATCHMAKING_ELO_GAP);
    setMatchStatusInfo({
      phase: 'searching',
      elo: playerElo,
      minElo: band.minElo,
      maxElo: band.maxElo,
      rated: requestRated,
    });
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/chess`);
    wsQueueRef.current = ws;

    const playerAvatarUrl =
      loadUserAvatar(lichessSession?.account.username) ||
      lichessSession?.account.profile?.avatarUrl ||
      undefined;
    const playerFlag =
      lichessSession?.account.profile?.flag ||
      lichessSession?.account.profile?.country ||
      undefined;

    let queuePing: number | null = null;
    ws.onopen = () => {
      setWsConnectedSignal(true);
      ws.send(
        JSON.stringify({
          type: 'quick_match',
          token: lichessSession?.accessToken,
          name: lichessSession?.account.username ?? loadGuestPlayerName(),
          avatarUrl: playerAvatarUrl,
          flag: playerFlag,
          initialSeconds: selectedTc.initialSeconds,
          incrementSeconds: selectedTc.incrementSeconds,
          color,
          playerElo,
          rated: requestRated,
          allowUnratedFallback,
        }),
      );
      queuePing = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping' }));
          } catch {
            // ignore
          }
        }
      }, 20_000);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data));
        if (msg.type === 'match:searching') {
          setMatchStatusInfo({
            phase: 'searching',
            elo: typeof msg.elo === 'number' ? msg.elo : playerElo,
            minElo: typeof msg.minElo === 'number' ? msg.minElo : band.minElo,
            maxElo: typeof msg.maxElo === 'number' ? msg.maxElo : band.maxElo,
            rated: typeof msg.rated === 'boolean' ? msg.rated : requestRated,
          });
        } else if (msg.type === 'match:status') {
          setMatchStatusInfo({
            phase:
              msg.phase === 'waiting_rated_pool'
                ? 'waiting_rated_pool'
                : msg.phase === 'broadening_live_pool'
                  ? 'broadening_live_pool'
                  : 'searching',
            elo: typeof msg.elo === 'number' ? msg.elo : playerElo,
            minElo: typeof msg.minElo === 'number' ? msg.minElo : band.minElo,
            maxElo: typeof msg.maxElo === 'number' ? msg.maxElo : band.maxElo,
            rated: typeof msg.rated === 'boolean' ? msg.rated : requestRated,
          });
        } else if (msg.type === 'match:timeout_rated') {
          intentionalCloseRef.current = true;
          if (queuePing) window.clearInterval(queuePing);
          ws.close();
          wsQueueRef.current = null;
          setSeekingState('rated-empty');
          setMatchStatusInfo({
            phase: 'rated_empty',
            elo: typeof msg.elo === 'number' ? msg.elo : playerElo,
            minElo: typeof msg.minElo === 'number' ? msg.minElo : band.minElo,
            maxElo: typeof msg.maxElo === 'number' ? msg.maxElo : band.maxElo,
            rated: true,
          });
        } else if (msg.type === 'room:matched' && msg.roomId) {
          intentionalCloseRef.current = true;
          if (queuePing) window.clearInterval(queuePing);
          ws.close();
          wsQueueRef.current = null;
          setSeekingState('idle');
          setMatchStatusInfo(null);
          const matchedInit =
            typeof msg.initialSeconds === 'number'
              ? msg.initialSeconds
              : selectedTc.initialSeconds;
          const matchedInc =
            typeof msg.incrementSeconds === 'number'
              ? msg.incrementSeconds
              : selectedTc.incrementSeconds;
          const matchedTc =
            TIME_CONTROLS.find(
              (t) =>
                t.initialSeconds === matchedInit && t.incrementSeconds === matchedInc,
            ) ?? selectedTc;
          const formattedTc = formatOnlineTimeControl(matchedInit, matchedInc);
          onStartGame({
            mode: 'online-ws',
            timeId:
              matchedTc.initialSeconds === matchedInit && matchedTc.incrementSeconds === matchedInc
                ? matchedTc.id
                : formattedTc.id,
            matchedInitialSeconds: matchedInit,
            matchedIncrementSeconds: matchedInc,
            rated: typeof msg.rated === 'boolean' ? msg.rated : requestRated,
            serverSource: typeof msg.serverSource === 'string' ? (msg.serverSource as ChessServerName) : undefined,
            wsRoomId: msg.roomId,
            wsAction: 'join',
            color: msg.yourColor,
          });
        } else if (msg.type === 'room:error' || msg.type === 'error') {
          intentionalCloseRef.current = true;
          if (queuePing) window.clearInterval(queuePing);
          setSeekError(msg.error || msg.message || 'Unable to match right now.');
          ws.close();
          wsQueueRef.current = null;
          setSeekingState('idle');
          setMatchStatusInfo(null);
        }
      } catch {
        // ignore
      }
    };
    ws.onclose = () => {
      if (queuePing) window.clearInterval(queuePing);
      if (wsQueueRef.current === ws) {
        wsQueueRef.current = null;
        if (!intentionalCloseRef.current) {
          setSeekingState('idle');
          setMatchStatusInfo(null);
          setSeekError('Matchmaking connection closed. Tap Start Online Game to retry.');
        }
      }
    };
    ws.onerror = () => {
      intentionalCloseRef.current = true;
      if (queuePing) window.clearInterval(queuePing);
      if (wsQueueRef.current === ws) wsQueueRef.current = null;
      setSeekingState('idle');
      setMatchStatusInfo(null);
      setSeekError('Live WebSocket connection error.');
    };
  };

  const handlePostOpenChallenge = () => {
    if (!lichessSession?.accessToken) {
      onConnectLichess();
      return;
    }
    setSeekError(null);
    if (wsLobbyRef.current && wsLobbyRef.current.readyState === WebSocket.OPEN) {
      wsLobbyRef.current.close();
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/chess`);
    wsLobbyRef.current = ws;
    let lobbyPing: number | null = null;
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'lobby:post',
          token: lichessSession.accessToken,
          initialSeconds: selectedTc.initialSeconds,
          incrementSeconds: selectedTc.incrementSeconds,
          color,
          rated,
          playerElo: getPlayerCategoryElo(),
        }),
      );
      lobbyPing = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping' }));
          } catch {
            // ignore
          }
        }
      }, 20_000);
    };
    ws.onclose = () => {
      if (lobbyPing) window.clearInterval(lobbyPing);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data));
        if (msg.type === 'lobby:posted' && msg.challenge?.id) {
          setMyPostedChallengeId(String(msg.challenge.id));
          void loadLobbyChallenges();
        } else if (msg.type === 'lobby:cancelled') {
          setMyPostedChallengeId(null);
          void loadLobbyChallenges();
        } else if (msg.type === 'room:matched' && msg.roomId) {
          if (lobbyPing) window.clearInterval(lobbyPing);
          setMyPostedChallengeId(null);
          ws.close();
          wsLobbyRef.current = null;
          const matchedInit =
            typeof msg.initialSeconds === 'number'
              ? msg.initialSeconds
              : selectedTc.initialSeconds;
          const matchedInc =
            typeof msg.incrementSeconds === 'number'
              ? msg.incrementSeconds
              : selectedTc.incrementSeconds;
          const matchedTc =
            TIME_CONTROLS.find(
              (t) =>
                t.initialSeconds === matchedInit && t.incrementSeconds === matchedInc,
            ) ?? selectedTc;
          onStartGame({
            mode: 'online-ws',
            timeId: matchedTc.id,
            matchedInitialSeconds: matchedInit,
            matchedIncrementSeconds: matchedInc,
            serverSource: typeof msg.serverSource === 'string' ? (msg.serverSource as ChessServerName) : 'OpenChess',
            wsRoomId: msg.roomId,
            wsAction: 'join',
            color: msg.yourColor,
          });
        }
      } catch {
        // ignore
      }
    };
    ws.onerror = () => {
      setMyPostedChallengeId(null);
      setSeekError('Unable to post open challenge right now.');
    };
  };

  const handleCancelOpenChallenge = () => {
    const chId = myPostedChallengeId;
    if (wsLobbyRef.current && wsLobbyRef.current.readyState === WebSocket.OPEN && chId) {
      wsLobbyRef.current.send(JSON.stringify({ type: 'lobby:cancel', challengeId: chId }));
      wsLobbyRef.current.close();
    }
    wsLobbyRef.current = null;
    setMyPostedChallengeId(null);
    void loadLobbyChallenges();
  };

  const handleAcceptOpenChallenge = (ch: OpenChallengeItem) => {
    setSeekError(null);
    const playerAvatarUrl =
      loadUserAvatar(lichessSession?.account.username) ||
      lichessSession?.account.profile?.avatarUrl ||
      undefined;
    const playerFlag =
      lichessSession?.account.profile?.flag ||
      lichessSession?.account.profile?.country ||
      undefined;
    const resolvedPlayerName = lichessSession?.account.username ?? loadGuestPlayerName();

    if (ch.source === 'network' || ch.source === 'fics') {
      const isFics = ch.source === 'fics';
      if (isFics && !ch.ficsAdId) {
        startWsQuickMatch();
        return;
      }
      if (!isFics && !ch.hookId) {
        startWsQuickMatch();
        return;
      }
      cancelSearch();
      setSeekingState('ws-queue');
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/chess`);
      wsQueueRef.current = ws;
      let pingTimer: number | null = null;

      ws.onopen = () => {
        ws.send(
          JSON.stringify(
            isFics
              ? {
                  type: 'join_fics_ad',
                  token: lichessSession?.accessToken,
                  adId: ch.ficsAdId,
                  name: resolvedPlayerName,
                  avatarUrl: playerAvatarUrl,
                  flag: playerFlag,
                  initialSeconds: ch.initialSeconds,
                  incrementSeconds: ch.incrementSeconds,
                  color: ch.color === 'white' ? 'b' : ch.color === 'black' ? 'w' : color,
                  playerElo: getPlayerCategoryElo(),
                }
              : {
                  type: 'join_network_hook',
                  token: lichessSession?.accessToken,
                  hookId: ch.hookId,
                  name: resolvedPlayerName,
                  avatarUrl: playerAvatarUrl,
                  flag: playerFlag,
                  initialSeconds: ch.initialSeconds,
                  incrementSeconds: ch.incrementSeconds,
                  color: ch.color === 'white' ? 'b' : ch.color === 'black' ? 'w' : color,
                  playerElo: getPlayerCategoryElo(),
                },
          ),
        );
        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch {
              // ignore
            }
          }
        }, 20_000);
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(String(e.data));
          if (msg.type === 'room:matched' && msg.roomId) {
            if (pingTimer) window.clearInterval(pingTimer);
            ws.close();
            wsQueueRef.current = null;
            setSeekingState('idle');
            const matchedInit =
              typeof msg.initialSeconds === 'number' ? msg.initialSeconds : ch.initialSeconds;
            const matchedInc =
              typeof msg.incrementSeconds === 'number' ? msg.incrementSeconds : ch.incrementSeconds;
            const matchedTc =
              TIME_CONTROLS.find(
                (t) =>
                  t.initialSeconds === matchedInit && t.incrementSeconds === matchedInc,
              ) ?? selectedTc;
            const formattedTc = formatOnlineTimeControl(matchedInit, matchedInc);
            onStartGame({
              mode: 'online-ws',
              timeId:
                matchedTc.initialSeconds === matchedInit && matchedTc.incrementSeconds === matchedInc
                  ? matchedTc.id
                  : formattedTc.id,
              matchedInitialSeconds: matchedInit,
              matchedIncrementSeconds: matchedInc,
              serverSource:
                typeof msg.serverSource === 'string'
                  ? (msg.serverSource as ChessServerName)
                  : ch.server ?? (isFics ? 'FICS' : 'Lichess'),
              wsRoomId: msg.roomId,
              wsAction: 'join',
              color: msg.yourColor,
            });
          } else if (msg.type === 'room:error' || msg.type === 'error') {
            if (pingTimer) window.clearInterval(pingTimer);
            setSeekError(msg.error || msg.message || 'That live challenge was already taken.');
            ws.close();
            wsQueueRef.current = null;
            setSeekingState('idle');
            void loadLobbyChallenges();
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (pingTimer) window.clearInterval(pingTimer);
      };
      ws.onerror = () => {
        if (pingTimer) window.clearInterval(pingTimer);
        setSeekingState('idle');
        setSeekError('Unable to join that live challenge right now.');
      };
      return;
    }

    cancelSearch();
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/chess`);
    wsQueueRef.current = ws;
    let acceptPing: number | null = null;
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'lobby:accept',
          token: lichessSession?.accessToken,
          challengeId: ch.id,
          name: resolvedPlayerName,
          avatarUrl: playerAvatarUrl,
          flag: playerFlag,
          playerElo: getPlayerCategoryElo(),
        }),
      );
      acceptPing = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping' }));
          } catch {
            // ignore
          }
        }
      }, 20_000);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data));
        if (msg.type === 'room:matched' && msg.roomId) {
          if (acceptPing) window.clearInterval(acceptPing);
          ws.close();
          if (wsQueueRef.current === ws) wsQueueRef.current = null;
          const matchedInit =
            typeof msg.initialSeconds === 'number' ? msg.initialSeconds : ch.initialSeconds;
          const matchedInc =
            typeof msg.incrementSeconds === 'number' ? msg.incrementSeconds : ch.incrementSeconds;
          const matchedTc =
            TIME_CONTROLS.find(
              (t) =>
                t.initialSeconds === matchedInit && t.incrementSeconds === matchedInc,
            ) ?? selectedTc;
          onStartGame({
            mode: 'online-ws',
            timeId: matchedTc.id,
            matchedInitialSeconds: matchedInit,
            matchedIncrementSeconds: matchedInc,
            serverSource:
              typeof msg.serverSource === 'string'
                ? (msg.serverSource as ChessServerName)
                : ch.server ?? 'OpenChess',
            wsRoomId: msg.roomId,
            wsAction: 'join',
            color: msg.yourColor,
          });
        } else if (msg.type === 'error' || msg.type === 'room:error') {
          if (acceptPing) window.clearInterval(acceptPing);
          setSeekError(msg.message || msg.error || 'Challenge is no longer available.');
          ws.close();
          if (wsQueueRef.current === ws) wsQueueRef.current = null;
          void loadLobbyChallenges();
        }
      } catch {
        // ignore
      }
    };
    ws.onclose = () => {
      if (acceptPing) window.clearInterval(acceptPing);
    };
    ws.onerror = () => {
      if (acceptPing) window.clearInterval(acceptPing);
      if (wsQueueRef.current === ws) wsQueueRef.current = null;
      setSeekError('Unable to accept challenge right now.');
    };
  };

  const handleChallengeFriendUser = async () => {
    if (!challengeUsername.trim()) return;
    const roomCode = generateChallengeRoomCode();
    if (lichessSession?.hasOnlineToken) {
      setActionLoading(true);
      try {
        await fetch('/api/lichess/challenge/user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${lichessSession.accessToken}`,
          },
          body: JSON.stringify({
            username: challengeUsername.trim(),
            limit: selectedTc.initialSeconds,
            increment: selectedTc.incrementSeconds,
            rated,
            color: color === 'w' ? 'white' : color === 'b' ? 'black' : 'random',
          }),
        });
      } catch {
        // fallback to OpenChess room
      } finally {
        setActionLoading(false);
      }
    }
    onStartGame({
      mode: 'online-ws',
      timeId: selectedTc.id,
      wsAction: 'create',
      wsRoomId: roomCode,
      color,
    });
  };

  const challengeLinkUrl = `${getShareableAppOrigin()}/?room=${encodeURIComponent(customRoomCode)}`;
  const activeBoardPalette = BOARD_THEME_PALETTES[boardTheme] ?? BOARD_THEME_PALETTES.green;
  const searchPlayerName = lichessSession?.account.username ?? loadGuestPlayerName();
  const searchPlayerElo = matchStatusInfo?.elo ?? getPlayerCategoryElo();
  const searchPlayerAvatar =
    loadUserAvatar(lichessSession?.account.username) ||
    lichessSession?.account.profile?.avatarUrl ||
    undefined;
  const searchPlayerFlag = countryCodeToFlagEmoji(
    lichessSession?.account.profile?.flag ||
      lichessSession?.account.profile?.country,
  );
  const formattedClockBadge =
    selectedTc.incrementSeconds > 0
      ? `${Math.floor(selectedTc.initialSeconds / 60)} | ${selectedTc.incrementSeconds}`
      : `${Math.floor(selectedTc.initialSeconds / 60)}:00`;
  const activeTip =
    SEARCHING_COACH_TIPS[Math.floor(searchElapsedSec / 5) % SEARCHING_COACH_TIPS.length];

  if (seekingState === 'rated-empty') {
    const emptyElo = matchStatusInfo?.elo ?? searchPlayerElo;
    const emptyBand = getFairMatchmakingEloBand(emptyElo, MAX_MATCHMAKING_ELO_GAP);
    return (
      <div
        data-testid="matchmaking-rated-empty"
        className="max-w-md mx-auto space-y-4 pt-2 pb-6 animate-view-enter"
      >
        <div className="flex items-center justify-between px-1 py-1">
          <button
            type="button"
            onClick={cancelSearch}
            aria-label="Back to New Game"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#C8C4BC] hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-base font-extrabold text-white font-display">Matchmaking</span>
          <div className="w-10" />
        </div>

        <div className="p-5 rounded-2xl bg-[#262421] border border-white/10 space-y-4 shadow-xl">
          <div className="space-y-1.5 text-center">
            <div className="w-11 h-11 rounded-xl bg-[#312E2A] border border-white/10 mx-auto flex items-center justify-center">
              <Clock className="w-5 h-5 text-[#F7C045]" />
            </div>
            <h2 className="text-lg font-extrabold text-white font-display">
              No Rated Players Online Right Now
            </h2>
            <p className="text-xs text-[#C8C4BC] leading-relaxed">
              No named rated opponents within{' '}
              <span className="font-mono font-bold text-white">
                {matchStatusInfo?.minElo ?? emptyBand.minElo}–{matchStatusInfo?.maxElo ?? emptyBand.maxElo} Elo
              </span>{' '}
              were found in the {selectedTc.label} rated queue.
            </p>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => startWsQuickMatch(true)}
              className="w-full min-h-[48px] px-4 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-4 border-[#457524] active:border-b-0 active:translate-y-[1px] text-[#191815] font-extrabold text-sm cursor-pointer transition-all"
            >
              Play Live Casual Match (Unrated)
            </button>
            <button
              type="button"
              onClick={() => startWsQuickMatch(false)}
              className="w-full min-h-[44px] px-4 rounded-xl bg-[#393734] hover:bg-[#43403C] text-white font-bold text-sm cursor-pointer transition-colors"
            >
              Search Rated Queue Again
            </button>
            <button
              type="button"
              onClick={() => {
                cancelSearch();
                onStartGame({
                  mode: 'online-ws',
                  timeId: selectedTc.id,
                  wsAction: 'create',
                  rated,
                  color,
                });
              }}
              className="w-full min-h-[44px] px-4 rounded-xl bg-[#1E1C19] hover:bg-[#2C2925] border border-white/10 text-[#DEDAD2] font-bold text-sm cursor-pointer transition-colors"
            >
              Open Private / Friend Room
            </button>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-white/8 text-xs">
            <button
              type="button"
              onClick={() => {
                cancelSearch();
                onOpenBots();
              }}
              className="font-bold text-[#7FC4ED] hover:underline cursor-pointer"
            >
              Play Bots Instead
            </button>
            {(!lichessSession || !lichessSession.hasOnlineToken) && (
              <button
                type="button"
                onClick={() => {
                  cancelSearch();
                  onConnectLichess();
                }}
                className="font-bold text-[#9ED666] hover:underline cursor-pointer"
              >
                {lichessSession ? 'Link Chess Account' : 'Sign In for Rated Account'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (seekingState !== 'idle') {
    return (
      <div
        data-testid="matchmaking-searching-card"
        className="max-w-md mx-auto min-h-[calc(100dvh-2rem)] lg:min-h-[680px] flex flex-col justify-between py-2 select-none animate-view-enter"
      >
        {/* Top Bar: Back arrow, OpenChess emblem & wordmark, live signal bars */}
        <div className="flex items-center justify-between px-2 py-1">
          <button
            type="button"
            onClick={cancelSearch}
            aria-label="Cancel search and go back"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[#C8C4BC] hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-2">
            <svg viewBox="0 0 28 28" className="w-7 h-7 shrink-0" aria-hidden="true">
              <path
                d="M14 3.5a3.7 3.7 0 1 0 0 7.4 3.7 3.7 0 0 0 0-7.4zm-3.2 8.4c-.7 0-1.3.4-1.6 1-.3.6-.2 1.3.3 1.8l.9 1-2.5 5.4c-.4.8.2 1.8 1.1 1.8h10c.9 0 1.5-1 1.1-1.8l-2.5-5.4.9-1c.5-.5.6-1.2.3-1.8-.3-.6-.9-1-1.6-1h-6.4zM7 24.2c0-.7.6-1.2 1.2-1.2h11.6c.7 0 1.2.5 1.2 1.2s-.5 1.3-1.2 1.3H8.2c-.6 0-1.2-.6-1.2-1.3z"
                fill="#76B041"
              />
            </svg>
            <span className="text-xl font-extrabold text-white tracking-tight font-display">
              OpenChess
            </span>
          </div>

          <div
            className="min-w-[44px] min-h-[44px] flex items-center justify-center"
            title={wsConnectedSignal ? 'Live server connected' : 'Connecting...'}
            aria-label="Connection signal"
          >
            <div className="flex items-end gap-[3px] h-5">
              {[0, 1, 2, 3].map((barIdx) => (
                <span
                  key={barIdx}
                  className={`w-[4px] rounded-t-sm transition-colors ${
                    wsConnectedSignal ? 'bg-[#8E8980]' : 'bg-[#5A5752]'
                  }`}
                  style={{ height: `${8 + barIdx * 4}px` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Coach Avatar + White Speech Bubble Tip */}
        <div className="flex items-end gap-3 px-3 py-2">
          <div className="shrink-0">
            <BotAvatar botId={activeCoach.id} size={74} className="rounded-xl shadow-md" />
          </div>
          <div className="relative flex-1 bg-white text-[#22201D] rounded-2xl px-4 py-3.5 shadow-lg">
            {/* Speech bubble pointer tail */}
            <svg
              viewBox="0 0 12 16"
              className="w-3 h-4 absolute -left-2.5 bottom-4 text-white fill-current"
              aria-hidden="true"
            >
              <path d="M12 0 L0 10 L12 14 Z" />
            </svg>
            <p className="text-[14px] sm:text-[15px] font-medium leading-snug text-[#22201D]">
              {activeTip}
            </p>
          </div>
        </div>

        {/* Full-Width Square Chessboard Backdrop with Half-Dimmed Overlay & Searching Indicator */}
        <div className="relative w-full aspect-square max-w-[440px] mx-auto overflow-hidden shadow-2xl my-1">
          <div className="grid grid-cols-8 grid-rows-8 w-full h-full" aria-hidden="true">
            {Array.from({ length: 64 }, (_, idx) => {
              const r = Math.floor(idx / 8);
              const c = idx % 8;
              const isLight = (r + c) % 2 === 0;
              return (
                <div
                  key={idx}
                  style={{
                    backgroundColor: isLight
                      ? activeBoardPalette.light
                      : activeBoardPalette.dark,
                  }}
                />
              );
            })}
          </div>

          {/* Top 4 ranks dimmed dark-slate like reference screenshot */}
          <div
            className="absolute inset-x-0 top-0 h-[50%] bg-[#2E2C29]/78 pointer-events-none"
            aria-hidden="true"
          />

          {/* Centered Searching... heading + green stopwatch tile */}
          <div className="absolute inset-0 flex flex-col items-center justify-center -mt-3 px-4 text-center">
            <h2 className="text-[30px] sm:text-[34px] font-extrabold text-white tracking-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
              Searching...
            </h2>
            <div className="mt-3 w-15 h-15 rounded-2xl bg-[#2E2C29]/90 border-2 border-white/25 shadow-xl flex items-center justify-center backdrop-blur-[1px]">
              <svg viewBox="0 0 40 40" className="w-9 h-9" aria-hidden="true">
                {/* Top stopwatch button */}
                <rect x="17" y="4" width="6" height="3.5" rx="1.2" fill="#81B64C" />
                <rect x="18.5" y="7" width="3" height="2.5" fill="#81B64C" />
                {/* Side pusher */}
                <rect
                  x="29.5"
                  y="9.5"
                  width="3.2"
                  height="4.5"
                  rx="1"
                  transform="rotate(40 29.5 9.5)"
                  fill="#81B64C"
                />
                {/* Outer green bezel */}
                <circle cx="20" cy="22" r="12.5" fill="#81B64C" />
                {/* Crisp white stopwatch dial */}
                <circle cx="20" cy="22" r="9.3" fill="#FFFFFF" />
                {/* Tick hand + center pin */}
                <path
                  d="M20 22 L20 15.2"
                  stroke="#312E2B"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
                <circle cx="20" cy="22" r="1.8" fill="#312E2B" />
              </svg>
            </div>
            {searchElapsedSec >= 8 && (
              <button
                type="button"
                onClick={() => {
                  cancelSearch();
                  onStartGame({
                    mode: 'online-ws',
                    timeId: selectedTc.id,
                    wsAction: 'create',
                    color,
                  });
                }}
                className="mt-4 px-3.5 py-1.5 rounded-lg bg-[#262421]/90 hover:bg-[#312E2B] border border-white/20 text-xs font-bold text-[#E6E2DA] shadow-lg cursor-pointer"
              >
                Open Room Instead
              </button>
            )}
          </div>
        </div>

        {/* Bottom Player Strip + Cancel X */}
        <div className="space-y-4 pt-2 pb-1 px-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <PlayerAvatar
                username={searchPlayerName}
                avatarUrl={searchPlayerAvatar}
                isCurrentUser
                size={46}
                rounded="rounded-lg"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[15px] font-extrabold text-white truncate">
                    {searchPlayerName}
                  </span>
                  {searchPlayerFlag && (
                    <span className="text-sm leading-none shrink-0">{searchPlayerFlag}</span>
                  )}
                </div>
                <div className="text-xs font-mono font-bold text-[#B8B4AC] tabular-nums">
                  {searchPlayerElo}
                </div>
              </div>
            </div>

            <div className="min-w-[88px] px-4 py-2.5 rounded-lg bg-[#9B9994] text-[#1E1C19] font-mono font-extrabold text-base text-center tabular-nums shrink-0 shadow-sm">
              {formattedClockBadge}
            </div>
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={cancelSearch}
              aria-label="Cancel matchmaking"
              className="w-12 h-12 rounded-full flex items-center justify-center text-[#9E998F] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-8 h-8 stroke-[2.5]" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const myElo = getPlayerCategoryElo();
  const { minElo: minBand, maxElo: maxBand } = getFairMatchmakingEloBand(
    myElo,
    MAX_MATCHMAKING_ELO_GAP,
  );
  const totalPoolTables = lobbyServers.reduce((sum, s) => sum + (Number(s.count) || 0), 0);
  const totalPlayingCount = Math.max(activePoolPlayers.length, totalPoolTables);

  const renderCategoryTimeIcon = (cat: string, cls = 'w-5 h-5 shrink-0') => {
    if (cat === 'Blitz') return <BlitzBoltIcon className={cls} />;
    if (cat === 'Bullet') return <BulletIcon className={cls} />;
    return <RapidStopwatchIcon className={cls} />;
  };

  return (
    <div className="max-w-[1160px] mx-auto pb-8 lg:pb-2">
      {/* Mobile Clean Top Header (< lg) — Exact Latest Mobile App "New Game" Header (No Chessboard) */}
      <div className="lg:hidden flex items-center justify-between px-1 pt-1 pb-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Home"
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#C8C4BC] hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2.5">
          <NavPlayIcon className="w-7 h-7 shrink-0" />
          <h1 className="text-[22px] font-extrabold font-display tracking-tight text-white">
            New Game
          </h1>
        </div>
        <div className="w-[40px]" />
      </div>

      {/* Desktop 2-Column Play Online Layout / Mobile Full-Bleed Clean Menu (No Board on Mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px] gap-3 lg:gap-5 items-start">
        {/* Desktop-Only Left Column: Full Board + Opponent/Player Strips + Rectangular Clocks */}
        <div className="hidden lg:flex w-full max-w-[min(calc(100dvh-112px),760px)] mx-auto flex-col gap-2">
          {/* Opponent Top Strip (Desktop) — Exact Chess.com /play/online */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <PlayerAvatar
                username="Opponent"
                size={38}
                rounded="rounded-[3px]"
              />
              <span className="text-[14px] font-bold text-white truncate">Opponent</span>
            </div>
            <div className="w-[122px] h-[40px] rounded-[4px] bg-[#262421] text-[#8B8985] font-mono font-bold text-[21px] tabular-nums flex items-center justify-end px-3 select-none">
              {formattedClockBadge}
            </div>
          </div>

          {/* Crisp Full-Size Chessboard (Desktop only) */}
          <div className="w-full aspect-square pointer-events-none select-none">
            <ChessBoard
              fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
              theme={boardTheme}
              interactive={false}
              onMove={() => false}
            />
          </div>

          {/* Player Bottom Strip + Rectangular Light Clock (Desktop) */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <PlayerAvatar
                username={searchPlayerName}
                avatarUrl={searchPlayerAvatar}
                isCurrentUser
                size={38}
                rounded="rounded-[3px]"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[14px] font-bold text-white truncate">
                    {searchPlayerName}
                  </span>
                  {searchPlayerFlag && (
                    <span className="text-sm leading-none shrink-0">{searchPlayerFlag}</span>
                  )}
                  <span className="text-[13px] font-normal text-[#9B9A97] tabular-nums">
                    ({myElo})
                  </span>
                </div>
              </div>
            </div>

            <div className="w-[122px] h-[40px] rounded-[4px] bg-[#9E9D9B] text-[#262421] font-mono font-bold text-[21px] tabular-nums flex items-center justify-end px-3 select-none">
              {formattedClockBadge}
            </div>
          </div>
        </div>

        {/* Right Column (Desktop Dock) / Full-Screen Clean Stack (Mobile) */}
        <aside className="w-full max-w-[460px] lg:max-w-none mx-auto rounded-none lg:rounded-[5px] bg-transparent lg:bg-[#262421] overflow-hidden flex flex-col lg:min-h-[min(calc(100dvh-2rem),836px)] lg:shadow-[0_6px_22px_rgba(0,0,0,0.28)]">
          {/* Desktop Flush 3-Tab Header: New Game | Games | Players (Hidden on clean mobile New Game screen unless switching tabs) */}
          <div
            className={`${rightTab === 'new-game' ? 'hidden lg:grid' : 'grid'} grid-cols-3 bg-[#1F1E1B]`}
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === 'new-game'}
              onClick={() => setRightTab('new-game')}
              className={`py-3 flex flex-col items-center justify-center gap-1 text-[12px] font-bold transition-colors cursor-pointer ${
                rightTab === 'new-game'
                  ? 'bg-[#262421] text-white'
                  : 'text-[#9B9A97] hover:text-white'
              }`}
            >
              <PlusSquare className="w-[18px] h-[18px]" />
              <span>New Game</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === 'games'}
              onClick={() => setRightTab('games')}
              className={`py-3 flex flex-col items-center justify-center gap-1 text-[12px] font-bold transition-colors cursor-pointer ${
                rightTab === 'games'
                  ? 'bg-[#262421] text-white'
                  : 'text-[#9B9A97] hover:text-white'
              }`}
            >
              <span className="relative">
                <Grid2x2 className="w-[18px] h-[18px]" />
                {lobbyChallenges.length > 0 && (
                  <span className="absolute -top-1 -right-2.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[#81B64C] text-[#191815] text-[9px] font-extrabold flex items-center justify-center tabular-nums">
                    {lobbyChallenges.length}
                  </span>
                )}
              </span>
              <span>Games</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rightTab === 'players'}
              onClick={() => setRightTab('players')}
              className={`py-3 flex flex-col items-center justify-center gap-1 text-[12px] font-bold transition-colors cursor-pointer ${
                rightTab === 'players'
                  ? 'bg-[#262421] text-white'
                  : 'text-[#9B9A97] hover:text-white'
              }`}
            >
              <Users className="w-[18px] h-[18px]" />
              <span>Players</span>
            </button>
          </div>

          {/* TAB 1: NEW GAME */}
          {rightTab === 'new-game' && (
            <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                {/* Time Control Dropdown Button */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setTimePickerOpen((v) => !v)}
                    className="w-full h-[50px] px-4 rounded-[8px] bg-[#383633] hover:bg-[#43403C] flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <span className="w-5" />
                    <span className="flex items-center gap-2.5 text-[15px] font-extrabold text-white">
                      {renderCategoryTimeIcon(selectedTc.category, 'w-5 h-5 shrink-0')}
                      <span>
                        {selectedTc.label}
                        <span className="hidden lg:inline"> ({selectedTc.category})</span>
                      </span>
                    </span>
                    <ChevronDown
                      className={`w-5 h-5 text-[#9B9A97] transition-transform ${
                        timePickerOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {timePickerOpen && (
                    <div className="grid grid-cols-4 gap-1.5 p-2 rounded-[8px] bg-[#1F1E1B] animate-view-enter">
                      {TIME_CONTROLS.map((tc) => (
                        <button
                          key={tc.id}
                          type="button"
                          onClick={() => {
                            setTimeId(tc.id);
                            setTimePickerOpen(false);
                          }}
                          className={`py-2 px-1 rounded-[6px] text-center cursor-pointer transition-colors border-2 ${
                            timeId === tc.id
                              ? 'bg-[#363431] border-[#81B64C] text-white'
                              : 'bg-[#2A2825] border-transparent text-[#C8C6C2] hover:bg-[#34322F]'
                          }`}
                        >
                          <div className="text-xs font-bold tabular-nums">{tc.label}</div>
                          <div className="text-[10px] text-[#9B9A97]">{tc.category}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Primary 3D Beveled Green Start Game CTA */}
                <button
                  type="button"
                  data-start-online="true"
                  onClick={() => {
                    if (canSeekGlobalAccountPool) {
                      void startLiveBoardSeek();
                    } else {
                      startWsQuickMatch(false);
                    }
                  }}
                  className="w-full h-[58px] rounded-[10px] cc-btn-primary text-white font-extrabold font-display text-[21px] cursor-pointer"
                >
                  Start Game
                </button>

                {(seekError || lichessAuthError) && (
                  <div className="p-2.5 rounded-[6px] bg-[#5C2320]/80 text-xs text-[#F7C7C1]">
                    {seekError || lichessAuthError}
                  </div>
                )}

                {/* Secondary 3D Dark Action Stack (Matching Chess.com /play/online) */}
                <div className="space-y-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setMoreOpen((v) => !v)}
                    className="w-full h-[50px] px-4 rounded-[9px] cc-btn-secondary flex items-center justify-center gap-3 text-[15px] font-extrabold text-white cursor-pointer"
                  >
                    <CustomChallengeIcon className="w-6 h-6 shrink-0" />
                    <span>Custom Challenge</span>
                  </button>

                  {moreOpen && (
                    <div className="p-3.5 rounded-[8px] bg-[#1F1E1B] space-y-3 animate-view-enter">
                      <div
                        data-testid="fair-matchmaking-band"
                        className="flex items-center justify-between text-[11px] text-[#B8B6B2]"
                      >
                        <span>
                          Match Band ({selectedTc.category} {myElo})
                        </span>
                        <span className="font-mono font-bold text-[#9ED666] tabular-nums">
                          {minBand}–{maxBand} Elo
                        </span>
                      </div>

                      <div>
                        <div className="text-[11px] font-bold text-[#9B9A97] uppercase tracking-wider mb-1.5">
                          Play As
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['w', 'random', 'b'] as const).map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setColor(c)}
                              className={`py-2 rounded-[6px] text-xs font-bold capitalize cursor-pointer border-2 ${
                                color === c
                                  ? 'bg-[#363431] border-[#81B64C] text-white'
                                  : 'bg-[#2A2825] border-transparent text-[#9B9A97] hover:text-white'
                              }`}
                            >
                              {c === 'w' ? 'White' : c === 'b' ? 'Black' : 'Random'}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setRated((r) => !r)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-[6px] bg-[#2A2825] text-xs font-bold text-white cursor-pointer"
                      >
                        <span>Match Type</span>
                        <span className={rated ? 'text-[#81B64C]' : 'text-[#9B9A97]'}>
                          {rated ? 'Rated' : 'Casual'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCoachGuard((g) => !g)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-[6px] bg-[#2A2825] text-xs font-bold text-white cursor-pointer"
                      >
                        <span>Coach Blunder Guard</span>
                        <span className={coachGuard ? 'text-[#81B64C]' : 'text-[#9B9A97]'}>
                          {coachGuard ? 'On' : 'Off'}
                        </span>
                      </button>

                      <div className="pt-1 border-t border-white/[0.06] space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="text-[10px] font-bold text-[#9B9A97] uppercase tracking-wider flex items-center gap-1">
                              <Link2 className="w-3 h-3 text-[#81B64C]" />
                              <span>Private Room</span>
                            </div>
                            <div className="text-sm font-mono font-extrabold text-[#81B64C] tracking-widest">
                              {customRoomCode}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(customRoomCode).catch(() => {});
                                setCopiedCode(true);
                                window.setTimeout(() => setCopiedCode(false), 1800);
                              }}
                              className="px-2.5 py-1.5 rounded-[5px] bg-[#363431] text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              {copiedCode ? <Check className="w-3 h-3 text-[#81B64C]" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedCode ? 'Copied' : 'Code'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(challengeLinkUrl).catch(() => {});
                                setCopiedUrl(true);
                                window.setTimeout(() => setCopiedUrl(false), 1800);
                              }}
                              className="px-2.5 py-1.5 rounded-[5px] cc-btn-primary-sm text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                            >
                              {copiedUrl ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedUrl ? 'Copied' : 'Link'}</span>
                            </button>
                          </div>
                        </div>

                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                            placeholder="Join Room Code..."
                            className="flex-1 bg-[#2A2825] rounded-[6px] px-2.5 py-1.5 text-xs font-mono text-white placeholder:text-[#7E7C78]"
                          />
                          <button
                            type="button"
                            disabled={joinCode.trim().length < 4}
                            onClick={() =>
                              onStartGame({
                                mode: 'online-ws',
                                timeId: selectedTc.id,
                                wsAction: 'join',
                                wsRoomId: joinCode.trim(),
                              })
                            }
                            className="px-3 py-1.5 rounded-[6px] bg-[#383633] text-xs font-bold text-white cursor-pointer disabled:opacity-45"
                          >
                            Join
                          </button>
                        </div>

                        {panel === 'friend' && (
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              value={challengeUsername}
                              onChange={(e) => setChallengeUsername(e.target.value)}
                              placeholder="Challenge username..."
                              className="flex-1 bg-[#2A2825] rounded-[6px] px-2.5 py-1.5 text-xs text-white"
                            />
                            <button
                              type="button"
                              onClick={() => void handleChallengeFriendUser()}
                              disabled={actionLoading || !challengeUsername.trim()}
                              className="px-3 py-1.5 rounded-[6px] bg-[#383633] text-xs font-bold text-white cursor-pointer disabled:opacity-45"
                            >
                              Send
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={onOpenFriends}
                    className="w-full h-[54px] lg:h-[50px] px-4 rounded-[10px] lg:rounded-[9px] cc-btn-secondary flex items-center justify-center gap-3 text-[16px] lg:text-[15px] font-extrabold text-white cursor-pointer"
                  >
                    <NavFriendsIcon className="w-6 h-6 shrink-0 lg:hidden" />
                    <HandshakeIllustratedIcon className="hidden lg:block w-6 h-6 shrink-0" />
                    <span>Play a Friend</span>
                  </button>

                  <button
                    type="button"
                    onClick={onOpenBots}
                    className="w-full h-[54px] lg:h-[50px] px-4 rounded-[10px] lg:rounded-[9px] cc-btn-secondary flex items-center justify-center gap-3 text-[16px] lg:text-[15px] font-extrabold text-white cursor-pointer"
                  >
                    <NavBotsIcon className="w-6 h-6 shrink-0" />
                    <span>Play Bots</span>
                  </button>

                  <div className="relative flex items-center">
                    <button
                      type="button"
                      onClick={() =>
                        onStartGame({
                          timeId,
                          mode: 'coach',
                          color,
                          coachGuard: false,
                          coachId: activeCoachId,
                          coachStrength,
                        })
                      }
                      className="w-full h-[54px] lg:h-[50px] pl-4 pr-11 rounded-[10px] lg:rounded-[9px] cc-btn-secondary flex items-center justify-center gap-2.5 text-[16px] lg:text-[15px] font-extrabold text-white cursor-pointer"
                    >
                      <span className="w-6 h-6 rounded-[4px] overflow-hidden shrink-0">
                        <BotAvatar id={activeCoach.id} />
                      </span>
                      <span className="truncate">
                        <span className="lg:hidden">Play Coach</span>
                        <span className="hidden lg:inline">
                          Play {activeCoach.name} ({activeStrength.elo})
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCoachModalOpen(true)}
                      aria-label="Choose Coach"
                      title="Choose Coach"
                      className="absolute right-2.5 p-1.5 rounded bg-[#262421]/80 hover:bg-[#494642] text-[#A8A6A1] hover:text-white cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Mobile Subtle Bottom Expand Chevron (opens Open Games / Players) */}
                  <div className="lg:hidden flex flex-col items-center pt-1">
                    <button
                      type="button"
                      onClick={() => setRightTab('games')}
                      aria-label="More game modes and open challenges"
                      className="p-2 text-[#9B9A97] hover:text-white cursor-pointer"
                    >
                      <ChevronDown className="w-6 h-6" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Desktop Footer Stats */}
              <div
                data-testid="connected-chess-servers"
                className="hidden lg:block pt-4 border-t border-white/[0.06] text-center space-y-0.5 text-[12px] text-[#9B9A97] tabular-nums"
              >
                <div>
                  <span className="font-extrabold text-white">{totalPlayingCount}</span>{' '}
                  <span className="uppercase tracking-wider text-[11px]">Playing</span>
                </div>
                <div>
                  <span className="font-extrabold text-white">{lobbyChallenges.length}</span>{' '}
                  <span className="uppercase tracking-wider text-[11px]">Open Challenges</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: OPEN GAMES / CHALLENGES */}
          {rightTab === 'games' && (
            <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto max-h-[680px]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[14px] font-extrabold text-white font-display">
                  Open Challenges
                </h2>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void loadLobbyChallenges()}
                    disabled={lobbyLoading}
                    aria-label="Refresh Open Challenges"
                    className="p-1.5 rounded-[6px] bg-[#363431] hover:bg-[#43403C] text-[#DEDAD2] cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${lobbyLoading ? 'animate-spin' : ''}`} />
                  </button>
                  {myPostedChallengeId ? (
                    <button
                      type="button"
                      onClick={handleCancelOpenChallenge}
                      className="px-2.5 py-1.5 rounded-[6px] bg-[#CA3431]/25 text-[#F5B8B0] text-xs font-extrabold cursor-pointer"
                    >
                      Cancel Seek
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handlePostOpenChallenge}
                      className="px-3 py-1.5 rounded-[6px] cc-btn-primary-sm text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                    >
                      <Swords className="w-3.5 h-3.5" />
                      <span>Post Seek</span>
                    </button>
                  )}
                </div>
              </div>

              {lobbyChallenges.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#9B9A97] space-y-3">
                  <p>
                    No named challenges posted right now. Tap{' '}
                    <span className="text-white font-bold">Post Seek</span> to appear in the lobby.
                  </p>
                  {lichessOpenSeatsCount > 0 && (
                    <div className="p-3 rounded-[7px] bg-[#1F1E1B] flex items-center justify-between gap-2 text-left">
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-white truncate">
                          Casual Guest Pool · {lichessOpenSeatsCount} live seats
                        </div>
                        <div className="text-[11px] text-[#9B9A97] truncate">
                          Instant unrated live opponents
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => startWsQuickMatch(true)}
                        className="px-3 py-1.5 rounded-[6px] cc-btn-primary-sm text-white text-xs font-extrabold shrink-0 cursor-pointer"
                      >
                        Play Casual
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {lobbyChallenges.slice(0, 16).map((ch) => {
                    const isMine =
                      ch.id === myPostedChallengeId ||
                      (lichessSession?.account.username &&
                        ch.username.toLowerCase() === lichessSession.account.username.toLowerCase());
                    const isGenericName = isPlaceholderPlayerUsername(ch.username);
                    const flag = countryCodeToFlagEmoji(ch.flag);
                    const SpeedIcon =
                      ch.speed === 'bullet' ? Rocket : ch.speed === 'blitz' ? Zap : Clock;
                    return (
                      <div
                        key={ch.id}
                        className="p-2.5 rounded-[6px] bg-[#1F1E1B] hover:bg-[#2B2926] flex items-center justify-between gap-2 transition-colors"
                      >
                        <button
                          type="button"
                          disabled={isGenericName}
                          onClick={() => {
                            if (!isGenericName) onOpenPlayerProfile?.(ch.username);
                          }}
                          className={`flex items-center gap-2.5 min-w-0 flex-1 text-left ${
                            isGenericName ? 'cursor-default' : 'cursor-pointer'
                          }`}
                        >
                          <PlayerAvatar
                            username={ch.username}
                            avatarUrl={ch.avatarUrl}
                            size={32}
                            rounded="rounded-[4px]"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-extrabold text-white truncate">
                                {ch.username}
                              </span>
                              {flag && <span className="text-xs leading-none">{flag}</span>}
                              {typeof ch.rating === 'number' ? (
                                <span className="text-[11px] font-mono text-[#9B9A97]">
                                  ({ch.rating})
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono text-[#8A857C]">
                                  (Live)
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-[#9B9A97]">
                              <SpeedIcon className="w-3 h-3 text-[#81B64C]" />
                              <span>{ch.clock}</span>
                              <span>· {ch.rated ? 'Rated' : 'Casual'}</span>
                            </div>
                          </div>
                        </button>
                        {isMine ? (
                          <button
                            type="button"
                            onClick={handleCancelOpenChallenge}
                            className="px-2.5 py-1.5 rounded-[5px] bg-[#363431] text-xs font-bold text-[#F7C045] cursor-pointer shrink-0"
                          >
                            Waiting...
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAcceptOpenChallenge(ch)}
                            className="px-3 py-1.5 rounded-[5px] cc-btn-primary-sm text-white text-xs font-extrabold cursor-pointer shrink-0"
                          >
                            Accept
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {lichessOpenSeatsCount > 0 && (
                    <div className="p-2.5 rounded-[6px] bg-[#1F1E1B] flex items-center justify-between gap-2">
                      <span className="text-[11px] text-[#B8B6B2] truncate">
                        +{lichessOpenSeatsCount} casual unrated pool seats
                      </span>
                      <button
                        type="button"
                        onClick={() => startWsQuickMatch(true)}
                        className="px-2.5 py-1 rounded-[5px] bg-[#383633] hover:bg-[#43403C] text-[#9ED666] text-[11px] font-extrabold shrink-0 cursor-pointer"
                      >
                        Play Casual
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LIVE PLAYERS */}
          {rightTab === 'players' && (
            <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto max-h-[680px]">
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-extrabold text-white font-display">
                  Live Players
                </h2>
                <span className="text-xs font-mono text-[#9B9A97] tabular-nums">
                  {activePoolPlayers.length} online
                </span>
              </div>

              {activePoolPlayers.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#9B9A97]">
                  Refreshing live player pool...
                </div>
              ) : (
                <div className="space-y-1.5">
                  {activePoolPlayers.slice(0, 20).map((pl) => {
                    const flag = countryCodeToFlagEmoji(pl.flag);
                    const canOpenProfile = !isPlaceholderPlayerUsername(pl.username);
                    return (
                      <button
                        key={`${pl.server}-${pl.username}`}
                        type="button"
                        disabled={!canOpenProfile}
                        onClick={() => {
                          if (canOpenProfile) onOpenPlayerProfile?.(pl.username);
                        }}
                        className={`w-full p-2.5 rounded-[6px] bg-[#1F1E1B] flex items-center justify-between gap-2 text-left transition-colors ${
                          canOpenProfile ? 'hover:bg-[#2B2926] cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <PlayerAvatar
                            username={pl.username}
                            avatarUrl={pl.avatarUrl}
                            size={30}
                            rounded="rounded-[4px]"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              {pl.title && (
                                <span className="px-1 py-0.2 rounded bg-[#B33430] text-[9px] font-extrabold text-white shrink-0">
                                  {pl.title}
                                </span>
                              )}
                              <span className="text-xs font-bold text-white truncate">
                                {pl.username}
                              </span>
                              {flag && <span className="text-xs leading-none shrink-0">{flag}</span>}
                            </div>
                            <div className="text-[10px] text-[#81B64C] font-semibold">
                              {pl.online ? 'Online' : 'Live'}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-[#C8C6C2] tabular-nums shrink-0">
                          {typeof pl.rating === 'number' ? pl.rating : 'Unrated'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <CoachPickerModal
        open={coachModalOpen}
        coachId={activeCoachId}
        strengthId={coachStrength}
        confirmLabel="Play Selected Coach"
        onSelectCoach={(id) => {
          setLocalCoachId(id);
          saveSelectedCoachId(id);
          onCoachChange?.(id);
        }}
        onSelectStrength={(s) => {
          setCoachStrength(s);
          saveSelectedCoachStrength(s);
        }}
        onClose={() => setCoachModalOpen(false)}
        onConfirm={(chosenCoach, chosenStrength) => {
          setCoachModalOpen(false);
          onStartGame({
            timeId,
            mode: 'coach',
            color,
            coachGuard: false,
            coachId: chosenCoach,
            coachStrength: chosenStrength,
          });
        }}
      />
    </div>
  );
}
