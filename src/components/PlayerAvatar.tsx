import { useEffect, useRef, useState } from 'react';
import { Camera, Check, ImagePlus, Upload, X } from 'lucide-react';
import {
  AVATAR_PRESETS,
  findAvatarPreset,
  isCustomImageAvatar,
  loadUserAvatar,
  resolveKnownBotOrCoachId,
  saveUserAvatar,
} from '../chess/avatars';
import type { BotId } from '../chess/engine';
import type { CoachPersonaId } from '../chess/coach';
import { BotAvatar } from './BotAvatar';
import { ChessPiece } from './ChessPiece';

export interface PlayerAvatarProps {
  username?: string | null;
  avatarValue?: string | null;
  avatarUrl?: string | null;
  botId?: BotId | CoachPersonaId | null;
  isCurrentUser?: boolean;
  size?: number | 'full';
  rounded?: string;
  className?: string;
}

/**
 * Authentic Chess.com-style Default Player Pawn Silhouette.
 * Displayed whenever a human player has not set their own custom photo.
 */
function DefaultPawnAvatar({ title }: { title?: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      className="w-full h-full block"
      role="img"
      aria-label={title || 'Default player avatar'}
    >
      <rect width="80" height="80" fill="#DFDDD8" />
      {/* Base shadow */}
      <ellipse cx="40" cy="67.5" rx="22" ry="3.2" fill="#C4C1BA" />
      {/* Pawn Body (Base + Stem + Collar + Head) */}
      <path
        d="M21 65.5 C21 60.5 26 57.5 31 55.5 C32.5 50 34 43 34.5 37.5 L30.5 37.5 C28.8 37.5 27.5 36.2 27.5 34.5 C27.5 32.8 28.8 31.5 30.8 31.5 L49.2 31.5 C51.2 31.5 52.5 32.8 52.5 34.5 C52.5 36.2 51.2 37.5 49.5 37.5 L45.5 37.5 C46 43 47.5 50 49 55.5 C54 57.5 59 60.5 59 65.5 Z"
        fill="#9E9B95"
      />
      {/* Left 3D highlight on stem & base */}
      <path
        d="M23.5 65.5 C23.5 61.2 27.5 58.5 32.2 56.5 C33.8 50.8 35.2 43.5 35.8 37.5 L31.5 37.5 C30 37.5 29 36.5 29 34.8 C29 33.2 30 32.2 31.5 32.2 L39.5 32.2 L39.5 65.5 Z"
        fill="#B7B4AE"
      />
      {/* Pawn Head */}
      <circle cx="40" cy="21.5" r="10.5" fill="#9E9B95" />
      {/* Pawn Head 3D Left Highlight */}
      <path
        d="M40 11 A10.5 10.5 0 0 0 29.5 21.5 A10.5 10.5 0 0 0 40 32 Z"
        fill="#B7B4AE"
      />
      {/* Bottom pedestal rim */}
      <rect x="19.5" y="63.5" width="41" height="4.5" rx="2.2" fill="#8C8983" />
      <rect x="19.5" y="63.5" width="20.5" height="4.5" rx="2.2" fill="#A7A49E" />
    </svg>
  );
}

function hashUsernameSeed(name: string): number {
  let h = 2166136261;
  const clean = (name || 'player').trim().toLowerCase();
  for (let i = 0; i < clean.length; i++) {
    h ^= clean.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) & 0x7fffffff;
}

const STUDIO_BACKDROPS: Array<[string, string, string]> = [
  ['#2A3E2E', '#18241B', '#81B64C'],
  ['#24354A', '#141E2B', '#59A5D8'],
  ['#422E24', '#241812', '#E59A28'],
  ['#3B2842', '#1F1524', '#B87DE8'],
  ['#223D3C', '#122221', '#4ECDC4'],
  ['#44262A', '#261417', '#E06C75'],
  ['#3A3522', '#201D12', '#F7C045'],
  ['#283044', '#161B26', '#7D92D6'],
  ['#2E3B2B', '#192117', '#AEE076'],
  ['#453029', '#261A16', '#E88D67'],
  ['#253842', '#131E24', '#63B8D4'],
  ['#3D2B38', '#21171E', '#D97BA6'],
];

