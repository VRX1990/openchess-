import { useCallback, useEffect, useMemo, useState } from 'react';
import { Chess, type Color } from 'chess.js';
import {
  Binoculars,
  RefreshCw,
  Search,
  SearchCheck,
  Radio,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Users,
} from 'lucide-react';
import { countryCodeToFlagEmoji } from '../chess/analytics';
import {
  parseUciMovesToGameState,
  type LichessTvChannel,
  type LichessUserGame,
} from '../chess/lichess';
import { evaluatePosition } from '../chess/engine';
import { ChessBoard, type BoardTheme } from './ChessBoard';
import { EvaluationBar } from './EvaluationBar';
import { PlayerAvatar } from './PlayerAvatar';

interface WatchViewProps {
  boardTheme: BoardTheme;
  onSendToReview: (pgn: string, color: Color, resultLabel: string) => void;
  onOpenPlayerProfile?: (username: string) => void;
}

interface ActiveLiveRoomItem {
  roomId: string;
  whiteName: string;
  blackName: string;
  whiteRating?: number;
  blackRating?: number;
  whiteAvatarUrl?: string;
  blackAvatarUrl?: string;
  whiteFlag?: string;
  blackFlag?: string;
  speed: string;
  clockLabel: string;
  moveCount: number;
  spectatorCount: number;
  fen: string;
}

interface LiveWatchState {
  gameId: string;
  fen: string;
  pgn: string;
  lastMove: { from: string; to: string; captured?: boolean } | null;
  whiteName: string;
  whiteRating?: number;
  whiteTitle?: string;
  whiteAvatarUrl?: string;
  whiteFlag?: string;
  blackName: string;
  blackRating?: number;
  blackTitle?: string;
  blackAvatarUrl?: string;
  blackFlag?: string;
  wc?: number;
  bc?: number;
  statusName: string;
  winner?: string;
  orientation: Color;
  spectatorCount?: number;
}

