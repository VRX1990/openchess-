import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type BoardTheme =
  | 'green'
  | 'brown'
  | 'olive'
  | 'sand'
  | 'tournament'
  | 'walnut'
  | 'light_wood'
  | 'burled'
  | 'marble'
  | 'copper'
  | 'icy'
  | 'ocean'
  | 'slate'
  | 'emerald'
  | 'purple'
  | 'bubblegum'
  | 'charcoal'
  | 'midnight';

export type BoardThemeCategory = 'Classic' | 'Wood & Stone' | 'Vibrant & Dark';

export type PieceTheme =
  | 'neo'
  | 'classic'
  | 'merida'
  | 'wood'
  | 'club'
  | 'alpha'
  | 'glass'
  | 'icy'
  | 'royal';

export type AnimationSpeed = 'smooth' | 'fast' | 'none';

export type CoordinateStyle = 'inside' | 'outside' | 'none';

export type PremoveColorTheme = 'crimson' | 'amber' | 'violet' | 'sky' | 'emerald' | 'rose';

export interface BoardThemeDefinition {
  id: BoardTheme;
  name: string;
  category: BoardThemeCategory;
  light: string;
  dark: string;
  lightHighlight: string;
  darkHighlight: string;
}

export const BOARD_THEME_PALETTES: Record<BoardTheme, BoardThemeDefinition> = {
  green: {
    id: 'green',
    name: 'Classic Green',
    category: 'Classic',
    light: '#EBECD0',
    dark: '#739552',
    lightHighlight: '#F5F682',
    darkHighlight: '#B9CA43',
  },
  brown: {
    id: 'brown',
    name: 'Warm Brown',
    category: 'Classic',
    light: '#F0D9B5',
    dark: '#B58863',
    lightHighlight: '#F7EC77',
    darkHighlight: '#DAC34B',
  },
  olive: {
    id: 'olive',
    name: 'Olive Felt',
    category: 'Classic',
    light: '#EAE9D2',
    dark: '#6F7D4C',
    lightHighlight: '#F4F178',
    darkHighlight: '#B4BA36',
  },
  sand: {
    id: 'sand',
    name: 'Parchment',
    category: 'Classic',
    light: '#F5EFE0',
    dark: '#C0AE8E',
    lightHighlight: '#F8E37D',
    darkHighlight: '#D0B44A',
  },
  tournament: {
    id: 'tournament',
    name: 'Arena Sage',
    category: 'Classic',
    light: '#EAEED7',
    dark: '#5F8755',
    lightHighlight: '#F5F67E',
    darkHighlight: '#A7C840',
  },
  walnut: {
    id: 'walnut',
    name: 'Dark Walnut',
    category: 'Wood & Stone',
    light: '#D9BC96',
    dark: '#8C5B3C',
    lightHighlight: '#EEDD79',
    darkHighlight: '#B89738',
  },
  light_wood: {
    id: 'light_wood',
    name: 'Maple Wood',
    category: 'Wood & Stone',
    light: '#F3DCBA',
    dark: '#C9935B',
    lightHighlight: '#F9EA7A',
    darkHighlight: '#D8B73E',
  },
  burled: {
    id: 'burled',
    name: 'Mahogany',
    category: 'Wood & Stone',
    light: '#E1B88E',
    dark: '#7A422B',
    lightHighlight: '#F1DC72',
    darkHighlight: '#B58932',
  },
  marble: {
    id: 'marble',
    name: 'Marble',
    category: 'Wood & Stone',
    light: '#ECECE9',
    dark: '#8A8D8F',
    lightHighlight: '#E7EA88',
    darkHighlight: '#9DAE5C',
  },
  copper: {
    id: 'copper',
    name: 'Warm Bronze',
    category: 'Wood & Stone',
    light: '#EAD8C7',
    dark: '#9E6347',
    lightHighlight: '#F4DF7C',
    darkHighlight: '#C69D42',
  },
  icy: {
    id: 'icy',
    name: 'Icy Sea',
    category: 'Vibrant & Dark',
    light: '#DCE8F2',
    dark: '#5D8AA8',
    lightHighlight: '#CCE8FF',
    darkHighlight: '#6DAFD8',
  },
  ocean: {
    id: 'ocean',
    name: 'Deep Ocean',
    category: 'Vibrant & Dark',
    light: '#D5E4EC',
    dark: '#3B6E8C',
    lightHighlight: '#BCE2F7',
    darkHighlight: '#559FC2',
  },
  slate: {
    id: 'slate',
    name: 'Slate Blue',
    category: 'Vibrant & Dark',
    light: '#DEE3E6',
    dark: '#8CA2AD',
    lightHighlight: '#D4E6F1',
    darkHighlight: '#6E95AB',
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald Club',
    category: 'Vibrant & Dark',
    light: '#E3ECE4',
    dark: '#4F7A61',
    lightHighlight: '#BCE08A',
    darkHighlight: '#7BAE58',
  },
  purple: {
    id: 'purple',
    name: 'Royal Purple',
    category: 'Vibrant & Dark',
    light: '#EFEFEF',
    dark: '#8877B7',
    lightHighlight: '#E3D4FF',
    darkHighlight: '#A386DC',
  },
  bubblegum: {
    id: 'bubblegum',
    name: 'Coral Rose',
    category: 'Vibrant & Dark',
    light: '#F9E3E6',
    dark: '#C76B7E',
    lightHighlight: '#FBE59B',
    darkHighlight: '#D88D6D',
  },
  charcoal: {
    id: 'charcoal',
    name: 'Obsidian',
    category: 'Vibrant & Dark',
    light: '#A5A19A',
    dark: '#4D4A46',
    lightHighlight: '#C9B458',
    darkHighlight: '#917F37',
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    category: 'Vibrant & Dark',
    light: '#B8C1D1',
    dark: '#3F4C6B',
    lightHighlight: '#D6D98B',
    darkHighlight: '#6B7E9E',
  },
};

