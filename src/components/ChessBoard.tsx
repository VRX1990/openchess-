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
import {
  computeBoardTransitions,
  computeDragTiltDeg,
  computeMotionTrailPolygon,
  computeOverlaySlideGeometry,
  getDragActivationThreshold,
  getPieceAnimationTiming,
  type MotionTrailPolygon,
  type OverlaySlideGeometry,
} from '../chess/boardMotion';

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
  puzzleBadge?: { square: string; status: 'correct' | 'wrong' } | null;
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
  initialAnimateFromFen?: string | null;
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
  puzzleBadge = null,
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
  initialAnimateFromFen = null,
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
    lastX: number;
    vx: number;
    tiltDeg: number;
    squareSize: number;
    isTouch: boolean;
    rafId: number | null;
  }>({
    curX: 0,
    curY: 0,
    lastX: 0,
    vx: 0,
    tiltDeg: 0,
    squareSize: 48,
    isTouch: false,
    rafId: null,
  });
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
  const prevFenRef = useRef<string>(initialAnimateFromFen ?? fen);
  const lastMoveRef = useRef(lastMove);
  lastMoveRef.current = lastMove;
  const animSeqRef = useRef<number>(0);
  const [activeSlides, setActiveSlides] = useState<{
    seq: number;
    durationMs: number;
    items: Array<{
      id: string;
      to: Square;
      type: PieceSymbol;
      color: Color;
      isKnight: boolean;
      geom: OverlaySlideGeometry;
    }>;
  } | null>(null);
  const [activeSnapback, setActiveSnapback] = useState<{
    seq: number;
    square: Square;
    type: PieceSymbol;
    color: Color;
    leftPct: number;
    topPct: number;
    snapX: number;
    snapY: number;
  } | null>(null);
  const [dragSettle, setDragSettle] = useState<{
    seq: number;
    square: Square;
  } | null>(null);
  const [capturedGhost, setCapturedGhost] = useState<{
    seq: number;
    square: Square;
    type: PieceSymbol;
    color: Color;
    delayMs: number;
    fadeMs: number;
  } | null>(null);
  const [motionTrails, setMotionTrails] = useState<{
    seq: number;
    durationMs: number;
    items: Array<MotionTrailPolygon & { id: string }>;
  } | null>(null);
  const [captureBurst, setCaptureBurst] = useState<{
    seq: number;
    square: Square;
    delayMs: number;
  } | null>(null);
  const [illegalFlash, setIllegalFlash] = useState<{
    seq: number;
    square: Square;
  } | null>(null);
  const slideTimerRef = useRef<number | null>(null);
  const snapbackTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const ghostTimerRef = useRef<number | null>(null);
  const trailTimerRef = useRef<number | null>(null);
  const captureBurstTimerRef = useRef<number | null>(null);
  const illegalFlashTimerRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const prevFen = prevFenRef.current;
    prevFenRef.current = fen;
    if (prevFen === fen || activeAnimationSpeed === 'none') {
      return;
    }

    const lm = lastMoveRef.current;
    const moveKey = lm?.from && lm?.to ? `${lm.from}-${lm.to}-${fen}` : null;
    const wasDragDrop = Boolean(moveKey && suppressSlideRef.current === moveKey);
    if (wasDragDrop) {
      suppressSlideRef.current = null;
    }

    const result = computeBoardTransitions(prevFen, fen, lm);
    if (result.slides.length === 0 && !result.captured) {
      setActiveSlides(null);
      return;
    }

    const timing = getPieceAnimationTiming(activeAnimationSpeed);
    const seq = ++animSeqRef.current;

    if (wasDragDrop) {
      setActiveSlides(null);
      setActiveSnapback(null);
      if (lm?.to && timing.durationMs > 0) {
        setDragSettle({ seq, square: lm.to as Square });
        if (settleTimerRef.current !== null) {
          window.clearTimeout(settleTimerRef.current);
        }
        settleTimerRef.current = window.setTimeout(() => {
          setDragSettle((cur) => (cur?.seq === seq ? null : cur));
        }, 145);
      }
      if (result.captured) {
        setCaptureBurst({ seq, square: result.captured.square, delayMs: 0 });
        if (captureBurstTimerRef.current !== null) {
          window.clearTimeout(captureBurstTimerRef.current);
        }
        captureBurstTimerRef.current = window.setTimeout(() => {
          setCaptureBurst((cur) => (cur?.seq === seq ? null : cur));
        }, 300);
      }
      setCapturedGhost(null);
      setMotionTrails(null);
      return;
    }

    const nextSlides: Array<{
      id: string;
      to: Square;
      type: PieceSymbol;
      color: Color;
      isKnight: boolean;
      geom: OverlaySlideGeometry;
    }> = [];
    const nextTrails: Array<MotionTrailPolygon & { id: string }> = [];

    if (timing.durationMs > 0) {
      for (let i = 0; i < result.slides.length; i++) {
        const s = result.slides[i];
        const fromVis = squareToVisual(s.from, orientation);
        const toVis = squareToVisual(s.to, orientation);
        if (!fromVis || !toVis) continue;

        const geom = computeOverlaySlideGeometry(
          fromVis.col,
          fromVis.row,
          toVis.col,
          toVis.row,
        );
        if (!geom) continue;

        nextSlides.push({
          id: `${seq}-${i}-${s.from}-${s.to}`,
          to: s.to,
          type: s.type,
          color: s.color,
          isKnight: s.isKnight,
          geom,
        });

        const trail = computeMotionTrailPolygon(
          fromVis.col,
          fromVis.row,
          toVis.col,
          toVis.row,
        );
        if (trail) {
          nextTrails.push({ ...trail, id: `${seq}-${i}-${s.from}-${s.to}` });
        }
      }
    }

    setActiveSnapback(null);
    setDragSettle(null);

    if (nextSlides.length > 0 && timing.durationMs > 0) {
      setActiveSlides({
        seq,
        durationMs: timing.durationMs,
        items: nextSlides,
      });
      if (slideTimerRef.current !== null) {
        window.clearTimeout(slideTimerRef.current);
      }
      // Safety fallback for background tabs; normal completion fires cleanly via onAnimationEnd
      slideTimerRef.current = window.setTimeout(() => {
        setActiveSlides((cur) => (cur?.seq === seq ? null : cur));
      }, timing.durationMs + 140);
    } else {
      setActiveSlides(null);
    }

    if (nextTrails.length > 0 && timing.trailDurationMs > 0) {
      setMotionTrails({
        seq,
        durationMs: timing.trailDurationMs,
        items: nextTrails,
      });
      if (trailTimerRef.current !== null) {
        window.clearTimeout(trailTimerRef.current);
      }
      trailTimerRef.current = window.setTimeout(() => {
        setMotionTrails((cur) => (cur?.seq === seq ? null : cur));
      }, timing.trailDurationMs + 40);
    } else {
      setMotionTrails(null);
    }

    if (result.captured && timing.durationMs > 0) {
      setCapturedGhost({
        seq,
        square: result.captured.square,
        type: result.captured.type,
        color: result.captured.color,
        delayMs: timing.captureDelayMs,
        fadeMs: timing.captureFadeMs,
      });
      setCaptureBurst({
        seq,
        square: result.captured.square,
        delayMs: Math.max(0, timing.captureDelayMs - 15),
      });
      if (captureBurstTimerRef.current !== null) {
        window.clearTimeout(captureBurstTimerRef.current);
      }
      captureBurstTimerRef.current = window.setTimeout(() => {
        setCaptureBurst((cur) => (cur?.seq === seq ? null : cur));
      }, timing.durationMs + 140);
      if (ghostTimerRef.current !== null) {
        window.clearTimeout(ghostTimerRef.current);
      }
      ghostTimerRef.current = window.setTimeout(() => {
        setCapturedGhost((cur) => (cur?.seq === seq ? null : cur));
      }, timing.durationMs + 40);
    } else {
      setCapturedGhost(null);
    }
  }, [fen, orientation, activeAnimationSpeed]);

  useEffect(() => {
    return () => {
      if (dragLiveRef.current.rafId !== null) {
        window.cancelAnimationFrame(dragLiveRef.current.rafId);
      }
      if (slideTimerRef.current !== null) {
        window.clearTimeout(slideTimerRef.current);
      }
      if (snapbackTimerRef.current !== null) {
        window.clearTimeout(snapbackTimerRef.current);
      }
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
      if (ghostTimerRef.current !== null) {
        window.clearTimeout(ghostTimerRef.current);
      }
      if (trailTimerRef.current !== null) {
        window.clearTimeout(trailTimerRef.current);
      }
      if (captureBurstTimerRef.current !== null) {
        window.clearTimeout(captureBurstTimerRef.current);
      }
      if (illegalFlashTimerRef.current !== null) {
        window.clearTimeout(illegalFlashTimerRef.current);
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
    dragLiveRef.current.lastX = e.clientX;
    dragLiveRef.current.vx = 0;
    dragLiveRef.current.tiltDeg = 0;
    dragLiveRef.current.squareSize = squareSize;
    dragLiveRef.current.isTouch = e.pointerType === 'touch';

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
    const live = dragLiveRef.current;
    if (!el) return;
    live.tiltDeg = computeDragTiltDeg(live.vx, live.tiltDeg);
    live.vx *= 0.45;
    const piecePx = live.squareSize * 1.38;
    const liftY = live.isTouch ? live.squareSize * 0.48 : live.squareSize * 0.1;
    const tx = live.curX - piecePx / 2;
    const ty = live.curY - piecePx / 2 - liftY;
    el.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) rotate(${live.tiltDeg.toFixed(2)}deg)`;

    // Keep decaying tilt smoothly back to 0° while holding piece still
    if (Math.abs(live.tiltDeg) > 0.12) {
      live.rafId = window.requestAnimationFrame(() => {
        dragLiveRef.current.rafId = null;
        syncFloatingDragTransform();
      });
    }
  };

  const handlePointerMoveSquare = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState) return;
    const live = dragLiveRef.current;
    live.vx = e.clientX - live.lastX;
    live.lastX = e.clientX;
    live.curX = e.clientX;
    live.curY = e.clientY;

    if (live.rafId === null) {
      live.rafId = window.requestAnimationFrame(() => {
        dragLiveRef.current.rafId = null;
        syncFloatingDragTransform();
      });
    }

    const dist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
    const dragThreshold = getDragActivationThreshold(e.pointerType);
    const nextActive = dragState.active || dist > dragThreshold;
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
    const releaseX = e.clientX;
    const releaseY = e.clientY;
    setDragState(null);

    if (currentDrag.active) {
      skipNextClickRef.current = true;
      window.setTimeout(() => {
        skipNextClickRef.current = false;
      }, 0);
      const dropSquare = getSquareFromPoint(releaseX, releaseY);
      if (dropSquare && dropSquare !== currentDrag.from) {
        const moved = attemptMove(currentDrag.from, dropSquare, true);
        if (!moved) {
          // Illegal drop: brief crimson flash on target square + smooth snapback to origin
          const flashSeq = ++animSeqRef.current;
          setIllegalFlash({ seq: flashSeq, square: dropSquare });
          if (illegalFlashTimerRef.current !== null) {
            window.clearTimeout(illegalFlashTimerRef.current);
          }
          illegalFlashTimerRef.current = window.setTimeout(() => {
            setIllegalFlash((cur) => (cur?.seq === flashSeq ? null : cur));
          }, 320);

          if (activeAnimationSpeed !== 'none') {
            const originVis = squareToVisual(currentDrag.from, orientation);
            const boardEl = boardRef.current;
            if (originVis && boardEl) {
              const boardRect = boardEl.getBoundingClientRect();
              const sqPx = boardRect.width / 8;
              const originCenterX = boardRect.left + (originVis.col + 0.5) * sqPx;
              const originCenterY = boardRect.top + (originVis.row + 0.5) * sqPx;
              const snapSeq = ++animSeqRef.current;
              setActiveSnapback({
                seq: snapSeq,
                square: currentDrag.from,
                type: currentDrag.pieceType,
                color: currentDrag.pieceColor,
                leftPct: originVis.col * 12.5,
                topPct: originVis.row * 12.5,
                snapX: Number((releaseX - originCenterX).toFixed(1)),
                snapY: Number((releaseY - originCenterY).toFixed(1)),
              });
              if (snapbackTimerRef.current !== null) {
                window.clearTimeout(snapbackTimerRef.current);
              }
              snapbackTimerRef.current = window.setTimeout(() => {
                setActiveSnapback((cur) => (cur?.seq === snapSeq ? null : cur));
              }, 185);
            }
          }
        }
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
          : '150ms',
    '--knight-anim-ms':
      activeAnimationSpeed === 'none'
        ? '0ms'
        : activeAnimationSpeed === 'fast'
          ? '105ms'
          : '160ms',
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

              const showPuzzleBadge = Boolean(puzzleBadge && puzzleBadge.square === sq);

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
                    showBadge || (dragState?.active && dragState.hoverSquare === sq) ? 'z-20' : 'z-0'
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

                  {/* Chess.com Arcade soft circular hover halo + crisp inset ring when dragging over a square */}
                  {dragState?.active && dragState.hoverSquare === sq && (
                    <>
                      <span
                        data-testid="drag-hover-halo"
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[215%] h-[215%] rounded-full pointer-events-none z-15"
                        style={{
                          backgroundColor: isDragHover
                            ? 'rgba(0, 0, 0, 0.23)'
                            : 'rgba(0, 0, 0, 0.18)',
                        }}
                      />
                      <span
                        className="absolute inset-0 pointer-events-none z-15"
                        style={{
                          boxShadow: isDragHover
                            ? 'inset 0 0 0 3px rgba(255, 255, 255, 0.72)'
                            : 'inset 0 0 0 2.5px rgba(255, 255, 255, 0.42)',
                        }}
                      />
                    </>
                  )}

                  {/* Illegal drop crimson square flash (matches Chess.com mobile invalid drop feedback) */}
                  {illegalFlash && illegalFlash.square === sq && (
                    <span
                      key={`illegal-${illegalFlash.seq}-${sq}`}
                      data-testid="illegal-drop-flash"
                      className="animate-illegal-flash absolute inset-0 pointer-events-none z-25"
                      style={{ backgroundColor: 'rgba(235, 97, 80, 0.76)' }}
                    />
                  )}

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
                  {capturedGhost && capturedGhost.square === sq && (
                    <div
                      key={`ghost-${capturedGhost.seq}-${capturedGhost.square}`}
                      style={{
                        animationDelay: `${capturedGhost.delayMs}ms`,
                        animationDuration: `${capturedGhost.fadeMs}ms`,
                      }}
                      className="animate-captured-fade absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                    >
                      <div className="w-[93%] h-[93%]">
                        <ChessPiece
                          type={capturedGhost.type}
                          color={capturedGhost.color}
                          pieceTheme={activePieceTheme}
                        />
                      </div>
                    </div>
                  )}

                  {/* Chess.com Arcade capture white shockwave ring & impact flash */}
                  {captureBurst && captureBurst.square === sq && (
                    <div
                      key={`burst-${captureBurst.seq}-${captureBurst.square}`}
                      data-testid="capture-impact-burst"
                      className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
                    >
                      <span
                        style={{ animationDelay: `${captureBurst.delayMs}ms` }}
                        className="animate-capture-flash absolute w-[68%] h-[68%] rounded-full bg-white/55 blur-[1px]"
                      />
                      <span
                        style={{ animationDelay: `${captureBurst.delayMs}ms` }}
                        className="animate-capture-ring absolute w-[94%] h-[94%] rounded-full border-[4px] border-white/85"
                      />
                    </div>
                  )}

                  {/* Real Piece (temporarily hidden while gliding smoothly in the board-level overlay) */}
                  {piece && !isBeingDragged && !ghostPremovePiece && (() => {
                    const isGlidingInOverlay = Boolean(
                      activeSlides?.items.some((sl) => sl.to === sq) ||
                        activeSnapback?.square === sq,
                    );
                    const isSettling = dragSettle?.square === sq;
                    return (
                      <div
                        key={isSettling ? `settle-${dragSettle.seq}-${sq}` : undefined}
                        className={`w-full h-full flex items-center justify-center z-20 ${
                          isGlidingInOverlay ? 'opacity-0 pointer-events-none' : ''
                        } ${isSettling ? 'animate-drag-settle' : ''} ${
                          isVacatedByPremove ? 'opacity-35 scale-90 transition-all duration-100' : ''
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
                    );
                  })()}

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

                  {/* Exact Chess.com Puzzle Solved ✓ / Wrong ✕ Corner Badge */}
                  {showPuzzleBadge && puzzleBadge && (
                    <span
                      key={`pbadge-${sq}-${puzzleBadge.status}`}
                      aria-label={puzzleBadge.status === 'correct' ? 'Correct puzzle move' : 'Incorrect puzzle move'}
                      className={`animate-badge-pop absolute top-[2%] right-[2%] w-[34%] h-[34%] rounded-full flex items-center justify-center z-40 pointer-events-none shadow-[0_2px_6px_rgba(0,0,0,0.45)] ring-2 ring-white/95 ${
                        puzzleBadge.status === 'correct'
                          ? 'bg-[#81B64C]'
                          : 'bg-[#FA412D]'
                      }`}
                    >
                      {puzzleBadge.status === 'correct' ? (
                        <svg viewBox="0 0 20 20" className="w-[68%] h-[68%] text-white" fill="none" aria-hidden="true">
                          <path
                            d="M4.2 10.4L8.1 14.3L15.8 6.2"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 20 20" className="w-[64%] h-[64%] text-white" fill="none" aria-hidden="true">
                          <path
                            d="M5.5 5.5L14.5 14.5M14.5 5.5L5.5 14.5"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />
                        </svg>
                      )}
                    </span>
                  )}
                </button>
              );
            }),
          )}
        </div>

        {/* Board-Level Clip-Free Floating Piece Glide Overlay (silky 60fps on mobile & desktop) */}
        {((activeSlides && activeSlides.items.length > 0) || activeSnapback) && (
          <div
            data-testid="piece-slide-overlay"
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none z-40"
          >
            {activeSlides?.items.map((slide, idx) => (
              <div
                key={slide.id}
                data-testid="gliding-piece"
                data-to-square={slide.to}
                onAnimationEnd={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (idx === 0) {
                    const finishedSeq = activeSlides.seq;
                    setActiveSlides((cur) => (cur?.seq === finishedSeq ? null : cur));
                  }
                }}
                style={
                  {
                    left: `${slide.geom.leftPct}%`,
                    top: `${slide.geom.topPct}%`,
                    width: '12.5%',
                    height: '12.5%',
                    animationDuration: `${activeSlides.durationMs}ms`,
                    '--from-x': `${slide.geom.fromXPercent}%`,
                    '--from-y': `${slide.geom.fromYPercent}%`,
                  } as CSSProperties
                }
                className="absolute flex items-center justify-center animate-overlay-glide"
              >
                <div
                  style={
                    slide.isKnight
                      ? { animationDuration: `${activeSlides.durationMs}ms` }
                      : undefined
                  }
                  className={`w-[93%] h-[93%] ${slide.isKnight ? 'animate-knight-arc-scale' : ''}`}
                >
                  <ChessPiece
                    type={slide.type}
                    color={slide.color}
                    pieceTheme={activePieceTheme}
                  />
                </div>
              </div>
            ))}

            {activeSnapback && (
              <div
                key={`snap-${activeSnapback.seq}-${activeSnapback.square}`}
                data-testid="snapback-piece"
                style={
                  {
                    left: `${activeSnapback.leftPct}%`,
                    top: `${activeSnapback.topPct}%`,
                    width: '12.5%',
                    height: '12.5%',
                    '--snap-x': `${activeSnapback.snapX}px`,
                    '--snap-y': `${activeSnapback.snapY}px`,
                  } as CSSProperties
                }
                className="absolute flex items-center justify-center animate-overlay-snapback"
              >
                <div className="w-[93%] h-[93%] drop-shadow-[0_6px_12px_rgba(0,0,0,0.38)]">
                  <ChessPiece
                    type={activeSnapback.type}
                    color={activeSnapback.color}
                    pieceTheme={activePieceTheme}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Chess.com Arcade White Tapered Comet Motion Streak Layer (behind sliding pieces) */}
        {motionTrails && motionTrails.items.length > 0 && (
          <svg
            key={`trails-${motionTrails.seq}`}
            data-testid="piece-motion-trail"
            viewBox="0 0 800 800"
            className="absolute inset-0 w-full h-full pointer-events-none z-15"
            aria-hidden="true"
          >
            <defs>
              {motionTrails.items.map((trail) => (
                <linearGradient
                  key={`grad-${trail.id}`}
                  id={`oc-trail-grad-${trail.id}`}
                  gradientUnits="userSpaceOnUse"
                  x1={trail.x1}
                  y1={trail.y1}
                  x2={trail.x2}
                  y2={trail.y2}
                >
                  <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
                  <stop offset="35%" stopColor="#FFFFFF" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.62" />
                </linearGradient>
              ))}
            </defs>
            {motionTrails.items.map((trail) => (
              <polygon
                key={trail.id}
                points={trail.points}
                fill={`url(#oc-trail-grad-${trail.id})`}
                className="animate-move-trail"
                style={{ animationDuration: `${motionTrails.durationMs}ms` }}
              />
            ))}
          </svg>
        )}

        {/* Floating Arcade 1.36x Velocity-Tilted Dragged Piece */}
        {dragState?.active && boardRef.current && (() => {
          const piecePx = dragState.squareSize * 1.38;
          const live = dragLiveRef.current;
          const liftY = live.isTouch ? dragState.squareSize * 0.48 : dragState.squareSize * 0.1;
          const initX = live.curX - piecePx / 2;
          const initY = live.curY - piecePx / 2 - liftY;
          return (
            <div
              ref={floatingDragRef}
              data-testid="floating-drag-piece"
              aria-hidden="true"
              className="pointer-events-none fixed left-0 top-0 z-50 will-change-transform"
              style={{
                width: piecePx,
                height: piecePx,
                transform: `translate3d(${initX.toFixed(1)}px, ${initY.toFixed(1)}px, 0) rotate(${live.tiltDeg.toFixed(2)}deg)`,
                filter: 'drop-shadow(0 12px 16px rgba(0,0,0,0.42))',
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
