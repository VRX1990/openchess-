import { Chess, type Color, type PieceSymbol } from 'chess.js';
import type { EvaluatedMove, MoveQuality } from './engine';

export type ReviewSpeedPreset = 'fast' | 'standard' | 'deep';

export interface ReviewSpeedOption {
  id: ReviewSpeedPreset;
  label: string;
  depth: number;
  movetimeMs: number;
  shortDesc: string;
}

export const REVIEW_SPEED_PRESETS: Record<ReviewSpeedPreset, ReviewSpeedOption> = {
  fast: {
    id: 'fast',
    label: 'Fast',
    depth: 12,
    movetimeMs: 220,
    shortDesc: 'Depth 12 · Fast',
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    depth: 14,
    movetimeMs: 360,
    shortDesc: 'Depth 14 · Balanced',
  },
  deep: {
    id: 'deep',
    label: 'Deep',
    depth: 17,
    movetimeMs: 700,
    shortDesc: 'Depth 17 · Deep',
  },
};

export interface StockfishPvLine {
  multipv: number;
  depth: number;
  seldepth?: number;
  nodes?: number;
  nps?: number;
  evalCp: number; // Always normalized to White's perspective (+ = White ahead, - = Black ahead)
  mateIn: number | null; // +N = White mates in N, -N = Black mates in N
  evalText: string;
  firstMoveUci: string;
  firstMoveFrom: string;
  firstMoveTo: string;
  firstMoveSan: string;
  lineUci: string[];
  lineSan: string[];
}

export interface PositionAnalysisSnapshot {
  fen: string;
  depth: number;
  nps?: number;
  nodes?: number;
  lines: StockfishPvLine[];
  bestMoveSan: string;
  bestMoveFrom: string;
  bestMoveTo: string;
  evalCp: number;
  mateIn: number | null;
  source: 'stockfish-19-wasm' | 'lichess-cloud' | 'local-book' | 'local-js';
}