export const BOARD_THEME_CATEGORIES: BoardThemeCategory[] = [
  'Classic',
  'Wood & Stone',
  'Vibrant & Dark',
];

export interface PieceThemeDefinition {
  id: PieceTheme;
  name: string;
  description: string;
}

export const PIECE_THEME_OPTIONS: PieceThemeDefinition[] = [
  { id: 'neo', name: 'Neo', description: 'Crisp modern tournament shading' },
  { id: 'classic', name: 'Classic', description: 'Warm ivory & espresso Staunton' },
  { id: 'merida', name: 'Merida', description: 'Iconic balanced tournament contrast' },
  { id: 'wood', name: 'Wood', description: 'Carved oak & rich walnut grain' },
  { id: 'club', name: 'Club', description: 'Gold-trimmed ivory & ebony' },
  { id: 'alpha', name: 'Alpha', description: 'High-contrast bold flat contours' },
  { id: 'glass', name: 'Glass', description: 'Frosted crystal & obsidian slate' },
  { id: 'icy', name: 'Icy', description: 'Glacial pearl & frost sapphire' },
  { id: 'royal', name: 'Royal', description: 'Champagne cream & velvet charcoal' },
];

export interface PremoveColorDefinition {
  id: PremoveColorTheme;
  name: string;
  lightSq: string;
  darkSq: string;
  ring: string;
  arrow: string;
  dot: string;
  badgeBg: string;
}

export const PREMOVE_COLOR_PALETTES: Record<PremoveColorTheme, PremoveColorDefinition> = {
  crimson: {
    id: 'crimson',
    name: 'Crimson',
    lightSq: 'rgba(235, 77, 61, 0.44)',
    darkSq: 'rgba(212, 56, 42, 0.52)',
    ring: 'rgba(255, 118, 102, 0.85)',
    arrow: 'rgba(248, 79, 62, 0.9)',
    dot: 'rgba(244, 92, 75, 0.6)',
    badgeBg: '#E53935',
  },
  amber: {
    id: 'amber',
    name: 'Amber',
    lightSq: 'rgba(245, 158, 11, 0.44)',
    darkSq: 'rgba(217, 119, 6, 0.52)',
    ring: 'rgba(252, 211, 77, 0.85)',
    arrow: 'rgba(245, 158, 11, 0.92)',
    dot: 'rgba(245, 158, 11, 0.6)',
    badgeBg: '#D97706',
  },
  violet: {
    id: 'violet',
    name: 'Violet',
    lightSq: 'rgba(139, 92, 246, 0.44)',
    darkSq: 'rgba(109, 40, 217, 0.52)',
    ring: 'rgba(196, 181, 253, 0.88)',
    arrow: 'rgba(155, 105, 255, 0.92)',
    dot: 'rgba(167, 139, 250, 0.62)',
    badgeBg: '#7C3AED',
  },
  sky: {
    id: 'sky',
    name: 'Sky',
    lightSq: 'rgba(14, 165, 233, 0.44)',
    darkSq: 'rgba(2, 132, 199, 0.52)',
    ring: 'rgba(125, 211, 252, 0.9)',
    arrow: 'rgba(56, 189, 248, 0.92)',
    dot: 'rgba(56, 189, 248, 0.62)',
    badgeBg: '#0284C7',
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald',
    lightSq: 'rgba(34, 197, 94, 0.44)',
    darkSq: 'rgba(22, 163, 74, 0.52)',
    ring: 'rgba(134, 239, 172, 0.88)',
    arrow: 'rgba(74, 222, 128, 0.92)',
    dot: 'rgba(74, 222, 128, 0.62)',
    badgeBg: '#16A34A',
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    lightSq: 'rgba(236, 72, 153, 0.44)',
    darkSq: 'rgba(219, 39, 119, 0.52)',
    ring: 'rgba(249, 168, 212, 0.88)',
    arrow: 'rgba(244, 114, 182, 0.92)',
    dot: 'rgba(244, 114, 182, 0.62)',
    badgeBg: '#DB2777',
  },
};

