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
} from 'lucide-react';
import type { BotId } from '../chess/engine';
import {
  FEATURED_MASTER_GAMES,
  countryCodeToFlagEmoji,
  enrichGamePgnWithHeaders,
  formatGamePlayedAgo,
  formatLastSeenAgo,
  isGamePlayedAsBlack,
  loadGuestPerfs,
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

interface HomeViewProps {
  stats: {
    gamesPlayed: number;
    puzzlesSolved: number;
    lessonsCompleted: number;
  };
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

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-24 lg:pb-6">
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
          <button
            type="button"
            onClick={() => setCoachModalOpen(true)}
            aria-label="Choose Coach"
            className="text-[11px] font-bold text-[#81B64C] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>{dna.gamesAnalyzed > 0 ? `Focus: ${dna.weakestPhase}` : 'Switch Coach'}</span>
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

      {/* Chess.com-style Recent Games List (Always Available with Instant Game Viewer) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-white font-display">
              {recentGames.length > 0 ? 'Recent Games' : 'Recent Games · Live Master Archive'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('review')}
            className="text-xs font-bold text-[#DEDAD2] hover:text-white flex items-center gap-0.5 cursor-pointer"
          >
            <span>Open Game Viewer</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="rounded-xl bg-[#262421] divide-y divide-white/[0.06] overflow-hidden">
          {(recentGames.length > 0 ? recentGames : featuredGames).map((g) => {
            const isUserGame = recentGames.length > 0;
            const isBlack = isUserGame
              ? isGamePlayedAsBlack(g, lichessSession?.account.username)
              : false;
            const opponent = isUserGame ? (isBlack ? g.white : g.black) : g.black;
            const primaryPlayer = isUserGame ? (isBlack ? g.black : g.white) : g.white;
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
                          {opponent.rating && (
                            <span className="font-mono text-xs text-[#9E998F] tabular-nums">
                              ({opponent.rating})
                            </span>
                          )}
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
          className="w-full min-h-[52px] rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[5px] border-[#457524] active:border-b-0 active:translate-y-[2px] text-white font-extrabold text-xl transition-all cursor-pointer shadow-lg"
        >
          Play
        </button>
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
