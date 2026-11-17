import { Chess, type PieceSymbol } from 'chess.js';
import type { LeagueStatus, RatingHistoryMap } from './onlineHelpers';

export interface LichessRawPuzzle {
  game?: {
    id?: string;
    clock?: string;
    pgn?: string;
    perf?: { key?: string; name?: string };
    players?: Array<{ name?: string; color?: string; rating?: number; title?: string }>;
  };
  puzzle: {
    id: string;
    rating: number;
    plays?: number;
    solution: string[];
    themes?: string[];
    fen?: string;
    lastMove?: string;
    initialPly?: number;
  };
}

export interface NormalizedLichessPuzzle {
  id: string;
  title: string;
  rating: number;
  motif: string;
  themes: string[];
  fen: string;
  solution: string[];
  lastMove: { from: string; to: string } | null;
  hint: string;
  explanation: string;
  plays: number;
  playersSummary: string;
  lichessUrl: string;
}

const THEME_LABELS: Record<string, string> = {
  fork: 'Fork / Double Attack',
  pin: 'Pin',
  skewer: 'Skewer',
  mateIn1: 'Mate in 1',
  mateIn2: 'Mate in 2',
  mateIn3: 'Mate in 3',
  backRankMate: 'Back-Rank Mate',
  smotheredMate: 'Smothered Mate',
  sacrifice: 'Tactical Sacrifice',
  deflection: 'Deflection',
  discoveredAttack: 'Discovered Attack',
  hangingPiece: 'Hanging Piece',
  endgame: 'Endgame Tactic',
  knightEndgame: 'Knight Endgame',
  rookEndgame: 'Rook Endgame',
  pawnEndgame: 'Pawn Endgame',
  crushing: 'Crushing Blow',
  advantage: 'Winning Advantage',
  defensiveMove: 'Only Defense',
  middlegame: 'Middlegame Tactic',
  opening: 'Opening Trap',
  trappedPiece: 'Trapped Piece',
  attraction: 'Attraction',
  clearance: 'Clearance',
  xRayAttack: 'X-Ray Attack',
  intermezzo: 'In-Between Move',
  quietMove: 'Quiet Move',
  promotion: 'Promotion Tactic',
  pillsburysMate: "Pillsbury's Mate",
  morphysMate: "Morphy's Mate",
  swallowstailMate: "Swallow's Tail Mate",
  triangleMate: 'Triangle Mate',
  balestraMate: 'Balestra Mate',
  blindSwineMate: 'Blind Swine Mate',
  cornerMate: 'Corner Mate',
};

