import { useEffect, useRef, useState } from 'react';
import type { Color } from 'chess.js';
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  Monitor,
  Users,
  Link2,
  Copy,
  Check,
  Loader2,
  X,
  SlidersHorizontal,
  Swords,
  RefreshCw,
  Globe,
  Zap,
  Rocket,
} from 'lucide-react';
import { loadUserAvatar } from '../chess/avatars';
import { countryCodeToFlagEmoji, loadGuestPerfs, loadGuestPlayerName } from '../chess/analytics';
import {
  filterNamedOpenChallenges,
  getShareableAppOrigin,
  isPlaceholderPlayerUsername,
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

interface NewGameViewProps {
  initialTimeId?: string;
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
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [color, setColor] = useState<Color | 'random'>('w');
  const [rated, setRated] = useState(() => Boolean(lichessSession?.hasOnlineToken));
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

  const [seekingState, setSeekingState] = useState<'idle' | 'ws-queue' | 'live-seek'>('idle');
  const [seekError, setSeekError] = useState<string | null>(null);
  const wsQueueRef = useRef<WebSocket | null>(null);
  const wsLobbyRef = useRef<WebSocket | null>(null);
  const seekAbortRef = useRef<AbortController | null>(null);

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

  const startWsQuickMatch = () => {
    cancelSearch();
    setSeekError(null);
    setSeekingState('ws-queue');
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/chess`);
    wsQueueRef.current = ws;

    const playerElo = getPlayerCategoryElo();

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
        if (msg.type === 'room:matched' && msg.roomId) {
          if (queuePing) window.clearInterval(queuePing);
          ws.close();
          wsQueueRef.current = null;
          setSeekingState('idle');
          onStartGame({
            mode: 'online-ws',
            timeId: selectedTc.id,
            wsRoomId: msg.roomId,
            wsAction: 'join',
            color: msg.yourColor,
          });
        } else if (msg.type === 'room:error' || msg.type === 'error') {
          if (queuePing) window.clearInterval(queuePing);
          setSeekError(msg.error || msg.message || 'Unable to match right now.');
          ws.close();
          wsQueueRef.current = null;
          setSeekingState('idle');
        }
      } catch {
        // ignore
      }
    };
    ws.onclose = () => {
      if (queuePing) window.clearInterval(queuePing);
    };
    ws.onerror = () => {
      if (queuePing) window.clearInterval(queuePing);
      setSeekingState('idle');
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
          onStartGame({
            mode: 'online-ws',
            timeId: selectedTc.id,
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
            const matchedTc =
              TIME_CONTROLS.find(
                (t) =>
                  t.initialSeconds === ch.initialSeconds && t.incrementSeconds === ch.incrementSeconds,
              ) ?? selectedTc;
            onStartGame({
              mode: 'online-ws',
              timeId: matchedTc.id,
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
          const matchedTc =
            TIME_CONTROLS.find(
              (t) =>
                t.initialSeconds === ch.initialSeconds && t.incrementSeconds === ch.incrementSeconds,
            ) ?? selectedTc;
          onStartGame({
            mode: 'online-ws',
            timeId: matchedTc.id,
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

  return (
    <div className="max-w-md mx-auto space-y-3.5 pt-1 pb-6">
      {/* Top Header */}
      <div className="flex items-center justify-between px-1 py-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Home"
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#C8C4BC] hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <svg viewBox="0 0 28 28" className="w-7 h-7 shrink-0" aria-hidden="true">
            <rect width="28" height="28" rx="7" fill="#3D5927" />
            <circle cx="14" cy="9" r="3.4" fill="#FFFFFF" />
            <path
              d="M11 12.6c.8-.5 5.2-.5 6 0l-1.1 5.1c1.4 1 2.4 2.2 2.6 3.8H9.5c.2-1.6 1.2-2.8 2.6-3.8L11 12.6z"
              fill="#FFFFFF"
            />
            <rect x="8" y="22" width="12" height="2.2" rx="1.1" fill="#FFFFFF" />
          </svg>
          <h1 className="text-xl font-extrabold text-white font-display">New Game</h1>
        </div>

        <div className="w-10" />
      </div>

      {/* Time Control Selector */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setTimePickerOpen((v) => !v)}
          className="w-full min-h-[54px] px-4 rounded-xl bg-[#393734] hover:bg-[#43403C] flex items-center justify-between cursor-pointer transition-colors"
        >
          <span className="w-6" />
          <span className="flex items-center gap-2.5 text-base font-extrabold text-white">
            <Clock className="w-5 h-5 text-[#81B64C]" />
            <span>
              {selectedTc.label} ({selectedTc.category})
            </span>
          </span>
          <ChevronDown
            className={`w-5 h-5 text-[#9E998F] transition-transform ${
              timePickerOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {timePickerOpen && (
          <div className="grid grid-cols-4 gap-2 p-2.5 rounded-xl bg-[#262421] animate-view-enter">
            {TIME_CONTROLS.map((tc) => (
              <button
                key={tc.id}
                type="button"
                onClick={() => {
                  setTimeId(tc.id);
                  setTimePickerOpen(false);
                }}
                className={`py-2 px-1 rounded-lg text-center cursor-pointer transition-colors ${
                  timeId === tc.id
                    ? 'bg-[#393734] ring-2 ring-[#81B64C] text-white'
                    : 'bg-[#1E1C19] text-[#B8B4AC] hover:bg-[#302E2B]'
                }`}
              >
                <div className="text-xs font-bold tabular-nums">{tc.label}</div>
                <div className="text-[10px] text-[#9E998F]">{tc.category}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fair ±200 Elo Matchmaking Guarantee Banner */}
      {(() => {
        const myElo = getPlayerCategoryElo();
        const minBand = Math.max(100, myElo - 200);
        const maxBand = Math.min(3200, myElo + 200);
        return (
          <div
            data-testid="fair-matchmaking-band"
            className="px-3 py-2 rounded-xl bg-[#262421] border border-[#81B64C]/35 flex items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-[#81B64C] shrink-0" />
              <span className="text-[#C8C4BC] truncate">
                Your {selectedTc.category} Rating:{' '}
                <strong className="font-mono text-white">{myElo}</strong>
              </span>
            </div>
            <span className="px-2 py-0.5 rounded bg-[#81B64C]/15 border border-[#81B64C]/30 text-[11px] font-mono font-bold text-[#9ED666] shrink-0">
              ±200 Elo ({minBand}–{maxBand})
            </span>
          </div>
        );
      })()}

      {/* Primary Play CTA */}
      {seekingState === 'idle' ? (
        <button
          type="button"
          onClick={() => {
            if (canSeekGlobalAccountPool) {
              void startLiveBoardSeek();
            } else {
              startWsQuickMatch();
            }
          }}
          className="w-full min-h-[58px] rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[5px] border-[#457524] active:border-b-0 active:translate-y-[2px] text-white font-extrabold text-xl transition-all cursor-pointer shadow-lg"
        >
          Start Online Game
        </button>
      ) : (
        <div className="p-3.5 rounded-xl bg-[#262421] ring-1 ring-[#81B64C]/50 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Loader2 className="w-4 h-4 animate-spin text-[#81B64C]" />
              <span>
                {seekingState === 'live-seek'
                  ? `Searching Global Pool (${selectedTc.label} · ${rated ? 'Rated' : 'Casual'})...`
                  : `Finding Real Player (${selectedTc.label} · ${selectedTc.category})...`}
              </span>
            </div>
            <button
              type="button"
              onClick={cancelSearch}
              aria-label="Cancel matchmaking"
              className="p-1.5 rounded-lg bg-[#393734] text-[#DEDAD2] hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-[#C8C4BC]">
            <span>
              {seekingState === 'live-seek'
                ? 'Live match syncs directly to your chess account & ELO...'
                : 'Matching across OpenChess, Lichess, FICS & PlayStrategy...'}
            </span>
            <div className="flex items-center gap-3 shrink-0">
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
                className="font-bold text-[#DEDAD2] underline cursor-pointer"
              >
                Open Room
              </button>
              {!lichessSession && (
                <button
                  type="button"
                  onClick={() => {
                    cancelSearch();
                    onConnectLichess();
                  }}
                  className="font-bold text-[#81B64C] underline cursor-pointer"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {(seekError || lichessAuthError) && (
        <div className="p-2.5 rounded-lg bg-[#5C2320]/70 text-xs text-[#F7C7C1]">
          {seekError || lichessAuthError}
        </div>
      )}

      {/* Mode Cards */}
      <div className="space-y-2.5 pt-1">
        <button
          type="button"
          onClick={onOpenFriends}
          className="w-full min-h-[54px] px-4 rounded-xl bg-[#393734] hover:bg-[#43403C] flex items-center justify-center gap-2.5 text-base font-extrabold text-white transition-colors cursor-pointer"
        >
          <Users className="w-5 h-5 text-[#6FB3E0]" />
          <span>Play a Friend</span>
        </button>

        {panel === 'friend' && (
          <div className="p-3.5 rounded-xl bg-[#262421] space-y-3 animate-view-enter">
            <div className="p-3 rounded-xl bg-[#1A1917] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold text-[#9E998F] uppercase tracking-wider flex items-center gap-1">
                    <Link2 className="w-3 h-3 text-[#81B64C]" />
                    <span>OpenChess Room Code</span>
                  </div>
                  <div className="text-base font-mono font-extrabold text-[#81B64C] tracking-widest">
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
                    className="px-2.5 py-1.5 rounded bg-[#312E2A] text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
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
                    className="px-2.5 py-1.5 rounded bg-[#81B64C] text-[#191815] text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedUrl ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedUrl ? 'Link Copied' : 'Copy Link'}</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter Room Code..."
                className="flex-1 bg-[#1A1917] rounded-lg px-2.5 py-1.5 text-xs font-mono text-white"
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
                className="px-3 py-1.5 rounded-lg bg-[#312E2A] text-xs font-bold text-white cursor-pointer disabled:opacity-45"
              >
                Join
              </button>
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={challengeUsername}
                onChange={(e) => setChallengeUsername(e.target.value)}
                placeholder="Challenge friend username..."
                className="flex-1 bg-[#1A1917] rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
              <button
                type="button"
                onClick={() => void handleChallengeFriendUser()}
                disabled={actionLoading || !challengeUsername.trim()}
                className="px-3 py-1.5 rounded-lg bg-[#312E2A] text-xs font-bold text-white cursor-pointer disabled:opacity-45"
              >
                Challenge
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onOpenBots}
          className="w-full min-h-[54px] px-4 rounded-xl bg-[#393734] hover:bg-[#43403C] flex items-center justify-center gap-2.5 text-base font-extrabold text-white transition-colors cursor-pointer"
        >
          <Monitor className="w-5 h-5 text-[#7FC4ED]" />
          <span>Play Bots</span>
        </button>

        {/* Play Coach Row + Choose Coach Button */}
        <div className="rounded-xl bg-[#393734] p-1.5 flex items-center gap-1.5">
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
            className="flex-1 min-h-[46px] px-3 rounded-lg hover:bg-[#43403C] flex items-center gap-3 text-left transition-colors cursor-pointer"
          >
            <BotAvatar botId={activeCoach.id} size={34} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold text-white truncate">
                Play {activeCoach.name}
              </div>
              <div className="text-[11px] text-[#9E998F] truncate tabular-nums">
                {activeCoach.specialty} · {activeStrength.label} ({activeStrength.elo})
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setCoachModalOpen(true)}
            className="px-3 py-2.5 rounded-lg bg-[#262421] hover:bg-[#302E2B] text-xs font-bold text-[#81B64C] flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Choose</span>
          </button>
        </div>
      </div>

      {/* Extra Options */}
      <div className="pt-1 flex flex-col items-center">
        <button
          type="button"
          aria-label="Toggle extra game options"
          onClick={() => setMoreOpen((v) => !v)}
          className="p-2 text-[#9E998F] hover:text-white cursor-pointer"
        >
          <ChevronDown
            className={`w-6 h-6 transition-transform ${moreOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {moreOpen && (
          <div className="w-full mt-2 p-3.5 rounded-xl bg-[#262421] space-y-3 animate-view-enter">
            <div>
              <div className="text-xs font-bold text-[#B8B4AC] mb-1.5">Play As</div>
              <div className="grid grid-cols-3 gap-2">
                {(['w', 'random', 'b'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`py-2 rounded-lg text-xs font-bold capitalize cursor-pointer ${
                      color === c
                        ? 'bg-[#393734] ring-2 ring-[#81B64C] text-white'
                        : 'bg-[#1E1C19] text-[#9E998F] hover:text-white'
                    }`}
                  >
                    {c === 'w' ? 'White' : c === 'b' ? 'Black' : 'Random'}
                  </button>
                ))}
              </div>
            </div>

            {lichessSession && (
              <button
                type="button"
                onClick={() => setRated((r) => !r)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#1E1C19] text-xs font-semibold text-white cursor-pointer"
              >
                <span>Online Match Type</span>
                <span className={rated ? 'text-[#81B64C]' : 'text-[#9E998F]'}>
                  {rated ? 'Rated' : 'Casual'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setCoachGuard((g) => !g)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#1E1C19] text-xs font-semibold text-white cursor-pointer"
            >
              <span>Coach Blunder Guard</span>
              <span className={coachGuard ? 'text-[#81B64C]' : 'text-[#9E998F]'}>
                {coachGuard ? 'On' : 'Off'}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Live Open Challenges Lobby */}
      <section className="rounded-xl bg-[#262421] border border-white/10 p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#81B64C]" />
            <h2 className="text-sm font-extrabold text-white font-display">Open Challenges</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void loadLobbyChallenges()}
              disabled={lobbyLoading}
              aria-label="Refresh Open Challenges"
              className="p-1.5 rounded-lg bg-[#393734] hover:bg-[#43403C] text-[#DEDAD2] cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${lobbyLoading ? 'animate-spin' : ''}`} />
            </button>
            {myPostedChallengeId ? (
              <button
                type="button"
                onClick={handleCancelOpenChallenge}
                className="px-2.5 py-1.5 rounded-lg bg-[#CA3431]/20 border border-[#CA3431]/40 text-[#F5B8B0] text-xs font-extrabold cursor-pointer"
              >
                Cancel Seek
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePostOpenChallenge}
                className="px-2.5 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-[#191815] text-xs font-extrabold flex items-center gap-1 cursor-pointer"
              >
                <Swords className="w-3.5 h-3.5" />
                <span>Post Seek</span>
              </button>
            )}
          </div>
        </div>

        {/* Connected Free Chess Servers & Fallback Strip */}
        {lobbyServers.length > 0 && (
          <div
            data-testid="connected-chess-servers"
            className="grid grid-cols-2 gap-1.5"
          >
            {lobbyServers.map((srv) => (
              <div
                key={srv.name}
                className="px-2 py-1.5 rounded-lg bg-[#1E1C19] border border-white/8 flex items-center justify-between gap-1 min-w-0"
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      srv.ok ? 'bg-[#81B64C]' : 'bg-[#6F6A62]'
                    }`}
                  />
                  <span className="text-[10px] font-bold text-[#DEDAD2] truncate">
                    {srv.name}
                  </span>
                </div>
                {srv.count > 0 && (
                  <span className="text-[10px] font-mono text-[#9ED666] shrink-0">
                    {srv.count}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {lobbyChallenges.length === 0 ? (
          <div className="py-3 text-center text-xs text-[#9E998F] space-y-2">
            <div>
              No named challenges posted right now. Tap <span className="text-white font-bold">Post Seek</span> to appear in the lobby.
            </div>
            {lichessOpenSeatsCount > 0 && seekingState === 'idle' && (
              <div className="px-2.5 py-2 rounded-lg bg-[#1E1C19] border border-white/8 flex items-center justify-between gap-2 text-left">
                <div className="min-w-0">
                  <div className="text-[11px] font-extrabold text-white truncate">
                    Lichess Open Pool · {lichessOpenSeatsCount} live guest seats
                  </div>
                  <div className="text-[10px] text-[#9E998F] truncate">
                    Real players in casual lobby queue
                  </div>
                </div>
                <button
                  type="button"
                  onClick={startWsQuickMatch}
                  className="px-2.5 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-[#191815] text-[11px] font-extrabold shrink-0 cursor-pointer"
                >
                  Quick Match
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {lobbyChallenges.slice(0, 14).map((ch) => {
              const isMine =
                ch.id === myPostedChallengeId ||
                (lichessSession?.account.username &&
                  ch.username.toLowerCase() === lichessSession.account.username.toLowerCase());
              const isGenericName = isPlaceholderPlayerUsername(ch.username);
              const flag = countryCodeToFlagEmoji(ch.flag);
              const SpeedIcon =
                ch.speed === 'bullet' ? Rocket : ch.speed === 'blitz' ? Zap : Clock;
              const serverName = ch.server ?? (ch.source === 'network' ? 'Lichess' : 'OpenChess');
              return (
                <div
                  key={ch.id}
                  className="p-2.5 rounded-lg bg-[#1E1C19] border border-white/8 flex items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    disabled={isGenericName}
                    onClick={() => {
                      if (!isGenericName) {
                        onOpenPlayerProfile?.(ch.username);
                      }
                    }}
                    className={`flex items-center gap-2.5 min-w-0 flex-1 text-left ${
                      isGenericName ? 'cursor-default' : 'cursor-pointer hover:opacity-90'
                    }`}
                  >
                    <PlayerAvatar
                      username={ch.username}
                      avatarUrl={ch.avatarUrl}
                      size={32}
                      rounded="rounded-lg"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-white truncate">
                          {ch.username}
                        </span>
                        {flag && <span className="text-xs leading-none">{flag}</span>}
                        {typeof ch.rating === 'number' ? (
                          <span className="text-[11px] font-mono text-[#9E998F]">
                            ({ch.rating})
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-[#8A857C]">
                            (Live)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-[#9E998F]">
                        <SpeedIcon className="w-3 h-3 text-[#81B64C]" />
                        <span>{ch.clock}</span>
                        <span>· {ch.rated ? 'Rated' : 'Casual'}</span>
                        <span>· {serverName}</span>
                      </div>
                    </div>
                  </button>
                  {isMine ? (
                    <button
                      type="button"
                      onClick={handleCancelOpenChallenge}
                      className="px-2.5 py-1.5 rounded-lg bg-[#393734] text-xs font-bold text-[#F7C045] cursor-pointer shrink-0"
                    >
                      Waiting...
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleAcceptOpenChallenge(ch)}
                      className="px-3 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-white text-xs font-extrabold cursor-pointer shrink-0"
                    >
                      Accept
                    </button>
                  )}
                </div>
              );
            })}
            {lichessOpenSeatsCount > 0 && seekingState === 'idle' && (
              <div className="px-2.5 py-2 rounded-lg bg-[#1E1C19] border border-white/8 flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#B8B4AC] truncate">
                  +{lichessOpenSeatsCount} live Lichess casual pool seats
                </span>
                <button
                  type="button"
                  onClick={startWsQuickMatch}
                  className="px-2.5 py-1 rounded bg-[#393734] hover:bg-[#43403C] text-[#9ED666] text-[11px] font-extrabold shrink-0 cursor-pointer"
                >
                  Quick Match
                </button>
              </div>
            )}
          </div>
        )}

        {/* Active Real Players Across Free Chess Servers */}
        {activePoolPlayers.length > 0 && (
          <div className="pt-2 border-t border-white/8 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#9E998F] uppercase tracking-wider">
              <span>Live Players Across Servers</span>
              <span className="font-mono text-[#DEDAD2]">{activePoolPlayers.length} active</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
              {activePoolPlayers.slice(0, 12).map((pl) => {
                const flag = countryCodeToFlagEmoji(pl.flag);
                return (
                  <button
                    key={`${pl.server}-${pl.username}`}
                    type="button"
                    onClick={() => {
                      if (pl.server === 'OpenChess' || pl.server === 'Lichess' || pl.server === 'Chess.com') {
                        onOpenPlayerProfile?.(pl.username);
                      }
                    }}
                    className="p-2 rounded-lg bg-[#1E1C19] hover:bg-[#292622] border border-white/8 flex items-center gap-2 text-left min-w-0 cursor-pointer transition-colors"
                  >
                    <PlayerAvatar
                      username={pl.username}
                      avatarUrl={pl.avatarUrl}
                      size={26}
                      rounded="rounded-md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        {pl.title && (
                          <span className="text-[9px] font-extrabold text-[#F7C045] shrink-0">
                            {pl.title}
                          </span>
                        )}
                        <span className="text-[11px] font-bold text-white truncate">
                          {pl.username}
                        </span>
                        {flag && <span className="text-[10px] leading-none shrink-0">{flag}</span>}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-[#9E998F]">
                        <span>{pl.server}</span>
                        {typeof pl.rating === 'number' && (
                          <span className="font-mono text-[#C8C4BC]">{pl.rating}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

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
