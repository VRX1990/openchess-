import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import type { EvaluatedMove } from './engine';
import type { LichessUserGame } from './lichess';

export interface ReviewedGameRecord {
  id: string;
  timestamp: number;
  playerColor: Color;
  playerAccuracy: number;
  openingAccuracy: number | null;
  middlegameAccuracy: number | null;
  endgameAccuracy: number | null;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  bestMoves: number;
  moveCount: number;
}

export interface TrainingDnaSummary {
  gamesAnalyzed: number;
  avgAccuracy: number;
  openingAvg: number;
  middlegameAvg: number;
  endgameAvg: number;
  totalBlunders: number;
  totalMistakes: number;
  weakestPhase: 'Opening' | 'Middlegame' | 'Endgame' | 'Tactics';
  recommendation: string;
  recommendedTab: 'learn' | 'puzzles' | 'review';
}

export interface OpeningMasteryRecord {
  openingId: string;
  drillsCompleted: number;
  memoryClears: number;
  lastPracticed: number;
}

export interface PositionDecodeSummary {
  sideToMove: 'White' | 'Black';
  inCheck: boolean;
  checks: string[];
  captures: string[];
  promotions: string[];
  hangingWhitePieces: string[];
  hangingBlackPieces: string[];
  headline: string;
}

const HISTORY_KEY = 'crownline_match_history';
const MASTERY_KEY = 'crownline_opening_mastery';
const RUSH_BEST_KEY = 'crownline_puzzle_rush_best';

const PIECE_LABELS: Record<PieceSymbol, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

function lossToAccuracy(avgLoss: number): number {
  return Math.max(15, Math.min(99, Math.round(100 * Math.exp(-0.0038 * avgLoss))));
}

export function buildReviewedGameRecord(
  id: string,
  moves: EvaluatedMove[],
  playerColor: Color,
  timestamp = Date.now(),
): ReviewedGameRecord {
  const mine = moves.filter((m) => m.color === playerColor);
  const avgFor = (subset: EvaluatedMove[]): number | null => {
    if (subset.length === 0) return null;
    const sum = subset.reduce((acc, m) => acc + Math.min(m.cpLoss, 500), 0);
    return lossToAccuracy(sum / subset.length);
  };

  const openingMoves = mine.filter((m) => m.moveNumber <= 8);
  const middleMoves = mine.filter((m) => m.moveNumber > 8 && m.moveNumber <= 24);
  const endgameMoves = mine.filter((m) => m.moveNumber > 24);

  return {
    id,
    timestamp,
    playerColor,
    playerAccuracy: avgFor(mine) ?? 100,
    openingAccuracy: avgFor(openingMoves),
    middlegameAccuracy: avgFor(middleMoves),
    endgameAccuracy: avgFor(endgameMoves),
    blunders: mine.filter((m) => m.quality === 'Blunder').length,
    mistakes: mine.filter((m) => m.quality === 'Mistake').length,
    inaccuracies: mine.filter((m) => m.quality === 'Inaccuracy').length,
    bestMoves: mine.filter(
      (m) =>
        m.quality === 'Best' ||
        m.quality === 'Brilliant' ||
        m.quality === 'Great' ||
        m.quality === 'Book',
    ).length,
    moveCount: mine.length,
  };
}

export function summarizeTrainingDna(records: ReviewedGameRecord[]): TrainingDnaSummary {
  if (records.length === 0) {
    return {
      gamesAnalyzed: 0,
      avgAccuracy: 0,
      openingAvg: 0,
      middlegameAvg: 0,
      endgameAvg: 0,
      totalBlunders: 0,
      totalMistakes: 0,
      weakestPhase: 'Tactics',
      recommendation: 'Play or analyze a game to unlock your Aimchess-style Training DNA.',
      recommendedTab: 'puzzles',
    };
  }

  const avg = (vals: Array<number | null>): number => {
    const valid = vals.filter((v): v is number => typeof v === 'number');
    if (valid.length === 0) return 0;
    return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  };

  const avgAccuracy = avg(records.map((r) => r.playerAccuracy));
  const openingAvg = avg(records.map((r) => r.openingAccuracy));
  const middlegameAvg = avg(records.map((r) => r.middlegameAccuracy));
  const endgameAvg = avg(records.map((r) => r.endgameAccuracy));
  const totalBlunders = records.reduce((s, r) => s + r.blunders, 0);
  const totalMistakes = records.reduce((s, r) => s + r.mistakes, 0);

  let weakestPhase: TrainingDnaSummary['weakestPhase'] = 'Tactics';
  let recommendation = 'Sharpen tactical checks & forks in 3-minute Puzzle Rush.';
  let recommendedTab: TrainingDnaSummary['recommendedTab'] = 'puzzles';

  const candidates: Array<{ phase: 'Opening' | 'Middlegame' | 'Endgame'; score: number }> = [];
  if (openingAvg > 0) candidates.push({ phase: 'Opening', score: openingAvg });
  if (middlegameAvg > 0) candidates.push({ phase: 'Middlegame', score: middlegameAvg });
  if (endgameAvg > 0) candidates.push({ phase: 'Endgame', score: endgameAvg });
  candidates.sort((a, b) => a.score - b.score);

  if (totalBlunders >= records.length) {
    weakestPhase = 'Tactics';
    recommendation = `Avg ${totalBlunders} blunder(s) across ${records.length} game(s) — enable Coach Guard & drill Tactical Forks.`;
    recommendedTab = 'puzzles';
  } else if (candidates.length > 0 && candidates[0].phase === 'Opening') {
    weakestPhase = 'Opening';
    recommendation = `Opening accuracy is ${openingAvg}% — run an Opening Memory Drill in Daily Sharping.`;
    recommendedTab = 'learn';
  } else if (candidates.length > 0 && candidates[0].phase === 'Endgame') {
    weakestPhase = 'Endgame';
    recommendation = `Endgame accuracy dips to ${endgameAvg}% — drill Lucena Bridge & K+R Box Mate.`;
    recommendedTab = 'learn';
  } else if (candidates.length > 0) {
    weakestPhase = 'Middlegame';
    recommendation = `Middlegame precision is ${middlegameAvg}% — drill 3-minute Puzzle Rush to spot tactics faster.`;
    recommendedTab = 'puzzles';
  }

  return {
    gamesAnalyzed: records.length,
    avgAccuracy,
    openingAvg,
    middlegameAvg,
    endgameAvg,
    totalBlunders,
    totalMistakes,
    weakestPhase,
    recommendation,
    recommendedTab,
  };
}

