import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import type { MoveQuality } from '../chess/engine';
import { computePremoveTargets } from '../chess/onlineHelpers';
import { ChessPiece } from './ChessPiece';
import { MOVE_QUALITY_META, MoveBadge } from './MoveBadge';

export type BoardTheme = 'green' | 'walnut' | 'slate';

const BOARD_THEMES: Record<
  BoardTheme,
  { light: string; dark: string; lightHighlight: string; darkHighlight: string }
> = {
  green: {
    light: '#EEEED2',
    dark: '#769656',
    lightHighlight: '#F6F669',
    darkHighlight: '#BACA2B',
  },
  walnut: {
    light: '#F0D9B5',
    dark: '#B58863',
    lightHighlight: '#F7EC77',
    darkHighlight: '#DAC34B',
  },
  slate: {
    light: '#DEE3E6',
    dark: '#8CA2AD',
    lightHighlight: '#D4E6F1',
    darkHighlight: '#6E95AB',
  },
};

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
  onPremove?: (from: string, to: string, promotion?: PieceSymbol) => void;
  onClearPremove?: () => void;
  highlightSquares?: { square: string; color: 'green' | 'red' | 'yellow' | 'blue' }[];
  extraArrows?: { from: string; to: string; color?: 'green' | 'red' | 'yellow' | 'blue' }[];
  hideCoordinates?: boolean;
  onSquareClick?: (sq: Square) => void;
  theme?: BoardTheme;
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
  curX: number;
  curY: number;
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
  onPremove,
  onClearPremove,
  highlightSquares = [],
  extraArrows = [],
  hideCoordinates = false,
  onSquareClick,
  theme = 'green',
  onMove,
}: ChessBoardProps) {
  const boardRef = useRef<HTMLDivElement | null>(null);
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
  const [ghostCapture, setGhostCapture] = useState<{
    square: string;
    type: PieceSymbol;
    color: Color;
    key: string;
  } | null>(null);

  useEffect(() => {
    const prevFen = prevFenRef.current;
    prevFenRef.current = fen;
    if (!lastMoveCapture || !lastMove?.to || prevFen === fen) {
      return;
    }
    try {
      const prevChess = new Chess(prevFen);
      let capturedSquare: Square = lastMove.to as Square;
      let capturedPiece = prevChess.get(capturedSquare);
      // En passant capture: pawn captured sits on the origin rank of `from` and destination file of `to`
      if (!capturedPiece && lastMove.from && lastMove.to[0] !== lastMove.from[0]) {
        const epSq = `${lastMove.to[0]}${lastMove.from[1]}` as Square;
        const epPiece = prevChess.get(epSq);
        if (epPiece?.type === 'p') {
          capturedSquare = epSq;
          capturedPiece = epPiece;
        }
      }
      if (!capturedPiece) return;
      const moveKey = `${lastMove.from}-${lastMove.to}-${fen}`;
      if (suppressSlideRef.current === moveKey) return;
      setGhostCapture({
        square: capturedSquare,
        type: capturedPiece.type,
        color: capturedPiece.color,
        key: `${capturedSquare}-${fen}`,
      });
      const timer = window.setTimeout(() => {
        setGhostCapture((cur) => (cur?.key === `${capturedSquare}-${fen}` ? null : cur));
      }, 160);
      return () => window.clearTimeout(timer);
    } catch {
      return;
    }
  }, [fen, lastMove, lastMoveCapture]);

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
  const palette = BOARD_THEMES[theme];
  const isPremoveMode =
    interactive &&
    allowedColor !== 'both' &&
    activeTurn !== allowedColor &&
    Boolean(onPremove);

  useEffect(() => {
    if (!selectedSquare) return;
    if (!interactive) {
      setSelectedSquare(null);
      return;
    }
    const selPiece = chess.get(selectedSquare);
    if (!selPiece) {
      setSelectedSquare(null);
      return;
    }
    if (allowedColor !== 'both' && selPiece.color !== allowedColor) {
      setSelectedSquare(null);
    }
  }, [allowedColor, chess, interactive, selectedSquare]);

  const occupiedSquares = useMemo(() => {
    const set = new Set<string>();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (board[r][c]) {
          set.add(`${FILES[c]}${RANKS[r]}`);
        }
      }
    }
    return set;
  }, [board]);

  const activeSourceSquare = dragState?.active ? dragState.from : selectedSquare;

  const legalMovesFromSelected = useMemo(() => {
    if (!activeSourceSquare || !interactive) {
      return new Map<Square, { isCapture: boolean; isPromo: boolean }>();
    }
    const piece = chess.get(activeSourceSquare);
    if (!piece) {
      return new Map<Square, { isCapture: boolean; isPromo: boolean }>();
    }
    if (isPremoveMode && piece.color === allowedColor) {
      const rawTargets = computePremoveTargets(
        piece.type,
        piece.color,
        activeSourceSquare,
        occupiedSquares,
      );
      const map = new Map<Square, { isCapture: boolean; isPromo: boolean }>();
      for (const [k, v] of rawTargets.entries()) {
        map.set(k as Square, v);
      }
      return map;
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
  }, [chess, activeSourceSquare, interactive, isPremoveMode, allowedColor, occupiedSquares]);

  const displayRanks = orientation === 'w' ? RANKS : [...RANKS].reverse();
  const displayFiles = orientation === 'w' ? FILES : [...FILES].reverse();

  const slideOffsets = useMemo(() => {
    const map = new Map<string, { dx: number; dy: number }>();
    if (!lastMove?.from || !lastMove?.to) return map;
    const moveKey = `${lastMove.from}-${lastMove.to}-${fen}`;
    if (suppressSlideRef.current === moveKey) {
      return map;
    }

    const fromVis = squareToVisual(lastMove.from, orientation);
    const toVis = squareToVisual(lastMove.to, orientation);
    if (!fromVis || !toVis) return map;

    map.set(lastMove.to, {
      dx: (fromVis.col - toVis.col) * 100,
      dy: (fromVis.row - toVis.row) * 100,
    });

    const destPiece = chess.get(lastMove.to as Square);
    const fromFileIdx = FILES.indexOf(lastMove.from[0]);
    const toFileIdx = FILES.indexOf(lastMove.to[0]);
    if (
      destPiece?.type === 'k' &&
      lastMove.from[1] === lastMove.to[1] &&
      Math.abs(fromFileIdx - toFileIdx) === 2
    ) {
      const rank = lastMove.to[1];
      const rookFrom = toFileIdx > fromFileIdx ? `h${rank}` : `a${rank}`;
      const rookTo = toFileIdx > fromFileIdx ? `f${rank}` : `d${rank}`;
      const rFromVis = squareToVisual(rookFrom, orientation);
      const rToVis = squareToVisual(rookTo, orientation);
      if (rFromVis && rToVis) {
        map.set(rookTo, {
          dx: (rFromVis.col - rToVis.col) * 100,
          dy: (rFromVis.row - rToVis.row) * 100,
        });
      }
    }

    return map;
  }, [chess, fen, lastMove, orientation]);

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

  const premoveArrowCoords = useMemo(() => {
    if (!premove?.from || !premove?.to) return null;
    return buildArrowSegment(premove.from, premove.to);
  }, [premove, orientation]);

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
    const piece = chess.get(from);
    if (!piece) return false;

    if (isPremoveMode && piece.color === allowedColor && onPremove) {
      const premoveTargets = computePremoveTargets(piece.type, piece.color, from, occupiedSquares);
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

    const piece = chess.get(sq);
    const canControlTurn = allowedColor === 'both' || allowedColor === activeTurn;
    const canControlPiece =
      piece &&
      ((piece.color === activeTurn && canControlTurn) ||
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

    if (premove && onClearPremove) {
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
      if (premove && onClearPremove) {
        onClearPremove();
        setSelectedSquare(null);
        return;
      }
      setRightDragFrom(sq);
      return;
    }
    if (e.button !== 0 || !interactive || pendingPromotion) return;

    const piece = chess.get(sq);
    const canControlTurn = allowedColor === 'both' || allowedColor === activeTurn;
    const canDragPiece =
      piece &&
      ((piece.color === activeTurn && canControlTurn) ||
        (isPremoveMode && piece.color === allowedColor));
    if (!canDragPiece || !piece) return;

    const rect = boardRef.current?.getBoundingClientRect();
    const squareSize = rect ? rect.width / 8 : 48;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // fallback if pointer capture unsupported
    }

    setDragState({
      from: sq,
      pieceType: piece.type,
      pieceColor: piece.color,
      startX: e.clientX,
      startY: e.clientY,
      curX: e.clientX,
      curY: e.clientY,
      active: false,
      squareSize,
      hoverSquare: sq,
    });
  };

  const handlePointerMoveSquare = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState) return;
    const dist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
    const nextActive = dragState.active || dist > 6;
    const hover = getSquareFromPoint(e.clientX, e.clientY);
    setDragState((prev) =>
      prev
        ? {
            ...prev,
            curX: e.clientX,
            curY: e.clientY,
            active: nextActive,
            hoverSquare: hover,
          }
        : null,
    );
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

  return (
    <div
      ref={boardRef}
      className="relative w-full aspect-square select-none touch-none"
      data-testid="chess-board"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="relative w-full h-full rounded-none sm:rounded-md overflow-hidden shadow-[0_14px_38px_rgba(0,0,0,0.48)] ring-1 ring-black/30">
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
            const isLastMove = lastMove?.from === sq || lastMove?.to === sq;
            const isPremoveSq = premove?.from === sq || premove?.to === sq;
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
                        ? 'rgba(232, 93, 74, 0.52)'
                        : 'rgba(214, 73, 55, 0.58)',
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

                {/* Hover target ring while finger/cursor dragging */}
                {isDragHover && (
                  <span className="absolute inset-0 ring-4 ring-inset ring-white/55 pointer-events-none z-15" />
                )}

                {/* Custom study/coordinate square highlight */}
                {customHighlight && (
                  <span className={`absolute inset-0 ${customHighlightBg} pointer-events-none z-5`} />
                )}

                {/* Right-click tactical highlight */}
                {isMarked && (
                  <span className="absolute inset-0 bg-[#EB6150]/55 pointer-events-none z-5" />
                )}

                {/* Check radial warning */}
                {isKingInCheck && (
                  <span
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(229,57,53,0.92) 0%, rgba(229,57,53,0.45) 55%, rgba(229,57,53,0) 78%)',
                    }}
                  />
                )}

                {/* Coach hint ring */}
                {isHint && (
                  <span className="absolute inset-1 rounded-sm border-[3px] border-[#E59A28] pointer-events-none z-10" />
                )}

                {/* Rank coordinate on left column */}
                {!hideCoordinates && cVisIdx === 0 && (
                  <span
                    style={{ color: coordColor }}
                    className="absolute top-[2px] left-[3px] text-[9px] sm:text-[11px] font-sans font-bold leading-none pointer-events-none select-none"
                  >
                    {rank}
                  </span>
                )}

                {/* File coordinate on bottom row */}
                {!hideCoordinates && rVisIdx === 7 && (
                  <span
                    style={{ color: coordColor }}
                    className="absolute bottom-[1px] right-[3px] text-[9px] sm:text-[11px] font-sans font-bold leading-none pointer-events-none select-none"
                  >
                    {file}
                  </span>
                )}

                {/* Legal / Premove move indicator */}
                {targetInfo && !targetInfo.isCapture && (
                  <span
                    className={`animate-dot-pop w-[30%] h-[30%] rounded-full pointer-events-none z-10 ${
                      isPremoveMode ? 'bg-[#E06C5A]/45' : 'bg-black/18'
                    }`}
                  />
                )}
                {targetInfo && targetInfo.isCapture && (
                  <span
                    className={`animate-dot-pop absolute inset-[5%] rounded-full border-[5px] pointer-events-none z-10 ${
                      isPremoveMode ? 'border-[#E06C5A]/55' : 'border-black/18'
                    }`}
                  />
                )}

                {/* Capture impact burst ring */}
                {lastMoveCapture && lastMove?.to === sq && (
                  <span
                    key={`cap-${sq}-${fen}`}
                    className="animate-capture-ring absolute inset-[8%] rounded-full border-[3px] border-white/55 pointer-events-none z-15"
                  />
                )}

                {/* Chess.com-style fading captured piece beneath the landing piece */}
                {ghostCapture && ghostCapture.square === sq && (
                  <div
                    key={`ghost-${ghostCapture.key}`}
                    className="animate-captured-fade absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                  >
                    <div className="w-[84%] h-[84%]">
                      <ChessPiece type={ghostCapture.type} color={ghostCapture.color} />
                    </div>
                  </div>
                )}

                {/* Piece with real square-to-square slide / knight hop animation */}
                {piece && !isBeingDragged && (
                  <div
                    key={
                      isMovingPiece && lastMove
                        ? `${sq}-${lastMove.from}-${lastMove.to}-${fen}`
                        : `${sq}-${piece.color}-${piece.type}`
                    }
                    style={slideStyle}
                    className={`w-full h-full flex items-center justify-center z-20 ${
                      isMovingPiece
                        ? piece.type === 'n'
                          ? 'animate-knight-hop'
                          : 'animate-piece-slide'
                        : ''
                    }`}
                  >
                    <div
                      className={`w-[84%] h-[84%] transition-transform duration-100 ${
                        isSelected ? 'scale-[1.06]' : ''
                      }`}
                    >
                      <ChessPiece type={piece.type} color={piece.color} />
                    </div>
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

      {/* Floating dragged piece under finger / mouse */}
      {dragState?.active && boardRef.current && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50"
          style={{
            width: dragState.squareSize * 1.18,
            height: dragState.squareSize * 1.18,
            left: dragState.curX - (dragState.squareSize * 1.18) / 2,
            top: dragState.curY - (dragState.squareSize * 1.18) / 2 - 10,
            filter: 'drop-shadow(0 12px 16px rgba(0,0,0,0.45))',
          }}
        >
          <ChessPiece type={dragState.pieceType} color={dragState.pieceColor} />
        </div>
      )}

      {/* Best Move / Premove / Study / User Calculation SVG Arrow Overlay */}
      {(arrowCoords || premoveArrowCoords || userArrowSegments.length > 0 || extraArrowSegments.length > 0) && (
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
          {premoveArrowCoords && (
            <line
              x1={premoveArrowCoords.x1}
              y1={premoveArrowCoords.y1}
              x2={premoveArrowCoords.x2}
              y2={premoveArrowCoords.y2}
              stroke="rgba(250, 65, 45, 0.85)"
              strokeWidth="15"
              strokeLinecap="round"
              strokeDasharray="24 14"
              markerEnd="url(#openchess-red-arrowhead)"
            />
          )}
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
                  <ChessPiece type={promo} color={pendingPromotion.color} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

