import { useCallback, useEffect, useRef, useState } from 'react';
import type { LichessAccount } from './lichess';
import type { LichessSession } from './useLichessAuth';
import type { DirectMessageItem, DirectMessageThread } from './onlineHelpers';
import {
  pruneExpiredInvites,
  removePendingInvite,
  upsertPendingInvite,
  type PendingGameInvite,
} from './syncHelpers';

export interface IncomingFriendRequestItem {
  username: string;
  createdAt: number;
  rating?: number;
  avatarUrl?: string;
  flag?: string;
}

export interface IncomingDmNotification {
  fromUsername: string;
  fromAvatarUrl?: string;
  fromFlag?: string;
  text: string;
  timestamp: number;
}

export interface RealtimeDmEvent {
  partnerUsername: string;
  message: DirectMessageItem;
}

interface UseSocialNotificationsOptions {
  session: LichessSession | null;
  onLaunchInvitedMatch: (opts: {
    roomId: string;
    timeId: string;
    color: 'w' | 'b';
  }) => void;
  onAccountUpdated?: (account: LichessAccount) => void;
}

export function useSocialNotifications({
  session,
  onLaunchInvitedMatch,
  onAccountUpdated,
}: UseSocialNotificationsOptions) {
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<
    IncomingFriendRequestItem[]
  >([]);
  const [incomingGameInvites, setIncomingGameInvites] = useState<PendingGameInvite[]>([]);
  const [outgoingGameInvites, setOutgoingGameInvites] = useState<PendingGameInvite[]>([]);
  const [lastDmNotification, setLastDmNotification] = useState<IncomingDmNotification | null>(null);
  const [lastDmEvent, setLastDmEvent] = useState<RealtimeDmEvent | null>(null);
  const [unreadDmCount, setUnreadDmCount] = useState(0);
  const [dmVersion, setDmVersion] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [friendListsVersion, setFriendListsVersion] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  const launchRef = useRef(onLaunchInvitedMatch);
  launchRef.current = onLaunchInvitedMatch;
  const accountUpdatedRef = useRef(onAccountUpdated);
  accountUpdatedRef.current = onAccountUpdated;
  const toastTimerRef = useRef<number | null>(null);
  const dmTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToastMessage(null);
  }, []);

  const dismissDmNotification = useCallback(() => {
    if (dmTimerRef.current) window.clearTimeout(dmTimerRef.current);
    setLastDmNotification(null);
  }, []);

  const refreshDmCount = useCallback(async () => {
    if (!session?.accessToken) {
      setUnreadDmCount(0);
      return;
    }
    try {
      const res = await fetch('/api/messages/threads', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { threads?: DirectMessageThread[] };
      if (Array.isArray(data.threads)) {
        const total = data.threads.reduce((sum, t) => sum + (t.unreadCount || 0), 0);
        setUnreadDmCount(total);
      }
    } catch {
      // ignore
    }
  }, [session?.accessToken]);

  const refreshNotifications = useCallback(async () => {
    if (!session?.accessToken) {
      setIncomingFriendRequests([]);
      setIncomingGameInvites([]);
      setOutgoingGameInvites([]);
      setUnreadDmCount(0);
      return;
    }
    try {
      const res = await fetch('/api/account/notifications', {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        incomingFriendRequests?: IncomingFriendRequestItem[];
        incomingGameInvites?: PendingGameInvite[];
        outgoingGameInvites?: PendingGameInvite[];
      };
      if (Array.isArray(data.incomingFriendRequests)) {
        setIncomingFriendRequests(data.incomingFriendRequests);
      }
      if (Array.isArray(data.incomingGameInvites)) {
        setIncomingGameInvites(pruneExpiredInvites(data.incomingGameInvites));
      }
      if (Array.isArray(data.outgoingGameInvites)) {
        setOutgoingGameInvites(pruneExpiredInvites(data.outgoingGameInvites));
      }
    } catch {
      // ignore transient network errors
    }
    void refreshDmCount();
  }, [session?.accessToken, refreshDmCount]);

  useEffect(() => {
    void refreshNotifications();
  }, [refreshNotifications]);

  // Prune expired invites periodically
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      setIncomingGameInvites((prev) => {
        const next = pruneExpiredInvites(prev, now);
        return next.length === prev.length ? prev : next;
      });
      setOutgoingGameInvites((prev) => {
        const next = pruneExpiredInvites(prev, now);
        return next.length === prev.length ? prev : next;
      });
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  // Persistent presence WebSocket for instant friend requests, game invites, DMs, & account progress
  useEffect(() => {
    const token = session?.accessToken;
    if (!token) return;

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let attempt = 0;
    let lastPongAt = Date.now();

    const connect = () => {
      if (disposed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${proto}//${window.location.host}/ws/chess`);

      socket.onopen = () => {
        attempt = 0;
        lastPongAt = Date.now();
        socket?.send(JSON.stringify({ type: 'presence:identify', token }));
        if (pingTimer) window.clearInterval(pingTimer);
        pingTimer = window.setInterval(() => {
          if (!socket || socket.readyState !== WebSocket.OPEN) return;
          if (Date.now() - lastPongAt > 45_000) {
            try {
              socket.close();
            } catch {
              // ignore
            }
            return;
          }
          try {
            socket.send(JSON.stringify({ type: 'ping' }));
          } catch {
            // ignore
          }
        }, 20_000);
      };

      socket.onmessage = (event) => {
        lastPongAt = Date.now();
        try {
          const msg = JSON.parse(String(event.data)) as Record<string, unknown>;
          const type = msg.type;
          if (type === 'pong') return;

          if (type === 'notifications:sync') {
            if (Array.isArray(msg.incomingFriendRequests)) {
              setIncomingFriendRequests(
                msg.incomingFriendRequests as IncomingFriendRequestItem[],
              );
            }
            if (Array.isArray(msg.incomingGameInvites)) {
              setIncomingGameInvites(
                pruneExpiredInvites(msg.incomingGameInvites as PendingGameInvite[]),
              );
            }
            if (Array.isArray(msg.outgoingGameInvites)) {
              setOutgoingGameInvites(
                pruneExpiredInvites(msg.outgoingGameInvites as PendingGameInvite[]),
              );
            }
            return;
          }

          if (type === 'account:updated' && msg.account && typeof msg.account === 'object') {
            accountUpdatedRef.current?.(msg.account as LichessAccount);
            return;
          }

          if (type === 'dm:message' && msg.message && typeof msg.message === 'object') {
            const dmMsg = msg.message as DirectMessageItem;
            const partner =
              typeof msg.partnerUsername === 'string'
                ? msg.partnerUsername
                : dmMsg.from;
            setLastDmEvent({ partnerUsername: partner, message: dmMsg });
            setDmVersion((v) => v + 1);
            void refreshDmCount();
            return;
          }

          if (type === 'notify:dm' && typeof msg.fromUsername === 'string' && typeof msg.text === 'string') {
            const dmNote: IncomingDmNotification = {
              fromUsername: msg.fromUsername,
              fromAvatarUrl:
                typeof msg.fromAvatarUrl === 'string' ? msg.fromAvatarUrl : undefined,
              fromFlag: typeof msg.fromFlag === 'string' ? msg.fromFlag : undefined,
              text: msg.text,
              timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : Date.now(),
            };
            setLastDmNotification(dmNote);
            if (dmTimerRef.current) window.clearTimeout(dmTimerRef.current);
            dmTimerRef.current = window.setTimeout(() => {
              setLastDmNotification(null);
            }, 7000);
            void refreshDmCount();
            return;
          }

          if (type === 'notify:friend_request' && typeof msg.fromUsername === 'string') {
            const fromUser = msg.fromUsername;
            setIncomingFriendRequests((prev) => {
              if (prev.some((r) => r.username.toLowerCase() === fromUser.toLowerCase())) {
                return prev;
              }
              return [
                {
                  username: fromUser,
                  createdAt: typeof msg.createdAt === 'number' ? msg.createdAt : Date.now(),
                  rating: typeof msg.fromRating === 'number' ? msg.fromRating : undefined,
                  avatarUrl:
                    typeof msg.fromAvatarUrl === 'string' ? msg.fromAvatarUrl : undefined,
                  flag: typeof msg.fromFlag === 'string' ? msg.fromFlag : undefined,
                },
                ...prev,
              ];
            });
            setFriendListsVersion((v) => v + 1);
            return;
          }

          if (type === 'notify:friend_accepted' && typeof msg.byUsername === 'string') {
            setFriendListsVersion((v) => v + 1);
            showToast(`${msg.byUsername} accepted your friend request!`);
            return;
          }

          if (type === 'notify:sync_needed') {
            setFriendListsVersion((v) => v + 1);
            void refreshNotifications();
            return;
          }

          if (type === 'notify:game_invite' && msg.invite && typeof msg.invite === 'object') {
            setIncomingGameInvites((prev) =>
              upsertPendingInvite(prev, msg.invite as PendingGameInvite),
            );
            return;
          }

          if (type === 'notify:outgoing_invite' && msg.invite && typeof msg.invite === 'object') {
            setOutgoingGameInvites((prev) =>
              upsertPendingInvite(prev, msg.invite as PendingGameInvite),
            );
            return;
          }

          if (type === 'notify:game_invite_cancelled' && typeof msg.inviteId === 'string') {
            setIncomingGameInvites((prev) => removePendingInvite(prev, msg.inviteId as string));
            if (typeof msg.byUsername === 'string') {
              showToast(`${msg.byUsername} cancelled the game invite.`);
            }
            return;
          }

          if (type === 'notify:game_invite_rejected' && typeof msg.inviteId === 'string') {
            setOutgoingGameInvites((prev) => removePendingInvite(prev, msg.inviteId as string));
            if (typeof msg.byUsername === 'string') {
              showToast(`${msg.byUsername} declined your game invite.`);
            }
            return;
          }

          if (type === 'notify:game_invite_accepted' && typeof msg.roomId === 'string') {
            if (msg.invite && typeof (msg.invite as PendingGameInvite).id === 'string') {
              const invId = (msg.invite as PendingGameInvite).id;
              setOutgoingGameInvites((prev) => removePendingInvite(prev, invId));
            }
            const roomId = msg.roomId;
            const timeId = typeof msg.timeId === 'string' ? msg.timeId : '10+0';
            const yourColor: 'w' | 'b' = msg.yourColor === 'b' ? 'b' : 'w';
            launchRef.current({ roomId, timeId, color: yourColor });
          }
        } catch {
          // ignore malformed messages
        }
      };

      socket.onclose = () => {
        if (pingTimer) {
          window.clearInterval(pingTimer);
          pingTimer = null;
        }
        if (disposed) return;
        const delay = Math.min(6000, 1200 * Math.pow(1.5, attempt));
        attempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      if (pingTimer) window.clearInterval(pingTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      try {
        socket?.close();
      } catch {
        // ignore
      }
    };
  }, [session?.accessToken, refreshNotifications, refreshDmCount, showToast]);

  const sendGameInvite = useCallback(
    async (params: {
      toUsername: string;
      timeId?: string;
      initialSeconds?: number;
      incrementSeconds?: number;
      color?: 'w' | 'b' | 'random';
      rated?: boolean;
    }): Promise<{ ok: boolean; invite?: PendingGameInvite; error?: string }> => {
      if (!session?.accessToken) {
        return { ok: false, error: 'Sign in first to invite friends to play.' };
      }
      try {
        const res = await fetch('/api/account/invites', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({ ...params, rated: params.rated ?? true }),
        });
        const data = (await res.json()) as { invite?: PendingGameInvite; error?: string };
        if (!res.ok || !data.invite) {
          return { ok: false, error: data.error || 'Could not send game invite.' };
        }
        setOutgoingGameInvites((prev) => upsertPendingInvite(prev, data.invite!));
        return { ok: true, invite: data.invite };
      } catch {
        return { ok: false, error: 'Network error while sending game invite.' };
      }
    },
    [session?.accessToken],
  );

  const respondToGameInvite = useCallback(
    async (inviteId: string, action: 'accept' | 'reject' | 'cancel') => {
      if (!session?.accessToken) return;
      setBusyId(inviteId);
      try {
        const res = await fetch('/api/account/invites/respond', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({ inviteId, action }),
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          roomId?: string;
          timeId?: string;
          yourColor?: 'w' | 'b';
          error?: string;
        } | null;

        setIncomingGameInvites((prev) => removePendingInvite(prev, inviteId));
        setOutgoingGameInvites((prev) => removePendingInvite(prev, inviteId));

        if (!res.ok) {
          if (data?.error) showToast(data.error);
          return;
        }

        if (action === 'accept' && data?.roomId) {
          launchRef.current({
            roomId: data.roomId,
            timeId: data.timeId || '10+0',
            color: data.yourColor === 'b' ? 'b' : 'w',
          });
        }
      } finally {
        setBusyId(null);
      }
    },
    [session?.accessToken, showToast],
  );

  const respondToFriendRequest = useCallback(
    async (username: string, action: 'accept' | 'reject') => {
      if (!session?.accessToken) return;
      const key = `fr:${username.toLowerCase()}`;
      setBusyId(key);
      try {
        const res = await fetch('/api/account/friends/respond', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({ username, action }),
        });
        setIncomingFriendRequests((prev) =>
          prev.filter((r) => r.username.toLowerCase() !== username.toLowerCase()),
        );
        setFriendListsVersion((v) => v + 1);
        if (res.ok) {
          showToast(
            action === 'accept'
              ? `You and ${username} are now friends!`
              : `Declined friend request from ${username}.`,
          );
        }
      } finally {
        setBusyId(null);
      }
    },
    [session?.accessToken, showToast],
  );

  const bumpFriendListsVersion = useCallback(() => {
    setFriendListsVersion((v) => v + 1);
    void refreshNotifications();
  }, [refreshNotifications]);

  return {
    incomingFriendRequests,
    incomingGameInvites,
    outgoingGameInvites,
    lastDmNotification,
    lastDmEvent,
    unreadDmCount,
    dmVersion,
    toastMessage,
    friendListsVersion,
    busyId,
    dismissToast,
    dismissDmNotification,
    refreshDmCount,
    sendGameInvite,
    respondToGameInvite,
    respondToFriendRequest,
    bumpFriendListsVersion,
  };
}