export interface ChessThemePreferences {
  boardTheme: BoardTheme;
  pieceTheme: PieceTheme;
  animationSpeed: AnimationSpeed;
  coordinateStyle: CoordinateStyle;
  premoveColor: PremoveColorTheme;
  highlightMoves: boolean;
}

export interface ThemePresetDefinition {
  id: string;
  name: string;
  subtitle: string;
  prefs: ChessThemePreferences;
}

export const THEME_PRESETS: ThemePresetDefinition[] = [
  {
    id: 'tournament-green',
    name: 'Tournament',
    subtitle: 'Green · Neo',
    prefs: {
      boardTheme: 'green',
      pieceTheme: 'neo',
      animationSpeed: 'smooth',
      coordinateStyle: 'inside',
      premoveColor: 'crimson',
      highlightMoves: true,
    },
  },
  {
    id: 'grandmaster-wood',
    name: 'GM Walnut',
    subtitle: 'Walnut · Wood',
    prefs: {
      boardTheme: 'walnut',
      pieceTheme: 'wood',
      animationSpeed: 'smooth',
      coordinateStyle: 'outside',
      premoveColor: 'amber',
      highlightMoves: true,
    },
  },
  {
    id: 'icy-arena',
    name: 'Icy Arena',
    subtitle: 'Icy Sea · Icy',
    prefs: {
      boardTheme: 'icy',
      pieceTheme: 'icy',
      animationSpeed: 'fast',
      coordinateStyle: 'inside',
      premoveColor: 'sky',
      highlightMoves: true,
    },
  },
  {
    id: 'obsidian-club',
    name: 'Obsidian Club',
    subtitle: 'Obsidian · Club',
    prefs: {
      boardTheme: 'charcoal',
      pieceTheme: 'club',
      animationSpeed: 'smooth',
      coordinateStyle: 'inside',
      premoveColor: 'violet',
      highlightMoves: true,
    },
  },
  {
    id: 'marble-classic',
    name: 'Marble Classic',
    subtitle: 'Marble · Merida',
    prefs: {
      boardTheme: 'marble',
      pieceTheme: 'merida',
      animationSpeed: 'smooth',
      coordinateStyle: 'outside',
      premoveColor: 'crimson',
      highlightMoves: true,
    },
  },
  {
    id: 'deep-ocean',
    name: 'Deep Ocean',
    subtitle: 'Ocean · Glass',
    prefs: {
      boardTheme: 'ocean',
      pieceTheme: 'glass',
      animationSpeed: 'fast',
      coordinateStyle: 'inside',
      premoveColor: 'emerald',
      highlightMoves: true,
    },
  },
];

export const DEFAULT_THEME_PREFS: ChessThemePreferences = {
  boardTheme: 'green',
  pieceTheme: 'neo',
  animationSpeed: 'smooth',
  coordinateStyle: 'inside',
  premoveColor: 'crimson',
  highlightMoves: true,
};

const THEME_STORAGE_KEY = 'openchess_theme_prefs';

const VALID_BOARD_THEMES = new Set<BoardTheme>(Object.keys(BOARD_THEME_PALETTES) as BoardTheme[]);
const VALID_PIECE_THEMES = new Set<PieceTheme>(PIECE_THEME_OPTIONS.map((p) => p.id));
const VALID_SPEEDS = new Set<AnimationSpeed>(['smooth', 'fast', 'none']);
const VALID_COORDS = new Set<CoordinateStyle>(['inside', 'outside', 'none']);
const VALID_PREMOVE_COLORS = new Set<PremoveColorTheme>(
  Object.keys(PREMOVE_COLOR_PALETTES) as PremoveColorTheme[],
);

