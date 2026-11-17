interface EvaluationBarProps {
  evalCp: number;
  orientation?: 'w' | 'b';
}

export function EvaluationBar({ evalCp, orientation = 'w' }: EvaluationBarProps) {
  const isMate = Math.abs(evalCp) >= 90000;
  const whitePct = isMate
    ? evalCp > 0
      ? 98
      : 2
    : Math.max(4, Math.min(96, 50 + 46 * Math.tanh(evalCp / 420)));

  const label = isMate
    ? evalCp > 0
      ? 'M'
      : '-M'
    : `${evalCp > 0 ? '+' : ''}${(evalCp / 100).toFixed(1)}`;

  const whiteAdvantage = evalCp >= 0;

  return (
    <div
      className="relative w-4 sm:w-6 self-stretch min-h-[200px] rounded-sm overflow-hidden bg-[#1D1B18] border border-white/10 select-none shrink-0"
      aria-label={`Position evaluation ${label}`}
      data-testid="eval-bar"
    >
      <div
        className={`absolute left-0 right-0 bg-[#EEEED2] transition-[height] duration-500 ease-out ${
          orientation === 'w' ? 'bottom-0' : 'top-0'
        }`}
        style={{ height: `${whitePct}%` }}
      />
      <span
        className={`hidden sm:block absolute left-0 right-0 z-10 text-center font-mono text-[9px] tracking-tighter font-bold tabular-nums pointer-events-none ${
          orientation === 'w'
            ? whiteAdvantage
              ? 'bottom-1.5 text-[#262421]'
              : 'top-1.5 text-[#EEEED2]'
            : whiteAdvantage
              ? 'top-1.5 text-[#262421]'
              : 'bottom-1.5 text-[#EEEED2]'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
