import { useCallback, useEffect, useState } from 'react';
import {
  Clock,
  Crown,
  Puzzle,
  RefreshCw,
  Rocket,
  Search,
  Trophy,
  Zap,
} from 'lucide-react';
import { countryCodeToFlagEmoji } from '../chess/analytics';
import { LEAGUE_TIERS, type LeagueStatus, type LeagueTier } from '../chess/onlineHelpers';
import type { LichessSession } from '../chess/useLichessAuth';
import { PlayerAvatar } from './PlayerAvatar';

type LeaderboardCategory = 'rapid' | 'blitz' | 'bullet' | 'puzzle' | 'league';

interface LeaderboardEntry {
  rank: number;
  username: string;
  title?: string;
  flag?: string;
  avatarUrl?: string;
  online: boolean;
  rating: number;
  leaguePoints: number;
  league: LeagueStatus;
  games: number;
}

interface LeaderboardViewProps {
  lichessSession: LichessSession | null;
  onOpenPlayerProfile?: (username: string) => void;
}

const CATEGORY_TABS: Array<{
  id: LeaderboardCategory;
  label: string;
  icon: typeof Clock;
  color: string;
}> = [
  { id: 'rapid', label: 'Rapid', icon: Clock, color: 'text-[#81B64C]' },
  { id: 'blitz', label: 'Blitz', icon: Zap, color: 'text-[#F7C045]' },
  { id: 'bullet', label: 'Bullet', icon: Rocket, color: 'text-[#E59A28]' },
  { id: 'puzzle', label: 'Puzzles', icon: Puzzle, color: 'text-[#E06C5A]' },
  { id: 'league', label: 'Players League', icon: Trophy, color: 'text-[#56C2F6]' },
];

