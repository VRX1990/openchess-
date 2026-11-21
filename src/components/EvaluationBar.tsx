import { decodeMateDistance, formatEvalDisplay } from '../chess/reviewAnalysis';

interface EvaluationBarProps {
  evalCp: number;
  mateIn?: number | null;
  orientation?: 'w' | 'b';
}

export function EvaluationBar({ evalCp, mateIn = null, orientation = 'w' }: EvaluationBarProps) {
  const effectiveMate = mateIn ?? decodeMateDistance(evalCp);
  const isMate = effectiveMate !== null || Math.abs(evalCp) >= 90000;
  const whitePct = isMate
    ? evalCp >= 0
      ? 98
      : 2
    : Math.max(4, Math.min(96, 50 + 46 * Math.tanh(evalCp / 420)));

  const label = isMate
    ? formatEvalDisplay(evalCp, effectiveMate)
    : `${evalCp > 0 ? '+' : ''}${(evalCp / 100).toFixed(1)}`;

  const whiteAdvantage = evalCp >= 0;

  return (
    <div
      className="relative w-4 sm:w-[26px] self-stretch min-h-[200px] rounded-[3px] overflow-hidden bg-[#403D39] select-none shrink-0"
      aria-label={`Position evaluation ${label}`}
      data-testid="eval-bar"
    >
      <div
        className={`absolute left-0 right-0 bg-[#FFFFFF] transition-[height] duration-450 ease-out ${
          orientation === 'w' ? 'bottom-0' : 'top-0'
        }`}
        style={{ height: `${whitePct}%` }}
      />
      <span
        className={`hidden sm:block absolute left-0 right-0 z-10 text-center font-sans text-[10px] tracking-tight font-bold tabular-nums pointer-events-none ${
          orientation === 'w'
            ? whiteAdvantage
              ? 'bottom-1 text-[#262421]'
              : 'top-1 text-[#FFFFFF]'
            : whiteAdvantage
              ? 'top-1 text-[#262421]'
              : 'bottom-1 text-[#FFFFFF]'
        }`}
      >
        {label.replace(/^\+/, '')}
      </span>
    </div>
  );
}
