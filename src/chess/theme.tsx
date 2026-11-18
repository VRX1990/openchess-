import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type BoardTheme =
  | 'green'
  | 'brown'
  | 'walnut'
  | 'slate'
  | 'emerald'
  | 'purple'
  | 'charcoal'
  | 'sand';

export type PieceTheme = 'neo' | 'classic' | 'wood' | 'glass' | 'alpha' | 'club';

export type AnimationSpeed = 'smooth' | 'fast' | 'none';

export type CoordinateStyle = 'inside' | 'outside' | 'none';

export type PremoveColorTheme = 'crimson' | 'amber' | 'violet';

export interface BoardThemeDefinition {
  id: BoardTheme;
  name: string;
  light: string;
  dark: string;
  lightHighlight: string;
  darkHighlight: string;
}

export const BOARD_THEME_PALETTES: Record<BoardTheme, BoardThemeDefinition> = {
  green: {
    id: 'green',
    name: 'Chess.com Green',
    light: '#EEEED2',
    dark: '#769656',
    lightHighlight: '#F6F669',
    darkHighlight: '#BACA2B',
  },
  brown: {
    id: 'brown',
    name: 'Classic Brown',
    light: '#F0D9B5',
    dark: '#B58863',
    lightHighlight: '#F7EC77',
    darkHighlight: '#DAC34B',
  },
  walnut: {
    id: 'walnut',
    name: 'Dark Walnut',
    light: '#D9BC96',
    dark: '#8C5B3C',
    lightHighlight: '#EEDD79',
    darkHighlight: '#B89738',
  },
  slate: {
    id: 'slate',
    name: 'Tournament Slate',
    light: '#DEE3E6',
    dark: '#8CA2AD',
    lightHighlight: '#D4E6F1',
    darkHighlight: '#6E95AB',
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald Club',
    light: '#E3ECE4',
    dark: '#4F7A61',
    lightHighlight: '#BCE08A',
    darkHighlight: '#7BAE58',
  },
  purple: {
    id: 'purple',
    name: 'Royal Purple',
    light: '#EFEFEF',
    dark: '#8877B7',
    lightHighlight: '#E3D4FF',
    darkHighlight: '#A386DC',
  },
  charcoal: {
    id: 'charcoal',
    name: 'Obsidian',
    light: '#A5A19A',
    dark: '#4D4A46',
    lightHighlight: '#C9B458',
    darkHighlight: '#917F37',
  },
  sand: {
    id: 'sand',
    name: 'Parchment',
    light: '#F5EFE0',
    dark: '#C0AE8E',
    lightHighlight: '#F8E37D',
    darkHighlight: '#D0B44A',
  },
};

export interface PieceThemeDefinition {
  id: PieceTheme;
  name: string;
  description: string;
}

export const PIECE_THEME_OPTIONS: PieceThemeDefinition[] = [
  { id: 'neo', name: 'Neo', description: 'Crisp Chess.com tournament shading' },
  { id: 'classic', name: 'Classic', description: 'Warm ivory & espresso Staunton' },
  { id: 'wood', name: 'Wood', description: 'Carved oak & rich walnut grain' },
  { id: 'glass', name: 'Glass', description: 'Frosted crystal & obsidian slate' },
  { id: 'alpha', name: 'Alpha', description: 'High-contrast bold flat contours' },
  { id: 'club', name: 'Club', description: 'Warm gold-trimmed ivory & ebony' },
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
};

export interface ChessThemePreferences {
  boardTheme: BoardTheme;
  pieceTheme: PieceTheme;
  animationSpeed: AnimationSpeed;
  coordinateStyle: CoordinateStyle;
  premoveColor: PremoveColorTheme;
  highlightMoves: boolean;
}

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
