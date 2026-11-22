import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

export interface PieceSlideMotion {
  from: Square;
  to: Square;
  type: PieceSymbol;
  color: Color;
  isKnight: boolean;
  isCastlingRook: boolean;
}

export interface CapturedPieceGhost {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

export interface BoardTransitionResult {
  slides: PieceSlideMotion[];
  captured: CapturedPieceGhost | null;
}

function getPiecesMap(fen: string): Map<Square, { type: PieceSymbol; color: Color }> | null {
  try {
    const c = new Chess(fen);
    const board = c.board();
    const map = new Map<Square, { type: PieceSymbol; color: Color }>();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const cell = board[r][f];
        if (cell) {
          map.set(`${FILES[f]}${RANKS[r]}` as Square, {
            type: cell.type,
            color: cell.color,
          });
        }
      }
    }
    return map;
  } catch {
    return null;
  }
}

function squareDistSq(a: Square, b: Square): number {
  const df = FILES.indexOf(a[0] as (typeof FILES)[number]) - FILES.indexOf(b[0] as (typeof FILES)[number]);
  const dr = RANKS.indexOf(a[1] as (typeof RANKS)[number]) - RANKS.indexOf(b[1] as (typeof RANKS)[number]);
  return df * df + dr * dr;
}

/**
 * Computes exact piece slide animations and captured-piece ghosts between two FENs.
 * Works for forward moves, opponent/bot replies, castling (king + rook tandem slide),
 * en passant, promotions, AND stepping backward through Game Review history.
 */
export function computeBoardTransitions(
  prevFen: string,
  nextFen: string,
  lastMove?: { from: string; to: string } | null,
): BoardTransitionResult {
  if (!prevFen || !nextFen || prevFen === nextFen) {
    return { slides: [], captured: null };
  }

  const prevBoard = prevFen.split(' ')[0];
  const nextBoard = nextFen.split(' ')[0];
  if (prevBoard === nextBoard) {
    return { slides: [], captured: null };
  }

  const prevMap = getPiecesMap(prevFen);
  const nextMap = getPiecesMap(nextFen);
  if (!prevMap || !nextMap) {
    return { slides: [], captured: null };
  }

  const removed: { sq: Square; type: PieceSymbol; color: Color }[] = [];
  const added: { sq: Square; type: PieceSymbol; color: Color }[] = [];

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = `${FILES[f]}${RANKS[r]}` as Square;
      const p = prevMap.get(sq);
      const n = nextMap.get(sq);
      if (p && (!n || n.type !== p.type || n.color !== p.color)) {
        removed.push({ sq, type: p.type, color: p.color });
      }
      if (n && (!p || p.type !== n.type || p.color !== n.color)) {
        added.push({ sq, type: n.type, color: n.color });
      }
    }
  }

  // If too many squares changed (e.g., loading a brand new puzzle/game), don't animate
  if (removed.length === 0 || added.length === 0 || removed.length > 4 || added.length > 4) {
    return { slides: [], captured: null };
  }

  const slides: PieceSlideMotion[] = [];
  const usedRemoved = new Set<Square>();
  const usedAdded = new Set<Square>();

  // 1) If lastMove explicitly matches a removed -> added pair (including promotion!), prioritize it
  if (lastMove?.from && lastMove?.to) {
    const lmFrom = lastMove.from as Square;
    const lmTo = lastMove.to as Square;
    const rem = removed.find((r) => r.sq === lmFrom);
    const add = added.find((a) => a.sq === lmTo);
    if (rem && add && rem.color === add.color) {
      slides.push({
        from: rem.sq,
        to: add.sq,
        type: add.type,
        color: add.color,
        isKnight: add.type === 'n',
        isCastlingRook: false,
      });
      usedRemoved.add(rem.sq);
      usedAdded.add(add.sq);
    }
  }

  // 2) Match remaining identical-color + identical-type pieces (handles castling rook, reverse stepping, etc.)
  for (const add of added) {
    if (usedAdded.has(add.sq)) continue;
    const candidates = removed.filter(
      (r) => !usedRemoved.has(r.sq) && r.color === add.color && r.type === add.type,
    );
    if (candidates.length > 0) {
      candidates.sort((a, b) => squareDistSq(a.sq, add.sq) - squareDistSq(b.sq, add.sq));
      const best = candidates[0];
      const isCastlingRook =
        add.type === 'r' && slides.some((s) => s.type === 'k' && s.color === add.color);
      slides.push({
        from: best.sq,
        to: add.sq,
        type: add.type,
        color: add.color,
        isKnight: add.type === 'n',
        isCastlingRook,
      });
      usedRemoved.add(best.sq);
      usedAdded.add(add.sq);
    }
  }

  // 3) Promotion match when lastMove wasn't provided (pawn disappeared on rank 7/2, promoted piece appeared on rank 8/1)
  for (const add of added) {
    if (usedAdded.has(add.sq)) continue;
    const promoRank = add.color === 'w' ? '8' : '1';
    const prePromoRank = add.color === 'w' ? '7' : '2';
    if (add.sq[1] === promoRank) {
      const pawnCand = removed.find(
        (r) =>
          !usedRemoved.has(r.sq) &&
          r.color === add.color &&
          r.type === 'p' &&
          r.sq[1] === prePromoRank &&
          Math.abs(
            FILES.indexOf(r.sq[0] as (typeof FILES)[number]) -
              FILES.indexOf(add.sq[0] as (typeof FILES)[number]),
          ) <= 1,
      );
      if (pawnCand) {
        slides.push({
          from: pawnCand.sq,
          to: add.sq,
          type: add.type,
          color: add.color,
          isKnight: add.type === 'n',
          isCastlingRook: false,
        });
        usedRemoved.add(pawnCand.sq);
        usedAdded.add(add.sq);
      }
    }
  }

  // 4) Unpromotion when stepping backward in Review (Queen on rank 8 -> Pawn on rank 7)
  for (const add of added) {
    if (usedAdded.has(add.sq)) continue;
    const prePromoRank = add.color === 'w' ? '7' : '2';
    const promoRank = add.color === 'w' ? '8' : '1';
    if (add.type === 'p' && add.sq[1] === prePromoRank) {
      const promoCand = removed.find(
        (r) =>
          !usedRemoved.has(r.sq) &&
          r.color === add.color &&
          r.sq[1] === promoRank &&
          Math.abs(
            FILES.indexOf(r.sq[0] as (typeof FILES)[number]) -
              FILES.indexOf(add.sq[0] as (typeof FILES)[number]),
          ) <= 1,
      );
      if (promoCand) {
        slides.push({
          from: promoCand.sq,
          to: add.sq,
          type: add.type,
          color: add.color,
          isKnight: false,
          isCastlingRook: false,
        });
        usedRemoved.add(promoCand.sq);
        usedAdded.add(add.sq);
      }
    }
  }

  // 5) Detect captured piece ghost (an opponent piece removed that didn't slide anywhere)
  let captured: CapturedPieceGhost | null = null;
  if (slides.length > 0) {
    const moverColor = slides[0].color;
    const cap = removed.find((r) => !usedRemoved.has(r.sq) && r.color !== moverColor);
    if (cap) {
      captured = { square: cap.sq, type: cap.type, color: cap.color };
    }
  }

  return { slides, captured };
}

