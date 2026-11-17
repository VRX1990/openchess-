export interface MergeFriendsOptions {
  existingFriends?: string[];
  remoteFollowing?: string[];
  removedFriends?: string[];
}

/**
 * Merges locally stored friends with remote Lichess following list while
 * respecting explicit user removals/unfollows and deduplicating case-insensitively.
 */
export function mergeFriendsWithRemote({
  existingFriends = [],
  remoteFollowing = [],
  removedFriends = [],
}: MergeFriendsOptions): string[] {
  const removedSet = new Set(
    removedFriends.map((name) => name.trim().toLowerCase()).filter(Boolean),
  );
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of [...existingFriends, ...remoteFollowing]) {
    const clean = typeof name === 'string' ? name.trim() : '';
    if (!clean) continue;
    const lower = clean.toLowerCase();
    if (removedSet.has(lower) || seen.has(lower)) continue;
    seen.add(lower);
    result.push(clean);
  }

  return result;
}

export interface ChatEchoCheckInput {
  senderRaw: string;
  text: string;
  humanName: string;
  humanColor: 'w' | 'b';
  recentMessages: Array<{
    sender: string;
    color: 'w' | 'b';
    text: string;
    timestamp: number;
  }>;
  now?: number;
}

/**
 * Prevents duplicate chat bubbles when a bridged Lichess socket echoes back
 * a message our local OpenChess player just submitted.
 */
export function isDuplicateRemoteChat({
  senderRaw,
  text,
  humanName,
  humanColor,
  recentMessages,
  now = Date.now(),
}: ChatEchoCheckInput): boolean {
  const cleanText = text.trim();
  if (!cleanText) return true;
  const senderLower = senderRaw.trim().toLowerCase();
  if (senderLower === 'lichess') return true;
  if (humanName && senderLower && senderLower === humanName.trim().toLowerCase()) {
    return true;
  }
  return recentMessages.some(
    (m) =>
      m.color === humanColor &&
      m.text.trim() === cleanText &&
      now - m.timestamp >= -2000 &&
      now - m.timestamp <= 8000,
  );
}

export interface PendingGameInvite {
  id: string;
  fromUsername: string;
  fromRating?: number;
  fromAvatarUrl?: string;
  toUsername: string;
  timeId: string;
  initialSeconds: number;
  incrementSeconds: number;
  rated: boolean;
  fromColor: 'w' | 'b';
  roomId: string;
  createdAt: number;
  expiresAt: number;
}

export function pruneExpiredInvites(
  invites: PendingGameInvite[],
  now = Date.now(),
): PendingGameInvite[] {
  return invites.filter((inv) => inv.expiresAt > now);
}

export function upsertPendingInvite(
  invites: PendingGameInvite[],
  invite: PendingGameInvite,
  now = Date.now(),
): PendingGameInvite[] {
  const active = pruneExpiredInvites(invites, now);
  const existsIdx = active.findIndex((i) => i.id === invite.id);
  if (existsIdx >= 0) {
    const copy = [...active];
    copy[existsIdx] = invite;
    return copy;
  }
  return [invite, ...active];
}

export function removePendingInvite(
  invites: PendingGameInvite[],
  inviteId: string,
): PendingGameInvite[] {
  return invites.filter((i) => i.id !== inviteId);
}

