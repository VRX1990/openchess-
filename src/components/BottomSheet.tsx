import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  desktopModal?: boolean;
  children: ReactNode;
}

export function BottomSheet({
  open,
  title,
  onClose,
  desktopModal = false,
  children,
}: BottomSheetProps) {
  if (!open) return null;

  return (
    <div
      className={`animate-fade-in fixed inset-0 z-50 ${
        desktopModal ? 'flex lg:items-center lg:justify-center lg:p-4' : 'lg:hidden flex'
      } flex-col justify-end bg-black/65`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close panel backdrop"
        onClick={onClose}
        className={`${desktopModal ? 'flex-1 lg:fixed lg:inset-0' : 'flex-1'} w-full cursor-default`}
      />
      <div
        className={`animate-sheet-up relative z-10 bg-[#21201D] border-t border-white/15 rounded-t-2xl h-[78dvh] max-h-[85dvh] flex flex-col shadow-2xl overflow-hidden ${
          desktopModal
            ? 'lg:w-full lg:max-w-lg lg:h-auto lg:max-h-[85dvh] lg:rounded-2xl lg:border'
            : ''
        }`}
      >
        <div className="pt-2 pb-2 px-4 border-b border-white/10 shrink-0">
          <div className={`w-10 h-1 rounded-full bg-white/20 mx-auto mb-2 ${desktopModal ? 'lg:hidden' : ''}`} />
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#F2F0EC] font-display">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${title}`}
              className="min-w-[44px] min-h-[40px] flex items-center justify-end text-[#9E998F] hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className={`flex-1 min-h-0 flex flex-col ${desktopModal ? 'overflow-y-auto' : 'overflow-hidden'}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