export interface PieceAnimationTiming {
  durationMs: number;
  easing: string;
  captureDelayMs: number;
  captureFadeMs: number;
  trailDurationMs: number;
}

/**
 * Chess.com Arcade / Natural (~185ms) & Fast (~115ms) GPU glide timing.
 */
export function getPieceAnimationTiming(
  speed: 'smooth' | 'fast' | 'none',
): PieceAnimationTiming {
  if (speed === 'none') {
    return {
      durationMs: 0,
      easing: 'linear',
      captureDelayMs: 0,
      captureFadeMs: 0,
      trailDurationMs: 0,
    };
  }
  if (speed === 'fast') {
    return {
      durationMs: 115,
      easing: 'cubic-bezier(0.22, 0.85, 0.32, 1)',
      captureDelayMs: 45,
      captureFadeMs: 70,
      trailDurationMs: 165,
    };
  }
  return {
    durationMs: 185,
    easing: 'cubic-bezier(0.22, 0.85, 0.32, 1)',
    captureDelayMs: 85,
    captureFadeMs: 95,
    trailDurationMs: 245,
  };
}

export interface MotionTrailPolygon {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  points: string;
  length: number;
}

/**
 * Computes a tapered white comet/motion streak quad in 800x800 SVG board coordinates
 * trailing behind a gliding piece (matches Chess.com Arcade motion streak).
 */
