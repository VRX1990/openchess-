import { useEffect, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Play,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Trophy,
} from 'lucide-react';
import {
  loadCoordBest,
  pickNextCoordinate,
  saveCoordBest,
  type CoordinateBestMap,
} from '../chess/learnCurriculum';
import { playErrorSound, playMoveSound, playSuccessSound } from '../chess/sound';
import { ChessBoard, type BoardTheme } from './ChessBoard';
import { BottomSheet } from './BottomSheet';

interface LearnCoordinatesViewProps {
  boardTheme: BoardTheme;
  onDrillCompleted?: () => void;
  onBack?: () => void;
}

const ROUND_SECONDS = 30;
const EMPTY_BOARD_FEN = '8/8/8/8/8/8/8/8 w - - 0 1';

export function LearnCoordinatesView({
  boardTheme,
  onDrillCompleted,
  onBack,
}: LearnCoordinatesViewProps) {
  const [sideSetting, setSideSetting] = useState<'w' | 'b' | 'random'>('w');
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [showCoords, setShowCoords] = useState(false);
  const [showPieces, setShowPieces] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [status, setStatus] = useState<'ready' | 'running' | 'done'>('ready');
  const [targetSq, setTargetSq] = useState<string>('e4');
  const [score, setScore] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(ROUND_SECONDS * 1000);
  const [bestMap, setBestMap] = useState<CoordinateBestMap>(() => loadCoordBest());

  const [flashSquare, setFlashSquare] = useState<{
    square: string;
    color: 'green' | 'red';
  } | null>(null);

  const startedAtRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const flashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== 'running') return;
    const id = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      const remaining = Math.max(0, ROUND_SECONDS * 1000 - elapsed);
      setTimeLeftMs(remaining);
      if (remaining <= 0) {
        window.clearInterval(id);
        setStatus('done');
        playSuccessSound();
        const updated = saveCoordBest(sideSetting, scoreRef.current);
        setBestMap(updated);
        if (scoreRef.current > 0) {
          onDrillCompleted?.();
        }
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [status, sideSetting, onDrillCompleted]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  const startRound = (nextSide = sideSetting) => {
    const resolvedSide =
      nextSide === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : nextSide;
    setOrientation(resolvedSide);
    setScore(0);
    scoreRef.current = 0;
    setAttempts(0);
    setTimeLeftMs(ROUND_SECONDS * 1000);
    setFlashSquare(null);
    setTargetSq(pickNextCoordinate());
    startedAtRef.current = Date.now();
    setStatus('running');
  };

  const handleSquareTap = (sq: Square) => {
    if (status !== 'running') return;
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);

    setAttempts((a) => a + 1);
    const correct = sq === targetSq;

    if (correct) {
      const nextScore = scoreRef.current + 1;
      scoreRef.current = nextScore;
      setScore(nextScore);
      setFlashSquare({ square: sq, color: 'green' });
      playMoveSound({ capture: true });
      setTargetSq(pickNextCoordinate(targetSq));
    } else {
      setFlashSquare({ square: targetSq, color: 'red' });
      playErrorSound();
      setTargetSq(pickNextCoordinate(targetSq));
    }

    flashTimerRef.current = window.setTimeout(() => {
      setFlashSquare(null);
    }, 320);
  };

  const accuracyPct = attempts > 0 ? Math.round((score / attempts) * 100) : 100;
  const pctRemaining = Math.max(0, Math.min(100, (timeLeftMs / (ROUND_SECONDS * 1000)) * 100));
  const standardPositionFen = useRef(new Chess().fen()).current;

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-20 lg:pb-8">
      {/* Header matching Photo #5 in Chess.com styling */}
      <div className="flex items-center justify-between gap-2 px-0.5 pt-1">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to Learn"
              className="w-10 h-10 rounded-lg flex items-center justify-center text-[#DEDAD2] hover:text-white cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h1 className="text-xl font-extrabold text-white font-display">
            Coordinate training
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Coordinate Training Settings"
          className="w-10 h-10 rounded-lg flex items-center justify-center text-[#DEDAD2] hover:text-white cursor-pointer"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      <div className="max-w-[540px] mx-auto space-y-4">
        {status === 'running' && (
          <div className="space-y-1.5 px-1">
            <div className="flex items-center justify-between font-mono text-xs tabular-nums">
              <span className="text-[#81B64C] font-extrabold">Score {score}</span>
              <span className="text-[#DEDAD2] font-bold">
                {(timeLeftMs / 1000).toFixed(1)}s
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[#393734] overflow-hidden">
              <div
                className="h-full bg-[#81B64C] transition-[width] duration-100"
                style={{ width: `${pctRemaining}%` }}
              />
            </div>
          </div>
        )}

        {/* Crisp Unblurred Chess.com Board */}
        <div className="relative">
          <ChessBoard
            fen={showPieces ? standardPositionFen : EMPTY_BOARD_FEN}
            orientation={orientation}
            interactive={false}
            hideCoordinates={!showCoords}
            highlightSquares={flashSquare ? [flashSquare] : []}
            onSquareClick={status === 'running' ? handleSquareTap : undefined}
            theme={boardTheme}
            onMove={() => false}
          />

          {status === 'running' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-30">
              <div
                data-testid="coordinate-target"
                className="px-6 py-3 rounded-2xl bg-[#191815]/85 border border-white/15 shadow-2xl text-4xl sm:text-5xl font-extrabold font-mono text-white tracking-wider select-none"
              >
                {targetSq}
              </div>
            </div>
          )}
        </div>

        {/* Below-Board Action & Stats Area (Photo #5 layout with Chess.com 3D green CTA) */}
        <div className="space-y-3 pt-1">
          {status === 'done' && (
            <div className="rounded-2xl bg-[#393734] p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Trophy className="w-7 h-7 text-[#F7C045] shrink-0" />
                <div>
                  <div className="text-sm font-extrabold text-white">
                    {score} squares · {accuracyPct}% accuracy
                  </div>
                  <div className="text-xs text-[#9E998F]">
                    Best ({sideSetting === 'w' ? 'White' : sideSetting === 'b' ? 'Black' : 'Random'}):{' '}
                    {bestMap[sideSetting]}
                  </div>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-[#81B64C]">30s Done</span>
            </div>
          )}

          {status !== 'running' ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => startRound()}
                className="w-full sm:w-auto sm:min-w-[240px] min-h-[50px] px-7 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-4 border-[#457524] active:border-b-0 active:translate-y-[1px] text-white font-extrabold text-base flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg"
              >
                {status === 'done' ? (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Train Again</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Start training</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-mono text-[#DEDAD2]">
                Accuracy <span className="font-bold text-[#81B64C]">{accuracyPct}%</span>
              </div>
              <button
                type="button"
                onClick={() => startRound()}
                className="px-4 py-2 rounded-xl bg-[#393734] hover:bg-[#43403C] text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="p-2.5 rounded-xl bg-[#393734] text-center">
              <div className="text-[11px] text-[#9E998F]">White Best</div>
              <div className="text-base font-extrabold font-mono text-white tabular-nums">
                {bestMap.w}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#393734] text-center">
              <div className="text-[11px] text-[#9E998F]">Black Best</div>
              <div className="text-base font-extrabold font-mono text-white tabular-nums">
                {bestMap.b}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="p-2.5 rounded-xl bg-[#393734] hover:bg-[#43403C] flex flex-col items-center justify-center text-center cursor-pointer"
            >
              <SlidersHorizontal className="w-4 h-4 text-[#81B64C] mb-0.5" />
              <span className="text-[11px] font-bold text-[#DEDAD2]">Options</span>
            </button>
          </div>
        </div>
      </div>

      {/* Settings BottomSheet */}
      <BottomSheet
        open={settingsOpen}
        title="Coordinate Options"
        onClose={() => setSettingsOpen(false)}
      >
        <div className="p-4 space-y-4">
          <div>
            <div className="text-xs font-bold text-[#9E998F] mb-2">Board Orientation</div>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#1A1917]">
              {(['w', 'random', 'b'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSideSetting(s);
                    if (s !== 'random') setOrientation(s);
                  }}
                  className={`py-2 rounded-lg text-xs font-bold cursor-pointer ${
                    sideSetting === s
                      ? 'bg-[#393734] text-white'
                      : 'text-[#9E998F] hover:text-white'
                  }`}
                >
                  {s === 'w' ? 'White' : s === 'b' ? 'Black' : 'Random'}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowCoords((v) => !v)}
            className="w-full min-h-[46px] flex items-center justify-between px-3.5 rounded-xl bg-[#262421] border border-white/10 text-xs font-bold text-white cursor-pointer"
          >
            <span className="flex items-center gap-2">
              {showCoords ? (
                <Eye className="w-4 h-4 text-[#81B64C]" />
              ) : (
                <EyeOff className="w-4 h-4 text-[#9E998F]" />
              )}
              <span>Show Board Coordinates</span>
            </span>
            <span className="font-mono text-[#81B64C]">{showCoords ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPieces((v) => !v)}
            className="w-full min-h-[46px] flex items-center justify-between px-3.5 rounded-xl bg-[#262421] border border-white/10 text-xs font-bold text-white cursor-pointer"
          >
            <span>Show Pieces During Preview</span>
            <span className="font-mono text-[#81B64C]">{showPieces ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
