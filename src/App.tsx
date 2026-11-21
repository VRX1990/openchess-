import { useEffect, useState, type ReactNode } from 'react';
import type { Color } from 'chess.js';
import {
  Home,
  Swords,
  Puzzle,
  BookOpen,
  SearchCheck,
  CalendarCheck2,
  Volume2,
  VolumeX,
  Palette,
  Menu,
  ChevronRight,
  ChevronDown,
  Flame,
  Monitor,
  Binoculars,
  Globe,
  Users,
  User,
  MessageSquare,
  Trophy,
  Search,
  LogOut,
} from 'lucide-react';
import { setSoundMuted } from './chess/sound';
import { DEFAULT_PREP_PLAN } from './chess/content';
import { loadGuestPlayerName, touchDailyStreak } from './chess/analytics';
import {
  loadSelectedCoachId,
  saveSelectedCoachId,
  type CoachPersonaId,
} from './chess/coach';
import { useLichessAuth } from './chess/useLichessAuth';
import { useSocialNotifications } from './chess/useSocialNotifications';
import {
  clearFriendRemovedInBackup,
  loadLocalFriendsBackup,
  markFriendRemovedInBackup,
  mergeFriendsBackupWithServer,
  saveLocalFriendsBackup,
} from './chess/onlineHelpers';
import { syncFriendsStateToFirestore } from './firebase';
import {
  BOARD_THEME_PALETTES,
  ChessThemeProvider,
  useChessTheme,
} from './chess/theme';
import { PlayerAvatar } from './components/PlayerAvatar';
import { BottomSheet } from './components/BottomSheet';
import { ThemesView } from './components/ThemesView';
import { SocialNotificationsOverlay } from './components/SocialNotificationsOverlay';
import { HomeView } from './components/HomeView';
import { ProfileView } from './components/ProfileView';
import { NewGameView } from './components/NewGameView';
import { BotsView } from './components/BotsView';
import { PlayView, type PlayPreset } from './components/PlayView';
import { PuzzlesView } from './components/PuzzlesView';
import { LearnView } from './components/LearnView';
import { ReviewView } from './components/ReviewView';
import { WatchView } from './components/WatchView';
import { FriendsView } from './components/FriendsView';
import { PrepView, type NavTab } from './components/PrepView';
import { AuthView } from './components/AuthView';
import { StreakView } from './components/StreakView';
import { MessagesView } from './components/MessagesView';
import { LeaderboardView } from './components/LeaderboardView';
import { PlayerProfileModal } from './components/PlayerProfileModal';
import {
  BrandPawnIcon,
  NavBotsIcon,
  NavFriendsIcon,
  NavLearnIcon,
  NavPlayIcon,
  NavPuzzlesIcon,
  NavReviewIcon,
  NavWatchIcon,
} from './components/ChessIcons';

function OpenChessLogo({ sizeClass = 'w-7 h-7' }: { sizeClass?: string }) {
  return <BrandPawnIcon className={`${sizeClass} shrink-0`} />;
}

export default function App() {
  return (
    <ChessThemeProvider>
      <AppContent />
    </ChessThemeProvider>
  );
}

