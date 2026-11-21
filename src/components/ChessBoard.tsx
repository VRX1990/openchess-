import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import type { MoveQuality } from '../chess/engine';
import {
  computePremoveTargets,
  projectBoardForPremove,
  type QueuedPremove,
} from '../chess/onlineHelpers';
import {
  BOARD_THEME_PALETTES,
  PREMOVE_COLOR_PALETTES,
  useChessTheme,
  type AnimationSpeed,
  type BoardTheme,
  type CoordinateStyle,
  type PieceTheme,
  type PremoveColorTheme,
} from '../chess/theme';
import { ChessPiece } from './ChessPiece';
import { MOVE_QUALITY_META, MoveBadge } from './MoveBadge';
import { computeBoardTransitions } from '../chess/boardMotion';

export type { BoardTheme };

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

function squareToVisual(sq: string, orientation: Color): { col: number; row: number } | null {
  if (!sq || sq.length < 2) return null;
  const f = FILES.indexOf(sq[0]);
  const r = RANKS.indexOf(sq[1]);
  if (f < 0 || r < 0) return null;
  return orientation === 'w'
    ? { col: f, row: r }
    : { col: 7 - f, row: 7 - r };
}

function visualToSquare(col: number, row: number, orientation: Color): Square | null {
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  const fileIdx = orientation === 'w' ? col : 7 - col;
  const rankIdx = orientation === 'w' ? row : 7 - row;
  return `${FILES[fileIdx]}${RANKS[rankIdx]}` as Square;
}

interface ChessBoardProps {
  fen: string;
  orientation?: Color;
  interactive?: boolean;
  allowedColor?: Color | 'both';
  lastMove?: { from: string; to: string } | null;
  lastMoveCapture?: boolean;
  hintSquares?: { from?: string; to?: string } | null;
  moveBadge?: { square: string; quality: MoveQuality } | null;
  bestMoveArrow?: { from: string; to: string } | null;
  premove?: { from: string; to: string; promotion?: PieceSymbol } | null;
  premoves?: QueuedPremove[];
  onPremove?: (from: string, to: string, promotion?: PieceSymbol) => void;
  onClearPremove?: () => void;
  highlightSquares?: { square: string; color: 'green' | 'red' | 'yellow' | 'blue' }[];
  extraArrows?: { from: string; to: string; color?: 'green' | 'red' | 'yellow' | 'blue' }[];
  hideCoordinates?: boolean;
  onSquareClick?: (sq: Square) => void;
  theme?: BoardTheme;
  pieceTheme?: PieceTheme;
  premoveColor?: PremoveColorTheme;
  animationSpeed?: AnimationSpeed;
  coordinateStyle?: CoordinateStyle;
  highlightMoves?: boolean;
  onMove: (from: string, to: string, promotion?: PieceSymbol) => boolean;
}

interface UserArrow {
  from: string;
  to: string;
}

interface DragState {
  from: Square;
  pieceType: PieceSymbol;
  pieceColor: Color;
  startX: number;
  startY: number;
  active: boolean;
  squareSize: number;
  hoverSquare: Square | null;
}

