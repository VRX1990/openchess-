import { Chess, type Color } from 'chess.js';
import type { LichessUserGame } from './lichess';
import { FEATURED_MASTER_GAMES } from './analytics';

export type ExplorerDatabase = 'masters' | 'community' | 'my-games';

export type ExplorerSpeed = 'bullet' | 'blitz' | 'rapid' | 'classical';

export interface ExplorerFilterConfig {
  database: ExplorerDatabase;
  speeds: ExplorerSpeed[];
  minRating: number;
  maxRating: number;
  sinceYear: string;
  untilYear: string;
}

export const DEFAULT_EXPLORER_FILTER: ExplorerFilterConfig = {
  database: 'masters',
  speeds: ['rapid', 'blitz'],
  minRating: 1800,
  maxRating: 2500,
  sinceYear: '',
  untilYear: '',
};

export interface ExplorerMoveStat {
  uci: string;
  san: string;
  from: string;
  to: string;
  white: number;
  draws: number;
  black: number;
  totalGames: number;
  averageRating?: number;
  openingEco?: string;
  openingName?: string;
}

export interface ExplorerTopGame {
  id: string;
  whiteName: string;
  whiteRating?: number;
  blackName: string;
  blackRating?: number;
  winner: 'white' | 'black' | 'draw';
  year?: number;
  month?: string;
  pgn?: string;
}

export interface ExplorerOpeningInfo {
  eco: string;
  name: string;
}

export interface ExplorerPositionData {
  fen: string;
  database: ExplorerDatabase;
  source: 'live-database' | 'my-games' | 'curated-book';
  opening: ExplorerOpeningInfo;
  white: number;
  draws: number;
  black: number;
  totalGames: number;
  moves: ExplorerMoveStat[];
  topGames: ExplorerTopGame[];
}

export interface WinDrawLossPct {
  whitePct: number;
  drawPct: number;
  blackPct: number;
}

/**
 * Extracts the 4-field position key (piece placement, turn, castling, ep)
 * so transpositions with different halfmove/fullmove clocks match reliably.
 */
export function normalizeFenKey(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  return parts.slice(0, 4).join(' ');
}

/**
 * Computes integer White / Draw / Black percentages summing to 100
 * (using largest-remainder rounding so bars never exceed or underfill 100%).
 */
export function computeWinDrawLossPct(
  white: number,
  draws: number,
  black: number,
): WinDrawLossPct {
  const w = Math.max(0, Number.isFinite(white) ? white : 0);
  const d = Math.max(0, Number.isFinite(draws) ? draws : 0);
  const b = Math.max(0, Number.isFinite(black) ? black : 0);
  const total = w + d + b;
  if (total <= 0) {
    return { whitePct: 0, drawPct: 0, blackPct: 0 };
  }

  const raw = [
    { key: 'w' as const, exact: (w / total) * 100 },
    { key: 'd' as const, exact: (d / total) * 100 },
    { key: 'b' as const, exact: (b / total) * 100 },
  ];

  const floors = raw.map((item) => ({
    key: item.key,
    floor: Math.floor(item.exact),
    rem: item.exact - Math.floor(item.exact),
  }));

  let remainder = 100 - floors.reduce((sum, x) => sum + x.floor, 0);
  const sortedByRem = [...floors].sort((a, bItem) => bItem.rem - a.rem);
  for (let i = 0; i < sortedByRem.length && remainder > 0; i++) {
    sortedByRem[i].floor += 1;
    remainder -= 1;
  }

  const map = new Map(floors.map((f) => [f.key, f.floor]));
  return {
    whitePct: map.get('w') ?? 0,
    drawPct: map.get('d') ?? 0,
    blackPct: map.get('b') ?? 0,
  };
}

/**
 * Formats move popularity percentage exactly like Chess.com Explorer ("46%", "7%", "<1%").
 */
export function formatPopularityPct(moveGames: number, totalPositionGames: number): string {
  if (totalPositionGames <= 0 || moveGames <= 0) return '0%';
  const raw = (moveGames / totalPositionGames) * 100;
  if (raw < 1) return '<1%';
  return `${Math.round(raw)}%`;
}

/**
 * Formats game counts compactly like Chess.com ("2.2M", "477K", "37.5K", "1,240", "82").
 */
