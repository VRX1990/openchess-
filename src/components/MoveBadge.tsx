import type { MoveQuality } from '../chess/engine';

interface MoveBadgeProps {
  quality: MoveQuality;
  size?: 'board' | 'sm' | 'md' | 'lg';
  className?: string;
}

export const MOVE_QUALITY_META: Record<
  MoveQuality,
  {
    bg: string;
    fg: string;
    label: string;
    symbol: string;
    textColor: string;
  }
> = {
  Brilliant: {
    bg: '#26C2A3',
    fg: '#FFFFFF',
    label: 'Brilliant',
    symbol: '!!',
    textColor: 'text-[#26C2A3]',
  },
  Great: {
    bg: '#749BBF',
    fg: '#FFFFFF',
    label: 'Great',
    symbol: '!',
    textColor: 'text-[#749BBF]',
  },
  Best: {
    bg: '#81B64C',
    fg: '#FFFFFF',
    label: 'Best',
    symbol: '★',
    textColor: 'text-[#81B64C]',
  },
  Excellent: {
    bg: '#96BC4B',
    fg: '#FFFFFF',
    label: 'Excellent',
    symbol: '👍',
    textColor: 'text-[#96BC4B]',
  },
  Good: {
    bg: '#819E6F',
    fg: '#FFFFFF',
    label: 'Good',
    symbol: '✓',
    textColor: 'text-[#8DA87B]',
  },
  Book: {
    bg: '#C9A77C',
    fg: '#FFFFFF',
    label: 'Book',
    symbol: '📖',
    textColor: 'text-[#C9A77C]',
  },
  Inaccuracy: {
    bg: '#F7C631',
    fg: '#FFFFFF',
    label: 'Inaccuracy',
    symbol: '?!',
    textColor: 'text-[#F7C631]',
  },
  Mistake: {
    bg: '#FFA459',
    fg: '#FFFFFF',
    label: 'Mistake',
    symbol: '?',
    textColor: 'text-[#FFA459]',
  },
  Miss: {
    bg: '#FF7769',
    fg: '#FFFFFF',
    label: 'Miss',
    symbol: '×',
    textColor: 'text-[#FF7769]',
  },
  Blunder: {
    bg: '#FA412D',
    fg: '#FFFFFF',
    label: 'Blunder',
    symbol: '??',
    textColor: 'text-[#FA412D]',
  },
};

export function MoveBadge({ quality, size = 'sm', className = '' }: MoveBadgeProps) {
  const meta = MOVE_QUALITY_META[quality];

  const sizeClass =
    size === 'board'
      ? 'w-[36%] h-[36%] min-w-[17px] min-h-[17px] max-w-[26px] max-h-[26px] shadow-[0_3px_10px_rgba(0,0,0,0.45)]'
      : size === 'lg'
        ? 'w-[26px] h-[26px] shadow-xs'
        : size === 'md'
          ? 'w-6 h-6 ring-1 ring-black/25 shadow-sm'
          : 'w-[18px] h-[18px] ring-1 ring-black/20';

  return (
    <span
      data-testid={size === 'board' ? 'board-move-badge' : undefined}
      data-quality={quality}
      title={meta.label}
      aria-label={`${meta.label} move`}
      style={{ backgroundColor: meta.bg, color: meta.fg }}
      className={`inline-flex items-center justify-center rounded-full shrink-0 select-none ${sizeClass} ${className}`}
    >
      {quality === 'Best' && (
        <svg viewBox="0 0 24 24" className="w-[64%] h-[64%]" fill="currentColor" aria-hidden="true">
          <path d="M12 2.6l2.7 5.6 6.2.9-4.5 4.4 1.1 6.2L12 16.8l-5.5 2.9 1.1-6.2L3.1 9.1l6.2-.9L12 2.6z" />
        </svg>
      )}
      {quality === 'Excellent' && (
        <svg viewBox="0 0 24 24" className="w-[64%] h-[64%]" fill="currentColor" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h4v11zm2-11l3.6-7.2a1.5 1.5 0 0 1 2.7.9V9h3.1a2 2 0 0 1 1.9 2.5l-1.5 7A2 2 0 0 1 18.8 20H11V10z" />
        </svg>
      )}
      {quality === 'Good' && (
        <svg
          viewBox="0 0 24 24"
          className="w-[66%] h-[66%]"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
      {quality === 'Book' && (
        <svg viewBox="0 0 24 24" className="w-[62%] h-[62%]" fill="currentColor" aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5zm16 0A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5V5.5z" />
        </svg>
      )}
      {quality === 'Miss' && (
        <svg
          viewBox="0 0 24 24"
          className="w-[62%] h-[62%]"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.4"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5" />
        </svg>
      )}
      {(quality === 'Blunder' ||
        quality === 'Mistake' ||
        quality === 'Inaccuracy' ||
        quality === 'Brilliant' ||
        quality === 'Great') && (
        <svg viewBox="0 0 24 24" className="w-[78%] h-[78%]" aria-hidden="true">
          <text
            x="12"
            y="16.5"
            textAnchor="middle"
            fill="currentColor"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontWeight="900"
            fontSize={
              quality === 'Blunder' || quality === 'Inaccuracy' || quality === 'Brilliant'
                ? '13.5'
                : '16'
            }
            letterSpacing="-0.6"
          >
            {meta.symbol}
          </text>
        </svg>
      )}
    </span>
  );
}
