import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Loader2,
  MessageSquare,
  Search,
  Send,
  Swords,
  User,
} from 'lucide-react';
import { countryCodeToFlagEmoji } from '../chess/analytics';
import type { LichessFriendStatus } from '../chess/lichess';
import type { DirectMessageItem, DirectMessageThread } from '../chess/onlineHelpers';
import type { LichessSession } from '../chess/useLichessAuth';
import type { RealtimeDmEvent } from '../chess/useSocialNotifications';
import { PlayerAvatar } from './PlayerAvatar';

interface MessagesViewProps {
  lichessSession: LichessSession | null;
  initialPartner?: string | null;
  lastDmEvent?: RealtimeDmEvent | null;
  dmVersion?: number;
  onConnectLichess: () => void;
  onOpenPlayerProfile?: (username: string) => void;
  onChallengePlayer?: (username: string) => void;
  onDmCountChanged?: () => void;
}

interface ActivePartnerMeta {
  username: string;
  avatarUrl?: string;
  flag?: string;
  online?: boolean;
  rating?: number;
}

export function MessagesView({
  lichessSession,
  initialPartner = null,
  lastDmEvent = null,
  dmVersion = 0,
  onConnectLichess,
  onOpenPlayerProfile,
  onChallengePlayer,
  onDmCountChanged,
}: MessagesViewProps) {
  const [threads, setThreads] = useState<DirectMessageThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<string | null>(initialPartner);
  const [partnerMeta, setPartnerMeta] = useState<ActivePartnerMeta | null>(null);
  const [messages, setMessages] = useState<DirectMessageItem[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [newChatSearch, setNewChatSearch] = useState('');
  const [searchResults, setSearchResults] = useState<LichessFriendStatus[]>([]);
  const [searching, setSearching] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.body.dataset.state = 'messages';
  }, []);

  useEffect(() => {
    if (initialPartner) {
      setSelectedPartner(initialPartner);
    }
  }, [initialPartner]);

  const loadThreads = useCallback(async () => {
    if (!lichessSession?.accessToken) {
      setThreads([]);
      return;
    }
    setThreadsLoading(true);
    try {
      const res = await fetch('/api/messages/threads', {
        headers: { Authorization: `Bearer ${lichessSession.accessToken}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { threads?: DirectMessageThread[] };
      if (Array.isArray(data.threads)) {
        setThreads(data.threads);
      }
    } catch {
      // ignore network error
    } finally {
      setThreadsLoading(false);
    }
  }, [lichessSession?.accessToken]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads, dmVersion]);

  const loadConversation = useCallback(
    async (partnerUsername: string) => {
      if (!lichessSession?.accessToken || !partnerUsername) return;
      setMessagesLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/messages/${encodeURIComponent(partnerUsername)}`, {
          headers: { Authorization: `Bearer ${lichessSession.accessToken}` },
        });
        const data = (await res.json().catch(() => null)) as {
          partner?: ActivePartnerMeta;
          messages?: DirectMessageItem[];
          error?: string;
        } | null;
        if (!res.ok) {
          throw new Error(data?.error || 'Could not load conversation.');
        }
        setPartnerMeta(data?.partner ?? { username: partnerUsername });
        setMessages(Array.isArray(data?.messages) ? data!.messages! : []);
        onDmCountChanged?.();
        void loadThreads();
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load conversation.');
      } finally {
        setMessagesLoading(false);
      }
    },
    [lichessSession?.accessToken, loadThreads, onDmCountChanged],
  );

  useEffect(() => {
    if (selectedPartner && lichessSession?.accessToken) {
      void loadConversation(selectedPartner);
    }
  }, [selectedPartner, lichessSession?.accessToken, loadConversation]);

  // Append incoming realtime message if it belongs to the currently open thread
  useEffect(() => {
    if (!lastDmEvent) return;
    if (
      selectedPartner &&
      lastDmEvent.partnerUsername.toLowerCase() === selectedPartner.toLowerCase()
    ) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === lastDmEvent.message.id)) return prev;
        return [...prev, lastDmEvent.message];
      });
      // Mark incoming read on server cleanly
      if (lichessSession?.accessToken) {
        void fetch(`/api/messages/${encodeURIComponent(selectedPartner)}`, {
          headers: { Authorization: `Bearer ${lichessSession.accessToken}` },
        }).then(() => {
          onDmCountChanged?.();
          void loadThreads();
        });
      }
    }
  }, [lastDmEvent, selectedPartner, lichessSession?.accessToken, onDmCountChanged, loadThreads]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Player autocomplete for starting a new DM
  useEffect(() => {
    const term = newChatSearch.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/lichess/autocomplete?term=${encodeURIComponent(term)}`);
        const data = (await res.json().catch(() => null)) as { users?: LichessFriendStatus[] } | null;
        if (!cancelled && Array.isArray(data?.users)) {
          setSearchResults(data!.users!);
        }
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [newChatSearch]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lichessSession?.accessToken || !selectedPartner) return;
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setErrorMsg(null);
    setDraft('');
    try {
      const res = await fetch(`/api/messages/${encodeURIComponent(selectedPartner)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lichessSession.accessToken}`,
        },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: DirectMessageItem;
        error?: string;
      } | null;
      if (!res.ok || !data?.message) {
        throw new Error(data?.error || 'Could not send message.');
      }
      setMessages((prev) =>
        prev.some((m) => m.id === data.message!.id) ? prev : [...prev, data.message!],
      );
      onDmCountChanged?.();
      void loadThreads();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to send message.');
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  if (!lichessSession) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <div className="rounded-2xl bg-[#262421] border border-white/10 p-6 text-center space-y-4">
          <MessageSquare className="w-10 h-10 text-[#81B64C] mx-auto" />
          <div className="space-y-1">
            <h1 className="text-xl font-extrabold text-white font-display">Messages</h1>
            <p className="text-xs text-[#9E998F]">
              Sign in with your OpenChess account to chat 1-on-1 with friends and online opponents.
            </p>
          </div>
          <button
            type="button"
            onClick={onConnectLichess}
            className="px-5 py-3 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[3px] border-[#457524] text-white text-sm font-extrabold cursor-pointer"
          >
            Sign In / Create Account
          </button>
        </div>
      </div>
    );
  }

  const meLower = lichessSession.account.username.toLowerCase();

  return (
    <div className="max-w-5xl mx-auto h-[calc(100dvh-7.5rem)] lg:h-[calc(100dvh-2.5rem)] pb-14 lg:pb-0 flex flex-col">
      <div className="flex-1 min-h-0 rounded-2xl bg-[#262421] border border-white/10 overflow-hidden grid grid-cols-1 lg:grid-cols-[310px_minmax(0,1fr)]">
        {/* Left Pane: Threads & Start New Message */}
        <aside
          className={`border-r border-white/10 flex flex-col min-h-0 ${
            selectedPartner ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="p-3.5 border-b border-white/10 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <h1 className="text-base font-extrabold text-white font-display flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#81B64C]" />
                <span>Messages</span>
              </h1>
              {threadsLoading && <Loader2 className="w-4 h-4 animate-spin text-[#81B64C]" />}
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#8E8980] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={newChatSearch}
                onChange={(e) => setNewChatSearch(e.target.value)}
                placeholder="Start chat with player..."
                aria-label="Search player to message"
                className="w-full min-h-[38px] rounded-xl bg-[#1A1917] border border-white/10 pl-8 pr-3 text-xs text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C]"
              />
            </div>

            {newChatSearch.trim().length >= 2 && (
              <div className="rounded-xl bg-[#1A1917] border border-white/10 divide-y divide-white/5 max-h-44 overflow-y-auto">
                {searching ? (
                  <div className="p-2.5 text-[11px] text-[#9E998F]">Searching...</div>
                ) : searchResults.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const clean = newChatSearch.trim();
                      setNewChatSearch('');
                      setSelectedPartner(clean);
                    }}
                    className="w-full p-2.5 text-left text-xs font-bold text-[#81B64C] hover:bg-white/5 cursor-pointer"
                  >
                    Message &ldquo;{newChatSearch.trim()}&rdquo;
                  </button>
                ) : (
                  searchResults
                    .filter((u) => u.username.toLowerCase() !== meLower)
                    .map((u) => (
                      <button
                        key={u.username}
                        type="button"
                        onClick={() => {
                          setNewChatSearch('');
                          setSelectedPartner(u.username);
                        }}
                        className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-white/5 cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <PlayerAvatar
                            username={u.username}
                            avatarUrl={u.avatarUrl}
                            size={26}
                            rounded="rounded-lg"
                          />
                          <span className="text-xs font-bold text-white truncate">
                            {u.username} {countryCodeToFlagEmoji(u.flag)}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-[#9E998F]">{u.bestRating}</span>
                      </button>
                    ))
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {threads.length === 0 && !threadsLoading ? (
              <div className="p-6 text-center text-xs text-[#9E998F] space-y-1">
                <p className="font-bold text-[#DEDAD2]">No direct messages yet</p>
                <p>Search any player above or open a player profile to say hello.</p>
              </div>
            ) : (
              threads.map((th) => {
                const active =
                  selectedPartner?.toLowerCase() === th.partnerUsername.toLowerCase();
                const flag = countryCodeToFlagEmoji(th.partnerFlag);
                return (
                  <button
                    key={th.partnerUsername}
                    type="button"
                    onClick={() => setSelectedPartner(th.partnerUsername)}
                    className={`w-full px-3.5 py-3 flex items-center gap-3 text-left transition-colors cursor-pointer ${
                      active ? 'bg-[#383530]' : 'hover:bg-[#312E2A]'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <PlayerAvatar
                        username={th.partnerUsername}
                        avatarUrl={th.partnerAvatarUrl}
                        size={42}
                        rounded="rounded-xl"
                      />
                      {th.partnerOnline && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#81B64C] border-2 border-[#262421]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs sm:text-sm font-extrabold text-white truncate">
                          {th.partnerUsername} {flag}
                        </span>
                        {th.unreadCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-[#81B64C] text-[#191815] text-[10px] font-extrabold leading-none">
                            {th.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#9E998F] truncate mt-0.5">
                        {th.lastMessage.from.toLowerCase() === meLower ? 'You: ' : ''}
                        {th.lastMessage.text}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right Pane: Active 1-on-1 Conversation */}
        <section
          className={`flex flex-col min-h-0 bg-[#1E1C19] ${
            selectedPartner ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!selectedPartner ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2 text-[#9E998F]">
              <MessageSquare className="w-9 h-9 text-[#81B64C] opacity-75" />
              <div className="text-sm font-extrabold text-white">Select a conversation</div>
              <p className="text-xs max-w-xs">
                Choose a thread on the left or search a player username to send a message.
              </p>
            </div>
          ) : (
            <>
              <header className="px-3.5 py-2.5 bg-[#262421] border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedPartner(null)}
                    aria-label="Back to threads"
                    className="lg:hidden w-8 h-8 rounded-lg bg-[#393734] flex items-center justify-center text-[#DEDAD2] cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenPlayerProfile?.(selectedPartner)}
                    className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer hover:opacity-90"
                  >
                    <PlayerAvatar
                      username={selectedPartner}
                      avatarUrl={partnerMeta?.avatarUrl}
                      size={36}
                      rounded="rounded-xl"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-white truncate">
                        {partnerMeta?.username ?? selectedPartner}{' '}
                        {countryCodeToFlagEmoji(partnerMeta?.flag)}
                      </div>
                      <div className="text-[11px] text-[#9E998F]">
                        {partnerMeta?.online ? 'Online now' : 'Offline'}
                        {partnerMeta?.rating ? ` · Rapid ${partnerMeta.rating}` : ''}
                      </div>
                    </div>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenPlayerProfile?.(selectedPartner)}
                    aria-label={`View profile for ${selectedPartner}`}
                    className="px-2.5 py-1.5 rounded-lg bg-[#393734] hover:bg-[#43403C] text-xs font-bold text-[#DEDAD2] flex items-center gap-1 cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Profile</span>
                  </button>
                  {onChallengePlayer && (
                    <button
                      type="button"
                      onClick={() => onChallengePlayer(selectedPartner)}
                      className="px-2.5 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                    >
                      <Swords className="w-3.5 h-3.5" />
                      <span>Challenge</span>
                    </button>
                  )}
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
                {messagesLoading && messages.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[#9E998F]">
                    Loading messages...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[#9E998F]">
                    Say hello to {selectedPartner}!
                  </div>
                ) : (
                  messages.map((m) => {
                    const isMine = m.from.toLowerCase() === meLower;
                    return (
                      <div
                        key={m.id}
                        className={`flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isMine && (
                          <PlayerAvatar
                            username={m.from}
                            avatarUrl={m.fromAvatarUrl ?? partnerMeta?.avatarUrl}
                            size={28}
                            rounded="rounded-lg"
                          />
                        )}
                        <div
                          className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                            isMine
                              ? 'bg-[#81B64C] text-[#191815] font-semibold'
                              : 'bg-[#2B2926] text-white border border-white/10'
                          }`}
                        >
                          <div>{m.text}</div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 bg-[#262421] border-t border-white/10 space-y-2 shrink-0">
                {errorMsg && (
                  <div className="px-2.5 py-1.5 rounded-lg bg-[#5C2320] text-[11px] font-semibold text-[#F7C7C1]">
                    {errorMsg}
                  </div>
                )}
                <form onSubmit={(e) => void handleSend(e)} className="flex gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={`Message ${selectedPartner}...`}
                    aria-label="Direct message input"
                    className="flex-1 min-h-[42px] rounded-xl bg-[#1A1917] border border-white/10 px-3.5 text-xs text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C]"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    aria-label="Send direct message"
                    className="px-4 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] text-[#191815] font-extrabold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-45"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
