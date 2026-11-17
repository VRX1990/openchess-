import { useEffect, useMemo, useState } from 'react';
import { Chess, type Color, type PieceSymbol } from 'chess.js';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Crown,
  Lightbulb,
  Loader2,
  RotateCcw,
  Swords,
  Target,
  Undo2,
} from 'lucide-react';
import {
  PRACTICE_COURSES,
  loadPracticeProgress,
  savePracticeChapterComplete,
  type PracticeCourseMeta,
  type StudyChapter,
} from '../chess/learnCurriculum';
import { evaluatePosition, findBestMove } from '../chess/engine';
import { playErrorSound, playMoveSound, playSuccessSound } from '../chess/sound';
import { ChessBoard, type BoardTheme } from './ChessBoard';
import { EvaluationBar } from './EvaluationBar';
import { TutorPanel } from './TutorPanel';

interface LearnPracticeViewProps {
  boardTheme: BoardTheme;
  onLessonCompleted: () => void;
  onBack?: () => void;
}

const CATEGORIES: PracticeCourseMeta['category'][] = [
  'Checkmates',
  'Fundamental tactics',
  'Advanced tactics',
  'Pawn Endgames',
  'Rook Endgames',
];

export function LearnPracticeView({
  boardTheme,
  onLessonCompleted,
  onBack,
}: LearnPracticeViewProps) {
  const [activeCourse, setActiveCourse] = useState<PracticeCourseMeta | null>(null);
  const [chapters, setChapters] = useState<StudyChapter[]>([]);
  const [chapterIdx, setChapterIdx] = useState(0);
  const [loadingCourse, setLoadingCourse] = useState(false);
  const [courseError, setCourseError] = useState<string | null>(null);

  const [fen, setFen] = useState(() => new Chess().fen());
  const [fenHistory, setFenHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [playerSide, setPlayerSide] = useState<Color>('w');
  const [movesPlayed, setMovesPlayed] = useState(0);
  const [stageStatus, setStageStatus] = useState<'playing' | 'passed' | 'error'>('playing');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [checkingEngine, setCheckingEngine] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [hintArrow, setHintArrow] = useState<{ from: string; to: string } | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, string[]>>(() =>
    loadPracticeProgress(),
  );
  const [rightTab, setRightTab] = useState<'stages' | 'coach'>('stages');

  const activeChapter = chapters[chapterIdx] ?? null;

  const initChapter = (ch: StudyChapter, idx: number) => {
    setChapterIdx(idx);
    let initialSide: Color = ch.orientation;
    try {
      const probe = new Chess(ch.initialFen);
      initialSide = probe.turn();
    } catch {
      initialSide = ch.orientation;
    }
    setPlayerSide(initialSide);
    setFen(ch.initialFen);
    setFenHistory([ch.initialFen]);
    setLastMove(null);
    setMovesPlayed(0);
    setStageStatus('playing');
    setFeedback(ch.initialComment || null);
    setShowHint(false);
    setHintArrow(null);
  };

  const openCourse = async (course: PracticeCourseMeta) => {
    setActiveCourse(course);
    setLoadingCourse(true);
    setCourseError(null);
    setChapters([]);
    try {
      const res = await fetch(`/api/learn/study/${encodeURIComponent(course.id)}`);
      const data = (await res.json()) as { chapters?: StudyChapter[]; error?: string };
      if (!res.ok || !Array.isArray(data.chapters) || data.chapters.length === 0) {
        throw new Error(data.error || 'Unable to load practice exercises.');
      }
      setChapters(data.chapters);
      initChapter(data.chapters[0], 0);
    } catch (err: unknown) {
      setCourseError(
        err instanceof Error ? err.message : 'Unable to load practice exercises right now.',
      );
    } finally {
      setLoadingCourse(false);
    }
  };

  const markPassed = (msg: string) => {
    if (!activeCourse) return;
    setStageStatus('passed');
    setFeedback(msg);
    playSuccessSound();
    setProgressMap(savePracticeChapterComplete(activeCourse.id, chapterIdx));
    onLessonCompleted();
  };

  const evaluateMoveBest = async (
    targetFen: string,
  ): Promise<{ bestFrom: string; bestTo: string; bestSan: string; evalCp: number } | null> => {
    try {
      const res = await fetch('/api/engine/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen: targetFen, depth: 12 }),
      });
      if (res.ok) {
        const d = (await res.json()) as {
          bestMoveFrom?: string;
          bestMoveTo?: string;
          bestMoveSan?: string;
          evalCp?: number;
        };
        if (d.bestMoveFrom && d.bestMoveTo && d.bestMoveSan) {
          return {
            bestFrom: d.bestMoveFrom,
            bestTo: d.bestMoveTo,
            bestSan: d.bestMoveSan,
            evalCp: typeof d.evalCp === 'number' ? d.evalCp : 0,
          };
        }
      }
    } catch {
      // fall through to local engine
    }
    const local = findBestMove(targetFen, 2);
    if (!local) return null;
    return {
      bestFrom: local.move.from,
      bestTo: local.move.to,
      bestSan: local.move.san,
      evalCp: local.evalCp,
    };
  };

  const handlePlayerMove = (from: string, to: string, promotion?: PieceSymbol): boolean => {
    if (!activeChapter || stageStatus === 'passed' || checkingEngine) return false;
    const beforeFen = fen;
    const chess = new Chess(beforeFen);
    let moved;
    try {
      moved = chess.move({ from, to, promotion: promotion ?? 'q' });
    } catch {
      return false;
    }
    if (!moved) return false;

    const afterFen = chess.fen();
    const nextMovesCount = movesPlayed + 1;
    setFen(afterFen);
    setFenHistory((prev) => [...prev, afterFen]);
    setLastMove({ from: moved.from, to: moved.to });
    setShowHint(false);
    setHintArrow(null);
    setFeedback(null);
    playMoveSound({ capture: Boolean(moved.captured), check: chess.inCheck() });

    if (chess.isCheckmate()) {
      setMovesPlayed(nextMovesCount);
      markPassed('Checkmate delivered cleanly!');
      return true;
    }
    if (chess.isDraw() || chess.isStalemate()) {
      setStageStatus('error');
      playErrorSound();
      setFeedback('Careful — that ended in a draw. Undo and find the winning line.');
      return true;
    }

    // If chapter has explicit solution sequence in PGN
    if (activeChapter.moves.length > 0 && movesPlayed * 2 < activeChapter.moves.length) {
      const expectedNode = activeChapter.moves[movesPlayed * 2];
      if (expectedNode && moved.san === expectedNode.san.replace(/[!?]+$/, '')) {
        const replyNode = activeChapter.moves[movesPlayed * 2 + 1];
        if (!replyNode) {
          setMovesPlayed(nextMovesCount);
          markPassed('Winning line completed!');
          return true;
        }
        window.setTimeout(() => {
          const replyBoard = new Chess(afterFen);
          const reply = replyBoard.move(replyNode.san.replace(/[!?]+$/, ''));
          if (reply) {
            const rf = replyBoard.fen();
            setFen(rf);
            setFenHistory((prev) => [...prev, rf]);
            setLastMove({ from: reply.from, to: reply.to });
            setMovesPlayed(nextMovesCount);
            playMoveSound({ capture: Boolean(reply.captured), check: replyBoard.inCheck() });
            if (nextMovesCount * 2 >= activeChapter.moves.length) {
              markPassed('Winning sequence mastered!');
            }
          }
        }, 340);
        return true;
      }
    }

    // Engine-verified tactical / endgame evaluation
    setCheckingEngine(true);
    void (async () => {
      try {
        const replyBest = await evaluateMoveBest(afterFen);
        // evalCp returned from opponent's turn perspective -> flip sign for student's advantage
        const studentAdvCp = replyBest ? -replyBest.evalCp : evaluatePosition(new Chess(afterFen)) * (playerSide === 'w' ? 1 : -1);
        const targetCp = activeChapter.goalCp ?? 250;
        const requiredMoves = activeChapter.goalMoves ?? 2;

        if (activeChapter.goalCp !== null && studentAdvCp < Math.min(120, targetCp - 150)) {
          setStageStatus('error');
          playErrorSound();
          setFeedback('Opponent escapes here — undo your last move and find the strongest tactic.');
          return;
        }

        if (activeChapter.goalCp !== null && nextMovesCount >= requiredMoves && studentAdvCp >= Math.max(150, targetCp - 60)) {
          setMovesPlayed(nextMovesCount);
          markPassed('Tactical objective achieved cleanly!');
          return;
        }

        if (replyBest) {
          const replyBoard = new Chess(afterFen);
          const rMove = replyBoard.move({
            from: replyBest.bestFrom,
            to: replyBest.bestTo,
            promotion: 'q',
          });
          if (rMove) {
            const rf = replyBoard.fen();
            setFen(rf);
            setFenHistory((prev) => [...prev, rf]);
            setLastMove({ from: rMove.from, to: rMove.to });
            setMovesPlayed(nextMovesCount);
            playMoveSound({ capture: Boolean(rMove.captured), check: replyBoard.inCheck() });
            if (replyBoard.isDraw() || replyBoard.isStalemate()) {
              setStageStatus('error');
              setFeedback('Game drawn — undo and tighten the net.');
            }
          }
        }
      } finally {
        setCheckingEngine(false);
      }
    })();

    return true;
  };

  const handleUndo = () => {
    if (fenHistory.length <= 1 || checkingEngine) return;
    // Revert back to player's turn
    const targetHistory =
      fenHistory.length >= 3 && new Chess(fen).turn() === playerSide
        ? fenHistory.slice(0, -2)
        : fenHistory.slice(0, -1);
    const prevFen = targetHistory[targetHistory.length - 1] ?? activeChapter?.initialFen;
    if (!prevFen) return;
    setFenHistory(targetHistory);
    setFen(prevFen);
    setLastMove(null);
    setStageStatus('playing');
    setFeedback(null);
    setMovesPlayed(Math.max(0, Math.floor((targetHistory.length - 1) / 2)));
  };

  const triggerHint = async () => {
    setShowHint(true);
    if (activeChapter?.initialArrows?.[0] && movesPlayed === 0) {
      setHintArrow({
        from: activeChapter.initialArrows[0].from,
        to: activeChapter.initialArrows[0].to,
      });
      return;
    }
    const best = await evaluateMoveBest(fen);
    if (best) {
      setHintArrow({ from: best.bestFrom, to: best.bestTo });
      setFeedback(`Try ${best.bestSan} here.`);
    }
  };

  const evalCp = useMemo(() => {
    try {
      return evaluatePosition(new Chess(fen));
    } catch {
      return 0;
    }
  }, [fen]);

  useEffect(() => {
    setRightTab('stages');
  }, [activeCourse?.id]);

  // Grouped Course Catalog View (Matches Photo #4 structure in Chess.com style)
  if (!activeCourse) {
    const totalDone = Object.values(progressMap).reduce((s, a) => s + a.length, 0);
    const totalAll = PRACTICE_COURSES.reduce((s, c) => s + (c.totalExercises ?? 8), 0);
    const pct = Math.round((totalDone / Math.max(1, totalAll)) * 100);

    return (
      <div className="max-w-3xl mx-auto space-y-4 pb-20 lg:pb-8">
        <div className="flex items-center gap-2 px-0.5 pt-1">
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
          <h1 className="text-xl font-extrabold text-white font-display">Practice</h1>
        </div>

        <div className="px-1 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-[#DEDAD2]">Progress: {pct}%</span>
            <span className="font-mono text-[#81B64C] tabular-nums">
              {totalDone} / {totalAll}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#393734] overflow-hidden">
            <div
              className="h-full bg-[#81B64C] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {CATEGORIES.map((cat) => {
          const coursesInCat = PRACTICE_COURSES.filter((c) => c.category === cat);
          if (coursesInCat.length === 0) return null;
          return (
            <section key={cat} className="space-y-2">
              <h2 className="text-base font-extrabold text-white font-display px-0.5">
                {cat}
              </h2>
              <div className="rounded-2xl bg-[#393734] overflow-hidden divide-y divide-white/8 shadow-md">
                {coursesInCat.map((course) => {
                  const doneCount = progressMap[course.id]?.length ?? 0;
                  const totalCount = course.totalExercises ?? 8;
                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => void openCourse(course)}
                      className="w-full px-4 py-3 hover:bg-[#43403C] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-[#262421] flex items-center justify-center shrink-0">
                          {course.category === 'Checkmates' ? (
                            <Crown className="w-5 h-5 text-[#F7C045]" />
                          ) : (
                            <Swords className="w-5 h-5 text-[#81B64C]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold text-white truncate">
                            {course.title}
                          </div>
                          <div className="text-xs text-[#9E998F] truncate">{course.subtitle}</div>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-[#DEDAD2] tabular-nums shrink-0">
                        {doneCount} / {totalCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_410px] gap-4 lg:gap-5 items-start">
      <div className="flex justify-center">
        <div className="w-full max-w-[min(560px,max(240px,calc(100dvh-295px)))] lg:max-w-[min(560px,max(360px,calc(100dvh-195px)))] space-y-2.5">
          {/* Course Header */}
          <div className="flex items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={() => setActiveCourse(null)}
              className="flex items-center gap-1.5 text-xs font-bold text-[#C8C4BC] hover:text-white cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>All Courses</span>
            </button>
            <div className="text-xs font-bold text-white truncate">
              {activeCourse.title}
              {activeChapter ? ` · ${activeChapter.name}` : ''}
            </div>
          </div>

          {loadingCourse ? (
            <div className="aspect-square rounded-xl bg-[#21201D] border border-white/10 flex flex-col items-center justify-center gap-2 text-xs text-[#C8C4BC]">
              <Loader2 className="w-6 h-6 animate-spin text-[#81B64C]" />
              <span>Loading practice stages...</span>
            </div>
          ) : courseError ? (
            <div className="p-5 rounded-xl bg-[#21201D] border border-[#E06C5A]/40 space-y-3 text-center">
              <p className="text-xs text-[#F7C7C1]">{courseError}</p>
              <button
                type="button"
                onClick={() => void openCourse(activeCourse)}
                className="px-4 py-2 rounded-lg bg-[#81B64C] text-xs font-extrabold text-[#191815] cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="-mx-2.5 sm:mx-0 flex items-stretch gap-1 sm:gap-2.5">
                <EvaluationBar evalCp={evalCp} orientation={playerSide} />
                <div className="flex-1 min-w-0">
                  <ChessBoard
                    fen={fen}
                    orientation={playerSide}
                    interactive={stageStatus !== 'passed' && !checkingEngine}
                    allowedColor={playerSide}
                    lastMove={lastMove}
                    bestMoveArrow={hintArrow}
                    extraArrows={showHint && activeChapter ? activeChapter.initialArrows : []}
                    highlightSquares={showHint && activeChapter ? activeChapter.initialHighlights : []}
                    theme={boardTheme}
                    onMove={handlePlayerMove}
                  />
                </div>
              </div>

              {/* Objective & Actions Strip */}
              <div className="p-3 rounded-xl bg-[#262421] border border-white/10 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-bold text-[#F7C045] flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" />
                    <span>
                      {activeChapter?.goalCp
                        ? `Goal: Reach winning advantage (${activeChapter.termination})`
                        : 'Goal: Convert to checkmate cleanly'}
                    </span>
                  </span>
                  {checkingEngine && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#81B64C]" />
                  )}
                </div>

                {feedback && (
                  <p
                    className={`text-xs leading-relaxed ${
                      stageStatus === 'passed'
                        ? 'text-[#AEE076] font-bold'
                        : stageStatus === 'error'
                          ? 'text-[#F7C7C1]'
                          : 'text-[#C8C4BC]'
                    }`}
                  >
                    {feedback}
                  </p>
                )}

                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={fenHistory.length <= 1 || checkingEngine}
                    className="px-3 py-1.5 rounded-lg bg-[#312E2A] hover:bg-[#3E3A35] text-xs font-bold text-white flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Undo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void triggerHint()}
                    disabled={stageStatus === 'passed' || checkingEngine}
                    className="px-3 py-1.5 rounded-lg bg-[#312E2A] hover:bg-[#3E3A35] text-xs font-bold text-[#F7C045] flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>Hint</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => activeChapter && initChapter(activeChapter, chapterIdx)}
                    className="px-3 py-1.5 rounded-lg bg-[#312E2A] hover:bg-[#3E3A35] text-xs font-bold text-[#C8C4BC] flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                  {chapterIdx < chapters.length - 1 && (
                    <button
                      type="button"
                      onClick={() => initChapter(chapters[chapterIdx + 1], chapterIdx + 1)}
                      className="ml-auto px-3.5 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-xs font-extrabold text-[#191815] flex items-center gap-1 cursor-pointer"
                    >
                      <span>Next Stage</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right Stage List & Coach Dock */}
      <aside className="bg-[#21201D] border border-white/10 rounded-xl overflow-hidden flex flex-col lg:h-[min(640px,calc(100dvh-5rem))]">
        <div
          role="tablist"
          className="grid grid-cols-2 bg-[#1A1917] border-b border-white/10 p-1 gap-1 shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === 'stages'}
            onClick={() => setRightTab('stages')}
            className={`py-2 rounded text-xs font-bold cursor-pointer ${
              rightTab === 'stages' ? 'bg-[#312E2A] text-white' : 'text-[#9E998F]'
            }`}
          >
            Stages ({chapters.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === 'coach'}
            onClick={() => setRightTab('coach')}
            className={`py-2 rounded text-xs font-bold cursor-pointer ${
              rightTab === 'coach' ? 'bg-[#312E2A] text-white' : 'text-[#9E998F]'
            }`}
          >
            Coach
          </button>
        </div>

        {rightTab === 'stages' ? (
          <div className="p-3.5 space-y-1.5 overflow-y-auto flex-1">
            {chapters.map((ch, idx) => {
              const isDone = (progressMap[activeCourse.id] ?? []).includes(String(idx));
              return (
                <button
                  key={`${ch.name}-${idx}`}
                  type="button"
                  onClick={() => initChapter(ch, idx)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left cursor-pointer ${
                    idx === chapterIdx
                      ? 'bg-[#312E2A] border-[#81B64C]'
                      : 'bg-[#1A1917] border-white/8 hover:border-white/20'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {idx + 1}. {ch.name}
                    </div>
                    {ch.termination && (
                      <div className="text-[11px] text-[#9E998F]">{ch.termination}</div>
                    )}
                  </div>
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-[#81B64C] shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-[#6D6961] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <TutorPanel
            fen={fen}
            pgn=""
            mode="learn"
            evalCp={evalCp}
            playerColor={playerSide}
            suggestedMoveSan=""
            contextNote={`Practicing ${activeCourse.title}: ${activeChapter?.name ?? ''}.`}
          />
        )}
      </aside>
    </div>
  );
}