export function computeMotionTrailPolygon(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
): MotionTrailPolygon | null {
  const x1 = fromCol * 100 + 50;
  const y1 = fromRow * 100 + 50;
  const x2 = toCol * 100 + 50;
  const y2 = toRow * 100 + 50;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;

  // Unit perpendicular vector
  const px = -dy / length;
  const py = dx / length;

  // Narrow glowing tail at origin, wider piece-matched head at destination
  const tailHalfW = 11;
  const headHalfW = 34;

  const p1x = x1 + px * tailHalfW;
  const p1y = y1 + py * tailHalfW;
  const p2x = x2 + px * headHalfW;
  const p2y = y2 + py * headHalfW;
  const p3x = x2 - px * headHalfW;
  const p3y = y2 - py * headHalfW;
  const p4x = x1 - px * tailHalfW;
  const p4y = y1 - py * tailHalfW;

  const fmt = (n: number) => n.toFixed(1);
  return {
    x1,
    y1,
    x2,
    y2,
    length,
    points: `${fmt(p1x)},${fmt(p1y)} ${fmt(p2x)},${fmt(p2y)} ${fmt(p3x)},${fmt(p3y)} ${fmt(p4x)},${fmt(p4y)}`,
  };
}

/**
 * Computes smooth horizontal drag tilt in degrees (clamped to [-10, +10])
 * so dragged pieces lean naturally into pointer motion and settle back to 0°.
 */
export function computeDragTiltDeg(vxPx: number, prevTiltDeg: number): number {
  const target = Math.max(-10, Math.min(10, vxPx * 0.42));
  const next = prevTiltDeg + (target - prevTiltDeg) * 0.34;
  return Math.abs(next) < 0.08 && Math.abs(vxPx) < 0.2 ? 0 : Number(next.toFixed(2));
}

export interface StepSoundMoveLike {
  san?: string;
  from?: string;
  to?: string;
  captured?: unknown;
  flags?: string;
  promotion?: unknown;
}

export interface StepNavigationSound {
  capture: boolean;
  check: boolean;
  castle: boolean;
  promotion: boolean;
  toSquare?: string;
  direction: 'forward' | 'backward';
}

/**
 * Resolves exact piece sound options when stepping forward OR backward through move history.
 * Stepping backward always produces a crisp piece move sound; stepping forward plays the
 * landed move's exact sound (capture, check, castle, promotion, or standard move).
 */
export function getStepNavigationSound(
  moves: readonly StepSoundMoveLike[],
  fromPly: number,
  toPly: number,
): StepNavigationSound | null {
  if (fromPly === toPly) return null;

  if (toPly > fromPly) {
    const landed = moves[toPly - 1];
    if (!landed) {
      return {
        capture: false,
        check: false,
        castle: false,
        promotion: false,
        direction: 'forward',
      };
    }
    const san = landed.san ?? '';
    const flags = landed.flags ?? '';
    return {
      capture: Boolean(landed.captured) || flags.includes('e') || san.includes('x'),
      check: san.includes('+') || san.includes('#'),
      castle: flags.includes('k') || flags.includes('q') || san.startsWith('O-O'),
      promotion: Boolean(landed.promotion) || san.includes('='),
      toSquare: landed.to,
      direction: 'forward',
    };
  }

  // Stepping backward (including jumping to ply 0): always emit crisp piece return sound
  const undone = moves[fromPly - 1];
  return {
    capture: false,
    check: false,
    castle: false,
    promotion: false,
    toSquare: undone?.from ?? undone?.to,
    direction: 'backward',
  };
}

export interface OverlaySlideGeometry {
  leftPct: number;
  topPct: number;
  fromXPercent: number;
  fromYPercent: number;
  midXPercent: number;
  midYPercent: number;
}

/**
 * Computes exact CSS overlay placement and starting transform offsets for a
 * board-level floating piece glide. Because the overlay sits outside `<button>`
 * squares, pieces glide across the entire 8x8 board without browser paint clipping.
 */
export function computeOverlaySlideGeometry(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
): OverlaySlideGeometry | null {
  const dx = (fromCol - toCol) * 100;
  const dy = (fromRow - toRow) * 100;
  if (dx === 0 && dy === 0) return null;
  return {
    leftPct: toCol * 12.5,
    topPct: toRow * 12.5,
    fromXPercent: dx,
    fromYPercent: dy,
    midXPercent: Number((dx * 0.46).toFixed(2)),
    midYPercent: Number((dy * 0.46).toFixed(2)),
  };
}

/**
 * Returns pointer-aware pixel threshold before a press turns into a piece drag.
 * Touchscreens use an 8px threshold so normal finger taps never jitter into drag
 * mode while deliberate piece drags lift smoothly right away.
 */
export function getDragActivationThreshold(pointerType?: string): number {
  return pointerType === 'touch' ? 8 : 5;
}