const SKIN_PALETTES: Array<{ base: string; shadow: string; ear: string }> = [
  { base: '#F4D2B8', shadow: '#DFB393', ear: '#E6BC9E' },
  { base: '#E8BC96', shadow: '#CE9B72', ear: '#D6A67F' },
  { base: '#D49E73', shadow: '#B87E53', ear: '#C1895E' },
  { base: '#BA7D52', shadow: '#9A6039', ear: '#A66A42' },
  { base: '#8D5837', shadow: '#6E4023', ear: '#7A492B' },
  { base: '#6B4129', shadow: '#4F2D1A', ear: '#5B3520' },
  { base: '#F7DEC8', shadow: '#E2BFA3', ear: '#EBCAB0' },
  { base: '#C68B59', shadow: '#A66E3F', ear: '#B37A4A' },
];

const HAIR_COLORS = [
  '#1C1917',
  '#2C221E',
  '#4A3326',
  '#6E472B',
  '#9A6838',
  '#B88648',
  '#7C3626',
  '#373A40',
  '#232023',
  '#593E2E',
];

const OUTFIT_COLORS: Array<{ main: string; trim: string }> = [
  { main: '#253329', trim: '#81B64C' },
  { main: '#1F2D3D', trim: '#59A5D8' },
  { main: '#382924', trim: '#E59A28' },
  { main: '#2E2538', trim: '#B87DE8' },
  { main: '#1F3332', trim: '#4ECDC4' },
  { main: '#3A2326', trim: '#E06C75' },
  { main: '#2A2825', trim: '#F7C045' },
  { main: '#232B3B', trim: '#8FA4E8' },
];

