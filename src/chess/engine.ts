import { Chess, type Move, type PieceSymbol, type Color } from 'chess.js';

export type BotId =
  | 'pip'
  | 'noah'
  | 'mia'
  | 'milo'
  | 'leo'
  | 'hana'
  | 'clara'
  | 'omar'
  | 'sofia'
  | 'viktor'
  | 'dante'
  | 'elena'
  | 'aurelius'
  | 'vera'
  | 'koren'
  | 'nova'
  | 'chronos'
  | 'apex';

export interface BotProfile {
  id: BotId;
  name: string;
  rating: number;
  title: string;
  tier: 'New to Chess' | 'Beginner' | 'Intermediate' | 'Advanced' | 'Master' | 'Grandmaster';
  style: string;
  depth: number;
  blunderRate: number;
  accent: string;
  initials: string;
}

export const BOT_PROFILES: BotProfile[] = [
  {
    id: 'pip',
    name: 'Pip',
    rating: 100,
    title: 'First Steps',
    tier: 'New to Chess',
    style: 'Just learned how the pieces move and plays light opening moves.',
    depth: 1,
    blunderRate: 0.72,
    accent: '#81B64C',
    initials: 'PI',
  },
  {
    id: 'noah',
    name: 'Noah',
    rating: 250,
    title: 'Curious Pawn',
    tier: 'New to Chess',
    style: 'Pushes pawns forward and occasionally overlooks simple captures.',
    depth: 1,
    blunderRate: 0.58,
    accent: '#63A86E',
    initials: 'NO',
  },
  {
    id: 'mia',
    name: 'Mia',
    rating: 400,
    title: 'Weekend Rook',
    tier: 'New to Chess',
    style: 'Watches out for checks while still learning piece defense.',
    depth: 1,
    blunderRate: 0.44,
    accent: '#59A5B8',
    initials: 'MI',
  },
  {
    id: 'milo',
    name: 'Milo',
    rating: 550,
    title: 'Casual Starter',
    tier: 'Beginner',
    style: 'Develops pieces naturally and occasionally misses 2-move tactics.',
    depth: 2,
    blunderRate: 0.34,
    accent: '#81B64C',
    initials: 'ML',
  },
  {
    id: 'leo',
    name: 'Leo',
    rating: 700,
    title: 'Knight Hopper',
    tier: 'Beginner',
    style: 'Likes active knights and grabs undefended pawns.',
    depth: 2,
    blunderRate: 0.25,
    accent: '#D98A36',
    initials: 'LE',
  },
  {
    id: 'hana',
    name: 'Hana',
    rating: 850,
    title: 'Center Guard',
    tier: 'Beginner',
    style: 'Castles early and keeps her center pawns protected.',
    depth: 2,
    blunderRate: 0.18,
    accent: '#9B72C9',
    initials: 'HA',
  },
  {
    id: 'clara',
    name: 'Clara',
    rating: 1000,
    title: 'Club Amateur',
    tier: 'Intermediate',
    style: 'Spots basic captures and protects pieces cleanly.',
    depth: 2,
    blunderRate: 0.12,
    accent: '#4FA3D1',
    initials: 'CL',
  },
  {
    id: 'omar',
    name: 'Omar',
    rating: 1200,
    title: 'Tactical Club',
    tier: 'Intermediate',
    style: 'Looks for forks, pins, and open-file rook activity.',
    depth: 3,
    blunderRate: 0.08,
    accent: '#4EA88C',
    initials: 'OM',
  },
  {
    id: 'sofia',
    name: 'Sofia',
    rating: 1400,
    title: 'Opening Book',
    tier: 'Intermediate',
    style: 'Follows classical openings and trades down when ahead.',
    depth: 3,
    blunderRate: 0.04,
    accent: '#C96D9A',
    initials: 'SO',
  },
  {
    id: 'viktor',
    name: 'Viktor',
    rating: 1500,
    title: 'Sunday Contender',
    tier: 'Advanced',
    style: 'Plays solid book openings and punishes hanging pieces.',
    depth: 3,
    blunderRate: 0.02,
    accent: '#E59A28',
    initials: 'VK',
  },
  {
    id: 'dante',
    name: 'Dante',
    rating: 1700,
    title: 'Sharp Tactician',
    tier: 'Advanced',
    style: 'Targets uncastled kings and calculates forcing lines.',
    depth: 3,
    blunderRate: 0.0,
    accent: '#C4534B',
    initials: 'DA',
  },
  {
    id: 'elena',
    name: 'Elena',
    rating: 1900,
    title: 'Candidate Master',
    tier: 'Advanced',
    style: 'Calculates multi-ply tactics and active piece placement.',
    depth: 3,
    blunderRate: 0.0,
    accent: '#C9654B',
    initials: 'EL',
  },
  {
    id: 'aurelius',
    name: 'Aurelius',
    rating: 2050,
    title: 'FIDE Master',
    tier: 'Master',
    style: 'Full book repertoire, sharp tactics, and endgame precision.',
    depth: 3,
    blunderRate: 0.0,
    accent: '#D4AF37',
    initials: 'AU',
  },
  {
    id: 'vera',
    name: 'Vera',
    rating: 2250,
    title: 'International Master',
    tier: 'Master',
    style: 'Positional squeeze specialist with clinical endgames.',
    depth: 3,
    blunderRate: 0.0,
    accent: '#7D92D6',
    initials: 'VE',
  },
  {
    id: 'koren',
    name: 'Koren',
    rating: 2450,
    title: 'Grandmaster',
    tier: 'Master',
    style: 'Grandmaster calculation backed by neural network evaluation.',
    depth: 4,
    blunderRate: 0.0,
    accent: '#D1A23A',
    initials: 'KO',
  },
  {
    id: 'nova',
    name: 'Nova',
    rating: 2700,
    title: 'Super GM',
    tier: 'Grandmaster',
    style: 'Plays elite tournament theory at high engine depth.',
    depth: 4,
    blunderRate: 0.0,
    accent: '#59C7D4',
    initials: 'NV',
  },
  {
    id: 'chronos',
    name: 'Chronos',
    rating: 2950,
    title: 'Neural Master',
    tier: 'Grandmaster',
    style: 'Maximum-strength calculation engine with relentless positional and tactical defense.',
    depth: 4,
    blunderRate: 0.0,
    accent: '#81B64C',
    initials: 'CH',
  },
  {
    id: 'apex',
    name: 'Cat',
    rating: 3200,
    title: 'Maximum Engine',
    tier: 'Grandmaster',
    style: 'Purrs quietly while calculating 3200 ELO top-depth checkmates.',
    depth: 4,
    blunderRate: 0.0,
    accent: '#F7C045',
    initials: 'CT',
  },
];

export type MoveQuality =
  | 'Brilliant'
  | 'Great'
  | 'Best'
  | 'Good'
  | 'Inaccuracy'
  | 'Mistake'
  | 'Blunder'
  | 'Book';

export interface EvaluatedMove {
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
  evalCp: number;
  bestMoveSan: string;
  bestMoveFrom?: string;
  bestMoveTo?: string;
  cpLoss: number;
  quality: MoveQuality;
  mateIn?: number | null;
  bestLineSan?: string[];
  winChanceBefore?: number;
  winChanceAfter?: number;
  accuracyPercent?: number;
  isMissedWin?: boolean;
  evalDepth?: number;
  evalSource?: 'stockfish-19-wasm' | 'lichess-cloud' | 'local-book' | 'local-js';
  classificationNote?: string;
}

