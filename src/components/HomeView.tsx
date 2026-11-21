import { useEffect, useState } from 'react';
import type { Color } from 'chess.js';
import {
  Clock,
  Puzzle,
  Zap,
  Rocket,
  SearchCheck,
  UserPlus,
  Link2,
  User,
  Plus,
  Minus,
  Equal,
  ChevronRight,
  SlidersHorizontal,
  MessageSquare,
  Trash2,
  Flame,
  Grid2x2,
} from 'lucide-react';
import { BOT_PROFILES, type BotId } from '../chess/engine';
import { PUZZLES } from '../chess/content';
import type { BoardTheme } from '../chess/theme';
import {
  FEATURED_MASTER_GAMES,
  countryCodeToFlagEmoji,
  enrichGamePgnWithHeaders,
  formatGamePlayedAgo,
  formatLastSeenAgo,
  isGamePlayedAsBlack,
  loadGuestPerfs,
  loadGuestPlayerName,
  loadMatchHistory,
  loadPlayedGames,
  loadPuzzleStats,
  loadRushBest,
  mergeSyncedGames,
  summarizeTrainingDna,
} from '../chess/analytics';
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
import type { LichessFriendStatus, LichessUserGame } from '../chess/lichess';
import type { LichessSession } from '../chess/useLichessAuth';
import {
  loadLocalFriendsBackup,
  markFriendRemovedInBackup,
  mergeFriendsBackupWithServer,
  saveLocalFriendsBackup,
} from '../chess/onlineHelpers';
import type { NavTab } from './PrepView';
import type { PlayPreset } from './PlayView';
import { BotAvatar } from './BotAvatar';
import { PlayerAvatar } from './PlayerAvatar';
import { CoachPickerModal } from './CoachPickerModal';
import { ChessBoard } from './ChessBoard';
import {
  GoldMedalIcon,
  HandshakeIllustratedIcon,
  NavLearnIcon,
  NavPlayIcon,
  PuzzleNumberBadgeIcon,
} from './ChessIcons';

interface HomeViewProps {
  stats: {
    gamesPlayed: number;
    puzzlesSolved: number;
    lessonsCompleted: number;
  };
  dailyStreakDays?: number;
  boardTheme?: BoardTheme;
  lichessSession: LichessSession | null;
  lichessConnecting: boolean;
  lastSyncedAt?: number;
  friendListsVersion?: number;
  coachId?: CoachPersonaId;
  onCoachChange?: (id: CoachPersonaId) => void;
  onConnectLichess: () => void;
  onDisconnectLichess: () => void;
  onUpdateProfile?: (params: {
    username?: string;
    bio?: string;
    flag?: string;
    country?: string;
    avatarUrl?: string;
  }) => Promise<unknown>;
  onQuickPlay: (opts?: Omit<PlayPreset, 'nonce'>) => void;
  onOpenNewGame?: (timeId?: string) => void;
  onNavigate: (tab: NavTab) => void;
  onSendToReview: (pgn: string, color: Color, resultLabel: string) => void;
  onInviteFriend?: (username: string) => void;
  onOpenPlayerProfile?: (username: string) => void;
  onMessageFriend?: (username: string) => void;
  onRemoveFriend?: (username: string) => void;
}

