import { useState } from 'react';
import { Palette, RotateCcw, Sparkles, X } from 'lucide-react';
import {
  BOARD_THEME_PALETTES,
  PIECE_THEME_OPTIONS,
  PREMOVE_COLOR_PALETTES,
  useChessTheme,
  type AnimationSpeed,
  type BoardTheme,
  type CoordinateStyle,
  type PremoveColorTheme,
} from '../chess/theme';
import { ChessBoard } from './ChessBoard';
import { ChessPiece } from './ChessPiece';

const PREVIEW_FENS = [
  'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b kq - 0 5',
  'r1bqk2r/pppp1ppp/2n2n2/4p3/1bB1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w kq - 2 6',
] as const;

interface ThemeSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ThemeSettingsModal({ open, onClose }: ThemeSettingsModalProps) {
  const {
    prefs,
    setBoardTheme,
    setPieceTheme,
    setAnimationSpeed,
    setCoordinateStyle,
    setPremoveColor,
    setHighlightMoves,
    resetPrefs,
  } = useChessTheme();

  const [previewIdx, setPreviewIdx] = useState(0);
  const [showSamplePremove, setShowSamplePremove] = useState(true);

  if (!open) return null;

  const boardList = Object.values(BOARD_THEME_PALETTES);
  const premoveColorList = Object.values(PREMOVE_COLOR_PALETTES);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="theme-studio-title"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl max-h-[92dvh] rounded-t-2xl sm:rounded-2xl bg-[#262421] border border-white/12 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#81B64C]/20 flex items-center justify-center shrink-0">
              <Palette className="w-4 h-4 text-[#81B64C]" />
            </div>
            <div className="min-w-0">
              <h2
                id="theme-studio-title"
                className="text-base sm:text-lg font-extrabold text-white font-display truncate"
              >
                Board &amp; Pieces Theme
              </h2>
              <p className="text-[11px] text-[#9E998F] truncate">
                Customize squares, Staunton pieces, coordinates, animation &amp; premoves
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={resetPrefs}
              className="px-2.5 py-1.5 rounded-lg bg-[#393734] hover:bg-[#43403C] text-[11px] font-bold text-[#DEDAD2] flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close theme settings"
              className="w-9 h-9 rounded-lg bg-[#393734] hover:bg-[#43403C] flex items-center justify-center text-[#C8C4BC] hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-5">
          {/* Live Interactive Preview */}
          <div className="space-y-3 flex flex-col items-center">
            <div className="w-full max-w-[260px]">
              <ChessBoard
                fen={PREVIEW_FENS[previewIdx]}
                orientation="w"
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

            <div className="w-full max-w-[260px] grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPreviewIdx((i) => (i === 0 ? 1 : 0))}
                className="px-2.5 py-2 rounded-lg bg-[#393734] hover:bg-[#43403C] text-[11px] font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#F7C045]" />
                <span>Test Slide</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSamplePremove((v) => !v)}
                className={`px-2.5 py-2 rounded-lg text-[11px] font-bold cursor-pointer border ${
                  showSamplePremove
                    ? 'bg-[#81B64C]/20 border-[#81B64C] text-white'
                    : 'bg-[#393734] border-white/10 text-[#C8C4BC]'
                }`}
              >
                {showSamplePremove ? 'Premove On' : 'Premove Off'}
              </button>
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-5 min-w-0">
            {/* Board Colors */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#9E998F]">
                  Board Colors
                </h3>
                <span className="text-xs font-bold text-[#81B64C]">
                  {BOARD_THEME_PALETTES[prefs.boardTheme].name}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {boardList.map((b) => {
                  const active = prefs.boardTheme === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBoardTheme(b.id as BoardTheme)}
                      aria-pressed={active}
                      className={`p-2 rounded-xl border flex items-center gap-2 text-left cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#81B64C]/18 border-[#81B64C] text-white'
                          : 'bg-[#1E1C19] hover:bg-[#2F2D29] border-white/10 text-[#DEDAD2]'
                      }`}
                    >
                      <span
                        className="w-7 h-7 rounded-md overflow-hidden grid grid-cols-2 grid-rows-2 shrink-0 ring-1 ring-black/35"
                        aria-hidden="true"
                      >
                        <span style={{ backgroundColor: b.light }} />
                        <span style={{ backgroundColor: b.dark }} />
                        <span style={{ backgroundColor: b.dark }} />
                        <span style={{ backgroundColor: b.light }} />
                      </span>
                      <span className="text-[11px] font-bold leading-tight truncate">
                        {b.name.replace('Chess.com ', '').replace('Tournament ', '')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Piece Sets */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#9E998F]">
                  Piece Style
                </h3>
                <span className="text-xs font-bold text-[#81B64C] capitalize">
                  {prefs.pieceTheme}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PIECE_THEME_OPTIONS.map((p) => {
                  const active = prefs.pieceTheme === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPieceTheme(p.id)}
                      aria-pressed={active}
                      className={`px-3 py-2 rounded-xl border flex items-center gap-2.5 text-left cursor-pointer transition-colors ${
                        active
                          ? 'bg-[#81B64C]/18 border-[#81B64C] text-white'
                          : 'bg-[#1E1C19] hover:bg-[#2F2D29] border-white/10 text-[#DEDAD2]'
                      }`}
                    >
                      <div className="flex items-center -space-x-2 shrink-0">
                        <div className="w-7 h-7">
                          <ChessPiece type="n" color="w" pieceTheme={p.id} />
                        </div>
                        <div className="w-7 h-7">
                          <ChessPiece type="q" color="b" pieceTheme={p.id} />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold truncate">{p.name}</div>
                        <div className="text-[10px] text-[#9E998F] truncate">{p.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Premove Highlight Color */}
            <section className="space-y-2">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#9E998F]">
                Premove Highlight
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {premoveColorList.map((pm) => {
                  const active = prefs.premoveColor === pm.id;
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setPremoveColor(pm.id as PremoveColorTheme)}
                      aria-pressed={active}
                      className={`px-3 py-2 rounded-xl border flex items-center gap-2 text-xs font-bold cursor-pointer ${
                        active
                          ? 'bg-[#81B64C]/18 border-[#81B64C] text-white'
                          : 'bg-[#1E1C19] hover:bg-[#2F2D29] border-white/10 text-[#DEDAD2]'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full shrink-0 ring-1 ring-white/25"
                        style={{ backgroundColor: pm.badgeBg }}
                      />
                      <span>{pm.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Coordinates + Animation Speed + Move Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <section className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#9E998F]">
                  Coordinates
                </h3>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['inside', 'outside', 'none'] as CoordinateStyle[]).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setCoordinateStyle(style)}
                      aria-pressed={prefs.coordinateStyle === style}
                      className={`py-2 rounded-lg border text-xs font-bold capitalize cursor-pointer ${
                        prefs.coordinateStyle === style
                          ? 'bg-[#81B64C]/18 border-[#81B64C] text-white'
                          : 'bg-[#1E1C19] border-white/10 text-[#C8C4BC]'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#9E998F]">
                  Animation Speed
                </h3>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['smooth', 'fast', 'none'] as AnimationSpeed[]).map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => setAnimationSpeed(spd)}
                      aria-pressed={prefs.animationSpeed === spd}
                      className={`py-2 rounded-lg border text-xs font-bold capitalize cursor-pointer ${
                        prefs.animationSpeed === spd
                          ? 'bg-[#81B64C]/18 border-[#81B64C] text-white'
                          : 'bg-[#1E1C19] border-white/10 text-[#C8C4BC]'
                      }`}
                    >
                      {spd}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <button
              type="button"
              onClick={() => setHighlightMoves(!prefs.highlightMoves)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#1E1C19] hover:bg-[#2F2D29] border border-white/10 flex items-center justify-between text-xs font-bold text-white cursor-pointer"
            >
              <span>Highlight Last Move Squares</span>
              <span
                className={`px-2 py-0.5 rounded font-mono text-[11px] ${
                  prefs.highlightMoves
                    ? 'bg-[#81B64C]/25 text-[#AEE076]'
                    : 'bg-white/10 text-[#9E998F]'
                }`}
              >
                {prefs.highlightMoves ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 flex justify-end shrink-0 bg-[#1E1C19]">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[3px] border-[#457524] text-xs font-extrabold text-white cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