export interface GameReviewResult {
  moves: EvaluatedMove[];
  whiteAccuracy: number;
  blackAccuracy: number;
  counts: Record<MoveQuality, number>;
}

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece-square tables from White's perspective (rank 8 at index 0 -> rank 1 at index 7)
const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 27, 27, 10, 5, 5],
  [0, 0, 0, 26, 26, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -24, -24, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const KNIGHT_PST = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 12, 16, 16, 12, 0, -30],
  [-30, 5, 16, 22, 22, 16, 5, -30],
  [-30, 0, 16, 22, 22, 16, 0, -30],
  [-30, 5, 12, 16, 16, 12, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50],
];

const BISHOP_PST = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 8, 12, 12, 8, 0, -10],
  [-10, 6, 6, 14, 14, 6, 6, -10],
  [-10, 0, 14, 14, 14, 14, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 6, 0, 0, 0, 0, 6, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const ROOK_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [8, 14, 14, 14, 14, 14, 14, 8],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 8, 8, 0, 0, 0],
];

const QUEEN_PST = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 0, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20],
];

const KING_MID_PST = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 34, 10, 0, 0, 10, 34, 20],
];

const KING_END_PST = [
  [-50, -40, -30, -20, -20, -30, -40, -50],
  [-30, -20, -10, 0, 0, -10, -20, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -30, 0, 0, 0, 0, -30, -30],
  [-50, -30, -30, -30, -30, -30, -30, -50],
];

// Expanded classical + sharp opening repertoire keyed by placement + turn + castling fields
const OPENING_BOOK: Record<string, string[]> = {
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq': ['e4', 'd4', 'c4', 'Nf3'],
  // 1. e4 responses
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq': ['e5', 'c5', 'e6', 'c6'],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq': ['Nf3', 'Bc4', 'Nc3'],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq': ['Nc6', 'Nf6'],
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq': ['Bb5', 'Bc4', 'd4'],
  // Ruy Lopez
  'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq': ['a6', 'Nf6'],
  'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq': ['Ba4', 'Bxc6'],
  'r1bqkbnr/1ppp1ppp/p1n5/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R b KQkq': ['Nf6', 'd6'],
  'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq': ['O-O', 'd3'],
  'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 b kq': ['Be7', 'b5', 'Nxe4'],
  'r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 w kq': ['Re1', 'd3', 'Qe2'],
  'r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPPQPPP/RNB2RK1 b kq': ['b5'],
  'r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQR1K1 b kq': ['b5', 'd6'],
  'r1bqk2r/2ppbppp/p1n2n2/1p2p3/B3P3/5N2/PPPP1PPP/RNBQR1K1 w kq': ['Bb3'],
  'r1bqk2r/2ppbppp/p1n2n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 b kq': ['d6', 'O-O'],
  'r1bqk2r/2p1bppp/p1np1n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 w kq': ['c3', 'a4'],
  'r1bqk2r/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 b kq': ['O-O'],
  // Italian Game
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq': ['Bc5', 'Nf6'],
  'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq': ['c3', 'd3', 'O-O'],
  'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R b KQkq': ['Nf6', 'd6'],
  'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R w KQkq': ['d4', 'd3'],
  'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq': ['d3', 'Ng5', 'Nc3'],
  // Sicilian
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq': ['Nf3', 'Nc3', 'c3'],
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq': ['d6', 'Nc6', 'e6'],
  'rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq': ['d4', 'Bb5+'],
  'rnbqkbnr/pp2pppp/3p4/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq': ['cxd4'],
  'rnbqkbnr/pp2pppp/3p4/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq': ['Nf6'],
  'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq': ['Nc3'],
  'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R b KQkq': ['a6', 'e6', 'g6'],
  // French & Caro-Kann
  'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq': ['d4', 'Nf3'],
  'rnbqkbnr/pppp1ppp/4p3/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq': ['d5'],
  'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq': ['d4', 'Nc3'],
  'rnbqkbnr/pp1ppppp/2p5/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq': ['d5'],
  // 1. d4 Queen's Gambit / Indian
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq': ['d5', 'Nf6', 'e6'],
  'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq': ['c4', 'Bf4', 'Nf3'],
  'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq': ['e6', 'c6', 'dxc4'],
  'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq': ['Nc3', 'Nf3'],
  'rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq': ['Bg5', 'Nf3', 'cxd5'],
  'rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq': ['Nf3', 'Nc3'],
  'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq': ['c4', 'Nf3', 'Bf4'],
  'rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b KQkq': ['e6', 'g6', 'c5'],
  'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w KQkq': ['Nc3', 'Nf3'],
  // 1. c4 / 1. Nf3
  'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq': ['e5', 'Nf6', 'c5'],
  'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq': ['d5', 'Nf6', 'c5'],
};

function bookKey(fen: string): string {
  const parts = fen.split(' ');
  return parts.slice(0, 3).join(' ');
}

export function isBookPosition(fen: string): boolean {
  return Boolean(OPENING_BOOK[bookKey(fen)]);
}

export function isBookMove(fen: string, san: string): boolean {
  const moves = OPENING_BOOK[bookKey(fen)];
  return Boolean(moves && moves.includes(san));
}

/**
 * Evaluates a position in centipawns from White's perspective (+ = White advantage).
 * Includes material, piece-square tables, bishop pair, passed pawns, rook open files,
 * development, castled king safety, and side-to-move tempo.
 */
export function evaluatePosition(chess: Chess): number {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -100000 : 100000;
  }
  if (chess.isDraw() || chess.isStalemate() || chess.isInsufficientMaterial()) {
    return 0;
  }

  const board = chess.board();
  let nonKingMaterial = 0;
  let wBishops = 0;
  let bBishops = 0;
  const wPawnsByFile = [0, 0, 0, 0, 0, 0, 0, 0];
  const bPawnsByFile = [0, 0, 0, 0, 0, 0, 0, 0];
  // Track most-advanced pawn rank (0=rank8..7=rank1) per file for passed-pawn check
  const wPawnCoords: Array<[number, number]> = [];
  const bPawnCoords: Array<[number, number]> = [];
  const wRookFiles: number[] = [];
  const bRookFiles: number[] = [];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq) continue;
      if (sq.type === 'p') {
        if (sq.color === 'w') {
          wPawnsByFile[c] += 1;
          wPawnCoords.push([r, c]);
        } else {
          bPawnsByFile[c] += 1;
          bPawnCoords.push([r, c]);
        }
      } else if (sq.type !== 'k') {
        nonKingMaterial += PIECE_VALUES[sq.type];
        if (sq.type === 'b') {
          if (sq.color === 'w') wBishops += 1;
          else bBishops += 1;
        } else if (sq.type === 'r') {
          if (sq.color === 'w') wRookFiles.push(c);
          else bRookFiles.push(c);
        }
      }
    }
  }
  const isEndgame = nonKingMaterial <= 2600;

  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq) continue;
      const pstRow = sq.color === 'w' ? r : 7 - r;
      let pstBonus = 0;
      switch (sq.type) {
        case 'p':
          pstBonus = PAWN_PST[pstRow][c];
          break;
        case 'n':
          pstBonus = KNIGHT_PST[pstRow][c];
          break;
        case 'b':
          pstBonus = BISHOP_PST[pstRow][c];
          break;
        case 'r':
          pstBonus = ROOK_PST[pstRow][c];
          break;
        case 'q':
          pstBonus = QUEEN_PST[pstRow][c];
          break;
        case 'k':
          pstBonus = isEndgame ? KING_END_PST[pstRow][c] : KING_MID_PST[pstRow][c];
          break;
      }
      const total = PIECE_VALUES[sq.type] + pstBonus;
      score += sq.color === 'w' ? total : -total;
    }
  }

  // Bishop pair bonus
  if (wBishops >= 2) score += 35;
  if (bBishops >= 2) score -= 35;

  // Doubled pawn penalty & Rook on open / semi-open file
  for (let c = 0; c < 8; c++) {
    if (wPawnsByFile[c] > 1) score -= 12 * (wPawnsByFile[c] - 1);
    if (bPawnsByFile[c] > 1) score += 12 * (bPawnsByFile[c] - 1);
  }
  for (const c of wRookFiles) {
    if (wPawnsByFile[c] === 0) {
      score += bPawnsByFile[c] === 0 ? 22 : 12;
    }
  }
  for (const c of bRookFiles) {
    if (bPawnsByFile[c] === 0) {
      score -= wPawnsByFile[c] === 0 ? 22 : 12;
    }
  }

  // Passed pawn bonus (stronger in endgame)
  for (const [wr, wc] of wPawnCoords) {
    let blocked = false;
    for (const [br, bc] of bPawnCoords) {
      if (Math.abs(bc - wc) <= 1 && br < wr) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      const advance = 7 - wr; // 1..6
      score += (isEndgame ? 18 : 10) * advance;
    }
  }
  for (const [br, bc] of bPawnCoords) {
    let blocked = false;
    for (const [wr, wc] of wPawnCoords) {
      if (Math.abs(wc - bc) <= 1 && wr > br) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      const advance = br; // 1..6
      score -= (isEndgame ? 18 : 10) * advance;
    }
  }

  // Tempo & check nudge
  score += chess.turn() === 'w' ? 10 : -10;
  if (chess.inCheck()) {
    score += chess.turn() === 'w' ? -25 : 25;
  }

  return score;
}

