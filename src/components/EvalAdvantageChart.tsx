import { useMemo, useRef, useState, type MouseEvent } from 'react';
import type { EvaluatedMove } from '../chess/engine';
import { formatEvalDisplay } from '../chess/reviewAnalysis';
import { MOVE_QUALITY_META } from './MoveBadge';

interface EvalAdvantageChartProps {
  moves: EvaluatedMove[];
  selectedPly: number;
  analyzedCount?: number;
  heightClass?: string;
  showActiveCursor?: boolean;
  onSelectPly?: (ply: number) => void;
}

export function EvalAdvantageChart({
  moves,
  selectedPly,
  analyzedCount,
  heightClass = 'h-[72px]',
  showActiveCursor = true,
  onSelectPly,
}: EvalAdvantageChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverPly, setHoverPly] = useState<number | null>(null);

  const w = 420;
  const h = 84;
  const midY = h / 2;

  const { coords, areaPath, linePath, keyDots, scanX, activePoint } = useMemo(() => {
    const pts: Array<{ cp: number; mateIn?: number | null; move: EvaluatedMove | null; ply: number }> = [
      { cp: 20, mateIn: null, move: null, ply: 0 },
      ...moves.map((m) => ({
        cp: m.evalCp,
        mateIn: m.mateIn,
        move: m,
        ply: m.ply,
      })),
    ];

    const total = Math.max(1, pts.length - 1);
    const mapped = pts.map((pt, i) => {
      const x = (i / total) * w;
      const isMate = pt.mateIn !== null && pt.mateIn !== undefined
        ? pt.mateIn !== 0
        : Math.abs(pt.cp) >= 90000;
      const norm = isMate ? (pt.cp >= 0 ? 0.96 : -0.96) : Math.tanh(pt.cp / 420);
      const y = midY - norm * (h * 0.45);
      return { x, y, ...pt };
    });

    const line = mapped
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');
    const area = `${line} L ${w} ${h} L 0 ${h} Z`;

    const dots = mapped.filter(
      (c) =>
        c.move &&
        (c.move.quality === 'Brilliant' ||
          c.move.quality === 'Great' ||
          c.move.quality === 'Inaccuracy' ||
          c.move.quality === 'Mistake' ||
          c.move.quality === 'Miss' ||
          c.move.quality === 'Blunder'),
    );

    const progressPlies =
      typeof analyzedCount === 'number' ? Math.min(moves.length, analyzedCount) : moves.length;
    const scanLineX = moves.length > 0 ? (progressPlies / moves.length) * w : w;

    const clampedActive = Math.max(0, Math.min(mapped.length - 1, selectedPly));
    const active = mapped[clampedActive] ?? mapped[0];

    return {
      coords: mapped,
      areaPath: area,
      linePath: line,
      keyDots: dots,
      scanX: scanLineX,
      activePoint: active,
    };
  }, [analyzedCount, moves, selectedPly]);

  const pickPlyFromPointer = (e: MouseEvent<SVGSVGElement>): number | null => {
    if (!svgRef.current || moves.length === 0) return null;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return Math.round(ratio * moves.length);
  };

  const hoveredPoint =
    hoverPly !== null && hoverPly >= 0 && hoverPly < coords.length ? coords[hoverPly] : null;
  const isScanning = typeof analyzedCount === 'number' && moves.length > 0 && analyzedCount < moves.length;

  return (
    <div
      className="relative rounded-lg overflow-hidden bg-[#1D1B18] border border-white/[0.08] select-none"
      data-testid="eval-advantage-chart"
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className={`w-full ${heightClass} block ${onSelectPly ? 'cursor-pointer' : ''}`}
        preserveAspectRatio="none"
        aria-label="Evaluation advantage timeline"
        onMouseMove={(e) => {
          const ply = pickPlyFromPointer(e);
          if (ply !== null) setHoverPly(ply);
        }}
        onMouseLeave={() => setHoverPly(null)}
        onClick={(e) => {
          if (!onSelectPly) return;
          const ply = pickPlyFromPointer(e);
          if (ply !== null) onSelectPly(ply);
        }}
      >
        {/* Black side dark canvas */}
        <rect x="0" y="0" width={w} height={h} fill="#3B3936" />

        {/* White advantage fill */}
        <path d={areaPath} fill="#FFFFFF" />

        {/* Unscanned overlay when Stockfish 19 is progressively evaluating */}
        {isScanning && scanX < w && (
          <rect
            x={scanX}
            y="0"
            width={Math.max(0, w - scanX)}
            height={h}
            fill="rgba(26, 25, 23, 0.58)"
          />
        )}

        {/* Zero evaluation centerline */}
        <line
          x1="0"
          y1={midY}
          x2={w}
          y2={midY}
          stroke="rgba(128, 123, 113, 0.55)"
          strokeWidth="1"
        />

        {/* Advantage contour */}
        <path
          d={linePath}
          fill="none"
          stroke="rgba(110, 105, 96, 0.8)"
          strokeWidth="1.4"
        />

        {/* Live Stockfish scanline */}
        {isScanning && (
          <line
            x1={scanX}
            y1="0"
            x2={scanX}
            y2={h}
            stroke="#81B64C"
            strokeWidth="2"
          />
        )}

        {/* Active selected ply cursor */}
        {showActiveCursor && moves.length > 0 && activePoint && (
          <>
            <line
              x1={activePoint.x}
              y1="0"
              x2={activePoint.x}
              y2={h}
              stroke="#81B64C"
              strokeWidth="1.6"
              strokeDasharray="2 2"
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="3.8"
              fill="#81B64C"
              stroke="#1A1917"
              strokeWidth="1.5"
            />
          </>
        )}

        {/* Hover scrub line */}
        {hoveredPoint && hoveredPoint.ply !== selectedPly && (
          <line
            x1={hoveredPoint.x}
            y1="0"
            x2={hoveredPoint.x}
            y2={h}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1"
          />
        )}

        {/* Key moment markers */}
        {keyDots.map((dot, idx) => {
          const dotColor = dot.move ? MOVE_QUALITY_META[dot.move.quality].bg : '#81B64C';
          const isSelected = dot.ply === selectedPly;
          return (
            <circle
              key={dot.move?.ply ?? idx}
              cx={dot.x}
              cy={dot.y}
              r={isSelected ? '4.2' : '2.8'}
              fill={dotColor}
              stroke="#1D1B18"
              strokeWidth="1"
            />
          );
        })}
      </svg>

      {hoveredPoint && hoveredPoint.move && (
        <div className="pointer-events-none absolute top-1 left-2 px-1.5 py-0.5 rounded bg-[#181715]/90 border border-white/10 text-[10px] font-mono font-bold text-[#EEECE6] tabular-nums flex items-center gap-1.5">
          <span>
            {hoveredPoint.move.moveNumber}
            {hoveredPoint.move.color === 'w' ? '.' : '...'} {hoveredPoint.move.san}
          </span>
          <span className="text-[#81B64C]">
            {formatEvalDisplay(hoveredPoint.cp, hoveredPoint.mateIn)}
          </span>
          <span className={MOVE_QUALITY_META[hoveredPoint.move.quality].textColor}>
            {hoveredPoint.move.quality}
          </span>
        </div>
      )}
    </div>
  );
}
