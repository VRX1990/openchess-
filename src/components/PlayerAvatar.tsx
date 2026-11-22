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
 * Exact Chess.com default player avatar (matching Play Online / Friends):
 * Crisp solid #C7C6C4 rounded square with pure white #FFFFFF human head-and-shoulders silhouette.
 * Zero SVG url(#gradient) references so Firefox Android, Safari, and Chrome always render 100% cleanly.
 */
function DefaultPlayerAvatar({ title }: { title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full block"
      role="img"
      aria-label={title || 'Default player avatar'}
    >
      <rect width="100" height="100" fill="#C7C6C4" />
      <circle cx="50" cy="36" r="17.5" fill="#FFFFFF" />
      <path
        d="M16 94 C16 69.5 30 58.5 50 58.5 C70 58.5 84 69.5 84 94 L84 100 L16 100 Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

/**
 * Exact Chess.com Guest default pawn avatar (matching Play Bots Guest seat):
 * Crisp flat-shaded gray Staunton pawn on #DFDFDD square using pure solid fills (zero SVG gradients).
 */
function DefaultGuestPawnAvatar({ title }: { title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full block"
      role="img"
      aria-label={title || 'Guest avatar'}
    >
      <rect width="100" height="100" fill="#DFDFDD" />
      <ellipse cx="50" cy="86.5" rx="27" ry="3" fill="#C7C6C3" />
      {/* Base & body (solid crisp mid-gray) */}
      <path
        d="M50 38.5
           C43 38.5 39 40.6 39 43.4
           C39 45.4 40.5 46.8 42.3 47.4
           C41.4 55 38.4 63 32.2 68.7
           C26.8 73.5 23.2 77.2 23.2 81.8
           C23.2 84 25 85.4 28.2 85.4
           L71.8 85.4
           C75 85.4 76.8 84 76.8 81.8
           C76.8 77.2 73.2 73.5 67.8 68.7
           C61.6 63 58.6 55 57.7 47.4
           C59.5 46.8 61 45.4 61 43.4
           C61 40.6 57 38.5 50 38.5 Z"
        fill="#969592"
      />
      {/* Right-half subtle 3D shading (pure solid path, no gradient) */}
      <path
        d="M50 38.5
           L50 85.4
           L71.8 85.4
           C75 85.4 76.8 84 76.8 81.8
           C76.8 77.2 73.2 73.5 67.8 68.7
           C61.6 63 58.6 55 57.7 47.4
           C59.5 46.8 61 45.4 61 43.4
           C61 40.6 57 38.5 50 38.5 Z"
        fill="#82817E"
      />
      {/* Pawn head */}
      <circle cx="50" cy="26.5" r="13.2" fill="#9A9996" />
      <path
        d="M50 13.3 A13.2 13.2 0 0 1 50 39.7 Z"
        fill="#858481"
      />
      <circle cx="45.8" cy="22.4" r="3.2" fill="#B6B5B2" />
    </svg>
  );
}

/**
 * Exact Chess.com Opponent placeholder silhouette avatar (matching Play Online top seat):
 * Solid #3C3A38 rounded square with #252321 human head-and-shoulders bust silhouette.
 */
function DefaultOpponentAvatar({ title }: { title?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full block"
      role="img"
      aria-label={title || 'Opponent avatar'}
    >
      <rect width="100" height="100" fill="#3C3A38" />
      <circle cx="50" cy="36" r="17.5" fill="#252321" />
      <path
        d="M16 94 C16 69.5 30 58.5 50 58.5 C70 58.5 84 69.5 84 94 L84 100 L16 100 Z"
        fill="#252321"
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

  const isGuestSeat =
    normalizedName === 'guest' ||
    normalizedName === 'guest player' ||
    normalizedName === 'anonymous (guest)' ||
    normalizedName === 'anonymous';

  if (isGuestSeat) {
    return (
      <div style={sizeStyle} className={wrapperClass}>
        <DefaultGuestPawnAvatar title={cleanName ? `${cleanName} avatar` : 'Guest avatar'} />
      </div>
    );
  }

  // 5. All human players/friends without a custom photo display Chess.com's crisp white-on-gray bust silhouette
  return (
    <div style={sizeStyle} className={wrapperClass}>
      <DefaultPlayerAvatar title={cleanName ? `${cleanName} avatar` : 'Default player avatar'} />
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