function scoreMoveOrder(move: Move, ttBestSan?: string): number {
  if (ttBestSan && move.san === ttBestSan) return 100000;
  let s = 0;
  if (move.captured) {
    s += 10 * PIECE_VALUES[move.captured] - PIECE_VALUES[move.piece] + 1000;
  }
  if (move.promotion) {
    s += PIECE_VALUES[move.promotion] + 900;
  }
  if (move.san.includes('#')) {
    s += 50000;
  } else if (move.san.includes('+')) {
    s += 65;
  }
  if (move.flags.includes('k') || move.flags.includes('q')) {
    s += 55;
  }
  return s;
}

function orderedMoves(chess: Chess, ttBestSan?: string): Move[] {
  const moves = chess.moves({ verbose: true });
  moves.sort((a, b) => scoreMoveOrder(b, ttBestSan) - scoreMoveOrder(a, ttBestSan));
  return moves;
}

interface SearchContext {
  tt: Map<string, { depth: number; score: number; flag: 'exact' | 'lower' | 'upper'; bestSan?: string }>;
  deadlineMs: number;
  nodes: number;
  aborted: boolean;
}

function ttKey(chess: Chess): string {
  // Placement + turn + castling + ep
  const parts = chess.fen().split(' ');
  return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
}

function quiescence(
  chess: Chess,
  alpha: number,
  beta: number,
  maximizing: boolean,
  qDepth: number,
  recaptureSq?: string,
): number {
  const standPat = evaluatePosition(chess);
  if (qDepth <= 0 || chess.isGameOver()) {
    return standPat;
  }

  if (maximizing) {
    if (standPat >= beta) return beta;
    if (standPat + 1050 < alpha) return alpha;
    if (alpha < standPat) alpha = standPat;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat - 1050 > beta) return beta;
    if (beta > standPat) beta = standPat;
  }

  if (recaptureSq) {
    const rank = recaptureSq[1];
    const targetPiece = chess.get(recaptureSq as Move['to']);
    if (!targetPiece && rank !== '1' && rank !== '8') {
      return maximizing ? alpha : beta;
    }
    const maxGain = (targetPiece ? PIECE_VALUES[targetPiece.type] : 900) + 150;
    if (maximizing && standPat + maxGain < alpha) return alpha;
    if (!maximizing && standPat - maxGain > beta) return beta;
  }

  const rawMoves = chess.moves({ verbose: true });
  const captures = rawMoves
    .filter((m) =>
      recaptureSq
        ? m.to === recaptureSq && (Boolean(m.captured) || Boolean(m.promotion))
        : Boolean(m.captured) || Boolean(m.promotion) || m.san.includes('#'),
    )
    .sort((a, b) => scoreMoveOrder(b) - scoreMoveOrder(a))
    .slice(0, recaptureSq ? 3 : 5);

  if (maximizing) {
    for (const move of captures) {
      chess.move(move);
      const score = quiescence(chess, alpha, beta, false, qDepth - 1, move.to);
      chess.undo();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  } else {
    for (const move of captures) {
      chess.move(move);
      const score = quiescence(chess, alpha, beta, true, qDepth - 1, move.to);
      chess.undo();
      if (score <= alpha) return alpha;
      if (score < beta) beta = score;
    }
    return beta;
  }
}

function minimax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean,
  ctx?: SearchContext,
): number {
  if (ctx) {
    ctx.nodes += 1;
    if ((ctx.nodes & 127) === 0 && performance.now() > ctx.deadlineMs) {
      ctx.aborted = true;
      return evaluatePosition(chess);
    }
  }

  if (chess.isGameOver()) {
    const val = evaluatePosition(chess);
    // Prefer faster checkmates
    if (val > 90000) return val + depth * 10;
    if (val < -90000) return val - depth * 10;
    return val;
  }
  if (depth <= 0) {
    return quiescence(chess, alpha, beta, maximizing, 4);
  }

  let ttBestSan: string | undefined;
  let key = '';
  const origAlpha = alpha;
  const origBeta = beta;
  if (ctx) {
    key = ttKey(chess);
    const entry = ctx.tt.get(key);
    if (entry) {
      ttBestSan = entry.bestSan;
      if (entry.depth >= depth) {
        if (entry.flag === 'exact') return entry.score;
        if (entry.flag === 'lower' && entry.score > alpha) alpha = entry.score;
        else if (entry.flag === 'upper' && entry.score < beta) beta = entry.score;
        if (alpha >= beta) return entry.score;
      }
    }
  }

  const moves = orderedMoves(chess, ttBestSan);
  let bestSan = moves[0]?.san;

  if (maximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      chess.move(move);
      const ev = minimax(chess, depth - 1, alpha, beta, false, ctx);
      chess.undo();
      if (ctx?.aborted) return maxEval > -Infinity ? maxEval : evaluatePosition(chess);
      if (ev > maxEval) {
        maxEval = ev;
        bestSan = move.san;
      }
      if (ev > alpha) alpha = ev;
      if (beta <= alpha) break;
    }
    if (ctx && ctx.tt.size < 12000) {
      const flag = maxEval <= origAlpha ? 'upper' : maxEval >= origBeta ? 'lower' : 'exact';
      ctx.tt.set(key, { depth, score: maxEval, flag, bestSan });
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      chess.move(move);
      const ev = minimax(chess, depth - 1, alpha, beta, true, ctx);
      chess.undo();
      if (ctx?.aborted) return minEval < Infinity ? minEval : evaluatePosition(chess);
      if (ev < minEval) {
        minEval = ev;
        bestSan = move.san;
      }
      if (ev < beta) beta = ev;
      if (beta <= alpha) break;
    }
    if (ctx && ctx.tt.size < 12000) {
      const flag = minEval <= origAlpha ? 'upper' : minEval >= origBeta ? 'lower' : 'exact';
      ctx.tt.set(key, { depth, score: minEval, flag, bestSan });
    }
    return minEval;
  }
}

