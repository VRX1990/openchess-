import { useEffect, useState } from 'react';
import type { Color } from 'chess.js';
import {
  CheckCircle2,
  Clock,
  Flag,
  MessageSquare,
  Puzzle,
  Rocket,
  SearchCheck,
  ShieldAlert,
  Swords,
  Trash2,
  Trophy,
  UserPlus,
  X,
  Zap,
} from 'lucide-react';
import {
  countryCodeToFlagEmoji,
  enrichGamePgnWithHeaders,
  formatGamePlayedAgo,
  formatJoinedDate,
  formatLastSeenAgo,
  isGamePlayedAsBlack,
} from '../chess/analytics';
import type { LichessUserGame } from '../chess/lichess';
import { COUNTRY_OPTIONS, type LeagueStatus, type RatingHistoryMap } from '../chess/onlineHelpers';
import type { LichessSession } from '../chess/useLichessAuth';
import { PlayerAvatar } from './PlayerAvatar';

const REPORT_REASONS = [
  {
    id: 'fair_play',
    label: 'Fair Play / Engine Assistance',
    description: 'Suspected use of chess engines or external assistance during live games.',
  },
  {
    id: 'unverified_account',
    label: 'Suspicious or Unverified Account',
    description: 'Fake identity, automated bot behavior, or rating manipulation.',
  },
  {
    id: 'abusive_chat',
    label: 'Abusive Chat or Harassment',
    description: 'Unsportsmanlike messages, spam, or offensive profile content.',
  },
  {
    id: 'stalling',
    label: 'Stalling / Sandbagging',
    description: 'Intentionally letting the clock run out or artificially lowering rating.',
  },
] as const;

export interface PublicPlayerProfileData {
  id: string;
  username: string;
  title?: string;
  online: boolean;
  createdAt?: number;
  seenAt?: number;
  profile?: {
    country?: string;
    flag?: string;
    bio?: string;
    avatarUrl?: string;
  };
  perfs?: {
    rapid?: { rating: number; games: number };
    blitz?: { rating: number; games: number };
    bullet?: { rating: number; games: number };
    puzzle?: { rating: number; games: number };
  };
  count?: {
    all: number;
    win: number;
    loss: number;
    draw: number;
  };
  leaguePoints?: number;
  league?: LeagueStatus;
  ratingHistory?: Partial<RatingHistoryMap>;
  recentGames?: LichessUserGame[];
}

interface PlayerProfileModalProps {
  username: string | null;
  lichessSession: LichessSession | null;
  friends?: string[];
  outgoingRequests?: string[];
  incomingRequests?: string[];
  onClose: () => void;
  onChallenge?: (username: string) => void;
  onAddFriend?: (username: string) => void;
  onRemoveFriend?: (username: string) => void;
  onMessage?: (username: string) => void;
  onReviewGame?: (pgn: string, color: Color, resultLabel: string) => void;
}

