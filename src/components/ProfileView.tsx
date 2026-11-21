import { useEffect, useState } from 'react';
import type { Color } from 'chess.js';
import {
  ArrowLeft,
  Settings,
  UserPlus,
  Flame,
  Puzzle,
  Trophy,
  Clock,
  Zap,
  Rocket,
  Star,
  Plus,
  Minus,
  Equal,
  RefreshCw,
  LogOut,
  Palette,
  Volume2,
  VolumeX,
  Check,
  Award,
  Share2,
  Camera,
  Pencil,
  MessageSquare,
  TrendingUp,
  Globe,
  Trash2,
} from 'lucide-react';
import {
  countryCodeToFlagEmoji,
  computeUserAwards,
  enrichGamePgnWithHeaders,
  formatGamePlayedAgo,
  formatJoinedDate,
  formatLastSeenAgo,
  isGamePlayedAsBlack,
  loadBeatenBots,
  loadDailyStreak,
  loadGuestPerfs,
  loadGuestPlayerName,
  loadMatchHistory,
  loadPlayedGames,
  loadPuzzleStats,
  loadRushBest,
  mergeSyncedGames,
  saveGuestPlayerName,
} from '../chess/analytics';
import {
  COUNTRY_OPTIONS,
  computeLeagueInfo,
  getShareableAppOrigin,
  loadLocalFriendsBackup,
  mergeFriendsBackupWithServer,
  saveLocalFriendsBackup,
  type RatingSpeed,
} from '../chess/onlineHelpers';
import type { LichessFriendStatus, LichessUserGame } from '../chess/lichess';
import type { LichessSession } from '../chess/useLichessAuth';
import type { BoardTheme } from './ChessBoard';
import { BOARD_THEME_PALETTES } from '../chess/theme';
import { ChessPiece } from './ChessPiece';
import { AvatarPickerModal, PlayerAvatar } from './PlayerAvatar';
import type { NavTab } from './PrepView';
import type { PlayPreset } from './PlayView';
import { BottomSheet } from './BottomSheet';

interface ProfileViewProps {
  stats: {
    gamesPlayed: number;
    puzzlesSolved: number;
    lessonsCompleted: number;
  };
  lichessSession: LichessSession | null;
  lastSyncedAt?: number;
  friendListsVersion?: number;
  boardTheme: BoardTheme;
  muted: boolean;
  onSetBoardTheme: (theme: BoardTheme) => void;
  onToggleMute: () => void;
  onOpenThemeStudio?: () => void;
  onBack: () => void;
  onNavigate: (tab: NavTab) => void;
  onConnectLichess: () => void;
  onDisconnectLichess: () => void;
  onSyncAccount: () => Promise<unknown>;
  onUpdateProfile?: (params: {
    username?: string;
    bio?: string;
    flag?: string;
    country?: string;
  }) => Promise<unknown>;
  onOpenPlayerProfile?: (username: string) => void;
  onMessageFriend?: (username: string) => void;
  onRemoveFriend?: (username: string) => void;
  onStartGame: (opts: Omit<PlayPreset, 'nonce'>) => void;
  onInviteFriend?: (username: string) => void;
  onSendToReview: (pgn: string, color: Color, resultLabel: string) => void;
}