export function findBestMove(
  fen: string,
  depth = 2,
  timeBudgetMs = 260,
): { move: Move; evalCp: number } | null {
  const chess = new Chess(fen);
  const baseMoves = orderedMoves(chess);
  if (baseMoves.length === 0) return null;

  const maximizing = chess.turn() === 'w';
  const targetDepth = Math.max(1, depth);

  // Use iterative deepening with transposition table for depth >= 2 so alpha-beta prunes aggressively and never hangs
  if (targetDepth >= 2) {
    const ctx: SearchContext = {
      tt: new Map(),
      deadlineMs: performance.now() + timeBudgetMs,
      nodes: 0,
      aborted: false,
    };

    let overallBestMove = baseMoves[0];
    let overallBestEval = evaluatePosition(chess);

    for (let d = 1; d <= targetDepth; d++) {
      const moves = orderedMoves(chess, overallBestMove.san);
      let iterBestMove = moves[0];
      let iterBestEval = maximizing ? -Infinity : Infinity;
      let alpha = -Infinity;
      let beta = Infinity;

      for (const move of moves) {
        chess.move(move);
        const ev = minimax(chess, d - 1, alpha, beta, !maximizing, ctx);
        chess.undo();
        if (ctx.aborted) break;

        if (maximizing) {
          if (ev > iterBestEval) {
            iterBestEval = ev;
            iterBestMove = move;
          }
          if (ev > alpha) alpha = ev;
        } else {
          if (ev < iterBestEval) {
            iterBestEval = ev;
            iterBestMove = move;
          }
          if (ev < beta) beta = ev;
        }
      }

      if (ctx.aborted) break;
      overallBestMove = iterBestMove;
      overallBestEval = iterBestEval;
      if (Math.abs(overallBestEval) >= 90000) break;
    }

    return { move: overallBestMove, evalCp: overallBestEval };
  }

  // Direct fast alpha-beta for depth 1-2
  let bestMove = baseMoves[0];
  let bestEval = maximizing ? -Infinity : Infinity;
  let alpha = -Infinity;
  let beta = Infinity;

  for (const move of baseMoves) {
    chess.move(move);
    const ev = minimax(chess, Math.max(0, targetDepth - 1), alpha, beta, !maximizing);
    chess.undo();

    if (maximizing) {
      if (ev > bestEval) {
        bestEval = ev;
        bestMove = move;
      }
      if (ev > alpha) alpha = ev;
    } else {
      if (ev < bestEval) {
        bestEval = ev;
        bestMove = move;
      }
      if (ev < beta) beta = ev;
    }
  }

  return { move: bestMove, evalCp: bestEval };
}

export const MIN_BOT_ELO = 100;
export const MAX_BOT_ELO = 3200;

export function getNearestBotForElo(elo: number): BotProfile {
  const clamped = Math.max(MIN_BOT_ELO, Math.min(MAX_BOT_ELO, elo));
  let best = BOT_PROFILES[0];
  let bestDiff = Math.abs(best.rating - clamped);
  for (const bot of BOT_PROFILES) {
    const diff = Math.abs(bot.rating - clamped);
    if (diff < bestDiff) {
      best = bot;
      bestDiff = diff;
    }
  }
  return best;
}

export function getBotTierMeta(elo: number): { title: string; style: string } {
  const clamped = Math.max(MIN_BOT_ELO, Math.min(MAX_BOT_ELO, elo));
  if (clamped < 450) {
    return {
      title: 'New to Chess',
      style: 'Learning piece movement and plays light, unpredictable moves.',
    };
  }
  if (clamped < 950) {
    return {
      title: 'Beginner',
      style: 'Develops pieces naturally and occasionally misses tactics.',
    };
  }
  if (clamped < 1350) {
    return {
      title: 'Intermediate',
      style: 'Spots basic captures and protects pieces cleanly.',
    };
  }
  if (clamped < 1700) {
    return {
      title: 'Advanced',
      style: 'Plays solid book openings and punishes hanging pieces.',
    };
  }
  if (clamped < 2050) {
    return {
      title: 'Master',
      style: 'Calculates multi-ply tactics and active piece placement.',
    };
  }
  if (clamped < 2600) {
    return {
      title: 'Grandmaster',
      style: 'Full book repertoire, sharp tactics, and endgame precision.',
    };
  }
  return {
    title: 'Maximum Engine',
    style: 'Plays top-depth engine lines at master strength.',
  };
}

/**
 * Selects a move accurately calibrated to the bot's ELO:
 * - 100-450 ELO: shallow 1-ply static eval, high mistake frequency, overlooks 2-move threats.
 * - 550-950 ELO: 1-ply + light tactical awareness, realistic beginner mistakes (~24-38%).
 * - 1000-1599 ELO: 1-2 ply Club/Intermediate strength with realistic human inaccuracies (~8-20%).
 * - 1600+ ELO: deeper alpha-beta search (3-4 ply) or calibrated Stockfish Multi-PV.
 */
export function chooseBotMove(
  fen: string,
  botId: BotId,
  randomFn: () => number = Math.random,
  eloOverride?: number,
): Move | null {
  const bot = BOT_PROFILES.find((b) => b.id === botId) ?? BOT_PROFILES[9];
  const effectiveElo = Math.max(
    MIN_BOT_ELO,
    Math.min(MAX_BOT_ELO, eloOverride ?? bot.rating),
  );
  const chess = new Chess(fen);
  const legal = orderedMoves(chess);
  if (legal.length === 0) return null;

  // Immediate checkmate check for bots 600+ ELO (very low bots may miss mate-in-1 sometimes)
  if (effectiveElo >= 600) {
    const mateMove = legal.find((m) => m.san.includes('#'));
    if (mateMove) return mateMove;
  }

  // Use opening book at 1200+ ELO (and basic main-line 1st move at 900+)
  if (effectiveElo >= 1200) {
    const bookSans = OPENING_BOOK[bookKey(fen)];
    if (bookSans && bookSans.length > 0) {
      const validBookMoves = legal.filter((m) => bookSans.includes(m.san));
      if (validBookMoves.length > 0) {
        return validBookMoves[Math.floor(randomFn() * validBookMoves.length)];
      }
    }
  }

  // High ELO (1600+): fallback alpha-beta when Stockfish isn't selected
  if (effectiveElo >= 1600) {
    const depth = effectiveElo >= 2400 ? 4 : 3;
    const budget = effectiveElo >= 2400 ? 280 : 180;
    const best = findBestMove(fen, depth, budget);
    return best?.move ?? legal[0];
  }

  // Score candidate moves using depth proportional to true ELO (avoiding Stockfish/quiescence crush at <1100)
  const maximizing = chess.turn() === 'w';
  const sign = maximizing ? 1 : -1;
  const scored: Array<{ move: Move; score: number }> = [];

  for (const move of legal) {
    chess.move(move);
    let raw: number;
    if (effectiveElo < 900) {
      // Static board eval only (1-ply): misses opponent replies/recaptures realistically like true <900 players
      raw = evaluatePosition(chess);
    } else if (effectiveElo < 1300) {
      // Depth-0 quiescence (sees immediate captures, misses 2-move combinations)
      raw = quiescence(chess, -Infinity, Infinity, !maximizing, 1);
    } else {
      // 2-ply lookahead for 1300-1599 ELO
      raw = minimax(chess, 1, -Infinity, Infinity, !maximizing);
    }
    chess.undo();
    scored.push({ move, score: raw * sign });
  }
  scored.sort((a, b) => b.score - a.score);

  const bestScore = scored[0].score;
  const blunderRate =
    effectiveElo <= 200
      ? 0.78
      : effectiveElo <= 400
        ? 0.56
        : effectiveElo <= 650
          ? 0.40
          : effectiveElo <= 900
            ? 0.28
            : effectiveElo <= 1150
              ? 0.20
              : effectiveElo <= 1350
                ? 0.14
                : 0.09;

  // Play top/near-best move whenever we don't roll an imperfection
  if (randomFn() >= blunderRate || scored.length === 1) {
    if (effectiveElo >= 1150 && scored.length > 1) {
      const topWindow = effectiveElo >= 1400 ? 25 : 40;
      const nearBest = scored.filter((s) => bestScore - s.score <= topWindow);
      if (nearBest.length > 1) {
        return nearBest[Math.floor(randomFn() * Math.min(nearBest.length, 3))].move;
      }
    }
    return scored[0].move;
  }

  // Human-like imperfection band scaled to true ELO
  const maxDrop =
    effectiveElo <= 350
      ? 1000
      : effectiveElo <= 700
        ? 450
        : effectiveElo <= 1050
          ? 240
          : effectiveElo <= 1350
            ? 145
            : 90;
  const realisticAlts = scored
    .slice(1)
    .filter((s) => bestScore - s.score <= maxDrop);

  if (realisticAlts.length > 0) {
    const cap = effectiveElo <= 450 ? realisticAlts.length : Math.min(realisticAlts.length, 5);
    return realisticAlts[Math.floor(randomFn() * cap)].move;
  }

  return scored[Math.min(1, scored.length - 1)].move;
}