export function formatCompactGamesCount(count: number): string {
  const n = Math.max(0, Math.round(Number.isFinite(count) ? count : 0));
  if (n >= 1_000_000) {
    const val = n / 1_000_000;
    return `${val >= 100 ? Math.round(val) : Number(val.toFixed(1))}M`;
  }
  if (n >= 100_000) {
    return `${Math.round(n / 1_000)}K`;
  }
  if (n >= 10_000) {
    return `${Number((n / 1_000).toFixed(1))}K`;
  }
  return n.toLocaleString('en-US');
}

/**
 * Formats move SAN with turn-aware move number ("1. e4" for White, "1... e5" for Black).
 */
export function formatMoveLabelForTurn(
  san: string,
  moveNumber: number,
  turn: Color,
): string {
  const num = Math.max(1, Math.round(moveNumber));
  return turn === 'w' ? `${num}. ${san}` : `${num}... ${san}`;
}

export function getFenTurnAndMoveNumber(fen: string): { turn: Color; moveNumber: number } {
  const parts = fen.trim().split(/\s+/);
  const turn: Color = parts[1] === 'b' ? 'b' : 'w';
  const parsed = Number.parseInt(parts[5] ?? '1', 10);
  const moveNumber = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  return { turn, moveNumber };
}

interface RawExplorerMove {
  uci?: string;
  san?: string;
  white?: number;
  draws?: number;
  black?: number;
  averageRating?: number;
  opening?: { eco?: string; name?: string } | null;
}

interface RawExplorerGame {
  id?: string;
  winner?: string | null;
  white?: { name?: string; rating?: number };
  black?: { name?: string; rating?: number };
  year?: number;
  month?: string;
}

export interface RawExplorerPayload {
  white?: number;
  draws?: number;
  black?: number;
  opening?: { eco?: string; name?: string } | null;
  moves?: RawExplorerMove[];
  topGames?: RawExplorerGame[];
  recentGames?: RawExplorerGame[];
}

function sanitizeText(text: string): string {
  return text
    .replace(/\b(lichess|chess\.com|chesscom)\b/gi, 'OpenChess')
    .trim();
}

export function normalizeExplorerPayload(
  raw: RawExplorerPayload,
  fen: string,
  database: ExplorerDatabase,
  historySans: string[] = [],
): ExplorerPositionData {
  const white = Math.max(0, Number(raw.white) || 0);
  const draws = Math.max(0, Number(raw.draws) || 0);
  const black = Math.max(0, Number(raw.black) || 0);
  const fallbackOpening = detectOpeningForPosition(fen, historySans);

  const opening: ExplorerOpeningInfo =
    raw.opening?.name && raw.opening?.eco
      ? {
          eco: raw.opening.eco.trim(),
          name: sanitizeText(raw.opening.name),
        }
      : fallbackOpening;

  const moves: ExplorerMoveStat[] = (Array.isArray(raw.moves) ? raw.moves : [])
    .map((m): ExplorerMoveStat | null => {
      const san = typeof m.san === 'string' ? m.san.trim() : '';
      const uci = typeof m.uci === 'string' ? m.uci.trim() : '';
      if (!san || uci.length < 4) return null;
      const mw = Math.max(0, Number(m.white) || 0);
      const md = Math.max(0, Number(m.draws) || 0);
      const mb = Math.max(0, Number(m.black) || 0);
      const total = mw + md + mb;
      return {
        uci,
        san,
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        white: mw,
        draws: md,
        black: mb,
        totalGames: total,
        averageRating: typeof m.averageRating === 'number' ? m.averageRating : undefined,
        openingEco: m.opening?.eco,
        openingName: m.opening?.name ? sanitizeText(m.opening.name) : undefined,
      };
    })
    .filter((m): m is ExplorerMoveStat => m !== null && m.totalGames > 0)
    .sort((a, b) => b.totalGames - a.totalGames);

  const rawGames = Array.isArray(raw.topGames) && raw.topGames.length > 0
    ? raw.topGames
    : Array.isArray(raw.recentGames)
      ? raw.recentGames
      : [];

  const topGames: ExplorerTopGame[] = rawGames.slice(0, 10).map((g, idx) => ({
    id: g.id || `game-${idx}`,
    whiteName: sanitizeText(g.white?.name || 'White'),
    whiteRating: typeof g.white?.rating === 'number' ? g.white.rating : undefined,
    blackName: sanitizeText(g.black?.name || 'Black'),
    blackRating: typeof g.black?.rating === 'number' ? g.black.rating : undefined,
    winner: g.winner === 'white' ? 'white' : g.winner === 'black' ? 'black' : 'draw',
    year: typeof g.year === 'number' ? g.year : undefined,
    month: typeof g.month === 'string' ? g.month : undefined,
  }));

  const totalGames = Math.max(
    white + draws + black,
    moves.reduce((sum, m) => sum + m.totalGames, 0),
  );

  return {
    fen,
    database,
    source: 'live-database',
    opening,
    white,
    draws,
    black,
    totalGames,
    moves,
    topGames,
  };
}

