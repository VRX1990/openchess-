import { Check, GraduationCap, X } from 'lucide-react';
import {
  COACH_PROFILES,
  COACH_STRENGTH_LEVELS,
  type CoachPersonaId,
  type CoachStrengthId,
} from '../chess/coach';
import { BotAvatar } from './BotAvatar';

interface CoachPickerModalProps {
  open: boolean;
  coachId: CoachPersonaId;
  strengthId?: CoachStrengthId;
  showStrengthPicker?: boolean;
  confirmLabel?: string;
  onSelectCoach: (id: CoachPersonaId) => void;
  onSelectStrength?: (id: CoachStrengthId) => void;
  onClose: () => void;
  onConfirm?: (coachId: CoachPersonaId, strengthId: CoachStrengthId) => void;
}

export function CoachPickerModal({
  open,
  coachId,
  strengthId = 'club',
  showStrengthPicker = true,
  confirmLabel = 'Select Coach',
  onSelectCoach,
  onSelectStrength,
  onClose,
  onConfirm,
}: CoachPickerModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose Your Coach"
        className="w-full sm:max-w-xl bg-[#262421] border border-white/[0.08] rounded-t-2xl sm:rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="px-4 py-3.5 bg-[#21201D] border-b border-white/[0.06] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <GraduationCap className="w-5 h-5 text-[#81B64C]" />
            <div>
              <h2 className="text-base font-extrabold text-white leading-tight">
                Choose Your Coach
              </h2>
              <p className="text-xs text-[#9E998F]">
                Pick a coaching style & strength for live feedback and analysis
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close coach selector"
            className="w-8 h-8 rounded-lg bg-[#302E2B] hover:bg-[#393734] text-[#C8C4BC] hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {COACH_PROFILES.map((coach) => {
              const selected = coach.id === coachId;
              return (
                <button
                  key={coach.id}
                  type="button"
                  onClick={() => {
                    onSelectCoach(coach.id);
                    if (onSelectStrength && !showStrengthPicker) {
                      onSelectStrength(coach.defaultStrength);
                    }
                  }}
                  className={`p-3 rounded-lg text-left transition-all flex items-start gap-3 cursor-pointer ${
                    selected
                      ? 'bg-[#363B2F] ring-2 ring-[#81B64C]'
                      : 'bg-[#302E2B] hover:bg-[#393734]'
                  }`}
                >
                  <BotAvatar botId={coach.id} size={50} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-extrabold text-white truncate">
                          {coach.name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-[#B8860B] text-[10px] font-extrabold text-white shrink-0">
                          {coach.title}
                        </span>
                      </div>
                      {selected && (
                        <Check className="w-4 h-4 text-[#81B64C] shrink-0" />
                      )}
                    </div>
                    <div
                      className="text-[11px] font-bold mt-0.5"
                      style={{ color: coach.accentColor }}
                    >
                      {coach.specialty}
                    </div>
                    <p className="text-[11px] text-[#ABA69E] leading-snug mt-1">
                      {coach.tagline}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {showStrengthPicker && onSelectStrength && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#9E998F] mb-2">
                Coach Playing Strength
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {COACH_STRENGTH_LEVELS.map((lvl) => {
                  const active = strengthId === lvl.id;
                  return (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => onSelectStrength(lvl.id)}
                      className={`px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#81B64C] text-white'
                          : 'bg-[#302E2B] hover:bg-[#393734] text-[#D8D4CC]'
                      }`}
                    >
                      <div className="text-xs font-extrabold leading-tight truncate">
                        {lvl.label}
                      </div>
                      <div
                        className={`text-[10px] font-mono tabular-nums mt-0.5 ${
                          active ? 'text-white/90' : 'text-[#9E998F]'
                        }`}
                      >
                        {lvl.elo}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 bg-[#21201D] border-t border-white/[0.06] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg bg-[#302E2B] hover:bg-[#393734] text-xs font-bold text-[#C8C4BC] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (onConfirm) {
                onConfirm(coachId, strengthId);
              } else {
                onClose();
              }
            }}
            className="px-4 py-2 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] border-b-[3px] border-[#457524] text-xs font-extrabold text-white cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
