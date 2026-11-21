import { useId, type SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

/** Iconic 3D-shaded green Chess Pawn brand mark (standing free beside OpenChess wordmark) */
export function BrandPawnIcon({ className = 'w-7 h-7', ...props }: IconProps) {
  const gradId = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" {...props}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#95CC56" />
          <stop offset="52%" stopColor="#81B64C" />
          <stop offset="52%" stopColor="#699B39" />
          <stop offset="100%" stopColor="#56832D" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="8.2" r="4.8" fill={`url(#${gradId})`} />
      <rect x="10.2" y="12.6" width="11.6" height="2.8" rx="1.4" fill={`url(#${gradId})`} />
      <path
        d="M12.4 15.2h7.2l1.8 7.5c2.2 1 3.6 2.5 3.8 4.8H6.8c.2-2.3 1.6-3.8 3.8-4.8l1.8-7.5z"
        fill={`url(#${gradId})`}
      />
      <rect x="6" y="26.4" width="20" height="3.2" rx="1.6" fill="#4B7426" />
    </svg>
  );
}

/** Multi-color illustrated Hand holding a white chess pawn (Play) */
export function NavPlayIcon({ className = 'w-6 h-6', ...props }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" {...props}>
      {/* Hand / wrist silhouette */}
      <path
        d="M18.5 4.2c1.8-.3 4 .8 5.2 2.4l3 3.8c.9 1.2.6 2.9-.6 3.7l-3.8 2.6-2.5 4.3c-.6 1-2 1.2-2.8.4l-1.5-1.5 2.4-4.2-2.6-2.2 3.2-9.3z"
        fill="#E6B89C"
      />
      <path
        d="M21 6.5l4.2 5c.6.8.4 1.9-.4 2.5l-3.4 2.2-1.8 3.1-1.3-.8 2.1-3.8 2.8-1.8-3.4-4.4 1.2-2z"
        fill="#CC9678"
      />
      {/* White pawn held upright */}
      <circle cx="12.5" cy="12" r="3.4" fill="#FFFFFF" stroke="#262421" strokeWidth="1.2" />
      <rect x="8.6" y="15.2" width="7.8" height="2" rx="1" fill="#F0EDE6" stroke="#262421" strokeWidth="1.1" />
      <path
        d="M10.2 17.2h4.6l1.3 5.5c1.5.7 2.4 1.8 2.5 3.4H6.4c.1-1.6 1-2.7 2.5-3.4l1.3-5.5z"
        fill="#FFFFFF"
        stroke="#262421"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <rect x="5.8" y="25.6" width="13.4" height="2.4" rx="1.2" fill="#D5D2CB" stroke="#262421" strokeWidth="1.1" />
    </svg>
  );
}

/** 3D Orange Jigsaw Puzzle Piece (Puzzles) */
export function NavPuzzlesIcon({ className = 'w-6 h-6', ...props }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" {...props}>
      <path
        d="M7.5 11.5h4.2a2.6 2.6 0 1 1 5 0h4.8c1.1 0 2 .9 2 2v4.3a2.6 2.6 0 1 1 0 5v3.7c0 1.1-.9 2-2 2h-4.3a2.5 2.5 0 1 0-4.8 0H7.5c-1.1 0-2-.9-2-2v-4.2a2.5 2.5 0 1 0 0-4.8v-4c0-1.1.9-2 2-2z"
        fill="#C95E12"
        transform="translate(0 1.8)"
      />
      <path
        d="M7.5 10h4.2a2.6 2.6 0 1 1 5 0h4.8c1.1 0 2 .9 2 2v4.3a2.6 2.6 0 1 1 0 5V25c0 1.1-.9 2-2 2h-4.3a2.5 2.5 0 1 0-4.8 0H7.5c-1.1 0-2-.9-2-2v-4.2a2.5 2.5 0 1 0 0-4.8v-4c0-1.1.9-2 2-2z"
        fill="#F28C28"
      />
      <path
        d="M8.5 11.5h3.8a2.3 2.3 0 0 1 4.2 0h4.2c.6 0 1 .4 1 1v2.2H7.5v-2.2c0-.6.4-1 1-1z"
        fill="#FFA84C"
        opacity="0.55"
      />
    </svg>
  );
}