interface CuratedOpeningEntry {
  moves: string[];
  eco: string;
  name: string;
}

const CURATED_OPENING_PREFIXES: CuratedOpeningEntry[] = [
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'], eco: 'C84', name: 'Ruy Lopez: Closed' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], eco: 'C70', name: 'Ruy Lopez: Morphy Defense' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'], eco: 'C65', name: 'Ruy Lopez: Berlin Defense' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], eco: 'C60', name: 'Ruy Lopez' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3'], eco: 'C54', name: 'Italian Game: Giuoco Pianissimo' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'], eco: 'C51', name: 'Italian Game: Evans Gambit' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], eco: 'C50', name: 'Italian Game: Giuoco Piano' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], eco: 'C55', name: 'Italian Game: Two Knights Defense' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], eco: 'C50', name: 'Italian Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4'], eco: 'C45', name: 'Scotch Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], eco: 'C44', name: 'Scotch Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'], eco: 'C47', name: 'Four Knights Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nf6'], eco: 'C42', name: "Petrov's Defense" },
  { moves: ['e4', 'e5', 'Nf3', 'd6'], eco: 'C41', name: 'Philidor Defense' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6'], eco: 'C44', name: "King's Knight Opening" },
  { moves: ['e4', 'e5', 'f4'], eco: 'C30', name: "King's Gambit" },
  { moves: ['e4', 'e5', 'Nc3'], eco: 'C25', name: 'Vienna Game' },
  { moves: ['e4', 'e5', 'Bc4'], eco: 'C23', name: "Bishop's Opening" },
  { moves: ['e4', 'e5', 'Nf3'], eco: 'C40', name: "King's Pawn Game" },
  { moves: ['e4', 'e5'], eco: 'C20', name: "King's Pawn Game" },
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], eco: 'B90', name: 'Sicilian Defense: Najdorf Variation' },
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'], eco: 'B70', name: 'Sicilian Defense: Dragon Variation' },
  { moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4'], eco: 'B32', name: 'Sicilian Defense: Open' },
  { moves: ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4'], eco: 'B40', name: 'Sicilian Defense: Kan / Taimanov' },
  { moves: ['e4', 'c5', 'c3'], eco: 'B22', name: 'Sicilian Defense: Alapin Variation' },
  { moves: ['e4', 'c5', 'Nc3'], eco: 'B23', name: 'Sicilian Defense: Closed' },
  { moves: ['e4', 'c5', 'Nf3', 'd6'], eco: 'B50', name: 'Sicilian Defense' },
  { moves: ['e4', 'c5', 'Nf3'], eco: 'B27', name: 'Sicilian Defense' },
  { moves: ['e4', 'c5'], eco: 'B20', name: 'Sicilian Defense' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'Nc3'], eco: 'C10', name: 'French Defense: Paulsen / Winawer' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'Nd2'], eco: 'C03', name: 'French Defense: Tarrasch Variation' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'e5'], eco: 'C02', name: 'French Defense: Advance Variation' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'exd5'], eco: 'C01', name: 'French Defense: Exchange Variation' },
  { moves: ['e4', 'e6', 'd4', 'd5'], eco: 'C00', name: 'French Defense' },
  { moves: ['e4', 'e6'], eco: 'C00', name: 'French Defense' },
  { moves: ['e4', 'c6', 'd4', 'd5', 'Nc3'], eco: 'B18', name: 'Caro-Kann Defense: Classical' },
  { moves: ['e4', 'c6', 'd4', 'd5', 'e5'], eco: 'B12', name: 'Caro-Kann Defense: Advance Variation' },
  { moves: ['e4', 'c6', 'd4', 'd5'], eco: 'B12', name: 'Caro-Kann Defense' },
  { moves: ['e4', 'c6'], eco: 'B10', name: 'Caro-Kann Defense' },
  { moves: ['e4', 'd5', 'exd5', 'Qxd5'], eco: 'B01', name: 'Scandinavian Defense' },
  { moves: ['e4', 'd5'], eco: 'B01', name: 'Scandinavian Defense' },
  { moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6'], eco: 'B07', name: 'Pirc Defense' },
  { moves: ['e4', 'Nf6'], eco: 'B02', name: "Alekhine's Defense" },
  { moves: ['e4'], eco: 'B00', name: "King's Pawn Opening" },
  { moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'], eco: 'D37', name: "Queen's Gambit Declined" },
  { moves: ['d4', 'd5', 'c4', 'c6'], eco: 'D10', name: 'Slav Defense' },
  { moves: ['d4', 'd5', 'c4', 'dxc4'], eco: 'D20', name: "Queen's Gambit Accepted" },
  { moves: ['d4', 'd5', 'c4', 'e6'], eco: 'D30', name: "Queen's Gambit Declined" },
  { moves: ['d4', 'd5', 'c4'], eco: 'D06', name: "Queen's Gambit" },
  { moves: ['d4', 'd5', 'Bf4'], eco: 'D00', name: 'London System' },
  { moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4'], eco: 'D02', name: 'London System' },
  { moves: ['d4', 'd5'], eco: 'D00', name: "Queen's Pawn Game" },
  { moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6'], eco: 'E60', name: "King's Indian Defense" },
  { moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'], eco: 'D80', name: 'Grünfeld Defense' },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], eco: 'E20', name: 'Nimzo-Indian Defense' },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'd5', 'Nc3', 'Bb4'], eco: 'D38', name: "Queen's Gambit Declined: Ragozin" },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'g3'], eco: 'E00', name: 'Catalan Opening' },
  { moves: ['d4', 'Nf6', 'c4'], eco: 'A50', name: 'Indian Game' },
  { moves: ['d4', 'Nf6', 'Bf4'], eco: 'A45', name: 'London System' },
  { moves: ['d4', 'Nf6'], eco: 'A45', name: 'Indian Game' },
  { moves: ['d4'], eco: 'A40', name: "Queen's Pawn Opening" },
  { moves: ['Nf3', 'd5'], eco: 'A06', name: 'Réti Opening' },
  { moves: ['Nf3', 'Nf6'], eco: 'A05', name: 'Réti Opening' },
  { moves: ['Nf3'], eco: 'A04', name: 'Réti Opening' },
  { moves: ['c4', 'e5'], eco: 'A20', name: 'English Opening: Reversed Sicilian' },
  { moves: ['c4', 'Nf6'], eco: 'A15', name: 'English Opening: Anglo-Indian' },
  { moves: ['c4', 'c5'], eco: 'A30', name: 'English Opening: Symmetrical' },
  { moves: ['c4'], eco: 'A10', name: 'English Opening' },
  { moves: ['g3'], eco: 'A00', name: "King's Fianchetto Opening" },
  { moves: ['b3'], eco: 'A01', name: "Nimzo-Larsen Attack" },
  { moves: ['f4'], eco: 'A02', name: "Bird's Opening" },
];

const START_FEN_KEY = normalizeFenKey(new Chess().fen());

// Precompute FEN-key -> opening lookup so transpositions work even without historySans
const OPENING_BY_FEN_KEY = new Map<string, ExplorerOpeningInfo>();
(function initOpeningFenMap() {
  OPENING_BY_FEN_KEY.set(START_FEN_KEY, { eco: 'A00', name: 'Starting Position' });
  for (const entry of CURATED_OPENING_PREFIXES) {
    try {
      const board = new Chess();
      let ok = true;
      for (const san of entry.moves) {
        if (!board.move(san)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        const key = normalizeFenKey(board.fen());
        if (!OPENING_BY_FEN_KEY.has(key)) {
          OPENING_BY_FEN_KEY.set(key, { eco: entry.eco, name: entry.name });
        }
      }
    } catch {
      // ignore invalid sequence
    }
  }
})();

export function detectOpeningForPosition(
  fen: string,
  historySans: string[] = [],
): ExplorerOpeningInfo {
  const fenKey = normalizeFenKey(fen);
  const direct = OPENING_BY_FEN_KEY.get(fenKey);
  if (direct) return direct;

  if (historySans.length > 0) {
    let best: CuratedOpeningEntry | null = null;
    for (const entry of CURATED_OPENING_PREFIXES) {
      if (entry.moves.length > historySans.length) continue;
      let match = true;
      for (let i = 0; i < entry.moves.length; i++) {
        if (entry.moves[i] !== historySans[i]) {
          match = false;
          break;
        }
      }
      if (match && (!best || entry.moves.length > best.moves.length)) {
        best = entry;
      }
    }
    if (best) {
      return { eco: best.eco, name: best.name };
    }
  }

  return fenKey === START_FEN_KEY
    ? { eco: 'A00', name: 'Starting Position' }
    : { eco: 'A00', name: 'Custom Position' };
}

interface CuratedBookMoveSeed {
  san: string;
  white: number;
  draws: number;
  black: number;
}

const CURATED_MASTER_LINES: Array<{ path: string[]; moves: CuratedBookMoveSeed[] }> = [
  {
    path: [],
    moves: [
      { san: 'e4', white: 862000, draws: 598000, black: 740000 },
      { san: 'd4', white: 638000, draws: 481000, black: 492000 },
      { san: 'Nf3', white: 195000, draws: 147000, black: 135000 },
      { san: 'c4', white: 124000, draws: 96000, black: 90000 },
      { san: 'g3', white: 15800, draws: 10100, black: 11600 },
      { san: 'b3', white: 6100, draws: 3900, black: 5400 },
    ],
  },
  {
    path: ['e4'],
    moves: [
      { san: 'c5', white: 342000, draws: 256000, black: 332000 },
      { san: 'e5', white: 254000, draws: 185000, black: 211000 },
      { san: 'e6', white: 118000, draws: 78000, black: 94000 },
      { san: 'c6', white: 74000, draws: 56000, black: 58000 },
      { san: 'd6', white: 32000, draws: 18000, black: 25000 },
      { san: 'd5', white: 19500, draws: 10200, black: 14800 },
      { san: 'Nf6', white: 16200, draws: 9400, black: 12100 },
    ],
  },
  {
    path: ['e4', 'e5'],
    moves: [
      { san: 'Nf3', white: 218000, draws: 162000, black: 178000 },
      { san: 'Nc3', white: 14200, draws: 9100, black: 11900 },
      { san: 'Bc4', white: 11400, draws: 7200, black: 9800 },
      { san: 'f4', white: 9800, draws: 5400, black: 9100 },
      { san: 'd4', white: 4100, draws: 2500, black: 3700 },
    ],
  },
  {
    path: ['e4', 'e5', 'Nf3'],
    moves: [
      { san: 'Nc6', white: 176000, draws: 132000, black: 146000 },
      { san: 'Nf6', white: 29400, draws: 24800, black: 18900 },
      { san: 'd6', white: 11200, draws: 5800, black: 7400 },
    ],
  },
  {
    path: ['e4', 'e5', 'Nf3', 'Nc6'],
    moves: [
      { san: 'Bb5', white: 98400, draws: 79200, black: 74100 },
      { san: 'Bc4', white: 48200, draws: 31400, black: 41800 },
      { san: 'd4', white: 19800, draws: 14100, black: 17900 },
      { san: 'Nc3', white: 10900, draws: 8400, black: 9200 },
    ],
  },
  {
    path: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
    moves: [
      { san: 'Bc5', white: 25800, draws: 17900, black: 22100 },
      { san: 'Nf6', white: 20400, draws: 12900, black: 18200 },
      { san: 'Be7', white: 2100, draws: 1200, black: 1400 },
    ],
  },
  {
    path: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
    moves: [
      { san: 'a6', white: 64200, draws: 51800, black: 48900 },
      { san: 'Nf6', white: 21800, draws: 19400, black: 16200 },
      { san: 'Bc5', white: 5100, draws: 3400, black: 4200 },
      { san: 'd6', white: 4200, draws: 2900, black: 3100 },
    ],
  },
  {
    path: ['e4', 'c5'],
    moves: [
      { san: 'Nf3', white: 268000, draws: 204000, black: 258000 },
      { san: 'Nc3', white: 34200, draws: 23100, black: 31800 },
      { san: 'c3', white: 26900, draws: 19800, black: 24200 },
      { san: 'd4', white: 9200, draws: 5400, black: 9800 },
    ],
  },
  {
    path: ['e4', 'c5', 'Nf3'],
    moves: [
      { san: 'd6', white: 112000, draws: 86000, black: 109000 },
      { san: 'Nc6', white: 84000, draws: 63000, black: 81000 },
      { san: 'e6', white: 61000, draws: 48000, black: 58000 },
      { san: 'g6', white: 7200, draws: 4900, black: 6400 },
    ],
  },
  {
    path: ['d4'],
    moves: [
      { san: 'Nf6', white: 368000, draws: 289000, black: 292000 },
      { san: 'd5', white: 214000, draws: 162000, black: 158000 },
      { san: 'e6', white: 24800, draws: 16400, black: 19600 },
      { san: 'f5', white: 14200, draws: 8900, black: 11800 },
      { san: 'g6', white: 11400, draws: 7100, black: 9200 },
    ],
  },
  {
    path: ['d4', 'd5'],
    moves: [
      { san: 'c4', white: 164000, draws: 126000, black: 118000 },
      { san: 'Nf3', white: 28900, draws: 21200, black: 22800 },
      { san: 'Bf4', white: 14800, draws: 10400, black: 11900 },
      { san: 'Nc3', white: 4900, draws: 3100, black: 4200 },
    ],
  },
  {
    path: ['d4', 'd5', 'c4'],
    moves: [
      { san: 'e6', white: 78400, draws: 62800, black: 54900 },
      { san: 'c6', white: 56200, draws: 44100, black: 41200 },
      { san: 'dxc4', white: 24100, draws: 17900, black: 18600 },
    ],
  },
  {
    path: ['d4', 'Nf6'],
    moves: [
      { san: 'c4', white: 284000, draws: 229000, black: 221000 },
      { san: 'Nf3', white: 54200, draws: 41800, black: 44100 },
      { san: 'Bf4', white: 18400, draws: 12900, black: 15800 },
      { san: 'Bg5', white: 9200, draws: 6400, black: 8100 },
    ],
  },
  {
    path: ['d4', 'Nf6', 'c4'],
    moves: [
      { san: 'e6', white: 142000, draws: 119000, black: 108000 },
      { san: 'g6', white: 108000, draws: 81000, black: 89000 },
      { san: 'c5', white: 21400, draws: 16200, black: 18900 },
    ],
  },
  {
    path: ['Nf3'],
    moves: [
      { san: 'Nf6', white: 82400, draws: 64200, black: 58900 },
      { san: 'd5', white: 69100, draws: 51400, black: 49800 },
      { san: 'c5', white: 24800, draws: 18200, black: 19400 },
      { san: 'g6', white: 11200, draws: 7800, black: 8900 },
    ],
  },
  {
    path: ['c4'],
    moves: [
      { san: 'e5', white: 41200, draws: 31800, black: 30400 },
      { san: 'Nf6', white: 38900, draws: 31200, black: 28600 },
      { san: 'c5', white: 29400, draws: 23800, black: 21900 },
      { san: 'e6', white: 11800, draws: 8900, black: 8400 },
    ],
  },
];

const CURATED_MOVES_BY_FEN_KEY = new Map<string, ExplorerMoveStat[]>();
(function initCuratedBookMap() {
  for (const line of CURATED_MASTER_LINES) {
    try {
      const board = new Chess();
      let validPath = true;
      for (const san of line.path) {
        if (!board.move(san)) {
          validPath = false;
          break;
        }
      }
      if (!validPath) continue;
      const key = normalizeFenKey(board.fen());
      const built: ExplorerMoveStat[] = [];
      for (const seed of line.moves) {
        const probe = new Chess(board.fen());
        const mv = probe.move(seed.san);
        if (!mv) continue;
        const nextOpening = detectOpeningForPosition(probe.fen(), [...line.path, mv.san]);
        built.push({
          uci: `${mv.from}${mv.to}${mv.promotion ?? ''}`,
          san: mv.san,
          from: mv.from,
          to: mv.to,
          white: seed.white,
          draws: seed.draws,
          black: seed.black,
          totalGames: seed.white + seed.draws + seed.black,
          openingEco: nextOpening.eco,
          openingName: nextOpening.name,
        });
      }
      if (built.length > 0) {
        CURATED_MOVES_BY_FEN_KEY.set(key, built);
      }
    } catch {
      // ignore invalid seed
    }
  }
})();

/**
 * Indexes any collection of PGN-backed games (User's My Games or Featured Master Games)
 * matching a target FEN and aggregates next-move W/D/L statistics + matching games list.
 */
export function aggregateGamesAtFen(
  fen: string,
  games: LichessUserGame[],
  database: ExplorerDatabase,
  source: ExplorerPositionData['source'],
  historySans: string[] = [],
): ExplorerPositionData {
  const targetKey = normalizeFenKey(fen);
  const moveMap = new Map<string, ExplorerMoveStat>();
  const matchingGames: ExplorerTopGame[] = [];

  let totalWhite = 0;
  let totalDraws = 0;
  let totalBlack = 0;

  for (const game of games) {
    if (!game.pgn || !game.pgn.trim()) continue;
    const replay = new Chess();
    try {
      replay.loadPgn(game.pgn);
    } catch {
      continue;
    }
    const verboseMoves = replay.history({ verbose: true });
    const walker = new Chess();

    const outcome: 'white' | 'black' | 'draw' =
      game.winner === 'white'
        ? 'white'
        : game.winner === 'black'
          ? 'black'
          : 'draw';

    const year = game.createdAt ? new Date(game.createdAt).getFullYear() : undefined;

    for (let i = 0; i <= verboseMoves.length; i++) {
      if (normalizeFenKey(walker.fen()) === targetKey) {
        if (outcome === 'white') totalWhite += 1;
        else if (outcome === 'black') totalBlack += 1;
        else totalDraws += 1;

        matchingGames.push({
          id: game.id,
          whiteName: sanitizeText(game.white?.name || 'White'),
          whiteRating: game.white?.rating,
          blackName: sanitizeText(game.black?.name || 'Black'),
          blackRating: game.black?.rating,
          winner: outcome,
          year,
          pgn: game.pgn,
        });

        const nextMove = verboseMoves[i];
        if (nextMove) {
          const uci = `${nextMove.from}${nextMove.to}${nextMove.promotion ?? ''}`;
          const existing = moveMap.get(uci);
          if (existing) {
            if (outcome === 'white') existing.white += 1;
            else if (outcome === 'black') existing.black += 1;
            else existing.draws += 1;
            existing.totalGames += 1;
          } else {
            moveMap.set(uci, {
              uci,
              san: nextMove.san,
              from: nextMove.from,
              to: nextMove.to,
              white: outcome === 'white' ? 1 : 0,
              draws: outcome === 'draw' ? 1 : 0,
              black: outcome === 'black' ? 1 : 0,
              totalGames: 1,
            });
          }
        }
        break;
      }

      if (i < verboseMoves.length) {
        walker.move(verboseMoves[i]);
      }
    }
  }

  const moves = Array.from(moveMap.values()).sort((a, b) => b.totalGames - a.totalGames);

  return {
    fen,
    database,
    source,
    opening: detectOpeningForPosition(fen, historySans),
    white: totalWhite,
    draws: totalDraws,
    black: totalBlack,
    totalGames: totalWhite + totalDraws + totalBlack,
    moves,
    topGames: matchingGames.slice(0, 12),
  };
}

export function buildMyGamesExplorer(
  fen: string,
  storedGames: LichessUserGame[],
  historySans: string[] = [],
): ExplorerPositionData {
  return aggregateGamesAtFen(fen, storedGames, 'my-games', 'my-games', historySans);
}

export function buildLocalFallbackExplorer(
  fen: string,
  database: ExplorerDatabase = 'masters',
  historySans: string[] = [],
): ExplorerPositionData {
  const key = normalizeFenKey(fen);
  const curatedMoves = CURATED_MOVES_BY_FEN_KEY.get(key);
  const featuredAtFen = aggregateGamesAtFen(
    fen,
    FEATURED_MASTER_GAMES,
    database,
    'curated-book',
    historySans,
  );

  if (curatedMoves && curatedMoves.length > 0) {
    const white = curatedMoves.reduce((s, m) => s + m.white, 0);
    const draws = curatedMoves.reduce((s, m) => s + m.draws, 0);
    const black = curatedMoves.reduce((s, m) => s + m.black, 0);
    return {
      fen,
      database,
      source: 'curated-book',
      opening: detectOpeningForPosition(fen, historySans),
      white,
      draws,
      black,
      totalGames: white + draws + black,
      moves: curatedMoves,
      topGames: featuredAtFen.topGames,
    };
  }

  return featuredAtFen;
}