function AppContent() {
  const {
    session: lichessSession,
    connecting: lichessConnecting,
    lastSyncedAt,
    authError: lichessAuthError,
    clearError: clearAuthError,
    signIn,
    signUp,
    signInWithGoogle,
    signInWithLichessOAuth,
    linkLichessOAuth,
    signInWithToken,
    linkOnlineToken,
    requestEmailCode,
    verifyEmailCode,
    applyAccountState,
    updateProfile,
    disconnect: disconnectLichess,
    syncNow,
    recordMatchResult,
    saveAccountPlayedGame,
    recordPuzzleProgress,
    submitRealPuzzleResult,
  } = useLichessAuth();

  const [dailyStreak] = useState(() => touchDailyStreak());

  const initialRoomParam =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() || null
      : null;

  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1' || params.get('room')) return 'play';
    }
    return 'home';
  });

  const { prefs: themePrefs, setBoardTheme } = useChessTheme();
  const boardTheme = themePrefs.boardTheme;
  const activeBoardMeta = BOARD_THEME_PALETTES[boardTheme] ?? BOARD_THEME_PALETTES.green;
  const [selectedCoachId, setSelectedCoachId] = useState<CoachPersonaId>(() =>
    loadSelectedCoachId(),
  );
  const handleCoachChange = (nextId: CoachPersonaId) => {
    setSelectedCoachId(nextId);
    saveSelectedCoachId(nextId);
  };
  const [muted, setMuted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [desktopMoreOpen, setDesktopMoreOpen] = useState(false);
  const [playIsActive, setPlayIsActive] = useState(false);
  const [pendingNavTab, setPendingNavTab] = useState<NavTab | null>(null);
  const [newGameTimeId, setNewGameTimeId] = useState<string>('10+0');
  const [playPreset, setPlayPreset] = useState<PlayPreset | null>(() =>
    initialRoomParam
      ? {
          mode: 'online-ws',
          wsAction: 'join',
          wsRoomId: initialRoomParam,
          nonce: Date.now(),
        }
      : null,
  );
  const [profileModalUsername, setProfileModalUsername] = useState<string | null>(null);
  const [dmTargetUsername, setDmTargetUsername] = useState<string | null>(null);
  const [friendsList, setFriendsList] = useState<string[]>(
    () => loadLocalFriendsBackup(lichessSession?.account.username).friends,
  );
  const [outgoingFriendReqs, setOutgoingFriendReqs] = useState<string[]>(
    () => loadLocalFriendsBackup(lichessSession?.account.username).outgoingRequests,
  );
  const [incomingFriendReqs, setIncomingFriendReqs] = useState<string[]>([]);

  const [reviewPayload, setReviewPayload] = useState<{
    pgn: string;
    color: Color;
    result: string;
  }>({
    pgn: '',
    color: 'w',
    result: '*',
  });
  const [reviewNavNonce, setReviewNavNonce] = useState(0);

  const [stats, setStats] = useState(() => {
    const defaults = { gamesPlayed: 0, puzzlesSolved: 0, lessonsCompleted: 0 };
    try {
      const saved =
        localStorage.getItem('openchess_stats') ??
        localStorage.getItem('crownline_stats');
      if (!saved) return defaults;
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return {
          gamesPlayed: Number(parsed.gamesPlayed) || 0,
          puzzlesSolved: Number(parsed.puzzlesSolved) || 0,
          lessonsCompleted: Number(parsed.lessonsCompleted) || 0,
        };
      }
      return defaults;
    } catch {
      return defaults;
    }
  });

  const prepDoneCount = (() => {
    try {
      const saved =
        localStorage.getItem('openchess_daily_sharping_done') ??
        localStorage.getItem('crownline_sunday_prep');
      if (!saved) return 0;
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  })();

  const prepTotalCount = DEFAULT_PREP_PLAN.reduce(
    (acc, d) => acc + d.tasks.length,
    0,
  );

  const incrementStat = (key: 'gamesPlayed' | 'puzzlesSolved' | 'lessonsCompleted') => {
    setStats((prev: typeof stats) => {
      const next = { ...prev, [key]: (prev[key] ?? 0) + 1 };
      localStorage.setItem('openchess_stats', JSON.stringify(next));
      return next;
    });
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  };

  const openThemeStudio = () => {
    navigateTo('themes');
  };

  const navigateTo = (tab: NavTab, preserveReview = false) => {
    if (activeTab === 'play' && tab !== 'play' && playIsActive) {
      setMoreOpen(false);
      setPendingNavTab(tab);
      return;
    }
    if (tab === 'review' && !preserveReview) {
      setReviewPayload({ pgn: '', color: 'w', result: '*' });
      setReviewNavNonce((n) => n + 1);
    }
    setMoreOpen(false);
    setActiveTab(tab);
    if (
      lichessSession?.accessToken &&
      (tab === 'home' || tab === 'profile' || tab === 'puzzles' || tab === 'friends')
    ) {
      void syncNow();
    }
  };

  const openAuthPage = () => {
    clearAuthError();
    navigateTo('auth');
  };

  const handleQuickPlay = (opts?: Omit<PlayPreset, 'nonce'>) => {
    setPlayPreset({
      ...opts,
      nonce: Date.now(),
    });
    setMoreOpen(false);
    setActiveTab('play');
  };

  const {
    incomingFriendRequests,
    incomingGameInvites,
    outgoingGameInvites,
    lastDmNotification,
    lastDmEvent,
    unreadDmCount,
    dmVersion,
    toastMessage,
    friendListsVersion,
    busyId: notificationBusyId,
    dismissToast,
    dismissDmNotification,
    refreshDmCount,
    sendGameInvite,
    respondToGameInvite,
    respondToFriendRequest,
    bumpFriendListsVersion,
  } = useSocialNotifications({
    session: lichessSession,
    onAccountUpdated: applyAccountState,
    onLaunchInvitedMatch: ({ roomId, timeId, color }) => {
      handleQuickPlay({
        mode: 'online-ws',
        timeId,
        wsAction: 'join',
        wsRoomId: roomId,
        color,
      });
    },
  });

  useEffect(() => {
    const token = lichessSession?.accessToken;
    const uname = lichessSession?.account.username;
    if (!token) {
      setFriendsList([]);
      setOutgoingFriendReqs([]);
      setIncomingFriendReqs([]);
      return;
    }
    const cached = loadLocalFriendsBackup(uname);
    if (cached.friends.length > 0 && friendsList.length === 0) {
      setFriendsList(cached.friends);
    }
    if (cached.outgoingRequests.length > 0 && outgoingFriendReqs.length === 0) {
      setOutgoingFriendReqs(cached.outgoingRequests);
    }
    let cancelled = false;
    fetch('/api/account/friends', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as {
          friends?: string[];
          outgoingRequests?: string[];
          incomingRequests?: string[];
          removedFriends?: string[];
        };
      })
      .then((data) => {
        if (cancelled || !data) return;
        const merged = mergeFriendsBackupWithServer({
          serverFriends: Array.isArray(data.friends) ? data.friends : [],
          serverOutgoing: Array.isArray(data.outgoingRequests) ? data.outgoingRequests : [],
          serverRemoved: Array.isArray(data.removedFriends) ? data.removedFriends : [],
          localBackup: loadLocalFriendsBackup(uname),
        });
        const nextIncoming = Array.isArray(data.incomingRequests) ? data.incomingRequests : [];
        setFriendsList(merged.friends);
        setOutgoingFriendReqs(merged.outgoingRequests);
        setIncomingFriendReqs(nextIncoming);
        saveLocalFriendsBackup(
          uname,
          merged.friends,
          merged.outgoingRequests,
          merged.removedFriends,
        );
        void syncFriendsStateToFirestore(merged).catch(() => {});
      })
      .catch(() => {
        // ignore network errors
      });
    return () => {
      cancelled = true;
    };
  }, [lichessSession?.accessToken, lichessSession?.account.username, friendListsVersion]);

  const handleSendFriendRequest = async (targetUsername: string) => {
    const clean = targetUsername.trim();
    if (!clean) return;
    if (!lichessSession?.accessToken) {
      openAuthPage();
      return;
    }
    try {
      const res = await fetch('/api/account/friends', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lichessSession.accessToken}`,
        },
        body: JSON.stringify({ username: clean }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          friends?: string[];
          outgoingRequests?: string[];
          incomingRequests?: string[];
          removedFriends?: string[];
        };
        clearFriendRemovedInBackup(lichessSession.account.username, clean);
        const nextFriends = Array.isArray(data.friends) ? data.friends : friendsList;
        const nextOutgoing = Array.isArray(data.outgoingRequests)
          ? data.outgoingRequests
          : outgoingFriendReqs;
        if (Array.isArray(data.friends)) setFriendsList(data.friends);
        if (Array.isArray(data.outgoingRequests)) setOutgoingFriendReqs(data.outgoingRequests);
        if (Array.isArray(data.incomingRequests)) setIncomingFriendReqs(data.incomingRequests);
        saveLocalFriendsBackup(
          lichessSession.account.username,
          nextFriends,
          nextOutgoing,
          Array.isArray(data.removedFriends) ? data.removedFriends : undefined,
        );
        void syncFriendsStateToFirestore(
          loadLocalFriendsBackup(lichessSession.account.username),
        ).catch(() => {});
        bumpFriendListsVersion();
      }
    } catch {
      // ignore network failure
    }
  };

  const handleRemoveFriend = async (targetUsername: string) => {
    const clean = targetUsername.trim();
    if (!clean || !lichessSession?.accessToken) return;
    const optimistic = markFriendRemovedInBackup(lichessSession.account.username, clean);
    setFriendsList(optimistic.friends);
    setOutgoingFriendReqs(optimistic.outgoingRequests);
    void syncFriendsStateToFirestore(optimistic).catch(() => {});
    try {
      const res = await fetch(
        `/api/account/friends/${encodeURIComponent(clean)}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${lichessSession.accessToken}`,
          },
        },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          friends?: string[];
          outgoingRequests?: string[];
          incomingRequests?: string[];
          removedFriends?: string[];
        };
        const nextFriends = Array.isArray(data.friends) ? data.friends : optimistic.friends;
        const nextOutgoing = Array.isArray(data.outgoingRequests)
          ? data.outgoingRequests
          : optimistic.outgoingRequests;
        if (Array.isArray(data.friends)) setFriendsList(data.friends);
        if (Array.isArray(data.outgoingRequests)) setOutgoingFriendReqs(data.outgoingRequests);
        if (Array.isArray(data.incomingRequests)) setIncomingFriendReqs(data.incomingRequests);
        saveLocalFriendsBackup(
          lichessSession.account.username,
          nextFriends,
          nextOutgoing,
          Array.isArray(data.removedFriends) ? data.removedFriends : optimistic.removedFriends,
        );
        void syncFriendsStateToFirestore(
          loadLocalFriendsBackup(lichessSession.account.username),
        ).catch(() => {});
      }
    } catch {
      // ignore network failure
    } finally {
      bumpFriendListsVersion();
    }
  };

  const openMessageWith = (username: string) => {
    setDmTargetUsername(username);
    navigateTo('messages');
  };

  const invitePlayerToPlay = (username: string) => {
    if (!lichessSession?.accessToken) {
      openAuthPage();
      return;
    }
    void sendGameInvite({
      toUsername: username,
      timeId: '10+0',
      initialSeconds: 600,
      incrementSeconds: 0,
      color: 'random',
      rated: true,
    });
  };

  const handleSendToReview = (pgn: string, color: Color, result: string) => {
    setReviewPayload({ pgn, color, result });
    navigateTo('review', true);
  };

  const desktopPrimaryNavItems: {
    id: NavTab;
    label: string;
    renderIcon: () => ReactNode;
  }[] = [
    { id: 'play', label: 'Play', renderIcon: () => <NavPlayIcon className="w-[26px] h-[26px] shrink-0" /> },
    { id: 'puzzles', label: 'Puzzles', renderIcon: () => <NavPuzzlesIcon className="w-[26px] h-[26px] shrink-0" /> },
    { id: 'learn', label: 'Learn', renderIcon: () => <NavLearnIcon className="w-[26px] h-[26px] shrink-0" /> },
    { id: 'review', label: 'Review', renderIcon: () => <NavReviewIcon className="w-[26px] h-[26px] shrink-0" /> },
    { id: 'watch', label: 'Watch', renderIcon: () => <NavWatchIcon className="w-[26px] h-[26px] shrink-0" /> },
    { id: 'friends', label: 'Friends', renderIcon: () => <NavFriendsIcon className="w-[26px] h-[26px] shrink-0" /> },
  ];

  const desktopSecondaryNavItems: { id: NavTab; label: string; icon: typeof Swords }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'bots', label: 'Play Bots', icon: Monitor },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { id: 'prep', label: 'Sharping', icon: CalendarCheck2 },
    { id: 'themes', label: 'Themes', icon: Palette },
  ];

  const desktopSecondaryActive = desktopSecondaryNavItems.some(
    (item) => item.id !== 'home' && item.id === activeTab,
  );

  // Exact Chess.com Bottom 5-Tab Bar: Home | Puzzles | Learn | Watch | More
  const mobilePrimaryTabs: {
    id: 'home' | 'puzzles' | 'learn' | 'watch';
    label: string;
    icon: typeof Swords;
  }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'puzzles', label: 'Puzzles', icon: Puzzle },
    { id: 'learn', label: 'Learn', icon: BookOpen },
    { id: 'watch', label: 'Watch', icon: Binoculars },
  ];

  const isFocusedGameScreen =
    activeTab === 'play' ||
    activeTab === 'new-game' ||
    activeTab === 'bots' ||
    activeTab === 'auth' ||
    activeTab === 'profile' ||
    activeTab === 'streak' ||
    activeTab === 'friends';
  const isMoreActive =
    moreOpen ||
    activeTab === 'review' ||
    activeTab === 'prep' ||
    activeTab === 'messages' ||
    activeTab === 'leaderboard' ||
    activeTab === 'themes';

  return (
    <div className="min-h-dvh bg-[#302E2B] text-white flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar Rail — Authentic Flush #262421 Rail */}
      <aside className="hidden lg:flex lg:w-[160px] lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto bg-[#262421] flex-col justify-between shrink-0 py-2">
        <div>
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('home');
            }}
            className="flex items-center gap-1.5 px-3 py-2 mb-1 hover:opacity-95 whitespace-nowrap"
          >
            <OpenChessLogo sizeClass="w-6 h-6 shrink-0" />
            <span className="text-[17.5px] font-black tracking-tight font-display text-white leading-none">
              Open<span className="font-bold text-[#E6E5E2]">Chess</span>
            </span>
          </a>

          <nav aria-label="Primary navigation" className="flex flex-col">
            {desktopPrimaryNavItems.map((item) => {
              const active =
                activeTab === item.id ||
                (item.id === 'play' && activeTab === 'new-game');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    navigateTo(item.id === 'play' && !playIsActive ? 'new-game' : item.id)
                  }
                  className={`w-full h-[42px] flex items-center gap-2.5 px-3.5 text-[14px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#1F1E1B] text-white'
                      : 'text-[#E7E6E4] hover:text-white hover:bg-black/20'
                  }`}
                >
                  {item.renderIcon()}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setDesktopMoreOpen((prev) => !prev)}
              aria-expanded={desktopMoreOpen || desktopSecondaryActive}
              className={`w-full h-[40px] flex items-center justify-between gap-2 px-3.5 text-[14px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                desktopSecondaryActive
                  ? 'bg-[#1F1E1B] text-white'
                  : 'text-[#BEBDBB] hover:text-white hover:bg-black/20'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-[26px] flex items-center justify-center shrink-0">
                  <ChevronDown
                    className={`w-4 h-4 text-[#9B9A97] transition-transform ${
                      desktopMoreOpen || desktopSecondaryActive ? 'rotate-180' : ''
                    }`}
                  />
                </span>
                <span className="truncate">More</span>
              </span>
              {unreadDmCount > 0 && !(desktopMoreOpen || desktopSecondaryActive) && (
                <span className="w-2 h-2 rounded-full bg-[#81B64C] shrink-0" />
              )}
            </button>

            {(desktopMoreOpen || desktopSecondaryActive) && (
              <div className="bg-[#21201D] py-1">
                {desktopSecondaryNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigateTo(item.id)}
                      className={`w-full h-[36px] flex items-center justify-between gap-2 pl-5 pr-3 text-[13px] font-bold transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-[#302E2B] text-white'
                          : 'text-[#B5B4B1] hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        {item.id === 'bots' ? (
                          <NavBotsIcon className="w-4 h-4 shrink-0" />
                        ) : (
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              active ? 'text-[#81B64C]' : 'text-[#8E8C88]'
                            }`}
                          />
                        )}
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.id === 'messages' && unreadDmCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-[#81B64C] text-[#1D1B18] text-[10px] font-extrabold tabular-nums">
                          {unreadDmCount > 99 ? '99+' : unreadDmCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </nav>
        </div>

        <div className="px-3 pb-1.5 space-y-2">
          <button
            type="button"
            onClick={() => navigateTo('friends')}
            className="w-full flex items-center gap-2.5 px-1.5 py-1.5 text-[13px] font-semibold text-[#9B9A97] hover:text-white transition-colors cursor-pointer"
          >
            <Search className="w-[18px] h-[18px] shrink-0" />
            <span className="truncate">Search</span>
          </button>

          {lichessSession ? (
            <button
              type="button"
              onClick={() => navigateTo('profile')}
              title="Open Profile"
              className="w-full flex items-center gap-2.5 px-1 py-1 rounded-[5px] hover:bg-white/[0.06] text-[13px] font-bold text-white cursor-pointer"
            >
              <PlayerAvatar
                username={lichessSession.account.username}
                avatarUrl={lichessSession.account.profile?.avatarUrl}
                isCurrentUser
                size={26}
                rounded="rounded-[3px]"
              />
              <span className="truncate">{lichessSession.account.username}</span>
            </button>
          ) : (
            <div className="space-y-1.5 pt-0.5">
              <button
                type="button"
                onClick={openAuthPage}
                disabled={lichessConnecting}
                className="w-full h-[36px] rounded-[5px] cc-btn-primary-sm text-[13px] font-extrabold text-white cursor-pointer"
              >
                {lichessConnecting ? 'Signing in...' : 'Sign Up'}
              </button>
              <button
                type="button"
                onClick={openAuthPage}
                disabled={lichessConnecting}
                className="w-full h-[34px] rounded-[5px] cc-btn-secondary text-[13px] font-bold text-[#DEDDD9] hover:text-white cursor-pointer"
              >
                Log In
              </button>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 text-[#9B9A97]">
            <button
              type="button"
              onClick={() => navigateTo('friends')}
              aria-label="Friends"
              title="Friends"
              className="p-1 rounded hover:text-white hover:bg-white/[0.06] cursor-pointer"
            >
              <Users className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigateTo('messages')}
              aria-label="Messages"
              title="Messages"
              className="relative p-1 rounded hover:text-white hover:bg-white/[0.06] cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              {unreadDmCount > 0 && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-[#81B64C]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => navigateTo('streak')}
              aria-label={`Daily streak ${dailyStreak.days} days`}
              title={`Daily streak: ${dailyStreak.days} days`}
              className="p-1 rounded hover:text-[#F7C045] hover:bg-white/[0.06] cursor-pointer"
            >
              <Flame className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? 'Unmute Sound' : 'Mute Sound'}
              title={muted ? 'Sound Muted' : 'Sound On'}
              className="p-1 rounded hover:text-white hover:bg-white/[0.06] cursor-pointer"
            >
              {muted ? (
                <VolumeX className="w-4 h-4 text-[#FA412D]" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            {lichessSession ? (
              <button
                type="button"
                onClick={disconnectLichess}
                aria-label="Sign Out"
                title="Sign Out"
                className="p-1 rounded hover:text-[#FF7D6B] hover:bg-[#CA3431]/15 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={openThemeStudio}
                aria-label="Board Themes"
                title="Board Themes"
                className="p-1 rounded hover:text-white hover:bg-white/[0.06] cursor-pointer"
              >
                <Palette className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Hub Header */}
      {!isFocusedGameScreen && (
        <header className="lg:hidden sticky top-0 z-30 h-12 bg-[#262421] border-b border-white/[0.06] px-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigateTo('profile')}
              aria-label="Open Profile"
              className="relative w-8 h-8 rounded-lg flex items-center justify-center shrink-0 cursor-pointer"
            >
              <PlayerAvatar
                username={lichessSession?.account.username ?? 'You'}
                avatarUrl={lichessSession?.account.profile?.avatarUrl}
                isCurrentUser
                size={32}
                rounded="rounded-lg"
              />
              {lichessSession && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#81B64C] border-2 border-[#262421]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => navigateTo('streak')}
              title={`Daily streak: ${dailyStreak.days} day${dailyStreak.days === 1 ? '' : 's'} opened (Best: ${dailyStreak.bestDays})`}
              aria-label={`Daily streak ${dailyStreak.days} days`}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#393734] hover:bg-[#43403C] text-xs font-mono font-bold text-[#F7C045] tabular-nums cursor-pointer"
            >
              <Flame className="w-3.5 h-3.5 fill-[#F7C045]" />
              <span>{dailyStreak.days}</span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigateTo('friends')}
              aria-label="Friends"
              className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-[#6FB3E0] cursor-pointer"
            >
              <Users className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigateTo('review')}
              aria-label="Game Review"
              className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-[#81B64C] cursor-pointer"
            >
              <SearchCheck className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => (lichessSession ? navigateTo('profile') : openAuthPage())}
              aria-label={lichessSession ? 'Account Profile' : 'Sign In'}
              className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-[#F7C045] cursor-pointer"
            >
              <User className="w-4 h-4" />
            </button>
          </div>
        </header>
      )}

      {/* Main Workspace */}
      <main
        className={`flex-1 overflow-x-clip ${
          activeTab === 'review'
            ? 'p-0 pb-[56px] lg:pb-0'
            : activeTab === 'bots' || activeTab === 'play'
              ? 'px-2.5 sm:p-4 lg:p-5 pt-0 pb-0 lg:pb-5'
              : isFocusedGameScreen
                ? 'px-2.5 sm:p-4 lg:p-5 pt-1 pb-6 lg:pb-5'
                : 'px-2.5 sm:p-4 lg:p-5 pt-1 pb-[70px] lg:pb-5'
        }`}
      >
        <div key={activeTab} className="animate-view-enter">
          {activeTab === 'home' && (
            <HomeView
              stats={stats}
              dailyStreakDays={dailyStreak.days}
              boardTheme={boardTheme}
              lichessSession={lichessSession}
              lichessConnecting={lichessConnecting}
              lastSyncedAt={lastSyncedAt}
              coachId={selectedCoachId}
              onCoachChange={handleCoachChange}
              onConnectLichess={openAuthPage}
              onDisconnectLichess={disconnectLichess}
              onUpdateProfile={updateProfile}
              onQuickPlay={handleQuickPlay}
              onOpenNewGame={(timeId) => {
                if (timeId) setNewGameTimeId(timeId);
                navigateTo('new-game');
              }}
              onNavigate={navigateTo}
              onSendToReview={handleSendToReview}
              onInviteFriend={invitePlayerToPlay}
              onOpenPlayerProfile={setProfileModalUsername}
              onMessageFriend={openMessageWith}
              friendListsVersion={friendListsVersion}
              onRemoveFriend={(u) => void handleRemoveFriend(u)}
            />
          )}
          {activeTab === 'profile' && (
            <ProfileView
              stats={stats}
              lichessSession={lichessSession}
              lastSyncedAt={lastSyncedAt}
              boardTheme={boardTheme}
              muted={muted}
              onSetBoardTheme={setBoardTheme}
              onToggleMute={toggleMute}
              onOpenThemeStudio={openThemeStudio}
              onBack={() => navigateTo('home')}
              onNavigate={navigateTo}
              onConnectLichess={openAuthPage}
              onDisconnectLichess={disconnectLichess}
              onSyncAccount={syncNow}
              onUpdateProfile={updateProfile}
              onOpenPlayerProfile={setProfileModalUsername}
              onMessageFriend={openMessageWith}
              onStartGame={(opts) => handleQuickPlay(opts)}
              onInviteFriend={invitePlayerToPlay}
              onSendToReview={handleSendToReview}
              friendListsVersion={friendListsVersion}
              onRemoveFriend={(u) => void handleRemoveFriend(u)}
            />
          )}
          {activeTab === 'streak' && (
            <StreakView
              streak={dailyStreak}
              onBack={() => navigateTo('home')}
            />
          )}
          {activeTab === 'new-game' && (
            <NewGameView
              initialTimeId={newGameTimeId}
              boardTheme={boardTheme}
              lichessSession={lichessSession}
              lichessConnecting={lichessConnecting}
              lichessAuthError={lichessAuthError}
              coachId={selectedCoachId}
              onCoachChange={handleCoachChange}
              onConnectLichess={openAuthPage}
              onBack={() => navigateTo('home')}
              onStartGame={(opts) => handleQuickPlay(opts)}
              onOpenBots={() => navigateTo('bots')}
              onOpenFriends={() => navigateTo('friends')}
              onOpenPlayerProfile={setProfileModalUsername}
            />
          )}
          {activeTab === 'bots' && (
            <BotsView
              boardTheme={boardTheme}
              playerUsername={lichessSession?.account.username ?? loadGuestPlayerName()}
              playerAvatarUrl={lichessSession?.account.profile?.avatarUrl}
              onBack={() => navigateTo('home')}
              onStartMatch={({ botId, botElo, timeId, color, coachGuard }) =>
                handleQuickPlay({ botId, botElo, timeId, mode: 'bot', color, coachGuard })
              }
            />
          )}
          {activeTab === 'play' && (
            <PlayView
              boardTheme={boardTheme}
              preset={playPreset}
              lichessToken={lichessSession?.accessToken ?? null}
              lichessUsername={lichessSession?.account.username ?? loadGuestPlayerName()}
              lichessFlag={
                lichessSession?.account.profile?.flag ||
                lichessSession?.account.profile?.country ||
                null
              }
              lichessPerfs={lichessSession?.account.perfs}
              coachId={selectedCoachId}
              onCoachChange={handleCoachChange}
              onBack={() => {
                setPlayIsActive(false);
                setMoreOpen(false);
                setActiveTab('home');
              }}
              onActiveGameChange={setPlayIsActive}
              onSendToReview={handleSendToReview}
              onRecordGamePlayed={() => incrementStat('gamesPlayed')}
              onRecordAccountResult={(res) => {
                void recordMatchResult(res);
              }}
              onSavePlayedGame={(game) => {
                void saveAccountPlayedGame(game);
              }}
              onOpenPlayerProfile={setProfileModalUsername}
              friends={friendsList}
              onAddFriend={(u) => void handleSendFriendRequest(u)}
              onMessagePlayer={openMessageWith}
              onLaunchRoom={({ roomId, timeId, color }) =>
                handleQuickPlay({
                  mode: 'online-ws',
                  wsRoomId: roomId,
                  wsAction: 'join',
                  timeId,
                  color,
                })
              }
            />
          )}
          {activeTab === 'puzzles' && (
            <PuzzlesView
              boardTheme={boardTheme}
              syncedPuzzleRating={lichessSession?.account.perfs?.puzzle?.rating}
              syncedPuzzleGames={lichessSession?.account.perfs?.puzzle?.games}
              syncedStormHigh={lichessSession?.account.perfs?.storm?.score}
              syncedStreakHigh={lichessSession?.account.perfs?.streak?.score}
              lichessToken={lichessSession?.accessToken ?? null}
              hasOnlineToken={Boolean(lichessSession?.hasOnlineToken)}
              lastSyncedAt={lastSyncedAt}
              username={lichessSession?.account.username}
              onPuzzleSolved={() => incrementStat('puzzlesSolved')}
              onRecordAccountResult={(res) => {
                void recordMatchResult(res);
              }}
              onSyncPuzzleProgress={(progress) => {
                void recordPuzzleProgress(progress);
              }}
              onSubmitRealPuzzleResult={submitRealPuzzleResult}
            />
          )}
          {activeTab === 'learn' && (
            <LearnView
              boardTheme={boardTheme}
              onLessonCompleted={() => incrementStat('lessonsCompleted')}
            />
          )}
          {activeTab === 'watch' && (
            <WatchView
              boardTheme={boardTheme}
              onSendToReview={handleSendToReview}
              onOpenPlayerProfile={setProfileModalUsername}
            />
          )}
          {activeTab === 'friends' && (
            <FriendsView
              lichessSession={lichessSession}
              lastSyncedAt={lastSyncedAt}
              friendListsVersion={friendListsVersion}
              outgoingGameInvites={outgoingGameInvites}
              onConnectLichess={openAuthPage}
              onBack={() => navigateTo('home')}
              onStartGame={(opts) => handleQuickPlay(opts)}
              onSendToReview={handleSendToReview}
              onSendGameInvite={sendGameInvite}
              onCancelGameInvite={(inviteId) => void respondToGameInvite(inviteId, 'cancel')}
              onFriendListsChanged={bumpFriendListsVersion}
              onOpenPlayerProfile={setProfileModalUsername}
              onMessageFriend={openMessageWith}
            />
          )}
          {activeTab === 'messages' && (
            <MessagesView
              lichessSession={lichessSession}
              initialPartner={dmTargetUsername}
              lastDmEvent={lastDmEvent}
              dmVersion={dmVersion}
              onConnectLichess={openAuthPage}
              onOpenPlayerProfile={setProfileModalUsername}
              onChallengePlayer={invitePlayerToPlay}
              onDmCountChanged={() => void refreshDmCount()}
            />
          )}
          {activeTab === 'leaderboard' && (
            <LeaderboardView
              lichessSession={lichessSession}
              onOpenPlayerProfile={setProfileModalUsername}
            />
          )}
          {activeTab === 'review' && (
            <ReviewView
              boardTheme={boardTheme}
              initialPgn={reviewPayload.pgn}
              initialPlayerColor={reviewPayload.color}
              initialResult={reviewPayload.result}
              navNonce={reviewNavNonce}
              lichessSession={lichessSession}
              lastSyncedAt={lastSyncedAt}
              coachId={selectedCoachId}
              onCoachChange={handleCoachChange}
            />
          )}
          {activeTab === 'prep' && (
            <PrepView stats={stats} onNavigate={navigateTo} />
          )}
          {activeTab === 'themes' && (
            <ThemesView onBack={() => navigateTo('home')} />
          )}
          {activeTab === 'auth' && (
            <AuthView
              lichessSession={lichessSession}
              loading={lichessConnecting}
              authError={lichessAuthError}
              onClearError={clearAuthError}
              onSignIn={signIn}
              onSignUp={signUp}
              onSignInWithGoogle={signInWithGoogle}
              onSignInWithLichess={signInWithLichessOAuth}
              onLinkLichess={linkLichessOAuth}
              onSignInWithToken={signInWithToken}
              onLinkToken={linkOnlineToken}
              onRequestEmailCode={requestEmailCode}
              onVerifyEmailCode={verifyEmailCode}
              onSyncNow={syncNow}
              onDisconnect={disconnectLichess}
              onSuccess={() => navigateTo('home')}
              onBack={() => navigateTo('home')}
            />
          )}
        </div>
      </main>

      {/* Mobile Fixed 5-Tab Bottom Bar (Home / Puzzles / Learn / Watch / More) */}
      {!isFocusedGameScreen && (
        <nav
          aria-label="Mobile navigation"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-[#262421] border-t border-white/10 grid grid-cols-5 items-center"
        >
          {mobilePrimaryTabs.map((item) => {
            const Icon = item.icon;
            const active = !moreOpen && activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTo(item.id)}
                className={`min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                  active ? 'text-[#81B64C]' : 'text-[#9E998F] hover:text-white'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" />
                <span className="text-[10px] font-bold tracking-tight leading-none">
                  {item.label}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className={`min-h-[44px] h-full flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
              isMoreActive ? 'text-[#81B64C]' : 'text-[#9E998F] hover:text-white'
            }`}
          >
            <Menu className="w-[18px] h-[18px]" />
            <span className="text-[10px] font-bold tracking-tight leading-none">
              More
            </span>
          </button>
        </nav>
      )}

      {/* Mobile More Menu Sheet */}
      <BottomSheet
        open={moreOpen}
        title="More · OpenChess"
        onClose={() => setMoreOpen(false)}
      >
        <div data-testid="more-menu-content" className="p-4 pb-6 space-y-2.5">
          <button
            type="button"
            onClick={() => navigateTo('friends')}
            className="w-full shrink-0 min-h-[52px] px-3.5 py-3 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3 text-left">
              <Users className="w-5 h-5 text-[#6FB3E0] shrink-0" />
              <div>
                <div className="text-sm font-bold text-white">Friends</div>
                <div className="text-xs text-[#9E998F]">
                  Challenge friends, rooms, and inspect recent games
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#8E8980] shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => navigateTo('messages')}
            className="w-full shrink-0 min-h-[52px] px-3.5 py-3 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3 text-left">
              <MessageSquare className="w-5 h-5 text-[#81B64C] shrink-0" />
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Messages</span>
                  {unreadDmCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-[#81B64C] text-[#1D1B18] text-[10px] font-extrabold">
                      {unreadDmCount}
                    </span>
                  )}
                </div>
                <div className="text-xs text-[#9E998F]">
                  Direct messages and live player conversations
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#8E8980] shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => navigateTo('leaderboard')}
            className="w-full shrink-0 min-h-[52px] px-3.5 py-3 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3 text-left">
              <Trophy className="w-5 h-5 text-[#F7C045] shrink-0" />
              <div>
                <div className="text-sm font-bold text-white">Leaderboard</div>
                <div className="text-xs text-[#9E998F]">
                  Top Rapid, Blitz, Bullet, Puzzle &amp; League rankings
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#8E8980] shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => navigateTo('review')}
            className="w-full shrink-0 min-h-[52px] px-3.5 py-3 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3 text-left">
              <SearchCheck className="w-5 h-5 text-[#81B64C] shrink-0" />
              <div>
                <div className="text-sm font-bold text-white">Game Review</div>
                <div className="text-xs text-[#9E998F]">
                  Full move accuracy, Cloud Engine eval &amp; game import
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#8E8980] shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => navigateTo('new-game')}
            className="w-full shrink-0 min-h-[52px] px-3.5 py-3 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3 text-left">
              <Swords className="w-5 h-5 text-[#81B64C] shrink-0" />
              <div>
                <div className="text-sm font-bold text-white">New Game</div>
                <div className="text-xs text-[#9E998F]">
                  Play Online, Play a Friend, Bots, or Pass &amp; Play
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#8E8980] shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => navigateTo('bots')}
            className="w-full shrink-0 min-h-[52px] px-3.5 py-3 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3 text-left">
              <Monitor className="w-5 h-5 text-[#7FC4ED] shrink-0" />
              <div>
                <div className="text-sm font-bold text-white">Play Bots</div>
                <div className="text-xs text-[#9E998F]">
                  Spar from Pip (100) to Apex Engine (3200)
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#8E8980] shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => navigateTo('prep')}
            className={`w-full shrink-0 min-h-[52px] px-3.5 py-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer ${
              activeTab === 'prep'
                ? 'bg-[#383530] border-[#81B64C]'
                : 'bg-[#262421] hover:bg-[#312E2A] border-white/10'
            }`}
          >
            <div className="flex items-center gap-3 text-left">
              <CalendarCheck2 className="w-5 h-5 text-[#E59A28] shrink-0" />
              <div>
                <div className="text-sm font-bold text-white">Sharping</div>
                <div className="text-xs text-[#9E998F]">
                  {prepDoneCount}/{prepTotalCount} daily rotating chess drills
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#8E8980] shrink-0" />
          </button>

          <button
            type="button"
            data-testid="more-themes-button"
            onClick={() => navigateTo('themes')}
            className={`w-full shrink-0 min-h-[54px] px-3.5 py-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer ${
              activeTab === 'themes'
                ? 'bg-[#383530] border-[#81B64C]'
                : 'bg-[#262421] hover:bg-[#312E2A] border-white/10'
            }`}
          >
            <div className="flex items-center gap-3 text-left min-w-0">
              <span
                className="w-7 h-7 rounded-lg overflow-hidden grid grid-cols-2 grid-rows-2 shrink-0 ring-1 ring-white/15"
                aria-hidden="true"
              >
                <span style={{ backgroundColor: activeBoardMeta.light }} />
                <span style={{ backgroundColor: activeBoardMeta.dark }} />
                <span style={{ backgroundColor: activeBoardMeta.dark }} />
                <span style={{ backgroundColor: activeBoardMeta.light }} />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-[#E59A28] shrink-0" />
                  <span>Themes</span>
                </div>
                <div className="text-xs text-[#9E998F] truncate capitalize">
                  {activeBoardMeta.name} · {themePrefs.pieceTheme} · {themePrefs.premoveColor}
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#8E8980] shrink-0" />
          </button>

          <button
            type="button"
            onClick={openAuthPage}
            className="w-full shrink-0 min-h-[52px] px-3.5 py-3 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3 text-left">
              <Globe className="w-5 h-5 text-[#81B64C] shrink-0" />
              <div>
                <div className="text-sm font-bold text-white">
                  {lichessSession
                    ? `Account: ${lichessSession.account.username}`
                    : 'Sign In'}
                </div>
                <div className="text-xs text-[#9E998F]">
                  {lichessSession
                    ? 'Manage account & synced ratings'
                    : 'Sign in with your real online chess account'}
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[#8E8980] shrink-0" />
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className="w-full shrink-0 min-h-[48px] px-3.5 py-2.5 rounded-xl bg-[#262421] border border-white/10 flex items-center justify-between text-sm font-bold text-white cursor-pointer"
          >
            <span className="flex items-center gap-2.5">
              {muted ? (
                <VolumeX className="w-4 h-4 text-[#FA412D]" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#81B64C]" />
              )}
              <span>Sound Effects</span>
            </span>
            <span className="text-xs font-mono text-[#81B64C]">
              {muted ? 'MUTED' : 'ON'}
            </span>
          </button>
        </div>
      </BottomSheet>

      {pendingNavTab && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-leave-game-title"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm rounded-2xl bg-[#262421] border border-white/15 p-5 space-y-4 shadow-2xl">
            <div className="space-y-1.5">
              <h2 id="app-leave-game-title" className="text-lg font-extrabold text-white font-display">
                Leave Game?
              </h2>
              <p className="text-xs text-[#B8B4AC] leading-relaxed">
                Are you sure you want to leave your active game? Leaving an online match will end your current session.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setPendingNavTab(null)}
                className="min-h-[44px] rounded-xl bg-[#393734] hover:bg-[#43403C] text-xs font-extrabold text-white cursor-pointer"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={() => {
                  const dest = pendingNavTab;
                  setPendingNavTab(null);
                  setPlayIsActive(false);
                  if (dest) setActiveTab(dest);
                }}
                className="min-h-[44px] rounded-xl bg-[#CA3431] hover:bg-[#DC4340] border-b-[3px] border-[#8F1F1D] text-xs font-extrabold text-white cursor-pointer"
              >
                Leave Game
              </button>
            </div>
          </div>
        </div>
      )}
      <SocialNotificationsOverlay
        incomingGameInvites={incomingGameInvites}
        outgoingGameInvites={outgoingGameInvites}
        incomingFriendRequests={incomingFriendRequests}
        lastDmNotification={lastDmNotification}
        toastMessage={toastMessage}
        busyId={notificationBusyId}
        onRespondGameInvite={(id, action) => void respondToGameInvite(id, action)}
        onRespondFriendRequest={(username, action) =>
          void respondToFriendRequest(username, action)
        }
        onDismissDmNotification={dismissDmNotification}
        onReplyDm={(username) => {
          dismissDmNotification();
          openMessageWith(username);
        }}
        onDismissToast={dismissToast}
      />

      <PlayerProfileModal
        username={profileModalUsername}
        lichessSession={lichessSession}
        friends={friendsList}
        outgoingRequests={outgoingFriendReqs}
        incomingRequests={incomingFriendReqs}
        onClose={() => setProfileModalUsername(null)}
        onChallenge={(u) => {
          setProfileModalUsername(null);
          invitePlayerToPlay(u);
        }}
        onAddFriend={(u) => void handleSendFriendRequest(u)}
        onRemoveFriend={(u) => void handleRemoveFriend(u)}
        onMessage={(u) => {
          setProfileModalUsername(null);
          openMessageWith(u);
        }}
        onReviewGame={(pgn, color, res) => {
          setProfileModalUsername(null);
          handleSendToReview(pgn, color, res);
        }}
      />
    </div>
  );
}