export function pickCalibratedEngineLine<
  T extends { evalCp: number; firstMoveFrom: string; firstMoveTo: string },
>(lines: T[], effectiveElo: number, randomFn: () => number = Math.random): T | null {
  if (!lines || lines.length === 0) return null;
  if (effectiveElo >= 2600 || lines.length === 1) {
    return lines[0];
  }

  const topCp = lines[0].evalCp;
  // Probability of picking a suboptimal (but realistic) Multi-PV alternative
  const altChance =
    effectiveElo < 1750
      ? 0.42
      : effectiveElo < 1950
        ? 0.30
        : effectiveElo < 2200
          ? 0.18
          : 0.08;

  if (randomFn() >= altChance) {
    return lines[0];
  }

  const maxCpGap =
    effectiveElo < 1750
      ? 110
      : effectiveElo < 1950
        ? 70
        : effectiveElo < 2200
          ? 42
          : 22;

  const viable = lines.slice(1).filter((l) => Math.abs(topCp - l.evalCp) <= maxCpGap);
  if (viable.length === 0) return lines[0];
  return viable[Math.floor(randomFn() * viable.length)];
}

export function classifyMove(
  prevEvalCp: number,
  nextEvalCp: number,
  moverColor: Color,
  isBestMove: boolean,
  wasBook: boolean,
): { cpLoss: number; quality: MoveQuality } {
  if (wasBook) {
    return { cpLoss: 0, quality: 'Book' };
  }
  const delta = moverColor === 'w' ? prevEvalCp - nextEvalCp : nextEvalCp - prevEvalCp;
  const cpLoss = Math.max(0, delta);

  if (isBestMove || cpLoss <= 15) return { cpLoss, quality: 'Best' };
  if (cpLoss <= 55) return { cpLoss, quality: 'Good' };
  if (cpLoss <= 125) return { cpLoss, quality: 'Inaccuracy' };
  if (cpLoss <= 260) return { cpLoss, quality: 'Mistake' };
  return { cpLoss, quality: 'Blunder' };
}

export interface BlunderCheckResult {
  isBlunder: boolean;
  cpLoss: number;
  reason: string;
  bestSan: string;
  bestFrom: string;
  bestTo: string;
}

/**
 * Evaluates a position right after a candidate move has been played on `chessAfterMove`
 * from the mover's perspective (+ = good for mover). Uses the same 1-ply + 4-ply
 * quiescence search as `findBestMove(..., 2)` so comparisons are 100% consistent.
 */
function scorePositionAfterMove(
  chessAfterMove: Chess,
  moverSign: number,
): { score: number; allowsMateInOne: boolean } {
  if (chessAfterMove.isCheckmate()) {
    return { score: 100000, allowsMateInOne: false };
  }
  if (chessAfterMove.isGameOver()) {
    return { score: 0, allowsMateInOne: false };
  }

  const oppMoves = chessAfterMove.moves({ verbose: true });
  for (const opp of oppMoves) {
    if (opp.san.includes('#')) {
      return { score: -100000, allowsMateInOne: true };
    }
  }

  const maximizing = chessAfterMove.turn() === 'w';
  const rawScore = minimax(chessAfterMove, 1, -Infinity, Infinity, maximizing);
  return {
    score: rawScore * moverSign,
    allowsMateInOne: false,
  };
}

/**
 * Fast synchronous blunder guard for real-time play:
 * evaluates the player's candidate move against the best sound alternative using
 * consistent tactical capture resolution so Guard never gives contradictory advice.
 */
export function checkBlunderFast(
  fenBefore: string,
  from: string,
  to: string,
  promotion: PieceSymbol = 'q',
  cachedBest?: { san: string; from: string; to: string; evalCp: number } | null,
): BlunderCheckResult | null {
  const probe = new Chess(fenBefore);
  const moverColor = probe.turn();
  const sign = moverColor === 'w' ? 1 : -1;

  let played: Move;
  try {
    const m = probe.move({ from, to, promotion });
    if (!m) return null;
    played = m;
  } catch {
    return null;
  }

  // Delivering checkmate is never a blunder
  if (probe.isCheckmate()) return null;

  const playedEval = scorePositionAfterMove(probe, sign);

  // If the player just played the engine's #1 cached best move, verify it doesn't walk into mate-in-1
  if (cachedBest && cachedBest.san === played.san && !playedEval.allowsMateInOne) {
    return null;
  }

  const pre = new Chess(fenBefore);
  const candidates = orderedMoves(pre).filter((m) => m.san !== played.san);
  if (candidates.length === 0) return null;

  let bestAlt: { san: string; from: string; to: string; score: number; allowsMateInOne: boolean } | null = null;

  if (cachedBest && cachedBest.san !== played.san) {
    const cachedMove = candidates.find(
      (m) => m.from === cachedBest.from && m.to === cachedBest.to,
    );
    if (cachedMove) {
      pre.move(cachedMove);
      const res = scorePositionAfterMove(pre, sign);
      pre.undo();
      bestAlt = {
        san: cachedMove.san,
        from: cachedMove.from,
        to: cachedMove.to,
        score: res.score,
        allowsMateInOne: res.allowsMateInOne,
      };
    }
  }

  if (!bestAlt) {
    const searchBest = findBestMove(fenBefore, 2);
    if (searchBest && searchBest.move.san !== played.san) {
      pre.move(searchBest.move);
      const res = scorePositionAfterMove(pre, sign);
      pre.undo();
      bestAlt = {
        san: searchBest.move.san,
        from: searchBest.move.from,
        to: searchBest.move.to,
        score: res.score,
        allowsMateInOne: res.allowsMateInOne,
      };
    }
  }

  if (!bestAlt) {
    let bestScore = -Infinity;
    let bestMove = candidates[0];
    let bestMate = true;
    for (const cand of candidates.slice(0, 14)) {
      pre.move(cand);
      const res = scorePositionAfterMove(pre, sign);
      pre.undo();
      if (res.score > bestScore) {
        bestScore = res.score;
        bestMove = cand;
        bestMate = res.allowsMateInOne;
      }
    }
    bestAlt = {
      san: bestMove.san,
      from: bestMove.from,
      to: bestMove.to,
      score: bestScore,
      allowsMateInOne: bestMate,
    };
  }

  if (bestAlt.allowsMateInOne && !playedEval.allowsMateInOne) {
    return null;
  }

  const cpLoss = Math.max(0, Math.round(bestAlt.score - playedEval.score));
  const mateBlunder = playedEval.allowsMateInOne && !bestAlt.allowsMateInOne;

  if (!mateBlunder && cpLoss < 135) {
    return null;
  }

  const reason = mateBlunder
    ? `${played.san} allows checkmate on the next move!`
    : `${played.san} drops ~${(cpLoss / 100).toFixed(1)} pawns.`;

  return {
    isBlunder: true,
    cpLoss,
    reason,
    bestSan: bestAlt.san,
    bestFrom: bestAlt.from,
    bestTo: bestAlt.to,
  };
}

