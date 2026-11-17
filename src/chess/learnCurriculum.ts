import { Chess, type Color, type PieceSymbol } from 'chess.js';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

export interface BasicsPiece {
  square: string;
  type: PieceSymbol;
  color: Color;
}

export type BasicsGoalMode =
  | 'stars'
  | 'setup-stars'
  | 'any-move'
  | 'capture-all'
  | 'protect'
  | 'combat'
  | 'check1'
  | 'outOfCheck'
  | 'mate1'
  | 'castling'
  | 'enpassant'
  | 'stalemate'
  | 'value'
  | 'check2';

export interface BasicsStage {
  id: string;
  title: string;
  instruction: string;
  successText?: string;
  failureText?: string;
  kind: 'stars' | 'chess';
  goalMode?: BasicsGoalMode;
  orientation: Color;
  par: number;
  fen?: string;
  playerSquare?: string;
  pieces?: BasicsPiece[];
  stars?: string[];
  castleSide?: 'k' | 'q';
  enPassantQueue?: Array<{ blackMove: string; epSquare: string; whiteMoves: string[] }>;
  expectedUci?: string[];
  secondMoveUci?: string[];
  hintSquare?: string;
  arrows?: StudyArrowAnnotation[];
  highlights?: StudySquareHighlight[];
}

export interface BasicsLesson {
  id: string;
  section: 'Chess pieces' | 'Fundamentals' | 'Intermediate' | 'Advanced';
  title: string;
  subtitle: string;
  pieceIcon: PieceSymbol;
  stages: BasicsStage[];
}

export interface PracticeCourseMeta {
  id: string;
  category:
    | 'Checkmates'
    | 'Fundamental tactics'
    | 'Advanced tactics'
    | 'Pawn Endgames'
    | 'Rook Endgames';
  title: string;
  subtitle: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  totalExercises: number;
}

export interface StudyArrowAnnotation {
  from: string;
  to: string;
  color: 'green' | 'red' | 'yellow' | 'blue';
}

export interface StudySquareHighlight {
  square: string;
  color: 'green' | 'red' | 'yellow' | 'blue';
}

export interface StudyMoveNode {
  ply: number;
  san: string;
  from: string;
  to: string;
  fen: string;
  comment: string;
  variationsText: string[];
  arrows: StudyArrowAnnotation[];
  highlights: StudySquareHighlight[];
}

export interface StudyChapter {
  index: number;
  name: string;
  studyName: string;
  eco: string;
  opening: string;
  initialFen: string;
  orientation: Color;
  termination: string;
  goalCp: number | null;
  goalMoves: number | null;
  initialComment: string;
  initialArrows: StudyArrowAnnotation[];
  initialHighlights: StudySquareHighlight[];
  moves: StudyMoveNode[];
}

export interface StudySummaryCard {
  id: string;
  name: string;
  author: string;
  likes: number;
  ageLabel?: string;
  chapters: string[];
  topic?: string;
}

export interface CoordinateBestMap {
  w: number;
  b: number;
  random: number;
}

const BASICS_PROGRESS_KEY = 'openchess_basics_progress_v1';
const PRACTICE_PROGRESS_KEY = 'openchess_practice_progress_v1';
const COORD_BEST_KEY = 'openchess_coord_best_v1';

