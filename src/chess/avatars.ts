import type { BotId } from './engine';
import type { CoachPersonaId } from './coach';

export interface AvatarPreset {
  id: string;
  label: string;
  category: 'default' | 'character' | 'emblem';
  botId?: BotId | CoachPersonaId;
  bg: string;
  accent: string;
  piece?: 'k' | 'q' | 'r' | 'b' | 'n' | 'p';
  pieceColor?: 'w' | 'b';
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: 'default',
    label: 'Default Pawn',
    category: 'default',
    bg: '#DFDDD8',
    accent: '#81B64C',
  },
  {
    id: 'preset-viktor',
    label: 'Grandmaster Viktor',
    category: 'character',
    botId: 'viktor',
    bg: '#2D3A24',
    accent: '#81B64C',
  },
  {
    id: 'preset-elena',
    label: 'Master Elena',
    category: 'character',
    botId: 'elena',
    bg: '#233446',
    accent: '#5B9BD5',
  },
  {
    id: 'preset-dante',
    label: 'Tactician Dante',
    category: 'character',
    botId: 'dante',
    bg: '#422622',
    accent: '#E59A28',
  },
  {
    id: 'preset-vera',
    label: 'Strategist Vera',
    category: 'character',
    botId: 'vera',
    bg: '#312645',
    accent: '#B27CF5',
  },
  {
    id: 'preset-aurelius',
    label: 'Champion Aurelius',
    category: 'character',
    botId: 'aurelius',
    bg: '#3E331D',
    accent: '#F7C045',
  },
  {
    id: 'preset-koren',
    label: 'GM Koren',
    category: 'character',
    botId: 'koren',
    bg: '#2C313C',
    accent: '#D1A23A',
  },
  {
    id: 'preset-sofia',
    label: 'Theory Sofia',
    category: 'character',
    botId: 'sofia',
    bg: '#3D2534',
    accent: '#C96D9A',
  },
  {
    id: 'preset-omar',
    label: 'Club Omar',
    category: 'character',
    botId: 'omar',
    bg: '#1F3831',
    accent: '#4EA88C',
  },
  {
    id: 'preset-clara',
    label: 'Contender Clara',
    category: 'character',
    botId: 'clara',
    bg: '#213547',
    accent: '#4FA3D1',
  },
  {
    id: 'preset-milo',
    label: 'Challenger Milo',
    category: 'character',
    botId: 'milo',
    bg: '#283824',
    accent: '#81B64C',
  },
  {
    id: 'preset-hana',
    label: 'Defender Hana',
    category: 'character',
    botId: 'hana',
    bg: '#322542',
    accent: '#9B72C9',
  },
  {
    id: 'preset-leo',
    label: 'Knight Leo',
    category: 'character',
    botId: 'leo',
    bg: '#3E2D1E',
    accent: '#D98A36',
  },
  {
    id: 'preset-nova',
    label: 'Super GM Nova',
    category: 'character',
    botId: 'nova',
    bg: '#1D363B',
    accent: '#59C7D4',
  },
  {
    id: 'preset-apex',
    label: 'Royal Cat',
    category: 'character',
    botId: 'apex',
    bg: '#3B321E',
    accent: '#F7C045',
  },
  {
    id: 'emblem-emerald-knight',
    label: 'Emerald Knight',
    category: 'emblem',
    bg: '#3D5927',
    accent: '#81B64C',
    piece: 'n',
    pieceColor: 'w',
  },
  {
    id: 'emblem-royal-king',
    label: 'Golden King',
    category: 'emblem',
    bg: '#3D311B',
    accent: '#F7C045',
    piece: 'k',
    pieceColor: 'w',
  },
  {
    id: 'emblem-crimson-queen',
    label: 'Crimson Queen',
    category: 'emblem',
    bg: '#4A2220',
    accent: '#FA412D',
    piece: 'q',
    pieceColor: 'w',
  },
  {
    id: 'emblem-obsidian-rook',
    label: 'Obsidian Rook',
    category: 'emblem',
    bg: '#232B38',
    accent: '#6FB3E0',
    piece: 'r',
    pieceColor: 'b',
  },
];