export function LeaderboardView({
  lichessSession,
  onOpenPlayerProfile,
}: LeaderboardViewProps) {
  const [category, setCategory] = useState<LeaderboardCategory>('rapid');
  const [selectedLeagueTier, setSelectedLeagueTier] = useState<LeagueTier | 'ALL'>('ALL');
  const [players, setPlayers] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    document.body.dataset.state = 'leaderboard';
  }, []);

  const loadBoard = useCallback(async (cat: LeaderboardCategory) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?category=${encodeURIComponent(cat)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { players?: LeaderboardEntry[] };
      if (Array.isArray(data.players)) {
        setPlayers(data.players);
      }
    } catch {
      // ignore network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard(category);
  }, [category, loadBoard]);

  const query = search.trim().toLowerCase();
  const filtered = players.filter((p) => {
    if (query && !p.username.toLowerCase().includes(query)) return false;
    if (category === 'league' && selectedLeagueTier !== 'ALL' && p.league.tier !== selectedLeagueTier) {
      return false;
    }
    return true;
  });

  const topThree = filtered.slice(0, 3);
  const myUsername = lichessSession?.account.username.toLowerCase();

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-24 lg:pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Trophy className="w-6 h-6 text-[#F7C045]" />
          <div>
            <h1 className="text-xl font-extrabold text-white font-display">
              Global Leaderboard & Players League
            </h1>
            <p className="text-xs text-[#9E998F]">
              Live global top players and 8-division Players League standings.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadBoard(category)}
          disabled={loading}
          className="px-3 py-2 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 text-xs font-bold text-[#DEDAD2] flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#81B64C]' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {CATEGORY_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = category === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setCategory(tab.id);
                  if (tab.id !== 'league') setSelectedLeagueTier('ALL');
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border cursor-pointer transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#383530] border-[#81B64C] text-white'
                    : 'bg-[#262421] border-white/10 text-[#9E998F] hover:text-white'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${tab.color}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-56">
          <Search className="w-3.5 h-3.5 text-[#8E8980] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter player..."
            aria-label="Filter leaderboard players"
            className="w-full min-h-[38px] rounded-xl bg-[#262421] border border-white/10 pl-8 pr-3 text-xs text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C]"
          />
        </div>
      </div>

      {/* 8-Tier Players League Progression Banner */}
      {category === 'league' && (
        <div className="rounded-2xl bg-[#262421] border border-white/10 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#56C2F6]">
                Players League Divisions (8 Tiers)
              </div>
              <p className="text-xs text-[#9E998F]">
                Earn Trophies in online games to advance from Wood to Legend: Rapid Win +15 · Blitz Win +9 · Bullet Win +3 · Puzzle +3
              </p>
            </div>
            {selectedLeagueTier !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedLeagueTier('ALL')}
                className="px-2.5 py-1 rounded-lg bg-[#383530] text-[11px] font-bold text-white hover:bg-[#45413B] cursor-pointer"
              >
                Show All Divisions
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {LEAGUE_TIERS.map((div) => {
              const isSelected = selectedLeagueTier === div.tier;
              return (
                <button
                  key={div.tier}
                  type="button"
                  onClick={() =>
                    setSelectedLeagueTier((prev) => (prev === div.tier ? 'ALL' : div.tier))
                  }
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#383530] border-[#81B64C] shadow-sm'
                      : 'bg-[#1C1B18] border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className="text-xs font-extrabold truncate"
                      style={{ color: div.badgeColor }}
                    >
                      {div.tier}
                    </span>
                    <Trophy className="w-3 h-3 shrink-0" style={{ color: div.badgeColor }} />
                  </div>
                  <div className="text-[10px] font-mono text-[#9E998F] mt-1">
                    {div.minPoints}+ pts
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Top-3 Podium */}
      {!loading && topThree.length > 0 && !query && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {topThree.map((entry, idx) => {
            const flag = countryCodeToFlagEmoji(entry.flag);
            const medalColor =
              idx === 0 ? '#F7C045' : idx === 1 ? '#C8C4BC' : '#CD7F32';
            return (
              <button
                key={`podium-${entry.username}`}
                type="button"
                onClick={() => onOpenPlayerProfile?.(entry.username)}
                className="rounded-2xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 p-3.5 flex items-center gap-3 text-left transition-colors cursor-pointer"
              >
                <div className="relative shrink-0">
                  <PlayerAvatar
                    username={entry.username}
                    avatarUrl={entry.avatarUrl}
                    size={48}
                    rounded="rounded-xl"
                  />
                  <span
                    className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-[#191815] shadow"
                    style={{ backgroundColor: medalColor }}
                  >
                    #{entry.rank}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {idx === 0 && <Crown className="w-3.5 h-3.5 text-[#F7C045] shrink-0" />}
                    {entry.title && (
                      <span className="px-1 py-0.5 rounded bg-[#B8860B] text-[9px] font-extrabold text-white shrink-0">
                        {entry.title}
                      </span>
                    )}
                    <span className="text-sm font-extrabold text-white truncate">
                      {entry.username}
                    </span>
                    {flag && <span className="text-xs">{flag}</span>}
                  </div>
                  <div className="text-xs font-mono font-bold text-[#81B64C] mt-0.5">
                    {category === 'league'
                      ? `${entry.leaguePoints} Trophies · ${entry.league.tier}`
                      : `${entry.rating} · ${entry.league.tier}`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Full Ranked Table */}
      <div className="rounded-2xl bg-[#262421] border border-white/10 overflow-hidden divide-y divide-white/[0.06]">
        {loading ? (
          <div className="py-12 text-center text-xs text-[#9E998F]">
            Loading rankings...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#9E998F]">
            No players matched your filter.
          </div>
        ) : (
          filtered.map((entry) => {
            const isSelf = myUsername === entry.username.toLowerCase();
            const flag = countryCodeToFlagEmoji(entry.flag);
            return (
              <button
                key={entry.username}
                type="button"
                onClick={() => onOpenPlayerProfile?.(entry.username)}
                className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                  isSelf ? 'bg-[#81B64C]/12 hover:bg-[#81B64C]/18' : 'hover:bg-[#312E2A]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="w-7 text-xs font-mono font-extrabold text-[#9E998F] tabular-nums shrink-0">
                    #{entry.rank}
                  </span>

                  <div className="relative shrink-0">
                    <PlayerAvatar
                      username={entry.username}
                      avatarUrl={entry.avatarUrl}
                      size={34}
                      rounded="rounded-lg"
                    />
                    {entry.online && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#81B64C] border-2 border-[#262421]" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs sm:text-sm font-extrabold text-white truncate">
                        {entry.username}
                      </span>
                      {flag && <span className="text-xs shrink-0">{flag}</span>}
                      {entry.title && (
                        <span className="px-1 py-0.5 rounded bg-[#B8860B] text-[9px] font-extrabold text-white shrink-0">
                          {entry.title}
                        </span>
                      )}
                      {isSelf && (
                        <span className="px-1.5 py-0.5 rounded bg-[#81B64C]/25 text-[9px] font-extrabold text-[#81B64C]">
                          YOU
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#9E998F]">
                      {entry.games} games · {entry.online ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className="hidden sm:inline-flex px-2 py-0.5 rounded text-[10px] font-extrabold"
                    style={{
                      backgroundColor: `${entry.league.badgeColor}22`,
                      color: entry.league.badgeColor,
                    }}
                  >
                    {entry.league.tier}
                  </span>
                  <div className="text-right font-mono tabular-nums">
                    <div className="text-sm font-extrabold text-white">
                      {category === 'league' ? `${entry.leaguePoints} pts` : entry.rating}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