const PIECE_MATERIAL_CP: Record<PieceSymbol, number> = {
  p: 100,
  n: 310,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

export function encodeMateEvalCp(matePliesFromWhite: number): number {
  if (matePliesFromWhite === 0) return 0;
  const dist = Math.max(1, Math.min(999, Math.abs(Math.round(matePliesFromWhite))));
  const magnitude = 100000 - dist;
  return matePliesFromWhite > 0 ? magnitude : -magnitude;
}

export function decodeMateDistance(evalCp: number): number | null {
  if (Math.abs(evalCp) < 90000) return null;
  const dist = Math.max(1, 100000 - Math.min(99999, Math.abs(Math.round(evalCp))));
  return evalCp > 0 ? dist : -dist;
}

export function formatEvalDisplay(evalCp: number, mateIn?: number | null): string {
  const effectiveMate = mateIn ?? decodeMateDistance(evalCp);
  if (effectiveMate !== null && effectiveMate !== 0) {
    return effectiveMate > 0 ? `M${effectiveMate}` : `-M${Math.abs(effectiveMate)}`;
  }
  const pawns = evalCp / 100;
  if (Math.abs(pawns) < 0.05) return '0.0';
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(Math.abs(pawns) >= 10 ? 1 : 2)}`;
}

/**
 * Logistic Expected-Points / Win Probability model (0..100 for White).
 * Matches Chess.com / Lichess calibrated centipawn-to-win-chance scaling.
 */
export function evalToWhiteWinPercent(evalCp: number, mateIn?: number | null): number {
  const effectiveMate = mateIn ?? decodeMateDistance(evalCp);
  if (effectiveMate !== null && effectiveMate !== 0) {
    return effectiveMate > 0 ? 100 : 0;
  }
  const clamped = Math.max(-2500, Math.min(2500, evalCp));
  const raw = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

export function evalToMoverWinPercent(
  evalCp: number,
  moverColor: Color,
  mateIn?: number | null,
): number {
  const whiteWin = evalToWhiteWinPercent(evalCp, mateIn);
  return moverColor === 'w' ? whiteWin : Math.round((100 - whiteWin) * 10) / 10;
}

/**
 * Calibrated single-move accuracy percentage (0..100) derived from Win% loss.
 */
export function computeMoveAccuracyPercent(winLossPct: number): number {
  const loss = Math.max(0, winLossPct);
  if (loss <= 0.3) return 100;
  const raw = 103.1668 * Math.exp(-0.04354 * loss) - 3.1669;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

export interface ParsedUciInfo {
  depth: number;
  seldepth?: number;
  multipv: number;
  nodes?: number;
  nps?: number;
  scoreType: 'cp' | 'mate';
  scoreValue: number;
  pvUci: string[];
  bound?: 'upperbound' | 'lowerbound';
}

export function parseUciInfoLine(line: string): ParsedUciInfo | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('info ') || !trimmed.includes(' score ') || !trimmed.includes(' pv ')) {
    return null;
  }
  if (trimmed.includes('upperbound') || trimmed.includes('lowerbound')) {
    return null;
  }

  const tokens = trimmed.split(/\s+/);
  let depth = 0;
  let seldepth: number | undefined;
  let multipv = 1;
  let nodes: number | undefined;
  let nps: number | undefined;
  let scoreType: 'cp' | 'mate' | null = null;
  let scoreValue = 0;
  let pvUci: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === 'depth' && i + 1 < tokens.length) {
      depth = Number.parseInt(tokens[++i], 10) || 0;
    } else if (tok === 'seldepth' && i + 1 < tokens.length) {
      seldepth = Number.parseInt(tokens[++i], 10) || undefined;
    } else if (tok === 'multipv' && i + 1 < tokens.length) {
      multipv = Math.max(1, Number.parseInt(tokens[++i], 10) || 1);
    } else if (tok === 'nodes' && i + 1 < tokens.length) {
      nodes = Number.parseInt(tokens[++i], 10) || undefined;
    } else if (tok === 'nps' && i + 1 < tokens.length) {
      nps = Number.parseInt(tokens[++i], 10) || undefined;
    } else if (tok === 'score' && i + 2 < tokens.length) {
      const kind = tokens[++i];
      const val = Number.parseInt(tokens[++i], 10);
      if ((kind === 'cp' || kind === 'mate') && Number.isFinite(val)) {
        scoreType = kind;
        scoreValue = val;
      }
    } else if (tok === 'pv') {
      pvUci = tokens.slice(i + 1).filter((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m));
      break;
    }
  }

  if (!scoreType || pvUci.length === 0 || depth <= 0) {
    return null;
  }

  return {
    depth,
    seldepth,
    multipv,
    nodes,
    nps,
    scoreType,
    scoreValue,
    pvUci,
  };
}

export function uciLineToPvLine(fen: string, info: ParsedUciInfo): StockfishPvLine | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }

  const sideSign = chess.turn() === 'w' ? 1 : -1;
  let evalCp = 0;
  let mateIn: number | null = null;

  if (info.scoreType === 'mate') {
    const signedMate = info.scoreValue === 0 ? 1 : info.scoreValue * sideSign;
    mateIn = signedMate;
    evalCp = encodeMateEvalCp(signedMate);
  } else {
    evalCp = Math.round(info.scoreValue * sideSign);
  }

  const lineSan: string[] = [];
  let firstMoveFrom = '';
  let firstMoveTo = '';
  let firstMoveSan = '';

  for (let i = 0; i < info.pvUci.length && i < 10; i++) {
    const uci = info.pvUci[i];
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? (uci[4].toLowerCase() as PieceSymbol) : undefined;
    try {
      const played = chess.move({ from, to, promotion });
      if (!played) break;
      if (i === 0) {
        firstMoveFrom = played.from;
        firstMoveTo = played.to;
        firstMoveSan = played.san;
      }
      lineSan.push(played.san);
    } catch {
      break;
    }
  }

  if (!firstMoveSan || !firstMoveFrom || !firstMoveTo) return null;

  return {
    multipv: info.multipv,
    depth: info.depth,
    seldepth: info.seldepth,
    nodes: info.nodes,
    nps: info.nps,
    evalCp,
    mateIn,
    evalText: formatEvalDisplay(evalCp, mateIn),
    firstMoveUci: info.pvUci[0],
    firstMoveFrom,
    firstMoveTo,
    firstMoveSan,
    lineUci: info.pvUci.slice(0, lineSan.length),
    lineSan,
  };
}

/**
 * Evaluates terminal (checkmate / draw) positions cleanly without needing engine search.
 */
export function buildTerminalSnapshot(fen: string): PositionAnalysisSnapshot | null {
  try {
    const chess = new Chess(fen);
    if (!chess.isGameOver()) return null;
    if (chess.isCheckmate()) {
      // Side to move has been checkmated
      const winnerSign = chess.turn() === 'w' ? -1 : 1;
      const evalCp = encodeMateEvalCp(winnerSign);
      return {
        fen,
        depth: 99,
        lines: [],
        bestMoveSan: '',
        bestMoveFrom: '',
        bestMoveTo: '',
        evalCp,
        mateIn: winnerSign,
        source: 'stockfish-19-wasm',
      };
    }
    return {
      fen,
      depth: 99,
      lines: [],
      bestMoveSan: '',
      bestMoveFrom: '',
      bestMoveTo: '',
      evalCp: 0,
      mateIn: null,
      source: 'stockfish-19-wasm',
    };
  } catch {
    return null;
  }
}


export interface ParsedPgnMetadata {
  whiteName?: string;
  blackName?: string;
  whiteRating?: number;
  blackRating?: number;
  opening?: string;
  eco?: string;
  speed: string;
  timeControl?: string;
  termination?: string;
  result?: string;
}

const OPENING_PREFIX_BOOK: Array<{ moves: string[]; name: string }> = [
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3'], name: 'Italian Game: Giuoco Piano' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'], name: 'Italian Game: Evans Gambit' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], name: 'Italian Game: Giuoco Piano' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5'], name: 'Italian Game: Knight Attack' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], name: 'Italian Game: Two Knights Defense' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], name: 'Italian Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6'], name: 'Ruy Lopez: Morphy Defense' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'], name: 'Ruy Lopez: Berlin Defense' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], name: 'Ruy Lopez' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'], name: 'Scotch Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'], name: 'Four Knights Game' },
  { moves: ['e4', 'e5', 'Nf3', 'Nf6'], name: "Petrov's Defense" },
  { moves: ['e4', 'e5', 'Nf3', 'd6'], name: 'Philidor Defense' },
  { moves: ['e4', 'e5', 'Nc3'], name: 'Vienna Game' },
  { moves: ['e4', 'e5', 'f4'], name: "King's Gambit" },
  { moves: ['e4', 'e5', 'Qh5'], name: "Wayward Queen Attack" },
  { moves: ['e4', 'e5', 'Bc4'], name: "Bishop's Opening" },
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'], name: 'Sicilian Defense: Najdorf Variation' },
  { moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'], name: 'Sicilian Defense: Dragon Variation' },
  { moves: ['e4', 'c5', 'c3'], name: 'Sicilian Defense: Alapin Variation' },
  { moves: ['e4', 'c5', 'Nc3'], name: 'Sicilian Defense: Closed' },
  { moves: ['e4', 'c5', 'Nf3', 'Nc6', 'Bb5'], name: 'Sicilian Defense: Rossolimo Attack' },
  { moves: ['e4', 'c5'], name: 'Sicilian Defense' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'Nc3'], name: 'French Defense: Classical' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'e5'], name: 'French Defense: Advance Variation' },
  { moves: ['e4', 'e6', 'd4', 'd5', 'exd5'], name: 'French Defense: Exchange Variation' },
  { moves: ['e4', 'e6'], name: 'French Defense' },
  { moves: ['e4', 'c6', 'd4', 'd5', 'e5'], name: 'Caro-Kann Defense: Advance Variation' },
  { moves: ['e4', 'c6', 'd4', 'd5', 'Nc3'], name: 'Caro-Kann Defense: Classical' },
  { moves: ['e4', 'c6'], name: 'Caro-Kann Defense' },
  { moves: ['e4', 'd5'], name: 'Scandinavian Defense' },
  { moves: ['e4', 'd6', 'd4', 'Nf6'], name: 'Pirc Defense' },
  { moves: ['e4', 'g6'], name: 'Modern Defense' },
  { moves: ['e4', 'Nf6'], name: "Alekhine's Defense" },
  { moves: ['d4', 'd5', 'c4', 'e6'], name: "Queen's Gambit Declined" },
  { moves: ['d4', 'd5', 'c4', 'dxc4'], name: "Queen's Gambit Accepted" },
  { moves: ['d4', 'd5', 'c4', 'c6'], name: 'Slav Defense' },
  { moves: ['d4', 'd5', 'c4'], name: "Queen's Gambit" },
  { moves: ['d4', 'd5', 'Bf4'], name: 'London System' },
  { moves: ['d4', 'Nf6', 'Bf4'], name: 'London System' },
  { moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7'], name: "King's Indian Defense" },
  { moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'], name: 'Grünfeld Defense' },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], name: 'Nimzo-Indian Defense' },
  { moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'], name: "Queen's Indian Defense" },
  { moves: ['d4', 'Nf6', 'c4', 'c5'], name: 'Benoni Defense' },
  { moves: ['d4', 'f5'], name: 'Dutch Defense' },
  { moves: ['c4', 'e5'], name: 'English Opening: Reversed Sicilian' },
  { moves: ['c4', 'c5'], name: 'English Opening: Symmetrical' },
  { moves: ['c4'], name: 'English Opening' },
  { moves: ['Nf3', 'd5'], name: 'Réti Opening' },
  { moves: ['f4'], name: "Bird's Opening" },
  { moves: ['e4', 'e5'], name: "King's Pawn Game" },
  { moves: ['d4', 'd5'], name: "Queen's Pawn Game" },
];

export function detectOpeningFromMoves(sans: string[]): string | undefined {
  if (!sans.length) return undefined;
  let bestMatch: { name: string; len: number } | null = null;
  for (const entry of OPENING_PREFIX_BOOK) {
    if (entry.moves.length > sans.length) continue;
    let matches = true;
    for (let i = 0; i < entry.moves.length; i++) {
      if (sans[i] !== entry.moves[i]) {
        matches = false;
        break;
      }
    }
    if (matches && (!bestMatch || entry.moves.length > bestMatch.len)) {
      bestMatch = { name: entry.name, len: entry.moves.length };
    }
  }
  return bestMatch?.name;
}

function parseOpeningFromEcoUrl(ecoUrl?: string): string | undefined {
  if (!ecoUrl) return undefined;
  const trimmed = ecoUrl.trim().replace(/\/+$/, '');
  const lastSlash = trimmed.lastIndexOf('/');
  const slug = lastSlash >= 0 ? trimmed.slice(lastSlash + 1) : trimmed;
  if (!slug) return undefined;

  // Strip trailing move sequence suffixes like "-3.Bc4-Bc5-4.c3-Nf6" or "-3...Nf6"
  const moveStart = slug.search(/-\d+\.+/);
  const cleanSlug = (moveStart > 0 ? slug.slice(0, moveStart) : slug)
    .replace(/_/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!cleanSlug) return undefined;

  const words = cleanSlug.split('-').filter(Boolean);
  if (words.length === 0) return undefined;

  const raw = words.join(' ');
  // Insert colon cleanly after common opening families when followed by variation name
  const familyPatterns = [
    'Italian Game',
    'Ruy Lopez',
    'Sicilian Defense',
    'French Defense',
    'Caro Kann Defense',
    'Scandinavian Defense',
    'Queens Gambit Declined',
    'Queens Gambit Accepted',
    'Queens Gambit',
    'Kings Indian Defense',
    'Nimzo Indian Defense',
    'Slav Defense',
    'Scotch Game',
    'Vienna Game',
    'Four Knights Game',
    'London System',
    'English Opening',
    'Petrovs Defense',
    'Philidor Defense',
    'Pirc Defense',
    'Modern Defense',
    'Alekhines Defense',
    'Dutch Defense',
    'Bishops Opening',
    'Kings Gambit',
  ];

  const normalized = raw
    .replace(/\bCaro Kann\b/i, 'Caro-Kann')
    .replace(/\bQueens\b/i, "Queen's")
    .replace(/\bKings\b/i, "King's")
    .replace(/\bPetrovs\b/i, "Petrov's")
    .replace(/\bBishops\b/i, "Bishop's")
    .replace(/\bAlekhines\b/i, "Alekhine's")
    .replace(/\bNimzo Indian\b/i, 'Nimzo-Indian');

  for (const fam of familyPatterns) {
    const famNorm = fam
      .replace(/\bCaro Kann\b/i, 'Caro-Kann')
      .replace(/\bQueens\b/i, "Queen's")
      .replace(/\bKings\b/i, "King's")
      .replace(/\bPetrovs\b/i, "Petrov's")
      .replace(/\bBishops\b/i, "Bishop's")
      .replace(/\bAlekhines\b/i, "Alekhine's")
      .replace(/\bNimzo Indian\b/i, 'Nimzo-Indian');
    if (
      normalized.toLowerCase().startsWith(famNorm.toLowerCase() + ' ') &&
      normalized.length > famNorm.length + 1
    ) {
      const rest = normalized.slice(famNorm.length + 1).trim();
      return `${famNorm}: ${rest}`;
    }
  }
  return normalized;
}

function inferSpeedFromTimeControl(tc?: string, event?: string): string {
  if (tc) {
    const clean = tc.trim();
    if (clean.includes('/')) return 'daily';
    const match = clean.match(/^(\d+)(?:\+(\d+))?$/);
    if (match) {
      const baseSec = Number.parseInt(match[1], 10);
      const incSec = match[2] ? Number.parseInt(match[2], 10) : 0;
      const estimatedSec = baseSec + incSec * 40;
      if (estimatedSec < 180) return 'bullet';
      if (estimatedSec < 600) return 'blitz';
      if (estimatedSec < 1500) return 'rapid';
      return 'classical';
    }
  }
  if (event) {
    const low = event.toLowerCase();
    if (low.includes('bullet')) return 'bullet';
    if (low.includes('blitz')) return 'blitz';
    if (low.includes('rapid')) return 'rapid';
    if (low.includes('classical') || low.includes('standard')) return 'classical';
    if (low.includes('daily') || low.includes('correspondence')) return 'daily';
  }
  return 'rapid';
}

export function parsePgnMetadata(pgnText: string, fallbackSans?: string[]): ParsedPgnMetadata {
  const getTag = (tag: string): string | undefined => {
    const match = pgnText.match(new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`, 'i'));
    const val = match?.[1]?.trim();
    return val && val !== '?' && val !== '-' ? val : undefined;
  };

  const whiteRatingRaw = Number(getTag('WhiteElo'));
  const blackRatingRaw = Number(getTag('BlackElo'));
  const timeControl = getTag('TimeControl');
  const event = getTag('Event');
  const speedTag = getTag('Speed');
  const eco = getTag('ECO');
  const termination = getTag('Termination');

  let result = getTag('Result');
  let sans = fallbackSans;
  if (!sans || !result || result === '*') {
    try {
      const replay = new Chess();
      replay.loadPgn(pgnText);
      const hist = replay.history();
      if (!sans && hist.length > 0) sans = hist;
      if (!result || result === '*') {
        if (replay.isCheckmate()) {
          result = replay.turn() === 'w' ? '0-1' : '1-0';
        } else if (
          replay.isStalemate() ||
          replay.isThreefoldRepetition() ||
          replay.isInsufficientMaterial()
        ) {
          result = '1/2-1/2';
        }
      }
    } catch {
      // ignore fallback replay failure
    }
  }

  const opening =
    getTag('Opening') ||
    parseOpeningFromEcoUrl(getTag('ECOUrl')) ||
    (sans ? detectOpeningFromMoves(sans) : undefined);

  return {
    whiteName: getTag('White'),
    blackName: getTag('Black'),
    whiteRating:
      Number.isFinite(whiteRatingRaw) && whiteRatingRaw > 0 ? whiteRatingRaw : undefined,
    blackRating:
      Number.isFinite(blackRatingRaw) && blackRatingRaw > 0 ? blackRatingRaw : undefined,
    opening,
    eco,
    speed: speedTag ? speedTag.toLowerCase() : inferSpeedFromTimeControl(timeControl, event),
    timeControl,
    termination,
    result: result && result !== '*' ? result : undefined,
  };
}

