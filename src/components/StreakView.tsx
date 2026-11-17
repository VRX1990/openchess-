import { useState } from 'react';
import { ArrowLeft, Check, Share2 } from 'lucide-react';
import { buildStreakWeekStrip, type DailyStreakState } from '../chess/analytics';

interface StreakViewProps {
  streak: DailyStreakState;
  onBack: () => void;
}

export function StreakView({ streak, onBack }: StreakViewProps) {
  const [sharedToast, setSharedToast] = useState(false);
  const activeDays = Math.max(1, streak.days || 1);
  const weekCells = buildStreakWeekStrip(activeDays, streak.lastOpenDate || undefined);

  const handleShare = async () => {
    const shareText = `I'm on a ${activeDays} Day Streak on OpenChess!`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${activeDays} Day Streak · OpenChess`,
          text: shareText,
        });
        return;
      }
    } catch {
      // fall through to clipboard copy
    }
    try {
      await navigator.clipboard?.writeText(shareText);
      setSharedToast(true);
      window.setTimeout(() => setSharedToast(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className="min-h-[calc(100dvh-2rem)] bg-[#2B2926] flex flex-col justify-between pb-10 select-none"
      data-testid="streak-view"
    >
      {/* Top Bar: Back Arrow | Green Pawn + OpenChess | Share */}
      <header className="relative z-20 h-14 px-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="w-11 h-11 rounded-xl flex items-center justify-center text-[#9E998F] hover:text-white cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-1.5">
          {/* Classic 3D Green Pawn Mark */}
          <svg viewBox="0 0 28 32" className="w-6 h-7 shrink-0" aria-hidden="true">
            <ellipse cx="14" cy="29" rx="10" ry="2.2" fill="#3D6820" />
            <path
              d="M6 27c.5-3.4 2.8-5.6 5.4-7l-1.4-6.4c2-.8 6-.8 8 0L16.6 20c2.6 1.4 4.9 3.6 5.4 7H6z"
              fill="#81B64C"
            />
            <rect x="8.5" y="12.5" width="11" height="2.4" rx="1.2" fill="#81B64C" />
            <circle cx="14" cy="7.5" r="4.8" fill="#81B64C" />
            <circle cx="12.4" cy="6.2" r="1.4" fill="#A9DC76" opacity="0.65" />
            <rect x="5" y="26.2" width="18" height="3" rx="1.5" fill="#81B64C" />
          </svg>
          <span className="text-xl font-extrabold tracking-tight text-white font-display">
            Open<span className="font-normal text-[#DEDAD2]">Chess</span>
          </span>
        </div>

        <button
          type="button"
          onClick={() => void handleShare()}
          aria-label="Share streak"
          className="relative w-11 h-11 rounded-xl flex items-center justify-center text-[#9E998F] hover:text-white cursor-pointer transition-colors"
        >
          <Share2 className="w-5 h-5" />
          {sharedToast && (
            <span className="absolute -bottom-6 right-1 px-2 py-0.5 rounded bg-[#393734] text-[10px] font-bold text-[#81B64C] whitespace-nowrap shadow">
              Copied!
            </span>
          )}
        </button>
      </header>

      {/* Center Hero: Layered Golden Flame with White Pawn + "{N} Day Streak" + 5-Day Check Strip */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-6">
        <div className="w-56 h-64 sm:w-60 sm:h-68 flex items-center justify-center">
          <svg
            viewBox="0 0 240 270"
            className="w-full h-full drop-shadow-[0_14px_28px_rgba(0,0,0,0.35)]"
            aria-hidden="true"
          >
            {/* Outer Golden Amber Flame matching reference screenshot */}
            <path
              d="M113 14 C105 56 56 84 40 134 C22 186 52 242 120 250 C186 242 214 188 196 136 C188 110 172 90 164 68 C156 82 148 92 142 90 C152 58 134 30 113 14 Z"
              fill="#EAAC23"
            />
            {/* Middle Warm Yellow Flame */}
            <path
              d="M120 56 C110 88 72 110 58 150 C44 190 68 240 120 249 C172 240 194 192 180 150 C172 126 158 112 152 96 C144 108 136 112 130 108 C140 84 130 66 120 56 Z"
              fill="#F5C93B"
            />
            {/* Inner Bright Lemon Flame Core */}
            <path
              d="M118 92 C102 118 80 138 72 170 C64 204 84 240 120 249 C156 240 176 204 168 170 C160 138 134 118 118 92 Z"
              fill="#FDE16D"
            />

            {/* Crisp White & Light-Silver 3D Pawn Silhouette Inside Flame */}
            <g>
              {/* Pawn Head */}
              <circle cx="120" cy="148" r="31" fill="#EDEDED" />
              <path
                d="M120 117 A31 31 0 0 1 120 179 A24 31 0 0 0 120 117 Z"
                fill="#D4D4D4"
              />
              {/* Pawn Collar */}
              <path
                d="M90 178 L150 178 L158 190 Q159 197 151 197 L89 197 Q81 197 82 190 Z"
                fill="#E6E6E6"
              />
              <path
                d="M120 178 L150 178 L158 190 Q159 197 151 197 L120 197 Z"
                fill="#CCCCCC"
              />
              {/* Pawn Base / Body */}
              <path
                d="M99 197 L141 197 L153 246 Q120 253 87 246 Z"
                fill="#EDEDED"
              />
              <path
                d="M120 197 L141 197 L153 246 Q137 250 120 250 Z"
                fill="#CCCCCC"
              />
            </g>
          </svg>
        </div>

        <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-display">
          {activeDays} Day Streak
        </h1>

        {/* 5-Day Weekday Strip */}
        <div className="mt-6 flex items-center gap-3 sm:gap-3.5">
          {weekCells.map((cell) => (
            <div key={cell.dateKey} className="flex flex-col items-center gap-2">
              <span className="text-xs sm:text-sm font-extrabold text-[#DEDAD2]">
                {cell.dayLetter}
              </span>
              {cell.checked ? (
                <div
                  data-testid={`streak-day-${cell.dateKey}-checked`}
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#6FA33B] border-2 border-[#85BC4C] flex items-center justify-center shadow-[0_3px_0_#486E23]"
                >
                  <Check className="w-6 h-6 text-white" strokeWidth={3.5} />
                </div>
              ) : (
                <div
                  data-testid={`streak-day-${cell.dateKey}-empty`}
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#2B2926] border-2 border-[#524F4A]"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="h-4" />
    </div>
  );
}