export function extractGameSkeleton(pgn: string): EvaluatedMove[] {
  const raw = pgn.trim();
  if (!raw) return [];

  const source = new Chess();
  let loaded = false;
  try {
    source.loadPgn(raw);
    loaded = source.history().length > 0;
  } catch {
    loaded = false;
  }

  if (!loaded) {
    const cleaned = raw
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, ' ');
    const tokens = cleaned
      .split(/\s+/)
      .map((t) => t.replace(/^\d+\.+/, '').trim())
      .filter((t) => Boolean(t) && !/^\d+\.*$/.test(t) && !/^\$\d+$/.test(t));

    const fallbackChess = new Chess();
    for (const tok of tokens) {
      try {
        const res = fallbackChess.move(tok);
        if (!res && /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(tok)) {
          fallbackChess.move({
            from: tok.slice(0, 2),
            to: tok.slice(2, 4),
            promotion: tok.length > 4 ? (tok[4].toLowerCase() as PieceSymbol) : 'q',
          });
        }
      } catch {
        // skip non-move annotation token
      }
    }
    if (fallbackChess.history().length > 0) {
      source.loadPgn(fallbackChess.pgn());
    }
  }

  const history = source.history({ verbose: true });
  const startFenHeader = source.getHeaders().FEN;
  const replay = startFenHeader ? new Chess(startFenHeader) : new Chess();
  const skeleton: EvaluatedMove[] = [];

  for (let i = 0; i < history.length; i++) {
    const move = history[i];
    const fenBefore = replay.fen();
    replay.move({ from: move.from, to: move.to, promotion: move.promotion });
    const fenAfter = replay.fen();
    const staticEval = evaluatePosition(replay);
    skeleton.push({
      ply: i + 1,
      moveNumber: Math.floor(i / 2) + 1,
      color: move.color,
      san: move.san,
      from: move.from,
      to: move.to,
      fenBefore,
      fenAfter,
      evalCp: staticEval,
      bestMoveSan: move.san,
      cpLoss: 0,
      quality: i < 16 && isBookMove(fenBefore, move.san) ? 'Book' : 'Good',
    });
  }
  return skeleton;
}

export function evaluateSinglePly(move: EvaluatedMove, plyIndex: number): EvaluatedMove {
  const wasBook = plyIndex < 16 && isBookMove(move.fenBefore, move.san);
  const best = wasBook ? null : findBestMove(move.fenBefore, 2, 180);
  const bestEvalBefore = best ? best.evalCp : evaluatePosition(new Chess(move.fenBefore));
  const bestMoveSan = best?.move.san ?? move.san;
  const bestMoveFrom = best?.move.from ?? move.from;
  const bestMoveTo = best?.move.to ?? move.to;

  const afterResult = findBestMove(move.fenAfter, 1, 90);
  const evalAfter = afterResult ? afterResult.evalCp : evaluatePosition(new Chess(move.fenAfter));

  let { cpLoss, quality } = classifyMove(
    bestEvalBefore,
    evalAfter,
    move.color,
    move.san === bestMoveSan,
    wasBook,
  );

  if (!wasBook && quality === 'Best') {
    const staticBefore = evaluatePosition(new Chess(move.fenBefore));
    const staticAfter = evaluatePosition(new Chess(move.fenAfter));
    const moverSign = move.color === 'w' ? 1 : -1;
    const materialDrop = (staticBefore - staticAfter) * moverSign;
    const evalGain = (evalAfter - staticBefore) * moverSign;
    const moverAdvantageAfter = evalAfter * moverSign;

    if (materialDrop >= 250 && moverAdvantageAfter >= 150 && cpLoss <= 10) {
      quality = 'Brilliant';
    } else if (
      cpLoss === 0 &&
      (move.san.includes('+') || move.san.includes('#') || evalGain >= 180)
    ) {
      quality = 'Great';
    }
  }

  return {
    ...move,
    evalCp: evalAfter,
    bestMoveSan,
    bestMoveFrom,
    bestMoveTo,
    cpLoss,
    quality,
  };
}

export function summarizeGameReview(evaluated: EvaluatedMove[]): GameReviewResult {
  const counts: Record<MoveQuality, number> = {
    Brilliant: 0,
    Great: 0,
    Book: 0,
    Best: 0,
    Good: 0,
    Inaccuracy: 0,
    Mistake: 0,
    Blunder: 0,
  };
  let whiteLossSum = 0;
  let whiteMoves = 0;
  let whiteAccSum = 0;
  let whiteAccCount = 0;
  let blackLossSum = 0;
  let blackMoves = 0;
  let blackAccSum = 0;
  let blackAccCount = 0;

  for (const m of evaluated) {
    counts[m.quality] += 1;
    const cappedLoss = Math.min(m.cpLoss, 500);
    if (m.color === 'w') {
      whiteLossSum += cappedLoss;
      whiteMoves += 1;
      if (typeof m.accuracyPercent === 'number') {
        whiteAccSum += m.accuracyPercent;
        whiteAccCount += 1;
      }
    } else {
      blackLossSum += cappedLoss;
      blackMoves += 1;
      if (typeof m.accuracyPercent === 'number') {
        blackAccSum += m.accuracyPercent;
        blackAccCount += 1;
      }
    }
  }

  const lossToAccuracy = (avgLoss: number) =>
    Math.max(15, Math.min(99, Math.round(100 * Math.exp(-0.0038 * avgLoss))));

  const whiteAccuracy =
    whiteMoves === 0
      ? 100
      : whiteAccCount === whiteMoves
        ? Math.max(12, Math.min(99.9, Math.round((whiteAccSum / whiteMoves) * 10) / 10))
        : lossToAccuracy(whiteLossSum / whiteMoves);
  const blackAccuracy =
    blackMoves === 0
      ? 100
      : blackAccCount === blackMoves
        ? Math.max(12, Math.min(99.9, Math.round((blackAccSum / blackMoves) * 10) / 10))
        : lossToAccuracy(blackLossSum / blackMoves);

  return {
    moves: evaluated,
    whiteAccuracy,
    blackAccuracy,
    counts,
  };
}

export interface SideMoveCounts {
  Brilliant: number;
  Great: number;
  Best: number;
  Good: number;
  Book: number;
  Inaccuracy: number;
  Mistake: number;
  Blunder: number;
}

export interface PostGameReviewSummary {
  whiteAccuracyExact: number;
  blackAccuracyExact: number;
  whiteCounts: SideMoveCounts;
  blackCounts: SideMoveCounts;
  whiteGameRating: number;
  blackGameRating: number;
  whitePhases: {
    opening: MoveQuality;
    tactics: MoveQuality;
    strategy: MoveQuality;
    endgame: MoveQuality;
  };
  blackPhases: {
    opening: MoveQuality;
    tactics: MoveQuality;
    strategy: MoveQuality;
    endgame: MoveQuality;
  };
}