export function loadBasicsProgress(): Record<string, number> {
  try {
    const raw = localStorage.getItem(BASICS_PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function saveBasicsLessonStars(lessonId: string, stars: number): Record<string, number> {
  const prev = loadBasicsProgress();
  const next = {
    ...prev,
    [lessonId]: Math.max(prev[lessonId] ?? 0, Math.min(3, Math.max(1, stars))),
  };
  try {
    localStorage.setItem(BASICS_PROGRESS_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
  return next;
}

export function loadPracticeProgress(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(PRACTICE_PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

export function savePracticeChapterComplete(
  courseId: string,
  chapterIdx: number,
): Record<string, string[]> {
  const prev = loadPracticeProgress();
  const existing = new Set(prev[courseId] ?? []);
  existing.add(String(chapterIdx));
  const next = {
    ...prev,
    [courseId]: [...existing],
  };
  try {
    localStorage.setItem(PRACTICE_PROGRESS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function loadCoordBest(): CoordinateBestMap {
  try {
    const raw = localStorage.getItem(COORD_BEST_KEY);
    if (!raw) return { w: 0, b: 0, random: 0 };
    const p = JSON.parse(raw) as Partial<CoordinateBestMap>;
    return {
      w: Number(p.w) || 0,
      b: Number(p.b) || 0,
      random: Number(p.random) || 0,
    };
  } catch {
    return { w: 0, b: 0, random: 0 };
  }
}

export function saveCoordBest(side: 'w' | 'b' | 'random', score: number): CoordinateBestMap {
  const prev = loadCoordBest();
  const next: CoordinateBestMap = {
    ...prev,
    [side]: Math.max(prev[side] ?? 0, score),
  };
  try {
    localStorage.setItem(COORD_BEST_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function pickNextCoordinate(prev?: string, rng: () => number = Math.random): string {
  for (let i = 0; i < 16; i++) {
    const f = FILES[Math.min(7, Math.floor(rng() * 8))];
    const r = RANKS[Math.min(7, Math.floor(rng() * 8))];
    const sq = `${f}${r}`;
    if (sq !== prev) return sq;
  }
  return prev === 'e4' ? 'd5' : 'e4';
}

function sqToCoords(sq: string): { f: number; r: number } | null {
  if (!sq || sq.length !== 2) return null;
  const f = FILES.indexOf(sq[0] as (typeof FILES)[number]);
  const r = RANKS.indexOf(sq[1] as (typeof RANKS)[number]);
  if (f < 0 || r < 0) return null;
  return { f, r };
}

function coordsToSq(f: number, r: number): string | null {
  if (f < 0 || f > 7 || r < 0 || r > 7) return null;
  return `${FILES[f]}${RANKS[r]}`;
}

export function parseFenToBasicsPieces(fen: string): BasicsPiece[] {
  const boardPart = (fen || '').trim().split(/\s+/)[0] || '';
  const rows = boardPart.split('/');
  const pieces: BasicsPiece[] = [];
  for (let r = 0; r < Math.min(8, rows.length); r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) {
        f += Number(ch);
      } else {
        const sq = coordsToSq(f, r);
        if (sq) {
          const color: Color = ch === ch.toUpperCase() ? 'w' : 'b';
          const type = ch.toLowerCase() as PieceSymbol;
          if (['p', 'n', 'b', 'r', 'q', 'k'].includes(type)) {
            pieces.push({ square: sq, type, color });
          }
        }
        f++;
      }
    }
  }
  return pieces;
}

export function parseApplesToSquares(apples: string): string[] {
  return apples
    .trim()
    .split(/\s+/)
    .filter((sq) => /^[a-h][1-8]$/.test(sq));
}

function buildStageFromFen(params: {
  id: string;
  title: string;
  instruction: string;
  fen: string;
  par: number;
  apples?: string;
  goalMode?: BasicsGoalMode;
  castleSide?: 'k' | 'q';
  enPassantQueue?: Array<{ blackMove: string; epSquare: string; whiteMoves: string[] }>;
  expectedUci?: string[];
  secondMoveUci?: string[];
  hintSquare?: string;
  arrows?: StudyArrowAnnotation[];
  highlights?: StudySquareHighlight[];
}): BasicsStage {
  const pieces = parseFenToBasicsPieces(params.fen);
  const stars = params.apples ? parseApplesToSquares(params.apples) : [];
  const firstWhite = pieces.find((p) => p.color === 'w');
  const defaultHint =
    params.hintSquare ||
    params.expectedUci?.[0]?.slice(2, 4) ||
    stars[0] ||
    pieces.find((p) => p.color === 'b')?.square ||
    firstWhite?.square;

  return {
    id: params.id,
    title: params.title,
    instruction: params.instruction,
    kind: 'stars',
    goalMode: params.goalMode ?? (stars.length > 0 ? 'stars' : 'capture-all'),
    orientation: 'w',
    par: params.par,
    fen: params.fen,
    playerSquare: firstWhite?.square,
    pieces,
    stars,
    castleSide: params.castleSide,
    enPassantQueue: params.enPassantQueue,
    expectedUci: params.expectedUci,
    secondMoveUci: params.secondMoveUci,
    hintSquare: defaultHint,
    arrows: params.arrows,
    highlights: params.highlights,
  };
}

/**
 * Computes squares attacked by a given side on a kingless or standard Basics board.
 */
export function getSquaresAttackedBySide(pieces: BasicsPiece[], attackerColor: Color): Set<string> {
  const attacked = new Set<string>();
  const occ = new Map<string, BasicsPiece>();
  for (const p of pieces) occ.set(p.square, p);

  for (const p of pieces) {
    if (p.color !== attackerColor) continue;
    const start = sqToCoords(p.square);
    if (!start) continue;

    const addRay = (df: number, dr: number) => {
      let f = start.f + df;
      let r = start.r + dr;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const sq = coordsToSq(f, r)!;
        attacked.add(sq);
        const blocker = occ.get(sq);
        if (blocker) break;
        f += df;
        r += dr;
      }
    };

    if (p.type === 'r' || p.type === 'q') {
      addRay(1, 0);
      addRay(-1, 0);
      addRay(0, 1);
      addRay(0, -1);
    }
    if (p.type === 'b' || p.type === 'q') {
      addRay(1, 1);
      addRay(1, -1);
      addRay(-1, 1);
      addRay(-1, -1);
    }
    if (p.type === 'k') {
      for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (df === 0 && dr === 0) continue;
          const sq = coordsToSq(start.f + df, start.r + dr);
          if (sq) attacked.add(sq);
        }
      }
    }
    if (p.type === 'n') {
      const jumps = [
        [1, 2],
        [2, 1],
        [2, -1],
        [1, -2],
        [-1, -2],
        [-2, -1],
        [-2, 1],
        [-1, 2],
      ];
      for (const [df, dr] of jumps) {
        const sq = coordsToSq(start.f + df, start.r + dr);
        if (sq) attacked.add(sq);
      }
    }
    if (p.type === 'p') {
      const step = p.color === 'w' ? -1 : 1;
      for (const df of [-1, 1]) {
        const sq = coordsToSq(start.f + df, start.r + step);
        if (sq) attacked.add(sq);
      }
    }
  }

  return attacked;
}

/**
 * Computes legal destinations for Chess Basics stages (supports kingless boards, castling, and en passant).
 */
export function getBasicsLegalMoves(
  pieces: BasicsPiece[],
  fromSquare: string,
  stars: string[] = [],
  options?: { allowCastling?: boolean; enPassantSquare?: string | null },
): string[] {
  const mover = pieces.find((p) => p.square === fromSquare);
  const start = sqToCoords(fromSquare);
  if (!mover || !start) return [];

  const occ = new Map<string, BasicsPiece>();
  for (const p of pieces) {
    occ.set(p.square, p);
  }
  const starSet = new Set(stars);
  const destinations: string[] = [];

  const addRay = (df: number, dr: number) => {
    let f = start.f + df;
    let r = start.r + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const sq = coordsToSq(f, r)!;
      const occupant = occ.get(sq);
      if (occupant) {
        if (occupant.color !== mover.color) {
          destinations.push(sq);
        }
        break;
      }
      destinations.push(sq);
      f += df;
      r += dr;
    }
  };

  if (mover.type === 'r' || mover.type === 'q') {
    addRay(1, 0);
    addRay(-1, 0);
    addRay(0, 1);
    addRay(0, -1);
  }
  if (mover.type === 'b' || mover.type === 'q') {
    addRay(1, 1);
    addRay(1, -1);
    addRay(-1, 1);
    addRay(-1, -1);
  }
  if (mover.type === 'k') {
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (df === 0 && dr === 0) continue;
        const sq = coordsToSq(start.f + df, start.r + dr);
        if (!sq) continue;
        const occupant = occ.get(sq);
        if (!occupant || occupant.color !== mover.color) destinations.push(sq);
      }
    }
    if (options?.allowCastling && mover.color === 'w' && fromSquare === 'e1') {
      const enemyAttacks = getSquaresAttackedBySide(pieces, 'b');
      if (!enemyAttacks.has('e1')) {
        const h1Rook = occ.get('h1');
        if (
          h1Rook?.color === 'w' &&
          h1Rook.type === 'r' &&
          !occ.has('f1') &&
          !occ.has('g1') &&
          !enemyAttacks.has('f1') &&
          !enemyAttacks.has('g1')
        ) {
          destinations.push('g1');
        }
        const a1Rook = occ.get('a1');
        if (
          a1Rook?.color === 'w' &&
          a1Rook.type === 'r' &&
          !occ.has('b1') &&
          !occ.has('c1') &&
          !occ.has('d1') &&
          !enemyAttacks.has('d1') &&
          !enemyAttacks.has('c1')
        ) {
          destinations.push('c1');
        }
      }
    }
  }
  if (mover.type === 'n') {
    const jumps = [
      [1, 2],
      [2, 1],
      [2, -1],
      [1, -2],
      [-1, -2],
      [-2, -1],
      [-2, 1],
      [-1, 2],
    ];
    for (const [df, dr] of jumps) {
      const sq = coordsToSq(start.f + df, start.r + dr);
      if (!sq) continue;
      const occupant = occ.get(sq);
      if (!occupant || occupant.color !== mover.color) destinations.push(sq);
    }
  }
  if (mover.type === 'p') {
    const step = mover.color === 'w' ? -1 : 1; // RANKS[0]='8', RANKS[7]='1'
    const fwd1 = coordsToSq(start.f, start.r + step);
    if (fwd1 && !occ.has(fwd1)) {
      destinations.push(fwd1);
      const startRow = mover.color === 'w' ? 6 : 1; // rank 2 or rank 7
      const fwd2 = coordsToSq(start.f, start.r + step * 2);
      if (start.r === startRow && fwd2 && !occ.has(fwd2)) {
        destinations.push(fwd2);
      }
    }
    for (const df of [-1, 1]) {
      const cap = coordsToSq(start.f + df, start.r + step);
      if (!cap) continue;
      const occupant = occ.get(cap);
      if (
        (occupant && occupant.color !== mover.color) ||
        starSet.has(cap) ||
        (options?.enPassantSquare && cap === options.enPassantSquare)
      ) {
        destinations.push(cap);
      }
    }
  }

  // If the moving side has a King on the board, filter out moves that leave own King in check
  const ownKing = pieces.find((p) => p.color === mover.color && p.type === 'k');
  if (ownKing) {
    const enemyColor: Color = mover.color === 'w' ? 'b' : 'w';
    return destinations.filter((dest) => {
      const simulated = simulatePieceMove(pieces, fromSquare, dest, options?.enPassantSquare);
      const kingSq = simulated.find((p) => p.color === mover.color && p.type === 'k')?.square;
      if (!kingSq) return true;
      const attacks = getSquaresAttackedBySide(simulated, enemyColor);
      return !attacks.has(kingSq);
    });
  }

  return destinations;
}

export function simulatePieceMove(
  pieces: BasicsPiece[],
  from: string,
  to: string,
  enPassantSquare?: string | null,
  promotion: PieceSymbol = 'q',
): BasicsPiece[] {
  const mover = pieces.find((p) => p.square === from);
  if (!mover) return pieces;

  let next = pieces.filter((p) => p.square !== from && p.square !== to);

  // Handle En Passant pawn removal
  if (mover.type === 'p' && enPassantSquare && to === enPassantSquare) {
    const capturedPawnSq = `${to[0]}${from[1]}`;
    next = next.filter((p) => p.square !== capturedPawnSq);
  }

  // Handle Castling rook jump
  if (mover.type === 'k' && from === 'e1' && to === 'g1') {
    const rook = next.find((p) => p.square === 'h1' && p.color === 'w' && p.type === 'r');
    if (rook) {
      next = next.filter((p) => p.square !== 'h1').concat([{ ...rook, square: 'f1' }]);
    }
  } else if (mover.type === 'k' && from === 'e1' && to === 'c1') {
    const rook = next.find((p) => p.square === 'a1' && p.color === 'w' && p.type === 'r');
    if (rook) {
      next = next.filter((p) => p.square !== 'a1').concat([{ ...rook, square: 'd1' }]);
    }
  }

  const promotedType: PieceSymbol =
    mover.type === 'p' &&
    ((mover.color === 'w' && to[1] === '8') || (mover.color === 'b' && to[1] === '1'))
      ? promotion
      : mover.type;

  next.push({ ...mover, type: promotedType, square: to });
  return next;
}

export function hasAnyLegalMoveForSide(pieces: BasicsPiece[], side: Color): boolean {
  for (const p of pieces) {
    if (p.color !== side) continue;
    const moves = getBasicsLegalMoves(pieces, p.square, []);
    if (moves.length > 0) return true;
  }
  return false;
}

export function isSideInCheck(pieces: BasicsPiece[], side: Color): boolean {
  const king = pieces.find((p) => p.color === side && p.type === 'k');
  if (!king) return false;
  const enemy: Color = side === 'w' ? 'b' : 'w';
  return getSquaresAttackedBySide(pieces, enemy).has(king.square);
}

export function hasUndefendedAttackedPiece(pieces: BasicsPiece[], side: Color): boolean {
  const enemy: Color = side === 'w' ? 'b' : 'w';
  const enemyAttacks = getSquaresAttackedBySide(pieces, enemy);
  const allyDefenses = getSquaresAttackedBySide(pieces, side);
  for (const p of pieces) {
    if (p.color !== side || p.type === 'k') continue;
    if (enemyAttacks.has(p.square) && !allyDefenses.has(p.square)) {
      return true;
    }
  }
  return false;
}

export function applyBasicsStarMove(params: {
  pieces: BasicsPiece[];
  stars: string[];
  from: string;
  to: string;
  promotion?: PieceSymbol;
  allowCastling?: boolean;
  enPassantSquare?: string | null;
}): { moved: boolean; pieces: BasicsPiece[]; stars: string[]; captured: boolean } {
  const legal = getBasicsLegalMoves(params.pieces, params.from, params.stars, {
    allowCastling: params.allowCastling,
    enPassantSquare: params.enPassantSquare,
  });
  if (!legal.includes(params.to)) {
    return { moved: false, pieces: params.pieces, stars: params.stars, captured: false };
  }
  const mover = params.pieces.find((p) => p.square === params.from);
  if (!mover) {
    return { moved: false, pieces: params.pieces, stars: params.stars, captured: false };
  }
  const hadEnemy =
    params.pieces.some((p) => p.square === params.to && p.color !== mover.color) ||
    Boolean(mover.type === 'p' && params.enPassantSquare && params.to === params.enPassantSquare);
  const hadStar = params.stars.includes(params.to);

  const nextPieces = simulatePieceMove(
    params.pieces,
    params.from,
    params.to,
    params.enPassantSquare,
    params.promotion ?? 'q',
  );
  const nextStars = params.stars.filter((s) => s !== params.to);

  return {
    moved: true,
    pieces: nextPieces,
    stars: nextStars,
    captured: hadEnemy || hadStar,
  };
}

/**
 * Exact 18 Lichess Chess Basics Lessons and all 104 stages across:
 * - Chess pieces (6 lessons: The rook, The bishop, The queen, The king, The knight, The pawn)
 * - Fundamentals (6 lessons: Capture, Protection, Combat, Check in one, Out of check, Mate in one)
 * - Intermediate (4 lessons: Board setup, Castling, En passant, Stalemate)
 * - Advanced (2 lessons: Piece value, Check in two)
 */
export const CHESS_BASICS_LESSONS: BasicsLesson[] = [
  // =========================================================================
  // SECTION 1: CHESS PIECES (6 LESSONS)
  // =========================================================================
  {
    id: 'basics-rook',
    section: 'Chess pieces',
    title: 'The rook',
    subtitle: 'It moves in straight lines',
    pieceIcon: 'r',
    stages: [
      buildStageFromFen({
        id: 'rook-1',
        title: 'Stage 1',
        instruction: 'The rook moves in straight lines. Click on the rook and bring it to the star!',
        fen: '8/8/4R3/8/8/8/8/8 w - -',
        apples: 'e3',
        par: 1,
        arrows: [{ from: 'e6', to: 'e3', color: 'green' }],
      }),
      buildStageFromFen({
        id: 'rook-2',
        title: 'Stage 2',
        instruction: 'Grab all the stars!',
        fen: '8/2R5/8/8/8/8/8/8 w - -',
        apples: 'c5 g5',
        par: 2,
      }),
      buildStageFromFen({
        id: 'rook-3',
        title: 'Stage 3',
        instruction: 'The fewer moves you make, the more points you win!',
        fen: '8/8/8/8/3R4/8/8/8 w - -',
        apples: 'a4 f3 f4',
        par: 3,
      }),
      buildStageFromFen({
        id: 'rook-4',
        title: 'Stage 4',
        instruction: 'Grab all the stars in as few moves as possible!',
        fen: '7R/8/8/8/8/8/8/8 w - -',
        apples: 'f7 g1 g7 g8 h1',
        par: 5,
      }),
      buildStageFromFen({
        id: 'rook-5',
        title: 'Stage 5',
        instruction: 'Use two rooks to speed things up!',
        fen: '8/8/8/8/3R4/8/8/R7 w - -',
        apples: 'a4 g1 g3 g7',
        par: 4,
      }),
      buildStageFromFen({
        id: 'rook-6',
        title: 'Stage 6',
        instruction: 'Use two rooks to speed things up!',
        fen: '8/1R6/8/8/8/8/8/R7 w - -',
        apples: 'b3 d2 d7 e4 f4 f7 h2',
        par: 7,
      }),
    ],
  },
  {
    id: 'basics-bishop',
    section: 'Chess pieces',
    title: 'The bishop',
    subtitle: 'It moves diagonally',
    pieceIcon: 'b',
    stages: [
      buildStageFromFen({
        id: 'bishop-1',
        title: 'Stage 1',
        instruction: 'The bishop moves diagonally. Grab both stars!',
        fen: '8/8/8/8/8/5B2/8/8 w - -',
        apples: 'b7 h5',
        par: 2,
        arrows: [
          { from: 'f3', to: 'h5', color: 'green' },
          { from: 'h5', to: 'b7', color: 'green' },
        ],
      }),
      buildStageFromFen({
        id: 'bishop-2',
        title: 'Stage 2',
        instruction: 'Grab all the stars!',
        fen: '8/8/8/8/8/8/1B6/8 w - -',
        apples: 'a1 b4 c1 d2 d6 e5',
        par: 6,
      }),
      buildStageFromFen({
        id: 'bishop-3',
        title: 'Stage 3',
        instruction: 'The fewer moves you make, the more points you win!',
        fen: '8/8/8/3B4/8/8/8/8 w - -',
        apples: 'a6 b1 b7 d1 g2 h3',
        par: 6,
      }),
      buildStageFromFen({
        id: 'bishop-4',
        title: 'Stage 4',
        instruction: 'Grab all the stars in as few moves as possible!',
        fen: '8/8/8/8/2B5/8/8/8 w - -',
        apples: 'a4 b3 c2 d1 d3 e2',
        par: 6,
      }),
      buildStageFromFen({
        id: 'bishop-5',
        title: 'Stage 5',
        instruction: 'One light-squared bishop, one dark-squared bishop. You need both!',
        fen: '8/8/8/8/8/8/8/2B2B2 w - -',
        apples: 'c7 d3 d8 e3 g5 h5',
        par: 6,
      }),
      buildStageFromFen({
        id: 'bishop-6',
        title: 'Stage 6',
        instruction: 'One light-squared bishop, one dark-squared bishop. You need both!',
        fen: '8/3B4/8/8/8/2B5/8/8 w - -',
        apples: 'a2 a3 a8 b8 d2 e1 f5 g3 h5 h6 h8',
        par: 11,
      }),
    ],
  },
  {
    id: 'basics-queen',
    section: 'Chess pieces',
    title: 'The queen',
    subtitle: 'Queen = rook + bishop',
    pieceIcon: 'q',
    stages: [
      buildStageFromFen({
        id: 'queen-1',
        title: 'Stage 1',
        instruction: 'The queen combines the power of the rook and the bishop. Grab both stars!',
        fen: '8/8/8/8/8/8/3Q4/8 w - -',
        apples: 'a8 d5',
        par: 2,
        arrows: [
          { from: 'd2', to: 'd5', color: 'green' },
          { from: 'd5', to: 'a8', color: 'green' },
        ],
      }),
      buildStageFromFen({
        id: 'queen-2',
        title: 'Stage 2',
        instruction: 'Grab all the stars!',
        fen: '8/8/8/8/3Q4/8/8/8 w - -',
        apples: 'a3 c1 f2 h8',
        par: 4,
      }),
      buildStageFromFen({
        id: 'queen-3',
        title: 'Stage 3',
        instruction: 'Grab all the stars in as few moves as possible!',
        fen: '8/8/8/8/2Q5/8/8/8 w - -',
        apples: 'a3 d6 f1 f8 g3 h6',
        par: 6,
      }),
      buildStageFromFen({
        id: 'queen-4',
        title: 'Stage 4',
        instruction: 'Grab all the stars in as few moves as possible!',
        fen: '8/7Q/8/8/8/8/8/8 w - -',
        apples: 'a1 b8 d2 d5 f2 g8 h3',
        par: 7,
      }),
      buildStageFromFen({
        id: 'queen-5',
        title: 'Stage 5',
        instruction: 'Grab all the stars in as few moves as possible!',
        fen: '8/8/6Q1/8/8/8/8/8 w - -',
        apples: 'a4 a7 b8 c1 d8 f1 g3 h4',
        par: 8,
      }),
    ],
  },
  {
    id: 'basics-king',
    section: 'Chess pieces',
    title: 'The king',
    subtitle: 'The most important piece',
    pieceIcon: 'k',
    stages: [
      buildStageFromFen({
        id: 'king-1',
        title: 'Stage 1',
        instruction: 'The king is slow. It moves only one square in any direction. Grab all the stars!',
        fen: '8/8/8/8/8/3K4/8/8 w - -',
        apples: 'c4 d5 e4',
        par: 3,
      }),
      buildStageFromFen({
        id: 'king-2',
        title: 'Stage 2',
        instruction: 'Grab all the stars!',
        fen: '8/8/8/4K3/8/8/8/8 w - -',
        apples: 'b2 c1 c2 c3 d3 e3',
        par: 6,
      }),
      buildStageFromFen({
        id: 'king-3',
        title: 'Stage 3',
        instruction: 'Grab all the stars!',
        fen: '8/8/8/4K3/8/8/8/8 w - -',
        apples: 'c4 c5 d6 e4 f6 g5 g6',
        par: 8,
      }),
    ],
  },
  {
    id: 'basics-knight',
    section: 'Chess pieces',
    title: 'The knight',
    subtitle: 'It moves in an L shape',
    pieceIcon: 'n',
    stages: [
      buildStageFromFen({
        id: 'knight-1',
        title: 'Stage 1',
        instruction: 'Here is a challenge for you: the knight moves in an L shape. Grab both stars!',
        fen: '8/8/8/8/4N3/8/8/8 w - -',
        apples: 'c5 d7',
        par: 2,
        arrows: [
          { from: 'e4', to: 'c5', color: 'green' },
          { from: 'c5', to: 'd7', color: 'green' },
        ],
      }),
      buildStageFromFen({
        id: 'knight-2',
        title: 'Stage 2',
        instruction: 'Grab all the stars!',
        fen: '8/8/8/8/8/8/8/1N6 w - -',
        apples: 'c3 d4 e6 f4 g6 h8',
        par: 6,
      }),
      buildStageFromFen({
        id: 'knight-3',
        title: 'Stage 3',
        instruction: 'Knights can jump over obstacles! Escape and vanquish the stars!',
        fen: '8/2N5/8/8/8/8/8/8 w - -',
        apples: 'b5 d4 d6 e8 f7',
        par: 5,
      }),
      buildStageFromFen({
        id: 'knight-4',
        title: 'Stage 4',
        instruction: 'Knights can jump over obstacles! Escape and vanquish the stars!',
        fen: '8/8/8/8/8/3N4/8/8 w - -',
        apples: 'c2 c4 d2 d4 e2 e3 e4',
        par: 9,
      }),
      buildStageFromFen({
        id: 'knight-5',
        title: 'Stage 5',
        instruction: 'Grab all the stars in as few moves as possible!',
        fen: '8/8/2N5/8/8/8/8/8 w - -',
        apples: 'b4 d4 d8 e3 e7 f4 f8 h7',
        par: 8,
      }),
      buildStageFromFen({
        id: 'knight-6',
        title: 'Stage 6',
        instruction: 'Grab all the stars in as few moves as possible!',
        fen: '8/2N5/8/8/8/8/8/8 w - -',
        apples: 'a4 b2 b6 c3 c5 d2 d4 e5 f3',
        par: 9,
      }),
    ],
  },
  {
    id: 'basics-pawn',
    section: 'Chess pieces',
    title: 'The pawn',
    subtitle: 'It moves forward only',
    pieceIcon: 'p',
    stages: [
      buildStageFromFen({
        id: 'pawn-1',
        title: 'Stage 1',
        instruction:
          'Pawns are weak, but they pack a lot of potential. They move forward only, one square at a time, and promote when reaching the 8th rank!',
        fen: '8/8/8/8/8/P7/8/8 w - -',
        apples: 'f3',
        par: 6,
      }),
      buildStageFromFen({
        id: 'pawn-2',
        title: 'Stage 2',
        instruction: 'Most of the time, promoting to a queen is the best choice. Grab all the stars!',
        fen: '8/8/8/8/8/2P5/8/8 w - -',
        apples: 'a6 b4 b7 d6 f8 g1 h2',
        par: 12,
      }),
      buildStageFromFen({
        id: 'pawn-3',
        title: 'Stage 3',
        instruction: 'Pawns move forward, but they capture diagonally!',
        fen: '8/8/8/8/8/4P3/8/8 w - -',
        apples: 'c6 d5 d7',
        par: 4,
      }),
      buildStageFromFen({
        id: 'pawn-4',
        title: 'Stage 4',
        instruction: 'Capture, then promote!',
        fen: '8/8/8/8/8/1P6/8/8 w - -',
        apples: 'a4 a6 a7 b4 b6 b7 c5 c8 d6',
        par: 10,
      }),
      buildStageFromFen({
        id: 'pawn-5',
        title: 'Stage 5',
        instruction: 'Capture, then promote!',
        fen: '8/8/8/8/8/3P4/8/8 w - -',
        apples: 'b7 c5 c6 c8 d6 e4 e7 f6',
        par: 8,
      }),
      buildStageFromFen({
        id: 'pawn-6',
        title: 'Stage 6',
        instruction: 'Use all the pawns! No need to promote.',
        fen: '8/8/8/8/8/P2PP1PP/8/8 w - -',
        apples: 'b4 c5 d4 f4 g4',
        par: 5,
      }),
      buildStageFromFen({
        id: 'pawn-7',
        title: 'Stage 7',
        instruction:
          'A pawn on the second rank can move 2 squares at once! Grab all the stars.',
        fen: '8/8/8/8/8/8/4P3/8 w - -',
        apples: 'd6 f5',
        par: 3,
        arrows: [{ from: 'e2', to: 'e4', color: 'green' }],
      }),
      buildStageFromFen({
        id: 'pawn-8',
        title: 'Stage 8',
        instruction: 'Grab all the stars! No need to promote.',
        fen: '8/8/8/8/8/8/2PPPP2/8 w - -',
        apples: 'b5 c5 d4 d5 e4 e5 f5 g5',
        par: 8,
      }),
    ],
  },

  // =========================================================================
  // SECTION 2: FUNDAMENTALS (6 LESSONS)
  // =========================================================================
  {
    id: 'basics-capture',
    section: 'Fundamentals',
    title: 'Capture',
    subtitle: 'Take the enemy pieces',
    pieceIcon: 'q',
    stages: [
      buildStageFromFen({
        id: 'cap-1',
        title: 'Stage 1',
        instruction:
          'You are ready for combat! Capture the enemy pieces, and watch out for their attacks.',
        fen: '8/2p2p2/8/8/8/8/6R1/8 w - -',
        goalMode: 'capture-all',
        par: 2,
        arrows: [
          { from: 'g2', to: 'g7', color: 'green' },
          { from: 'g7', to: 'f7', color: 'green' },
          { from: 'f7', to: 'e6', color: 'red' },
          { from: 'f7', to: 'g6', color: 'red' },
          { from: 'c7', to: 'b6', color: 'red' },
          { from: 'c7', to: 'd6', color: 'red' },
        ],
      }),
      buildStageFromFen({
        id: 'cap-2',
        title: 'Stage 2',
        instruction: "Capture the black pieces! And don't lose yours.",
        fen: '8/5r2/8/1r6/8/8/8/2Q5 w - -',
        goalMode: 'capture-all',
        par: 2,
      }),
      buildStageFromFen({
        id: 'cap-3',
        title: 'Stage 3',
        instruction: "Capture the black pieces! And don't lose yours.",
        fen: '8/4b3/8/2n1p3/8/3B4/8/8 w - -',
        goalMode: 'capture-all',
        par: 5,
      }),
      buildStageFromFen({
        id: 'cap-4',
        title: 'Stage 4',
        instruction: "Capture the black pieces! And don't lose yours.",
        fen: '8/5b2/4p3/4p3/8/8/8/4Q3 w - -',
        goalMode: 'capture-all',
        par: 5,
      }),
      buildStageFromFen({
        id: 'cap-5',
        title: 'Stage 5',
        instruction: "Capture the black pieces! And don't lose yours.",
        fen: '8/3q4/8/2p2n2/8/1p6/3N4/8 w - -',
        goalMode: 'capture-all',
        par: 6,
      }),
    ],
  },
  {
    id: 'basics-protection',
    section: 'Fundamentals',
    title: 'Protection',
    subtitle: 'Keep your pieces safe',
    pieceIcon: 'r',
    stages: [
      buildStageFromFen({
        id: 'prot-1',
        title: 'Stage 1',
        instruction: 'You are under attack! Escape the threat!',
        fen: '8/8/2q5/8/8/8/2B5/8 w - -',
        goalMode: 'protect',
        par: 1,
        arrows: [{ from: 'c6', to: 'c2', color: 'red' }],
      }),
      buildStageFromFen({
        id: 'prot-2',
        title: 'Stage 2',
        instruction: 'Escape the threat!',
        fen: '8/8/8/8/3n4/8/2P1R3/8 w - -',
        goalMode: 'protect',
        par: 1,
      }),
      buildStageFromFen({
        id: 'prot-3',
        title: 'Stage 3',
        instruction: 'There is no escape, but you can defend!',
        fen: '4r3/8/8/8/8/8/1N6/4P3 w - -',
        goalMode: 'protect',
        par: 1,
        arrows: [
          { from: 'e8', to: 'e1', color: 'red' },
          { from: 'b2', to: 'd3', color: 'green' },
          { from: 'd3', to: 'e1', color: 'blue' },
        ],
      }),
      buildStageFromFen({
        id: 'prot-4',
        title: 'Stage 4',
        instruction: "Don't let them take any undefended piece!",
        fen: '8/1b6/8/8/8/8/5PP1/8 w - -',
        goalMode: 'protect',
        par: 1,
      }),
      buildStageFromFen({
        id: 'prot-5',
        title: 'Stage 5',
        instruction: "Don't let them take any undefended piece!",
        fen: '1b2r3/8/8/8/8/8/P3B3/R7 w - -',
        goalMode: 'protect',
        par: 1,
      }),
      buildStageFromFen({
        id: 'prot-6',
        title: 'Stage 6',
        instruction: "Don't let them take any undefended piece!",
        fen: '8/6b1/8/3r4/8/1N1B4/2P5/8 w - -',
        goalMode: 'protect',
        par: 1,
      }),
      buildStageFromFen({
        id: 'prot-7',
        title: 'Stage 7',
        instruction: "Don't let them take any undefended piece!",
        fen: '8/2r3q1/8/8/4N3/2P5/4R2B/8 w - -',
        goalMode: 'protect',
        par: 1,
      }),
      buildStageFromFen({
        id: 'prot-8',
        title: 'Stage 8',
        instruction: "Don't let them take any undefended piece!",
        fen: '8/8/1r2b3/8/2N4P/4R3/3P4/8 w - -',
        goalMode: 'protect',
        par: 1,
      }),
    ],
  },
  {
    id: 'basics-combat',
    section: 'Fundamentals',
    title: 'Combat',
    subtitle: 'Capture and defend pieces',
    pieceIcon: 'n',
    stages: [
      buildStageFromFen({
        id: 'combat-1',
        title: 'Stage 1',
        instruction: 'A good warrior knows both attack and defense! Capture all the black pieces without losing yours.',
        fen: '2b5/8/8/8/4r3/4P3/8/7R w - -',
        goalMode: 'combat',
        par: 2,
      }),
      buildStageFromFen({
        id: 'combat-2',
        title: 'Stage 2',
        instruction: "Capture the black pieces! And don't lose yours.",
        fen: '8/2b5/4n3/8/3P4/8/P7/1B6 w - -',
        goalMode: 'combat',
        par: 3,
      }),
      buildStageFromFen({
        id: 'combat-3',
        title: 'Stage 3',
        instruction: "Capture the black pieces! And don't lose yours.",
        fen: '1r6/4b3/8/1n6/8/8/1PPP4/1N2R3 w - -',
        goalMode: 'combat',
        par: 4,
      }),
      buildStageFromFen({
        id: 'combat-4',
        title: 'Stage 4',
        instruction: "Capture the black pieces! And don't lose yours.",
        fen: '8/2n1b3/8/8/1p6/P5B1/3P1N2/8 w - -',
        goalMode: 'combat',
        par: 5,
      }),
      buildStageFromFen({
        id: 'combat-5',
        title: 'Stage 5',
        instruction: "Capture the black pieces! And don't lose yours.",
        fen: '8/1r4q1/8/4b3/8/5N1P/4Q1P1/8 w - -',
        goalMode: 'combat',
        par: 6,
      }),
    ],
  },
  {
    id: 'basics-check1',
    section: 'Fundamentals',
    title: 'Check in one',
    subtitle: "Attack the opponent's king",
    pieceIcon: 'b',
    stages: [
      buildStageFromFen({
        id: 'chk1-1',
        title: 'Stage 1',
        instruction: 'Target the opponent king in one move!',
        fen: '4k3/8/2b5/8/8/8/8/R7 w - - 0 1',
        goalMode: 'check1',
        expectedUci: ['a1e1', 'a1a8'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'chk1-2',
        title: 'Stage 2',
        instruction: 'Attack the opponent king in one move!',
        fen: '8/8/4k3/3n4/8/8/1Q6/8 w - - 0 1',
        goalMode: 'check1',
        expectedUci: ['b2b6', 'b2e2', 'b2e5'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'chk1-3',
        title: 'Stage 3',
        instruction: 'Attack the opponent king in one move!',
        fen: '3qk3/2pp1r2/4p3/8/2B5/5N2/8/8 w - - 0 1',
        goalMode: 'check1',
        expectedUci: ['c4b5'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'chk1-4',
        title: 'Stage 4',
        instruction: 'Attack the opponent king in one move!',
        fen: '2r1k3/2p1p1b1/1p6/4N3/8/2n5/8/8 w - - 0 1',
        goalMode: 'check1',
        expectedUci: ['e5c6', 'e5f7'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'chk1-5',
        title: 'Stage 5',
        instruction: 'Attack the opponent king in one move!',
        fen: '6k1/2n1pp1p/p2p2pB/1p6/4P3/2r2N2/5PPP/2Q3K1 w - - 0 1',
        goalMode: 'check1',
        expectedUci: ['c1c3'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'chk1-6',
        title: 'Stage 6',
        instruction: 'Attack the opponent king in one move!',
        fen: '2kr3r/pp3p2/4p3/2bn1p1p/4N3/2B4P/PPPQ1PP1/2KR4 w - - 0 1',
        goalMode: 'check1',
        expectedUci: ['e4c5', 'e4f6'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'chk1-7',
        title: 'Stage 7',
        instruction: 'Attack the opponent king in one move!',
        fen: '4r3/1k5r/p5p1/1p6/3B3n/2R4P/PP3PP1/6K1 w - - 0 1',
        goalMode: 'check1',
        expectedUci: ['c3c7'],
        par: 1,
      }),
    ],
  },
  {
    id: 'basics-out-of-check',
    section: 'Fundamentals',
    title: 'Out of check',
    subtitle: 'Defend your king',
    pieceIcon: 'k',
    stages: [
      buildStageFromFen({
        id: 'ooc-1',
        title: 'Stage 1',
        instruction: 'You are in check! Move your king to escape the attack.',
        fen: '8/8/8/4q3/8/8/8/4K3 w - - 0 1',
        goalMode: 'outOfCheck',
        par: 1,
      }),
      buildStageFromFen({
        id: 'ooc-2',
        title: 'Stage 2',
        instruction: 'Escape with the king!',
        fen: '8/8/2n5/1r6/8/2K5/8/8 w - - 0 1',
        goalMode: 'outOfCheck',
        par: 1,
      }),
      buildStageFromFen({
        id: 'ooc-3',
        title: 'Stage 3',
        instruction: 'The king cannot escape, but you can block the attack!',
        fen: '8/7r/6r1/8/R7/8/8/7K w - - 0 1',
        goalMode: 'outOfCheck',
        par: 1,
      }),
      buildStageFromFen({
        id: 'ooc-4',
        title: 'Stage 4',
        instruction: 'You can get out of check by taking the attacking piece!',
        fen: '8/8/8/3b4/8/4n3/2B5/1N1K4 w - - 0 1',
        goalMode: 'outOfCheck',
        par: 1,
      }),
      buildStageFromFen({
        id: 'ooc-5',
        title: 'Stage 5',
        instruction: 'This knight is checking you through your defenses! Escape or capture it.',
        fen: '4q3/8/8/8/8/5n2/3PPP2/3QKBN1 w - - 0 1',
        goalMode: 'outOfCheck',
        par: 1,
      }),
      buildStageFromFen({
        id: 'ooc-6',
        title: 'Stage 6',
        instruction: 'Escape with the king, block the attack, or take the attacker!',
        fen: '8/8/7p/2q5/5n2/1N1KP2r/3R4/8 w - - 0 1',
        goalMode: 'outOfCheck',
        par: 1,
      }),
      buildStageFromFen({
        id: 'ooc-7',
        title: 'Stage 7',
        instruction: 'Escape with the king, block the attack, or take the attacker!',
        fen: '8/6b1/8/5q2/5n2/8/3r1PP1/4RKN1 w - - 0 1',
        goalMode: 'outOfCheck',
        par: 1,
      }),
    ],
  },
  {
    id: 'basics-mate1',
    section: 'Fundamentals',
    title: 'Mate in one',
    subtitle: "Defeat the opponent's king",
    pieceIcon: 'q',
    stages: [
      buildStageFromFen({
        id: 'm1-1',
        title: 'Stage 1',
        instruction: 'You win when your opponent cannot defend a check. Attack the opponent king with no way out!',
        fen: '3qk3/3ppp2/8/8/2B5/5Q2/8/8 w - - 0 1',
        goalMode: 'mate1',
        expectedUci: ['f3f7'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'm1-2',
        title: 'Stage 2',
        instruction: 'Checkmate the opponent in one move!',
        fen: '6rk/6pp/7P/8/8/8/8/3N4 w - - 0 1',
        goalMode: 'mate1',
        expectedUci: ['h6g7'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'm1-3',
        title: 'Stage 3',
        instruction: 'Checkmate the opponent in one move!',
        fen: '7k/7p/4N3/8/8/8/5R2/6R1 w - - 0 1',
        goalMode: 'mate1',
        expectedUci: ['f2f8', 'g1g8'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'm1-4',
        title: 'Stage 4',
        instruction: 'Checkmate the opponent in one move!',
        fen: '2rb3k/2p2n1p/4B3/8/8/2Q5/8/8 w - - 0 1',
        goalMode: 'mate1',
        expectedUci: ['c3g7'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'm1-5',
        title: 'Stage 5',
        instruction: 'Checkmate the opponent in one move!',
        fen: '8/8/7R/1b5k/5p1r/5p2/6B1/8 w - - 0 1',
        goalMode: 'mate1',
        expectedUci: ['g2f3'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'm1-6',
        title: 'Stage 6',
        instruction: 'Checkmate the opponent in one move!',
        fen: '8/2rB4/2k5/8/2Q5/4N2p/p1p5/8 w - - 0 1',
        goalMode: 'mate1',
        expectedUci: ['c4b5'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'm1-7',
        title: 'Stage 7',
        instruction: 'Checkmate the opponent in one move!',
        fen: '1r4k1/5p1p/5Bp1/3q4/1p1r4/3Q2P1/5PKP/R7 w - - 0 1',
        goalMode: 'mate1',
        expectedUci: ['d3d5'],
        par: 1,
      }),
    ],
  },

  // =========================================================================
  // SECTION 3: INTERMEDIATE (4 LESSONS)
  // =========================================================================
  {
    id: 'basics-setup',
    section: 'Intermediate',
    title: 'Board setup',
    subtitle: 'How the game starts',
    pieceIcon: 'q',
    stages: [
      buildStageFromFen({
        id: 'setup-1',
        title: 'Stage 1',
        instruction:
          'The two armies face each other, ready for battle! This is the initial position of every game of chess. Make any legal move to continue.',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        goalMode: 'any-move',
        par: 1,
      }),
      buildStageFromFen({
        id: 'setup-2',
        title: 'Stage 2',
        instruction: 'First place the rooks! They go in the corners.',
        fen: 'r6r/8/8/8/3RR3/8/8/8 w - -',
        apples: 'a1 h1',
        goalMode: 'setup-stars',
        par: 2,
      }),
      buildStageFromFen({
        id: 'setup-3',
        title: 'Stage 3',
        instruction: 'Then place the knights! They go next to the rooks.',
        fen: 'rn4nr/8/8/4N3/3N4/8/8/R6R w - -',
        apples: 'b1 g1',
        goalMode: 'setup-stars',
        par: 2,
      }),
      buildStageFromFen({
        id: 'setup-4',
        title: 'Stage 4',
        instruction: 'Place the bishops! They go next to the knights.',
        fen: 'rnb2bnr/8/8/8/3BB3/8/8/RN4NR w - -',
        apples: 'c1 f1',
        goalMode: 'setup-stars',
        par: 4,
      }),
      buildStageFromFen({
        id: 'setup-5',
        title: 'Stage 5',
        instruction: 'The queen goes on her own color: white queen on the light square d1!',
        fen: 'rnbq1bnr/8/8/8/8/4Q3/8/RNB2BNR w - -',
        apples: 'd1',
        goalMode: 'setup-stars',
        par: 2,
      }),
      buildStageFromFen({
        id: 'setup-6',
        title: 'Stage 6',
        instruction: 'Drop the king on the remaining square e1.',
        fen: 'rnbqkbnr/8/8/8/8/4K3/8/RNBQ1BNR w - -',
        apples: 'e1',
        goalMode: 'setup-stars',
        par: 2,
      }),
      buildStageFromFen({
        id: 'setup-7',
        title: 'Stage 7',
        instruction: 'Pawns form the front line. Make any legal move to complete Board setup!',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        goalMode: 'any-move',
        par: 1,
      }),
    ],
  },
  {
    id: 'basics-castling',
    section: 'Intermediate',
    title: 'Castling',
    subtitle: 'The special king move',
    pieceIcon: 'k',
    stages: [
      buildStageFromFen({
        id: 'cas-1',
        title: 'Stage 1',
        instruction:
          'Bring your king to safety, and deploy your rook for attack! Move your king two squares to the kingside (g1) to castle!',
        fen: '8/8/8/8/8/8/4PPPP/4K2R w K -',
        goalMode: 'castling',
        castleSide: 'k',
        par: 1,
        arrows: [
          { from: 'e1', to: 'g1', color: 'green' },
          { from: 'h1', to: 'f1', color: 'blue' },
        ],
      }),
      buildStageFromFen({
        id: 'cas-2',
        title: 'Stage 2',
        instruction: 'You cannot castle when pieces are in the way. Move the knight first, then castle kingside!',
        fen: '8/8/8/8/8/8/4PPPP/4K1NR w K -',
        goalMode: 'castling',
        castleSide: 'k',
        par: 2,
      }),
      buildStageFromFen({
        id: 'cas-3',
        title: 'Stage 3',
        instruction:
          'You can also castle on the queenside! Move your king two squares to c1 to castle queenside.',
        fen: '8/8/8/8/8/8/PPPPP3/R3K3 w Q -',
        goalMode: 'castling',
        castleSide: 'q',
        par: 1,
        arrows: [
          { from: 'e1', to: 'c1', color: 'green' },
          { from: 'a1', to: 'd1', color: 'blue' },
        ],
      }),
      buildStageFromFen({
        id: 'cas-4',
        title: 'Stage 4',
        instruction: 'Move the pieces out of the way, then castle on the queenside!',
        fen: '8/8/8/8/8/8/PPPPPPPP/RNBQK2R w KQ -',
        goalMode: 'castling',
        castleSide: 'q',
        par: 4,
      }),
      buildStageFromFen({
        id: 'cas-5',
        title: 'Stage 5',
        instruction: 'Develop your kingside pieces and castle on the kingside!',
        fen: '8/8/8/8/8/8/PPPPPPPP/RNBQKBNR w KQ -',
        goalMode: 'castling',
        castleSide: 'k',
        par: 4,
      }),
      buildStageFromFen({
        id: 'cas-6',
        title: 'Stage 6',
        instruction: 'You cannot castle if the king or rook has already moved. Castle on the queenside!',
        fen: '8/8/8/8/8/8/PPPPPPPP/R3K2R w Q -',
        goalMode: 'castling',
        castleSide: 'q',
        par: 1,
        highlights: [{ square: 'h1', color: 'red' }],
      }),
      buildStageFromFen({
        id: 'cas-7',
        title: 'Stage 7',
        instruction:
          'You cannot castle if the king is attacked on the way. Block the check first, then castle!',
        fen: '5r2/8/8/8/8/8/PPPPB1PP/4K2R w K -',
        goalMode: 'castling',
        castleSide: 'k',
        par: 2,
        arrows: [{ from: 'f8', to: 'f1', color: 'red' }],
      }),
      buildStageFromFen({
        id: 'cas-8',
        title: 'Stage 8',
        instruction: 'Find a way to castle on the kingside!',
        fen: '8/8/8/8/8/1b6/PPP1BPPP/R2QK2R w KQ -',
        goalMode: 'castling',
        castleSide: 'k',
        par: 2,
      }),
      buildStageFromFen({
        id: 'cas-9',
        title: 'Stage 9',
        instruction: 'Find a way to castle on the queenside!',
        fen: '4r3/8/2n3q1/8/8/b2B3P/P2NPPPB/R2QK2R w KQ -',
        goalMode: 'castling',
        castleSide: 'q',
        par: 4,
      }),
    ],
  },
  {
    id: 'basics-en-passant',
    section: 'Intermediate',
    title: 'En passant',
    subtitle: 'The special pawn move',
    pieceIcon: 'p',
    stages: [
      buildStageFromFen({
        id: 'ep-1',
        title: 'Stage 1',
        instruction:
          'Black just moved the pawn by two squares (d7-d5)! Take the pawn en passant on d6.',
        fen: '8/8/8/2ppP3/8/8/8/8 w - d6',
        goalMode: 'enpassant',
        enPassantQueue: [{ blackMove: 'd7d5', epSquare: 'd6', whiteMoves: ['e5d6'] }],
        expectedUci: ['e5d6'],
        par: 1,
        arrows: [{ from: 'e5', to: 'd6', color: 'green' }],
      }),
      buildStageFromFen({
        id: 'ep-2',
        title: 'Stage 2',
        instruction:
          'En passant only works immediately after the enemy pawn moved 2 squares. Take on f6 en passant!',
        fen: '8/8/8/3pPf2/8/8/8/8 w - f6',
        goalMode: 'enpassant',
        enPassantQueue: [{ blackMove: 'f7f5', epSquare: 'f6', whiteMoves: ['e5f6'] }],
        expectedUci: ['e5f6'],
        par: 1,
        highlights: [{ square: 'd6', color: 'red' }],
      }),
      buildStageFromFen({
        id: 'ep-3',
        title: 'Stage 3',
        instruction:
          'En passant only works if your pawn is on the 5th rank. Capture on g6 en passant!',
        fen: '8/8/3P4/2p2Ppn/8/8/8/8 w - g6',
        goalMode: 'enpassant',
        enPassantQueue: [{ blackMove: 'g7g5', epSquare: 'g6', whiteMoves: ['f5g6'] }],
        expectedUci: ['f5g6'],
        par: 1,
        highlights: [{ square: 'c6', color: 'red' }],
      }),
      buildStageFromFen({
        id: 'ep-4',
        title: 'Stage 4',
        instruction: 'Take all the pawns en passant as Black advances them!',
        fen: '8/3p1pp1/8/PppP3P/8/8/8/8 w - b6',
        goalMode: 'enpassant',
        enPassantQueue: [
          { blackMove: 'b7b5', epSquare: 'b6', whiteMoves: ['a5b6', 'c5b6'] },
          { blackMove: 'd7d5', epSquare: 'd6', whiteMoves: ['c5d6', 'e5d6'] },
          { blackMove: 'f7f5', epSquare: 'f6', whiteMoves: ['e5f6'] },
          { blackMove: 'g7g5', epSquare: 'g6', whiteMoves: ['h5g6'] },
        ],
        par: 4,
      }),
    ],
  },
  {
    id: 'basics-stalemate',
    section: 'Intermediate',
    title: 'Stalemate',
    subtitle: 'The game is a draw',
    pieceIcon: 'k',
    stages: [
      buildStageFromFen({
        id: 'stale-1',
        title: 'Stage 1',
        instruction:
          'When a player is not in check and does not have any legal move, it is a stalemate (draw). To put black in stalemate: move your bishop to e3!',
        fen: 'k7/8/8/6B1/8/1R6/8/8 w - - 0 1',
        goalMode: 'stalemate',
        expectedUci: ['g5e3'],
        par: 1,
        arrows: [
          { from: 'b3', to: 'b8', color: 'blue' },
          { from: 'g5', to: 'e3', color: 'green' },
          { from: 'e3', to: 'a7', color: 'blue' },
        ],
      }),
      buildStageFromFen({
        id: 'stale-2',
        title: 'Stage 2',
        instruction: 'Stalemate black in one move!',
        fen: '8/7p/7k/8/8/3N2Q1/8/8 w - - 0 1',
        goalMode: 'stalemate',
        expectedUci: ['d3f4'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'stale-3',
        title: 'Stage 3',
        instruction: 'Stalemate black in one move!',
        fen: '4k3/6p1/5p2/p4P2/PnB2N2/1K6/8/3R4 w - - 0 1',
        goalMode: 'stalemate',
        expectedUci: ['f4g6'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'stale-4',
        title: 'Stage 4',
        instruction: 'Stalemate black in one move!',
        fen: '8/6pk/6np/7K/8/3B4/8/1R6 w - - 0 1',
        goalMode: 'stalemate',
        expectedUci: ['b1b8'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'stale-5',
        title: 'Stage 5',
        instruction: 'Stalemate black in one move!',
        fen: '7R/8/8/6p1/3Q2P1/8/1r2P1BP/k4K2 w - - 0 1',
        goalMode: 'stalemate',
        expectedUci: ['d4b2'],
        par: 1,
      }),
    ],
  },

  // =========================================================================
  // SECTION 4: ADVANCED (2 LESSONS)
  // =========================================================================
  {
    id: 'basics-value',
    section: 'Advanced',
    title: 'Piece value',
    subtitle: 'Evaluate piece strength',
    pieceIcon: 'q',
    stages: [
      buildStageFromFen({
        id: 'val-1',
        title: 'Stage 1',
        instruction:
          'Pieces with higher mobility have higher value! (Queen = 9, Rook = 5, Bishop = 3, Knight = 3, Pawn = 1). Take the piece with the highest value!',
        fen: '8/8/2q5/1p1B1b2/8/4n3/6r1/8 w - - 0 1',
        goalMode: 'value',
        expectedUci: ['d5c6'],
        par: 1,
        arrows: [{ from: 'd5', to: 'c6', color: 'green' }],
      }),
      buildStageFromFen({
        id: 'val-2',
        title: 'Stage 2',
        instruction: "Take the piece with the highest value! Do not trade your Queen for a defended pawn.",
        fen: '8/7b/4r3/2n5/8/8/4Q2p/8 w - - 0 1',
        goalMode: 'value',
        expectedUci: ['e2e6'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'val-3',
        title: 'Stage 3',
        instruction: 'Take the piece with the highest value!',
        fen: '3r1k2/8/8/1b6/2pKrb2/8/2B5/8 w - - 0 1',
        goalMode: 'value',
        expectedUci: ['d4e4', 'c2e4'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'val-4',
        title: 'Stage 4',
        instruction: 'Take the piece with the highest value!',
        fen: '6k1/5p2/6p1/8/3Pp3/4P1P1/1r2K2R/3q4 w - - 0 1',
        goalMode: 'value',
        expectedUci: ['e2d1'],
        par: 1,
      }),
      buildStageFromFen({
        id: 'val-5',
        title: 'Stage 5',
        instruction: 'Take the piece with the highest value!',
        fen: 'r4rk1/p1p2ppp/2p4q/3p4/3Pn2b/5N1P/PPP2PP1/R1BQR1K1 w - - 0 1',
        goalMode: 'value',
        expectedUci: ['c1h6'],
        par: 1,
      }),
    ],
  },
  {
    id: 'basics-check2',
    section: 'Advanced',
    title: 'Check in two',
    subtitle: 'Two moves to give a check',
    pieceIcon: 'r',
    stages: [
      buildStageFromFen({
        id: 'c2-1',
        title: 'Stage 1',
        instruction: 'Threaten the opponent king in two moves!',
        fen: '4k3/8/2b5/2R5/8/8/8/8 w - - 0 1',
        goalMode: 'check2',
        expectedUci: ['c5a5'],
        secondMoveUci: ['a5a8'],
        par: 2,
        arrows: [
          { from: 'c5', to: 'a5', color: 'green' },
          { from: 'a5', to: 'a8', color: 'green' },
        ],
      }),
      buildStageFromFen({
        id: 'c2-2',
        title: 'Stage 2',
        instruction: 'Threaten the opponent king in two moves!',
        fen: '8/2k5/8/8/8/1N6/8/8 w - - 0 1',
        goalMode: 'check2',
        expectedUci: ['b3d4', 'b3c5'],
        secondMoveUci: ['d4b5', 'd4e6', 'c5a6', 'c5e6'],
        par: 2,
      }),
      buildStageFromFen({
        id: 'c2-3',
        title: 'Stage 3',
        instruction: 'Threaten the opponent king in two moves!',
        fen: '6k1/6p1/8/5r1p/8/8/2B5/6R1 w - - 0 1',
        goalMode: 'check2',
        expectedUci: ['c2f5', 'c2b3'],
        secondMoveUci: ['f5e6', 'b3g8'],
        par: 2,
      }),
      buildStageFromFen({
        id: 'c2-4',
        title: 'Stage 4',
        instruction: 'Threaten the opponent king in two moves!',
        fen: '2r3k1/3ppp1p/8/8/8/4B3/2Q5/8 w - - 0 1',
        goalMode: 'check2',
        expectedUci: ['c2c8'],
        secondMoveUci: ['c8d8', 'c8e8'],
        par: 2,
      }),
      buildStageFromFen({
        id: 'c2-5',
        title: 'Stage 5',
        instruction: 'Threaten the opponent king in two moves!',
        fen: '6k1/5p1p/p2pb1p1/5r2/2p5/4B1PP/PP3PK1/3R4 w - - 0 1',
        goalMode: 'check2',
        expectedUci: ['d1d8', 'e3h6', 'e3d4'],
        secondMoveUci: ['d8g8', 'h6f8', 'd4f6'],
        par: 2,
      }),
      buildStageFromFen({
        id: 'c2-6',
        title: 'Stage 6',
        instruction: 'Threaten the opponent king in two moves!',
        fen: 'r2q1rk1/pp2ppbp/3p1np1/2p3B1/2B1P1b1/2NP1N2/PPPQ1PPP/R3K2R w KQ - 0 1',
        goalMode: 'check2',
        expectedUci: ['g5f6'],
        secondMoveUci: ['d2h6', 'c4f7'],
        par: 2,
      }),
      buildStageFromFen({
        id: 'c2-7',
        title: 'Stage 7',
        instruction: 'Threaten the opponent king in two moves!',
        fen: '6k1/5p1p/5p2/1r6/8/1P3N1P/2q2PP1/6K1 w - - 0 1',
        goalMode: 'check2',
        expectedUci: ['f3d4'],
        secondMoveUci: ['d4c2', 'd4e6'],
        par: 2,
      }),
    ],
  },
];

/**
 * Exact 32 Lichess Practice Courses across all 5 categories (316 total exercises):
 * - Checkmates (7 courses)
 * - Fundamental tactics (8 courses)
 * - Advanced tactics (10 courses)
 * - Pawn Endgames (3 courses)
 * - Rook Endgames (4 courses)
 */
export const PRACTICE_COURSES: PracticeCourseMeta[] = [
  // Checkmates (7)
  {
    id: 'BJy6fEDf',
    category: 'Checkmates',
    title: 'Piece Checkmates I',
    subtitle: 'Basic checkmates',
    level: 'Beginner',
    totalExercises: 6,
  },
  {
    id: 'fE4k21MW',
    category: 'Checkmates',
    title: 'Checkmate Patterns I',
    subtitle: 'Recognize the patterns',
    level: 'Beginner',
    totalExercises: 18,
  },
  {
    id: '8yadFPpU',
    category: 'Checkmates',
    title: 'Checkmate Patterns II',
    subtitle: 'Recognize the patterns',
    level: 'Intermediate',
    totalExercises: 23,
  },
  {
    id: 'PDkQDt6u',
    category: 'Checkmates',
    title: 'Checkmate Patterns III',
    subtitle: 'Recognize the patterns',
    level: 'Intermediate',
    totalExercises: 18,
  },
  {
    id: '96Lij7wH',
    category: 'Checkmates',
    title: 'Checkmate Patterns IV',
    subtitle: 'Recognize the patterns',
    level: 'Advanced',
    totalExercises: 15,
  },
  {
    id: 'Rg2cMBZ6',
    category: 'Checkmates',
    title: 'Piece Checkmates II',
    subtitle: 'Challenging checkmates',
    level: 'Intermediate',
    totalExercises: 7,
  },
  {
    id: 'ByhlXnmM',
    category: 'Checkmates',
    title: 'Knight & Bishop Mate',
    subtitle: 'Interactive lesson',
    level: 'Advanced',
    totalExercises: 12,
  },

  // Fundamental tactics (8)
  {
    id: '9ogFv8Ac',
    category: 'Fundamental tactics',
    title: 'The Pin',
    subtitle: 'Pin it to win it',
    level: 'Beginner',
    totalExercises: 8,
  },
  {
    id: 'tuoBxVE5',
    category: 'Fundamental tactics',
    title: 'The Skewer',
    subtitle: 'Yum - skewers!',
    level: 'Beginner',
    totalExercises: 8,
  },
  {
    id: 'Qj281y1p',
    category: 'Fundamental tactics',
    title: 'The Fork',
    subtitle: 'Use the fork, Luke',
    level: 'Beginner',
    totalExercises: 16,
  },
  {
    id: 'MnsJEWnI',
    category: 'Fundamental tactics',
    title: 'Discovered Attacks',
    subtitle: 'Including discovered checks',
    level: 'Beginner',
    totalExercises: 10,
  },
  {
    id: 'RUQASaZm',
    category: 'Fundamental tactics',
    title: 'Double Check',
    subtitle: 'A very powerful tactic',
    level: 'Intermediate',
    totalExercises: 6,
  },
  {
    id: 'o734CNqp',
    category: 'Fundamental tactics',
    title: 'Overloaded Pieces',
    subtitle: 'They have too much work',
    level: 'Intermediate',
    totalExercises: 10,
  },
  {
    id: 'ITWY4GN2',
    category: 'Fundamental tactics',
    title: 'Zwischenzug',
    subtitle: 'In-between moves',
    level: 'Intermediate',
    totalExercises: 5,
  },
  {
    id: 'lyVYjhPG',
    category: 'Fundamental tactics',
    title: 'X-Ray',
    subtitle: 'Attacking through an enemy piece',
    level: 'Intermediate',
    totalExercises: 7,
  },

  // Advanced tactics (10)
  {
    id: '9cKgYrHb',
    category: 'Advanced tactics',
    title: 'Zugzwang',
    subtitle: 'Being forced to move',
    level: 'Advanced',
    totalExercises: 4,
  },
  {
    id: 'g1fxVZu9',
    category: 'Advanced tactics',
    title: 'Interference',
    subtitle: 'Interpose a piece to great effect',
    level: 'Advanced',
    totalExercises: 7,
  },
  {
    id: 's5pLU7Of',
    category: 'Advanced tactics',
    title: 'Greek Gift',
    subtitle: 'Study the greek gift sacrifice',
    level: 'Intermediate',
    totalExercises: 6,
  },
  {
    id: 'kdKpaYLW',
    category: 'Advanced tactics',
    title: 'Deflection',
    subtitle: 'Distracting a defender',
    level: 'Intermediate',
    totalExercises: 10,
  },
  {
    id: 'jOZejFWk',
    category: 'Advanced tactics',
    title: 'Attraction',
    subtitle: 'Lure a piece to a bad square',
    level: 'Intermediate',
    totalExercises: 10,
  },
  {
    id: '49fDW0wP',
    category: 'Advanced tactics',
    title: 'Underpromotion',
    subtitle: 'Promote - but not to a queen!',
    level: 'Advanced',
    totalExercises: 10,
  },
  {
    id: '0YcGiH4Y',
    category: 'Advanced tactics',
    title: 'Desperado',
    subtitle: 'A piece is lost, but it can still help',
    level: 'Advanced',
    totalExercises: 5,
  },
  {
    id: 'CgjKPvxQ',
    category: 'Advanced tactics',
    title: 'Counter Check',
    subtitle: 'Respond to a check with a check',
    level: 'Advanced',
    totalExercises: 5,
  },
  {
    id: 'udx042D6',
    category: 'Advanced tactics',
    title: 'Undermining',
    subtitle: 'Remove the defending piece',
    level: 'Intermediate',
    totalExercises: 5,
  },
  {
    id: 'Grmtwuft',
    category: 'Advanced tactics',
    title: 'Clearance',
    subtitle: 'Get out of the way!',
    level: 'Advanced',
    totalExercises: 5,
  },

  // Pawn Endgames (3)
  {
    id: 'xebrDvFe',
    category: 'Pawn Endgames',
    title: 'Key Squares',
    subtitle: 'Reach a key square',
    level: 'Intermediate',
    totalExercises: 11,
  },
  {
    id: 'A4ujYOer',
    category: 'Pawn Endgames',
    title: 'Opposition',
    subtitle: 'Take the opposition',
    level: 'Intermediate',
    totalExercises: 8,
  },
  {
    id: 'pt20yRkT',
    category: 'Pawn Endgames',
    title: '7th-Rank Rook Pawn',
    subtitle: 'Versus a Queen',
    level: 'Advanced',
    totalExercises: 17,
  },

  // Rook Endgames (4)
  {
    id: 'MkDViieT',
    category: 'Rook Endgames',
    title: '7th-Rank Rook Pawn',
    subtitle: 'And Passive Rook vs Rook',
    level: 'Advanced',
    totalExercises: 9,
  },
  {
    id: 'pqUSUw8Y',
    category: 'Rook Endgames',
    title: 'Basic Rook Endgames',
    subtitle: 'Lucena and Philidor',
    level: 'Intermediate',
    totalExercises: 10,
  },
  {
    id: 'heQDnvq7',
    category: 'Rook Endgames',
    title: 'Intermediate Rook Endings',
    subtitle: 'Broaden your knowledge',
    level: 'Intermediate',
    totalExercises: 15,
  },
  {
    id: 'wS23j5Tm',
    category: 'Rook Endgames',
    title: 'Practical Rook Endings',
    subtitle: 'Rook endings with several pawns',
    level: 'Advanced',
    totalExercises: 10,
  },
];

export const CURATED_STUDY_CARDS: StudySummaryCard[] = [
  {
    id: 'jtlLwUvh',
    name: 'Caro-Kann Defense Repertoire',
    author: 'LeninPerez',
    likes: 50521,
    ageLabel: '1 day ago',
    chapters: ['Introduction', 'Advance Variation', 'Exchange Variation', 'Panov Attack'],
    topic: 'Opening',
  },
  {
    id: 'Of3mcPk8',
    name: 'Classic Opening Traps',
    author: 'Toxenory',
    likes: 34200,
    ageLabel: '2 weeks ago',
    chapters: ['Fishing Pole Trap', 'Lasker Trap', 'Stafford Gambit', 'Legal Mate'],
    topic: 'Opening',
  },
  {
    id: '8c8bmUfy',
    name: 'Master Endgame Techniques',
    author: 'GrandmasterStudy',
    likes: 21400,
    ageLabel: '2 days ago',
    chapters: ['Opposition', 'Lucena Bridge', 'Philidor Position', 'Queen vs Pawn'],
    topic: 'Endgame',
  },
  {
    id: 'KjivNw7F',
    name: 'Italian Game Complete Guide',
    author: 'MasterPrep',
    likes: 18900,
    ageLabel: '2 weeks ago',
    chapters: ['Giuoco Piano', 'Evans Gambit', 'Two Knights', 'Fried Liver'],
    topic: 'Opening',
  },
];

/**
 * Strips any explicit upstream brand names or URLs so OpenChess displays clean, native copy.
 */
export function sanitizeStudyText(text: string): string {
  return text
    .replace(/https?:\/\/lichess\.org[^\s)\]]*/gi, '')
    .replace(/\bLichess\s+Practice:\s*/gi, '')
    .replace(/\bLichess\.org\b/gi, 'OpenChess')
    .replace(/\bLichess\b/gi, 'OpenChess')
    .replace(/\s+/g, ' ')
    .trim();
}

const COLOR_PREFIX_MAP: Record<string, 'green' | 'red' | 'yellow' | 'blue'> = {
  G: 'green',
  R: 'red',
  Y: 'yellow',
  B: 'blue',
};

/**
 * Extracts [%cal ...] arrows and [%csl ...] square highlights from a PGN comment block,
 * returning the cleaned human annotation text alongside visual shapes.
 */
export function extractPgnVisuals(rawComment: string): {
  text: string;
  arrows: StudyArrowAnnotation[];
  highlights: StudySquareHighlight[];
} {
  const arrows: StudyArrowAnnotation[] = [];
  const highlights: StudySquareHighlight[] = [];

  let cleaned = rawComment;
  cleaned = cleaned.replace(/\[%cal\s+([^\]]+)\]/g, (_full, body: string) => {
    for (const token of body.split(',')) {
      const t = token.trim();
      if (t.length >= 5) {
        const color = COLOR_PREFIX_MAP[t[0].toUpperCase()] ?? 'green';
        const from = t.slice(1, 3).toLowerCase();
        const to = t.slice(3, 5).toLowerCase();
        if (/^[a-h][1-8]$/.test(from) && /^[a-h][1-8]$/.test(to)) {
          arrows.push({ from, to, color });
        }
      }
    }
    return '';
  });

  cleaned = cleaned.replace(/\[%csl\s+([^\]]+)\]/g, (_full, body: string) => {
    for (const token of body.split(',')) {
      const t = token.trim();
      if (t.length >= 3) {
        const color = COLOR_PREFIX_MAP[t[0].toUpperCase()] ?? 'green';
        const square = t.slice(1, 3).toLowerCase();
        if (/^[a-h][1-8]$/.test(square)) {
          highlights.push({ square, color });
        }
      }
    }
    return '';
  });

  // Remove clock tags [%clk ...] or [%eval ...] cleanly for display
  cleaned = cleaned.replace(/\[%(?:clk|eval)\s+[^\]]+\]/g, '');

  return {
    text: sanitizeStudyText(cleaned),
    arrows,
    highlights,
  };
}

function parseHeaders(headerLines: string[]): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const m = line.match(/^\[(\w+)\s+"(.*)"\]$/);
    if (m) {
      headers[m[1]] = m[2];
    }
  }
  return headers;
}

function parseTerminationGoal(term: string): { goalCp: number | null; goalMoves: number | null } {
  const cpMatch = term.match(/([+-]?\d+)\s*cp(?:\s+in\s+(\d+))?/i);
  if (cpMatch) {
    return {
      goalCp: Number(cpMatch[1]),
      goalMoves: cpMatch[2] ? Number(cpMatch[2]) : null,
    };
  }
  const mateMatch = term.match(/mate\s+in\s+(\d+)/i);
  if (mateMatch) {
    return { goalCp: 10000, goalMoves: Number(mateMatch[1]) };
  }
  return { goalCp: null, goalMoves: null };
}

/**
 * Parses a multi-chapter PGN study export into structured chapters, moves, comments,
 * visual arrows ([%cal]), and highlights ([%csl]).
 */
export function parseStudyPgnChapters(rawPgn: string): StudyChapter[] {
  const normalized = rawPgn.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  // Split games at top-level [Event "..."] header boundaries
  const chunks = normalized.split(/\n(?=\[Event\s+")/).filter((c) => c.trim().length > 0);
  const chapters: StudyChapter[] = [];

  chunks.forEach((chunk, index) => {
    const lines = chunk.split('\n');
    const headerLines: string[] = [];
    const bodyLines: string[] = [];
    let inBody = false;

    for (const line of lines) {
      if (!inBody && line.trim().startsWith('[')) {
        headerLines.push(line.trim());
      } else {
        if (line.trim().length > 0) inBody = true;
        bodyLines.push(line);
      }
    }

    const headers = parseHeaders(headerLines);
    const startFen =
      headers.FEN && headers.FEN.trim().length > 0
        ? headers.FEN.trim()
        : new Chess().fen();

    let chess: Chess;
    try {
      chess = new Chess(startFen);
    } catch {
      chess = new Chess();
    }

    const bodyText = bodyLines.join(' ').trim();
    const moves: StudyMoveNode[] = [];
    let initialComment = '';
    let initialArrows: StudyArrowAnnotation[] = [];
    let initialHighlights: StudySquareHighlight[] = [];
    let pendingVariations: string[] = [];

    // Tokenize PGN movetext cleanly preserving top-level comments { ... } and variations ( ... )
    let i = 0;
    let seenFirstMove = false;
    while (i < bodyText.length) {
      const ch = bodyText[i];

      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Comment block { ... }
      if (ch === '{') {
        const end = bodyText.indexOf('}', i + 1);
        const rawComment = end >= 0 ? bodyText.slice(i + 1, end) : bodyText.slice(i + 1);
        i = end >= 0 ? end + 1 : bodyText.length;

        const vis = extractPgnVisuals(rawComment);
        if (!seenFirstMove) {
          initialComment = [initialComment, vis.text].filter(Boolean).join(' ').trim();
          initialArrows = [...initialArrows, ...vis.arrows];
          initialHighlights = [...initialHighlights, ...vis.highlights];
        } else if (moves.length > 0) {
          const last = moves[moves.length - 1];
          last.comment = [last.comment, vis.text].filter(Boolean).join(' ').trim();
          last.arrows.push(...vis.arrows);
          last.highlights.push(...vis.highlights);
        }
        continue;
      }

      // Variation block ( ... ) with nested parens
      if (ch === '(') {
        let depth = 1;
        let j = i + 1;
        let inBrace = false;
        while (j < bodyText.length && depth > 0) {
          const c = bodyText[j];
          if (c === '{') inBrace = true;
          else if (c === '}') inBrace = false;
          else if (!inBrace) {
            if (c === '(') depth++;
            else if (c === ')') depth--;
          }
          j++;
        }
        const varRaw = bodyText.slice(i + 1, j - 1).trim();
        const cleanedVar = sanitizeStudyText(
          varRaw.replace(/\{[^}]*\}/g, '').replace(/\$\d+/g, ''),
        );
        if (cleanedVar) {
          if (moves.length > 0) {
            moves[moves.length - 1].variationsText.push(cleanedVar);
          } else {
            pendingVariations.push(cleanedVar);
          }
        }
        i = j;
        continue;
      }

      // Read word token
      let end = i;
      while (end < bodyText.length && !/[\s{(]/.test(bodyText[end])) {
        end++;
      }
      const token = bodyText.slice(i, end).trim();
      i = end;

      if (!token) continue;
      // Skip move numbers (e.g. "1.", "12...", "...") and results / NAGs ($1, $19, !?)
      if (/^\d+\.+$/.test(token) || token === '...' || /^\$\d+$/.test(token)) {
        continue;
      }
      if (['*', '1-0', '0-1', '1/2-1/2'].includes(token)) {
        continue;
      }

      // Strip trailing annotation glyphs (!, ?, !!, ??, !?, ?!) for chess.js while preserving SAN display
      const cleanSan = token.replace(/[!?]+$/, '');
      try {
        const m = chess.move(cleanSan);
        if (m) {
          seenFirstMove = true;
          moves.push({
            ply: moves.length + 1,
            san: token,
            from: m.from,
            to: m.to,
            fen: chess.fen(),
            comment: '',
            variationsText: pendingVariations.length > 0 ? [...pendingVariations] : [],
            arrows: [],
            highlights: [],
          });
          pendingVariations = [];
        }
      } catch {
        // Skip unrecognized PGN tokens gracefully
      }
    }

    const studyName = sanitizeStudyText(
      headers.StudyName || headers.Event?.split(':')[0] || 'Chess Study',
    );
    const chapterName = sanitizeStudyText(
      headers.ChapterName || headers.Event || `Chapter ${index + 1}`,
    );
    const orientation: Color =
      headers.Orientation?.toLowerCase() === 'black' ? 'b' : 'w';
    const termination = sanitizeStudyText(headers.Termination || '');
    const { goalCp, goalMoves } = parseTerminationGoal(termination);

    chapters.push({
      index,
      name: chapterName,
      studyName,
      eco: headers.ECO && headers.ECO !== '?' ? headers.ECO : '',
      opening: sanitizeStudyText(headers.Opening && headers.Opening !== '?' ? headers.Opening : ''),
      initialFen: startFen,
      orientation,
      termination,
      goalCp,
      goalMoves,
      initialComment,
      initialArrows,
      initialHighlights,
      moves,
    });
  });

  return chapters;
}