export function PlayerProfileModal({
  username,
  lichessSession,
  friends = [],
  outgoingRequests = [],
  incomingRequests = [],
  onClose,
  onChallenge,
  onAddFriend,
  onRemoveFriend,
  onMessage,
  onReviewGame,
}: PlayerProfileModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [player, setPlayer] = useState<PublicPlayerProfileData | null>(null);
  const [addedLocal, setAddedLocal] = useState(false);
  const [removedLocal, setRemovedLocal] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string>(REPORT_REASONS[0].id);
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmittedMsg, setReportSubmittedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!username) {
      setPlayer(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAddedLocal(false);
    setRemovedLocal(false);
    setReportOpen(false);
    setReportReason(REPORT_REASONS[0].id);
    setReportDetails('');
    setReportError(null);
    setReportSubmittedMsg(null);

    fetch(`/api/players/${encodeURIComponent(username)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as {
          player?: PublicPlayerProfileData;
          error?: string;
        } | null;
        if (!res.ok || !data?.player) {
          throw new Error(data?.error || 'Could not load player profile.');
        }
        return data.player;
      })
      .then((loaded) => {
        if (!cancelled) setPlayer(loaded);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load player profile.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [username]);

  if (!username) return null;

  const isSelf =
    Boolean(lichessSession?.account.username) &&
    lichessSession!.account.username.toLowerCase() === username.toLowerCase();

  const lowerTarget = username.toLowerCase();
  const isFriend = !removedLocal && friends.some((f) => f.toLowerCase() === lowerTarget);
  const isOutgoing =
    !isFriend &&
    (addedLocal || (!removedLocal && outgoingRequests.some((f) => f.toLowerCase() === lowerTarget)));
  const isIncoming = !removedLocal && incomingRequests.some((f) => f.toLowerCase() === lowerTarget);

  const rawFlagCode = player?.profile?.flag || player?.profile?.country;
  const flagEmoji = countryCodeToFlagEmoji(rawFlagCode);
  const countryName =
    COUNTRY_OPTIONS.find((c) => c.code.toUpperCase() === (rawFlagCode || '').toUpperCase())
      ?.name ?? (rawFlagCode && rawFlagCode !== 'INT' ? rawFlagCode : null);

  const count = player?.count ?? { all: 0, win: 0, loss: 0, draw: 0 };

  const handleSubmitReport = async () => {
    if (!player || reportSubmitting) return;
    setReportSubmitting(true);
    setReportError(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (lichessSession?.accessToken) {
        headers.Authorization = `Bearer ${lichessSession.accessToken}`;
      }
      const res = await fetch(`/api/players/${encodeURIComponent(player.username)}/report`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          reason: reportReason,
          details: reportDetails.trim(),
          reporterUsername: lichessSession?.account.username || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || 'Could not submit player report.');
      }
      setReportSubmittedMsg(
        data.message || 'Report submitted for Fair Play & Account Verification review.',
      );
      setReportOpen(false);
      setReportDetails('');
    } catch (err: unknown) {
      setReportError(err instanceof Error ? err.message : 'Unable to submit report.');
    } finally {
      setReportSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Player profile for ${username}`}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg max-h-[90dvh] rounded-2xl bg-[#262421] border border-white/15 shadow-2xl flex flex-col overflow-hidden animate-view-enter">
        <div className="h-1 w-full bg-[#81B64C] shrink-0" />

        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
          <div className="text-sm font-extrabold text-white font-display truncate">
            Player Profile
          </div>
          <div className="flex items-center gap-1.5">
            {!isSelf && player && (
              <button
                type="button"
                data-testid="report-player-toggle-btn"
                onClick={() => {
                  setReportOpen((prev) => !prev);
                  setReportError(null);
                }}
                aria-label={`Report ${player.username}`}
                className={`px-2.5 h-8 rounded-lg text-[11px] font-extrabold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  reportOpen
                    ? 'bg-[#5C2320] text-[#F7C7C1] border border-[#E06C5A]/50'
                    : 'bg-[#393734] hover:bg-[#4A2825] text-[#DEDAD2] hover:text-[#F7C7C1]'
                }`}
              >
                <Flag className="w-3.5 h-3.5 text-[#E06C5A]" />
                <span>Report Player</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close player profile"
              className="w-8 h-8 rounded-lg bg-[#393734] hover:bg-[#43403C] flex items-center justify-center text-[#DEDAD2] hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="py-12 text-center text-xs text-[#9E998F]">
              Loading player profile...
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-[#5C2320]/60 border border-[#E06C5A]/40 text-xs text-[#F7C7C1]">
              {error}
            </div>
          ) : (
            player && (
              <>
                {/* Header Identity */}
                <div className="flex items-start gap-3.5">
                  <div className="relative shrink-0">
                    <PlayerAvatar
                      username={player.username}
                      avatarUrl={player.profile?.avatarUrl}
                      isCurrentUser={isSelf}
                      size={72}
                      rounded="rounded-2xl"
                    />
                    {player.online && (
                      <span
                        title="Online now"
                        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#81B64C] border-2 border-[#262421]"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h2 className="text-lg font-extrabold text-white font-display truncate">
                        {player.username}
                      </h2>
                      {player.title && (
                        <span className="px-1.5 py-0.5 rounded bg-[#B8860B] text-[10px] font-extrabold text-white">
                          {player.title}
                        </span>
                      )}
                      {flagEmoji && (
                        <span className="text-base leading-none" title={countryName ?? undefined}>
                          {flagEmoji}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-[#9E998F] flex flex-wrap items-center gap-2">
                      <span className={player.online ? 'text-[#81B64C] font-bold' : ''}>
                        {player.online ? 'Online now' : formatLastSeenAgo(player.seenAt)}
                      </span>
                      {countryName && <span>· {countryName}</span>}
                      <span>· Joined {formatJoinedDate(player.createdAt)}</span>
                    </div>

                    {player.profile?.bio && (
                      <p className="text-xs text-[#DEDAD2] bg-[#1E1C19] rounded-lg px-2.5 py-2 leading-relaxed border border-white/5">
                        {player.profile.bio}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                {!isSelf && (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onChallenge?.(player.username);
                        }}
                        className="min-h-[42px] rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[3px] border-[#457524] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Swords className="w-3.5 h-3.5" />
                        <span>Challenge</span>
                      </button>

                      {isFriend ? (
                        <button
                          type="button"
                          data-testid="profile-modal-remove-friend-btn"
                          onClick={() => {
                            setRemovedLocal(true);
                            setAddedLocal(false);
                            onRemoveFriend?.(player.username);
                          }}
                          className="min-h-[42px] rounded-xl bg-[#3B2320] hover:bg-[#4F2D28] text-[#F5B8B0] text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-[#E06C5A]" />
                          <span>Remove Friend</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          data-testid="profile-modal-add-friend-btn"
                          disabled={isOutgoing}
                          onClick={() => {
                            setRemovedLocal(false);
                            setAddedLocal(true);
                            onAddFriend?.(player.username);
                          }}
                          className="min-h-[42px] rounded-xl bg-[#393734] hover:bg-[#43403C] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-65"
                        >
                          <UserPlus className="w-3.5 h-3.5 text-[#7FC4ED]" />
                          <span>
                            {isOutgoing
                              ? 'Pending'
                              : isIncoming
                                ? 'Accept'
                                : 'Add Friend'}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onMessage?.(player.username);
                        }}
                        className="min-h-[42px] rounded-xl bg-[#393734] hover:bg-[#43403C] text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-[#F7C045]" />
                        <span>Message</span>
                      </button>
                    </div>

                    {reportSubmittedMsg && !reportOpen && (
                      <div
                        data-testid="report-player-success"
                        className="rounded-xl bg-[#1F3522] border border-[#81B64C]/40 px-3 py-2.5 flex items-center gap-2 text-xs text-[#CBE8B0]"
                      >
                        <CheckCircle2 className="w-4 h-4 text-[#81B64C] shrink-0" />
                        <span>{reportSubmittedMsg}</span>
                      </div>
                    )}

                    {reportOpen && (
                      <div
                        data-testid="report-player-form"
                        className="rounded-xl bg-[#1E1C19] border border-[#E06C5A]/35 p-3.5 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-extrabold text-white">
                            <ShieldAlert className="w-4 h-4 text-[#E06C5A] shrink-0" />
                            <span>Report {player.username}</span>
                          </div>
                          <span className="text-[10px] font-semibold text-[#9E998F]">
                            Fair Play & Verification
                          </span>
                        </div>

                        <div className="grid grid-cols-1 gap-1.5">
                          {REPORT_REASONS.map((item) => {
                            const selected = reportReason === item.id;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                data-testid={`report-reason-${item.id}`}
                                onClick={() => setReportReason(item.id)}
                                className={`text-left rounded-lg px-3 py-2 border transition-colors cursor-pointer ${
                                  selected
                                    ? 'bg-[#3A2321] border-[#E06C5A] text-white'
                                    : 'bg-[#262421] border-white/10 text-[#DEDAD2] hover:bg-[#302E2B]'
                                }`}
                              >
                                <div className="text-xs font-bold">{item.label}</div>
                                <div className="text-[11px] text-[#9E998F] leading-snug">
                                  {item.description}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="space-y-1">
                          <label
                            htmlFor="player-report-details"
                            className="block text-[11px] font-bold text-[#B8B4AC]"
                          >
                            Additional context (optional)
                          </label>
                          <textarea
                            id="player-report-details"
                            data-testid="report-player-details-input"
                            rows={2}
                            maxLength={400}
                            value={reportDetails}
                            onChange={(e) => setReportDetails(e.target.value)}
                            placeholder="Describe specific moves, suspicious timing, or chat behavior..."
                            className="w-full rounded-lg bg-[#262421] border border-white/15 px-2.5 py-2 text-xs text-white placeholder-[#7A766E] focus:outline-none focus:border-[#E06C5A]"
                          />
                        </div>

                        {reportError && (
                          <div className="rounded-lg bg-[#5C2320]/60 border border-[#E06C5A]/40 px-2.5 py-1.5 text-[11px] text-[#F7C7C1]">
                            {reportError}
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setReportOpen(false)}
                            className="px-3 py-1.5 rounded-lg bg-[#393734] hover:bg-[#43403C] text-xs font-bold text-[#DEDAD2] cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            data-testid="report-player-submit-btn"
                            disabled={reportSubmitting}
                            onClick={handleSubmitReport}
                            className="px-3.5 py-1.5 rounded-lg bg-[#E06C5A] hover:bg-[#EA7B6A] text-xs font-extrabold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                          >
                            <Flag className="w-3.5 h-3.5" />
                            <span>{reportSubmitting ? 'Submitting...' : 'Submit Report'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* League Tier Card */}
                {player.league && (
                  <div className="rounded-xl bg-[#1E1C19] border border-white/10 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-extrabold text-white">
                        <Trophy
                          className="w-4 h-4 shrink-0"
                          style={{ color: player.league.badgeColor }}
                        />
                        <span>{player.league.tier} League</span>
                      </span>
                      <span className="font-mono font-bold text-[#DEDAD2] tabular-nums">
                        {player.league.points} pts
                        {player.league.nextThreshold
                          ? ` / ${player.league.nextThreshold}`
                          : ' (Max)'}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#302E2B] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${player.league.progressPct}%`,
                          backgroundColor: player.league.badgeColor,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Ratings Grid */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-xl bg-[#393734] py-2.5 px-2 text-center space-y-1">
                    <Clock className="w-4 h-4 text-[#81B64C] mx-auto" />
                    <div className="text-sm font-extrabold font-mono text-white tabular-nums">
                      {player.perfs?.rapid?.rating ?? 1200}
                    </div>
                    <div className="text-[10px] text-[#9E998F] font-semibold">Rapid</div>
                  </div>
                  <div className="rounded-xl bg-[#393734] py-2.5 px-2 text-center space-y-1">
                    <Zap className="w-4 h-4 text-[#F7C045] mx-auto" />
                    <div className="text-sm font-extrabold font-mono text-white tabular-nums">
                      {player.perfs?.blitz?.rating ?? 1200}
                    </div>
                    <div className="text-[10px] text-[#9E998F] font-semibold">Blitz</div>
                  </div>
                  <div className="rounded-xl bg-[#393734] py-2.5 px-2 text-center space-y-1">
                    <Rocket className="w-4 h-4 text-[#E59A28] mx-auto" />
                    <div className="text-sm font-extrabold font-mono text-white tabular-nums">
                      {player.perfs?.bullet?.rating ?? 1200}
                    </div>
                    <div className="text-[10px] text-[#9E998F] font-semibold">Bullet</div>
                  </div>
                  <div className="rounded-xl bg-[#393734] py-2.5 px-2 text-center space-y-1">
                    <Puzzle className="w-4 h-4 text-[#E06C5A] mx-auto" />
                    <div className="text-sm font-extrabold font-mono text-white tabular-nums">
                      {player.perfs?.puzzle?.rating ?? 1200}
                    </div>
                    <div className="text-[10px] text-[#9E998F] font-semibold">Puzzles</div>
                  </div>
                </div>

                {/* W/D/L Summary */}
                <div className="rounded-xl bg-[#1E1C19] px-3 py-2.5 flex items-center justify-between text-xs">
                  <span className="font-bold text-[#9E998F]">
                    Total Games: <strong className="text-white font-mono">{count.all}</strong>
                  </span>
                  <div className="flex items-center gap-3 font-mono font-bold tabular-nums">
                    <span className="text-[#81B64C]">{count.win}W</span>
                    <span className="text-[#B8B4AC]">{count.draw}D</span>
                    <span className="text-[#E06C5A]">{count.loss}L</span>
                  </div>
                </div>

                {/* Recent Games */}
                <div className="space-y-2">
                  <div className="text-xs font-extrabold text-white font-display">
                    Recent Games
                  </div>
                  {!player.recentGames || player.recentGames.length === 0 ? (
                    <div className="rounded-xl bg-[#1E1C19] p-4 text-center text-xs text-[#9E998F]">
                      No recent games played yet.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {player.recentGames.slice(0, 6).map((g) => {
                        const asBlack = isGamePlayedAsBlack(g, player.username);
                        const won =
                          g.winner === 'white'
                            ? !asBlack
                            : g.winner === 'black'
                              ? asBlack
                              : null;
                        return (
                          <div
                            key={g.id}
                            className="rounded-xl bg-[#393734] px-3 py-2 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-white truncate">
                                {g.white.name} vs {g.black.name}
                              </div>
                              <div className="text-[11px] text-[#9E998F] capitalize">
                                {g.speed} · {won === true ? 'Won' : won === false ? 'Lost' : 'Draw'}
                                {formatGamePlayedAgo(g.lastMoveAt ?? g.createdAt)
                                  ? ` · ${formatGamePlayedAgo(g.lastMoveAt ?? g.createdAt)}`
                                  : ''}
                              </div>
                            </div>
                            {onReviewGame && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onReviewGame(
                                    enrichGamePgnWithHeaders(g),
                                    asBlack ? 'b' : 'w',
                                    g.winner === 'white'
                                      ? '1-0'
                                      : g.winner === 'black'
                                        ? '0-1'
                                        : '1/2-1/2',
                                  );
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-white text-[11px] font-extrabold flex items-center gap-1 shrink-0 cursor-pointer"
                              >
                                <SearchCheck className="w-3.5 h-3.5" />
                                <span>Review</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