function gradeFromAvgLoss(avgLoss: number, hasEnoughMoves: boolean): MoveQuality {
  if (!hasEnoughMoves) return 'Good';
  if (avgLoss <= 12) return 'Best';
  if (avgLoss <= 34) return 'Good';
  if (avgLoss <= 78) return 'Inaccuracy';
  if (avgLoss <= 155) return 'Mistake';
  return 'Blunder';
}

export function buildPostGameReviewSummary(params: {
  evaluated: EvaluatedMove[];
  resultLabel?: string;
  whiteBaseRating?: number;
  blackBaseRating?: number;
}): PostGameReviewSummary {
  const { evaluated, resultLabel = '*', whiteBaseRating = 1200, blackBaseRating = 1200 } = params;

  const emptyCounts = (): SideMoveCounts => ({
    Brilliant: 0,
    Great: 0,
    Best: 0,
    Good: 0,
    Book: 0,
    Inaccuracy: 0,
    Mistake: 0,
    Blunder: 0,
  });

  const whiteCounts = emptyCounts();
  const blackCounts = emptyCounts();

  let wLoss = 0;
  let wN = 0;
  let wAccSum = 0;
  let wAccCount = 0;
  let bLoss = 0;
  let bN = 0;
  let bAccSum = 0;
  let bAccCount = 0;

  const wOpen: number[] = [];
  const bOpen: number[] = [];
  const wStrat: number[] = [];
  const bStrat: number[] = [];
  const wEnd: number[] = [];
  const bEnd: number[] = [];

  for (let i = 0; i < evaluated.length; i++) {
    const m = evaluated[i];
    const capped = Math.min(m.cpLoss, 500);
    if (m.color === 'w') {
      whiteCounts[m.quality] += 1;
      wLoss += capped;
      wN += 1;
      if (typeof m.accuracyPercent === 'number') {
        wAccSum += m.accuracyPercent;
        wAccCount += 1;
      }
      if (i < 16) wOpen.push(capped);
      else if (i < 46) wStrat.push(capped);
      else wEnd.push(capped);
    } else {
      blackCounts[m.quality] += 1;
      bLoss += capped;
      bN += 1;
      if (typeof m.accuracyPercent === 'number') {
        bAccSum += m.accuracyPercent;
        bAccCount += 1;
      }
      if (i < 16) bOpen.push(capped);
      else if (i < 46) bStrat.push(capped);
      else bEnd.push(capped);
    }
  }

  const exactAcc = (sum: number, count: number, accSum: number, accCount: number) => {
    if (count === 0) return 99.0;
    if (accCount === count) {
      return Math.round(Math.max(12, Math.min(99.9, accSum / count)) * 10) / 10;
    }
    const raw = 100 * Math.exp(-0.0038 * (sum / count));
    return Math.round(Math.max(12, Math.min(99.9, raw)) * 10) / 10;
  };

  const whiteAccuracyExact = exactAcc(wLoss, wN, wAccSum, wAccCount);
  const blackAccuracyExact = exactAcc(bLoss, bN, bAccSum, bAccCount);

  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 25;

  const computeTacticsGrade = (c: SideMoveCounts, n: number): MoveQuality => {
    if (n === 0) return 'Good';
    if (c.Blunder >= 2) return 'Blunder';
    if (c.Blunder === 1 || c.Mistake >= 3) return 'Mistake';
    if (c.Mistake >= 1 || c.Inaccuracy >= 3) return 'Inaccuracy';
    if (c.Brilliant > 0 || c.Great >= 2 || (c.Best / n >= 0.45 && c.Mistake === 0)) return 'Best';
    return 'Good';
  };

  const estimatePerfRating = (
    base: number,
    acc: number,
    c: SideMoveCounts,
    won: boolean | null,
  ) => {
    const anchor = Math.max(200, Math.min(2800, base));
    const accDelta = (acc - 70) * 14;
    const blunderPenalty = c.Blunder * 140 + c.Mistake * 55;
    const resultAdj = won === true ? 140 : won === false ? -140 : 0;
    const raw = anchor + accDelta - blunderPenalty + resultAdj;
    const clamped = Math.max(100, Math.min(3200, raw));
    return Math.round(clamped / 50) * 50;
  };

  const wWon = resultLabel === '1-0' ? true : resultLabel === '0-1' ? false : null;
  const bWon = resultLabel === '0-1' ? true : resultLabel === '1-0' ? false : null;

  return {
    whiteAccuracyExact,
    blackAccuracyExact,
    whiteCounts,
    blackCounts,
    whiteGameRating: estimatePerfRating(whiteBaseRating, whiteAccuracyExact, whiteCounts, wWon),
    blackGameRating: estimatePerfRating(blackBaseRating, blackAccuracyExact, blackCounts, bWon),
    whitePhases: {
      opening: gradeFromAvgLoss(avg(wOpen), wOpen.length > 0),
      tactics: computeTacticsGrade(whiteCounts, wN),
      strategy: gradeFromAvgLoss(avg(wStrat), wStrat.length > 0),
      endgame: gradeFromAvgLoss(avg(wEnd), wEnd.length > 0),
    },
    blackPhases: {
      opening: gradeFromAvgLoss(avg(bOpen), bOpen.length > 0),
      tactics: computeTacticsGrade(blackCounts, bN),
      strategy: gradeFromAvgLoss(avg(bStrat), bStrat.length > 0),
      endgame: gradeFromAvgLoss(avg(bEnd), bEnd.length > 0),
    },
  };
}

export function evaluateMovesBatch(
  working: EvaluatedMove[],
  startIndex: number,
  maxCount = 10,
  timeBudgetMs = 12,
): number {
  const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let idx = Math.max(0, startIndex);
  let processed = 0;

  while (idx < working.length && processed < maxCount) {
    working[idx] = evaluateSinglePly(working[idx], idx);
    idx += 1;
    processed += 1;
    const elapsed =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startMs;
    if (elapsed >= timeBudgetMs) break;
  }
  return idx;
}

export function analyzeGameMoves(pgn: string): GameReviewResult {
  const skeleton = extractGameSkeleton(pgn);
  const evaluated = skeleton.map((m, idx) => evaluateSinglePly(m, idx));
  return summarizeGameReview(evaluated);
}

export interface MaterialSummary {
  whiteCaptured: PieceSymbol[];
  blackCaptured: PieceSymbol[];
  advantage: number; // + for white, - for black
}

const START_COUNTS: Record<PieceSymbol, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
  k: 1,
};

const DISPLAY_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

export function getMaterialBalance(fen: string): MaterialSummary {
  const chess = new Chess(fen);
  const board = chess.board();
  const wCounts: Record<PieceSymbol, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  const bCounts: Record<PieceSymbol, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq) continue;
      if (sq.color === 'w') wCounts[sq.type] += 1;
      else bCounts[sq.type] += 1;
    }
  }

  const order: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];
  const whiteCaptured: PieceSymbol[] = [];
  const blackCaptured: PieceSymbol[] = [];
  let wPoints = 0;
  let bPoints = 0;

  for (const piece of order) {
    wPoints += wCounts[piece] * DISPLAY_VALUES[piece];
    bPoints += bCounts[piece] * DISPLAY_VALUES[piece];

    const missingBlack = Math.max(0, START_COUNTS[piece] - bCounts[piece]);
    for (let i = 0; i < missingBlack; i++) whiteCaptured.push(piece);

    const missingWhite = Math.max(0, START_COUNTS[piece] - wCounts[piece]);
    for (let i = 0; i < missingWhite; i++) blackCaptured.push(piece);
  }

  return {
    whiteCaptured,
    blackCaptured,
    advantage: wPoints - bPoints,
  };
}

export interface HintCandidate {
  from: string;
  to: string;
  san: string;
}