function HumanPlayerPortrait({ username }: { username: string }) {
  const seed = hashUsernameSeed(username);
  const [bgTop, bgBot, accent] =
    STUDIO_BACKDROPS[(seed >>> 0) % STUDIO_BACKDROPS.length] ?? STUDIO_BACKDROPS[0];
  const skin = SKIN_PALETTES[(seed >>> 3) % SKIN_PALETTES.length] ?? SKIN_PALETTES[0];
  const hairColor = HAIR_COLORS[(seed >>> 6) % HAIR_COLORS.length] ?? HAIR_COLORS[0];
  const outfit = OUTFIT_COLORS[(seed >>> 9) % OUTFIT_COLORS.length] ?? OUTFIT_COLORS[0];
  const hairStyle = (seed >>> 12) % 6;
  const outfitStyle = (seed >>> 15) % 4;
  const hasGlasses = (seed >>> 18) % 4 === 0;
  const gradId = `hp-bg-${(seed >>> 0) % 99991}`;

  return (
    <svg
      viewBox="0 0 80 80"
      className="w-full h-full block"
      role="img"
      aria-label={`${username} player portrait`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={bgTop} />
          <stop offset="100%" stopColor={bgBot} />
        </linearGradient>
      </defs>

      {/* Studio Backdrop */}
      <rect width="80" height="80" fill={`url(#${gradId})`} />
      <circle cx="40" cy="42" r="31" fill={accent} opacity="0.11" />

      {/* Back Hair for longer styles */}
      {hairStyle === 2 && (
        <path
          d="M21 34 C19 48 20 62 24 68 L56 68 C60 62 61 48 59 34 Z"
          fill={hairColor}
        />
      )}

      {/* Shoulders & Attire */}
      <path
        d="M12 80 C13 62 24 55 40 55 C56 55 67 62 68 80 Z"
        fill={outfit.main}
      />
      {/* Outfit Collar / Lapels */}
      {outfitStyle === 0 ? (
        <>
          {/* Grandmaster Blazer + Shirt + Tie */}
          <path d="M32 55 L40 69 L48 55 Z" fill="#F2EFE9" />
          <path d="M38.5 58 L41.5 58 L42.5 72 L40 75 L37.5 72 Z" fill={outfit.trim} />
          <path
            d="M27 56 L36 72 M53 56 L44 72"
            stroke={outfit.trim}
            strokeWidth="1.6"
            opacity="0.7"
          />
        </>
      ) : outfitStyle === 1 ? (
        <>
          {/* Club Hoodie / Drawstrings */}
          <path
            d="M28 56 C32 63 48 63 52 56"
            stroke={outfit.trim}
            strokeWidth="2.2"
            fill="none"
          />
          <line x1="35" y1="61" x2="35" y2="71" stroke="#EAE6DF" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="45" y1="61" x2="45" y2="71" stroke="#EAE6DF" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : outfitStyle === 2 ? (
        <>
          {/* Crewneck / Varsity Trim */}
          <path
            d="M31 55.5 Q40 63 49 55.5"
            stroke={outfit.trim}
            strokeWidth="2.8"
            fill="none"
          />
        </>
      ) : (
        <>
          {/* Polo Collar */}
          <path d="M31 55 L38 63 L40 59 Z" fill={outfit.trim} />
          <path d="M49 55 L42 63 L40 59 Z" fill={outfit.trim} />
        </>
      )}

      {/* Neck & Chin Shadow */}
      <rect x="34" y="45" width="12" height="14" rx="5" fill={skin.shadow} />
      <path d="M34 49 Q40 55 46 49 L46 56 L34 56 Z" fill={skin.base} opacity="0.85" />

      {/* Ears */}
      <circle cx="23.5" cy="37" r="4.2" fill={skin.ear} />
      <circle cx="56.5" cy="37" r="4.2" fill={skin.ear} />

      {/* Head / Face Shape */}
      <rect x="24.5" y="19" width="31" height="32" rx="14.5" fill={skin.base} />
      {/* Subtle Cheek/Jaw shading */}
      <path
        d="M25 36 C25 45 32 51 40 51 C48 51 55 45 55 36 C55 43 48 48.5 40 48.5 C32 48.5 25 43 25 36 Z"
        fill={skin.shadow}
        opacity="0.55"
      />

      {/* Eyebrows */}
      <path
        d="M30 31.5 Q33.5 29.8 36.8 31.3 M43.2 31.3 Q46.5 29.8 50 31.5"
        stroke={hairColor}
        strokeWidth="1.9"
        strokeLinecap="round"
        fill="none"
      />

      {/* Eyes */}
      <circle cx="33.5" cy="35.5" r="2.1" fill="#1E1B18" />
      <circle cx="46.5" cy="35.5" r="2.1" fill="#1E1B18" />
      <circle cx="32.9" cy="34.9" r="0.7" fill="#FFFFFF" />
      <circle cx="45.9" cy="34.9" r="0.7" fill="#FFFFFF" />

      {/* Optional Glasses */}
      {hasGlasses && (
        <g stroke="#E6E2DA" strokeWidth="1.35" fill="none" opacity="0.9">
          <rect x="28.5" y="32.2" width="10" height="6.8" rx="2.2" />
          <rect x="41.5" y="32.2" width="10" height="6.8" rx="2.2" />
          <line x1="38.5" y1="35.2" x2="41.5" y2="35.2" />
        </g>
      )}

      {/* Nose */}
      <path
        d="M40 35.5 L38.8 40.2 L41.2 40.6"
        stroke={skin.shadow}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Confident Smile */}
      <path
        d="M35.2 43.8 Q40 46.8 44.8 43.8"
        stroke="#5A3424"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />

      {/* Hair Styles */}
      {hairStyle === 0 && (
        /* Classic Side-Part Grandmaster Cut */
        <path
          d="M23 33 C22 20 30 14 41 14 C51 14 58 20 57 33 C55 25 50 22 43 22 C35 22 28 25 23 33 Z"
          fill={hairColor}
        />
      )}
      {hairStyle === 1 && (
        /* Textured Modern Crop / Curls */
        <g fill={hairColor}>
          <path d="M23 31 C22 19 30 14 40 14 C50 14 58 19 57 31 C53 23 27 23 23 31 Z" />
          <circle cx="29" cy="21" r="5.5" />
          <circle cx="36" cy="18.5" r="6" />
          <circle cx="44" cy="18.5" r="6" />
          <circle cx="51" cy="21" r="5.5" />
        </g>
      )}
      {hairStyle === 2 && (
        /* Long Wavy Frame */
        <path
          d="M22 36 C21 20 29 13 40 13 C51 13 59 20 58 36 C55 25 49 21 40 21 C31 21 25 25 22 36 Z"
          fill={hairColor}
        />
      )}
      {hairStyle === 3 && (
        /* Swept Quiff */
        <path
          d="M23 32 C22 19 31 12 44 13 C55 14 58 21 57 32 C54 24 46 20 35 22 C28 23 25 27 23 32 Z"
          fill={hairColor}
        />
      )}
      {hairStyle === 4 && (
        /* Center-Part Waves */
        <path
          d="M22.5 34 C22 19 30 14 40 14 C50 14 58 19 57.5 34 C54 24 45 21 40 24 C35 21 26 24 22.5 34 Z"
          fill={hairColor}
        />
      )}
      {hairStyle === 5 && (
        /* Sleek Tapered Cut */
        <path
          d="M24 30 C24 19 31 15 40 15 C49 15 56 19 56 30 C52 23 46 21 40 21 C34 21 28 23 24 30 Z"
          fill={hairColor}
        />
      )}
    </svg>
  );
}

export function PlayerAvatar({
  username,
  avatarValue,
  avatarUrl,
  botId,
  isCurrentUser = false,
  size = 'full',
  rounded = '',
  className = '',
}: PlayerAvatarProps) {
  const [liveUserAvatar, setLiveUserAvatar] = useState<string>(() =>
    loadUserAvatar(username),
  );
  const [customImgError, setCustomImgError] = useState(false);

  useEffect(() => {
    setLiveUserAvatar(loadUserAvatar(username));
    setCustomImgError(false);
    const onAvatarChange = () => {
      setLiveUserAvatar(loadUserAvatar(username));
      setCustomImgError(false);
    };
    window.addEventListener('openchess-avatar-changed', onAvatarChange);
    return () => window.removeEventListener('openchess-avatar-changed', onAvatarChange);
  }, [username, avatarUrl, avatarValue]);

  const rawCandidate =
    avatarValue ||
    avatarUrl ||
    (isCurrentUser ? liveUserAvatar : null) ||
    (username
      ? (() => {
          try {
            const raw = localStorage.getItem('openchess_player_avatars_v2');
            if (!raw) return null;
            const map = JSON.parse(raw) as Record<string, string>;
            return map[username.trim().toLowerCase()] ?? null;
          } catch {
            return null;
          }
        })()
      : null);

  const effectiveValue =
    rawCandidate && rawCandidate !== 'default' ? rawCandidate : null;

  const sizeStyle =
    typeof size === 'number'
      ? { width: `${size}px`, height: `${size}px` }
      : undefined;

  const wrapperClass = `${typeof size === 'number' ? 'shrink-0' : 'w-full h-full'} relative overflow-hidden flex items-center justify-center select-none ${rounded} ${className}`.trim();

  // 1. If this is an explicit AI Bot or Coach (via botId prop or known Bot/Coach name), show the Bot/Coach avatar
  const resolvedBotOrCoach = botId || (!effectiveValue ? resolveKnownBotOrCoachId(username) : null);
  if (resolvedBotOrCoach && !effectiveValue) {
    return (
      <div style={sizeStyle} className={wrapperClass}>
        <BotAvatar id={resolvedBotOrCoach} size={typeof size === 'number' ? size : undefined} />
      </div>
    );
  }

  // 2. If the player has their own uploaded/custom image URL, show their own photo
  if (effectiveValue && isCustomImageAvatar(effectiveValue) && !customImgError) {
    return (
      <div style={sizeStyle} className={wrapperClass}>
        <img
          src={effectiveValue}
          alt={username ? `${username} photo` : 'Player photo'}
          onError={() => setCustomImgError(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // 3. If the player explicitly selected an avatar preset on their account, show it
  const preset = findAvatarPreset(effectiveValue);
  if (preset) {
    if (preset.category === 'character' && preset.botId) {
      return (
        <div style={sizeStyle} className={wrapperClass}>
          <BotAvatar id={preset.botId} size={typeof size === 'number' ? size : undefined} />
        </div>
      );
    }
    if (preset.category === 'emblem' && preset.piece) {
      return (
        <div
          style={{ ...sizeStyle, backgroundColor: preset.bg }}
          className={wrapperClass}
        >
          <div className="w-[72%] h-[72%]">
            <ChessPiece type={preset.piece} color={preset.pieceColor ?? 'w'} />
          </div>
        </div>
      );
    }
  }

  // 4. Explicit pawn preset or completely anonymous placeholder
  const cleanName = (username ?? '').trim();
  if (effectiveValue === 'pawn' || !cleanName || cleanName.toLowerCase() === 'waiting for friend...') {
    return (
      <div style={sizeStyle} className={wrapperClass}>
        <DefaultPawnAvatar title={cleanName ? `${cleanName} avatar` : 'Player default avatar'} />
      </div>
    );
  }

  // 5. Distinct illustrated human player portrait seeded by username
  return (
    <div style={sizeStyle} className={wrapperClass}>
      <HumanPlayerPortrait username={cleanName} />
    </div>
  );
}

interface AvatarPickerModalProps {
  open: boolean;
  username?: string | null;
  currentAvatar?: string | null;
  accessToken?: string | null;
  onSelect?: (newAvatar: string) => void;
  onSelectAvatar?: (newAvatar: string) => void;
  onClose: () => void;
}

function resizeUploadedImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const targetSize = 160;
        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function AvatarPickerModal({
  open,
  username,
  currentAvatar,
  accessToken,
  onSelect,
  onSelectAvatar,
  onClose,
}: AvatarPickerModalProps) {
  const [selected, setSelected] = useState<string>(
    () => currentAvatar || loadUserAvatar(username) || 'default',
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSelected(currentAvatar || loadUserAvatar(username) || 'default');
      setUploadError(null);
    }
  }, [currentAvatar, open, username]);

  if (!open) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select an image file (PNG, JPG, WebP).');
      return;
    }
    setUploadError(null);
    try {
      const dataUrl = await resizeUploadedImageToDataUrl(file);
      setSelected(dataUrl);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Could not process image.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const finalVal = selected === 'default' ? '' : selected;
      saveUserAvatar(selected, username);
      if (accessToken) {
        await fetch('/api/account/avatar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ avatarUrl: selected }),
        }).catch(() => {});
      }
      onSelect?.(finalVal);
      onSelectAvatar?.(finalVal);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-picker-title"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#262421] border border-white/15 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="px-4 py-3.5 bg-[#1F1E1B] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#81B64C]" />
            <h2 id="avatar-picker-title" className="text-base font-extrabold text-white font-display">
              Change Account Photo
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close photo picker"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9E998F] hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4">
          {/* Active Photo Preview + Upload Custom Photo Button */}
          <div className="p-3.5 rounded-xl bg-[#1A1917] border border-white/10 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-16 h-16 rounded-2xl overflow-hidden ring-2 ring-[#81B64C] shrink-0 bg-[#262421]">
                <PlayerAvatar
                  username={username}
                  avatarValue={selected === 'default' ? '' : selected}
                />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-extrabold text-white truncate">
                  {username || 'Your Account Photo'}
                </div>
                <p className="text-xs text-[#9E998F]">
                  Upload your own photo or keep the default pawn silhouette.
                </p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2.5 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[3px] border-[#457524] text-xs font-extrabold text-white flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Photo</span>
            </button>
          </div>

          {uploadError && (
            <div className="p-2.5 rounded-lg bg-[#CA3431]/15 border border-[#CA3431]/40 text-xs text-[#F5B8B0]">
              {uploadError}
            </div>
          )}

          {isCustomImageAvatar(selected) && (
            <div className="px-3 py-2 rounded-lg bg-[#81B64C]/15 border border-[#81B64C]/40 flex items-center justify-between text-xs text-[#AEE076]">
              <div className="flex items-center gap-2 font-bold">
                <ImagePlus className="w-4 h-4" />
                <span>Custom uploaded photo ready to save</span>
              </div>
              <Check className="w-4 h-4" />
            </div>
          )}

          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#9E998F] mb-2.5">
              Default or Optional Chess Avatars
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {AVATAR_PRESETS.map((preset) => {
                const active = selected === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelected(preset.id)}
                    aria-label={`Select ${preset.label}`}
                    className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                      active
                        ? 'bg-[#363B2F] border-[#81B64C] ring-1 ring-[#81B64C]'
                        : 'bg-[#1A1917] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-[#262421]">
                      <PlayerAvatar
                        username={username}
                        avatarValue={preset.id === 'default' ? '' : preset.id}
                      />
                      {active && (
                        <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-[#81B64C] text-[#1A1917] flex items-center justify-center shadow">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-bold text-[#E8E5DF] truncate w-full">
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 bg-[#1F1E1B] border-t border-white/10 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 rounded-xl bg-[#34322E] hover:bg-[#3F3C37] text-xs font-bold text-[#DEDAD2] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="min-h-[40px] px-5 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[3px] border-[#457524] text-xs font-extrabold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Account Photo'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