/**
 * Classifies a move using Chess.com / Lichess Win%-Loss Expected Points & Stockfish 19 evaluations,
 * with dampened centipawn-loss awareness in already-decided positions so hanging pieces and missed
 * mates are never mislabeled as Best or Good.
 */
export function classifyMoveFromAnalysis(params: {
  move: EvaluatedMove;
  before: PositionAnalysisSnapshot;
  after: PositionAnalysisSnapshot;
  plyIndex: number;
  wasBook: boolean;
}): EvaluatedMove {
  const { move, before, after, plyIndex, wasBook } = params;
  const color = move.color;
  const moverSign = color === 'w' ? 1 : -1;

  const evalBefore = before.evalCp;
  const evalAfter = after.evalCp;
  const winBeforeMover = evalToMoverWinPercent(evalBefore, color, before.mateIn);
  const winAfterMover = evalToMoverWinPercent(evalAfter, color, after.mateIn);
  const winLoss = Math.max(0, Math.round((winBeforeMover - winAfterMover) * 10) / 10);

  const bestSan = before.bestMoveSan || move.bestMoveSan || move.san;
  const bestFrom = before.bestMoveFrom || move.bestMoveFrom || move.from;
  const bestTo = before.bestMoveTo || move.bestMoveTo || move.to;
  const playedIsBest =
    move.san === bestSan || (move.from === bestFrom && move.to === bestTo);

  const moverHadForcedMate =
    before.mateIn !== null && (color === 'w' ? before.mateIn > 0 : before.mateIn < 0);
  const moverStillHasForcedMate =
    after.mateIn !== null && (color === 'w' ? after.mateIn > 0 : after.mateIn < 0);
  const oppNowHasForcedMate =
    after.mateIn !== null && (color === 'w' ? after.mateIn < 0 : after.mateIn > 0);
  const oppAlreadyHadForcedMate =
    before.mateIn !== null && (color === 'w' ? before.mateIn < 0 : before.mateIn > 0);

  const missedForcedMate = !playedIsBest && moverHadForcedMate && !moverStillHasForcedMate;
  const delayedShortMate =
    !playedIsBest &&
    moverHadForcedMate &&
    moverStillHasForcedMate &&
    Math.abs(after.mateIn ?? 1) > Math.abs(before.mateIn ?? 1) + 2;
  const allowedFasterMate =
    !playedIsBest &&
    oppAlreadyHadForcedMate &&
    oppNowHasForcedMate &&
    Math.abs(after.mateIn ?? 1) + 2 < Math.abs(before.mateIn ?? 1);

  // Calibrated centipawn loss across normal, decided, and forced-mate positions
  let cpLoss = 0;
  if (!playedIsBest) {
    if (moverHadForcedMate && moverStillHasForcedMate) {
      cpLoss = delayedShortMate
        ? Math.min(350, (Math.abs(after.mateIn ?? 1) - Math.abs(before.mateIn ?? 1)) * 65)
        : 0;
    } else if (oppAlreadyHadForcedMate && oppNowHasForcedMate) {
      cpLoss = allowedFasterMate
        ? Math.min(300, (Math.abs(before.mateIn ?? 1) - Math.abs(after.mateIn ?? 1)) * 55)
        : 0;
    } else if (missedForcedMate) {
      cpLoss = Math.max(
        260,
        Math.min(2500, Math.round(1200 - Math.max(-500, evalAfter * moverSign))),
      );
    } else if (oppNowHasForcedMate && !oppAlreadyHadForcedMate) {
      cpLoss = Math.max(
        400,
        Math.min(2500, Math.round(1200 + Math.max(-500, evalBefore * moverSign))),
      );
    } else {
      const rawCpDelta = (evalBefore - evalAfter) * moverSign;
      cpLoss = Math.max(0, Math.min(2500, Math.round(rawCpDelta)));
    }
  }

  // Dampened centipawn-equivalent Win% loss prevents logistic saturation at |eval| > 600
  // from hiding hung pieces or blunders as "Best" moves.
  const absEvalBefore = Math.abs(evalBefore) >= 90000 ? 1400 : Math.abs(evalBefore);
  const decidedDampening = 1 / (1 + Math.max(0, absEvalBefore - 300) / 600);
  const dampenedCpLoss = cpLoss * decidedDampening;
  const cpEquivalentWinLoss =
    !playedIsBest && dampenedCpLoss > 0
      ? 50 * (2 / (1 + Math.exp(-0.00368208 * dampenedCpLoss)) - 1)
      : 0;

  let effectiveWinLoss = Math.round(Math.max(winLoss, cpEquivalentWinLoss) * 10) / 10;
  if (missedForcedMate) {
    effectiveWinLoss = Math.max(effectiveWinLoss, 14.5);
  } else if (oppNowHasForcedMate && !oppAlreadyHadForcedMate && !playedIsBest) {
    effectiveWinLoss = Math.max(effectiveWinLoss, 16.5);
  } else if (delayedShortMate) {
    effectiveWinLoss = Math.max(effectiveWinLoss, 11.0);
  }

  let legalCount = 2;
  try {
    legalCount = new Chess(move.fenBefore).moves().length;
  } catch {
    legalCount = 2;
  }

  const secondBest = before.lines.length > 1 ? before.lines[1] : null;
  const secondBestWin = secondBest
    ? evalToMoverWinPercent(secondBest.evalCp, color, secondBest.mateIn)
    : null;
  const secondBestWinDrop =
    secondBestWin !== null ? Math.max(0, winBeforeMover - secondBestWin) : 0;

  // Exact Static Exchange Evaluation (SEE) on `move.to` for genuine Brilliant (!!) sacrifice detection
  let seeOnToCp = 0;
  let hasLegalOppCaptureOnTo = false;
  try {
    const beforeProbe = new Chess(move.fenBefore);
    const playedMove = beforeProbe.move({
      from: move.from,
      to: move.to,
      promotion: 'q',
    });
    const capturedOnMoveCp = playedMove?.captured
      ? PIECE_MATERIAL_CP[playedMove.captured]
      : 0;
    const gains: number[] = [capturedOnMoveCp];

    const sim = new Chess(move.fenAfter);
    for (let ply = 0; ply < 6; ply++) {
      const caps = sim
        .moves({ verbose: true })
        .filter((m) => m.to === move.to && Boolean(m.captured));
      if (caps.length === 0) break;
      caps.sort(
        (a, b) => PIECE_MATERIAL_CP[a.piece] - PIECE_MATERIAL_CP[b.piece],
      );
      const cheapest = caps[0];
      const capVal = cheapest.captured ? PIECE_MATERIAL_CP[cheapest.captured] : 0;
      if (ply === 0) hasLegalOppCaptureOnTo = true;
      gains.push(capVal);
      sim.move(cheapest);
    }

    let tailScore = 0;
    for (let i = gains.length - 1; i >= 1; i--) {
      tailScore = Math.max(0, gains[i] - tailScore);
    }
    seeOnToCp = gains[0] - tailScore;
  } catch {
    seeOnToCp = 0;
  }

  const isSoundSacrifice =
    !wasBook &&
    plyIndex >= 6 &&
    legalCount > 1 &&
    hasLegalOppCaptureOnTo &&
    seeOnToCp <= -190 &&
    winBeforeMover < 93 &&
    winAfterMover >= 50 &&
    (playedIsBest || effectiveWinLoss <= 1.8);

  const isMissedWin =
    !playedIsBest &&
    (missedForcedMate || (winBeforeMover >= 80 && winAfterMover <= 62 && winAfterMover >= 32));

  let quality: MoveQuality = 'Good';
  let classificationNote: string | undefined;

  if (wasBook && effectiveWinLoss <= 4.5 && cpLoss <= 80) {
    quality = 'Book';
    classificationNote = 'Standard opening theory';
  } else if (isSoundSacrifice) {
    quality = 'Brilliant';
    classificationNote = 'Sound tactical sacrifice maintaining the initiative!';
  } else if (
    !wasBook &&
    legalCount > 1 &&
    playedIsBest &&
    ((secondBestWinDrop >= 11.5 && winAfterMover >= 38) ||
      (winBeforeMover <= 42 && winAfterMover >= 50) ||
      (moverHadForcedMate && (!secondBest || secondBest.mateIn === null)))
  ) {
    quality = 'Great';
    classificationNote = 'Only move! Finds the critical continuation.';
  } else if (
    playedIsBest ||
    (effectiveWinLoss <= 0.6 &&
      cpLoss <= 12 &&
      !missedForcedMate &&
      !delayedShortMate &&
      !(oppNowHasForcedMate && !oppAlreadyHadForcedMate))
  ) {
    quality = 'Best';
  } else if (
    (oppNowHasForcedMate && !oppAlreadyHadForcedMate && (winBeforeMover >= 12 || cpLoss >= 350)) ||
    (winBeforeMover >= 70 && winAfterMover < 32)
  ) {
    quality = 'Blunder';
    if (oppNowHasForcedMate && !oppAlreadyHadForcedMate) {
      classificationNote = `Allows checkmate in ${Math.abs(after.mateIn ?? 1)}`;
    } else {
      classificationNote = `Threw away a winning game — ${bestSan} kept full control`;
    }
  } else if (isMissedWin && !oppNowHasForcedMate) {
    quality = 'Miss';
    classificationNote = missedForcedMate
      ? `Missed forced checkmate — ${bestSan} wins on the spot`
      : `Missed winning chance — ${bestSan} kept a decisive edge`;
  } else if (
    effectiveWinLoss > 20.5 ||
    (cpLoss >= 450 && effectiveWinLoss >= 14.5)
  ) {
    quality = 'Blunder';
    if (cpLoss >= 280) {
      classificationNote = `Drops decisive material — ${bestSan} was much stronger`;
    }
  } else if (
    effectiveWinLoss > 10.5 ||
    (cpLoss >= 220 && effectiveWinLoss >= 8.0) ||
    delayedShortMate
  ) {
    quality = 'Mistake';
    if (delayedShortMate) {
      classificationNote = `Delayed forced mate — ${bestSan} finished much faster`;
    }
  } else if (effectiveWinLoss > 5.0 || cpLoss > 110) {
    quality = 'Inaccuracy';
  } else if (effectiveWinLoss > 2.0 || cpLoss > 45) {
    quality = 'Good';
  } else {
    quality = 'Excellent';
  }

  const accuracyPercent =
    quality === 'Book' || quality === 'Brilliant' || quality === 'Great' || quality === 'Best'
      ? computeMoveAccuracyPercent(playedIsBest ? 0 : Math.min(effectiveWinLoss, 0.8))
      : computeMoveAccuracyPercent(effectiveWinLoss);

  return {
    ...move,
    evalCp: evalAfter,
    mateIn: after.mateIn,
    bestMoveSan: bestSan,
    bestMoveFrom: bestFrom,
    bestMoveTo: bestTo,
    bestLineSan: before.lines[0]?.lineSan ?? [bestSan],
    cpLoss,
    quality,
    winChanceBefore: winBeforeMover,
    winChanceAfter: winAfterMover,
    accuracyPercent,
    isMissedWin,
    evalDepth: Math.min(before.depth || 14, after.depth || 14),
    evalSource: before.source,
    classificationNote,
  };
}