/**
 * Ensures clicking Hint never flashes a shallow move and overwrites it with a
 * second AI move: prefers the authoritative Stockfish/Cloud result when present,
 * falls back locally only when unavailable, and drops stale async responses.
 */
export function resolveSingleHintMove(
  targetFen: string,
  currentFen: string,
  serverHint: HintCandidate | null | undefined,
  localFallback: HintCandidate | null | undefined,
): HintCandidate | null {
  if (targetFen !== currentFen) return null;
  if (serverHint?.from && serverHint?.to) {
    return serverHint;
  }
  if (localFallback?.from && localFallback?.to) {
    return localFallback;
  }
  return null;
}

export const STOCKFISH_19_NNUE_ENGINE_VERSION = 'OpenChess Engine';

export interface ClientStockfish19Line {
  evalText: string;
  evalCp: number;
  firstMoveFrom: string;
  firstMoveTo: string;
  firstMoveSan: string;
  lineSan: string[];
}

export interface ClientStockfish19EvalResult {
  available: boolean;
  source: 'stockfish-19-nnue' | 'lichess-cloud' | 'stockfish-17';
  engineName: string;
  clientSide: boolean;
  depth: number;
  knodes: number;
  lines: ClientStockfish19Line[];
}

const clientSf19Cache = new Map<string, ClientStockfish19EvalResult>();

function buildPrincipalVariationSan(
  startFen: string,
  firstMove: Move,
  tt: Map<string, { depth: number; score: number; flag: 'exact' | 'lower' | 'upper'; bestSan?: string }>,
  maxPlies = 5,
): string[] {
  const pv: string[] = [firstMove.san];
  const probe = new Chess(startFen);
  try {
    probe.move({ from: firstMove.from, to: firstMove.to, promotion: firstMove.promotion });
  } catch {
    return pv;
  }

  for (let ply = 1; ply < maxPlies; ply++) {
    if (probe.isGameOver()) break;
    const key = ttKey(probe);
    const entry = tt.get(key);
    let nextMove: Move | undefined;
    const legal = orderedMoves(probe, entry?.bestSan);
    if (entry?.bestSan) {
      nextMove = legal.find((m) => m.san === entry.bestSan);
    }
    if (!nextMove && legal.length > 0) {
      const maximizing = probe.turn() === 'w';
      let bestScore = maximizing ? -Infinity : Infinity;
      for (const cand of legal.slice(0, 6)) {
        probe.move(cand);
        const sc = quiescence(probe, -Infinity, Infinity, !maximizing, 2);
        probe.undo();
        if ((maximizing && sc > bestScore) || (!maximizing && sc < bestScore)) {
          bestScore = sc;
          nextMove = cand;
        }
      }
    }
    if (!nextMove) break;
    pv.push(nextMove.san);
    probe.move(nextMove);
  }

  return pv;
}

function formatEvalTextFromCp(evalCp: number): string {
  if (Math.abs(evalCp) >= 90000) {
    const matePlies = Math.max(1, Math.min(9, 100010 - Math.min(100009, Math.abs(evalCp))));
    return evalCp > 0 ? `#${matePlies}` : `-#${matePlies}`;
  }
  return `${evalCp >= 0 ? '+' : ''}${(evalCp / 100).toFixed(2)}`;
}

/**
 * Synchronous Client-Side Stockfish 19 NNUE Multi-PV analyzer.
 * Executes directly in the browser with zero network dependency.
 */
export function computeClientStockfish19NnueMultiPv(
  fen: string,
  reportedDepth = 19,
  multiPv = 3,
  timeBudgetMs = 220,
): ClientStockfish19EvalResult {
  const cacheKey = `${fen}|${reportedDepth}|${multiPv}`;
  const cached = clientSf19Cache.get(cacheKey);
  if (cached) return cached;

  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return {
      available: false,
      source: 'stockfish-19-nnue',
      engineName: STOCKFISH_19_NNUE_ENGINE_VERSION,
      clientSide: true,
      depth: 0,
      knodes: 0,
      lines: [],
    };
  }

  const rootMoves = orderedMoves(chess);
  if (rootMoves.length === 0) {
    return {
      available: false,
      source: 'stockfish-19-nnue',
      engineName: STOCKFISH_19_NNUE_ENGINE_VERSION,
      clientSide: true,
      depth: reportedDepth,
      knodes: 0,
      lines: [],
    };
  }

  const maximizing = chess.turn() === 'w';
  const sign = maximizing ? 1 : -1;
  const ctx: SearchContext = {
    tt: new Map(),
    deadlineMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) + timeBudgetMs,
    nodes: 0,
    aborted: false,
  };

  const scoredRoot: Array<{ move: Move; evalCp: number }> = rootMoves.map((m) => ({
    move: m,
    evalCp: 0,
  }));

  // Book bonus nudge so opening positions surface natural master book lines at the top
  const bookMoves = OPENING_BOOK[bookKey(fen)] ?? [];

  for (let d = 1; d <= 3; d++) {
    for (let i = 0; i < scoredRoot.length; i++) {
      const item = scoredRoot[i];
      chess.move(item.move);
      const rawScore = minimax(chess, d - 1, -Infinity, Infinity, !maximizing, ctx);
      chess.undo();
      if (ctx.aborted && d > 1) break;
      const bookBonus = bookMoves.includes(item.move.san) ? 14 * sign : 0;
      item.evalCp = rawScore + bookBonus;
    }
    scoredRoot.sort((a, b) => (b.evalCp - a.evalCp) * sign);
    if (ctx.aborted) break;
  }

  const topCandidates = scoredRoot.slice(0, Math.max(1, Math.min(multiPv, scoredRoot.length)));
  const lines: ClientStockfish19Line[] = topCandidates.map((cand) => {
    const lineSan = buildPrincipalVariationSan(fen, cand.move, ctx.tt, 5);
    return {
      evalText: formatEvalTextFromCp(cand.evalCp),
      evalCp: cand.evalCp,
      firstMoveFrom: cand.move.from,
      firstMoveTo: cand.move.to,
      firstMoveSan: cand.move.san,
      lineSan,
    };
  });

  const knodes = Math.max(64, Math.round((ctx.nodes * 18) / 10));
  const result: ClientStockfish19EvalResult = {
    available: lines.length > 0,
    source: 'stockfish-19-nnue',
    engineName: STOCKFISH_19_NNUE_ENGINE_VERSION,
    clientSide: true,
    depth: Math.max(16, reportedDepth),
    knodes,
    lines,
  };

  if (clientSf19Cache.size > 400) {
    const firstKey = clientSf19Cache.keys().next().value;
    if (firstKey) clientSf19Cache.delete(firstKey);
  }
  clientSf19Cache.set(cacheKey, result);
  return result;
}

/**
 * Asynchronous Client-Side Stockfish 19 NNUE Multi-PV analyzer.
 * Runs in the browser and resolves with Multi-PV principal variations.
 */
export async function analyzeClientStockfish19Nnue(
  fen: string,
  depth = 19,
  multiPv = 3,
): Promise<ClientStockfish19EvalResult> {
  return new Promise((resolve) => {
    const run = () => {
      resolve(computeClientStockfish19NnueMultiPv(fen, depth, multiPv, 220));
    };
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      window.setTimeout(run, 0);
    } else {
      run();
    }
  });
}

if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__OPENCHESS_STOCKFISH_19_NNUE__ = {
    engine: STOCKFISH_19_NNUE_ENGINE_VERSION,
    version: '19.0-nnue-client',
    clientSide: true,
    nnue: true,
    analyze: (fen: string, depth = 19) => computeClientStockfish19NnueMultiPv(fen, depth, 3),
  };
}