export function ProfileView({
  stats,
  lichessSession,
  lastSyncedAt = 0,
  friendListsVersion = 0,
  boardTheme,
  muted,
  onSetBoardTheme,
  onToggleMute,
  onOpenThemeStudio,
  onBack,
  onNavigate,
  onConnectLichess,
  onDisconnectLichess,
  onSyncAccount,
  onUpdateProfile,
  onOpenPlayerProfile,
  onMessageFriend,
  onRemoveFriend,
  onStartGame,
  onInviteFriend,
  onSendToReview,
}: ProfileViewProps) {
  const [recentGames, setRecentGames] = useState<LichessUserGame[]>([]);
  const [friends, setFriends] = useState<string[]>([]);
  const [friendStatuses, setFriendStatuses] = useState<Record<string, LichessFriendStatus>>({});
  const [showAllRatings, setShowAllRatings] = useState(false);
  const [showAllGames, setShowAllGames] = useState(false);
  const [showAllAwards, setShowAllAwards] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [guestName, setGuestName] = useState<string>(() => loadGuestPlayerName());
  const [editName, setEditName] = useState(
    () => lichessSession?.account.username ?? loadGuestPlayerName(),
  );
  const [editBio, setEditBio] = useState(() => lichessSession?.account.profile?.bio ?? '');
  const [editCountry, setEditCountry] = useState(
    () => lichessSession?.account.profile?.flag || lichessSession?.account.profile?.country || 'INT',
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaveErr, setProfileSaveErr] = useState<string | null>(null);
  const [historySpeed, setHistorySpeed] = useState<RatingSpeed>('rapid');
  const [customAvatar, setCustomAvatar] = useState<string | undefined>(
    () => lichessSession?.account.profile?.avatarUrl,
  );
  const [syncing, setSyncing] = useState(false);
  const [copiedProfile, setCopiedProfile] = useState(false);

  useEffect(() => {
    document.body.dataset.state = 'profile';
    if (lichessSession?.accessToken) {
      void onSyncAccount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load saved friends + their real statuses/ratings
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

  // Load synced recent online & local played games
  useEffect(() => {
    let cancelled = false;
    const localGames = loadPlayedGames();
    setRecentGames(localGames);

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
      setRecentGames(mergeSyncedGames(loadPlayedGames(), acctGames, netGames));
    };

    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [lichessSession?.account.username, lichessSession?.accessToken, lichessSession?.account.count?.all, lastSyncedAt]);

  const dailyStreak = loadDailyStreak();
  const puzzleStats = loadPuzzleStats();
  const guestPerfs = loadGuestPerfs();
  const rushBest = loadRushBest();
  const beatenBots = loadBeatenBots();
  const localReviewed = loadMatchHistory();

  const perfs = lichessSession?.account.perfs;
  const rapidRating = lichessSession ? (perfs?.rapid?.rating ?? 1500) : guestPerfs.rapid.rating;
  const blitzRating = lichessSession ? (perfs?.blitz?.rating ?? 1500) : guestPerfs.blitz.rating;
  const bulletRating = lichessSession ? (perfs?.bullet?.rating ?? 1500) : guestPerfs.bullet.rating;
  const puzzleRating = lichessSession ? (perfs?.puzzle?.rating ?? puzzleStats.rating) : puzzleStats.rating;

  const totalOnlineGames = lichessSession?.account.count?.all ?? 0;
  const totalGames = lichessSession
    ? Math.max(totalOnlineGames, recentGames.length)
    : Math.max(stats.gamesPlayed, recentGames.length);
  const leagueInfo = computeLeagueInfo(lichessSession?.account.leaguePoints ?? 0);
  const accountFlag = countryCodeToFlagEmoji(
    lichessSession?.account.profile?.flag || lichessSession?.account.profile?.country,
  );
  const accountBio = lichessSession?.account.profile?.bio?.trim() ?? '';

  const activeSpeedRating =
    historySpeed === 'rapid'
      ? rapidRating
      : historySpeed === 'blitz'
        ? blitzRating
        : historySpeed === 'bullet'
          ? bulletRating
          : puzzleRating;
  const rawHistory = lichessSession?.account.ratingHistory?.[historySpeed] ?? [];
  const chartPoints =
    rawHistory.length >= 2
      ? rawHistory
      : rawHistory.length === 1
        ? [rawHistory[0], { rating: activeSpeedRating, ts: Date.now() }]
        : [
            { rating: activeSpeedRating, ts: Date.now() - 86400000 },
            { rating: activeSpeedRating, ts: Date.now() },
          ];
  const minChart = Math.min(...chartPoints.map((p) => p.rating)) - 15;
  const maxChart = Math.max(...chartPoints.map((p) => p.rating)) + 15;
  const chartSpan = Math.max(20, maxChart - minChart);
  const polylinePts = chartPoints
    .map((pt, i) => {
      const x = chartPoints.length <= 1 ? 150 : (i / (chartPoints.length - 1)) * 288 + 6;
      const y = 66 - ((pt.rating - minChart) / chartSpan) * 56;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const ratingDelta = chartPoints[chartPoints.length - 1].rating - chartPoints[0].rating;

  const syncedPuzzleSolved = Math.max(
    stats.puzzlesSolved,
    puzzleStats.solvedCount,
    perfs?.puzzle?.games ?? 0,
  );

  const awards = computeUserAwards({
    streakDays: dailyStreak.days,
    puzzleSolved: syncedPuzzleSolved,
    puzzleBestStreak: Math.max(puzzleStats.bestStreak, perfs?.streak?.score ?? 0),
    rushBest: Math.max(rushBest, perfs?.storm?.score ?? 0),
    gamesPlayed: totalGames,
    beatenBotsCount: beatenBots.length,
    lessonsCompleted: stats.lessonsCompleted,
  });

  const handleManualSync = async () => {
    if (!lichessSession) return;
    setSyncing(true);
    try {
      await onSyncAccount();
    } finally {
      setSyncing(false);
    }
  };

  const openEditProfileSheet = () => {
    setEditName(lichessSession?.account.username ?? guestName);
    setEditBio(lichessSession?.account.profile?.bio ?? '');
    setEditCountry(
      lichessSession?.account.profile?.flag || lichessSession?.account.profile?.country || 'INT',
    );
    setProfileSaveErr(null);
    setEditProfileOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = editName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 26) {
      setProfileSaveErr('Name must be between 2 and 26 characters.');
      return;
    }
    setSavingProfile(true);
    setProfileSaveErr(null);
    try {
      if (lichessSession && onUpdateProfile) {
        await onUpdateProfile({
          username: trimmedName.replace(/\s+/g, '_'),
          bio: editBio.trim(),
          flag: editCountry,
          country: editCountry,
        });
      }
      const nextGuest = saveGuestPlayerName(trimmedName);
      setGuestName(nextGuest);
      setEditProfileOpen(false);
    } catch (err: unknown) {
      setProfileSaveErr(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const username = lichessSession?.account.username ?? guestName;
  const joinedLabel = formatJoinedDate(lichessSession?.account.createdAt);

  const visibleGames = showAllGames ? recentGames : recentGames.slice(0, 5);
  const visibleAwards = showAllAwards ? awards : awards.slice(0, 4);

  const bannerSquares: Array<{ piece?: 'p' | 'r' | 'q' | 'k' | 'b' | 'n'; light: boolean }> = [
    { piece: 'p', light: false },
    { piece: 'p', light: true },
    { piece: 'p', light: false },
    { piece: 'p', light: true },
    { piece: 'p', light: false },
    { piece: 'r', light: true },
    { piece: 'q', light: false },
    { piece: 'k', light: true },
    { piece: 'b', light: false },
    { piece: 'n', light: true },
  ];

  return (
    <div className="max-w-3xl mx-auto pb-24 lg:pb-8 -mx-2.5 sm:mx-auto">
      {/* Checkered Chess Silhouette Banner */}
      <div className="relative h-28 sm:h-36 overflow-hidden sm:rounded-t-2xl select-none">
        <div className="grid grid-cols-5 grid-rows-2 w-full h-full">
          {bannerSquares.map((sq, idx) => (
            <div
              key={idx}
              style={{ backgroundColor: sq.light ? '#6B7E52' : '#586A42' }}
              className="flex items-center justify-center opacity-90"
            >
              {sq.piece && (
                <div className="w-10 h-10 sm:w-12 sm:h-12 opacity-45">
                  <ChessPiece type={sq.piece} color="b" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Top Bar Actions */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="w-9 h-9 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-xs flex items-center justify-center text-white cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const url = `${getShareableAppOrigin()}/?player=${encodeURIComponent(username)}`;
                navigator.clipboard?.writeText(url).catch(() => {});
                setCopiedProfile(true);
                window.setTimeout(() => setCopiedProfile(false), 1800);
              }}
              aria-label="Share Profile"
              className="w-9 h-9 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-xs flex items-center justify-center text-white cursor-pointer"
            >
              {copiedProfile ? <Check className="w-4 h-4 text-[#81B64C]" /> : <Share2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Profile Settings"
              className="w-9 h-9 rounded-full bg-black/35 hover:bg-black/55 backdrop-blur-xs flex items-center justify-center text-white cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Profile Body */}
      <div className="px-3.5 sm:px-4 space-y-5">
        {/* Overlapping Avatar + Handle */}
        <div className="flex items-end gap-3.5 -mt-10 relative z-10">
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setAvatarPickerOpen(true)}
              aria-label="Change account photo"
              title="Change account photo"
              className="group relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-[#EAE8E3] border-4 border-[#302E2B] flex items-center justify-center shadow-lg overflow-hidden cursor-pointer"
            >
              <PlayerAvatar
                username={username}
                avatarUrl={customAvatar ?? lichessSession?.account.profile?.avatarUrl}
                isCurrentUser
                size={90}
                rounded="rounded-xl"
              />
              <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <Camera className="w-6 h-6" />
              </span>
            </button>
            <button
              type="button"
              onClick={() => setAvatarPickerOpen(true)}
              aria-label="Edit account photo"
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#81B64C] hover:bg-[#8EC556] border-2 border-[#302E2B] flex items-center justify-center text-white shadow cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="min-w-0 pb-1 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white font-display truncate">
                {username}
              </h1>
              {accountFlag && (
                <span className="text-lg leading-none" aria-label="Country flag">
                  {accountFlag}
                </span>
              )}
              {lichessSession?.account.title && (
                <span className="px-1.5 py-0.5 rounded bg-[#B8860B] text-[10px] font-extrabold text-white">
                  {lichessSession.account.title}
                </span>
              )}
              <button
                type="button"
                onClick={() => setAvatarPickerOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-[#393734] hover:bg-[#43403C] text-[11px] font-bold text-[#DEDAD2] flex items-center gap-1 cursor-pointer"
              >
                <Camera className="w-3 h-3 text-[#81B64C]" />
                <span>Photo</span>
              </button>
              <button
                type="button"
                data-testid="profile-edit-name-btn"
                onClick={openEditProfileSheet}
                className="px-2.5 py-1 rounded-lg bg-[#393734] hover:bg-[#43403C] text-[11px] font-bold text-[#DEDAD2] flex items-center gap-1 cursor-pointer"
              >
                <Pencil className="w-3 h-3 text-[#F7C045]" />
                <span>Change Name &amp; Profile</span>
              </button>
            </div>
            {accountBio && (
              <p className="text-xs text-[#C8C4BC] mt-1 line-clamp-2">{accountBio}</p>
            )}
            {!lichessSession && (
              <button
                type="button"
                onClick={onConnectLichess}
                className="text-xs font-bold text-[#81B64C] hover:underline mt-0.5 cursor-pointer"
              >
                + Sign in to load your profile
              </button>
            )}
          </div>
        </div>

        {/* Joined / Friends / Games Metadata Strip */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div>
            <div className="text-sm font-extrabold text-white">{joinedLabel}</div>
            <div className="text-xs text-[#9E998F]">Joined</div>
          </div>
          <div>
            <div className="text-sm font-extrabold text-white tabular-nums">{friends.length}</div>
            <div className="text-xs text-[#9E998F]">Friends</div>
          </div>
          <div>
            <div className="text-sm font-extrabold text-white tabular-nums">{totalGames}</div>
            <div className="text-xs text-[#9E998F]">Games</div>
          </div>
        </div>

        {/* Add Friends Full-Width CTA */}
        {lichessSession ? (
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('friends')}
              className="w-full min-h-[46px] rounded-xl bg-[#393734] hover:bg-[#43403C] text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4 text-[#DEDAD2]" />
              <span>Add Friends</span>
            </button>
            <button
              type="button"
              onClick={openEditProfileSheet}
              className="w-full min-h-[46px] rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-[#81B64C]/40 text-[#81B64C] font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
              <span>Edit Profile &amp; Country</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onConnectLichess}
            className="w-full min-h-[46px] rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[3px] border-[#457524] text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Sign In or Create Account</span>
          </button>
        )}

        {/* 3 Stat Tiles (Streak / Puzzles / League Trophy) */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-xl bg-[#3B3422] border border-[#564A2C]/60 p-3 flex flex-col items-center text-center gap-1.5">
            <Flame className="w-7 h-7 text-[#F7C045] fill-[#F7C045]" />
            <div className="text-xs font-extrabold text-white tabular-nums">
              {dailyStreak.days} {dailyStreak.days === 1 ? 'day' : 'days'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('puzzles')}
            className="rounded-xl bg-[#3B2E26] border border-[#5A4435]/60 p-3 flex flex-col items-center text-center gap-1.5 cursor-pointer hover:brightness-110"
          >
            <Puzzle className="w-7 h-7 text-[#C68B59]" />
            <div className="text-xs font-extrabold text-white tabular-nums">
              {syncedPuzzleSolved} Puzzles
            </div>
          </button>

          <div className="rounded-xl bg-[#393734] border border-white/10 p-3 flex flex-col items-center text-center gap-1">
            <Trophy className="w-6 h-6" style={{ color: leagueInfo.badgeColor }} />
            <div className="text-xs font-extrabold text-white">
              {leagueInfo.tier} · {leagueInfo.points} pts
            </div>
            <div className="w-full h-1.5 rounded-full bg-[#262421] overflow-hidden mt-0.5">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${leagueInfo.progressPct}%`,
                  backgroundColor: leagueInfo.badgeColor,
                }}
              />
            </div>
            {leagueInfo.nextTier && (
              <div className="text-[9px] text-[#9E998F]">
                Next: {leagueInfo.nextTier} ({leagueInfo.nextThreshold})
              </div>
            )}
          </div>
        </div>

        {/* Ratings */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-white font-display">Ratings</h2>
            <button
              type="button"
              onClick={() => setShowAllRatings((v) => !v)}
              className="text-xs font-bold text-[#B8B4AC] hover:text-white cursor-pointer"
            >
              {showAllRatings ? 'Compact' : 'View All'}
            </button>
          </div>

          <div className={`grid gap-2.5 ${showAllRatings ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-4'}`}>
            <div className="rounded-xl bg-[#393734] py-3 px-2 flex flex-col items-center text-center gap-1">
              <Clock className="w-6 h-6 text-[#81B64C]" />
              <div className="text-lg font-extrabold font-mono text-white tabular-nums leading-none mt-1">
                {rapidRating}
              </div>
              <div className="text-[11px] font-semibold text-[#9E998F]">Rapid</div>
              {showAllRatings && perfs?.rapid?.games !== undefined && (
                <div className="text-[10px] text-[#8E8980]">{perfs.rapid.games} games</div>
              )}
            </div>

            <div className="rounded-xl bg-[#393734] py-3 px-2 flex flex-col items-center text-center gap-1">
              <Zap className="w-6 h-6 text-[#F7C045]" />
              <div className="text-lg font-extrabold font-mono text-white tabular-nums leading-none mt-1">
                {blitzRating}
              </div>
              <div className="text-[11px] font-semibold text-[#9E998F]">Blitz</div>
              {showAllRatings && perfs?.blitz?.games !== undefined && (
                <div className="text-[10px] text-[#8E8980]">{perfs.blitz.games} games</div>
              )}
            </div>

            <div className="rounded-xl bg-[#393734] py-3 px-2 flex flex-col items-center text-center gap-1">
              <Rocket className="w-6 h-6 text-[#E59A28]" />
              <div className="text-lg font-extrabold font-mono text-white tabular-nums leading-none mt-1">
                {bulletRating}
              </div>
              <div className="text-[11px] font-semibold text-[#9E998F]">Bullet</div>
              {showAllRatings && perfs?.bullet?.games !== undefined && (
                <div className="text-[10px] text-[#8E8980]">{perfs.bullet.games} games</div>
              )}
            </div>

            <div className="rounded-xl bg-[#393734] py-3 px-2 flex flex-col items-center text-center gap-1">
              <Puzzle className="w-6 h-6 text-[#E06C5A]" />
              <div className="text-lg font-extrabold font-mono text-white tabular-nums leading-none mt-1">
                {puzzleRating}
              </div>
              <div className="text-[11px] font-semibold text-[#9E998F]">Puzzles</div>
              {showAllRatings && (
                <div className="text-[10px] text-[#8E8980]">
                  {syncedPuzzleSolved} solved
                </div>
              )}
            </div>

            {showAllRatings && (
              <>
                <div className="rounded-xl bg-[#393734] py-3 px-2 flex flex-col items-center text-center gap-1">
                  <Clock className="w-6 h-6 text-[#7FC4ED]" />
                  <div className="text-lg font-extrabold font-mono text-white tabular-nums leading-none mt-1">
                    {perfs?.classical?.rating ?? 1500}
                  </div>
                  <div className="text-[11px] font-semibold text-[#9E998F]">Classical</div>
                  {perfs?.classical?.games !== undefined && (
                    <div className="text-[10px] text-[#8E8980]">{perfs.classical.games} games</div>
                  )}
                </div>

                <div className="rounded-xl bg-[#393734] py-3 px-2 flex flex-col items-center text-center gap-1">
                  <Star className="w-6 h-6 text-[#C8C4BC]" />
                  <div className="text-lg font-extrabold font-mono text-white tabular-nums leading-none mt-1">
                    {perfs?.correspondence?.rating ?? 1500}
                  </div>
                  <div className="text-[11px] font-semibold text-[#9E998F]">Daily</div>
                  {perfs?.correspondence?.games !== undefined && (
                    <div className="text-[10px] text-[#8E8980]">{perfs.correspondence.games} games</div>
                  )}
                </div>

                <div className="rounded-xl bg-[#393734] py-3 px-2 flex flex-col items-center text-center gap-1">
                  <Zap className="w-6 h-6 text-[#81B64C]" />
                  <div className="text-lg font-extrabold font-mono text-white tabular-nums leading-none mt-1">
                    {Math.max(rushBest, perfs?.storm?.score ?? 0)}
                  </div>
                  <div className="text-[11px] font-semibold text-[#9E998F]">Storm High</div>
                  {perfs?.storm?.runs !== undefined && (
                    <div className="text-[10px] text-[#8E8980]">{perfs.storm.runs} runs</div>
                  )}
                </div>

                <div className="rounded-xl bg-[#393734] py-3 px-2 flex flex-col items-center text-center gap-1">
                  <Flame className="w-6 h-6 text-[#F7C045]" />
                  <div className="text-lg font-extrabold font-mono text-white tabular-nums leading-none mt-1">
                    {Math.max(puzzleStats.bestStreak, perfs?.streak?.score ?? 0)}
                  </div>
                  <div className="text-[11px] font-semibold text-[#9E998F]">Streak High</div>
                  {perfs?.streak?.runs !== undefined && (
                    <div className="text-[10px] text-[#8E8980]">{perfs.streak.runs} runs</div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Rating Progression Sparkline */}
          <div className="rounded-xl bg-[#393734] border border-white/8 p-3.5 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#81B64C]" />
                <span className="text-xs font-extrabold text-white">Rating Progression</span>
                <span
                  className={`text-xs font-mono font-bold tabular-nums ${
                    ratingDelta >= 0 ? 'text-[#81B64C]' : 'text-[#FA412D]'
                  }`}
                >
                  {activeSpeedRating} ({ratingDelta >= 0 ? `+${ratingDelta}` : ratingDelta})
                </span>
              </div>
              <div className="flex items-center gap-1">
                {(['rapid', 'blitz', 'bullet', 'puzzle'] as RatingSpeed[]).map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setHistorySpeed(sp)}
                    className={`px-2 py-1 rounded text-[11px] font-bold capitalize cursor-pointer ${
                      historySpeed === sp
                        ? 'bg-[#81B64C] text-[#191815]'
                        : 'bg-[#262421] text-[#B8B4AC] hover:text-white'
                    }`}
                  >
                    {sp}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full h-20 rounded-lg bg-[#262421] p-1.5">
              <svg viewBox="0 0 300 72" className="w-full h-full overflow-visible">
                <polyline
                  fill="none"
                  stroke="#81B64C"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylinePts}
                />
              </svg>
            </div>
          </div>
        </section>

        {/* Game History */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-extrabold text-white font-display">Game History</h2>
              <span className="text-xs font-mono font-bold text-[#9E998F] tabular-nums">
                {totalGames}
              </span>
            </div>
            <span className="text-xs font-semibold text-[#9E998F]">Review</span>
          </div>

          {visibleGames.length === 0 ? (
            localReviewed.length > 0 ? (
              <div className="space-y-1.5">
                {localReviewed.slice(0, 4).map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-xl bg-[#393734] px-3 py-2.5 flex items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Clock className="w-4 h-4 text-[#81B64C] shrink-0" />
                      <div className="w-8 h-8 rounded-lg bg-[#EAE8E3] flex items-center justify-center shrink-0">
                        <div className="w-5 h-5">
                          <ChessPiece type="p" color={rec.playerColor} />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          Reviewed Match · {rec.moveCount} moves
                        </div>
                        <div className="text-[11px] text-[#9E998F] font-mono">
                          Accuracy {rec.playerAccuracy}%
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('review')}
                      aria-label="Open Game Review"
                      className="w-8 h-8 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] flex items-center justify-center text-white shrink-0 cursor-pointer"
                    >
                      <Star className="w-4 h-4 fill-white" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-[#393734] p-4 text-center space-y-2">
                <p className="text-xs text-[#B8B4AC]">
                  {lichessSession
                    ? 'No synced online games found yet. Play an online match or start a game to build history.'
                    : 'Sign in or play a game to populate your synced Game History.'}
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('new-game')}
                  className="px-4 py-2 rounded-lg bg-[#81B64C] text-white text-xs font-extrabold cursor-pointer"
                >
                  Play a Game
                </button>
              </div>
            )
          ) : (
            <div className="space-y-1.5">
              {visibleGames.map((g) => {
                const isBlack = isGamePlayedAsBlack(
                  g,
                  lichessSession ? username : guestName,
                );
                const opponent = isBlack ? g.white : g.black;
                const oppIsGuest =
                  opponent.name === 'Guest Opponent' ||
                  opponent.name === 'Anonymous (Guest)' ||
                  opponent.name === 'Anonymous';
                const showOppRating =
                  typeof opponent.rating === 'number' && !oppIsGuest && g.rated !== false;
                const won =
                  g.winner === 'white'
                    ? !isBlack
                    : g.winner === 'black'
                      ? isBlack
                      : null;
                const SpeedIcon =
                  g.speed === 'blitz'
                    ? Zap
                    : g.speed === 'bullet'
                      ? Rocket
                      : Clock;
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
                    className="rounded-xl bg-[#393734] px-3 py-2.5 flex items-center justify-between gap-2.5"
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
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer hover:opacity-90"
                    >
                      <SpeedIcon className={`w-4 h-4 ${speedColor} shrink-0`} />
                      <PlayerAvatar
                        username={opponent.name}
                        avatarUrl={opponent.avatarUrl}
                        size={32}
                        rounded="rounded-lg"
                      />
                      <div className="min-w-0">
                        <div className="truncate">
                          <span className="text-xs sm:text-sm font-bold text-white hover:underline">
                            {opponent.name}
                          </span>{' '}
                          {showOppRating ? (
                            <span className="text-xs text-[#9E998F] font-mono tabular-nums">
                              ({opponent.rating})
                            </span>
                          ) : g.rated === false || oppIsGuest ? (
                            <span className="text-xs text-[#9E998F] font-mono">
                              (Unrated)
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[10px] text-[#9E998F] truncate">
                          {g.opening ? `${g.opening} · ` : ''}
                          {formatGamePlayedAgo(g.lastMoveAt ?? g.createdAt) || g.speed}
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {onOpenPlayerProfile && (
                        <button
                          type="button"
                          onClick={() => onOpenPlayerProfile(opponent.name)}
                          title={`Inspect ${opponent.name} profile`}
                          className="px-2 py-1 rounded-md bg-[#2B2925] hover:bg-[#45423E] text-[10px] font-bold text-[#C8C4BC] hover:text-white cursor-pointer"
                        >
                          Profile
                        </button>
                      )}
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
                        aria-label={`Review game vs ${opponent.name}`}
                        className="w-8 h-8 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] border-b-2 border-[#457524] flex items-center justify-center text-white cursor-pointer"
                      >
                        <Star className="w-4 h-4 fill-white" />
                      </button>
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() =>
                  recentGames.length > 5
                    ? setShowAllGames((v) => !v)
                    : onNavigate('review')
                }
                className="w-full min-h-[44px] rounded-xl bg-[#393734] hover:bg-[#43403C] text-sm font-bold text-white cursor-pointer"
              >
                {recentGames.length > 5
                  ? showAllGames
                    ? 'Show Fewer Games'
                    : 'View All Games'
                  : 'Open Full Game Review'}
              </button>
            </div>
          )}
        </section>

        {/* Friends Horizontal Scroll Cards */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-extrabold text-white font-display">Friends</h2>
              <span className="text-xs font-mono font-bold text-[#9E998F] tabular-nums">
                {friends.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('friends')}
              className="text-xs font-bold text-[#B8B4AC] hover:text-white cursor-pointer"
            >
              View All
            </button>
          </div>

          {friends.length === 0 ? (
            <div className="rounded-xl bg-[#393734] p-4 flex items-center justify-between gap-3">
              <span className="text-xs text-[#B8B4AC]">
                {lichessSession
                  ? 'Add friends to see their online status and challenge them fast.'
                  : 'Sign in to sync your friends list and challenge them anytime.'}
              </span>
              <button
                type="button"
                onClick={() => (lichessSession ? onNavigate('friends') : onConnectLichess())}
                className="px-3 py-2 rounded-lg bg-[#81B64C] text-white text-xs font-extrabold shrink-0 cursor-pointer"
              >
                {lichessSession ? 'Find Friends' : 'Sign In'}
              </button>
            </div>
          ) : (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {friends.map((fname) => {
                const st = friendStatuses[fname.toLowerCase()];
                const friendFlag = countryCodeToFlagEmoji(st?.flag);
                const seenText = st?.online
                  ? 'Online now'
                  : formatLastSeenAgo(st?.seenAt);
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
                      <div className="relative w-14 h-14 rounded-xl bg-[#262421] flex items-center justify-center">
                        <PlayerAvatar
                          username={fname}
                          avatarUrl={st?.avatarUrl}
                          size={56}
                          rounded="rounded-xl"
                        />
                        {st?.online && (
                          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#81B64C] border-2 border-[#393734]" />
                        )}
                      </div>
                      <div className="min-w-0 w-full">
                        <div className="text-xs font-extrabold text-white truncate">
                          {fname} {friendFlag}
                        </div>
                        <div className="text-[11px] text-[#9E998F] truncate mt-0.5">
                          {seenText}
                        </div>
                      </div>
                    </button>
                    <div className="w-full flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          onInviteFriend
                            ? onInviteFriend(fname)
                            : onStartGame({
                                mode: 'online-ws',
                                timeId: '10+0',
                                wsAction: 'create',
                                color: 'w',
                              })
                        }
                        className="flex-1 py-1.5 rounded-lg bg-[#4A4742] hover:bg-[#57544E] text-white text-xs font-bold cursor-pointer"
                      >
                        Invite
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
                        data-testid={`profile-remove-friend-${fname}`}
                        onClick={() => {
                          setFriends((prev) =>
                            prev.filter((f) => f.toLowerCase() !== fname.toLowerCase()),
                          );
                          onRemoveFriend?.(fname);
                        }}
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
          )}
        </section>

        {/* Awards Horizontal Cards */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-white font-display">Awards</h2>
            <button
              type="button"
              onClick={() => setShowAllAwards((v) => !v)}
              className="text-xs font-bold text-[#B8B4AC] hover:text-white cursor-pointer"
            >
              {showAllAwards ? 'Compact' : 'View All'}
            </button>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {visibleAwards.map((aw) => (
              <div
                key={aw.id}
                className={`w-[120px] shrink-0 rounded-xl bg-[#393734] p-2.5 flex flex-col items-center text-center gap-2 ${
                  aw.unlocked ? '' : 'opacity-55'
                }`}
              >
                <div
                  className={`w-16 h-16 rounded-xl flex items-center justify-center ${
                    aw.tone === 'orange'
                      ? 'bg-[#E56528]'
                      : aw.tone === 'amber'
                        ? 'bg-[#EAE8E3]'
                        : aw.tone === 'blue'
                          ? 'bg-[#46779E]'
                          : 'bg-[#769656]'
                  }`}
                >
                  {aw.id === 'hot-streak' ? (
                    <Flame className="w-8 h-8 text-[#F7C045] fill-[#F7C045]" />
                  ) : aw.id.startsWith('puzzle') ? (
                    <Puzzle className="w-8 h-8 text-[#E59A28]" />
                  ) : (
                    <Award className="w-8 h-8 text-white" />
                  )}
                </div>
                <div className="min-w-0 w-full">
                  <div className="text-xs font-extrabold text-white truncate">{aw.title}</div>
                  <div className="text-[10px] text-[#9E998F] truncate">{aw.subtitle}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Profile Settings Sheet */}
      <BottomSheet
        open={settingsOpen}
        title="Profile & Settings"
        desktopModal
        onClose={() => setSettingsOpen(false)}
      >
        <div className="p-4 space-y-3">
          <button
            type="button"
            onClick={() => {
              setSettingsOpen(false);
              setAvatarPickerOpen(true);
            }}
            className="w-full min-h-[48px] px-4 rounded-xl bg-[#393734] hover:bg-[#43403C] text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Camera className="w-4 h-4 text-[#81B64C]" />
            <span>Change Account Photo</span>
          </button>

          {lichessSession ? (
            <>
              <button
                type="button"
                onClick={() => void handleManualSync()}
                disabled={syncing}
                className="w-full min-h-[48px] px-4 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Refreshing...' : 'Refresh Profile Data'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  onDisconnectLichess();
                }}
                className="w-full min-h-[48px] px-4 rounded-xl bg-[#3B2320] hover:bg-[#4F2D28] text-[#F5B8B0] font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out ({lichessSession.account.username})</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                onConnectLichess();
              }}
              className="w-full min-h-[48px] px-4 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] text-white font-extrabold text-sm cursor-pointer"
            >
              Sign In / Create Account
            </button>
          )}

          <div className="pt-2 border-t border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-[#9E998F] flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-[#E59A28]" />
                <span>Board Theme</span>
              </div>
              {onOpenThemeStudio && (
                <button
                  type="button"
                  onClick={() => {
                    setSettingsOpen(false);
                    onOpenThemeStudio();
                  }}
                  className="text-[11px] font-extrabold text-[#81B64C] hover:text-[#98CA63] cursor-pointer"
                >
                  Open Themes Studio →
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Object.values(BOARD_THEME_PALETTES)
                .slice(0, 8)
                .map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onSetBoardTheme(b.id)}
                    className={`p-1.5 rounded-lg border flex flex-col items-center gap-1 cursor-pointer ${
                      boardTheme === b.id
                        ? 'bg-[#81B64C]/20 border-[#81B64C] text-white'
                        : 'bg-[#262421] border-white/10 text-[#C8C4BC]'
                    }`}
                  >
                    <span className="w-6 h-6 rounded overflow-hidden grid grid-cols-2 grid-rows-2 ring-1 ring-black/30">
                      <span style={{ backgroundColor: b.light }} />
                      <span style={{ backgroundColor: b.dark }} />
                      <span style={{ backgroundColor: b.dark }} />
                      <span style={{ backgroundColor: b.light }} />
                    </span>
                    <span className="text-[10px] font-bold truncate max-w-full">
                      {b.name.replace('Chess.com ', '').replace('Tournament ', '')}
                    </span>
                  </button>
                ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleMute}
            className="w-full min-h-[48px] px-4 rounded-xl bg-[#262421] border border-white/10 flex items-center justify-between text-sm font-bold text-white cursor-pointer"
          >
            <span className="flex items-center gap-2">
              {muted ? (
                <VolumeX className="w-4 h-4 text-[#FA412D]" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#81B64C]" />
              )}
              <span>Sound Effects</span>
            </span>
            <span className="text-xs font-mono text-[#81B64C]">{muted ? 'MUTED' : 'ON'}</span>
          </button>
        </div>
      </BottomSheet>

      <AvatarPickerModal
        open={avatarPickerOpen}
        username={username}
        currentAvatar={customAvatar ?? lichessSession?.account.profile?.avatarUrl}
        accessToken={lichessSession?.accessToken ?? null}
        onSelectAvatar={(nextAvatar) => {
          setCustomAvatar(nextAvatar);
          void onSyncAccount();
        }}
        onClose={() => setAvatarPickerOpen(false)}
      />

      {/* Edit Profile & Country Sheet */}
      <BottomSheet
        open={editProfileOpen}
        title="Change Name & Edit Profile"
        desktopModal
        onClose={() => setEditProfileOpen(false)}
      >
        <form onSubmit={(e) => void handleSaveProfile(e)} className="p-4 space-y-3.5">
          <div className="space-y-1.5">
            <label
              htmlFor="profile-edit-name"
              className="text-xs font-bold text-[#C8C4BC] flex items-center gap-1.5"
            >
              <Pencil className="w-3.5 h-3.5 text-[#81B64C]" />
              <span>Player Name / Username</span>
            </label>
            <input
              id="profile-edit-name"
              data-testid="profile-edit-name-input"
              type="text"
              maxLength={26}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Enter your chess display name..."
              className="w-full min-h-[44px] rounded-xl bg-[#262421] border border-white/10 px-3 text-sm font-bold text-white focus:outline-none focus:border-[#81B64C]"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="profile-country"
              className="text-xs font-bold text-[#C8C4BC] flex items-center gap-1.5"
            >
              <Globe className="w-3.5 h-3.5 text-[#81B64C]" />
              <span>Country / Flag</span>
            </label>
            <select
              id="profile-country"
              value={editCountry}
              onChange={(e) => setEditCountry(e.target.value)}
              className="w-full min-h-[44px] rounded-xl bg-[#262421] border border-white/10 px-3 text-sm text-white focus:outline-none focus:border-[#81B64C]"
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="profile-bio" className="text-xs font-bold text-[#C8C4BC]">
                Player Bio
              </label>
              <span className="text-[10px] font-mono text-[#9E998F]">{editBio.length}/240</span>
            </div>
            <textarea
              id="profile-bio"
              rows={3}
              maxLength={240}
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              placeholder="Share your favorite opening, club, or playstyle..."
              className="w-full rounded-xl bg-[#262421] border border-white/10 p-3 text-sm text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C]"
            />
          </div>

          {profileSaveErr && (
            <div className="p-2.5 rounded-lg bg-[#5C2320]/70 text-xs text-[#F7C7C1]">
              {profileSaveErr}
            </div>
          )}

          <button
            type="submit"
            disabled={savingProfile}
            className="w-full min-h-[46px] rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[3px] border-[#457524] text-white font-extrabold text-sm cursor-pointer disabled:opacity-50"
          >
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}