const USER_AVATAR_STORAGE_KEY = 'openchess_user_avatar_v2';
const PLAYER_AVATAR_MAP_KEY = 'openchess_player_avatars_v2';

const KNOWN_BOT_AND_COACH_IDS: Array<BotId | CoachPersonaId> = [
  'pip',
  'noah',
  'mia',
  'milo',
  'leo',
  'hana',
  'clara',
  'omar',
  'sofia',
  'viktor',
  'dante',
  'elena',
  'aurelius',
  'vera',
  'koren',
  'nova',
  'chronos',
  'apex',
];

/**
 * Returns the user's own saved avatar (or '' if the user hasn't set one).
 * Never assigns a fake/random avatar on its own.
 */
export function loadUserAvatar(username?: string | null): string {
  try {
    if (username && username.trim()) {
      const mapRaw = localStorage.getItem(PLAYER_AVATAR_MAP_KEY);
      if (mapRaw) {
        const parsed = JSON.parse(mapRaw) as Record<string, string>;
        const byUser = parsed[username.trim().toLowerCase()];
        if (byUser !== undefined) {
          return byUser === 'default' ? '' : byUser;
        }
      }
      return '';
    }
    const saved = localStorage.getItem(USER_AVATAR_STORAGE_KEY);
    if (saved && saved.trim() && saved.trim() !== 'default') {
      return saved.trim();
    }
  } catch {
    // ignore storage errors
  }
  return '';
}

export function saveUserAvatar(avatarValue: string, username?: string | null): void {
  const clean = avatarValue.trim();
  const normalized = !clean || clean === 'default' ? 'default' : clean;
  try {
    localStorage.setItem(USER_AVATAR_STORAGE_KEY, normalized);
    if (username && username.trim()) {
      const key = username.trim().toLowerCase();
      const mapRaw = localStorage.getItem(PLAYER_AVATAR_MAP_KEY);
      const parsed: Record<string, string> = mapRaw ? JSON.parse(mapRaw) : {};
      parsed[key] = normalized;
      localStorage.setItem(PLAYER_AVATAR_MAP_KEY, JSON.stringify(parsed));
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('openchess-avatar-changed', {
          detail: { avatar: normalized === 'default' ? '' : normalized, username },
        }),
      );
    }
  } catch {
    // ignore storage quota errors
  }
}

/**
 * Only resolves a BotId/CoachPersonaId if the name literally belongs to an AI Bot or Coach.
 * Returns null for all human players so human players never get assigned a bot photo.
 */
export function resolveKnownBotOrCoachId(
  username?: string | null,
): BotId | CoachPersonaId | null {
  if (!username) return null;
  const clean = username.trim().toLowerCase();
  if (!clean) return null;

  for (const id of KNOWN_BOT_AND_COACH_IDS) {
    if (clean === id || clean === `coach ${id}`) {
      return id;
    }
  }
  if (clean === 'cat') return 'apex';
  if (clean === 'stockfish' || clean.startsWith('stockfish lv')) return 'chronos';
  return null;
}

/**
 * Kept for backwards compatibility in tests; returns known bot/coach or 'pip' for bot lookup.
 */
export function resolveDeterministicPlayerBotId(username: string): BotId | CoachPersonaId {
  return resolveKnownBotOrCoachId(username) ?? 'pip';
}

export function findAvatarPreset(avatarValue?: string | null): AvatarPreset | null {
  if (!avatarValue || avatarValue === 'default') return null;
  return AVATAR_PRESETS.find((p) => p.id === avatarValue) ?? null;
}

export function isCustomImageAvatar(avatarValue?: string | null): boolean {
  if (!avatarValue) return false;
  return (
    avatarValue.startsWith('data:image/') ||
    avatarValue.startsWith('http://') ||
    avatarValue.startsWith('https://') ||
    avatarValue.startsWith('/')
  );
}
