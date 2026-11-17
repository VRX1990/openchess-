import { Check, Clock, Loader2, MessageSquare, Swords, UserPlus, X } from 'lucide-react';
import { countryCodeToFlagEmoji } from '../chess/analytics';
import type {
  IncomingDmNotification,
  IncomingFriendRequestItem,
} from '../chess/useSocialNotifications';
import type { PendingGameInvite } from '../chess/syncHelpers';
import { PlayerAvatar } from './PlayerAvatar';

interface SocialNotificationsOverlayProps {
  incomingGameInvites: PendingGameInvite[];
  outgoingGameInvites: PendingGameInvite[];
  incomingFriendRequests: IncomingFriendRequestItem[];
  lastDmNotification?: IncomingDmNotification | null;
  toastMessage: string | null;
  busyId: string | null;
  onRespondGameInvite: (inviteId: string, action: 'accept' | 'reject' | 'cancel') => void;
  onRespondFriendRequest: (username: string, action: 'accept' | 'reject') => void;
  onDismissDmNotification?: () => void;
  onReplyDm?: (username: string) => void;
  onDismissToast: () => void;
}

export function SocialNotificationsOverlay({
  incomingGameInvites,
  outgoingGameInvites,
  incomingFriendRequests,
  lastDmNotification = null,
  toastMessage,
  busyId,
  onRespondGameInvite,
  onRespondFriendRequest,
  onDismissDmNotification,
  onReplyDm,
  onDismissToast,
}: SocialNotificationsOverlayProps) {
  const hasAny =
    incomingGameInvites.length > 0 ||
    outgoingGameInvites.length > 0 ||
    incomingFriendRequests.length > 0 ||
    Boolean(lastDmNotification) ||
    Boolean(toastMessage);

  if (!hasAny) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-3 right-3 left-3 sm:left-auto sm:w-[360px] z-50 flex flex-col gap-2.5 pointer-events-none"
    >
      {/* Incoming Game Invite Cards (Approve / Reject) */}
      {incomingGameInvites.map((inv) => {
        const isBusy = busyId === inv.id;
        return (
          <div
            key={inv.id}
            role="dialog"
            aria-label={`Game invite from ${inv.fromUsername}`}
            className="pointer-events-auto rounded-2xl bg-[#262421] border border-[#81B64C]/55 shadow-2xl overflow-hidden animate-view-enter"
          >
            <div className="h-1 w-full bg-[#81B64C]" />
            <div className="p-3.5 space-y-3">
              <div className="flex items-center gap-3">
                <PlayerAvatar
                  username={inv.fromUsername}
                  avatarUrl={inv.fromAvatarUrl}
                  size={44}
                  rounded="rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#81B64C]">
                    <Swords className="w-3.5 h-3.5 shrink-0" />
                    <span>Game Invite</span>
                  </div>
                  <div className="text-sm font-extrabold text-white truncate">
                    {inv.fromUsername} invited you to play
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#C8C4BC] font-mono mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-[#81B64C] shrink-0" />
                    <span>{inv.timeId}</span>
                    {inv.fromRating ? (
                      <span className="text-[#9E998F]">· {inv.fromRating}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onRespondGameInvite(inv.id, 'accept')}
                  className="min-h-[40px] rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[3px] border-[#457524] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isBusy ? 'Joining...' : 'Approve'}</span>
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onRespondGameInvite(inv.id, 'reject')}
                  className="min-h-[40px] rounded-xl bg-[#3B2320] hover:bg-[#4F2D28] text-[#F5B8B0] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  <span>Reject</span>
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Incoming Friend Request Popups (Accept / Reject) */}
      {incomingFriendRequests.map((req) => {
        const isBusy = busyId === `fr:${req.username.toLowerCase()}`;
        return (
          <div
            key={`fr-${req.username}`}
            role="dialog"
            aria-label={`Friend request from ${req.username}`}
            className="pointer-events-auto rounded-2xl bg-[#262421] border border-[#6FB3E0]/45 shadow-2xl overflow-hidden animate-view-enter"
          >
            <div className="h-1 w-full bg-[#6FB3E0]" />
            <div className="p-3.5 space-y-3">
              <div className="flex items-center gap-3">
                <PlayerAvatar
                  username={req.username}
                  avatarUrl={req.avatarUrl}
                  size={42}
                  rounded="rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#7FC4ED]">
                    <UserPlus className="w-3.5 h-3.5 shrink-0" />
                    <span>Friend Request</span>
                  </div>
                  <div className="text-sm font-extrabold text-white truncate">
                    {req.username} {countryCodeToFlagEmoji(req.flag)}
                  </div>
                  <div className="text-xs text-[#9E998F]">
                    {req.rating ? `Rapid ${req.rating} · ` : ''}Wants to add you as a friend
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onRespondFriendRequest(req.username, 'accept')}
                  className="min-h-[38px] rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-2 border-[#457524] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Accept</span>
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onRespondFriendRequest(req.username, 'reject')}
                  className="min-h-[38px] rounded-xl bg-[#3B2320] hover:bg-[#4F2D28] text-[#F5B8B0] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Incoming Direct Message Toast with Reply CTA */}
      {lastDmNotification && (
        <div
          role="dialog"
          aria-label={`New message from ${lastDmNotification.fromUsername}`}
          className="pointer-events-auto rounded-2xl bg-[#262421] border border-[#F7C045]/55 shadow-2xl overflow-hidden animate-view-enter"
        >
          <div className="h-1 w-full bg-[#F7C045]" />
          <div className="p-3.5 space-y-2.5">
            <div className="flex items-start gap-3">
              <PlayerAvatar
                username={lastDmNotification.fromUsername}
                avatarUrl={lastDmNotification.fromAvatarUrl}
                size={40}
                rounded="rounded-xl"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#F7C045]">
                    <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                    <span>New Message</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDismissDmNotification?.()}
                    aria-label="Dismiss message notification"
                    className="text-[#9E998F] hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-sm font-extrabold text-white truncate">
                  {lastDmNotification.fromUsername}{' '}
                  {countryCodeToFlagEmoji(lastDmNotification.fromFlag)}
                </div>
                <p className="text-xs text-[#DEDAD2] line-clamp-2 mt-0.5">
                  {lastDmNotification.text}
                </p>
              </div>
            </div>

            {onReplyDm && (
              <button
                type="button"
                onClick={() => {
                  const fromUser = lastDmNotification.fromUsername;
                  onDismissDmNotification?.();
                  onReplyDm(fromUser);
                }}
                className="w-full min-h-[36px] rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-2 border-[#457524] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Reply</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Outgoing Pending Game Invite Banner (Sender waiting for friend's response) */}
      {outgoingGameInvites.map((inv) => {
        const isBusy = busyId === inv.id;
        return (
          <div
            key={`out-${inv.id}`}
            className="pointer-events-auto rounded-2xl bg-[#262421] border border-[#F7C045]/45 shadow-xl p-3 flex items-center justify-between gap-2.5 animate-view-enter"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Loader2 className="w-4 h-4 animate-spin text-[#F7C045] shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-white truncate">
                  Invited {inv.toUsername} ({inv.timeId})
                </div>
                <div className="text-[11px] text-[#9E998F]">
                  Waiting for friend to approve...
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onRespondGameInvite(inv.id, 'cancel')}
              className="px-2.5 py-1.5 rounded-lg bg-[#393734] hover:bg-[#4A4742] text-xs font-bold text-[#F5B8B0] shrink-0 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        );
      })}

      {/* Status Toast */}
      {toastMessage && (
        <div
          role="status"
          className="pointer-events-auto rounded-xl bg-[#262421] border border-white/15 shadow-lg px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-bold text-[#DEDAD2]"
        >
          <span className="truncate">{toastMessage}</span>
          <button
            type="button"
            onClick={onDismissToast}
            aria-label="Dismiss notification"
            className="text-[#9E998F] hover:text-white shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
