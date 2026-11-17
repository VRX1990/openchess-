import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Lightbulb,
  RotateCcw,
  Star,
} from 'lucide-react';
import {
  CHESS_BASICS_LESSONS,
  FILES,
  RANKS,
  applyBasicsStarMove,
  getBasicsLegalMoves,
  getSquaresAttackedBySide,
  hasAnyLegalMoveForSide,
  hasUndefendedAttackedPiece,
  isSideInCheck,
  loadBasicsProgress,
  saveBasicsLessonStars,
  simulatePieceMove,
  type BasicsLesson,
  type BasicsPiece,
} from '../chess/learnCurriculum';
import { playErrorSound, playMoveSound, playSuccessSound } from '../chess/sound';
import type { BoardTheme } from './ChessBoard';
import { ChessPiece } from './ChessPiece';

const BOARD_PALETTE: Record<
  BoardTheme,
  { light: string; dark: string; lightHighlight: string; darkHighlight: string }
> = {
  green: { light: '#EEEED2', dark: '#769656', lightHighlight: '#F6F669', darkHighlight: '#BACA2B' },
  walnut: { light: '#F0D9B5', dark: '#B58863', lightHighlight: '#F7EC77', darkHighlight: '#DAC34B' },
  slate: { light: '#DEE3E6', dark: '#8CA2AD', lightHighlight: '#D4E6F1', darkHighlight: '#6E95AB' },
};

interface LearnBasicsViewProps {
  boardTheme: BoardTheme;
  onLessonCompleted: () => void;
  onBack?: () => void;
}

const SECTIONS: BasicsLesson['section'][] = [
  'Chess pieces',
  'Fundamentals',
  'Intermediate',
  'Advanced',
];

