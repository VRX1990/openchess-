import { useEffect, useRef, useState } from 'react';
import type { Color } from 'chess.js';
import {
  ArrowLeft,
  Search,
  Link2,
  UserSearch,
  MailPlus,
  Swords,
  Copy,
  Check,
  SearchCheck,
  Trash2,
  Clock,
  Zap,
  Rocket,
  Sun,
  UserPlus,
  X,
  Loader2,
  MessageSquare,
  User,
} from 'lucide-react';
import {
  countryCodeToFlagEmoji,
  enrichGamePgnWithHeaders,
  formatGamePlayedAgo,
  formatLastSeenAgo,
} from '../chess/analytics';
import type { LichessFriendStatus, LichessUserGame } from '../chess/lichess';
import type { LichessSession } from '../chess/useLichessAuth';
import type { PendingGameInvite } from '../chess/syncHelpers';
import {
  clearFriendRemovedInBackup,
  loadLocalFriendsBackup,
  markFriendRemovedInBackup,
  mergeFriendsBackupWithServer,
  saveLocalFriendsBackup,
} from '../chess/onlineHelpers';
import { syncFriendsStateToFirestore } from '../firebase';
import type { PlayPreset } from './PlayView';
import { BottomSheet } from './BottomSheet';
import { PlayerAvatar } from './PlayerAvatar';

const INVITE_TIME_OPTIONS: Array<{
  timeId: string;
  label: string;
  initialSeconds: number;
  incrementSeconds: number;
}> = [
  { timeId: '1+0', label: '1+0 Bullet', initialSeconds: 60, incrementSeconds: 0 },
  { timeId: '3+0', label: '3+0 Blitz', initialSeconds: 180, incrementSeconds: 0 },
  { timeId: '5+0', label: '5+0 Blitz', initialSeconds: 300, incrementSeconds: 0 },
  { timeId: '10+0', label: '10+0 Rapid', initialSeconds: 600, incrementSeconds: 0 },
  { timeId: '15+10', label: '15+10 Rapid', initialSeconds: 900, incrementSeconds: 10 },
];

interface FriendsViewProps {
  lichessSession: LichessSession | null;
  lastSyncedAt?: number;
  friendListsVersion?: number;
  outgoingGameInvites?: PendingGameInvite[];
  onConnectLichess: () => void;
  onBack?: () => void;
  onStartGame: (opts: Omit<PlayPreset, 'nonce'>) => void;
  onSendToReview: (pgn: string, color: Color, resultLabel: string) => void;
  onSendGameInvite?: (params: {
    toUsername: string;
    timeId: string;
    initialSeconds: number;
    incrementSeconds: number;
    color?: 'w' | 'b' | 'random';
  }) => Promise<{ ok: boolean; error?: string }>;
  onCancelGameInvite?: (inviteId: string) => void;
  onFriendListsChanged?: () => void;
  onOpenPlayerProfile?: (username: string) => void;
  onMessageFriend?: (username: string) => void;
}

function generateOpenChessRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'OC';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function FriendsView({
  lichessSession,
  lastSyncedAt = 0,
  friendListsVersion = 0,
  outgoingGameInvites = [],
  onConnectLichess,
  onBack,
  onStartGame,
  onSendToReview,
  onSendGameInvite,
  onCancelGameInvite,
  onFriendListsChanged,
  onOpenPlayerProfile,
  onMessageFriend,
}: FriendsViewProps) {
  const [friends, setFriends] = useState<string[]>(
    () => loadLocalFriendsBackup(lichessSession?.account.username).friends,
  );
  const [incomingRequests, setIncomingRequests] = useState<string[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<string[]>(
    () => loadLocalFriendsBackup(lichessSession?.account.username).outgoingRequests,
  );
  const [friendStatuses, setFriendStatuses] = useState<Record<string, LichessFriendStatus>>({});
  const [suggestedPlayers, setSuggestedPlayers] = useState<LichessFriendStatus[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LichessFriendStatus[]>([]);
  const [searchingPlayers, setSearchingPlayers] = useState(false);

  const [joinRoomCode, setJoinRoomCode] = useState('');
  const [showChallengePanel, setShowChallengePanel] = useState(false);
  const [showFindPanel, setShowFindPanel] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingFriend, setLoadingFriend] = useState<string | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
  const [friendGames, setFriendGames] = useState<LichessUserGame[]>([]);
  const [inviteTimeId, setInviteTimeId] = useState<string>('10+0');

  // OpenChess Room Challenge Link & Code (never a lichess.org URL)
  const [challengeRoomCode, setChallengeRoomCode] = useState<string>(() =>
    generateOpenChessRoomCode(),
  );
  const [copiedChallengeLink, setCopiedChallengeLink] = useState(false);
  const [copiedRoomCode, setCopiedRoomCode] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [friendSheetName, setFriendSheetName] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.dataset.state = 'friends';
    let cancelled = false;
    fetch('/api/lichess/suggestions')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.users)) {
          const users = data.users as LichessFriendStatus[];
          setSuggestedPlayers(users);
          setFriendStatuses((prev) => {
            const next = { ...prev };
            for (const u of users) next[u.username.toLowerCase()] = u;
            return next;
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchStatusesForUsernames = async (usernames: string[]) => {
    const unique = Array.from(new Set(usernames.map((u) => u.trim()).filter(Boolean)));
    if (unique.length === 0) return;
    const statusRes = await fetch('/api/lichess/users-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: unique }),
    }).catch(() => null);
    if (statusRes?.ok) {
      const sData = await statusRes.json();
      if (Array.isArray(sData?.users)) {
        setFriendStatuses((prev) => {
          const next = { ...prev };
          for (const u of sData.users as LichessFriendStatus[]) {
            next[u.username.toLowerCase()] = u;
          }
          return next;
        });
      }
    }
  };

  useEffect(() => {
    if (!lichessSession?.accessToken) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setSelectedFriend(null);
      setFriendGames([]);
      return;
    }
    const uname = lichessSession.account.username;
    const cached = loadLocalFriendsBackup(uname);
    if (cached.friends.length > 0 && friends.length === 0) {
      setFriends(cached.friends);
    }
    if (cached.outgoingRequests.length > 0 && outgoingRequests.length === 0) {
      setOutgoingRequests(cached.outgoingRequests);
    }
    let cancelled = false;
    fetch('/api/account/friends', {
      headers: { Authorization: `Bearer ${lichessSession.accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (cancelled || !data) return;
        const serverFriends = Array.isArray(data.friends)
          ? data.friends.filter((x: unknown): x is string => typeof x === 'string')
          : [];
        const normalizeReqNames = (raw: unknown): string[] =>
          Array.isArray(raw)
            ? raw
                .map((x: unknown) =>
                  typeof x === 'string'
                    ? x
                    : x && typeof x === 'object' && 'username' in x && typeof (x as { username?: unknown }).username === 'string'
                      ? (x as { username: string }).username
                      : '',
                )
                .filter(Boolean)
            : [];
        const incoming = normalizeReqNames(data.incomingRequests);
        const serverOutgoing = normalizeReqNames(data.outgoingRequests);
        const serverRemoved = Array.isArray(data.removedFriends)
          ? data.removedFriends.filter((x: unknown): x is string => typeof x === 'string')
          : [];
        const merged = mergeFriendsBackupWithServer({
          serverFriends,
          serverOutgoing,
          serverRemoved,
          localBackup: loadLocalFriendsBackup(uname),
        });
        setFriends(merged.friends);
        setIncomingRequests(incoming);
        setOutgoingRequests(merged.outgoingRequests);
        saveLocalFriendsBackup(
          uname,
          merged.friends,
          merged.outgoingRequests,
          merged.removedFriends,
        );
        void syncFriendsStateToFirestore(merged).catch(() => {});
        await fetchStatusesForUsernames([...merged.friends, ...incoming, ...merged.outgoingRequests]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lichessSession?.accessToken, lichessSession?.account.username, lastSyncedAt, friendListsVersion]);

  // Live player autocomplete search when typing in Search...
  useEffect(() => {
    const term = searchQuery.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setSearchingPlayers(false);
      return;
    }
    let cancelled = false;
    setSearchingPlayers(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/lichess/autocomplete?term=${encodeURIComponent(term)}`);
        const data = await res.json();
        if (!cancelled && Array.isArray(data?.users)) {
          const users = data.users as LichessFriendStatus[];
          setSearchResults(users);
          setFriendStatuses((prev) => {
            const next = { ...prev };
            for (const u of users) {
              next[u.username.toLowerCase()] = u;
            }
            return next;
          });
        }
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchingPlayers(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  const handleSendFriendRequest = async (explicitName?: string) => {
    if (!lichessSession?.accessToken) {
      onConnectLichess();
      return;
    }
    const clean = (explicitName ?? searchQuery).trim();
    if (!clean) return;
    setErrorMsg(null);
    setStatusMsg(null);
    if (friends.some((f) => f.toLowerCase() === clean.toLowerCase())) {
      setErrorMsg(`${clean} is already in your Friends list.`);
      return;
    }
    if (outgoingRequests.some((f) => f.toLowerCase() === clean.toLowerCase())) {
      setStatusMsg(`Friend request to ${clean} is already pending.`);
      return;
    }
    setLoadingFriend(clean);
    try {
      const res = await fetch('/api/account/friends', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lichessSession.accessToken}`,
        },
        body: JSON.stringify({ username: clean }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Player "${clean}" not found.`);
      }
      clearFriendRemovedInBackup(lichessSession.account.username, clean);
      const nextFriends = Array.isArray(data.friends) ? data.friends : friends;
      const nextOutgoing = Array.isArray(data.outgoingRequests)
        ? data.outgoingRequests
        : outgoingRequests;
      if (Array.isArray(data.friends)) setFriends(data.friends);
      if (Array.isArray(data.incomingRequests)) setIncomingRequests(data.incomingRequests);
      if (Array.isArray(data.outgoingRequests)) setOutgoingRequests(data.outgoingRequests);
      saveLocalFriendsBackup(
        lichessSession.account.username,
        nextFriends,
        nextOutgoing,
        Array.isArray(data.removedFriends) ? data.removedFriends : undefined,
      );
      void syncFriendsStateToFirestore(
        loadLocalFriendsBackup(lichessSession.account.username),
      ).catch(() => {});

      const targetName = data.requested || data.added || clean;
      if (data.status === 'accepted') {
        setStatusMsg(
          `${targetName} added to your Friends list & notified in their inbox! You can invite them to play or message them anytime.`,
        );
      } else {
        setStatusMsg(
          `Friend request sent to ${targetName}! They will get a pop-up in their inbox to accept or reject.`,
        );
      }
      onFriendListsChanged?.();
      await fetchStatusesForUsernames([targetName]);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not send friend request.');
    } finally {
      setLoadingFriend(null);
    }
  };

  const handleRespondFriendRequest = async (
    username: string,
    action: 'accept' | 'reject' | 'cancel',
  ) => {
    if (!lichessSession?.accessToken) return;
    setLoadingFriend(username);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/account/friends/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lichessSession.accessToken}`,
        },
        body: JSON.stringify({ username, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update friend request.');
      const nextFriends = Array.isArray(data.friends) ? data.friends : friends;
      const nextOutgoing = Array.isArray(data.outgoingRequests)
        ? data.outgoingRequests
        : outgoingRequests;
      if (Array.isArray(data.friends)) setFriends(data.friends);
      if (Array.isArray(data.incomingRequests)) setIncomingRequests(data.incomingRequests);
      if (Array.isArray(data.outgoingRequests)) setOutgoingRequests(data.outgoingRequests);
      saveLocalFriendsBackup(
        lichessSession.account.username,
        nextFriends,
        nextOutgoing,
        Array.isArray(data.removedFriends) ? data.removedFriends : undefined,
      );
      void syncFriendsStateToFirestore(
        loadLocalFriendsBackup(lichessSession.account.username),
      ).catch(() => {});
      onFriendListsChanged?.();
      if (action === 'accept') {
        setStatusMsg(`Friend request from ${username} accepted!`);
        await fetchStatusesForUsernames([username]);
      } else if (action === 'reject') {
        setStatusMsg(`Friend request from ${username} declined.`);
      } else {
        setStatusMsg(`Cancelled friend request to ${username}.`);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to respond to request.');
    } finally {
      setLoadingFriend(null);
    }
  };

  const handleRemoveFriend = async (username: string) => {
    const lower = username.toLowerCase();
    const optimistic = markFriendRemovedInBackup(lichessSession?.account.username, username);
    setFriends(optimistic.friends);
    setOutgoingRequests(optimistic.outgoingRequests);
    void syncFriendsStateToFirestore(optimistic).catch(() => {});
    if (selectedFriend?.toLowerCase() === lower) {
      setSelectedFriend(null);
      setFriendGames([]);
    }
    setStatusMsg(`Removed ${username} from your friends list.`);
    if (!lichessSession?.accessToken) return;
    try {
      const res = await fetch(`/api/account/friends/${encodeURIComponent(username)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${lichessSession.accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        const nextFriends = Array.isArray(data.friends) ? data.friends : optimistic.friends;
        const nextOutgoing = Array.isArray(data.outgoingRequests)
          ? data.outgoingRequests
          : optimistic.outgoingRequests;
        if (Array.isArray(data.friends)) setFriends(data.friends);
        if (Array.isArray(data.incomingRequests)) setIncomingRequests(data.incomingRequests);
        if (Array.isArray(data.outgoingRequests)) setOutgoingRequests(data.outgoingRequests);
        saveLocalFriendsBackup(
          lichessSession.account.username,
          nextFriends,
          nextOutgoing,
          Array.isArray(data.removedFriends) ? data.removedFriends : optimistic.removedFriends,
        );
        void syncFriendsStateToFirestore(
          loadLocalFriendsBackup(lichessSession.account.username),
        ).catch(() => {});
        onFriendListsChanged?.();
      }
    } catch {
      // keep optimistic removal
    }
  };

  const handleInviteFriendToPlay = async (username: string, chosenTimeId = '10+0') => {
    if (!lichessSession?.accessToken) {
      onConnectLichess();
      return;
    }
    setErrorMsg(null);
    setStatusMsg(null);
    const tc =
      INVITE_TIME_OPTIONS.find((t) => t.timeId === chosenTimeId) ?? INVITE_TIME_OPTIONS[3];

    if (onSendGameInvite) {
      setLoadingFriend(username);
      try {
        const res = await onSendGameInvite({
          toUsername: username,
          timeId: tc.timeId,
          initialSeconds: tc.initialSeconds,
          incrementSeconds: tc.incrementSeconds,
          color: 'random',
        });
        if (!res.ok) {
          setErrorMsg(res.error || `Could not invite ${username}.`);
          return;
        }
        setStatusMsg(
          `Game invite (${tc.label}) sent to ${username}! It will pop up in their OpenChess app to approve or reject.`,
        );
        return;
      } finally {
        setLoadingFriend(null);
      }
    }

    const roomCode = generateOpenChessRoomCode();
    onStartGame({
      mode: 'online-ws',
      timeId: tc.timeId,
      wsAction: 'create',
      wsRoomId: roomCode,
      color: 'w',
    });
  };

  const handleInspectGames = async (username: string) => {
    setLoadingFriend(username);
    setSelectedFriend(username);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/lichess/games/${encodeURIComponent(username)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load games.');
      setFriendGames((data.games as LichessUserGame[]) ?? []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not fetch games.');
      setFriendGames([]);
    } finally {
      setLoadingFriend(null);
    }
  };

  const openChessChallengeUrl = `${window.location.origin}/?room=${encodeURIComponent(
    challengeRoomCode,
  )}`;

  const handleInviteFriends = () => {
    const inviteUrl = `${window.location.origin}/?invite=${encodeURIComponent(
      lichessSession?.account.username ?? 'openchess',
    )}`;
    navigator.clipboard?.writeText(inviteUrl).catch(() => {});
    setCopiedInvite(true);
    setStatusMsg('OpenChess invite link copied to clipboard!');
    window.setTimeout(() => setCopiedInvite(false), 2200);
  };

  const cleanSearch = searchQuery.trim().toLowerCase();
  const filteredFriends = cleanSearch
    ? friends.filter((f) => f.toLowerCase().includes(cleanSearch))
    : friends;

  const renderFriendSquareAvatar = (username: string, online?: boolean) => {
    const st = friendStatuses[username.toLowerCase()];
    return (
      <div className="relative w-12 h-12 shrink-0">
        <PlayerAvatar
          username={username}
          avatarUrl={st?.avatarUrl}
          size={48}
          rounded="rounded-xl"
        />
        {online && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#81B64C] border-2 border-[#2B2926]" />
        )}
      </div>
    );
  };

  const renderSpeedIconAndRating = (st?: LichessFriendStatus) => {
    const speed = st?.bestSpeed ?? 'rapid';
    const rating = st?.bestRating ?? 1500;
    const SpeedIcon =
      speed === 'bullet'
        ? Rocket
        : speed === 'correspondence'
          ? Sun
          : speed === 'blitz'
            ? Zap
            : Clock;
    const speedColor =
      speed === 'bullet'
        ? 'text-[#E59A28]'
        : speed === 'correspondence'
          ? 'text-[#F7C045]'
          : speed === 'blitz'
            ? 'text-[#F7C045]'
            : 'text-[#81B64C]';

    return (
      <div className="flex items-center gap-1.5 text-xs sm:text-sm text-[#DEDAD2] mt-0.5 font-mono font-bold tabular-nums">
        <SpeedIcon className={`w-4 h-4 ${speedColor} shrink-0`} />
        <span>{rating}</span>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-3.5 pb-24 lg:pb-6">
      {/* Header matching Screenshot ("← Play a Friend") */}
      <div className="relative flex items-center justify-center min-h-[40px] px-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="absolute left-0 w-10 h-10 rounded-lg flex items-center justify-center text-[#DEDAD2] hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-base sm:text-lg font-extrabold text-white font-display">
          Play a Friend
        </h1>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-[#9E998F] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search..."
          aria-label="Search friends or players"
          className="w-full min-h-[46px] rounded-xl bg-[#393734] border border-white/[0.06] pl-10 pr-9 text-sm text-white placeholder:text-[#9E998F] focus:outline-none focus:border-[#81B64C]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9E998F] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Live Player Search Directory Results (shows similar names + Send Request) */}
      {cleanSearch.length >= 2 && (
        <section className="rounded-xl bg-[#262421] p-3 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-extrabold text-[#B8B4AC] px-1">
            <span>Players matching &ldquo;{searchQuery.trim()}&rdquo;</span>
            {searchingPlayers && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#81B64C]" />}
          </div>

          {searchResults.length === 0 && !searchingPlayers ? (
            <button
              type="button"
              onClick={() => void handleSendFriendRequest(searchQuery.trim())}
              disabled={loadingFriend !== null}
              className="w-full rounded-xl bg-[#393734] hover:bg-[#43403C] px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-white cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#81B64C]" />
                <span>Send Friend Request to &ldquo;{searchQuery.trim()}&rdquo;</span>
              </span>
              <span className="text-[#81B64C]">Send Request</span>
            </button>
          ) : (
            <div className="divide-y divide-white/6 max-h-64 overflow-y-auto">
              {searchResults.map((user) => {
                const lower = user.username.toLowerCase();
                const isFriend = friends.some((f) => f.toLowerCase() === lower);
                const isOutgoing = outgoingRequests.some((f) => f.toLowerCase() === lower);
                const isIncoming = incomingRequests.some((f) => f.toLowerCase() === lower);
                const flag = countryCodeToFlagEmoji(user.flag);

                return (
                  <div
                    key={user.username}
                    className="py-2 px-1 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenPlayerProfile?.(user.username)}
                      className="flex items-center gap-3 min-w-0 text-left cursor-pointer hover:opacity-90"
                    >
                      {renderFriendSquareAvatar(user.username, user.online)}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-extrabold text-white truncate hover:underline">
                            {user.username}
                          </span>
                          {flag && <span className="text-sm leading-none">{flag}</span>}
                          {user.title && (
                            <span className="px-1 py-0.5 rounded bg-[#B8860B] text-[9px] font-extrabold text-white">
                              {user.title}
                            </span>
                          )}
                        </div>
                        {renderSpeedIconAndRating(user)}
                      </div>
                    </button>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {isFriend ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleInviteFriendToPlay(user.username)}
                            className="px-3 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                          >
                            <Swords className="w-3.5 h-3.5" />
                            <span>Invite</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRemoveFriend(user.username)}
                            aria-label={`Remove ${user.username} from friends`}
                            title={`Remove ${user.username} from friends`}
                            className="p-1.5 rounded-lg bg-[#3B2320] hover:bg-[#4F2D28] text-[#F5B8B0] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : isIncoming ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleRespondFriendRequest(user.username, 'accept')}
                            className="px-2.5 py-1.5 rounded-lg bg-[#81B64C] text-white text-xs font-extrabold cursor-pointer"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRespondFriendRequest(user.username, 'reject')}
                            className="px-2.5 py-1.5 rounded-lg bg-[#3B2320] text-[#F5B8B0] text-xs font-bold cursor-pointer"
                          >
                            Reject
                          </button>
                        </>
                      ) : isOutgoing ? (
                        <button
                          type="button"
                          onClick={() => void handleRespondFriendRequest(user.username, 'cancel')}
                          className="px-3 py-1.5 rounded-lg bg-[#393734] text-xs font-bold text-[#F7C045] cursor-pointer"
                        >
                          Request Sent
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={loadingFriend === user.username}
                          onClick={() => void handleSendFriendRequest(user.username)}
                          className="px-3 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Send Request</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 3 Stacked Action Cards (Matching Screenshot #1) */}
      <section className="space-y-2.5">
        <button
          type="button"
          onClick={() => {
            setShowChallengePanel((v) => !v);
            if (!challengeRoomCode) setChallengeRoomCode(generateOpenChessRoomCode());
          }}
          className="w-full rounded-xl bg-[#393734] hover:bg-[#43403C] p-3.5 flex items-center gap-3.5 text-left transition-colors cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-[#262421] flex items-center justify-center shrink-0">
            <Link2 className="w-5 h-5 text-[#B8B4AC]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm sm:text-base font-extrabold text-white">
              Send Challenge Link
            </div>
            <div className="text-xs text-[#9E998F]">Start a game with anyone</div>
          </div>
        </button>

        {showChallengePanel && (
          <div className="rounded-xl bg-[#312E2A] border border-white/10 p-3.5 space-y-3">
            {/* OpenChess Room Code & Shareable Link (Zero external URLs) */}
            <div className="p-3 rounded-xl bg-[#262421] border border-[#81B64C]/40 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold text-[#9E998F] uppercase tracking-wider">
                    OpenChess Room Code
                  </div>
                  <div className="text-lg font-mono font-extrabold text-[#81B64C] tracking-widest">
                    {challengeRoomCode}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(challengeRoomCode).catch(() => {});
                      setCopiedRoomCode(true);
                      window.setTimeout(() => setCopiedRoomCode(false), 1800);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#393734] hover:bg-[#43403C] text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedRoomCode ? <Check className="w-3.5 h-3.5 text-[#81B64C]" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedRoomCode ? 'Code Copied' : 'Copy Code'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(openChessChallengeUrl).catch(() => {});
                      setCopiedChallengeLink(true);
                      window.setTimeout(() => setCopiedChallengeLink(false), 1800);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-[#191815] text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedChallengeLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedChallengeLink ? 'Link Copied' : 'Copy Link'}</span>
                  </button>
                </div>
              </div>

              <div className="text-[11px] font-mono text-[#B8B4AC] truncate bg-[#1A1917] px-2.5 py-1.5 rounded-lg">
                {openChessChallengeUrl}
              </div>

              <button
                type="button"
                onClick={() =>
                  onStartGame({
                    mode: 'online-ws',
                    timeId: '10+0',
                    wsAction: 'create',
                    wsRoomId: challengeRoomCode,
                    color: 'w',
                  })
                }
                className="w-full min-h-[42px] px-3 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] border-b-2 border-[#457524] text-white font-extrabold text-xs cursor-pointer"
              >
                Enter Room ({challengeRoomCode}) &amp; Wait for Friend
              </button>
            </div>

            {/* Join a Friend's Room Code */}
            <div className="flex gap-1.5 pt-1">
              <input
                type="text"
                value={joinRoomCode}
                onChange={(e) => setJoinRoomCode(e.target.value.toUpperCase())}
                placeholder="Have a friend's Room Code? Enter here..."
                aria-label="Room code"
                className="flex-1 rounded-lg bg-[#262421] border border-white/10 px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#81B64C]"
              />
              <button
                type="button"
                disabled={joinRoomCode.trim().length < 4}
                onClick={() =>
                  onStartGame({
                    mode: 'online-ws',
                    timeId: '10+0',
                    wsAction: 'join',
                    wsRoomId: joinRoomCode.trim(),
                  })
                }
                className="px-4 py-2 rounded-lg bg-[#393734] hover:bg-[#43403C] text-xs font-extrabold text-white cursor-pointer disabled:opacity-40"
              >
                Join Room
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setShowFindPanel((v) => !v);
            window.setTimeout(() => searchInputRef.current?.focus(), 60);
          }}
          className="w-full rounded-xl bg-[#393734] hover:bg-[#43403C] p-3.5 flex items-center gap-3.5 text-left transition-colors cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-[#6FB3E0]/15 flex items-center justify-center shrink-0">
            <UserSearch className="w-5 h-5 text-[#7FC4ED]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm sm:text-base font-extrabold text-white">Find friends</div>
            <div className="text-xs text-[#9E998F]">See who you know on OpenChess</div>
          </div>
        </button>

        {showFindPanel && (
          <div className="rounded-xl bg-[#312E2A] border border-white/10 p-3 space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSendFriendRequest();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search player username..."
                aria-label="Search player username"
                className="flex-1 rounded-lg bg-[#262421] border border-white/10 px-3 py-2 text-xs text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C]"
              />
              <button
                type="submit"
                disabled={searchQuery.trim().length < 2 || loadingFriend !== null}
                className="px-4 py-2 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-white font-extrabold text-xs cursor-pointer disabled:opacity-45"
              >
                {lichessSession ? 'Send Request' : 'Sign In'}
              </button>
            </form>

            {cleanSearch.length < 2 && suggestedPlayers.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-[#9E998F] uppercase tracking-wider px-0.5">
                  Active Online Players
                </div>
                <div className="divide-y divide-white/6 max-h-56 overflow-y-auto">
                  {suggestedPlayers
                    .filter(
                      (u) =>
                        u.username.toLowerCase() !==
                        (lichessSession?.account.username.toLowerCase() ?? ''),
                    )
                    .slice(0, 6)
                    .map((user) => {
                      const lower = user.username.toLowerCase();
                      const isFriend = friends.some((f) => f.toLowerCase() === lower);
                      const isOutgoing = outgoingRequests.some((f) => f.toLowerCase() === lower);
                      const flag = countryCodeToFlagEmoji(user.flag);
                      return (
                        <div
                          key={`sug-${user.username}`}
                          className="py-2 px-1 flex items-center justify-between gap-2.5"
                        >
                          <button
                            type="button"
                            onClick={() => onOpenPlayerProfile?.(user.username)}
                            className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer hover:opacity-90"
                          >
                            {renderFriendSquareAvatar(user.username, user.online)}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs sm:text-sm font-extrabold text-white truncate hover:underline">
                                  {user.username}
                                </span>
                                {flag && <span className="text-xs leading-none">{flag}</span>}
                                {user.title && (
                                  <span className="px-1 py-0.5 rounded bg-[#B8860B] text-[9px] font-extrabold text-white">
                                    {user.title}
                                  </span>
                                )}
                              </div>
                              {renderSpeedIconAndRating(user)}
                            </div>
                          </button>
                          <div className="shrink-0">
                            {isFriend ? (
                              <span className="text-xs font-bold text-[#81B64C]">Friends</span>
                            ) : isOutgoing ? (
                              <span className="text-xs font-bold text-[#F7C045]">Request Sent</span>
                            ) : (
                              <button
                                type="button"
                                disabled={loadingFriend === user.username}
                                onClick={() => void handleSendFriendRequest(user.username)}
                                className="px-2.5 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                <span>Send Request</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleInviteFriends}
          className="w-full rounded-xl bg-[#393734] hover:bg-[#43403C] p-3.5 flex items-center gap-3.5 text-left transition-colors cursor-pointer"
        >
          <div className="w-11 h-11 rounded-xl bg-[#81B64C]/15 flex items-center justify-center shrink-0">
            {copiedInvite ? (
              <Check className="w-5 h-5 text-[#81B64C]" />
            ) : (
              <MailPlus className="w-5 h-5 text-[#81B64C]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm sm:text-base font-extrabold text-white">
              {copiedInvite ? 'Invite Link Copied!' : 'Invite Friends'}
            </div>
            <div className="text-xs text-[#9E998F]">Help a friend join OpenChess</div>
          </div>
        </button>
      </section>

      {statusMsg && (
        <div className="p-2.5 rounded-xl bg-[#81B64C]/15 border border-[#81B64C]/40 text-xs text-[#AEE076]">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-[#5C2320]/60 border border-[#E06C5A]/40 text-xs text-[#F7C7C1]">
          {errorMsg}
        </div>
      )}

      {/* Friend Requests Section (Incoming + Sent Pending Requests) */}
      {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
        <section className="rounded-xl bg-[#262421] p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-white font-display">
              Friend Requests
            </h2>
            <span className="text-xs font-mono font-bold text-[#F7C045] tabular-nums">
              {incomingRequests.length + outgoingRequests.length}
            </span>
          </div>

          {incomingRequests.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-[#9E998F] uppercase tracking-wider">
                Incoming Requests
              </div>
              {incomingRequests.map((reqUser) => {
                const st = friendStatuses[reqUser.toLowerCase()];
                const flag = countryCodeToFlagEmoji(st?.flag);
                return (
                  <div
                    key={`in-${reqUser}`}
                    className="p-2.5 rounded-xl bg-[#262421] flex items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderFriendSquareAvatar(reqUser, st?.online)}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-extrabold text-white truncate">
                            {reqUser}
                          </span>
                          {flag && <span>{flag}</span>}
                        </div>
                        {renderSpeedIconAndRating(st)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void handleRespondFriendRequest(reqUser, 'accept')}
                        className="px-3 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRespondFriendRequest(reqUser, 'reject')}
                        className="px-2.5 py-1.5 rounded-lg bg-[#3B2320] hover:bg-[#4F2D28] text-[#F5B8B0] text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {outgoingRequests.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-[#9E998F] uppercase tracking-wider">
                Sent Requests (Pending Acceptance)
              </div>
              {outgoingRequests.map((reqUser) => {
                const st = friendStatuses[reqUser.toLowerCase()];
                const flag = countryCodeToFlagEmoji(st?.flag);
                return (
                  <div
                    key={`out-${reqUser}`}
                    className="p-2.5 rounded-xl bg-[#262421] flex items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {renderFriendSquareAvatar(reqUser, st?.online)}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-extrabold text-white truncate">
                            {reqUser}
                          </span>
                          {flag && <span>{flag}</span>}
                        </div>
                        <div className="text-[11px] text-[#F7C045] font-semibold">
                          Request Pending
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {onMessageFriend && (
                        <button
                          type="button"
                          onClick={() => onMessageFriend(reqUser)}
                          aria-label={`Message ${reqUser}`}
                          className="p-2 rounded-lg bg-[#393734] hover:bg-[#43403C] text-[#DEDAD2] hover:text-white cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleInviteFriendToPlay(reqUser)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                      >
                        <Swords className="w-3.5 h-3.5" />
                        <span>Invite</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRespondFriendRequest(reqUser, 'cancel')}
                        className="px-2.5 py-1.5 rounded-lg bg-[#393734] hover:bg-[#43403C] text-[#B8B4AC] text-xs font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Friends List */}
      <section className="space-y-2.5 pt-1">
        <div className="flex items-baseline gap-2 px-0.5">
          <h2 className="text-base font-extrabold text-white font-display">Friends</h2>
          <span className="text-xs font-mono font-bold text-[#9E998F] tabular-nums">
            {friends.length}
          </span>
        </div>

        {filteredFriends.length === 0 ? (
          <div className="rounded-xl bg-[#393734] p-5 text-center text-xs text-[#9E998F]">
            {friends.length === 0
              ? 'No friends added yet. Search a username above to send a friend request.'
              : `No friends match "${searchQuery}".`}
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredFriends.map((username) => {
              const st = friendStatuses[username.toLowerCase()];
              const flag = countryCodeToFlagEmoji(st?.flag);
              const activeInvite = outgoingGameInvites.find(
                (inv) => inv.toUsername.toLowerCase() === username.toLowerCase(),
              );

              return (
                <div
                  key={username}
                  className="w-full py-2 px-2 flex items-center justify-between gap-2.5 hover:bg-white/5 rounded-xl transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => setFriendSheetName(username)}
                    className="flex items-center gap-3.5 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    {renderFriendSquareAvatar(username, st?.online)}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm sm:text-base font-extrabold text-white truncate">
                          {username}
                        </span>
                        {flag && (
                          <span className="text-sm leading-none shrink-0" aria-hidden="true">
                            {flag}
                          </span>
                        )}
                        {st?.title && (
                          <span className="px-1 py-0.5 rounded bg-[#B8860B] text-[9px] font-extrabold text-white shrink-0">
                            {st.title}
                          </span>
                        )}
                      </div>
                      {renderSpeedIconAndRating(st)}
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {onMessageFriend && (
                      <button
                        type="button"
                        onClick={() => onMessageFriend(username)}
                        aria-label={`Message ${username}`}
                        className="p-2 rounded-lg bg-[#393734] hover:bg-[#43403C] text-[#DEDAD2] hover:text-white cursor-pointer"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    )}
                    {activeInvite ? (
                      <button
                        type="button"
                        onClick={() => onCancelGameInvite?.(activeInvite.id)}
                        className="px-3 py-2 rounded-lg bg-[#393734] hover:bg-[#4A4742] text-[#F7C045] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Invited · Cancel</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={loadingFriend === username}
                        onClick={() => void handleInviteFriendToPlay(username)}
                        aria-label={`Invite ${username} to play`}
                        className="px-3 py-2 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] border-b-2 border-[#457524] text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Swords className="w-3.5 h-3.5" />
                        <span>Invite</span>
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid={`friends-remove-${username}`}
                      onClick={() => void handleRemoveFriend(username)}
                      aria-label={`Remove ${username} from friends`}
                      title={`Remove ${username} from friends`}
                      className="p-2 rounded-lg bg-[#3B2320] hover:bg-[#4F2D28] text-[#F5B8B0] hover:text-white cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Selected Friend's Recent Synced Games -> Review */}
      {selectedFriend && (
        <section className="rounded-xl bg-[#393734] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-white">
              Recent Games · {selectedFriend}
            </h2>
            <button
              type="button"
              onClick={() => setSelectedFriend(null)}
              className="text-xs text-[#9E998F] hover:text-white cursor-pointer"
            >
              Close
            </button>
          </div>
          {friendGames.length === 0 ? (
            <p className="text-xs text-[#9E998F]">
              {loadingFriend === selectedFriend
                ? 'Loading recent online games...'
                : 'No recent public games found.'}
            </p>
          ) : (
            <div className="space-y-2">
              {friendGames.slice(0, 5).map((g) => (
                <div
                  key={g.id}
                  className="p-2.5 rounded-lg bg-[#262421] flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">
                      {g.white.name} vs {g.black.name}
                    </div>
                    <div className="text-[11px] text-[#9E998F] capitalize">
                      {g.speed} · {g.winner ? `${g.winner} won` : g.status}
                      {formatGamePlayedAgo(g.lastMoveAt ?? g.createdAt)
                        ? ` · ${formatGamePlayedAgo(g.lastMoveAt ?? g.createdAt)}`
                        : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onSendToReview(
                        enrichGamePgnWithHeaders(g),
                        g.black.name.toLowerCase() === selectedFriend.toLowerCase() ? 'b' : 'w',
                        g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '*',
                      )
                    }
                    className="px-2.5 py-1.5 rounded bg-[#393734] hover:bg-[#43403C] text-[#81B64C] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <SearchCheck className="w-3.5 h-3.5" />
                    <span>View Game</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Friend Action Sheet */}
      <BottomSheet
        open={Boolean(friendSheetName)}
        title={friendSheetName ?? 'Friend'}
        desktopModal
        onClose={() => setFriendSheetName(null)}
      >
        {friendSheetName && (() => {
          const st = friendStatuses[friendSheetName.toLowerCase()];
          const flag = countryCodeToFlagEmoji(st?.flag);
          return (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#262421]">
                {renderFriendSquareAvatar(friendSheetName, st?.online)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-extrabold text-white truncate">
                      {friendSheetName}
                    </span>
                    {flag && <span>{flag}</span>}
                    {st?.title && (
                      <span className="px-1.5 py-0.5 rounded bg-[#B8860B] text-[10px] font-extrabold text-white">
                        {st.title}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[#9E998F] mt-0.5">
                    {st?.online ? 'Online now' : formatLastSeenAgo(st?.seenAt)} · Rapid{' '}
                    {st?.perfs.rapid?.rating ?? 1500} · Blitz {st?.perfs.blitz?.rating ?? 1500}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-[#9E998F] uppercase tracking-wider">
                  Time Control
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {INVITE_TIME_OPTIONS.map((opt) => (
                    <button
                      key={opt.timeId}
                      type="button"
                      onClick={() => setInviteTimeId(opt.timeId)}
                      className={`py-2 px-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                        inviteTimeId === opt.timeId
                          ? 'bg-[#393734] ring-2 ring-[#81B64C] text-white'
                          : 'bg-[#262421] text-[#B8B4AC] hover:bg-[#312E2A]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const target = friendSheetName;
                  setFriendSheetName(null);
                  void handleInviteFriendToPlay(target, inviteTimeId);
                }}
                className="w-full min-h-[48px] px-4 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-4 border-[#457524] text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Swords className="w-4 h-4" />
                <span>Send {inviteTimeId} Game Invite</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                {onOpenPlayerProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = friendSheetName;
                      setFriendSheetName(null);
                      onOpenPlayerProfile(target);
                    }}
                    className="min-h-[44px] px-3 rounded-xl bg-[#393734] hover:bg-[#43403C] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <User className="w-4 h-4 text-[#7FC4ED]" />
                    <span>View Profile</span>
                  </button>
                )}
                {onMessageFriend && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = friendSheetName;
                      setFriendSheetName(null);
                      onMessageFriend(target);
                    }}
                    className="min-h-[44px] px-3 rounded-xl bg-[#393734] hover:bg-[#43403C] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4 text-[#81B64C]" />
                    <span>Message</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const target = friendSheetName;
                    setFriendSheetName(null);
                    void handleInspectGames(target);
                  }}
                  className="min-h-[44px] px-3 rounded-xl bg-[#393734] hover:bg-[#43403C] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <SearchCheck className="w-4 h-4 text-[#81B64C]" />
                  <span>Recent Games</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = friendSheetName;
                    setFriendSheetName(null);
                    void handleRemoveFriend(target);
                  }}
                  className="min-h-[44px] px-3 rounded-xl bg-[#3B2320] hover:bg-[#4F2D28] text-[#F5B8B0] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Remove Friend</span>
                </button>
              </div>
            </div>
          );
        })()}
      </BottomSheet>
    </div>
  );
}