export function decodePositionThreats(fen: string): PositionDecodeSummary {
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true });
  const checks = Array.from(new Set(legal.filter((m) => m.san.includes('+')).map((m) => m.san))).slice(0, 6);
  const captures = Array.from(new Set(legal.filter((m) => Boolean(m.captured)).map((m) => m.san))).slice(0, 6);
  const promotions = Array.from(new Set(legal.filter((m) => Boolean(m.promotion)).map((m) => m.san))).slice(0, 4);

  const board = chess.board();
  const hangingWhitePieces: string[] = [];
  const hangingBlackPieces: string[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece || piece.type === 'k' || piece.type === 'p') continue;
      const sq = `${'abcdefgh'[c]}${8 - r}` as Square;
      const attackedByEnemy = chess.isAttacked(sq, piece.color === 'w' ? 'b' : 'w');
      const defendedByAlly = chess.isAttacked(sq, piece.color);
      if (attackedByEnemy && !defendedByAlly) {
        const label = `${PIECE_LABELS[piece.type]} on ${sq}`;
        if (piece.color === 'w') hangingWhitePieces.push(label);
        else hangingBlackPieces.push(label);
      }
    }
  }

  const sideToMove = chess.turn() === 'w' ? 'White' : 'Black';
  let headline = `${sideToMove} to move`;
  if (chess.inCheck()) {
    headline = `${sideToMove} King is in check — respond immediately`;
  } else if (hangingWhitePieces.length > 0 || hangingBlackPieces.length > 0) {
    const targetList = [...hangingWhitePieces, ...hangingBlackPieces].slice(0, 2).join(', ');
    headline = `Undefended piece(s): ${targetList}`;
  } else if (checks.length > 0) {
    headline = `${checks.length} forcing check(s) available (${checks.slice(0, 2).join(', ')})`;
  } else if (captures.length > 0) {
    headline = `Tactical tension: ${captures.slice(0, 3).join(', ')}`;
  } else {
    headline = 'Quiet position — improve your worst-placed piece or fight for the center';
  }

  return {
    sideToMove,
    inCheck: chess.inCheck(),
    checks,
    captures,
    promotions,
    hangingWhitePieces,
    hangingBlackPieces,
    headline,
  };
}