export function normalizeThemePrefs(raw: unknown): ChessThemePreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_THEME_PREFS };
  }
  const obj = raw as Record<string, unknown>;
  return {
    boardTheme:
      typeof obj.boardTheme === 'string' && VALID_BOARD_THEMES.has(obj.boardTheme as BoardTheme)
        ? (obj.boardTheme as BoardTheme)
        : DEFAULT_THEME_PREFS.boardTheme,
    pieceTheme:
      typeof obj.pieceTheme === 'string' && VALID_PIECE_THEMES.has(obj.pieceTheme as PieceTheme)
        ? (obj.pieceTheme as PieceTheme)
        : DEFAULT_THEME_PREFS.pieceTheme,
    animationSpeed:
      typeof obj.animationSpeed === 'string' &&
      VALID_SPEEDS.has(obj.animationSpeed as AnimationSpeed)
        ? (obj.animationSpeed as AnimationSpeed)
        : DEFAULT_THEME_PREFS.animationSpeed,
    coordinateStyle:
      typeof obj.coordinateStyle === 'string' &&
      VALID_COORDS.has(obj.coordinateStyle as CoordinateStyle)
        ? (obj.coordinateStyle as CoordinateStyle)
        : DEFAULT_THEME_PREFS.coordinateStyle,
    premoveColor:
      typeof obj.premoveColor === 'string' &&
      VALID_PREMOVE_COLORS.has(obj.premoveColor as PremoveColorTheme)
        ? (obj.premoveColor as PremoveColorTheme)
        : DEFAULT_THEME_PREFS.premoveColor,
    highlightMoves:
      typeof obj.highlightMoves === 'boolean'
        ? obj.highlightMoves
        : DEFAULT_THEME_PREFS.highlightMoves,
  };
}

export function loadThemePrefs(): ChessThemePreferences {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_THEME_PREFS };
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THEME_PREFS };
    return normalizeThemePrefs(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_THEME_PREFS };
  }
}

export function saveThemePrefs(prefs: ChessThemePreferences): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage errors
  }
}

interface ChessThemeContextValue {
  prefs: ChessThemePreferences;
  setBoardTheme: (theme: BoardTheme) => void;
  setPieceTheme: (theme: PieceTheme) => void;
  setAnimationSpeed: (speed: AnimationSpeed) => void;
  setCoordinateStyle: (style: CoordinateStyle) => void;
  setPremoveColor: (color: PremoveColorTheme) => void;
  setHighlightMoves: (enabled: boolean) => void;
  updatePrefs: (patch: Partial<ChessThemePreferences>) => void;
  resetPrefs: () => void;
}

const ChessThemeContext = createContext<ChessThemeContextValue>({
  prefs: DEFAULT_THEME_PREFS,
  setBoardTheme: () => {},
  setPieceTheme: () => {},
  setAnimationSpeed: () => {},
  setCoordinateStyle: () => {},
  setPremoveColor: () => {},
  setHighlightMoves: () => {},
  updatePrefs: () => {},
  resetPrefs: () => {},
});

export function ChessThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ChessThemePreferences>(() => loadThemePrefs());

  useEffect(() => {
    saveThemePrefs(prefs);
  }, [prefs]);

  const value = useMemo<ChessThemeContextValue>(
    () => ({
      prefs,
      setBoardTheme: (boardTheme) => setPrefs((p) => ({ ...p, boardTheme })),
      setPieceTheme: (pieceTheme) => setPrefs((p) => ({ ...p, pieceTheme })),
      setAnimationSpeed: (animationSpeed) => setPrefs((p) => ({ ...p, animationSpeed })),
      setCoordinateStyle: (coordinateStyle) => setPrefs((p) => ({ ...p, coordinateStyle })),
      setPremoveColor: (premoveColor) => setPrefs((p) => ({ ...p, premoveColor })),
      setHighlightMoves: (highlightMoves) => setPrefs((p) => ({ ...p, highlightMoves })),
      updatePrefs: (patch) => setPrefs((p) => normalizeThemePrefs({ ...p, ...patch })),
      resetPrefs: () => setPrefs({ ...DEFAULT_THEME_PREFS }),
    }),
    [prefs],
  );

  return <ChessThemeContext.Provider value={value}>{children}</ChessThemeContext.Provider>;
}

export function useChessTheme(): ChessThemeContextValue {
  return useContext(ChessThemeContext);
}