/** Numbered Orange Jigsaw Puzzle Badge (Home Play to Solve) */
export function PuzzleNumberBadgeIcon({
  num = 1,
  className = 'w-8 h-8',
  ...props
}: IconProps & { num?: number }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true" {...props}>
      <path
        d="M9 12h5a3 3 0 1 1 6 0h5c1.2 0 2.2 1 2.2 2.2v4.8a3 3 0 1 1 0 6V29c0 1.2-1 2.2-2.2 2.2h-4.8a2.8 2.8 0 1 0-5.4 0H9c-1.2 0-2.2-1-2.2-2.2v-4.8a2.8 2.8 0 1 0 0-5.4v-4.6C6.8 13 7.8 12 9 12z"
        fill="#9B5624"
        transform="translate(0 1.6)"
      />
      <path
        d="M9 10.5h5a3 3 0 1 1 6 0h5c1.2 0 2.2 1 2.2 2.2v4.8a3 3 0 1 1 0 6v4c0 1.2-1 2.2-2.2 2.2h-4.8a2.8 2.8 0 1 0-5.4 0H9c-1.2 0-2.2-1-2.2-2.2v-4.8a2.8 2.8 0 1 0 0-5.4v-4.6c0-1.2 1-2.2 2.2-2.2z"
        fill="#C97E3D"
      />
      <text
        x="17"
        y="24"
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize="13"
        fontWeight="900"
        fontFamily="system-ui, sans-serif"
      >
        {num}
      </text>
    </svg>
  );
}

/** 3D Blue Graduation Cap (Learn) */
export function NavLearnIcon({ className = 'w-6 h-6', ...props }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" {...props}>
      <path d="M7.5 16.2v6.2c0 2 3.8 3.8 8.5 3.8s8.5-1.8 8.5-3.8v-6.2L16 20.5l-8.5-4.3z" fill="#1C7CC4" />
      <path d="M16 6.5L3.2 13 16 19.5 28.8 13 16 6.5z" fill="#46B3F4" />
      <path d="M16 6.5L28.8 13 16 19.5V6.5z" fill="#2A98E0" />
      <path d="M26.5 14v7.5" stroke="#F7C045" strokeWidth="2" strokeLinecap="round" />
      <circle cx="26.5" cy="22.5" r="2" fill="#F7C045" />
    </svg>
  );
}

/** Blue Checkered Magnifying Glass (Game Review / Analysis) */
export function NavReviewIcon({ className = 'w-6 h-6', ...props }: IconProps) {
  const clipId = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" {...props}>
      <line x1="21" y1="21" x2="28" y2="28" stroke="#8C8984" strokeWidth="4.2" strokeLinecap="round" />
      <circle cx="14" cy="14" r="9.5" fill="#E6E4E0" />
      <clipPath id={clipId}>
        <circle cx="14" cy="14" r="7.2" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect x="6" y="6" width="8" height="8" fill="#BFE2F8" />
        <rect x="14" y="6" width="8" height="8" fill="#4D89BE" />
        <rect x="6" y="14" width="8" height="8" fill="#4D89BE" />
        <rect x="14" y="14" width="8" height="8" fill="#BFE2F8" />
      </g>
      <circle cx="14" cy="14" r="7.2" fill="none" stroke="#312E2B" strokeWidth="1" opacity="0.25" />
    </svg>
  );
}

/** Blue-Lensed Binoculars (Watch) */
export function NavWatchIcon({ className = 'w-6 h-6', ...props }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" {...props}>
      <rect x="12.5" y="12.5" width="7" height="4.5" rx="1.5" fill="#5A636E" />
      <path d="M5.5 18.5l2.8-9.5a2.4 2.4 0 0 1 2.3-1.7h2.2l1.2 12.2H5.5z" fill="#7D8792" />
      <path d="M26.5 18.5l-2.8-9.5a2.4 2.4 0 0 0-2.3-1.7h-2.2L18 19.5h8.5z" fill="#636C76" />
      <circle cx="9.8" cy="20.5" r="5.5" fill="#414850" />
      <circle cx="22.2" cy="20.5" r="5.5" fill="#414850" />
      <circle cx="9.8" cy="20.5" r="3.6" fill="#74C0F2" />
      <circle cx="22.2" cy="20.5" r="3.6" fill="#74C0F2" />
      <circle cx="8.6" cy="19.3" r="1.2" fill="#FFFFFF" opacity="0.85" />
      <circle cx="21" cy="19.3" r="1.2" fill="#FFFFFF" opacity="0.85" />
    </svg>
  );
}

/** Duo Community / Friends Icon */
export function NavFriendsIcon({ className = 'w-6 h-6', ...props }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" {...props}>
      <circle cx="21.5" cy="11.5" r="4.2" fill="#D59E6E" />
      <path d="M15.5 25c.5-4.4 2.8-7 6.5-7 3.5 0 5.8 2.6 6.2 7H15.5z" fill="#E59A28" />
      <circle cx="11.5" cy="10.8" r="4.6" fill="#F0C49E" />
      <path d="M3.8 25.5c.6-5 3.3-7.8 7.7-7.8 4.4 0 7.1 2.8 7.7 7.8H3.8z" fill="#4A9AE2" />
    </svg>
  );
}