export function ChessBoard({
  fen,
  orientation = 'w',
  interactive = true,
  allowedColor = 'both',
  lastMove = null,
  lastMoveCapture = false,
  hintSquares = null,
  moveBadge = null,
  bestMoveArrow = null,
  premove = null,
  premoves,
  onPremove,
  onClearPremove,
  highlightSquares = [],
  extraArrows = [],
  hideCoordinates = false,
  onSquareClick,
  theme,
  pieceTheme,
  premoveColor,
  animationSpeed,
  coordinateStyle,
  highlightMoves,
  onMove,
}: ChessBoardProps) {
  const { prefs } = useChessTheme();
  const activeBoardTheme = theme ?? prefs.boardTheme;
  const activePieceTheme = pieceTheme ?? prefs.pieceTheme;
  const activePremoveColor = premoveColor ?? prefs.premoveColor;
  const activeAnimationSpeed = animationSpeed ?? prefs.animationSpeed;
  const activeCoordStyle: CoordinateStyle = hideCoordinates
    ? 'none'
    : (coordinateStyle ?? prefs.coordinateStyle);
  const showMoveHighlights = highlightMoves ?? prefs.highlightMoves;

  const effectivePremoves = useMemo<QueuedPremove[]>(() => {
    if (premoves && premoves.length > 0) return premoves;
    if (premove?.from && premove?.to) {
      return [
        {
          from: premove.from,
          to: premove.to,
          promotion:
            premove.promotion === 'q' ||
            premove.promotion === 'r' ||
            premove.promotion === 'b' ||
            premove.promotion === 'n'
              ? premove.promotion
              : undefined,
        },
      ];
    }
    return [];
  }, [premoves, premove]);

  const boardRef = useRef<HTMLDivElement | null>(null);
  const floatingDragRef = useRef<HTMLDivElement | null>(null);
  const dragLiveRef = useRef<{
    curX: number;
    curY: number;
    tiltDeg: number;
    squareSize: number;
    rafId: number | null;
  }>({ curX: 0, curY: 0, tiltDeg: 0, squareSize: 48, rafId: null });
  const suppressSlideRef = useRef<string | null>(null);
  const skipNextClickRef = useRef(false);

  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
    color: Color;
    isPremove?: boolean;
  } | null>(null);
  const [markedSquares, setMarkedSquares] = useState<string[]>([]);
  const [userArrows, setUserArrows] = useState<UserArrow[]>([]);
  const [rightDragFrom, setRightDragFrom] = useState<Square | null>(null);
  const prevFenRef = useRef<string>(fen);
  const animSeqRef = useRef<number>(0);
  const [activeTransition, setActiveTransition] = useState<{
    seq: number;
    slides: Map<string, { from: Square; to: Square; isKnight: boolean }>;
    captured: { square: Square; type: PieceSymbol; color: Color } | null;
  }>({ seq: 0, slides: new Map(), captured: null });

  useLayoutEffect(() => {
    const prevFen = prevFenRef.current;
    prevFenRef.current = fen;
    if (prevFen === fen || activeAnimationSpeed === 'none') {
      return;
    }

    const moveKey = lastMove?.from && lastMove?.to ? `${lastMove.from}-${lastMove.to}-${fen}` : null;
    if (moveKey && suppressSlideRef.current === moveKey) {
      suppressSlideRef.current = null;
      return;
    }

    const result = computeBoardTransitions(prevFen, fen, lastMove);
    if (result.slides.length === 0 && !result.captured) {
      return;
    }

    const seq = ++animSeqRef.current;
    const slidesMap = new Map<string, { from: Square; to: Square; isKnight: boolean }>();
    for (const s of result.slides) {
      slidesMap.set(s.to, { from: s.from, to: s.to, isKnight: s.isKnight });
    }
    setActiveTransition({
      seq,
      slides: slidesMap,
      captured: result.captured,
    });

    const clearMs = activeAnimationSpeed === 'fast' ? 145 : 215;
    const timer = window.setTimeout(() => {
      setActiveTransition((cur) => (cur.seq === seq ? { seq, slides: new Map(), captured: null } : cur));
    }, clearMs);
    return () => window.clearTimeout(timer);
  }, [fen, lastMove, activeAnimationSpeed]);

  useEffect(() => {
    return () => {
      if (dragLiveRef.current.rafId !== null) {
        window.cancelAnimationFrame(dragLiveRef.current.rafId);
      }
    };
  }, []);

  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);

  const board = chess.board();
  const inCheck = chess.inCheck();
  const activeTurn = chess.turn();
  const palette = BOARD_THEME_PALETTES[activeBoardTheme] ?? BOARD_THEME_PALETTES.green;
  const premovePalette = PREMOVE_COLOR_PALETTES[activePremoveColor] ?? PREMOVE_COLOR_PALETTES.crimson;
  const isPremoveMode =
    interactive &&
    allowedColor !== 'both' &&
    activeTurn !== allowedColor &&
    Boolean(onPremove);

  const premoveProjection = useMemo(
    () => projectBoardForPremove(fen, isPremoveMode || effectivePremoves.length > 0 ? effectivePremoves : []),
    [fen, effectivePremoves, isPremoveMode],
  );

  const premoveAllSquares = useMemo(() => {
    const origins = new Set<string>();
    const destinations = new Set<string>();
    for (const pm of effectivePremoves) {
      origins.add(pm.from);
      destinations.add(pm.to);
    }
    return { origins, destinations };
  }, [effectivePremoves]);

  const getInteractivePiece = (sq: Square): { type: PieceSymbol; color: Color } | null => {
    if (isPremoveMode) {
      const projected = premoveProjection.pieces.get(sq);
      return projected ? { type: projected.type, color: projected.color } : null;
    }
    const real = chess.get(sq);
    return real ? { type: real.type, color: real.color } : null;
  };

  useEffect(() => {
    if (!selectedSquare) return;
    if (!interactive) {
      setSelectedSquare(null);
      return;
    }
    const selPiece = isPremoveMode
      ? premoveProjection.pieces.get(selectedSquare)
      : chess.get(selectedSquare);
    if (!selPiece) {
      setSelectedSquare(null);
      return;
    }
    if (allowedColor !== 'both' && selPiece.color !== allowedColor) {
      setSelectedSquare(null);
    }
  }, [allowedColor, chess, interactive, isPremoveMode, premoveProjection.pieces, selectedSquare]);

  const activeSourceSquare = dragState?.active ? dragState.from : selectedSquare;

  const legalMovesFromSelected = useMemo(() => {
    if (!activeSourceSquare || !interactive) {
      return new Map<Square, { isCapture: boolean; isPromo: boolean }>();
    }
    if (isPremoveMode) {
      const piece = premoveProjection.pieces.get(activeSourceSquare);
      if (!piece || piece.color !== allowedColor) {
        return new Map<Square, { isCapture: boolean; isPromo: boolean }>();
      }
      const rawTargets = computePremoveTargets(
        piece.type,
        piece.color,
        activeSourceSquare,
        premoveProjection.occupied,
      );
      const map = new Map<Square, { isCapture: boolean; isPromo: boolean }>();
      for (const [k, v] of rawTargets.entries()) {
        map.set(k as Square, v);
      }
      return map;
    }
    const piece = chess.get(activeSourceSquare);
    if (!piece) {
      return new Map<Square, { isCapture: boolean; isPromo: boolean }>();
    }
    const moves = chess.moves({ square: activeSourceSquare, verbose: true });
    const map = new Map<Square, { isCapture: boolean; isPromo: boolean }>();
    for (const m of moves) {
      map.set(m.to, {
        isCapture: Boolean(m.captured) || m.flags.includes('e'),
        isPromo: Boolean(m.promotion),
      });
    }
    return map;
  }, [
    chess,
    activeSourceSquare,
    interactive,
    isPremoveMode,
    allowedColor,
    premoveProjection.pieces,
    premoveProjection.occupied,
  ]);

  const displayRanks = orientation === 'w' ? RANKS : [...RANKS].reverse();
  const displayFiles = orientation === 'w' ? FILES : [...FILES].reverse();

  const slideOffsets = useMemo(() => {
    const map = new Map<
      string,
      { dx: number; dy: number; tiltDeg: number; isKnight: boolean; seq: number }
    >();
    if (activeAnimationSpeed === 'none' || activeTransition.slides.size === 0) return map;

    for (const [toSq, s] of activeTransition.slides.entries()) {
      const fromVis = squareToVisual(s.from, orientation);
      const toVis = squareToVisual(s.to, orientation);
      if (!fromVis || !toVis) continue;
      const colDelta = toVis.col - fromVis.col;
      const rowDelta = toVis.row - fromVis.row;
      const tiltDeg =
        colDelta > 0
          ? Math.min(13, 6 + colDelta * 2.5)
          : colDelta < 0
            ? Math.max(-13, -6 + colDelta * 2.5)
            : rowDelta < 0
              ? 3
              : -3;
      map.set(toSq, {
        dx: (fromVis.col - toVis.col) * 100,
        dy: (fromVis.row - toVis.row) * 100,
        tiltDeg,
        isKnight: s.isKnight,
        seq: activeTransition.seq,
      });
    }
    return map;
  }, [activeTransition, orientation, activeAnimationSpeed]);

  const motionTrailPolygons = useMemo(() => {
    if (activeAnimationSpeed === 'none' || activeTransition.slides.size === 0) return [];
    const trails: Array<{
      id: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      points: string;
    }> = [];
    for (const [toSq, s] of activeTransition.slides.entries()) {
      const fromVis = squareToVisual(s.from, orientation);
      const toVis = squareToVisual(s.to, orientation);
      if (!fromVis || !toVis) continue;
      const x1 = fromVis.col * 100 + 50;
      const y1 = fromVis.row * 100 + 50;
      const x2 = toVis.col * 100 + 50;
      const y2 = toVis.row * 100 + 50;
      const vx = x2 - x1;
      const vy = y2 - y1;
      const len = Math.hypot(vx, vy);
      if (len < 12) continue;
      const nx = -vy / len;
      const ny = vx / len;
      // Tapered luminous comet ribbon from origin square to landing square
      const startHalfW = 14;
      const endHalfW = Math.min(40, 28 + len * 0.035);
      const p1x = x1 + nx * startHalfW;
      const p1y = y1 + ny * startHalfW;
      const p2x = x1 - nx * startHalfW;
      const p2y = y1 - ny * startHalfW;
      const p3x = x2 - nx * endHalfW;
      const p3y = y2 - ny * endHalfW;
      const p4x = x2 + nx * endHalfW;
      const p4y = y2 + ny * endHalfW;
      trails.push({
        id: `trail-${activeTransition.seq}-${toSq}`,
        x1,
        y1,
        x2,
        y2,
        points: `${p1x.toFixed(1)},${p1y.toFixed(1)} ${p2x.toFixed(1)},${p2y.toFixed(1)} ${p3x.toFixed(1)},${p3y.toFixed(1)} ${p4x.toFixed(1)},${p4y.toFixed(1)}`,
      });
    }
    return trails;
  }, [activeTransition, orientation, activeAnimationSpeed]);

  const buildArrowSegment = (fromSq: string, toSq: string) => {
    if (!fromSq || !toSq || fromSq === toSq) return null;
    const fromVis = squareToVisual(fromSq, orientation);
    const toVis = squareToVisual(toSq, orientation);
    if (!fromVis || !toVis) return null;

    const x1 = fromVis.col * 100 + 50;
    const y1 = fromVis.row * 100 + 50;
    const x2Raw = toVis.col * 100 + 50;
    const y2Raw = toVis.row * 100 + 50;

    const dx = x2Raw - x1;
    const dy = y2Raw - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return null;

    const trimEnd = 18;
    const trimStart = 12;
    return {
      x1: x1 + (dx / len) * trimStart,
      y1: y1 + (dy / len) * trimStart,
      x2: x2Raw - (dx / len) * trimEnd,
      y2: y2Raw - (dy / len) * trimEnd,
    };
  };

  const arrowCoords = useMemo(() => {
    if (!bestMoveArrow?.from || !bestMoveArrow?.to) return null;
    return buildArrowSegment(bestMoveArrow.from, bestMoveArrow.to);
  }, [bestMoveArrow, orientation]);

  const premoveArrowSegments = useMemo(
    () =>
      effectivePremoves
        .map((pm, idx) => ({
          ...pm,
          idx,
          seg: buildArrowSegment(pm.from, pm.to),
        }))
        .filter(
          (
            item,
          ): item is QueuedPremove & {
            idx: number;
            seg: NonNullable<ReturnType<typeof buildArrowSegment>>;
          } => Boolean(item.seg),
        ),
    [effectivePremoves, orientation],
  );

  const extraArrowSegments = useMemo(
    () =>
      extraArrows
        .map((a) => ({
          ...a,
          color: a.color ?? 'green',
          seg: buildArrowSegment(a.from, a.to),
        }))
        .filter(
          (item): item is {
            from: string;
            to: string;
            color: 'green' | 'red' | 'yellow' | 'blue';
            seg: NonNullable<ReturnType<typeof buildArrowSegment>>;
          } => Boolean(item.seg),
        ),
    [extraArrows, orientation],
  );

  const userArrowSegments = useMemo(
    () =>
      userArrows
        .map((a) => ({ ...a, seg: buildArrowSegment(a.from, a.to) }))
        .filter(
          (item): item is UserArrow & { seg: NonNullable<ReturnType<typeof buildArrowSegment>> } =>
            Boolean(item.seg),
        ),
    [userArrows, orientation],
  );

  const attemptMove = (from: Square, to: Square, viaDrag = false) => {
    if (isPremoveMode && onPremove) {
      const piece = premoveProjection.pieces.get(from);
      if (!piece || piece.color !== allowedColor) return false;
      const premoveTargets = computePremoveTargets(
        piece.type,
        piece.color,
        from,
        premoveProjection.occupied,
      );
      const targetMeta = premoveTargets.get(to);
      if (!targetMeta) return false;
      if (targetMeta.isPromo) {
        setPendingPromotion({ from, to, color: piece.color, isPremove: true });
        setSelectedSquare(null);
        return true;
      }
      onPremove(from, to);
      setSelectedSquare(null);
      setMarkedSquares([]);
      setUserArrows([]);
      return true;
    }

    const piece = chess.get(from);
    if (!piece) return false;

    const moves = chess.moves({ square: from, verbose: true });
    const matching = moves.filter((m) => m.to === to);
    if (matching.length === 0) return false;

    const needsPromotion = matching.some((m) => Boolean(m.promotion));
    if (needsPromotion) {
      setPendingPromotion({ from, to, color: piece.color, isPremove: false });
      setSelectedSquare(null);
      return true;
    }

    if (viaDrag) {
      const probe = new Chess(fen);
      try {
        probe.move({ from, to });
        suppressSlideRef.current = `${from}-${to}-${probe.fen()}`;
      } catch {
        suppressSlideRef.current = null;
      }
    } else {
      suppressSlideRef.current = null;
    }

    const ok = onMove(from, to);
    setSelectedSquare(null);
    setMarkedSquares([]);
    setUserArrows([]);
    return ok;
  };

  const handleSquareClick = (sq: Square) => {
    if (skipNextClickRef.current) {
      skipNextClickRef.current = false;
      return;
    }
    if (onSquareClick) {
      onSquareClick(sq);
      return;
    }
    if (markedSquares.length > 0 || userArrows.length > 0) {
      setMarkedSquares([]);
      setUserArrows([]);
    }
    if (!interactive || pendingPromotion) return;

    const piece = getInteractivePiece(sq);
    const canControlTurn = allowedColor === 'both' || allowedColor === activeTurn;
    const canControlPiece =
      piece &&
      ((!isPremoveMode && piece.color === activeTurn && canControlTurn) ||
        (isPremoveMode && piece.color === allowedColor));

    if (selectedSquare && legalMovesFromSelected.has(sq)) {
      attemptMove(selectedSquare, sq, false);
      return;
    }

    if (canControlPiece) {
      if (selectedSquare === sq) {
        setSelectedSquare(null);
      } else {
        setSelectedSquare(sq);
      }
      return;
    }

    if (effectivePremoves.length > 0 && onClearPremove) {
      onClearPremove();
    }
    setSelectedSquare(null);
  };

  const getSquareFromPoint = (clientX: number, clientY: number): Square | null => {
    const el = boardRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) return null;
    const col = Math.min(7, Math.max(0, Math.floor((relX / rect.width) * 8)));
    const row = Math.min(7, Math.max(0, Math.floor((relY / rect.height) * 8)));
    return visualToSquare(col, row, orientation);
  };

  const handlePointerDownSquare = (sq: Square, e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button === 2) {
      e.preventDefault();
      if (effectivePremoves.length > 0 && onClearPremove) {
        onClearPremove();
        setSelectedSquare(null);
        return;
      }
      setRightDragFrom(sq);
      return;
    }
    if (e.button !== 0 || !interactive || pendingPromotion) return;

    const piece = getInteractivePiece(sq);
    const canControlTurn = allowedColor === 'both' || allowedColor === activeTurn;
    const canDragPiece =
      piece &&
      ((!isPremoveMode && piece.color === activeTurn && canControlTurn) ||
        (isPremoveMode && piece.color === allowedColor));
    if (!canDragPiece || !piece) return;

    const rect = boardRef.current?.getBoundingClientRect();
    const squareSize = rect ? rect.width / 8 : 48;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // fallback if pointer capture unsupported
    }

    dragLiveRef.current.curX = e.clientX;
    dragLiveRef.current.curY = e.clientY;
    dragLiveRef.current.tiltDeg = 0;
    dragLiveRef.current.squareSize = squareSize;

    setDragState({
      from: sq,
      pieceType: piece.type,
      pieceColor: piece.color,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      squareSize,
      hoverSquare: sq,
    });
  };

  const syncFloatingDragTransform = () => {
    const el = floatingDragRef.current;
    if (!el) return;
    const live = dragLiveRef.current;
    const piecePx = live.squareSize * 1.56;
    const tx = live.curX - piecePx / 2;
    const ty = live.curY - piecePx / 2 - live.squareSize * 0.32;
    el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) rotate(${live.tiltDeg.toFixed(1)}deg)`;
  };

  const handlePointerMoveSquare = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState) return;
    const live = dragLiveRef.current;
    const deltaX = e.clientX - live.curX;
    const targetTilt = Math.max(-15, Math.min(15, deltaX * 1.05));
    const smoothedTilt = live.tiltDeg * 0.62 + targetTilt * 0.38;
    live.curX = e.clientX;
    live.curY = e.clientY;
    live.tiltDeg = Math.abs(smoothedTilt) < 0.2 ? 0 : smoothedTilt;

    if (live.rafId === null) {
      live.rafId = window.requestAnimationFrame(() => {
        dragLiveRef.current.rafId = null;
        syncFloatingDragTransform();
      });
    }

    const dist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
    const nextActive = dragState.active || dist > 5;
    const hover = getSquareFromPoint(e.clientX, e.clientY);

    // Only trigger React state update when drag activates or hovered square actually changes
    if (nextActive !== dragState.active || hover !== dragState.hoverSquare) {
      setDragState((prev) => {
        if (!prev) return null;
        if (prev.active === nextActive && prev.hoverSquare === hover) return prev;
        return {
          ...prev,
          active: nextActive,
          hoverSquare: hover,
        };
      });
    }
  };

  const handlePointerUpSquare = (sq: Square, e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button === 2 && rightDragFrom) {
      e.preventDefault();
      const fromSq = rightDragFrom;
      setRightDragFrom(null);

      if (fromSq === sq) {
        setMarkedSquares((prev) =>
          prev.includes(sq) ? prev.filter((item) => item !== sq) : [...prev, sq],
        );
        return;
      }

      setUserArrows((prev) => {
        const exists = prev.some((a) => a.from === fromSq && a.to === sq);
        return exists
          ? prev.filter((a) => !(a.from === fromSq && a.to === sq))
          : [...prev, { from: fromSq, to: sq }];
      });
      return;
    }

    if (!dragState) return;
    if (dragLiveRef.current.rafId !== null) {
      window.cancelAnimationFrame(dragLiveRef.current.rafId);
      dragLiveRef.current.rafId = null;
    }
    const currentDrag = dragState;
    setDragState(null);

    if (currentDrag.active) {
      skipNextClickRef.current = true;
      window.setTimeout(() => {
        skipNextClickRef.current = false;
      }, 0);
      const dropSquare = getSquareFromPoint(e.clientX, e.clientY);
      if (dropSquare && dropSquare !== currentDrag.from) {
        attemptMove(currentDrag.from, dropSquare, true);
      } else {
        setSelectedSquare(currentDrag.from);
      }
    }
  };

  const badgeMeta = moveBadge ? MOVE_QUALITY_META[moveBadge.quality] : null;
  const animCssVars = {
    '--piece-anim-ms':
      activeAnimationSpeed === 'none'
        ? '0ms'
        : activeAnimationSpeed === 'fast'
          ? '95ms'
          : '145ms',
    '--knight-anim-ms':
      activeAnimationSpeed === 'none'
        ? '0ms'
        : activeAnimationSpeed === 'fast'
          ? '115ms'
          : '165ms',
    '--trail-anim-ms':
      activeAnimationSpeed === 'none'
        ? '0ms'
        : activeAnimationSpeed === 'fast'
          ? '135ms'
          : '195ms',
  } as CSSProperties;

  const isOutsideCoords = activeCoordStyle === 'outside';

  const boardCore = (
    <div
      ref={boardRef}
      style={animCssVars}
      className="relative w-full aspect-square select-none touch-none"
      data-testid="chess-board"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="relative w-full h-full rounded-none sm:rounded-[3px] overflow-hidden shadow-[0_6px_22px_rgba(0,0,0,0.38)]">
        <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
          {displayRanks.map((rank, rVisIdx) =>
            displayFiles.map((file, cVisIdx) => {
              const sq = `${file}${rank}` as Square;
              const fileIdx = FILES.indexOf(file);
              const rankIdx = RANKS.indexOf(rank);
              const isLight = (fileIdx + rankIdx) % 2 === 0;
              const piece = board[rankIdx][fileIdx];

              const isSelected = selectedSquare === sq || dragState?.from === sq;
              const isDragHover =
                dragState?.active &&
                dragState.hoverSquare === sq &&
                legalMovesFromSelected.has(sq);
              const isLastMove = showMoveHighlights && (lastMove?.from === sq || lastMove?.to === sq);
              const isPremoveOrigin = premoveAllSquares.origins.has(sq);
              const isPremoveDest = premoveAllSquares.destinations.has(sq);
              const isPremoveSq = isPremoveOrigin || isPremoveDest;
              const ghostPremovePiece = isPremoveMode
                ? premoveProjection.ghostDestinations.get(sq)
                : undefined;
              const isVacatedByPremove =
                isPremoveMode &&
                premoveProjection.vacatedOrigins.has(sq) &&
                !ghostPremovePiece;

              const isMarked = markedSquares.includes(sq);
              const isKingInCheck =
                inCheck && piece?.type === 'k' && piece.color === activeTurn;
              const isHint = hintSquares?.from === sq || hintSquares?.to === sq;
              const targetInfo = legalMovesFromSelected.get(sq);
              const slide = slideOffsets.get(sq);
              const isMovingPiece = Boolean(slide && piece);
              const isBeingDragged = Boolean(dragState?.active && dragState.from === sq);
              const showBadge = Boolean(moveBadge && moveBadge.square === sq);

              const bg =
                isSelected || isLastMove
                  ? isLight
                    ? palette.lightHighlight
                    : palette.darkHighlight
                  : isLight
                    ? palette.light
                    : palette.dark;

              const coordColor = isLight ? palette.dark : palette.light;
              const pieceLabel = piece
                ? `${piece.color === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[piece.type]}`
                : 'empty square';

              const slideStyle = slide
                ? ({
                    '--from-x': `${slide.dx}%`,
                    '--from-y': `${slide.dy}%`,
                    '--slide-tilt': `${slide.tiltDeg.toFixed(1)}deg`,
                  } as CSSProperties)
                : undefined;

              const customHighlight = highlightSquares.find((h) => h.square === sq);
              const customHighlightBg =
                customHighlight?.color === 'green'
                  ? 'bg-[#81B64C]/55'
                  : customHighlight?.color === 'red'
                    ? 'bg-[#FA412D]/55'
                    : customHighlight?.color === 'yellow'
                      ? 'bg-[#F7C045]/55'
                      : customHighlight?.color === 'blue'
                        ? 'bg-[#4EA1DE]/55'
                        : '';

              return (
                <button
                  key={sq}
                  type="button"
                  data-square={sq}
                  data-premove={isPremoveSq ? 'true' : undefined}
                  aria-label={`${sq} ${pieceLabel}`}
                  onClick={() => handleSquareClick(sq)}
                  onPointerDown={(e) => handlePointerDownSquare(sq, e)}
                  onPointerMove={handlePointerMoveSquare}
                  onPointerUp={(e) => handlePointerUpSquare(sq, e)}
                  onPointerCancel={() => setDragState(null)}
                  style={{ backgroundColor: bg }}
                  className={`relative flex items-center justify-center p-0 border-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#81B64C] transition-colors duration-75 ${
                    isMovingPiece ? 'z-30' : showBadge ? 'z-20' : 'z-0'
                  } ${interactive || onSquareClick ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  {/* Queued Premove Highlight */}
                  {isPremoveSq && (
                    <span
                      className="absolute inset-0 pointer-events-none z-5"
                      style={{
                        backgroundColor: isLight
                          ? premovePalette.lightSq
                          : premovePalette.darkSq,
                        boxShadow: isPremoveDest
                          ? `inset 0 0 0 2px ${premovePalette.ring}`
                          : undefined,
                      }}
                    />
                  )}

                  {/* Visual Analysis Destination Square Tint when MoveBadge is active */}
                  {showBadge && badgeMeta && (
                    <span
                      className="absolute inset-0 pointer-events-none z-5 transition-opacity duration-200"
                      style={{
                        boxShadow: `inset 0 0 0 2.5px ${badgeMeta.bg}88`,
                        backgroundColor: `${badgeMeta.bg}22`,
                      }}
                    />
                  )}

                  {/* Pure circular target halo handles drag hover targeting cleanly */}

                  {/* Custom study/coordinate square highlight */}
                  {customHighlight && (
                    <span className={`absolute inset-0 ${customHighlightBg} pointer-events-none z-5`} />
                  )}

                  {/* Right-click tactical highlight */}
                  {isMarked && (
                    <span className="absolute inset-0 bg-[#EB6150]/55 pointer-events-none z-5" />
                  )}

                  {/* Check solid coral-crimson square highlight */}
                  {isKingInCheck && (
                    <span
                      className="absolute inset-0 pointer-events-none z-5"
                      style={{
                        backgroundColor: 'rgba(229, 75, 62, 0.88)',
                      }}
                    />
                  )}

                  {/* Coach hint ring */}
                  {isHint && (
                    <span className="absolute inset-1 rounded-sm border-[3px] border-[#E59A28] pointer-events-none z-10" />
                  )}

                  {/* Inside Coordinates */}
                  {activeCoordStyle === 'inside' && cVisIdx === 0 && (
                    <span
                      style={{ color: coordColor }}
                      className="absolute top-[3px] left-[4px] text-[10px] sm:text-[12px] font-sans font-bold leading-none pointer-events-none select-none z-25"
                    >
                      {rank}
                    </span>
                  )}
                  {activeCoordStyle === 'inside' && rVisIdx === 7 && (
                    <span
                      style={{ color: coordColor }}
                      className="absolute bottom-[2px] right-[4px] text-[10px] sm:text-[12px] font-sans font-bold leading-none pointer-events-none select-none z-25"
                    >
                      {file}
                    </span>
                  )}

                  {/* Legal / Premove move indicator (exact Chess.com 14% translucent dot / capture ring) */}
                  {targetInfo && !targetInfo.isCapture && (
                    <span
                      className="animate-dot-pop w-[33%] h-[33%] rounded-full pointer-events-none z-10"
                      style={{
                        backgroundColor: isPremoveMode
                          ? premovePalette.dot
                          : 'rgba(0, 0, 0, 0.14)',
                      }}
                    />
                  )}
                  {targetInfo && targetInfo.isCapture && (
                    <span
                      className="animate-dot-pop absolute inset-[3.5%] rounded-full border-[6px] pointer-events-none z-10"
                      style={{
                        borderColor: isPremoveMode
                          ? premovePalette.dot
                          : 'rgba(0, 0, 0, 0.14)',
                      }}
                    />
                  )}

                  {/* Subtle fading captured piece beneath the landing piece */}
                  {activeTransition.captured && activeTransition.captured.square === sq && (
                    <div
                      key={`ghost-${activeTransition.seq}-${activeTransition.captured.square}`}
                      className="animate-captured-fade absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                    >
                      <div className="w-[93%] h-[93%]">
                        <ChessPiece
                          type={activeTransition.captured.type}
                          color={activeTransition.captured.color}
                          pieceTheme={activePieceTheme}
                        />
                      </div>
                    </div>
                  )}

                  {/* Origin square stays clean yellow while piece is lifted in Arcade drag */}

                  {/* Real Piece with smooth square-to-square glide / knight parabolic hop */}
                  {piece && !isBeingDragged && !ghostPremovePiece && (
                    <div
                      key={
                        isMovingPiece && slide
                          ? `${sq}-move-${slide.seq}`
                          : `${sq}-${piece.color}-${piece.type}`
                      }
                      style={slideStyle}
                      className={`w-full h-full flex items-center justify-center z-20 ${
                        isVacatedByPremove ? 'opacity-35 scale-90 transition-all duration-100' : ''
                      } ${
                        isMovingPiece
                          ? slide?.isKnight || piece.type === 'n'
                            ? 'animate-knight-hop'
                            : 'animate-piece-slide'
                          : ''
                      }`}
                    >
                      <div
                        className={`w-[93%] h-[93%] transition-transform duration-100 ${
                          isSelected ? 'scale-[1.03]' : ''
                        }`}
                      >
                        <ChessPiece
                          type={piece.type}
                          color={piece.color}
                          pieceTheme={activePieceTheme}
                        />
                      </div>
                    </div>
                  )}

                  {/* Ghost Premove Destination Preview Piece + Queue Order Badge */}
                  {ghostPremovePiece && !isBeingDragged && (
                    <div className="relative w-full h-full flex items-center justify-center z-25 pointer-events-none">
                      <div className="w-[80%] h-[80%] opacity-65 scale-95 drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
                        <ChessPiece
                          type={ghostPremovePiece.type}
                          color={ghostPremovePiece.color}
                          pieceTheme={activePieceTheme}
                        />
                      </div>
                      {effectivePremoves.length > 1 && (
                        <span
                          style={{ backgroundColor: premovePalette.badgeBg }}
                          className="absolute top-[4%] left-[4%] min-w-[16px] h-[16px] px-1 rounded-full text-[9px] sm:text-[10px] font-mono font-extrabold text-white flex items-center justify-center shadow ring-1 ring-black/40"
                        >
                          {ghostPremovePiece.order}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Frameless Move Classification Logo (!!, !, ★, ✓, 📖, ?!, ?, ??) */}
                  {showBadge && moveBadge && (
                    <MoveBadge
                      key={`${sq}-${moveBadge.quality}`}
                      quality={moveBadge.quality}
                      size="board"
                      className="animate-badge-pop absolute top-[2.5%] right-[2.5%] z-40 pointer-events-none"
                    />
                  )}
                </button>
              );
            }),
          )}
        </div>

        {/* Luminous White Comet Motion Trail Overlay (beneath sliding pieces) */}
        {motionTrailPolygons.length > 0 && (
          <svg
            key={`trails-${activeTransition.seq}`}
            viewBox="0 0 800 800"
            className="animate-move-trail absolute inset-0 w-full h-full pointer-events-none z-20"
            aria-hidden="true"
          >
            <defs>
              {motionTrailPolygons.map((t) => (
                <linearGradient
                  key={`grad-${t.id}`}
                  id={`grad-${t.id}`}
                  gradientUnits="userSpaceOnUse"
                  x1={t.x1}
                  y1={t.y1}
                  x2={t.x2}
                  y2={t.y2}
                >
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
                  <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.34" />
                  <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.68" />
                </linearGradient>
              ))}
            </defs>
            {motionTrailPolygons.map((t) => (
              <polygon key={t.id} points={t.points} fill={`url(#grad-${t.id})`} />
            ))}
          </svg>
        )}

        {/* Large Soft Circular Target Halo Centered Under Hovered Drag Square */}
        {dragState?.active && dragState.hoverSquare && (() => {
          const vis = squareToVisual(dragState.hoverSquare, orientation);
          if (!vis) return null;
          return (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute z-25 rounded-full"
              style={{
                width: '28%',
                height: '28%',
                left: `${(vis.col + 0.5) * 12.5}%`,
                top: `${(vis.row + 0.5) * 12.5}%`,
                transform: 'translate(-50%, -50%)',
                background:
                  'radial-gradient(circle, rgba(0,0,0,0.24) 0%, rgba(0,0,0,0.18) 68%, rgba(0,0,0,0) 72%)',
              }}
            />
          );
        })()}

        {/* Floating Lifted & Dynamically Tilted Dragged Piece (GPU translate3d, zero per-pixel React re-render) */}
        {dragState?.active && boardRef.current && (() => {
          const piecePx = dragState.squareSize * 1.56;
          const live = dragLiveRef.current;
          const initX = live.curX - piecePx / 2;
          const initY = live.curY - piecePx / 2 - dragState.squareSize * 0.32;
          return (
            <div
              ref={floatingDragRef}
              aria-hidden="true"
              className="pointer-events-none fixed left-0 top-0 z-50 will-change-transform"
              style={{
                width: piecePx,
                height: piecePx,
                transform: `translate3d(${initX.toFixed(1)}px, ${initY.toFixed(1)}px, 0) rotate(${live.tiltDeg.toFixed(1)}deg)`,
                transformOrigin: '50% 65%',
                filter: 'drop-shadow(0 12px 14px rgba(0,0,0,0.42))',
              }}
            >
              <ChessPiece
                type={dragState.pieceType}
                color={dragState.pieceColor}
                pieceTheme={activePieceTheme}
              />
            </div>
          );
        })()}

        {/* Best Move / Multi-Premove / Study / User Calculation SVG Arrow Overlay */}
        {(arrowCoords ||
          premoveArrowSegments.length > 0 ||
          userArrowSegments.length > 0 ||
          extraArrowSegments.length > 0) && (
          <svg
            viewBox="0 0 800 800"
            className="absolute inset-0 w-full h-full pointer-events-none z-35"
            aria-hidden="true"
          >
            <defs>
              <marker
                id="openchess-best-arrowhead"
                markerWidth="4.2"
                markerHeight="4.2"
                refX="2.4"
                refY="2.1"
                orient="auto"
              >
                <polygon points="0 0, 4.2 2.1, 0 4.2" fill="rgba(129, 182, 76, 0.88)" />
              </marker>
              <marker
                id="openchess-user-arrowhead"
                markerWidth="4.2"
                markerHeight="4.2"
                refX="2.4"
                refY="2.1"
                orient="auto"
              >
                <polygon points="0 0, 4.2 2.1, 0 4.2" fill="rgba(245, 166, 35, 0.88)" />
              </marker>
              <marker
                id="openchess-red-arrowhead"
                markerWidth="4.2"
                markerHeight="4.2"
                refX="2.4"
                refY="2.1"
                orient="auto"
              >
                <polygon points="0 0, 4.2 2.1, 0 4.2" fill="rgba(250, 65, 45, 0.88)" />
              </marker>
              <marker
                id="openchess-blue-arrowhead"
                markerWidth="4.2"
                markerHeight="4.2"
                refX="2.4"
                refY="2.1"
                orient="auto"
              >
                <polygon points="0 0, 4.2 2.1, 0 4.2" fill="rgba(78, 161, 222, 0.88)" />
              </marker>
              <marker
                id="openchess-premove-arrowhead"
                markerWidth="4.2"
                markerHeight="4.2"
                refX="2.4"
                refY="2.1"
                orient="auto"
              >
                <polygon points="0 0, 4.2 2.1, 0 4.2" fill={premovePalette.arrow} />
              </marker>
            </defs>
            {extraArrowSegments.map((ea, idx) => {
              const stroke =
                ea.color === 'red'
                  ? 'rgba(250, 65, 45, 0.84)'
                  : ea.color === 'yellow'
                    ? 'rgba(245, 166, 35, 0.86)'
                    : ea.color === 'blue'
                      ? 'rgba(78, 161, 222, 0.86)'
                      : 'rgba(129, 182, 76, 0.86)';
              const markerId =
                ea.color === 'red'
                  ? 'url(#openchess-red-arrowhead)'
                  : ea.color === 'yellow'
                    ? 'url(#openchess-user-arrowhead)'
                    : ea.color === 'blue'
                      ? 'url(#openchess-blue-arrowhead)'
                      : 'url(#openchess-best-arrowhead)';
              return (
                <line
                  key={`${ea.from}-${ea.to}-${idx}`}
                  x1={ea.seg.x1}
                  y1={ea.seg.y1}
                  x2={ea.seg.x2}
                  y2={ea.seg.y2}
                  stroke={stroke}
                  strokeWidth="16"
                  strokeLinecap="round"
                  markerEnd={markerId}
                />
              );
            })}
            {userArrowSegments.map((u) => (
              <line
                key={`${u.from}-${u.to}`}
                x1={u.seg.x1}
                y1={u.seg.y1}
                x2={u.seg.x2}
                y2={u.seg.y2}
                stroke="rgba(245, 166, 35, 0.84)"
                strokeWidth="16"
                strokeLinecap="round"
                markerEnd="url(#openchess-user-arrowhead)"
              />
            ))}
            {premoveArrowSegments.map((pm) => (
              <g key={`pm-arrow-${pm.idx}-${pm.from}-${pm.to}`}>
                <line
                  x1={pm.seg.x1}
                  y1={pm.seg.y1}
                  x2={pm.seg.x2}
                  y2={pm.seg.y2}
                  stroke={premovePalette.ring}
                  strokeOpacity="0.28"
                  strokeWidth="24"
                  strokeLinecap="round"
                />
                <line
                  x1={pm.seg.x1}
                  y1={pm.seg.y1}
                  x2={pm.seg.x2}
                  y2={pm.seg.y2}
                  stroke={premovePalette.arrow}
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray="24 12"
                  markerEnd="url(#openchess-premove-arrowhead)"
                />
              </g>
            ))}
            {arrowCoords && (
              <line
                x1={arrowCoords.x1}
                y1={arrowCoords.y1}
                x2={arrowCoords.x2}
                y2={arrowCoords.y2}
                stroke="rgba(129, 182, 76, 0.86)"
                strokeWidth="18"
                strokeLinecap="round"
                markerEnd="url(#openchess-best-arrowhead)"
              />
            )}
          </svg>
        )}

        {/* Promotion Modal */}
        {pendingPromotion && (
          <div
            className="animate-fade-in absolute inset-0 z-40 bg-black/55 flex items-center justify-center p-4"
            role="dialog"
            aria-label="Choose promotion piece"
          >
            <div className="animate-modal-pop bg-[#262421] border border-white/15 rounded-lg p-3 shadow-2xl">
              <p className="text-xs font-medium text-[#C8C4BC] mb-2 text-center">
                Promote pawn
              </p>
              <div className="grid grid-cols-4 gap-2">
                {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map((promo) => (
                  <button
                    key={promo}
                    type="button"
                    aria-label={`Promote to ${PIECE_NAMES[promo]}`}
                    onClick={() => {
                      if (pendingPromotion.isPremove && onPremove) {
                        onPremove(pendingPromotion.from, pendingPromotion.to, promo);
                      } else {
                        onMove(pendingPromotion.from, pendingPromotion.to, promo);
                      }
                      setPendingPromotion(null);
                    }}
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-md bg-[#383530] hover:bg-[#81B64C]/30 border border-white/10 flex items-center justify-center p-1.5 transition-colors cursor-pointer"
                  >
                    <ChessPiece
                      type={promo}
                      color={pendingPromotion.color}
                      pieceTheme={activePieceTheme}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (!isOutsideCoords) {
    return boardCore;
  }

  return (
    <div className="w-full rounded-md bg-[#22201D] p-1.5 sm:p-2 ring-1 ring-white/10 select-none">
      <div className="flex items-stretch gap-1">
        <div
          aria-hidden="true"
          className="w-3.5 sm:w-4 grid grid-rows-8 text-[9px] sm:text-[10px] font-mono font-bold text-[#9E998F] shrink-0"
        >
          {displayRanks.map((r) => (
            <div key={r} className="flex items-center justify-center leading-none">
              {r}
            </div>
          ))}
        </div>
        <div className="flex-1 min-w-0">{boardCore}</div>
      </div>
      <div className="flex items-center gap-1 pt-1">
        <div className="w-3.5 sm:w-4 shrink-0" />
        <div
          aria-hidden="true"
          className="flex-1 grid grid-cols-8 text-[9px] sm:text-[10px] font-mono font-bold text-[#9E998F]"
        >
          {displayFiles.map((f) => (
            <div key={f} className="flex items-center justify-center leading-none uppercase">
              {f}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
