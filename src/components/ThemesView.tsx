import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  FlipVertical2,
  Layers,
  Palette,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  BOARD_THEME_CATEGORIES,
  BOARD_THEME_PALETTES,
  PIECE_THEME_OPTIONS,
  PREMOVE_COLOR_PALETTES,
  THEME_PRESETS,
  useChessTheme,
  type AnimationSpeed,
  type BoardTheme,
  type CoordinateStyle,
  type PremoveColorTheme,
} from '../chess/theme';
import { ChessBoard } from './ChessBoard';
import { ChessPiece } from './ChessPiece';

type ThemesCategory = 'all' | 'board' | 'pieces' | 'premove' | 'motion';

const PREVIEW_FENS = [
  'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b kq - 0 5',
  'r1bqk2r/pppp1ppp/2n2n2/4p3/1bB1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w kq - 2 6',
] as const;

const CATEGORY_TABS: { id: ThemesCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'board', label: 'Board' },
  { id: 'pieces', label: 'Pieces' },
  { id: 'premove', label: 'Premove' },
  { id: 'motion', label: 'Display & Motion' },
];

interface ThemesViewProps {
  onBack: () => void;
}

export function ThemesView({ onBack }: ThemesViewProps) {
  const {
    prefs,
    setBoardTheme,
    setPieceTheme,
    setAnimationSpeed,
    setCoordinateStyle,
    setPremoveColor,
    setHighlightMoves,
    updatePrefs,
    resetPrefs,
  } = useChessTheme();

  const [activeCategory, setActiveCategory] = useState<ThemesCategory>('all');
  const [previewIdx, setPreviewIdx] = useState(0);
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [showSamplePremove, setShowSamplePremove] = useState(true);

  const boardsByCategory = useMemo(() => {
    const allBoards = Object.values(BOARD_THEME_PALETTES);
    return BOARD_THEME_CATEGORIES.map((category) => ({
      category,
      items: allBoards.filter((b) => b.category === category),
    }));
  }, []);

  const premoveColorList = Object.values(PREMOVE_COLOR_PALETTES);
  const activeBoardMeta = BOARD_THEME_PALETTES[prefs.boardTheme] ?? BOARD_THEME_PALETTES.green;
  const activePieceMeta =
    PIECE_THEME_OPTIONS.find((p) => p.id === prefs.pieceTheme) ?? PIECE_THEME_OPTIONS[0];
  const activePremoveMeta =
    PREMOVE_COLOR_PALETTES[prefs.premoveColor] ?? PREMOVE_COLOR_PALETTES.crimson;

  const showBoards = activeCategory === 'all' || activeCategory === 'board';
  const showPieces = activeCategory === 'all' || activeCategory === 'pieces';
  const showPremove = activeCategory === 'all' || activeCategory === 'premove';
  const showMotion = activeCategory === 'all' || activeCategory === 'motion';

  return (
    <div data-testid="themes-view" className="max-w-6xl mx-auto space-y-5 pb-6">
      {/* Header */}
      <header className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to previous view"
            className="min-h-[40px] px-3 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 text-xs font-bold text-[#DEDAD2] flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-extrabold text-white font-display tracking-tight flex items-center gap-2">
              <Palette className="w-5 h-5 text-[#81B64C] shrink-0" />
              <span>Themes</span>
            </h1>
            <p className="text-[11px] sm:text-xs text-[#9E998F] truncate hidden sm:block">
              Board colors, Staunton piece sets, premove highlights &amp; animation speed
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={resetPrefs}
          className="min-h-[40px] px-3 sm:px-3.5 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 text-xs font-bold text-[#DEDAD2] flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[336px_1fr] gap-6 items-start">
        {/* Sticky Live Preview Column */}
        <aside className="lg:sticky lg:top-5 space-y-4">
          <section className="p-4 rounded-2xl bg-[#262421] border border-white/10 space-y-3.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-extrabold uppercase tracking-wider text-[#9E998F]">
                Live Preview
              </span>
              <span className="font-bold text-[#DEDAD2] truncate">
                {activeBoardMeta.name} · {activePieceMeta.name}
              </span>
            </div>

            <div className="max-w-[304px] mx-auto">
              <ChessBoard
                fen={PREVIEW_FENS[previewIdx]}
                orientation={orientation}
                interactive={false}
                allowedColor="w"
                lastMove={previewIdx === 0 ? { from: 'e1', to: 'g1' } : { from: 'c5', to: 'b4' }}
                premoves={
                  showSamplePremove
                    ? [
                        { from: 'c1', to: 'g5' },
                        { from: 'g5', to: 'f6' },
                      ]
                    : []
                }
                onPremove={() => {}}
                onMove={() => false}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPreviewIdx((i) => (i === 0 ? 1 : 0))}
                className="min-h-[38px] px-2.5 rounded-xl bg-[#1E1C19] hover:bg-[#312E2A] border border-white/10 text-[11px] font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#F7C045] shrink-0" />
                <span className="truncate">Test Slide</span>
              </button>

              <button
                type="button"
                onClick={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))}
                className="min-h-[38px] px-2.5 rounded-xl bg-[#1E1C19] hover:bg-[#312E2A] border border-white/10 text-[11px] font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FlipVertical2 className="w-3.5 h-3.5 text-[#6FB3E0] shrink-0" />
                <span>Flip</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSamplePremove((v) => !v)}
                aria-pressed={showSamplePremove}
                className={`min-h-[38px] px-2.5 rounded-xl border text-[11px] font-bold cursor-pointer ${
                  showSamplePremove
                    ? 'bg-[#81B64C]/20 border-[#81B64C] text-white'
                    : 'bg-[#1E1C19] border-white/10 text-[#9E998F]'
                }`}
              >
                {showSamplePremove ? 'Premove On' : 'Premove Off'}
              </button>
            </div>
          </section>

          {/* Curated One-Click Presets */}
          <section className="p-4 rounded-2xl bg-[#262421] border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-[#9E998F] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#81B64C]" />
                <span>Quick Combos</span>
              </h2>
              <span className="text-[11px] text-[#9E998F] tabular-nums">
                {THEME_PRESETS.length} presets
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {THEME_PRESETS.map((preset) => {
                const boardPal = BOARD_THEME_PALETTES[preset.prefs.boardTheme];
                const active =
                  prefs.boardTheme === preset.prefs.boardTheme &&
                  prefs.pieceTheme === preset.prefs.pieceTheme &&
                  prefs.premoveColor === preset.prefs.premoveColor;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => updatePrefs(preset.prefs)}
                    aria-pressed={active}
                    className={`p-2.5 rounded-xl border flex items-center gap-2.5 text-left cursor-pointer transition-colors ${
                      active
                        ? 'bg-[#81B64C]/18 border-[#81B64C] text-white'
                        : 'bg-[#1E1C19] hover:bg-[#2F2D29] border-white/10 text-[#DEDAD2]'
                    }`}
                  >
                    <span
                      className="w-8 h-8 rounded-lg overflow-hidden grid grid-cols-2 grid-rows-2 shrink-0 ring-1 ring-black/40 relative"
                      aria-hidden="true"
                    >
                      <span style={{ backgroundColor: boardPal.light }} />
                      <span style={{ backgroundColor: boardPal.dark }} />
                      <span style={{ backgroundColor: boardPal.dark }} />
                      <span style={{ backgroundColor: boardPal.light }} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold truncate">{preset.name}</div>
                      <div className="text-[10px] text-[#9E998F] truncate">{preset.subtitle}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>

        {/* Right Organized Controls Column */}
        <div className="space-y-5 min-w-0">
          {/* Category Filter Bar */}
          <nav
            aria-label="Theme categories"
            className="flex items-center gap-1.5 overflow-x-auto pb-1"
          >
            {CATEGORY_TABS.map((cat) => {
              const active = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  aria-pressed={active}
                  className={`min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-extrabold whitespace-nowrap cursor-pointer transition-colors ${
                    active
                      ? 'bg-[#81B64C] border-[#81B64C] text-[#181714]'
                      : 'bg-[#262421] hover:bg-[#312E2A] border-white/10 text-[#C8C4BC]'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </nav>

          {/* Board Colors Section (Grouped cleanly) */}
          {showBoards && (
            <section
              aria-labelledby="themes-board-heading"
              className="p-4 sm:p-5 rounded-2xl bg-[#262421] border border-white/10 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 id="themes-board-heading" className="text-base font-extrabold text-white font-display">
                    Board Colors
                  </h2>
                  <p className="text-xs text-[#9E998F]">
                    {Object.keys(BOARD_THEME_PALETTES).length} tournament, wood, stone &amp; modern palettes
                  </p>
                </div>
                <span className="text-xs font-bold text-[#81B64C] shrink-0">
                  {activeBoardMeta.name}
                </span>
              </div>

              <div className="space-y-4">
                {boardsByCategory.map(({ category, items }) => (
                  <div key={category} className="space-y-2">
                    <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-[#9E998F]">
                      {category}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      {items.map((b) => {
                        const active = prefs.boardTheme === b.id;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setBoardTheme(b.id as BoardTheme)}
                            aria-pressed={active}
                            data-testid={`board-theme-${b.id}`}
                            className={`min-h-[54px] p-2.5 rounded-xl border flex items-center gap-2.5 text-left cursor-pointer transition-colors ${
                              active
                                ? 'bg-[#81B64C]/18 border-[#81B64C] text-white'
                                : 'bg-[#1E1C19] hover:bg-[#2F2D29] border-white/10 text-[#DEDAD2]'
                            }`}
                          >
                            <span
                              className="w-8 h-8 rounded-lg overflow-hidden grid grid-cols-2 grid-rows-2 shrink-0 ring-1 ring-black/40"
                              aria-hidden="true"
                            >
                              <span style={{ backgroundColor: b.light }} />
                              <span style={{ backgroundColor: b.dark }} />
                              <span style={{ backgroundColor: b.dark }} />
                              <span style={{ backgroundColor: b.light }} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold leading-tight truncate">
                                {b.name}
                              </div>
                            </div>
                            {active && <Check className="w-3.5 h-3.5 text-[#81B64C] shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Piece Styles Section */}
          {showPieces && (
            <section
              aria-labelledby="themes-pieces-heading"
              className="p-4 sm:p-5 rounded-2xl bg-[#262421] border border-white/10 space-y-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 id="themes-pieces-heading" className="text-base font-extrabold text-white font-display">
                    Piece Styles
                  </h2>
                  <p className="text-xs text-[#9E998F]">
                    {PIECE_THEME_OPTIONS.length} handcrafted Staunton SVG sets
                  </p>
                </div>
                <span className="text-xs font-bold text-[#81B64C] shrink-0">
                  {activePieceMeta.name}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {PIECE_THEME_OPTIONS.map((p) => {
                  const active = prefs.pieceTheme === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPieceTheme(p.id)}
                      aria-pressed={active}
                      data-testid={`piece-theme-${p.id}`}
                      className={`min-h-[60px] px-3 py-2.5 rounded-xl border flex items-center gap-3 text-left cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#81B64C]/18 border-[#81B64C] text-white'
                          : 'bg-[#1E1C19] hover:bg-[#2F2D29] border-white/10 text-[#DEDAD2]'
                      }`}
                    >
                      <div
                        className="flex items-center -space-x-2 shrink-0 px-1.5 py-1 rounded-lg"
                        style={{ backgroundColor: activeBoardMeta.dark }}
                      >
                        <div className="w-7 h-7">
                          <ChessPiece type="n" color="w" pieceTheme={p.id} />
                        </div>
                        <div className="w-7 h-7">
                          <ChessPiece type="q" color="b" pieceTheme={p.id} />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-extrabold truncate">{p.name}</div>
                        <div className="text-[11px] text-[#9E998F] truncate">{p.description}</div>
                      </div>
                      {active && <Check className="w-4 h-4 text-[#81B64C] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Premove Highlight Color Section */}
          {showPremove && (
            <section
              aria-labelledby="themes-premove-heading"
              className="p-4 sm:p-5 rounded-2xl bg-[#262421] border border-white/10 space-y-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 id="themes-premove-heading" className="text-base font-extrabold text-white font-display">
                    Premove Highlights
                  </h2>
                  <p className="text-xs text-[#9E998F]">
                    Square tint &amp; arrow color for queued online premoves
                  </p>
                </div>
                <span className="text-xs font-bold text-[#81B64C] shrink-0">
                  {activePremoveMeta.name}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {premoveColorList.map((pm) => {
                  const active = prefs.premoveColor === pm.id;
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setPremoveColor(pm.id as PremoveColorTheme)}
                      aria-pressed={active}
                      data-testid={`premove-color-${pm.id}`}
                      className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs font-bold cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#81B64C]/18 border-[#81B64C] text-white'
                          : 'bg-[#1E1C19] hover:bg-[#2F2D29] border-white/10 text-[#DEDAD2]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-4 h-4 rounded-full shrink-0 ring-1 ring-white/30"
                          style={{ backgroundColor: pm.badgeBg }}
                        />
                        <span className="truncate">{pm.name}</span>
                      </span>
                      {active && <Check className="w-3.5 h-3.5 text-[#81B64C] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Coordinates, Animation Speed & Highlights */}
          {showMotion && (
            <section
              aria-labelledby="themes-motion-heading"
              className="p-4 sm:p-5 rounded-2xl bg-[#262421] border border-white/10 space-y-4"
            >
              <div>
                <h2 id="themes-motion-heading" className="text-base font-extrabold text-white font-display">
                  Coordinates &amp; Motion
                </h2>
                <p className="text-xs text-[#9E998F]">
                  Algebraic labels, piece slide timing &amp; move square highlights
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-[#9E998F]">
                    Coordinates
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {(['inside', 'outside', 'none'] as CoordinateStyle[]).map((style) => (
                      <button
                        key={style}
                        type="button"
                        onClick={() => setCoordinateStyle(style)}
                        aria-pressed={prefs.coordinateStyle === style}
                        className={`min-h-[42px] rounded-xl border text-xs font-bold capitalize cursor-pointer ${
                          prefs.coordinateStyle === style
                            ? 'bg-[#81B64C]/18 border-[#81B64C] text-white'
                            : 'bg-[#1E1C19] hover:bg-[#2F2D29] border-white/10 text-[#C8C4BC]'
                        }`}
                      >
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-[#9E998F]">
                    Animation Speed
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {(['smooth', 'fast', 'none'] as AnimationSpeed[]).map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setAnimationSpeed(spd)}
                        aria-pressed={prefs.animationSpeed === spd}
                        className={`min-h-[42px] rounded-xl border text-xs font-bold capitalize cursor-pointer ${
                          prefs.animationSpeed === spd
                            ? 'bg-[#81B64C]/18 border-[#81B64C] text-white'
                            : 'bg-[#1E1C19] hover:bg-[#2F2D29] border-white/10 text-[#C8C4BC]'
                        }`}
                      >
                        {spd}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setHighlightMoves(!prefs.highlightMoves)}
                aria-pressed={prefs.highlightMoves}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#1E1C19] hover:bg-[#2F2D29] border border-white/10 flex items-center justify-between text-xs font-bold text-white cursor-pointer"
              >
                <span>Highlight Last Move Squares</span>
                <span
                  className={`px-2.5 py-1 rounded-md font-mono text-[11px] ${
                    prefs.highlightMoves
                      ? 'bg-[#81B64C]/25 text-[#AEE076]'
                      : 'bg-white/10 text-[#9E998F]'
                  }`}
                >
                  {prefs.highlightMoves ? 'ON' : 'OFF'}
                </span>
              </button>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
