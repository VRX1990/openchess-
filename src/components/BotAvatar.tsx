import { useState } from 'react';
import type { BotId } from '../chess/engine';

interface BotAvatarProps {
  id?: BotId | 'coach';
  botId?: BotId | 'coach';
  size?: number;
  className?: string;
}

const BOT_IMAGE_MAP: Partial<Record<BotId | 'coach', string>> = {
  pip: '/bots/bot_pip_1794589383193.jpg?v=face2',
  noah: '/bots/bot_noah_1794589384681.jpg?v=face2',
  mia: '/bots/bot_mia_1794589385683.jpg?v=face2',
  milo: '/bots/bot_milo_1794589386374.jpg?v=face2',
  leo: '/bots/bot_leo_1794589386087.jpg?v=face2',
  hana: '/bots/bot_hana_1794589386681.jpg?v=face2',
  clara: '/bots/bot_clara_1794589388138.jpg?v=face2',
  omar: '/bots/bot_omar_1794589389715.jpg?v=face2',
  sofia: '/bots/bot_sofia_1794589390608.jpg?v=face2',
  viktor: '/bots/bot_viktor_1794589391862.jpg?v=face2',
  coach: '/bots/bot_viktor_1794589391862.jpg?v=face2',
  dante: '/bots/bot_dante_1794589392410.jpg?v=face2',
  elena: '/bots/bot_elena_1794589395273.jpg?v=face2',
  aurelius: '/bots/bot_aurelius_1794589396689.jpg?v=face2',
  vera: '/bots/bot_vera_1794589395991.jpg?v=face2',
  koren: '/bots/bot_koren_1794589397852.jpg?v=face2',
  nova: '/bots/bot_nova_1794589399592.jpg?v=face2',
  chronos: '/bots/bot_stockfish_1794589400829.jpg?v=face2',
};

function CatGrandmasterAvatar({ className = 'w-full h-full' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-label="Cat 3200 bot avatar">
      <defs>
        <radialGradient id="catBgGrad" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#3E3526" />
          <stop offset="100%" stopColor="#1B1814" />
        </radialGradient>
        <linearGradient id="catFurGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5EFE6" />
          <stop offset="60%" stopColor="#E3D7C5" />
          <stop offset="100%" stopColor="#C4B39B" />
        </linearGradient>
        <radialGradient id="catEyeGlow" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#FFE169" />
          <stop offset="65%" stopColor="#E59A28" />
          <stop offset="100%" stopColor="#8C510A" />
        </radialGradient>
      </defs>

      {/* Dark Grandmaster Arena Backdrop */}
      <rect width="120" height="120" rx="14" fill="url(#catBgGrad)" />

      {/* Subtle Golden Aura Ring */}
      <circle cx="60" cy="64" r="46" fill="#F7C045" opacity="0.08" />

      {/* Pointed Cat Ears */}
      <path d="M22 52 L18 14 L50 32 Z" fill="#4A4035" />
      <path d="M25 46 L23 21 L44 33 Z" fill="#E89998" opacity="0.85" />
      <path d="M98 52 L102 14 L70 32 Z" fill="#4A4035" />
      <path d="M95 46 L97 21 L76 33 Z" fill="#E89998" opacity="0.85" />

      {/* Fluffy Cheeks & Head */}
      <path
        d="M18 68 C14 42 34 26 60 26 C86 26 106 42 102 68 C105 86 88 104 60 104 C32 104 15 86 18 68 Z"
        fill="url(#catFurGrad)"
      />

      {/* Tabby Forehead Patches & Stripes */}
      <path
        d="M18 62 C18 36 36 26 54 27 C46 38 36 52 20 66 Z"
        fill="#4A4035"
        opacity="0.9"
      />
      <path
        d="M102 62 C102 36 84 26 66 27 C74 38 84 52 100 66 Z"
        fill="#4A4035"
        opacity="0.9"
      />
      <path
        d="M55 31 L60 43 L65 31"
        stroke="#4A4035"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Big Expressive Golden-Amber Cat Eyes */}
      <ellipse cx="42" cy="61" rx="12.5" ry="13.5" fill="#181614" />
      <ellipse cx="42" cy="61" rx="10.5" ry="11.5" fill="url(#catEyeGlow)" />
      <ellipse cx="42" cy="61" rx="4.2" ry="9.5" fill="#141210" />
      <circle cx="38.5" cy="56" r="3.2" fill="#FFFFFF" />
      <circle cx="45.5" cy="65" r="1.4" fill="#FFFFFF" opacity="0.85" />

      <ellipse cx="78" cy="61" rx="12.5" ry="13.5" fill="#181614" />
      <ellipse cx="78" cy="61" rx="10.5" ry="11.5" fill="url(#catEyeGlow)" />
      <ellipse cx="78" cy="61" rx="4.2" ry="9.5" fill="#141210" />
      <circle cx="74.5" cy="56" r="3.2" fill="#FFFFFF" />
      <circle cx="81.5" cy="65" r="1.4" fill="#FFFFFF" opacity="0.85" />

      {/* Cute Pink Nose & Smug Cat Whisker Muzzle */}
      <ellipse cx="60" cy="77" rx="16" ry="11" fill="#FFFDF9" />
      <path d="M55 71 L65 71 L60 77 Z" fill="#E57F84" />
      <path
        d="M60 77 C60 82 54 84 50 81 M60 77 C60 82 66 84 70 81"
        stroke="#3A322B"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />

      {/* Whiskers */}
      <g stroke="#FAF6F0" strokeWidth="1.8" strokeLinecap="round" opacity="0.9">
        <line x1="10" y1="73" x2="36" y2="76" />
        <line x1="8" y1="81" x2="35" y2="80" />
        <line x1="14" y1="88" x2="37" y2="84" />
        <line x1="110" y1="73" x2="84" y2="76" />
        <line x1="112" y1="81" x2="85" y2="80" />
        <line x1="106" y1="88" x2="83" y2="84" />
      </g>

      {/* Tiny Grandmaster Gold Crown on Cat's Head */}
      <path
        d="M46 26 L50 14 L60 21 L70 14 L74 26 Z"
        fill="#F7C045"
        stroke="#B8860B"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function BotAvatar({
  id,
  botId,
  size,
  className = 'w-full h-full',
}: BotAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const resolvedId: BotId | 'coach' = id ?? botId ?? 'viktor';

  const sizedWrapStyle =
    typeof size === 'number'
      ? { width: size, height: size }
      : undefined;

  const content = (() => {
    if (resolvedId === 'apex') {
      return <CatGrandmasterAvatar className={size ? 'w-full h-full' : className} />;
    }

    const photoUrl = BOT_IMAGE_MAP[resolvedId];
    if (photoUrl && !imgFailed) {
      return (
        <img
          src={photoUrl}
          alt={`${resolvedId} avatar`}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className={`${size ? 'w-full h-full' : className} object-cover select-none`}
        />
      );
    }

    return <CatGrandmasterAvatar className={size ? 'w-full h-full' : className} />;
  })();

  if (typeof size === 'number') {
    return (
      <div
        className={`rounded-lg overflow-hidden bg-[#1A1917] shrink-0 ${className === 'w-full h-full' ? '' : className}`}
        style={sizedWrapStyle}
      >
        {content}
      </div>
    );
  }

  return content;
}
