import { Trophy, RotateCcw, SearchCheck } from 'lucide-react';

interface GameOverModalProps {
  title: string;
  subtitle: string;
  playerWon: boolean | null;
  moveCount: number;
  playerLabel: string;
  opponentLabel: string;
  onReview: () => void;
  onPlayAgain: () => void;
  onClose: () => void;
}

export function GameOverModal({
  title,
  subtitle,
  playerWon,
  moveCount,
  playerLabel,
  opponentLabel,
  onReview,
  onPlayAgain,
  onClose,
}: GameOverModalProps) {
  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Game result summary"
    >
      <div className="animate-modal-pop w-full max-w-sm bg-[#262421] border border-white/15 rounded-lg shadow-2xl overflow-hidden">
        <div
          className={`px-5 py-4 text-center border-b border-white/10 ${
            playerWon === true
              ? 'bg-[#81B64C]/20'
              : playerWon === false
                ? 'bg-[#C9654B]/18'
                : 'bg-[#312E2A]'
          }`}
        >
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-black/25 mb-2">
            <Trophy
              className={`w-5 h-5 ${
                playerWon === true
                  ? 'text-[#81B64C]'
                  : playerWon === false
                    ? 'text-[#E06C5A]'
                    : 'text-[#E59A28]'
              }`}
            />
          </div>
          <h2 className="text-xl font-bold text-[#F2F0EC] font-display">{title}</h2>
          <p className="text-xs text-[#C8C4BC] mt-0.5">{subtitle}</p>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center bg-[#1E1C19] rounded-md p-3 border border-white/8">
            <div>
              <div className="text-[11px] text-[#9E998F]">White</div>
              <div className="text-xs font-semibold text-[#F2F0EC] truncate mt-0.5">
                {playerLabel}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#9E998F]">Moves</div>
              <div className="text-sm font-mono font-bold text-[#F2F0EC] tabular-nums mt-0.5">
                {moveCount}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#9E998F]">Black</div>
              <div className="text-xs font-semibold text-[#F2F0EC] truncate mt-0.5">
                {opponentLabel}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onReview}
              className="w-full py-2.5 px-4 rounded bg-[#81B64C] hover:bg-[#90C55B] text-[#191815] font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <SearchCheck className="w-4 h-4" />
              <span>Game Review &amp; AI Debrief</span>
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onPlayAgain}
                className="py-2 px-3 rounded bg-[#35322D] hover:bg-[#413D37] text-[#F2F0EC] font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Play Again</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="py-2 px-3 rounded bg-[#1E1C19] hover:bg-[#2E2B27] border border-white/10 text-[#C8C4BC] font-medium text-xs transition-colors cursor-pointer"
              >
                Inspect Board
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