export function LearnBasicsView({
  boardTheme,
  onLessonCompleted,
  onBack,
}: LearnBasicsViewProps) {
  const [lessonIdx, setLessonIdx] = useState<number | null>(null);
  const [stageIdx, setStageIdx] = useState(0);
  const [progressMap, setProgressMap] = useState<Record<string, number>>(() =>
    loadBasicsProgress(),
  );

  const activeLesson = lessonIdx !== null ? CHESS_BASICS_LESSONS[lessonIdx] : null;
  const stage = activeLesson ? activeLesson.stages[stageIdx] ?? activeLesson.stages[0] : null;

  const [starPieces, setStarPieces] = useState<BasicsPiece[]>([]);
  const [starsLeft, setStarsLeft] = useState<string[]>([]);
  const [selectedSq, setSelectedSq] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [epStepIndex, setEpStepIndex] = useState(0);

  const [movesUsed, setMovesUsed] = useState(0);
  const [stageDone, setStageDone] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

  const loadStage = (lIdx: number, sIdx: number) => {
    const nextLesson = CHESS_BASICS_LESSONS[lIdx];
    const nextStage = nextLesson.stages[sIdx] ?? nextLesson.stages[0];
    setLessonIdx(lIdx);
    setStageIdx(sIdx);
    setStarPieces(nextStage.pieces ?? []);
    setStarsLeft(nextStage.stars ?? []);
    setSelectedSq(nextStage.playerSquare ?? null);
    setLastMove(null);
    setEpStepIndex(0);
    setMovesUsed(0);
    setStageDone(false);
    setFeedback(null);
    setShowHint(false);
  };

  const activeEpSquare = useMemo(() => {
    if (!stage || stage.goalMode !== 'enpassant') return null;
    if (stage.enPassantQueue && stage.enPassantQueue[epStepIndex]) {
      return stage.enPassantQueue[epStepIndex].epSquare;
    }
    return null;
  }, [stage, epStepIndex]);

  const starLegalTargets = useMemo(() => {
    if (!stage || stageDone || !selectedSq) {
      return new Set<string>();
    }
    return new Set(
      getBasicsLegalMoves(starPieces, selectedSq, starsLeft, {
        allowCastling: stage.goalMode === 'castling' || stage.goalMode === 'check2',
        enPassantSquare: activeEpSquare,
      }),
    );
  }, [stage, stageDone, selectedSq, starPieces, starsLeft, activeEpSquare]);

  const completeStage = (nextMoves: number) => {
    if (!activeLesson || !stage) return;
    setStageDone(true);
    playSuccessSound();
    const isLastStage = stageIdx >= activeLesson.stages.length - 1;
    if (isLastStage) {
      const earnedStars = nextMoves <= stage.par ? 3 : nextMoves <= stage.par + 1 ? 2 : 1;
      setProgressMap(saveBasicsLessonStars(activeLesson.id, earnedStars));
      onLessonCompleted();
    }
  };

  const handleBoardSquareClick = (sq: string) => {
    if (!stage || stageDone) return;
    const clickedOwn = starPieces.find((p) => p.square === sq && p.color === 'w');

    if (selectedSq && starLegalTargets.has(sq)) {
      const uci = `${selectedSq}${sq}`;
      const goal = stage.goalMode ?? 'stars';

      // Execute move simulation
      const res = applyBasicsStarMove({
        pieces: starPieces,
        stars: starsLeft,
        from: selectedSq,
        to: sq,
        allowCastling: goal === 'castling' || goal === 'check2',
        enPassantSquare: activeEpSquare,
      });

      if (!res.moved) {
        playErrorSound();
        setFeedback('Move onto a highlighted square where this piece can legally travel.');
        return;
      }

      const nextPieces = res.pieces;
      const nextMoves = movesUsed + 1;

      // 1. Star collection stages (Rook, Bishop, Queen, King, Knight, Pawn)
      if (goal === 'stars') {
        setStarPieces(nextPieces);
        setStarsLeft(res.stars);
        setMovesUsed(nextMoves);
        setSelectedSq(sq);
        setLastMove({ from: selectedSq, to: sq });
        setFeedback(null);
        setShowHint(false);
        playMoveSound({ capture: res.captured });
        if (res.stars.length === 0) {
          completeStage(nextMoves);
        }
        return;
      }

      // 2. Board setup star placement stages (setup 2-6)
      if (goal === 'setup-stars') {
        const remainingTargets = (stage.stars ?? []).filter(
          (starSq) => !nextPieces.some((p) => p.color === 'w' && p.square === starSq),
        );
        setStarPieces(nextPieces);
        setStarsLeft(remainingTargets);
        setMovesUsed(nextMoves);
        setSelectedSq(sq);
        setLastMove({ from: selectedSq, to: sq });
        setFeedback(null);
        setShowHint(false);
        playMoveSound({ capture: res.captured });
        if (remainingTargets.length === 0) {
          completeStage(nextMoves);
        }
        return;
      }

      // 3. Any move stages (setup 1 & 7)
      if (goal === 'any-move') {
        setStarPieces(nextPieces);
        setMovesUsed(nextMoves);
        setSelectedSq(sq);
        setLastMove({ from: selectedSq, to: sq });
        setFeedback(null);
        setShowHint(false);
        playMoveSound({ capture: res.captured });
        completeStage(nextMoves);
        return;
      }

      // 4. Capture all enemy pieces without stepping onto an attacked square (Capture & Combat)
      if (goal === 'capture-all' || goal === 'combat') {
        const blackAttacks = getSquaresAttackedBySide(nextPieces, 'b');
        const whiteDefenses = getSquaresAttackedBySide(nextPieces, 'w');
        const movedIntoDanger =
          goal === 'capture-all'
            ? blackAttacks.has(sq)
            : hasUndefendedAttackedPiece(nextPieces, 'w');

        if (movedIntoDanger) {
          playErrorSound();
          setFeedback('Careful! That leaves a piece undefended under Black attack. Try another move.');
          return;
        }
        if (goal === 'capture-all' && !res.captured && blackAttacks.size > 0 && !whiteDefenses.has(sq)) {
          // Allow preparatory safe moves if needed, otherwise update board
        }
        setStarPieces(nextPieces);
        setMovesUsed(nextMoves);
        setSelectedSq(sq);
        setLastMove({ from: selectedSq, to: sq });
        setFeedback(null);
        setShowHint(false);
        playMoveSound({ capture: res.captured });
        const blackRemaining = nextPieces.filter((p) => p.color === 'b');
        if (blackRemaining.length === 0) {
          completeStage(nextMoves);
        }
        return;
      }

      // 5. Protection: save or defend all White pieces so none are left undefended under attack
      if (goal === 'protect') {
        if (hasUndefendedAttackedPiece(nextPieces, 'w')) {
          playErrorSound();
          setFeedback('A White piece is still undefended and under attack! Escape or defend it.');
          return;
        }
        setStarPieces(nextPieces);
        setMovesUsed(nextMoves);
        setSelectedSq(sq);
        setLastMove({ from: selectedSq, to: sq });
        setFeedback(null);
        setShowHint(false);
        playMoveSound({ capture: res.captured });
        completeStage(nextMoves);
        return;
      }

      // 6. Check in one
      if (goal === 'check1') {
        const matchesExpected = stage.expectedUci ? stage.expectedUci.includes(uci) : false;
        const blackInCheck = isSideInCheck(nextPieces, 'b');
        const safeCheck = !hasUndefendedAttackedPiece(nextPieces, 'w');
        if (!matchesExpected && !(blackInCheck && safeCheck)) {
          playErrorSound();
          setFeedback(
            blackInCheck
              ? 'That check can be captured immediately! Find a safe check.'
              : 'Attack the opponent king in one move!',
          );
          return;
        }
        setStarPieces(nextPieces);
        setMovesUsed(nextMoves);
        setSelectedSq(sq);
        setLastMove({ from: selectedSq, to: sq });
        setFeedback(null);
        setShowHint(false);
        playMoveSound({ capture: res.captured, check: true });
        completeStage(nextMoves);
        return;
      }

      // 7. Out of check
      if (goal === 'outOfCheck') {
        if (isSideInCheck(nextPieces, 'w')) {
          playErrorSound();
          setFeedback('Your king is still in check! Escape, block, or capture the attacker.');
          return;
        }
        setStarPieces(nextPieces);
        setMovesUsed(nextMoves);
        setSelectedSq(sq);
        setLastMove({ from: selectedSq, to: sq });
        setFeedback(null);
        setShowHint(false);
        playMoveSound({ capture: res.captured });
        completeStage(nextMoves);
        return;
      }

      // 8. Mate in one
      if (goal === 'mate1') {
        const matchesExpected = stage.expectedUci ? stage.expectedUci.includes(uci) : false;
        const isMate =
          isSideInCheck(nextPieces, 'b') && !hasAnyLegalMoveForSide(nextPieces, 'b');
        if (!matchesExpected && !isMate) {
          playErrorSound();
          setFeedback('Deliver checkmate in one move so the Black King has no escape!');
          return;
        }
        setStarPieces(nextPieces);
        setMovesUsed(nextMoves);
        setSelectedSq(sq);
        setLastMove({ from: selectedSq, to: sq });
        setFeedback(null);
        setShowHint(false);
        playMoveSound({ capture: res.captured, check: true });
        completeStage(nextMoves);
        return;
      }

      // 9. Castling (1-move or multi-move clearing + castling)
      if (goal === 'castling') {
        const targetCastleSq = stage.castleSide === 'q' ? 'c1' : 'g1';
        const moverPiece = starPieces.find((p) => p.square === selectedSq);
        const didCastle = moverPiece?.type === 'k' && selectedSq === 'e1' && sq === targetCastleSq;

        if (moverPiece?.type === 'k' && !didCastle) {
          playErrorSound();
          setFeedback('Do not move the king before castling — clear the way first, then castle!');
          return;
        }

        setStarPieces(nextPieces);
        setMovesUsed(nextMoves);
        setSelectedSq(sq);
        setLastMove({ from: selectedSq, to: sq });
        setFeedback(null);
        setShowHint(false);
        playMoveSound({ capture: res.captured, castle: didCastle });

        if (didCastle) {
          completeStage(nextMoves);
        }
        return;
      }

      // 10. En Passant (single or 4-pawn sequence)
      if (goal === 'enpassant') {
        const queue = stage.enPassantQueue ?? [];
        const currentStep = queue[epStepIndex];
        const validEp = currentStep
          ? currentStep.whiteMoves.includes(uci)
          : stage.expectedUci?.includes(uci);
        if (!validEp) {
          playErrorSound();
          setFeedback('Capture the pawn that just advanced two squares en passant!');
          return;
        }

        let updatedPieces = nextPieces;
        const nextEpIdx = epStepIndex + 1;
        if (queue[nextEpIdx]) {
          // Advance next Black pawn 2 squares automatically for Stage 4
          const bm = queue[nextEpIdx].blackMove;
          const bFrom = bm.slice(0, 2);
          const bTo = bm.slice(2, 4);
          // Ensure pawn starts on 7th rank if not already moved
          if (updatedPieces.some((p) => p.square === bFrom)) {
            updatedPieces = simulatePieceMove(updatedPieces, bFrom, bTo);
          }
          setEpStepIndex(nextEpIdx);
          setStarPieces(updatedPieces);
          setMovesUsed(nextMoves);
          setSelectedSq(null);
          setLastMove({ from: selectedSq, to: sq });
          setFeedback(null);
          playMoveSound({ capture: true });
          return;
        }

        setStarPieces(updatedPieces);
        setMovesUsed(nextMoves);
        setSelectedSq(sq);
        setLastMove({ from: selectedSq, to: sq });
        setFeedback(null);
        setShowHint(false);
        playMoveSound({ capture: true });
        completeStage(nextMoves);
        return;
      }

      // 11. Stalemate
      if (goal === 'stalemate') {
        const matchesExpected = stage.expectedUci ? stage.expectedUci.includes(uci) : false;
        const isStalemate =
          !isSideInCheck(nextPieces, 'b') && !hasAnyLegalMoveForSide(nextPieces, 'b');
        if (!matchesExpected && !isStalemate) {
          playErrorSound();
          setFeedback(
            isSideInCheck(nextPieces, 'b')
              ? 'Careful — that puts Black in check! Stalemate means Black has no legal moves and is NOT in check.'
              : 'Black still has a legal move! Find the move that leaves Black with zero moves.',
          );
          return;
        }
        setStarPieces(nextPieces);
        setMovesUsed(nextMoves);
        setSelectedSq(sq);
        setLastMove({ from: selectedSq, to: sq });
        setFeedback(null);
        setShowHint(false);
        playMoveSound({ capture: res.captured });
        completeStage(nextMoves);
        return;
      }

      // 12. Piece Value
      if (goal === 'value') {
        const matchesExpected = stage.expectedUci ? stage.expectedUci.includes(uci) : false;
        if (!matchesExpected) {
          playErrorSound();
          setFeedback('Capture the undefended enemy piece with the highest value!');
          return;
        }
        setStarPieces(nextPieces);
        setMovesUsed(nextMoves);
        setSelectedSq(sq);
        setLastMove({ from: selectedSq, to: sq });
        setFeedback(null);
        setShowHint(false);
        playMoveSound({ capture: res.captured });
        completeStage(nextMoves);
        return;
      }

      // 13. Check in two
      if (goal === 'check2') {
        if (movesUsed === 0) {
          const okFirst = stage.expectedUci ? stage.expectedUci.includes(uci) : true;
          if (!okFirst) {
            playErrorSound();
            setFeedback('Find the setup move that threatens a safe check on your next turn!');
            return;
          }
          setStarPieces(nextPieces);
          setMovesUsed(nextMoves);
          setSelectedSq(sq);
          setLastMove({ from: selectedSq, to: sq });
          setFeedback('Great setup! Now deliver the check on move 2.');
          setShowHint(false);
          playMoveSound({ capture: res.captured });
          return;
        } else {
          const okSecond =
            (stage.secondMoveUci && stage.secondMoveUci.includes(uci)) ||
            (isSideInCheck(nextPieces, 'b') && !hasUndefendedAttackedPiece(nextPieces, 'w'));
          if (!okSecond) {
            playErrorSound();
            setFeedback('Now deliver the safe check to the Black King!');
            return;
          }
          setStarPieces(nextPieces);
          setMovesUsed(nextMoves);
          setSelectedSq(sq);
          setLastMove({ from: selectedSq, to: sq });
          setFeedback(null);
          setShowHint(false);
          playMoveSound({ capture: res.captured, check: true });
          completeStage(nextMoves);
          return;
        }
      }
    }

    if (clickedOwn) {
      setSelectedSq(sq);
      return;
    }

    if (selectedSq && !starLegalTargets.has(sq)) {
      playErrorSound();
      setFeedback('Move onto a highlighted square where this piece can legally travel.');
    }
  };

  const goNextStageOrLesson = () => {
    if (lessonIdx === null || !activeLesson) return;
    if (stageIdx < activeLesson.stages.length - 1) {
      loadStage(lessonIdx, stageIdx + 1);
    } else if (lessonIdx < CHESS_BASICS_LESSONS.length - 1) {
      loadStage(lessonIdx + 1, 0);
    } else {
      setLessonIdx(null);
    }
  };

  const completedLessonsCount = Object.keys(progressMap).length;
  const pct = Math.round((completedLessonsCount / Math.max(1, CHESS_BASICS_LESSONS.length)) * 100);
  const palette = BOARD_PALETTE[boardTheme];

  // Grouped Lesson Catalog (Exact 18 Lichess lessons in Chess.com dark green theme)
  if (lessonIdx === null || !activeLesson || !stage) {
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
          <h1 className="text-xl font-extrabold text-white font-display">Chess basics</h1>
        </div>

        {/* Progress Bar Card */}
        <div className="px-1 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-[#DEDAD2]">Progress: {pct}%</span>
            <span className="font-mono text-[#81B64C] tabular-nums">
              {completedLessonsCount} / {CHESS_BASICS_LESSONS.length}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[#393734] overflow-hidden">
            <div
              className="h-full bg-[#81B64C] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {SECTIONS.map((sec) => {
          const items = CHESS_BASICS_LESSONS.filter((l) => l.section === sec);
          if (items.length === 0) return null;
          return (
            <section key={sec} className="space-y-2">
              <h2 className="text-base font-extrabold text-white font-display px-0.5">
                {sec}
              </h2>
              <div className="rounded-2xl bg-[#393734] overflow-hidden divide-y divide-white/8 shadow-md">
                {items.map((item) => {
                  const idx = CHESS_BASICS_LESSONS.findIndex((x) => x.id === item.id);
                  const starsEarned = progressMap[item.id] ?? 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => loadStage(idx, 0)}
                      className="w-full px-4 py-3 hover:bg-[#43403C] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-[#262421] flex items-center justify-center shrink-0">
                          <div className="w-7 h-7">
                            <ChessPiece type={item.pieceIcon} color="w" />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold text-white truncate">
                            {item.title}
                          </div>
                          <div className="text-xs text-[#9E998F] truncate">{item.subtitle}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {[1, 2, 3].map((n) => (
                          <Star
                            key={n}
                            className={`w-3.5 h-3.5 ${
                              n <= starsEarned
                                ? 'text-[#F7C045] fill-[#F7C045]'
                                : 'text-[#5A5751]'
                            }`}
                          />
                        ))}
                      </div>
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

  // Active Interactive Lesson Stage
  return (
    <div className="max-w-3xl mx-auto space-y-3 pb-20 lg:pb-8">
      <div className="flex items-center justify-between gap-2 px-0.5 pt-1">
        <button
          type="button"
          onClick={() => setLessonIdx(null)}
          className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#DEDAD2] hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Chess basics</span>
        </button>
        <div className="text-xs sm:text-sm font-extrabold text-white truncate">
          {activeLesson.title} · {stage.title}
        </div>
        <div className="text-xs font-mono text-[#9E998F] tabular-nums shrink-0">
          {stageIdx + 1}/{activeLesson.stages.length}
        </div>
      </div>

      <div className="max-w-[540px] mx-auto space-y-3">
        <div
          className="relative w-full aspect-square select-none rounded-md overflow-hidden shadow-[0_14px_38px_rgba(0,0,0,0.48)] ring-1 ring-black/30"
          data-testid="basics-star-board"
        >
          <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
            {RANKS.map((rank, rIdx) =>
              FILES.map((file, fIdx) => {
                const sq = `${file}${rank}`;
                const isLight = (fIdx + rIdx) % 2 === 0;
                const isSelected = selectedSq === sq;
                const isLastMoveSq = lastMove?.from === sq || lastMove?.to === sq;
                const isLegal = starLegalTargets.has(sq);
                const hasStar = starsLeft.includes(sq);
                const isHint = showHint && stage.hintSquare === sq;
                const piece = starPieces.find((p) => p.square === sq);
                const bg =
                  isSelected || isLastMoveSq
                    ? isLight
                      ? palette.lightHighlight
                      : palette.darkHighlight
                    : isLight
                      ? palette.light
                      : palette.dark;
                const coordColor = isLight ? palette.dark : palette.light;

                return (
                  <button
                    key={sq}
                    type="button"
                    data-square={sq}
                    aria-label={`Basics square ${sq}${hasStar ? ' with star' : ''}`}
                    onClick={() => handleBoardSquareClick(sq)}
                    style={{ backgroundColor: bg }}
                    className="relative flex items-center justify-center p-0 border-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#81B64C]"
                  >
                    {fIdx === 0 && (
                      <span
                        style={{ color: coordColor }}
                        className="absolute top-[2px] left-[3px] text-[9px] sm:text-[11px] font-bold leading-none pointer-events-none"
                      >
                        {rank}
                      </span>
                    )}
                    {rIdx === 7 && (
                      <span
                        style={{ color: coordColor }}
                        className="absolute bottom-[1px] right-[3px] text-[9px] sm:text-[11px] font-bold leading-none pointer-events-none"
                      >
                        {file}
                      </span>
                    )}
                    {isHint && (
                      <span className="absolute inset-1 rounded-sm border-[3px] border-[#E59A28] pointer-events-none z-20" />
                    )}
                    {hasStar && !piece && (
                      <Star className="w-[54%] h-[54%] text-[#F7C045] fill-[#F7C045] drop-shadow-[0_2px_4px_rgba(0,0,0,0.45)] z-10 pointer-events-none" />
                    )}
                    {isLegal && !hasStar && !piece && (
                      <span className="w-[30%] h-[30%] rounded-full bg-black/22 pointer-events-none z-10" />
                    )}
                    {isLegal && (hasStar || piece) && (
                      <span className="absolute inset-[6%] rounded-full border-[4px] border-black/22 pointer-events-none z-15" />
                    )}
                    {piece && (
                      <div className="w-[84%] h-[84%] z-20 pointer-events-none">
                        <ChessPiece type={piece.type} color={piece.color} />
                      </div>
                    )}
                  </button>
                );
              }),
            )}
          </div>
        </div>

        {/* Stage Progress Dots */}
        <div className="flex items-center justify-center gap-1.5 pt-0.5">
          {activeLesson.stages.map((st, idx) => (
            <button
              key={st.id}
              type="button"
              onClick={() => loadStage(lessonIdx, idx)}
              aria-label={`Stage ${idx + 1}`}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                idx === stageIdx
                  ? 'w-6 bg-[#81B64C]'
                  : idx < stageIdx
                    ? 'w-2 bg-[#81B64C]/55'
                    : 'w-2 bg-[#393734]'
              }`}
            />
          ))}
        </div>

        <div className="p-3.5 rounded-2xl bg-[#393734] space-y-2.5">
          {stageDone ? (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#AEE076]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  Stage complete!{' '}
                  {stageIdx < activeLesson.stages.length - 1
                    ? 'Continue to next stage.'
                    : 'Lesson mastered!'}
                </span>
              </div>
              <button
                type="button"
                onClick={goNextStageOrLesson}
                className="px-4 py-2 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[3px] border-[#457524] text-xs font-extrabold text-white flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span>{stageIdx < activeLesson.stages.length - 1 ? 'Next Stage' : 'Next Lesson'}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm text-[#DEDAD2] leading-relaxed">
                {feedback || stage.instruction}
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowHint(true)}
                  className="px-3 py-1.5 rounded-lg bg-[#262421] hover:bg-[#312E2A] text-xs font-bold text-[#F7C045] flex items-center gap-1 cursor-pointer"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span>Hint</span>
                </button>
                <button
                  type="button"
                  onClick={() => loadStage(lessonIdx, stageIdx)}
                  aria-label="Reset stage"
                  className="p-2 rounded-lg bg-[#262421] hover:bg-[#312E2A] text-[#C8C4BC] hover:text-white cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