function fmtSec(sec?: number): string {
  if (typeof sec !== 'number' || Number.isNaN(sec)) return '--:--';
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function WatchView({ boardTheme, onSendToReview, onOpenPlayerProfile }: WatchViewProps) {
  const [watchSource, setWatchSource] = useState<'masters' | 'openchess'>('masters');
  const [activeRooms, setActiveRooms] = useState<ActiveLiveRoomItem[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [channels, setChannels] = useState<LichessTvChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('best');
  const [tvLoading, setTvLoading] = useState(true);
  const [tvError, setTvError] = useState<string | null>(null);

  const [watchState, setWatchState] = useState<LiveWatchState>({
    gameId: '',
    fen: new Chess().fen(),
    pgn: '',
    lastMove: null,
    whiteName: 'Loading Live TV...',
    blackName: 'Master',
    statusName: 'connecting',
    orientation: 'w',
  });
  const [flipped, setFlipped] = useState(false);

  const [lookupUser, setLookupUser] = useState('');
  const [userGames, setUserGames] = useState<LichessUserGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState<string | null>(null);

  const [viewPly, setViewPly] = useState<number | null>(null);

  const loadActiveRooms = useCallback(async () => {
    try {
      const res = await fetch('/api/online/active-games');
      if (res.ok) {
        const data = (await res.json()) as { games?: ActiveLiveRoomItem[] };
        if (Array.isArray(data?.games)) {
          setActiveRooms(data.games);
          setSelectedRoomId((prev) =>
            prev && data.games!.some((g) => g.roomId === prev)
              ? prev
              : data.games![0]?.roomId ?? null,
          );
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const loadChannels = useCallback(async () => {
    setTvLoading(true);
    setTvError(null);
    try {
      const res = await fetch('/api/lichess/tv');
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.channels)) {
        throw new Error(data.error || 'Unable to load Live TV.');
      }
      setChannels(data.channels as LichessTvChannel[]);
    } catch (err: unknown) {
      setTvError(err instanceof Error ? err.message : 'Live TV unavailable.');
    } finally {
      setTvLoading(false);
    }
  }, []);

  useEffect(() => {
    document.body.dataset.state = 'watch';
    void loadChannels();
    void loadActiveRooms();
    const timer = window.setInterval(() => {
      void loadActiveRooms();
    }, 6000);
    return () => window.clearInterval(timer);
  }, [loadActiveRooms, loadChannels]);

  const activeChannel = useMemo(
    () => channels.find((c) => c.channel === selectedChannel) ?? channels[0] ?? null,
    [channels, selectedChannel],
  );

  // Spectate live OpenChess WebSocket room when watchSource === 'openchess'
  useEffect(() => {
    if (watchSource !== 'openchess' || !selectedRoomId) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws/chess`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'spectate_room', roomId: selectedRoomId }));
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data));
        if (msg.type === 'room:state') {
          setWatchState({
            gameId: msg.roomId ?? selectedRoomId,
            fen: msg.fen ?? new Chess().fen(),
            pgn: msg.pgn ?? '',
            lastMove: msg.lastMove ?? null,
            whiteName: msg.whiteName ?? 'White',
            whiteRating: msg.whiteRating,
            whiteTitle: msg.whiteTitle,
            whiteAvatarUrl: msg.whiteAvatarUrl,
            whiteFlag: msg.whiteFlag,
            blackName: msg.blackName ?? 'Black',
            blackRating: msg.blackRating,
            blackTitle: msg.blackTitle,
            blackAvatarUrl: msg.blackAvatarUrl,
            blackFlag: msg.blackFlag,
            wc: typeof msg.whiteClockMs === 'number' ? msg.whiteClockMs / 1000 : undefined,
            bc: typeof msg.blackClockMs === 'number' ? msg.blackClockMs / 1000 : undefined,
            statusName: msg.winner ? 'finished' : 'live',
            winner: msg.winner === 'w' ? 'white' : msg.winner === 'b' ? 'black' : undefined,
            orientation: 'w',
            spectatorCount: msg.spectatorCount,
          });
        }
      } catch {
        // ignore
      }
    };
    return () => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'unspectate_room' }));
        }
        ws.close();
      } catch {
        // ignore
      }
    };
  }, [selectedRoomId, watchSource]);

  // Stream live game NDJSON-over-SSE for the selected channel
  useEffect(() => {
    if (watchSource !== 'masters' || !activeChannel?.gameId) return;

    const controller = new AbortController();
    setViewPly(null);
    const channelIsBlack = activeChannel.color === 'black';
    setWatchState((prev) => ({
      ...prev,
      gameId: activeChannel.gameId,
      pgn: '',
      whiteName: !channelIsBlack ? activeChannel.user : 'Master (White)',
      whiteRating: !channelIsBlack ? activeChannel.rating : undefined,
      whiteTitle: !channelIsBlack ? activeChannel.title : undefined,
      blackName: channelIsBlack ? activeChannel.user : 'Master (Black)',
      blackRating: channelIsBlack ? activeChannel.rating : undefined,
      blackTitle: channelIsBlack ? activeChannel.title : undefined,
      statusName: 'live',
      winner: undefined,
      orientation: channelIsBlack ? 'b' : 'w',
    }));

    const connect = async () => {
      try {
        const res = await fetch(`/api/lichess/watch/${encodeURIComponent(activeChannel.gameId)}`, {
          signal: controller.signal,
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let historyMoves: string[] = [];
        let trackedChess = new Chess();

        type PlayerEntry = {
          color?: string;
          rating?: number;
          user?: { name?: string; title?: string };
        };

        const extractSide = (
          players: PlayerEntry[] | { white?: PlayerEntry; black?: PlayerEntry } | undefined,
          side: 'white' | 'black',
        ): PlayerEntry | undefined => {
          if (!players) return undefined;
          if (Array.isArray(players)) return players.find((p) => p.color === side);
          return players[side];
        };

        while (!controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            const dataLine = frame
              .split('\n')
              .find((l) => l.startsWith('data:'))
              ?.slice(5)
              .trim();
            if (!dataLine) continue;
            try {
              const ev = JSON.parse(dataLine) as {
                t?: string;
                d?: {
                  fen?: string;
                  lm?: string;
                  wc?: number;
                  bc?: number;
                  players?: PlayerEntry[] | { white?: PlayerEntry; black?: PlayerEntry };
                  status?: { name?: string };
                  winner?: string;
                  moves?: string;
                };
              };

              const d = ev.d ?? (ev as unknown as NonNullable<typeof ev.d>);
              if (!d) continue;

              const white = extractSide(d.players, 'white');
              const black = extractSide(d.players, 'black');
              const lm =
                d.lm && d.lm.length >= 4
                  ? { from: d.lm.slice(0, 2), to: d.lm.slice(2, 4) }
                  : null;

              if (typeof d.moves === 'string' && d.moves.trim()) {
                historyMoves = d.moves.trim().split(/\s+/);
              }

              let computedPgn: string | undefined;
              if (historyMoves.length > 0) {
                computedPgn = parseUciMovesToGameState(historyMoves.join(' ')).pgn;
              } else if (d.fen) {
                if (d.lm && d.lm.length >= 4) {
                  try {
                    const promo = d.lm.length > 4 ? d.lm[4] : 'q';
                    const testMove = trackedChess.move({
                      from: d.lm.slice(0, 2),
                      to: d.lm.slice(2, 4),
                      promotion: promo,
                    });
                    if (testMove && trackedChess.fen().split(' ')[0] === d.fen.split(' ')[0]) {
                      computedPgn = trackedChess.pgn();
                    } else {
                      trackedChess = new Chess(d.fen);
                      computedPgn = `[SetUp "1"]\n[FEN "${d.fen}"]\n\n*`;
                    }
                  } catch {
                    try {
                      trackedChess = new Chess(d.fen);
                      computedPgn = `[SetUp "1"]\n[FEN "${d.fen}"]\n\n*`;
                    } catch {
                      // ignore malformed fen
                    }
                  }
                } else {
                  try {
                    trackedChess = new Chess(d.fen);
                  } catch {
                    // ignore
                  }
                }
              }

              setWatchState((prev) => ({
                ...prev,
                fen: d.fen ?? prev.fen,
                pgn: computedPgn ?? prev.pgn,
                lastMove: lm ?? prev.lastMove,
                whiteName: white?.user?.name ?? prev.whiteName,
                whiteRating: white?.rating ?? prev.whiteRating,
                whiteTitle: white?.user?.title ?? prev.whiteTitle,
                blackName: black?.user?.name ?? prev.blackName,
                blackRating: black?.rating ?? prev.blackRating,
                blackTitle: black?.user?.title ?? prev.blackTitle,
                wc: d.wc ?? prev.wc,
                bc: d.bc ?? prev.bc,
                statusName: d.status?.name ?? prev.statusName,
                winner: d.winner ?? prev.winner,
              }));
            } catch {
              // ignore frame parse error
            }
          }
        }
      } catch {
        // aborted on channel switch or unmount
      }
    };

    void connect();
    return () => controller.abort();
  }, [
    watchSource,
    activeChannel?.channel,
    activeChannel?.color,
    activeChannel?.gameId,
    activeChannel?.rating,
    activeChannel?.title,
    activeChannel?.user,
  ]);

  const displayedEval = useMemo(() => {
    try {
      return evaluatePosition(new Chess(watchState.fen));
    } catch {
      return 0;
    }
  }, [watchState.fen]);

  const effectiveOrientation: Color = flipped
    ? watchState.orientation === 'w'
      ? 'b'
      : 'w'
    : watchState.orientation;

  const handleLookupGames = async () => {
    const clean = lookupUser.trim();
    if (!clean) return;
    setGamesLoading(true);
    setGamesError(null);
    try {
      const res = await fetch(`/api/lichess/games/${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load player games.');
      setUserGames((data.games as LichessUserGame[]) ?? []);
    } catch (err: unknown) {
      setGamesError(err instanceof Error ? err.message : 'Unable to fetch online games.');
    } finally {
      setGamesLoading(false);
    }
  };

  const topIsBlack = effectiveOrientation === 'w';
  const topName = topIsBlack ? watchState.blackName : watchState.whiteName;
  const topRating = topIsBlack ? watchState.blackRating : watchState.whiteRating;
  const topTitle = topIsBlack ? watchState.blackTitle : watchState.whiteTitle;
  const topAvatar = topIsBlack ? watchState.blackAvatarUrl : watchState.whiteAvatarUrl;
  const topFlag = countryCodeToFlagEmoji(topIsBlack ? watchState.blackFlag : watchState.whiteFlag);
  const topSec = topIsBlack ? watchState.bc : watchState.wc;

  const bottomName = topIsBlack ? watchState.whiteName : watchState.blackName;
  const bottomRating = topIsBlack ? watchState.whiteRating : watchState.blackRating;
  const bottomTitle = topIsBlack ? watchState.whiteTitle : watchState.blackTitle;
  const bottomAvatar = topIsBlack ? watchState.whiteAvatarUrl : watchState.blackAvatarUrl;
  const bottomFlag = countryCodeToFlagEmoji(topIsBlack ? watchState.whiteFlag : watchState.blackFlag);
  const bottomSec = topIsBlack ? watchState.wc : watchState.bc;

  return (
    <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_370px] gap-4 lg:gap-5 pb-20 lg:pb-6 items-start">
      {/* Left/Center Live Broadcast Board */}
      <div className="flex justify-center">
        <div className="w-full max-w-[min(540px,100vw)] space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Binoculars className="w-5 h-5 text-[#81B64C]" />
              <h1 className="text-base sm:text-lg font-extrabold text-white font-display">
                Watch Live
              </h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#81B64C]">
                <Radio className="w-3 h-3" />
                <span>{watchSource === 'openchess' ? 'OpenChess Rooms' : 'Masters TV'}</span>
              </span>
              {watchSource === 'openchess' && typeof watchState.spectatorCount === 'number' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#262421] text-[10px] font-bold text-[#DEDAD2]">
                  <Eye className="w-3 h-3 text-[#7FC4ED]" />
                  <span>{watchState.spectatorCount}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFlipped((f) => !f)}
                className="px-2.5 py-1.5 rounded-lg bg-[#393734] hover:bg-[#43403C] text-xs font-semibold text-white flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Flip</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  void loadChannels();
                  void loadActiveRooms();
                }}
                disabled={tvLoading}
                className="px-2.5 py-1.5 rounded-lg bg-[#393734] hover:bg-[#43403C] text-xs font-semibold text-white flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${tvLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Source Switcher: OpenChess Live Rooms | Masters TV */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#21201D] border border-white/10">
            <button
              type="button"
              onClick={() => setWatchSource('openchess')}
              className={`min-h-[36px] rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                watchSource === 'openchess'
                  ? 'bg-[#81B64C] text-[#191815]'
                  : 'text-[#C8C4BC] hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>OpenChess Live ({activeRooms.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setWatchSource('masters')}
              className={`min-h-[36px] rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                watchSource === 'masters'
                  ? 'bg-[#81B64C] text-[#191815]'
                  : 'text-[#C8C4BC] hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Masters TV</span>
            </button>
          </div>

          {/* Channel or Active Room Selector */}
          {watchSource === 'masters' ? (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {channels.map((ch) => (
                <button
                  key={ch.channel}
                  type="button"
                  onClick={() => setSelectedChannel(ch.channel)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border cursor-pointer transition-colors ${
                    activeChannel?.channel === ch.channel
                      ? 'bg-[#393734] border-[#81B64C] text-white'
                      : 'bg-[#21201D] border-white/10 text-[#9E998F] hover:text-white'
                  }`}
                >
                  {ch.label}
                </button>
              ))}
            </div>
          ) : activeRooms.length === 0 ? (
            <div className="p-3 rounded-xl bg-[#21201D] border border-white/10 text-xs text-[#9E998F] text-center">
              No live OpenChess rooms active right now. Start an online match or switch to Masters TV!
            </div>
          ) : (
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {activeRooms.map((rm) => (
                <button
                  key={rm.roomId}
                  type="button"
                  onClick={() => setSelectedRoomId(rm.roomId)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap border cursor-pointer transition-colors ${
                    selectedRoomId === rm.roomId
                      ? 'bg-[#393734] border-[#81B64C] text-white'
                      : 'bg-[#21201D] border-white/10 text-[#9E998F] hover:text-white'
                  }`}
                >
                  {rm.whiteName} vs {rm.blackName} · {rm.clockLabel}
                </button>
              ))}
            </div>
          )}

          {watchSource === 'masters' && tvError && (
            <div className="p-2.5 rounded-lg bg-[#5C2320]/60 border border-[#E06C5A]/40 text-xs text-[#F7C7C1]">
              {tvError}
            </div>
          )}

          {/* Top Player Bar */}
          <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#21201D] border border-white/8">
            <button
              type="button"
              onClick={() => onOpenPlayerProfile?.(topName)}
              className="flex items-center gap-2 min-w-0 text-left cursor-pointer hover:opacity-90"
            >
              <PlayerAvatar
                username={topName}
                avatarUrl={topAvatar}
                size={24}
                rounded="rounded-md"
              />
              {topTitle && (
                <span className="px-1.5 py-0.5 rounded bg-[#E59A28]/20 text-[10px] font-extrabold text-[#F7C045]">
                  {topTitle}
                </span>
              )}
              <span className="text-sm font-bold text-white truncate hover:underline">{topName}</span>
              {topFlag && <span className="text-sm leading-none">{topFlag}</span>}
              {topRating && (
                <span className="font-mono text-xs text-[#9E998F] tabular-nums">({topRating})</span>
              )}
            </button>
            <div className="px-2.5 py-1 rounded bg-[#262421] font-mono text-xs font-bold text-[#DEDAD2] tabular-nums flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#9E998F]" />
              <span>{fmtSec(topSec)}</span>
            </div>
          </div>

          {/* Board */}
          <div className="-mx-2.5 sm:mx-0 flex items-stretch gap-1 sm:gap-2.5">
            <EvaluationBar evalCp={displayedEval} orientation={effectiveOrientation} />
            <div className="flex-1 min-w-0">
              <ChessBoard
                fen={watchState.fen}
                orientation={effectiveOrientation}
                interactive={false}
                lastMove={watchState.lastMove}
                theme={boardTheme}
                onMove={() => false}
              />
            </div>
          </div>

          {/* Bottom Player Bar */}
          <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-[#21201D] border border-white/8">
            <button
              type="button"
              onClick={() => onOpenPlayerProfile?.(bottomName)}
              className="flex items-center gap-2 min-w-0 text-left cursor-pointer hover:opacity-90"
            >
              <PlayerAvatar
                username={bottomName}
                avatarUrl={bottomAvatar}
                size={24}
                rounded="rounded-md"
              />
              {bottomTitle && (
                <span className="px-1.5 py-0.5 rounded bg-[#E59A28]/20 text-[10px] font-extrabold text-[#F7C045]">
                  {bottomTitle}
                </span>
              )}
              <span className="text-sm font-bold text-white truncate hover:underline">{bottomName}</span>
              {bottomFlag && <span className="text-sm leading-none">{bottomFlag}</span>}
              {bottomRating && (
                <span className="font-mono text-xs text-[#9E998F] tabular-nums">
                  ({bottomRating})
                </span>
              )}
            </button>
            <div className="px-2.5 py-1 rounded bg-[#262421] font-mono text-xs font-bold text-[#DEDAD2] tabular-nums flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#9E998F]" />
              <span>{fmtSec(bottomSec)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="text-xs text-[#9E998F]">
              {watchState.winner
                ? `Result: ${watchState.winner === 'white' ? 'White won' : 'Black won'}`
                : 'Streaming live grandmaster games'}
            </div>
            {watchState.pgn && (
              <button
                type="button"
                onClick={() =>
                  onSendToReview(
                    watchState.pgn,
                    effectiveOrientation,
                    watchState.winner === 'white'
                      ? '1-0'
                      : watchState.winner === 'black'
                        ? '0-1'
                        : '*',
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-[#191815] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <SearchCheck className="w-3.5 h-3.5" />
                <span>Analyze in Review</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Live Player Game Lookup -> Game Review */}
      <aside className="bg-[#21201D] border border-white/10 rounded-xl p-4 space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-extrabold text-white font-display">
            Player Games Explorer
          </h2>
          <p className="text-xs text-[#9E998F]">
            Look up any online player to inspect recent games and run instant Game Review.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleLookupGames();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={lookupUser}
            onChange={(e) => setLookupUser(e.target.value)}
            placeholder="Player username (e.g. DrNykterstein)"
            aria-label="Player username"
            className="flex-1 bg-[#1A1917] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C]"
          />
          <button
            type="submit"
            disabled={gamesLoading || !lookupUser.trim()}
            className="px-3.5 py-2 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-[#191815] font-bold text-xs flex items-center gap-1 cursor-pointer disabled:opacity-45"
          >
            <Search className="w-3.5 h-3.5" />
            <span>{gamesLoading ? 'Loading...' : 'Find'}</span>
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {['DrNykterstein', 'penguingim1', 'nihalsarin2004'].map((presetName) => (
            <button
              key={presetName}
              type="button"
              onClick={() => {
                setLookupUser(presetName);
              }}
              className="px-2 py-1 rounded bg-[#2B2926] hover:bg-[#383530] text-[11px] font-medium text-[#C8C4BC] cursor-pointer"
            >
              {presetName}
            </button>
          ))}
        </div>

        {gamesError && (
          <div className="p-2.5 rounded-lg bg-[#5C2320]/60 border border-[#E06C5A]/40 text-xs text-[#F7C7C1]">
            {gamesError}
          </div>
        )}

        <div className="space-y-2 max-h-[380px] overflow-y-auto">
          {userGames.length === 0 && !gamesLoading ? (
            <div className="py-8 text-center text-xs text-[#8E8980]">
              Enter a player username above or tap a Grandmaster handle to load real online PGNs.
            </div>
          ) : (
            userGames.map((g) => (
              <div
                key={g.id}
                className="p-3 rounded-lg bg-[#1A1917] border border-white/8 space-y-2"
              >
                <div className="flex items-center justify-between text-[11px] text-[#9E998F]">
                  <span className="capitalize font-semibold text-[#C8C4BC]">
                    {g.speed} · {g.rated ? 'Rated' : 'Casual'}
                  </span>
                  <span className="font-mono">
                    {g.winner ? `${g.winner} won` : g.status}
                  </span>
                </div>
                <div className="text-xs font-semibold text-white space-y-0.5">
                  <button
                    type="button"
                    onClick={() => onOpenPlayerProfile?.(g.white.name)}
                    className="truncate block text-left hover:underline cursor-pointer"
                  >
                    ⚪ {g.white.title ? `${g.white.title} ` : ''}
                    {g.white.name}{' '}
                    {g.white.rating ? (
                      <span className="text-[#9E998F] font-mono">({g.white.rating})</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenPlayerProfile?.(g.black.name)}
                    className="truncate block text-left hover:underline cursor-pointer"
                  >
                    ⚫ {g.black.title ? `${g.black.title} ` : ''}
                    {g.black.name}{' '}
                    {g.black.rating ? (
                      <span className="text-[#9E998F] font-mono">({g.black.rating})</span>
                    ) : null}
                  </button>
                </div>
                {g.opening && (
                  <div className="text-[11px] text-[#8E8980] truncate">{g.opening}</div>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onSendToReview(
                      g.pgn,
                      'w',
                      g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '*',
                    )
                  }
                  className="w-full py-1.5 rounded bg-[#312E2A] hover:bg-[#3E3A35] text-xs font-bold text-[#81B64C] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <SearchCheck className="w-3.5 h-3.5" />
                  <span>Review Game</span>
                </button>
              </div>
            ))
          )}
        </div>

        {/* Keep unused icons from being flagged if needed */}
        {viewPly !== null && (
          <div className="hidden">
            <ChevronLeft />
            <ChevronRight />
          </div>
        )}
      </aside>
    </div>
  );
}