export function HomeView({
  dailyStreakDays = 0,
  boardTheme = 'green',
  lichessSession,
  lichessConnecting,
  lastSyncedAt = 0,
  friendListsVersion = 0,
  coachId: externalCoachId,
  onCoachChange,
  onConnectLichess,
  onQuickPlay,
  onOpenNewGame,
  onNavigate,
  onSendToReview,
  onInviteFriend,
  onOpenPlayerProfile,
  onMessageFriend,
  onRemoveFriend,
}: HomeViewProps) {
  const [recentGames, setRecentGames] = useState<LichessUserGame[]>(() => loadPlayedGames().slice(0, 6));
  const [featuredGames, setFeaturedGames] = useState<LichessUserGame[]>(FEATURED_MASTER_GAMES);
  const [friends, setFriends] = useState<string[]>([]);
  const [friendStatuses, setFriendStatuses] = useState<Record<string, LichessFriendStatus>>({});
  const [localCoachId, setLocalCoachId] = useState<CoachPersonaId>(() => loadSelectedCoachId());
  const [coachStrength, setCoachStrength] = useState<CoachStrengthId>(() =>
    loadSelectedCoachStrength(),
  );
  const [coachModalOpen, setCoachModalOpen] = useState(false);
  const [quickTimeId, setQuickTimeId] = useState<'10+0' | '5+0' | '3+0'>('10+0');
  const [showMasterArchiveDesktop, setShowMasterArchiveDesktop] = useState(false);

  const activeCoachId = externalCoachId ?? localCoachId;
  const activeCoach = getCoachProfile(activeCoachId);
  const activeStrengthObj =
    COACH_STRENGTH_LEVELS.find((s) => s.id === coachStrength) ?? COACH_STRENGTH_LEVELS[1];

  useEffect(() => {
    document.body.dataset.state = 'home';
  }, []);

  useEffect(() => {
    let cancelled = false;
    const localGames = loadPlayedGames();
    setRecentGames(localGames.slice(0, 6));

    const username = lichessSession?.account.username;
    const token = lichessSession?.accessToken;
    if (!username && !token) return;

    const loadAll = async () => {
      const [acctData, netData] = await Promise.all([
        token
          ? fetch('/api/account/games', {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          : Promise.resolve(null),
        username
          ? fetch(`/api/lichess/games/${encodeURIComponent(username)}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            })
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      const acctGames = Array.isArray(acctData?.games) ? (acctData.games as LichessUserGame[]) : [];
      const netGames = Array.isArray(netData?.games) ? (netData.games as LichessUserGame[]) : [];
      setRecentGames(mergeSyncedGames(loadPlayedGames(), acctGames, netGames).slice(0, 6));
    };

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [
    lichessSession?.account.username,
    lichessSession?.accessToken,
    lichessSession?.account.count?.all,
    lastSyncedAt,
  ]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/lichess/games/DrNykterstein')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !Array.isArray(data?.games) || data.games.length === 0) return;
        const merged = mergeSyncedGames(data.games as LichessUserGame[], FEATURED_MASTER_GAMES);
        if (merged.length > 0) setFeaturedGames(merged.slice(0, 6));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!lichessSession?.accessToken) {
      setFriends([]);
      setFriendStatuses({});
      return;
    }
    const uname = lichessSession.account.username;
    const cached = loadLocalFriendsBackup(uname);
    if (cached.friends.length > 0 && friends.length === 0) {
      setFriends(cached.friends);
    }
    let cancelled = false;
    fetch('/api/account/friends', {
      headers: { Authorization: `Bearer ${lichessSession.accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (cancelled || !Array.isArray(data?.friends)) return;
        const merged = mergeFriendsBackupWithServer({
          serverFriends: data.friends.filter((x: unknown): x is string => typeof x === 'string'),
          serverOutgoing: Array.isArray(data.outgoingRequests) ? data.outgoingRequests : [],
          serverRemoved: Array.isArray(data.removedFriends) ? data.removedFriends : [],
          localBackup: loadLocalFriendsBackup(uname),
        });
        const list = merged.friends;
        saveLocalFriendsBackup(
          uname,
          merged.friends,
          merged.outgoingRequests,
          merged.removedFriends,
        );
        setFriends(list);
        if (list.length > 0) {
          const statusRes = await fetch('/api/lichess/users-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: list }),
          }).catch(() => null);
          if (!cancelled && statusRes?.ok) {
            const sData = await statusRes.json();
            if (Array.isArray(sData?.users)) {
              const map: Record<string, LichessFriendStatus> = {};
              for (const u of sData.users as LichessFriendStatus[]) {
                map[u.username.toLowerCase()] = u;
              }
              setFriendStatuses(map);
            }
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lichessSession?.accessToken, lichessSession?.account.username, lastSyncedAt, friendListsVersion]);

  const rushBest = loadRushBest();
  const dna = summarizeTrainingDna(loadMatchHistory());
  const puzzleStats = loadPuzzleStats();
  const guestPerfs = loadGuestPerfs();

  const perfs = lichessSession?.account.perfs;
  const rapidRating = lichessSession ? (perfs?.rapid?.rating ?? 1500) : guestPerfs.rapid.rating;
  const blitzRating = lichessSession ? (perfs?.blitz?.rating ?? 1500) : guestPerfs.blitz.rating;
  const bulletRating = lichessSession ? (perfs?.bullet?.rating ?? 1500) : guestPerfs.bullet.rating;
  const puzzleRating = lichessSession
    ? (perfs?.puzzle?.rating ?? puzzleStats.rating)
    : puzzleStats.rating;

  const openNewGameWithTime = (timeId?: string) => {
    if (onOpenNewGame) {
      onOpenNewGame(timeId);
    } else {
      onNavigate('new-game');
    }
  };

  const challengeFriend = (friendName: string) => {
    if (!lichessSession) {
      onConnectLichess();
      return;
    }
    if (onInviteFriend) {
      onInviteFriend(friendName);
      return;
    }
    onQuickPlay({
      mode: 'online-ws',
      timeId: '10+0',
      wsAction: 'create',
      color: 'w',
    });
  };

  const selectCoach = (id: CoachPersonaId) => {
    setLocalCoachId(id);
    saveSelectedCoachId(id);
    onCoachChange?.(id);
  };

  const selectStrength = (lvl: CoachStrengthId) => {
    setCoachStrength(lvl);
    saveSelectedCoachStrength(lvl);
  };

  const handleRemoveFriendCard = (friendName: string) => {
    const lower = friendName.toLowerCase();
    setFriends((prev) => prev.filter((f) => f.toLowerCase() !== lower));
    markFriendRemovedInBackup(lichessSession?.account.username, friendName);
    if (onRemoveFriend) {
      onRemoveFriend(friendName);
    } else if (lichessSession?.accessToken) {
      void fetch(`/api/account/friends/${encodeURIComponent(friendName)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${lichessSession.accessToken}` },
      }).catch(() => {});
    }
  };

  const playerDisplayName = lichessSession?.account.username ?? loadGuestPlayerName();
  const playerFlag = countryCodeToFlagEmoji(
    lichessSession?.account.profile?.flag || lichessSession?.account.profile?.country,
  );
  const featuredBot = BOT_PROFILES.find((b) => b.id === 'milo') ?? BOT_PROFILES[0];
  const heroPuzzle = PUZZLES[1] ?? PUZZLES[0];
  const dailyPuzzle = PUZZLES[0];
  const desktopGamesToShow =
    recentGames.length > 0 ? recentGames : showMasterArchiveDesktop ? featuredGames : [];

  return (
    <div className="max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto space-y-5 pb-24 lg:pb-6">
      {/* Desktop Dashboard — Exact 1:1 Chess.com Layout */}
      <div className="hidden lg:block space-y-5 pt-1">
        {/* Clean Top Player Header (Avatar + Username + Flag on left, Streak on right) */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="flex items-center gap-3 min-w-0 hover:opacity-90 cursor-pointer"
            >
              <PlayerAvatar
                username={playerDisplayName}
                avatarUrl={lichessSession?.account.profile?.avatarUrl}
                isCurrentUser
                size={36}
                rounded="rounded-[4px]"
              />
              <span className="text-[17px] font-extrabold text-white truncate tracking-tight">
                {playerDisplayName}
              </span>
              {playerFlag && <span className="text-lg leading-none">{playerFlag}</span>}
            </button>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('streak')}
            className="flex items-center gap-2 px-2.5 py-1 rounded-[6px] hover:bg-[#262421] text-[17px] font-extrabold font-display text-white tabular-nums cursor-pointer"
          >
            <Flame className="w-5 h-5 text-[#B4B1AC] fill-[#8B8883]" />
            <span>{dailyStreakDays} Day Streak</span>
          </button>
        </header>

        {/* Hero 4-Column Unified Dark Container */}
        <section className="rounded-[10px] bg-[#262421] p-4 grid lg:grid-cols-[248px_1fr_1fr_1fr] xl:grid-cols-[264px_1fr_1fr_1fr] gap-4 items-stretch">
          {/* Col 1: Play Online Quick Launcher */}
          <div className="flex flex-col justify-between gap-3">
            <div className="space-y-2.5">
              <h1 className="text-[17px] font-extrabold text-white font-display tracking-tight">
                Play Online
              </h1>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: '10+0', label: '10 min' },
                    { id: '5+0', label: '5 min' },
                    { id: '3+0', label: '3 min' },
                  ] as const
                ).map((tc) => {
                  const selected = quickTimeId === tc.id;
                  return (
                    <button
                      key={tc.id}
                      type="button"
                      onClick={() => setQuickTimeId(tc.id)}
                      className={`h-[44px] rounded-[8px] text-[13px] font-bold transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[#312E2B] text-white border-[2px] border-[#81B64C]'
                          : 'bg-[#312E2B] text-[#DAD8D4] hover:text-white border-[2px] border-transparent'
                      }`}
                    >
                      {tc.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                data-start="true"
                onClick={() => openNewGameWithTime(quickTimeId)}
                className="w-full h-[50px] rounded-[10px] cc-btn-primary text-white font-extrabold font-display text-[18px] cursor-pointer"
              >
                Start Game
              </button>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => openNewGameWithTime(quickTimeId)}
                className="w-full h-[46px] px-3 rounded-[9px] cc-btn-secondary flex items-center justify-center gap-2.5 text-[15px] font-extrabold text-white cursor-pointer"
              >
                <NavPlayIcon className="w-[24px] h-[24px] shrink-0" />
                <span>Play Online</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('leaderboard')}
                className="w-full h-[46px] px-3 rounded-[9px] cc-btn-secondary flex items-center justify-center gap-2.5 text-[15px] font-extrabold text-white cursor-pointer"
              >
                <GoldMedalIcon className="w-[24px] h-[24px] shrink-0" />
                <span>Leaderboard</span>
              </button>

              <div className="relative flex items-center">
                <button
                  type="button"
                  onClick={() =>
                    onQuickPlay({
                      timeId: '10+0',
                      mode: 'coach',
                      coachGuard: false,
                      coachId: activeCoachId,
                      coachStrength,
                    })
                  }
                  className="w-full h-[46px] pl-3 pr-9 rounded-[9px] cc-btn-secondary flex items-center justify-center gap-2.5 text-[15px] font-extrabold text-white cursor-pointer"
                >
                  <span className="w-6 h-6 rounded-[4px] overflow-hidden shrink-0">
                    <BotAvatar id={activeCoach.id} />
                  </span>
                  <span>Play Coach</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCoachModalOpen(true)}
                  aria-label="Switch Coach"
                  title="Switch Coach"
                  className="absolute right-2 p-1.5 rounded bg-[#262421]/80 hover:bg-[#474541] text-[#A8A6A1] hover:text-white cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('friends')}
                className="w-full h-[46px] px-3 rounded-[9px] cc-btn-secondary flex items-center justify-center gap-2.5 text-[15px] font-extrabold text-white cursor-pointer"
              >
                <HandshakeIllustratedIcon className="w-[24px] h-[24px] shrink-0" />
                <span>Play a Friend</span>
              </button>
            </div>
          </div>

          {/* Col 2: Puzzles Card */}
          <div className="rounded-[8px] bg-[#21201D] p-2.5 flex flex-col justify-between gap-3">
            <div
              onClick={() => onNavigate('puzzles')}
              className="w-full aspect-square rounded-[4px] overflow-hidden cursor-pointer hover:opacity-95 transition-opacity"
            >
              <div className="pointer-events-none w-full h-full">
                <ChessBoard
                  fen={heroPuzzle.fen}
                  theme={boardTheme}
                  interactive={false}
                  hideCoordinates
                  onMove={() => false}
                />
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-1">
              <PuzzleNumberBadgeIcon num={1} className="w-8 h-8 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="text-[13px] font-bold text-white truncate">Play to Solve</div>
                <div className="h-[10px] rounded-full bg-[#363431] overflow-hidden">
                  <div
                    className="h-full bg-[#81B64C] rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(8, Math.round(((puzzleRating - 400) / 2200) * 100)))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('puzzles')}
              className="w-full h-[44px] rounded-[8px] cc-btn-secondary text-[15px] font-extrabold text-white cursor-pointer"
            >
              Solve Puzzles
            </button>
          </div>

          {/* Col 3: Learn Card */}
          <div className="rounded-[8px] bg-[#21201D] p-2.5 flex flex-col justify-between gap-3">
            <div
              onClick={() => onNavigate('learn')}
              className="w-full aspect-square rounded-[4px] overflow-hidden cursor-pointer hover:opacity-95 transition-opacity"
            >
              <div className="pointer-events-none w-full h-full">
                <ChessBoard
                  fen="4k3/8/8/8/8/8/8/4K3 w - - 0 1"
                  theme={boardTheme}
                  interactive={false}
                  hideCoordinates
                  onMove={() => false}
                />
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-1 py-1">
              <NavLearnIcon className="w-8 h-8 shrink-0" />
              <span className="text-[14px] font-bold text-white truncate">The King</span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('learn')}
              className="w-full h-[44px] rounded-[8px] cc-btn-secondary text-[15px] font-extrabold text-white cursor-pointer"
            >
              Start
            </button>
          </div>

          {/* Col 4: Play Bots Card */}
          <div className="rounded-[8px] bg-[#21201D] p-2.5 flex flex-col justify-between gap-3">
            <div
              onClick={() => onNavigate('bots')}
              className="w-full aspect-square rounded-[4px] overflow-hidden cursor-pointer hover:opacity-95 transition-opacity"
            >
              <div className="pointer-events-none w-full h-full">
                <ChessBoard
                  fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                  theme="icy"
                  pieceTheme="icy"
                  interactive={false}
                  hideCoordinates
                  onMove={() => false}
                />
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-1 py-0.5">
              <div className="w-8 h-8 rounded-[4px] overflow-hidden bg-[#262421] shrink-0">
                <BotAvatar id={featuredBot.id} />
              </div>
              <span className="text-[14px] font-bold text-white truncate">
                {featuredBot.name} <span className="text-[#9E9B96] font-normal">({featuredBot.rating})</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('bots')}
              className="w-full h-[44px] rounded-[8px] cc-btn-secondary text-[15px] font-extrabold text-white cursor-pointer"
            >
              Play Bots
            </button>
          </div>
        </section>

        {/* Bottom 2-Column Section: Game History + Daily Puzzle */}
        <section className="grid lg:grid-cols-[1.65fr_1fr] gap-4 items-start">
          <div className="space-y-4">
            <div className="rounded-xl bg-[#262421] overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between border-b border-white/[0.06]">
                <h2 className="text-sm font-extrabold text-white font-display">
                  Game History
                </h2>
                <div className="flex items-center gap-3">
                  {recentGames.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setShowMasterArchiveDesktop((v) => !v)}
                      className="text-xs font-bold text-[#9E998F] hover:text-white cursor-pointer"
                    >
                      {showMasterArchiveDesktop ? 'Hide Master Games' : 'Master Archive'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onNavigate('review')}
                    className="text-xs font-bold text-[#DEDAD2] hover:text-white flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Open Game Viewer</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {desktopGamesToShow.length > 0 ? (
                <div className="divide-y divide-white/[0.06]">
                  {desktopGamesToShow.map((g) => {
                    const isUserGame = recentGames.length > 0;
                    const isBlack = isUserGame
                      ? isGamePlayedAsBlack(g, playerDisplayName)
                      : false;
                    const opponent = isUserGame ? (isBlack ? g.white : g.black) : g.black;
                    const primaryPlayer = isUserGame ? (isBlack ? g.black : g.white) : g.white;
                    const oppIsGuest =
                      opponent.name === 'Guest Opponent' ||
                      opponent.name === 'Anonymous (Guest)' ||
                      opponent.name === 'Anonymous';
                    const showOppRating =
                      typeof opponent.rating === 'number' && !oppIsGuest && g.rated !== false;
                    const won =
                      g.winner === 'white' ? !isBlack : g.winner === 'black' ? isBlack : null;
                    const SpeedIcon =
                      g.speed === 'blitz' ? Zap : g.speed === 'bullet' ? Rocket : Clock;
                    const speedColor =
                      g.speed === 'blitz'
                        ? 'text-[#F7C045]'
                        : g.speed === 'bullet'
                          ? 'text-[#E59A28]'
                          : 'text-[#81B64C]';
                    const resLabel =
                      g.winner === 'white'
                        ? '1-0'
                        : g.winner === 'black'
                          ? '0-1'
                          : '1/2-1/2';

                    return (
                      <div
                        key={g.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-2.5 hover:bg-[#2F2D29] transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            onSendToReview(
                              enrichGamePgnWithHeaders(g),
                              isBlack ? 'b' : 'w',
                              resLabel,
                            )
                          }
                          className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <SpeedIcon className={`w-4 h-4 ${speedColor} shrink-0`} />
                          <PlayerAvatar
                            username={opponent.name}
                            avatarUrl={opponent.avatarUrl}
                            size={30}
                            rounded="rounded-md"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-white truncate">
                              {isUserGame ? (
                                <>
                                  {opponent.name}{' '}
                                  {showOppRating ? (
                                    <span className="font-mono text-xs text-[#9E998F] tabular-nums">
                                      ({opponent.rating})
                                    </span>
                                  ) : g.rated === false || oppIsGuest ? (
                                    <span className="font-mono text-xs text-[#9E998F]">
                                      (Unrated)
                                    </span>
                                  ) : null}
                                </>
                              ) : (
                                <>
                                  {primaryPlayer.name} ({primaryPlayer.rating}) vs {opponent.name} ({opponent.rating})
                                </>
                              )}
                            </div>
                            <div className="text-[11px] text-[#9E998F] truncate">
                              {g.opening ? `${g.opening} · ` : ''}
                              {formatGamePlayedAgo(g.lastMoveAt ?? g.createdAt) || g.speed}
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            aria-label={won === true ? 'Win' : won === false ? 'Loss' : 'Draw'}
                            className={`w-5 h-5 rounded flex items-center justify-center text-white ${
                              won === true
                                ? 'bg-[#81B64C]'
                                : won === false
                                  ? 'bg-[#CA3431]'
                                  : 'bg-[#6D6961]'
                            }`}
                          >
                            {won === true ? (
                              <Plus className="w-3.5 h-3.5 stroke-[3]" />
                            ) : won === false ? (
                              <Minus className="w-3.5 h-3.5 stroke-[3]" />
                            ) : (
                              <Equal className="w-3.5 h-3.5 stroke-[3]" />
                            )}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              onSendToReview(
                                enrichGamePgnWithHeaders(g),
                                isBlack ? 'b' : 'w',
                                resLabel,
                              )
                            }
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#34322E] hover:bg-[#413E39] text-xs font-extrabold text-white cursor-pointer"
                          >
                            <SearchCheck className="w-3.5 h-3.5 text-[#81B64C]" />
                            <span>Review</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 px-4 flex flex-col items-center justify-center text-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#312E2A] flex items-center justify-center text-[#9E998F]">
                    <Grid2x2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold text-[#DEDAD2]">No games played yet</p>
                    <p className="text-xs text-[#9E998F]">
                      Play an online match or inspect featured master games in Game Review.
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => openNewGameWithTime(quickTimeId)}
                      className="px-4 py-2 rounded-[7px] cc-btn-primary-sm text-xs font-extrabold text-white cursor-pointer"
                    >
                      Play Match
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMasterArchiveDesktop(true)}
                      className="px-4 py-2 rounded-[7px] cc-btn-secondary text-xs font-bold text-[#DEDAD2] hover:text-white cursor-pointer"
                    >
                      Master Archive
                    </button>
                  </div>
                </div>
              )}
            </div>

            {friends.length > 0 && (
              <div className="rounded-xl bg-[#262421] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-extrabold text-white font-display">Friends</h2>
                    <span className="text-xs font-mono font-bold text-[#9E998F] tabular-nums">
                      {friends.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('friends')}
                    className="text-xs font-bold text-[#DEDAD2] hover:text-white flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>View All</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {friends.map((fname) => {
                    const st = friendStatuses[fname.toLowerCase()];
                    const flag = countryCodeToFlagEmoji(st?.flag);
                    return (
                      <div
                        key={fname}
                        className="w-[172px] shrink-0 rounded-lg bg-[#312E2A] p-2.5 flex items-center justify-between gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenPlayerProfile?.(fname)}
                          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <div className="relative shrink-0">
                            <PlayerAvatar
                              username={fname}
                              avatarUrl={st?.avatarUrl}
                              size={32}
                              rounded="rounded-md"
                            />
                            {st?.online && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#81B64C] border-2 border-[#312E2A]" />
                            )}
                          </div>
                          <span className="text-xs font-bold text-white truncate">
                            {fname} {flag}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => challengeFriend(fname)}
                          className="px-2 py-1 rounded bg-[#4A4742] hover:bg-[#57544E] text-[11px] font-bold text-white shrink-0 cursor-pointer"
                        >
                          Play
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Daily Puzzle */}
          <div className="rounded-xl bg-[#262421] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-white font-display">Daily Puzzle</h2>
              <span className="text-xs font-mono font-bold text-[#9E998F] tabular-nums">
                {dailyPuzzle.rating}
              </span>
            </div>
            <div
              onClick={() => onNavigate('puzzles')}
              className="w-full aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-95 transition-opacity block"
            >
              <div className="pointer-events-none w-full h-full">
                <ChessBoard
                  fen={dailyPuzzle.fen}
                  theme={boardTheme}
                  interactive={false}
                  hideCoordinates
                  onMove={() => false}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('puzzles')}
              className="w-full h-[42px] rounded-[8px] cc-btn-secondary text-[14px] font-extrabold text-white cursor-pointer"
            >
              Solve Daily Puzzle
            </button>
          </div>
        </section>
      </div>

      {/* Mobile Compact Hub (< lg) */}
      <div className="lg:hidden space-y-5">
      {/* Top 3-Card Chess.com Action Strip */}
      <section className="grid grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() => onNavigate('puzzles')}
          className="rounded-xl bg-[#393734] hover:bg-[#43403C] p-3.5 flex flex-col items-center text-center gap-2 transition-colors cursor-pointer"
        >
          <div className="w-12 h-12 rounded-xl bg-[#262421] flex items-center justify-center">
            <Puzzle className="w-6 h-6 text-[#81B64C]" />
          </div>
          <div className="min-w-0 w-full">
            <div className="text-sm font-extrabold text-white truncate">Daily Puzzle</div>
            <div className="text-xs text-[#9E998F] truncate tabular-nums">
              {rushBest > 0 ? `Storm ${rushBest}` : `${puzzleRating}`}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('bots')}
          className="rounded-xl bg-[#393734] hover:bg-[#43403C] p-3.5 flex flex-col items-center text-center gap-2 transition-colors cursor-pointer"
        >
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#262421]">
            <BotAvatar id={'milo' as BotId} />
          </div>
          <div className="min-w-0 w-full">
            <div className="text-sm font-extrabold text-white truncate">Play Bots</div>
            <div className="text-xs text-[#9E998F] truncate tabular-nums">100–3200</div>
          </div>
        </button>

        <div className="rounded-xl bg-[#393734] hover:bg-[#43403C] p-3.5 flex flex-col items-center text-center gap-2 transition-colors relative">
          <button
            type="button"
            onClick={() => setCoachModalOpen(true)}
            aria-label="Choose Coach"
            title="Switch Coach"
            className="absolute top-2 right-2 w-6 h-6 rounded-md bg-[#262421]/80 hover:bg-[#262421] flex items-center justify-center text-[#B8B6B2] hover:text-white cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              onQuickPlay({
                timeId: '10+0',
                mode: 'coach',
                coachGuard: false,
                coachId: activeCoachId,
                coachStrength,
              })
            }
            className="w-full flex flex-col items-center gap-2 cursor-pointer"
          >
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#262421]">
              <BotAvatar id={activeCoach.id} />
            </div>
            <div className="min-w-0 w-full">
              <div className="text-sm font-extrabold text-white truncate">Play Coach</div>
              <div className="text-xs text-[#9E998F] truncate">
                {activeCoach.name.replace('Coach ', '')} · {activeStrengthObj.elo}
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* Ratings 4-Column Row */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-extrabold text-white font-display">Ratings</h2>
            <button
              type="button"
              onClick={onConnectLichess}
              disabled={lichessConnecting}
              className="px-2 py-0.5 rounded bg-[#262421] hover:bg-[#312E2A] border border-white/10 text-[11px] font-bold text-[#81B64C] flex items-center gap-1 cursor-pointer"
            >
              <Link2 className="w-3 h-3" />
              <span>
                {lichessConnecting
                  ? 'Signing in...'
                  : lichessSession
                    ? 'Account'
                    : 'Sign in'}
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('profile')}
            className="text-xs font-bold text-[#DEDAD2] hover:text-white flex items-center gap-0.5 cursor-pointer"
          >
            <span>View All</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => openNewGameWithTime('10+0')}
            className="rounded-xl bg-[#393734] hover:bg-[#43403C] py-3 px-1.5 flex flex-col items-center text-center gap-1 cursor-pointer transition-colors"
          >
            <Clock className="w-5 h-5 text-[#81B64C]" />
            <div className="text-lg sm:text-xl font-extrabold font-mono text-white tabular-nums leading-none mt-1">
              {rapidRating}
            </div>
            <div className="text-[11px] text-[#9E998F] font-semibold">Rapid</div>
          </button>

          <button
            type="button"
            onClick={() => openNewGameWithTime('3+2')}
            className="rounded-xl bg-[#393734] hover:bg-[#43403C] py-3 px-1.5 flex flex-col items-center text-center gap-1 cursor-pointer transition-colors"
          >
            <Zap className="w-5 h-5 text-[#F7C045]" />
            <div className="text-lg sm:text-xl font-extrabold font-mono text-white tabular-nums leading-none mt-1">
              {blitzRating}
            </div>
            <div className="text-[11px] text-[#9E998F] font-semibold">Blitz</div>
          </button>

          <button
            type="button"
            onClick={() => openNewGameWithTime('1+0')}
            className="rounded-xl bg-[#393734] hover:bg-[#43403C] py-3 px-1.5 flex flex-col items-center text-center gap-1 cursor-pointer transition-colors"
          >
            <Rocket className="w-5 h-5 text-[#E59A28]" />
            <div className="text-lg sm:text-xl font-extrabold font-mono text-white tabular-nums leading-none mt-1">
              {bulletRating}
            </div>
            <div className="text-[11px] text-[#9E998F] font-semibold">Bullet</div>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('puzzles')}
            className="rounded-xl bg-[#393734] hover:bg-[#43403C] py-3 px-1.5 flex flex-col items-center text-center gap-1 cursor-pointer transition-colors"
          >
            <Puzzle className="w-5 h-5 text-[#E06C5A]" />
            <div className="text-lg sm:text-xl font-extrabold font-mono text-white tabular-nums leading-none mt-1">
              {puzzleRating}
            </div>
            <div className="text-[11px] text-[#9E998F] font-semibold">Puzzles</div>
          </button>
        </div>
      </section>

      {/* Friends Strip */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-extrabold text-white font-display">Friends</h2>
            <span className="text-xs font-mono font-bold text-[#9E998F] tabular-nums">
              {friends.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('friends')}
            className="text-xs font-bold text-[#DEDAD2] hover:text-white flex items-center gap-0.5 cursor-pointer"
          >
            <span>View All</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {friends.length > 0 ? (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {friends.map((fname) => {
              const st = friendStatuses[fname.toLowerCase()];
              const flag = countryCodeToFlagEmoji(st?.flag);
              const seenLabel = st?.online ? 'Online now' : formatLastSeenAgo(st?.seenAt);
              return (
                <div
                  key={fname}
                  className="w-[162px] shrink-0 rounded-xl bg-[#393734] p-3 flex flex-col items-center text-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => onOpenPlayerProfile?.(fname)}
                    className="flex flex-col items-center gap-1.5 min-w-0 w-full cursor-pointer hover:opacity-90"
                  >
                    <div className="relative w-14 h-14 rounded-xl bg-[#262421] overflow-hidden flex items-center justify-center">
                      <PlayerAvatar
                        username={fname}
                        avatarUrl={st?.avatarUrl}
                        size={56}
                        rounded="rounded-xl"
                      />
                      {st?.online && (
                        <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-[#81B64C] border-2 border-[#393734]" />
                      )}
                    </div>
                    <div className="min-w-0 w-full">
                      <div className="text-xs font-extrabold text-white truncate">
                        {fname} {flag}
                      </div>
                      <div className="text-[11px] text-[#9E998F] truncate mt-0.5">{seenLabel}</div>
                    </div>
                  </button>
                  <div className="w-full flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => challengeFriend(fname)}
                      className="flex-1 py-1.5 rounded-lg bg-[#4A4742] hover:bg-[#57544E] text-white text-xs font-bold cursor-pointer"
                    >
                      Challenge
                    </button>
                    {onMessageFriend && (
                      <button
                        type="button"
                        onClick={() => onMessageFriend(fname)}
                        aria-label={`Message ${fname}`}
                        className="p-1.5 rounded-lg bg-[#262421] hover:bg-[#312E2A] text-[#C8C4BC] hover:text-white cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid={`home-remove-friend-${fname}`}
                      onClick={() => handleRemoveFriendCard(fname)}
                      aria-label={`Remove ${fname} from friends`}
                      title={`Remove ${fname} from friends`}
                      className="p-1.5 rounded-lg bg-[#3B2320] hover:bg-[#4F2D28] text-[#F5B8B0] hover:text-white cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('friends')}
              className="rounded-xl bg-[#393734] hover:bg-[#43403C] p-3.5 text-left space-y-1.5 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-[#262421] flex items-center justify-center">
                <Link2 className="w-4 h-4 text-[#81B64C]" />
              </div>
              <div className="text-xs font-extrabold text-white">Send Challenge Link</div>
              <div className="text-[11px] text-[#9E998F]">Play any friend immediately</div>
            </button>

            <button
              type="button"
              onClick={() => (lichessSession ? onNavigate('friends') : onConnectLichess())}
              className="rounded-xl bg-[#393734] hover:bg-[#43403C] p-3.5 text-left space-y-1.5 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-[#262421] flex items-center justify-center">
                {lichessSession ? (
                  <UserPlus className="w-4 h-4 text-[#6FB3E0]" />
                ) : (
                  <User className="w-4 h-4 text-[#F7C045]" />
                )}
              </div>
              <div className="text-xs font-extrabold text-white">
                {lichessSession ? 'Find Friends' : 'Sign In & Sync'}
              </div>
              <div className="text-[11px] text-[#9E998F]">
                {lichessSession
                  ? 'Search players & challenge live'
                  : 'Save ratings & friends list'}
              </div>
            </button>
          </div>
        )}
      </section>

      {/* Chess.com-style Recent Games List */}
      <section className="space-y-2 pb-16">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-base font-extrabold text-white font-display">
            Recent Games
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('review')}
            className="text-xs font-bold text-[#DEDAD2] hover:text-white flex items-center gap-0.5 cursor-pointer shrink-0"
          >
            <span>View All</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="rounded-xl bg-[#262421] divide-y divide-white/[0.06] overflow-hidden">
          {(recentGames.length > 0 ? recentGames : featuredGames).map((g) => {
            const isUserGame = recentGames.length > 0;
            const isBlack = isUserGame
              ? isGamePlayedAsBlack(g, playerDisplayName)
              : false;
            const opponent = isUserGame ? (isBlack ? g.white : g.black) : g.black;
            const primaryPlayer = isUserGame ? (isBlack ? g.black : g.white) : g.white;
            const oppIsGuest =
              opponent.name === 'Guest Opponent' ||
              opponent.name === 'Anonymous (Guest)' ||
              opponent.name === 'Anonymous';
            const showOppRating =
              typeof opponent.rating === 'number' && !oppIsGuest && g.rated !== false;
            const won =
              g.winner === 'white' ? !isBlack : g.winner === 'black' ? isBlack : null;
            const SpeedIcon =
              g.speed === 'blitz' ? Zap : g.speed === 'bullet' ? Rocket : Clock;
            const speedColor =
              g.speed === 'blitz'
                ? 'text-[#F7C045]'
                : g.speed === 'bullet'
                  ? 'text-[#E59A28]'
                  : 'text-[#81B64C]';
            const resLabel =
              g.winner === 'white'
                ? '1-0'
                : g.winner === 'black'
                  ? '0-1'
                  : '1/2-1/2';

            return (
              <div
                key={g.id}
                className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2.5 hover:bg-[#33302C] transition-colors"
              >
                <button
                  type="button"
                  onClick={() =>
                    onSendToReview(
                      enrichGamePgnWithHeaders(g),
                      isBlack ? 'b' : 'w',
                      resLabel,
                    )
                  }
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                >
                  <SpeedIcon className={`w-4 h-4 ${speedColor} shrink-0`} />
                  <PlayerAvatar
                    username={opponent.name}
                    avatarUrl={opponent.avatarUrl}
                    size={32}
                    rounded="rounded-lg"
                  />
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-white truncate">
                      {isUserGame ? (
                        <>
                          {opponent.name}{' '}
                          {showOppRating ? (
                            <span className="font-mono text-xs text-[#9E998F] tabular-nums">
                              ({opponent.rating})
                            </span>
                          ) : g.rated === false || oppIsGuest ? (
                            <span className="font-mono text-xs text-[#9E998F]">
                              (Unrated)
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {primaryPlayer.name} ({primaryPlayer.rating}) vs {opponent.name} ({opponent.rating})
                        </>
                      )}
                    </div>
                    <div className="text-[11px] text-[#9E998F] truncate">
                      {g.opening ? `${g.opening} · ` : ''}
                      {formatGamePlayedAgo(g.lastMoveAt ?? g.createdAt) || g.speed}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  {onOpenPlayerProfile && (
                    <button
                      type="button"
                      onClick={() => onOpenPlayerProfile(opponent.name)}
                      aria-label={`View ${opponent.name} profile`}
                      title={`View ${opponent.name} profile`}
                      className="p-1.5 rounded-lg bg-[#34322E] hover:bg-[#413E39] text-[#C8C4BC] hover:text-white cursor-pointer"
                    >
                      <User className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      onSendToReview(
                        enrichGamePgnWithHeaders(g),
                        isBlack ? 'b' : 'w',
                        resLabel,
                      )
                    }
                    aria-label={`Review game vs ${opponent.name}`}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#34322E] hover:bg-[#413E39] text-xs font-extrabold text-white cursor-pointer"
                  >
                    <span
                      aria-label={won === true ? 'Win' : won === false ? 'Loss' : 'Draw'}
                      className={`w-5 h-5 rounded flex items-center justify-center text-white ${
                        won === true
                          ? 'bg-[#81B64C]'
                          : won === false
                            ? 'bg-[#CA3431]'
                            : 'bg-[#6D6961]'
                      }`}
                    >
                      {won === true ? (
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                      ) : won === false ? (
                        <Minus className="w-3.5 h-3.5 stroke-[3]" />
                      ) : (
                        <Equal className="w-3.5 h-3.5 stroke-[3]" />
                      )}
                    </span>
                    <SearchCheck className="w-4 h-4 text-[#81B64C]" />
                    <span className="hidden sm:inline">View</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Primary Play Button */}
      <div className="fixed lg:static bottom-14 left-0 right-0 z-30 px-2.5 pb-2 pt-2 bg-[#302E2B]/95 backdrop-blur-sm lg:p-0 lg:bg-transparent">
        <button
          type="button"
          data-start="true"
          onClick={() => openNewGameWithTime('10+0')}
          className="w-full min-h-[52px] rounded-[10px] cc-btn-primary text-white font-extrabold font-display text-xl cursor-pointer"
        >
          Play
        </button>
      </div>
      </div>

      <CoachPickerModal
        open={coachModalOpen}
        coachId={activeCoachId}
        strengthId={coachStrength}
        confirmLabel="Play Selected Coach"
        onSelectCoach={selectCoach}
        onSelectStrength={selectStrength}
        onClose={() => setCoachModalOpen(false)}
        onConfirm={(chosenCoach, chosenStrength) => {
          setCoachModalOpen(false);
          onQuickPlay({
            timeId: '10+0',
            mode: 'coach',
            coachGuard: false,
            coachId: chosenCoach,
            coachStrength: chosenStrength,
          });
        }}
      />
    </div>
  );
}
