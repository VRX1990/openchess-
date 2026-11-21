import { useEffect, useId, useRef, useState } from 'react';
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
 * Authentic default player pawn avatar (smooth 3D-shaded classic gray Staunton pawn on light #E6E6E6 square).
 * Uses React useId() per SVG instance + solid paint fallback so Gecko/Firefox never fails to paint
 * when another hidden responsive instance exists earlier in DOM order.
 */
function DefaultPawnAvatar({ title }: { title?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const bodyId = `${uid}-pawn-body`;
  const headId = `${uid}-pawn-head`;
  const baseId = `${uid}-pawn-base`;

  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full block"
      role="img"
      aria-label={title || 'Default player avatar'}
    >
      <defs>
        <linearGradient id={bodyId} x1="18%" y1="10%" x2="84%" y2="92%">
          <stop offset="0%" stopColor="#C4C4C4" />
          <stop offset="48%" stopColor="#9E9E9E" />
          <stop offset="100%" stopColor="#777777" />
        </linearGradient>
        <radialGradient id={headId} cx="36%" cy="30%" r="68%">
          <stop offset="0%" stopColor="#D4D4D4" />
          <stop offset="52%" stopColor="#A2A2A2" />
          <stop offset="100%" stopColor="#7A7A7A" />
        </radialGradient>
        <linearGradient id={baseId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#B2B2B2" />
          <stop offset="50%" stopColor="#929292" />
          <stop offset="100%" stopColor="#737373" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="#E6E6E6" />
      {/* Subtle contact shadow under base */}
      <ellipse cx="50" cy="86.2" rx="28" ry="3.2" fill="#CECECE" />
      {/* Smooth flared Staunton pawn body & curved dome base */}
      <path
        d="M50 37.5
           C42.5 37.5 38.2 39.8 38.2 42.8
           C38.2 45 39.9 46.5 41.8 47.2
           C40.9 54.8 37.9 62.8 31.8 68.5
           C26.2 73.4 22.4 77.2 22.4 81.8
           C22.4 84 24.3 85.4 27.6 85.4
           L72.4 85.4
           C75.7 85.4 77.6 84 77.6 81.8
           C77.6 77.2 73.8 73.4 68.2 68.5
           C62.1 62.8 59.1 54.8 58.2 47.2
           C60.1 46.5 61.8 45 61.8 42.8
           C61.8 39.8 57.5 37.5 50 37.5 Z"
        fill={`url(#${bodyId}) #9A9A9A`}
      />
      {/* Gentle curved bottom rim shading */}
      <path
        d="M24.2 82.4 C32.8 80.7 67.2 80.7 75.8 82.4 C76.4 84.2 75 85.4 72.4 85.4 L27.6 85.4 C25 85.4 23.6 84.2 24.2 82.4 Z"
        fill={`url(#${baseId}) #8C8C8C`}
        opacity="0.55"
      />
      {/* Smooth spherical pawn head */}
      <circle cx="50" cy="25.8" r="13.4" fill={`url(#${headId}) #9E9E9E`} />
      {/* Soft top-left specular gleam on head */}
      <ellipse cx="45.4" cy="21" rx="4.5" ry="3" transform="rotate(-24 45.4 21)" fill="#FFFFFF" opacity="0.22" />
    </svg>
  );
}

/**
 * Unmatched Opponent silhouette avatar (dark charcoal bust on muted slate square).
 */
function DefaultOpponentAvatar({ title }: { title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full block"
      role="img"
      aria-label={title || 'Opponent avatar'}
    >
      <rect width="100" height="100" fill="#4B4845" />
      <circle cx="50" cy="36" r="17" fill="#2A2825" />
      <path
        d="M18 90 C18 68 31 58 50 58 C69 58 82 68 82 90 L82 100 L18 100 Z"
        fill="#2A2825"
      />
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

  // 4. Unmatched Opponent placeholder seat uses the dark bust silhouette
  const cleanName = (username ?? '').trim();
  const normalizedName = cleanName.toLowerCase();
  const isOpponentPlaceholder =
    normalizedName === 'opponent' ||
    normalizedName === 'waiting for friend...' ||
    normalizedName === 'searching...' ||
    normalizedName === 'live opponent';

  if (isOpponentPlaceholder) {
    return (
      <div style={sizeStyle} className={wrapperClass}>
        <DefaultOpponentAvatar title={cleanName ? `${cleanName} avatar` : 'Opponent avatar'} />
      </div>
    );
  }

  // 5. All human players without a custom photo or explicit preset display the iconic shaded gray pawn
  return (
    <div style={sizeStyle} className={wrapperClass}>
      <DefaultPawnAvatar title={cleanName ? `${cleanName} avatar` : 'Default player avatar'} />
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