export function formatLichessTheme(theme: string): string {
  if (THEME_LABELS[theme]) return THEME_LABELS[theme];
  return theme
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

export function derivePositionFromPgn(
  pgn: string,
  initialPly?: number,
): { fen: string; lastMove: { from: string; to: string } | null } {
  const full = new Chess();
  full.loadPgn(pgn);
  const history = full.history({ verbose: true });
  const targetCount =
    typeof initialPly === 'number' && initialPly >= 0
      ? Math.min(history.length, initialPly + 1)
      : history.length;

  const replay = new Chess();
  let lastMove: { from: string; to: string } | null = null;
  for (let i = 0; i < targetCount; i++) {
    const played = replay.move(history[i].san);
    if (played) {
      lastMove = { from: played.from, to: played.to };
    }
  }
  return { fen: replay.fen(), lastMove };
}

export function uciLineToSan(fen: string, uciMoves: string[]): string[] {
  const chess = new Chess(fen);
  const sanMoves: string[] = [];

  for (const uci of uciMoves) {
    if (!uci || uci.length < 4) {
      throw new Error(`Invalid UCI move "${uci}"`);
    }
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? (uci[4] as PieceSymbol) : undefined;
    const played = chess.move({ from, to, promotion });
    if (!played) {
      throw new Error(`Illegal UCI move "${uci}" from FEN "${chess.fen()}"`);
    }
    sanMoves.push(played.san);
  }

  return sanMoves;
}

export function convertLichessPayload(
  raw: LichessRawPuzzle,
  preferredTheme?: string,
): NormalizedLichessPuzzle {
  const { puzzle, game } = raw;

  let fen = puzzle.fen ?? '';
  let lastMove: { from: string; to: string } | null =
    puzzle.lastMove && puzzle.lastMove.length >= 4
      ? { from: puzzle.lastMove.slice(0, 2), to: puzzle.lastMove.slice(2, 4) }
      : null;

  if (!fen && game?.pgn) {
    const derived = derivePositionFromPgn(game.pgn, puzzle.initialPly);
    fen = derived.fen;
    if (!lastMove) lastMove = derived.lastMove;
  }

  if (!fen) {
    throw new Error(`Puzzle ${puzzle.id} missing FEN and PGN`);
  }

  const solution = uciLineToSan(fen, puzzle.solution);

  const rawThemes = puzzle.themes ?? [];
  const cleanPref =
    preferredTheme &&
    preferredTheme !== 'daily' &&
    preferredTheme !== 'next' &&
    preferredTheme !== 'mix'
      ? preferredTheme
      : undefined;
  const primaryTheme =
    (cleanPref && rawThemes.includes(cleanPref) ? cleanPref : undefined) ??
    (rawThemes.includes('attraction') ? 'attraction' : undefined) ??
    rawThemes.find(
      (t) =>
        t !== 'short' &&
        t !== 'long' &&
        t !== 'oneMove' &&
        t !== 'veryLong' &&
        t !== 'middlegame' &&
        t !== 'advantage' &&
        t !== 'crushing',
    ) ??
    rawThemes[0] ??
    'tactics';

  const motif = formatLichessTheme(primaryTheme);
  const readableThemes = rawThemes.slice(0, 4).map(formatLichessTheme);

  const white = game?.players?.find((p) => p.color === 'white');
  const black = game?.players?.find((p) => p.color === 'black');
  const playersSummary =
    white && black
      ? `${white.name ?? 'White'} (${white.rating ?? '?'}) vs ${black.name ?? 'Black'} (${black.rating ?? '?'})`
      : 'Live Online Game';

  return {
    id: `puzzle-${puzzle.id}`,
    title: `Puzzle #${puzzle.id}`,
    rating: puzzle.rating,
    motif,
    themes: readableThemes,
    fen,
    solution,
    lastMove,
    hint: `Look for a ${motif.toLowerCase()} starting with your ${solution[0]?.[0] === 'N' ? 'Knight' : solution[0]?.[0] === 'B' ? 'Bishop' : solution[0]?.[0] === 'R' ? 'Rook' : solution[0]?.[0] === 'Q' ? 'Queen' : solution[0]?.[0] === 'K' ? 'King' : 'pawn or forcing piece'}.`,
    explanation: `Winning sequence: ${solution.join(' -> ')}. Themes: ${readableThemes.join(', ')}.`,
    plays: puzzle.plays ?? 0,
    playersSummary,
    lichessUrl: `https://lichess.org/training/${puzzle.id}`,
  };
}

export interface LichessCloudEvalRaw {
  fen: string;
  knodes?: number;
  depth?: number;
  pvs?: Array<{
    moves: string;
    cp?: number;
    mate?: number;
  }>;
}

export interface CloudEvalLine {
  evalText: string;
  evalCp: number;
  firstMoveFrom: string;
  firstMoveTo: string;
  firstMoveSan: string;
  lineSan: string[];
}

export interface CloudEvalSummary {
  source?: 'lichess-cloud' | 'stockfish-17' | 'stockfish-19-nnue';
  depth: number;
  knodes: number;
  lines: CloudEvalLine[];
}

export interface ChessApiEvalRaw {
  fen?: string;
  move?: string;
  eval?: number;
  centipawns?: string | number;
  mate?: number | null;
  depth?: number;
  continuationArr?: string[];
}

export function convertCloudEvalPayload(raw: LichessCloudEvalRaw): CloudEvalSummary {
  const pvs = raw.pvs ?? [];
  const lines: CloudEvalLine[] = [];

  for (const pv of pvs.slice(0, 3)) {
    const uciTokens = (pv.moves ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
    if (uciTokens.length === 0) continue;
    try {
      const sanMoves = uciLineToSan(raw.fen, uciTokens);
      const firstUci = uciTokens[0];
      const evalCp =
        typeof pv.mate === 'number'
          ? pv.mate > 0
            ? 100000
            : -100000
          : typeof pv.cp === 'number'
            ? pv.cp
            : 0;
      const evalText =
        typeof pv.mate === 'number'
          ? `#${Math.abs(pv.mate)}`
          : `${evalCp >= 0 ? '+' : ''}${(evalCp / 100).toFixed(2)}`;

      lines.push({
        evalText,
        evalCp,
        firstMoveFrom: firstUci.slice(0, 2),
        firstMoveTo: firstUci.slice(2, 4),
        firstMoveSan: sanMoves[0],
        lineSan: sanMoves,
      });
    } catch {
      // Skip malformed line
    }
  }

  return {
    source: 'lichess-cloud',
    depth: raw.depth ?? 0,
    knodes: raw.knodes ?? 0,
    lines,
  };
}

export function convertChessApiPayload(fen: string, raw: ChessApiEvalRaw): CloudEvalSummary {
  const uciTokens = [raw.move ?? '', ...(raw.continuationArr ?? [])]
    .map((t) => t.trim())
    .filter((t) => t.length >= 4)
    .slice(0, 6);

  const lines: CloudEvalLine[] = [];
  if (uciTokens.length > 0) {
    try {
      const sanMoves = uciLineToSan(fen, uciTokens);
      const firstUci = uciTokens[0];
      const parsedCp =
        typeof raw.centipawns === 'number'
          ? raw.centipawns
          : typeof raw.centipawns === 'string' && raw.centipawns !== ''
            ? Number(raw.centipawns)
            : typeof raw.eval === 'number'
              ? Math.round(raw.eval * 100)
              : 0;

      const evalCp =
        typeof raw.mate === 'number'
          ? raw.mate > 0
            ? 100000
            : -100000
          : Number.isFinite(parsedCp)
            ? parsedCp
            : 0;

      const evalText =
        typeof raw.mate === 'number'
          ? `#${Math.abs(raw.mate)}`
          : `${evalCp >= 0 ? '+' : ''}${(evalCp / 100).toFixed(2)}`;

      lines.push({
        evalText,
        evalCp,
        firstMoveFrom: firstUci.slice(0, 2),
        firstMoveTo: firstUci.slice(2, 4),
        firstMoveSan: sanMoves[0],
        lineSan: sanMoves,
      });
    } catch {
      // ignore invalid continuation
    }
  }

  return {
    source: 'stockfish-17',
    depth: raw.depth ?? 15,
    knodes: 0,
    lines,
  };
}

export interface LichessPerfs {
  bullet?: { rating: number; games: number; rd?: number; prog?: number; prov?: boolean };
  blitz?: { rating: number; games: number; rd?: number; prog?: number; prov?: boolean };
  rapid?: { rating: number; games: number; rd?: number; prog?: number; prov?: boolean };
  classical?: { rating: number; games: number; rd?: number; prog?: number; prov?: boolean };
  correspondence?: { rating: number; games: number; rd?: number; prog?: number; prov?: boolean };
  puzzle?: { rating: number; games: number; rd?: number; prog?: number; prov?: boolean };
  storm?: { runs: number; score: number };
  streak?: { runs: number; score: number };
}

export interface LichessAccount {
  id: string;
  username: string;
  email?: string;
  canonicalEmail?: string;
  emailVerified?: boolean;
  isLocalOpenChessAccount?: boolean;
  title?: string;
  url?: string;
  createdAt?: number;
  seenAt?: number;
  online?: boolean;
  playTime?: { total: number; tv?: number };
  profile?: {
    bio?: string;
    country?: string;
    flag?: string;
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  };
  perfs?: LichessPerfs;
  count?: {
    all: number;
    win: number;
    loss: number;
    draw: number;
    rated?: number;
  };
  leaguePoints?: number;
  ratingHistory?: Partial<RatingHistoryMap>;
}

export interface LichessFriendStatus {
  username: string;
  title?: string;
  flag?: string;
  bio?: string;
  avatarUrl?: string;
  online: boolean;
  seenAt?: number;
  createdAt?: number;
  leaguePoints?: number;
  league?: LeagueStatus;
  bestSpeed: 'rapid' | 'blitz' | 'bullet' | 'correspondence' | 'classical';
  bestRating: number;
  perfs: {
    rapid?: { rating: number; games: number };
    blitz?: { rating: number; games: number };
    bullet?: { rating: number; games: number };
    correspondence?: { rating: number; games: number };
    classical?: { rating: number; games: number };
    puzzle?: { rating: number; games: number };
  };
}

export interface LichessTvChannel {
  channel: string;
  label: string;
  gameId: string;
  user: string;
  title?: string;
  rating: number;
  color: 'white' | 'black';
}

export interface LichessUserGame {
  id: string;
  rated: boolean;
  speed: string;
  status: string;
  winner?: 'white' | 'black';
  white: { name: string; rating?: number; title?: string; avatarUrl?: string; flag?: string };
  black: { name: string; rating?: number; title?: string; avatarUrl?: string; flag?: string };
  pgn: string;
  opening?: string;
  createdAt?: number;
  lastMoveAt?: number;
}

export interface ParsedLichessBoardState {
  fen: string;
  pgn: string;
  lastMove: { from: string; to: string; san: string; captured?: boolean } | null;
  plyCount: number;
  turn: 'w' | 'b';
  isCheckmate: boolean;
  isDraw: boolean;
}

export function parseUciMovesToGameState(
  movesString: string,
  initialFen?: string,
): ParsedLichessBoardState {
  const chess = initialFen && initialFen !== 'startpos' ? new Chess(initialFen) : new Chess();
  const tokens = movesString
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 4);

  let lastMove: ParsedLichessBoardState['lastMove'] = null;

  for (const uci of tokens) {
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? (uci[4] as PieceSymbol) : undefined;
    try {
      const m = chess.move({ from, to, promotion });
      if (m) {
        lastMove = {
          from: m.from,
          to: m.to,
          san: m.san,
          captured: Boolean(m.captured) || m.flags.includes('e'),
        };
      }
    } catch {
      break;
    }
  }

  return {
    fen: chess.fen(),
    pgn: chess.pgn(),
    lastMove,
    plyCount: chess.history().length,
    turn: chess.turn(),
    isCheckmate: chess.isCheckmate(),
    isDraw: chess.isDraw(),
  };
}