/** Cute Smiling Bot Computer Monitor (Play Bots) */
export function NavBotsIcon({ className = 'w-6 h-6', ...props }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" {...props}>
      <rect x="4" y="10" width="3" height="6" rx="1.5" fill="#6F869B" />
      <rect x="25" y="10" width="3" height="6" rx="1.5" fill="#6F869B" />
      <rect x="6.5" y="5.5" width="19" height="15.5" rx="3" fill="#BBD9F0" />
      <rect x="9" y="8" width="14" height="10.5" rx="1.8" fill="#E8F4FC" />
      <circle cx="13" cy="12.2" r="1.4" fill="#2A445C" />
      <circle cx="19" cy="12.2" r="1.4" fill="#2A445C" />
      <path d="M12.5 15.2c1.1 1.3 5.9 1.3 7 0" stroke="#2A445C" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <rect x="14" y="21" width="4" height="3.2" fill="#7D95AA" />
      <rect x="10" y="23.8" width="12" height="2.6" rx="1.3" fill="#9BB3C7" />
    </svg>
  );
}

/** Gold Ribbon Medal (Tournaments / Leaderboard) */
export function GoldMedalIcon({ className = 'w-6 h-6', ...props }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" {...props}>
      <path d="M9.5 4h4.5l2.5 9h-4.5L9.5 4z" fill="#65A338" />
      <path d="M22.5 4H18l-2.5 9H20l2.5-9z" fill="#81B64C" />
      <circle cx="16" cy="20" r="8.2" fill="#E6A117" />
      <circle cx="16" cy="19.5" r="7.2" fill="#F8C83E" />
      <circle cx="16" cy="19.5" r="5" fill="#E5A21B" opacity="0.55" />
      <path d="M16 15.5l1.2 2.5 2.7.4-2 1.9.5 2.7L16 21.7 13.6 23l.5-2.7-2-1.9 2.7-.4L16 15.5z" fill="#FFF3B8" />
    </svg>
  );
}

/** Warm Handshake Icon (Play a Friend) */
export function HandshakeIllustratedIcon({ className = 'w-6 h-6', ...props }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" {...props}>
      <path
        d="M3.5 13.5l5-4.5 5.8 3.2 4.4-3.2 5.2 4.5-3 5.5-5.2 4.2-6.4-2.5-5.8-7.2z"
        fill="#D99B66"
      />
      <path
        d="M28.5 13.5l-5-4.5-5.5 3.4-2.8-1.8-3.8 2.8 7.5 6.8 6.6-1.2 3-5.5z"
        fill="#B87A4B"
      />
      <path
        d="M11 19l4.5 3.5c1 .7 2.2.4 2.8-.5l3.5-4.2"
        stroke="#7D4C29"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** Mini 2x2 Board + Silver Gear (Custom Challenge) */
export function CustomChallengeIcon({ className = 'w-6 h-6', ...props }: IconProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" {...props}>
      <rect x="4" y="4" width="18" height="18" rx="2.5" fill="#D5A678" />
      <rect x="4" y="4" width="9" height="9" rx="1.5" fill="#F2DEC1" />
      <rect x="13" y="13" width="9" height="9" rx="1.5" fill="#F2DEC1" />
      <rect x="13" y="4" width="9" height="9" fill="#9E6E46" />
      <rect x="4" y="13" width="9" height="9" fill="#9E6E46" />
      <g transform="translate(13 13)">
        <circle cx="8" cy="8" r="6.2" fill="#D8D6D1" stroke="#302E2B" strokeWidth="1.2" />
        <circle cx="8" cy="8" r="2.6" fill="#524F4A" />
      </g>
    </svg>
  );
}

/** Crisp Green Stopwatch (Rapid 10 min) */
export function RapidStopwatchIcon({ className = 'w-5 h-5', ...props }: IconProps) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true" {...props}>
      <rect x="11" y="2.2" width="6" height="2.4" rx="1.2" fill="#81B64C" />
      <rect x="13" y="4.2" width="2" height="2.4" fill="#81B64C" />
      <circle cx="14" cy="16" r="9.8" fill="#81B64C" />
      <circle cx="14" cy="16" r="7.2" fill="#262421" />
      <path d="M14 16v-4.8" stroke="#81B64C" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M14 16l3.4 2" stroke="#81B64C" strokeWidth="2" strokeLinecap="round" />
      <circle cx="14" cy="16" r="1.4" fill="#FFFFFF" />
    </svg>
  );
}

/** Sharp Gold Lightning (Blitz) */
export function BlitzBoltIcon({ className = 'w-5 h-5', ...props }: IconProps) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true" {...props}>
      <path d="M16.2 2.5L6.5 15.2h6.8l-1.8 10.3L21.5 12.8h-6.8l1.5-10.3z" fill="#F7C045" />
    </svg>
  );
}

/** Sharp Amber Bullet (Bullet) */
export function BulletIcon({ className = 'w-5 h-5', ...props }: IconProps) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true" {...props}>
      <path d="M5 17.5h11.5c4 0 7-1.6 7-3.5s-3-3.5-7-3.5H5v7z" fill="#E59A28" />
      <rect x="3.5" y="10.5" width="3" height="7" rx="1" fill="#C97C16" />
    </svg>
  );
}