export function loadMatchHistory(): ReviewedGameRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ReviewedGameRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveReviewedGame(record: ReviewedGameRecord): ReviewedGameRecord[] {
  const existing = loadMatchHistory();
  const filtered = existing.filter((r) => r.id !== record.id);
  const next = [record, ...filtered].slice(0, 20);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function loadOpeningMastery(): Record<string, OpeningMasteryRecord> {
  try {
    const raw = localStorage.getItem(MASTERY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, OpeningMasteryRecord>) : {};
  } catch {
    return {};
  }
}

export function recordOpeningDrill(
  openingId: string,
  fromMemory: boolean,
): Record<string, OpeningMasteryRecord> {
  const all = loadOpeningMastery();
  const prev = all[openingId] ?? {
    openingId,
    drillsCompleted: 0,
    memoryClears: 0,
    lastPracticed: 0,
  };
  const next = {
    ...all,
    [openingId]: {
      openingId,
      drillsCompleted: prev.drillsCompleted + 1,
      memoryClears: prev.memoryClears + (fromMemory ? 1 : 0),
      lastPracticed: Date.now(),
    },
  };
  try {
    localStorage.setItem(MASTERY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function loadRushBest(): number {
  try {
    const raw = localStorage.getItem(RUSH_BEST_KEY);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export function saveRushBest(score: number): number {
  const best = Math.max(loadRushBest(), score);
  try {
    localStorage.setItem(RUSH_BEST_KEY, String(best));
  } catch {
    // ignore
  }
  return best;
}

const BEATEN_BOTS_KEY = 'openchess_beaten_bots';

export function loadBeatenBots(): string[] {
  try {
    const raw = localStorage.getItem(BEATEN_BOTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function recordBotWin(botId: string): string[] {
  const prev = loadBeatenBots();
  if (prev.includes(botId)) return prev;
  const next = [...prev, botId];
  try {
    localStorage.setItem(BEATEN_BOTS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export interface PuzzlePlayerStats {
  rating: number;
  streak: number;
  bestStreak: number;
  solvedCount: number;
  attemptCount: number;
  cleanSolves: number;
  lastDelta: number;
}

const PUZZLE_STATS_KEY = 'openchess_puzzle_stats';
const LEGACY_PUZZLE_RATING_KEY = 'crownline_puzzle_rating';
const LEGACY_PUZZLE_STREAK_KEY = 'crownline_puzzle_streak';

export const DEFAULT_PUZZLE_STATS: PuzzlePlayerStats = {
  rating: 1150,
  streak: 0,
  bestStreak: 0,
  solvedCount: 0,
  attemptCount: 0,
  cleanSolves: 0,
  lastDelta: 0,
};

export function calculatePuzzleEloDelta(
  playerRating: number,
  puzzleRating: number,
  solvedCleanly: boolean,
): number {
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - playerRating) / 400));
  const k = 32;
  if (solvedCleanly) {
    return Math.max(4, Math.round(k * (1 - expected)));
  }
  return Math.min(-4, Math.round(k * (0 - expected)));
}

export function getPuzzleAccuracy(stats: PuzzlePlayerStats): number | null {
  if (stats.attemptCount <= 0) return null;
  return Math.round((stats.cleanSolves / stats.attemptCount) * 100);
}

export function recordPuzzleResult(params: {
  stats: PuzzlePlayerStats;
  puzzleRating: number;
  outcome: 'clean-solve' | 'miss' | 'retry-solve';
}): PuzzlePlayerStats {
  const { stats, puzzleRating, outcome } = params;
  if (outcome === 'clean-solve') {
    const delta = calculatePuzzleEloDelta(stats.rating, puzzleRating, true);
    const nextStreak = stats.streak + 1;
    return {
      rating: Math.max(100, stats.rating + delta),
      streak: nextStreak,
      bestStreak: Math.max(stats.bestStreak, nextStreak),
      solvedCount: stats.solvedCount + 1,
      attemptCount: stats.attemptCount + 1,
      cleanSolves: stats.cleanSolves + 1,
      lastDelta: delta,
    };
  }
  if (outcome === 'miss') {
    const delta = calculatePuzzleEloDelta(stats.rating, puzzleRating, false);
    return {
      ...stats,
      rating: Math.max(100, stats.rating + delta),
      streak: 0,
      attemptCount: stats.attemptCount + 1,
      lastDelta: delta,
    };
  }
  return {
    ...stats,
    streak: 0,
    solvedCount: stats.solvedCount + 1,
    lastDelta: 0,
  };
}

export function loadPuzzleStats(): PuzzlePlayerStats {
  try {
    const raw = localStorage.getItem(PUZZLE_STATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PuzzlePlayerStats>;
      return {
        rating: typeof parsed.rating === 'number' && Number.isFinite(parsed.rating) ? parsed.rating : 1150,
        streak: typeof parsed.streak === 'number' && Number.isFinite(parsed.streak) ? parsed.streak : 0,
        bestStreak: typeof parsed.bestStreak === 'number' && Number.isFinite(parsed.bestStreak) ? parsed.bestStreak : 0,
        solvedCount: typeof parsed.solvedCount === 'number' && Number.isFinite(parsed.solvedCount) ? parsed.solvedCount : 0,
        attemptCount: typeof parsed.attemptCount === 'number' && Number.isFinite(parsed.attemptCount) ? parsed.attemptCount : 0,
        cleanSolves: typeof parsed.cleanSolves === 'number' && Number.isFinite(parsed.cleanSolves) ? parsed.cleanSolves : 0,
        lastDelta: typeof parsed.lastDelta === 'number' && Number.isFinite(parsed.lastDelta) ? parsed.lastDelta : 0,
      };
    }
    const legacyRating = Number(localStorage.getItem(LEGACY_PUZZLE_RATING_KEY));
    const legacyStreak = Number(localStorage.getItem(LEGACY_PUZZLE_STREAK_KEY));
    return {
      ...DEFAULT_PUZZLE_STATS,
      rating: Number.isFinite(legacyRating) && legacyRating > 0 ? legacyRating : 1150,
      streak: Number.isFinite(legacyStreak) && legacyStreak >= 0 ? legacyStreak : 0,
      bestStreak: Number.isFinite(legacyStreak) && legacyStreak >= 0 ? legacyStreak : 0,
    };
  } catch {
    return { ...DEFAULT_PUZZLE_STATS };
  }
}

export function savePuzzleStats(stats: PuzzlePlayerStats): void {
  try {
    localStorage.setItem(PUZZLE_STATS_KEY, JSON.stringify(stats));
    localStorage.setItem(LEGACY_PUZZLE_RATING_KEY, String(stats.rating));
    localStorage.setItem(LEGACY_PUZZLE_STREAK_KEY, String(stats.streak));
  } catch {
    // ignore storage quota errors
  }
}

export interface DailyStreakState {
  days: number;
  bestDays: number;
  lastOpenDate: string;
}

const DAILY_STREAK_KEY = 'openchess_daily_streak';

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKeyUtcMs(dateKey: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return Date.UTC(year, month, day);
}

export function recordDailyAppOpen(
  prev: DailyStreakState | null,
  todayKey: string = getLocalDateKey(),
): DailyStreakState {
  if (!prev || !prev.lastOpenDate) {
    return { days: 1, bestDays: 1, lastOpenDate: todayKey };
  }
  if (prev.lastOpenDate === todayKey) {
    return {
      days: Math.max(1, prev.days),
      bestDays: Math.max(1, prev.bestDays, prev.days),
      lastOpenDate: todayKey,
    };
  }

  const prevMs = parseDateKeyUtcMs(prev.lastOpenDate);
  const todayMs = parseDateKeyUtcMs(todayKey);
  const dayMs = 24 * 60 * 60 * 1000;

  if (prevMs !== null && todayMs !== null) {
    const diffDays = Math.round((todayMs - prevMs) / dayMs);
    if (diffDays === 1) {
      const nextDays = Math.max(1, prev.days) + 1;
      return {
        days: nextDays,
        bestDays: Math.max(prev.bestDays, nextDays),
        lastOpenDate: todayKey,
      };
    }
    if (diffDays < 0) {
      return {
        days: Math.max(1, prev.days),
        bestDays: Math.max(1, prev.bestDays, prev.days),
        lastOpenDate: prev.lastOpenDate,
      };
    }
  }

  return {
    days: 1,
    bestDays: Math.max(1, prev.bestDays),
    lastOpenDate: todayKey,
  };
}

export function loadDailyStreak(): DailyStreakState {
  try {
    const raw = localStorage.getItem(DAILY_STREAK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DailyStreakState>;
      if (
        typeof parsed.days === 'number' &&
        Number.isFinite(parsed.days) &&
        typeof parsed.lastOpenDate === 'string'
      ) {
        return {
          days: Math.max(0, parsed.days),
          bestDays:
            typeof parsed.bestDays === 'number' && Number.isFinite(parsed.bestDays)
              ? Math.max(parsed.days, parsed.bestDays)
              : Math.max(0, parsed.days),
          lastOpenDate: parsed.lastOpenDate,
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return { days: 0, bestDays: 0, lastOpenDate: '' };
}

export function touchDailyStreak(todayKey: string = getLocalDateKey()): DailyStreakState {
  const current = loadDailyStreak();
  const next = recordDailyAppOpen(current.lastOpenDate ? current : null, todayKey);
  try {
    localStorage.setItem(DAILY_STREAK_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function calculateUpdatedElo(
  currentRating: number,
  opponentRating: number,
  outcome: 'win' | 'loss' | 'draw',
): number {
  const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
  const expected = 1 / (1 + Math.pow(10, (opponentRating - currentRating) / 400));
  const k = 24;
  return Math.max(100, Math.min(3500, Math.round(currentRating + k * (score - expected))));
}

export interface GuestPerfs {
  rapid: { rating: number; games: number; lastDelta?: number };
  blitz: { rating: number; games: number; lastDelta?: number };
  bullet: { rating: number; games: number; lastDelta?: number };
  puzzle: { rating: number; games: number; lastDelta?: number };
}

const GUEST_PERFS_KEY = 'openchess_guest_perfs';

export const DEFAULT_GUEST_PERFS: GuestPerfs = {
  rapid: { rating: 1200, games: 0, lastDelta: 0 },
  blitz: { rating: 1150, games: 0, lastDelta: 0 },
  bullet: { rating: 1100, games: 0, lastDelta: 0 },
  puzzle: { rating: 1150, games: 0, lastDelta: 0 },
};

export function loadGuestPerfs(): GuestPerfs {
  try {
    const raw = localStorage.getItem(GUEST_PERFS_KEY);
    if (!raw) return { ...DEFAULT_GUEST_PERFS };
    const parsed = JSON.parse(raw) as Partial<GuestPerfs>;
    const norm = (
      entry: { rating?: number; games?: number; lastDelta?: number } | undefined,
      fallback: number,
    ) => ({
      rating:
        typeof entry?.rating === 'number' && Number.isFinite(entry.rating) && entry.rating >= 100
          ? Math.round(entry.rating)
          : fallback,
      games:
        typeof entry?.games === 'number' && Number.isFinite(entry.games) && entry.games >= 0
          ? Math.round(entry.games)
          : 0,
      lastDelta:
        typeof entry?.lastDelta === 'number' && Number.isFinite(entry.lastDelta)
          ? Math.round(entry.lastDelta)
          : 0,
    });
    return {
      rapid: norm(parsed.rapid, 1200),
      blitz: norm(parsed.blitz, 1150),
      bullet: norm(parsed.bullet, 1100),
      puzzle: norm(parsed.puzzle, 1150),
    };
  } catch {
    return { ...DEFAULT_GUEST_PERFS };
  }
}

export function saveGuestPerfs(perfs: GuestPerfs): void {
  try {
    localStorage.setItem(GUEST_PERFS_KEY, JSON.stringify(perfs));
  } catch {
    // ignore storage quota errors
  }
}

const GUEST_NAME_KEY = 'openchess_guest_name';

export function loadGuestPlayerName(): string {
  try {
    if (typeof localStorage === 'undefined') return 'Guest Player';
    const raw = localStorage.getItem(GUEST_NAME_KEY)?.trim();
    return raw && raw.length >= 2 ? raw.slice(0, 26) : 'Guest Player';
  } catch {
    return 'Guest Player';
  }
}

export function saveGuestPlayerName(rawName: string): string {
  const clean = rawName
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 26);
  const finalName = clean.length >= 2 ? clean : 'Guest Player';
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(GUEST_NAME_KEY, finalName);
    }
  } catch {
    // ignore storage quota errors
  }
  return finalName;
}


export function recordGuestMatchResult(params: {
  category: 'rapid' | 'blitz' | 'bullet' | 'puzzle';
  outcome: 'win' | 'loss' | 'draw';
  opponentRating?: number;
}): { perfs: GuestPerfs; oldRating: number; newRating: number; delta: number } {
  const current = loadGuestPerfs();
  const cat = params.category;
  const curPerf = current[cat] ?? DEFAULT_GUEST_PERFS[cat];
  const opp = params.opponentRating && params.opponentRating > 0 ? params.opponentRating : curPerf.rating;
  const nextRating = calculateUpdatedElo(curPerf.rating, opp, params.outcome);
  const delta = nextRating - curPerf.rating;
  const next: GuestPerfs = {
    ...current,
    [cat]: {
      rating: nextRating,
      games: curPerf.games + 1,
      lastDelta: delta,
    },
  };
  saveGuestPerfs(next);
  return { perfs: next, oldRating: curPerf.rating, newRating: nextRating, delta };
}

export function formatLastSeenAgo(seenAtMs?: number, nowMs: number = Date.now()): string {
  if (!seenAtMs || !Number.isFinite(seenAtMs)) return 'Active player';
  const diffSec = Math.max(0, Math.floor((nowMs - seenAtMs) / 1000));
  if (diffSec < 180) return 'Online now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `Online ${mins} ${mins === 1 ? 'min' : 'mins'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Online ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Online ${days} ${days === 1 ? 'day' : 'days'} ago`;
  const months = Math.floor(days / 30);
  return `Online ${months} ${months === 1 ? 'mo' : 'mos'} ago`;
}

export function formatJoinedDate(createdAtMs?: number): string {
  if (!createdAtMs || !Number.isFinite(createdAtMs)) return 'Today';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(createdAtMs));
  } catch {
    return 'Member';
  }
}

export function formatGamePlayedAgo(timestampMs?: number, nowMs: number = Date.now()): string {
  if (!timestampMs || !Number.isFinite(timestampMs)) return '';
  const diffSec = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(new Date(timestampMs));
  } catch {
    return '';
  }
}

export function countryCodeToFlagEmoji(code?: string): string {
  if (!code || typeof code !== 'string') return '';
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(clean)) return '';
  return String.fromCodePoint(
    0x1f1e6 + clean.charCodeAt(0) - 65,
    0x1f1e6 + clean.charCodeAt(1) - 65,
  );
}

export interface SyncedPerfStat {
  rating: number;
  games: number;
  rd?: number;
  prog?: number;
  prov?: boolean;
}

export interface SyncedPerfs {
  rapid: SyncedPerfStat;
  blitz: SyncedPerfStat;
  bullet: SyncedPerfStat;
  puzzle: SyncedPerfStat;
  classical?: SyncedPerfStat;
  correspondence?: SyncedPerfStat;
  storm?: { runs: number; score: number };
  streak?: { runs: number; score: number };
}

export interface SyncedGameCount {
  all: number;
  win: number;
  loss: number;
  draw: number;
  rated?: number;
}

export function mergeSyncedAccountStats(params: {
  localPerfs?: SyncedPerfs;
  remotePerfs?: Partial<SyncedPerfs>;
  localCount?: SyncedGameCount;
  remoteCount?: Partial<SyncedGameCount>;
  authoritativeRemote?: boolean;
}): { perfs: SyncedPerfs; count: SyncedGameCount } {
  const defaults: SyncedPerfs = {
    rapid: { rating: 1500, games: 0 },
    blitz: { rating: 1500, games: 0 },
    bullet: { rating: 1500, games: 0 },
    puzzle: { rating: 1500, games: 0 },
  };
  const baseLocal = params.localPerfs ?? defaults;
  const rPerfs = params.remotePerfs ?? {};

  const pickPerf = (key: 'rapid' | 'blitz' | 'bullet' | 'puzzle'): SyncedPerfStat => {
    const loc = baseLocal[key];
    const rem = rPerfs[key];
    if (!rem) return loc;
    if (params.authoritativeRemote) {
      if (rem.games > 0 || loc.games === 0) return rem;
    }
    if (rem.games >= loc.games && rem.games > 0) return rem;
    return loc;
  };

  const perfs: SyncedPerfs = {
    rapid: pickPerf('rapid'),
    blitz: pickPerf('blitz'),
    bullet: pickPerf('bullet'),
    puzzle: pickPerf('puzzle'),
    classical: rPerfs.classical ?? baseLocal.classical,
    correspondence: rPerfs.correspondence ?? baseLocal.correspondence,
    storm: rPerfs.storm ?? baseLocal.storm,
    streak: rPerfs.streak ?? baseLocal.streak,
  };

  const lCount = params.localCount ?? { all: 0, win: 0, loss: 0, draw: 0 };
  const rCount: SyncedGameCount = {
    all: params.remoteCount?.all ?? 0,
    win: params.remoteCount?.win ?? 0,
    loss: params.remoteCount?.loss ?? 0,
    draw: params.remoteCount?.draw ?? 0,
    rated: params.remoteCount?.rated ?? 0,
  };

  const count: SyncedGameCount =
    lCount.all > rCount.all
      ? {
          all: Math.max(lCount.all, rCount.all),
          win: Math.max(lCount.win, rCount.win),
          loss: Math.max(lCount.loss, rCount.loss),
          draw: Math.max(lCount.draw, rCount.draw),
          rated: Math.max(lCount.rated ?? 0, rCount.rated ?? 0),
        }
      : params.authoritativeRemote || rCount.all >= lCount.all
        ? rCount
        : lCount;

  return { perfs, count };
}

export interface PuzzleHistoryEntry {
  id: string;
  title: string;
  fen: string;
  rating: number;
  motif: string;
  solved: boolean;
  delta: number;
  timestamp: number;
}

const PUZZLE_HISTORY_KEY = 'openchess_puzzle_history';

const DEFAULT_PUZZLE_HISTORY_SEED: PuzzleHistoryEntry[] = [
  {
    id: 'pz-009aK',
    title: 'Royal Fork on c7',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    rating: 1245,
    motif: 'Fork / Double Attack',
    solved: true,
    delta: 14,
    timestamp: Date.now() - 45 * 60 * 1000,
  },
  {
    id: 'pz-047bM',
    title: 'Back-Rank corridor mate',
    fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    rating: 1180,
    motif: 'Back-Rank Mate',
    solved: true,
    delta: 11,
    timestamp: Date.now() - 3 * 3600 * 1000,
  },
  {
    id: 'pz-091xR',
    title: 'Absolute Pin on the e-file',
    fen: 'r1b1kbnr/pppp1ppp/2n5/4q3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 4',
    rating: 1390,
    motif: 'Pin',
    solved: false,
    delta: -12,
    timestamp: Date.now() - 18 * 3600 * 1000,
  },
];

export function loadPuzzleHistory(): PuzzleHistoryEntry[] {
  try {
    const raw = localStorage.getItem(PUZZLE_HISTORY_KEY);
    if (!raw) return DEFAULT_PUZZLE_HISTORY_SEED;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as PuzzleHistoryEntry[];
    }
    return DEFAULT_PUZZLE_HISTORY_SEED;
  } catch {
    return DEFAULT_PUZZLE_HISTORY_SEED;
  }
}

export function recordPuzzleHistoryEntry(entry: PuzzleHistoryEntry): PuzzleHistoryEntry[] {
  const prev = loadPuzzleHistory();
  const next = [entry, ...prev.filter((p) => p.id !== entry.id || Date.now() - p.timestamp > 30000)].slice(0, 40);
  try {
    localStorage.setItem(PUZZLE_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export interface UserAwardBadge {
  id: string;
  title: string;
  subtitle: string;
  unlocked: boolean;
  tone: 'green' | 'amber' | 'orange' | 'blue';
}

export function computeUserAwards(params: {
  streakDays: number;
  puzzleSolved: number;
  puzzleBestStreak: number;
  rushBest: number;
  gamesPlayed: number;
  beatenBotsCount: number;
  lessonsCompleted: number;
}): UserAwardBadge[] {
  return [
    {
      id: 'hot-streak',
      title: 'Hot Streak',
      subtitle: `${Math.max(1, params.streakDays)}-day streak`,
      unlocked: params.streakDays >= 2,
      tone: 'orange',
    },
    {
      id: 'puzzle-25',
      title: `Puzzle ${params.puzzleSolved >= 25 ? '25' : Math.max(5, params.puzzleSolved)}`,
      subtitle: `${params.puzzleSolved} solved`,
      unlocked: params.puzzleSolved >= 5,
      tone: 'amber',
    },
    {
      id: 'study-scholar',
      title: 'Scholar',
      subtitle: `${params.lessonsCompleted} lessons`,
      unlocked: params.lessonsCompleted >= 1,
      tone: 'green',
    },
    {
      id: 'bot-slayer',
      title: 'Bot Hunter',
      subtitle: `${params.beatenBotsCount} bots beaten`,
      unlocked: params.beatenBotsCount >= 1,
      tone: 'blue',
    },
    {
      id: 'rush-sprinter',
      title: 'Speed Solver',
      subtitle: params.rushBest > 0 ? `Rush ${params.rushBest}` : 'Try Puzzle Rush',
      unlocked: params.rushBest >= 5 || params.puzzleBestStreak >= 5,
      tone: 'amber',
    },
    {
      id: 'veteran',
      title: 'Competitor',
      subtitle: `${params.gamesPlayed} games played`,
      unlocked: params.gamesPlayed >= 1,
      tone: 'green',
    },
  ];
}

export function shouldConfirmLeaveGame(params: {
  activeTab: string;
  isOnlineMode: boolean;
  isGameOver: boolean;
  moveCount: number;
}): boolean {
  if (params.activeTab !== 'play') return false;
  if (params.isGameOver) return false;
  return params.isOnlineMode || params.moveCount > 0;
}

export interface StreakDayCell {
  dateKey: string;
  dayLetter: string;
  checked: boolean;
  isToday: boolean;
}

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

export function buildStreakWeekStrip(
  streakDays: number,
  todayKey: string = getLocalDateKey(),
): StreakDayCell[] {
  const activeCount = Math.max(1, Math.min(5, Math.floor(streakDays) || 1));
  const baseMs = parseDateKeyUtcMs(todayKey) ?? Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  // Active streak days end on today (index activeCount - 1), followed by upcoming days
  const startOffset = -(activeCount - 1);
  const cells: StreakDayCell[] = [];

  for (let i = 0; i < 5; i++) {
    const offset = startOffset + i;
    const d = new Date(baseMs + offset * dayMs);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const dow = d.getUTCDay();
    cells.push({
      dateKey: `${y}-${m}-${day}`,
      dayLetter: WEEKDAY_LETTERS[dow] ?? 'M',
      checked: i < activeCount,
      isToday: offset === 0,
    });
  }

  return cells;
}

const PLAYED_GAMES_KEY = 'openchess_played_games';

export function hasPlayableMovesInPgn(pgn?: string): boolean {
  if (!pgn || typeof pgn !== 'string') return false;
  const moveSection = pgn
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, ' ')
    .trim();
  if (!moveSection) return false;
  return /\b1\.\s*[a-hNBRQKO]/.test(moveSection) || /[a-h1-8]{2,}/.test(moveSection);
}

function canonicalGameMergeKey(id: string): string {
  const roomMatch = /^(?:ws|oc)-([A-Z0-9]{4,8})-/i.exec(id.trim());
  if (roomMatch) {
    return `room:${roomMatch[1].toUpperCase()}`;
  }
  return id;
}

export function mergeSyncedGames(...lists: LichessUserGame[][]): LichessUserGame[] {
  const byId = new Map<string, LichessUserGame>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      if (!raw || typeof raw !== 'object' || !raw.id || !raw.pgn) continue;
      if (raw.status === 'aborted' || !hasPlayableMovesInPgn(raw.pgn)) continue;
      const key = canonicalGameMergeKey(raw.id);
      const existing = byId.get(key);
      if (!existing) {
        byId.set(key, raw);
      } else {
        const existingTs = existing.lastMoveAt ?? existing.createdAt ?? 0;
        const nextTs = raw.lastMoveAt ?? raw.createdAt ?? 0;
        const preferRawId = raw.id.startsWith('oc-') && !existing.id.startsWith('oc-');
        byId.set(key, {
          ...existing,
          ...raw,
          id: preferRawId ? raw.id : existing.id,
          rated: Boolean(raw.rated || existing.rated),
          opening: raw.opening || existing.opening,
          pgn: raw.pgn.length >= existing.pgn.length ? raw.pgn : existing.pgn,
          white: {
            name: raw.white?.name || existing.white?.name || 'White',
            rating: raw.white?.rating ?? existing.white?.rating,
            title: raw.white?.title ?? existing.white?.title,
            avatarUrl: raw.white?.avatarUrl ?? existing.white?.avatarUrl,
            flag: raw.white?.flag ?? existing.white?.flag,
          },
          black: {
            name: raw.black?.name || existing.black?.name || 'Black',
            rating: raw.black?.rating ?? existing.black?.rating,
            title: raw.black?.title ?? existing.black?.title,
            avatarUrl: raw.black?.avatarUrl ?? existing.black?.avatarUrl,
            flag: raw.black?.flag ?? existing.black?.flag,
          },
          lastMoveAt: Math.max(existingTs, nextTs) || undefined,
        });
      }
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => (b.lastMoveAt ?? b.createdAt ?? 0) - (a.lastMoveAt ?? a.createdAt ?? 0),
  );
}

export function loadPlayedGames(): LichessUserGame[] {
  try {
    const raw = localStorage.getItem(PLAYED_GAMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? mergeSyncedGames(parsed as LichessUserGame[]) : [];
  } catch {
    return [];
  }
}

export function savePlayedGame(game: LichessUserGame): LichessUserGame[] {
  const merged = mergeSyncedGames([game], loadPlayedGames()).slice(0, 40);
  try {
    localStorage.setItem(PLAYED_GAMES_KEY, JSON.stringify(merged));
  } catch {
    // ignore storage quota errors
  }
  return merged;
}

export function isGamePlayedAsBlack(
  game: Pick<LichessUserGame, 'white' | 'black'>,
  username?: string | null,
): boolean {
  const lowerUser = username?.trim().toLowerCase() ?? '';
  const whiteLower = game.white?.name?.trim().toLowerCase() ?? '';
  const blackLower = game.black?.name?.trim().toLowerCase() ?? '';
  if (lowerUser) {
    if (blackLower === lowerUser) return true;
    if (whiteLower === lowerUser) return false;
  }
  if (blackLower === 'you' && whiteLower !== 'you') return true;
  return false;
}

export function mergePuzzleSyncStats(
  local: PuzzlePlayerStats,
  sync: {
    syncedPuzzleRating?: number;
    syncedStreakHigh?: number;
    prevSyncedPuzzleRating?: number;
    authoritative?: boolean;
  },
): PuzzlePlayerStats {
  const hasValidRemote =
    typeof sync.syncedPuzzleRating === 'number' &&
    Number.isFinite(sync.syncedPuzzleRating) &&
    sync.syncedPuzzleRating > 0;
  const remoteChangedSinceLastSync =
    hasValidRemote &&
    typeof sync.prevSyncedPuzzleRating === 'number' &&
    Number.isFinite(sync.prevSyncedPuzzleRating) &&
    sync.syncedPuzzleRating !== sync.prevSyncedPuzzleRating;

  const nextRating =
    hasValidRemote &&
    (sync.authoritative ||
      local.attemptCount === 0 ||
      local.rating === DEFAULT_PUZZLE_STATS.rating ||
      remoteChangedSinceLastSync)
      ? (sync.syncedPuzzleRating as number)
      : local.rating;

  const nextBestStreak = Math.max(
    local.bestStreak,
    typeof sync.syncedStreakHigh === 'number' && Number.isFinite(sync.syncedStreakHigh)
      ? sync.syncedStreakHigh
      : 0,
  );

  if (nextRating === local.rating && nextBestStreak === local.bestStreak) {
    return local;
  }

  return {
    ...local,
    rating: nextRating,
    bestStreak: nextBestStreak,
  };
}

export function enrichGamePgnWithHeaders(game: LichessUserGame): string {
  const raw = (game.pgn || '').trim();
  if (!raw) return '';
  const resLabel =
    game.winner === 'white'
      ? '1-0'
      : game.winner === 'black'
        ? '0-1'
        : game.status === 'draw' || game.status === 'stalemate'
          ? '1/2-1/2'
          : '*';

  const headers: string[] = [];
  if (!/\[White\s+"/i.test(raw) && game.white?.name) {
    headers.push(`[White "${game.white.name.replace(/"/g, '')}"]`);
  }
  if (!/\[Black\s+"/i.test(raw) && game.black?.name) {
    headers.push(`[Black "${game.black.name.replace(/"/g, '')}"]`);
  }
  if (!/\[WhiteElo\s+"/i.test(raw) && typeof game.white?.rating === 'number') {
    headers.push(`[WhiteElo "${game.white.rating}"]`);
  }
  if (!/\[BlackElo\s+"/i.test(raw) && typeof game.black?.rating === 'number') {
    headers.push(`[BlackElo "${game.black.rating}"]`);
  }
  if (!/\[Opening\s+"/i.test(raw) && game.opening) {
    headers.push(`[Opening "${game.opening.replace(/"/g, '')}"]`);
  }
  if (!/\[Speed\s+"/i.test(raw) && game.speed) {
    headers.push(`[Speed "${game.speed.replace(/"/g, '')}"]`);
  }
  if (!/\[Result\s+"/i.test(raw)) {
    headers.push(`[Result "${resLabel}"]`);
  }

  if (headers.length === 0) return raw;
  return `${headers.join('\n')}\n\n${raw}`;
}

export const FEATURED_MASTER_GAMES: LichessUserGame[] = [
  {
    id: 'feat-carlsen-hikaru-1',
    rated: true,
    speed: 'blitz',
    status: 'mate',
    winner: 'white',
    opening: 'Ruy Lopez: Berlin Defense, Rio Gambit Accepted',
    white: { name: 'DrNykterstein', rating: 3294, title: 'GM', flag: 'NO' },
    black: { name: 'Hikaru', rating: 3268, title: 'GM', flag: 'US' },
    pgn: `[White "DrNykterstein"]\n[Black "Hikaru"]\n[WhiteElo "3294"]\n[BlackElo "3268"]\n[Opening "Ruy Lopez: Berlin Defense"]\n[Speed "blitz"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 Nf6 4. O-O Nxe4 5. d4 Nd6 6. Bxc6 dxc6 7. dxe5 Nf5 8. Qxd8+ Kxd8 9. h3 Bd7 10. Nc3 h6 11. b3 Kc8 12. Bb2 b6 13. Rad1 Ne7 14. Nd4 c5 15. Nde2 Ng6 16. Nd5 Bc6 17. c4 Kb7 18. f4 Ne7 19. Nec3 Nf5 20. Kf2 h5 21. Ne4 Rd8 22. Ng5 Rd7 23. e6 fxe6 24. Nxe6 Bd6 25. Nxg7 Nxg7 26. Bxg7 Rxg7 27. Nxd6+ cxd6 28. Rxd6 Rxg2+ 29. Ke3 Re8+ 30. Kd3 Rg3+ 31. Kc2 Re2+ 32. Rd2 Be4+ 33. Kc1 Rc3+ 34. Kd1 Bf3 35. Rxe2 Rd3+ 36. Ke1 Bxe2 37. Kxe2 Rxh3 38. f5 1-0`,
    createdAt: Date.now() - 18 * 60 * 1000,
    lastMoveAt: Date.now() - 18 * 60 * 1000,
  },
  {
    id: 'feat-firouzja-naroditsky-2',
    rated: true,
    speed: 'bullet',
    status: 'resign',
    winner: 'white',
    opening: 'Sicilian Defense: Najdorf Variation, English Attack',
    white: { name: 'Firouzja2003', rating: 3245, title: 'GM', flag: 'FR' },
    black: { name: 'RebeccaHarris', rating: 3150, title: 'GM', flag: 'US' },
    pgn: `[White "Firouzja2003"]\n[Black "RebeccaHarris"]\n[WhiteElo "3245"]\n[BlackElo "3150"]\n[Opening "Sicilian Defense: Najdorf Variation"]\n[Speed "bullet"]\n[Result "1-0"]\n\n1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 h5 9. Qd2 Nbd7 10. O-O-O Rc8 11. Kb1 Be7 12. Nd5 Nxd5 13. exd5 Bf5 14. Bd3 Bxd3 15. Qxd3 O-O 16. Rhg1 f5 17. g4 hxg4 18. fxg4 e4 19. Qe2 f4 20. Bd4 f3 21. Qxe4 f2 22. Rgf1 Bh4 23. Qg6 Ne5 24. Bxe5 dxe5 25. d6 Rf6 26. Qe4 Rxd6 27. Rxd6 Qxd6 28. Qxb7 Rd8 29. a3 Qd5 30. Qxa6 Qg2 31. Qe2 Qxh2 32. Nc5 Rd4 33. Ne4 Qf4 34. Nxf2 1-0`,
    createdAt: Date.now() - 42 * 60 * 1000,
    lastMoveAt: Date.now() - 42 * 60 * 1000,
  },
  {
    id: 'feat-nihal-penguin-3',
    rated: true,
    speed: 'blitz',
    status: 'resign',
    winner: 'black',
    opening: "Queen's Gambit Declined: Ragozin Defense",
    white: { name: 'Penguingim1', rating: 3110, title: 'GM', flag: 'US' },
    black: { name: 'nihalsarin2004', rating: 3165, title: 'GM', flag: 'IN' },
    pgn: `[White "Penguingim1"]\n[Black "nihalsarin2004"]\n[WhiteElo "3110"]\n[BlackElo "3165"]\n[Opening "Queen's Gambit Declined: Ragozin Defense"]\n[Speed "blitz"]\n[Result "0-1"]\n\n1. d4 Nf6 2. c4 e6 3. Nf3 d5 4. Nc3 Bb4 5. Qa4+ Nc6 6. e3 O-O 7. Bd2 dxc4 8. Bxc4 Bd6 9. Qc2 e5 10. dxe5 Nxe5 11. Nxe5 Bxe5 12. f4 Bd6 13. O-O c6 14. e4 Bc5+ 15. Kh1 Ng4 16. Be1 Ne3 17. Qe2 Bg4 18. Rf3 Bxf3 19. gxf3 Nxc4 20. Qxc4 Qd4 21. Qxd4 Bxd4 22. Rd1 Rfd8 0-1`,
    createdAt: Date.now() - 95 * 60 * 1000,
    lastMoveAt: Date.now() - 95 * 60 * 1000,
  },
  {
    id: 'feat-zhigalko-duda-4',
    rated: true,
    speed: 'rapid',
    status: 'mate',
    winner: 'white',
    opening: 'Italian Game: Giuoco Pianissimo',
    white: { name: 'Zhigalko_Sergei', rating: 3045, title: 'GM', flag: 'BY' },
    black: { name: 'Jovanovic06', rating: 2490, title: 'FM', flag: 'RS' },
    pgn: `[White "Zhigalko_Sergei"]\n[Black "Jovanovic06"]\n[WhiteElo "3045"]\n[BlackElo "2490"]\n[Opening "Italian Game: Giuoco Pianissimo"]\n[Speed "rapid"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O a5 7. Re1 Ba7 8. Na3 O-O 9. Nc2 h6 10. Be3 Bxe3 11. Nxe3 Re8 12. a4 Be6 13. Bxe6 Rxe6 14. Qb3 b6 15. Rad1 Ne7 16. Nh4 d5 17. Nhf5 c6 18. Nxe7+ Rxe7 19. Nf5 Rd7 20. exd5 Rxd5 21. d4 exd4 22. Ne7+ Kh8 23. Nxd5 Qxd5 24. Qxd5 Nxd5 25. Rxd4 1-0`,
    createdAt: Date.now() - 3 * 3600 * 1000,
    lastMoveAt: Date.now() - 3 * 3600 * 1000,
  },
];

export function clearAccountLocalCaches(): void {
  const keys = [
    PLAYED_GAMES_KEY,
    'openchess_puzzle_stats',
    'openchess_puzzle_history',
    'openchess_last_synced_puzzle_rating',
    RUSH_BEST_KEY,
    'openchess_beaten_bots',
    HISTORY_KEY,
    'openchess_friends',
    'openchess_active_coach_id',
  ];
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore storage errors
    }
  }
}

