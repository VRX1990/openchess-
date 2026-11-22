import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color } from 'chess.js';
import {
  AlertTriangle,
  BarChart3,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Sparkles,
} from 'lucide-react';
import {
  buildPostGameReviewSummary,
  evaluateMovesBatch,
  extractGameSkeleton,
  summarizeGameReview,
  type EvaluatedMove,
  type MoveQuality,
} from '../chess/engine';
import type { CloudEvalSummary } from '../chess/lichess';
import {
  formatEvalDisplay,
  type PositionAnalysisSnapshot,
} from '../chess/reviewAnalysis';
import { analyzeLivePositionWithStockfish19 } from '../chess/stockfishWorker';
import {
  buildSmartGameInsights,
  buildSmartMoveAnalysis,
  getCoachProfile,
  type CoachPersonaId,
} from '../chess/coach';
import { EvalAdvantageChart } from './EvalAdvantageChart';
import { MOVE_QUALITY_META, MoveBadge } from './MoveBadge';
import { TutorPanel } from './TutorPanel';
import { BotAvatar } from './BotAvatar';
import { playMoveSound } from '../chess/sound';
import { getStepNavigationSound } from '../chess/boardMotion';

export interface AiDebrief {
  headline: string;
  gameStory?: string;
  strength: string;
  priorityFix: string;
  sundayDrill: string;
}

export interface CoachWorkspaceProps {
  fen: string;
  pgn: string;
  mode: 'play' | 'puzzles' | 'review';
  playerColor: Color;
  resultLabel?: string;
  evalCp: number;
  lastMoveSan?: string;
  suggestedMoveSan?: string;
  contextNote?: string;
  externalMoves?: EvaluatedMove[];
  externalAnalyzedCount?: number;
  selectedPly?: number;
  onSelectPly?: (ply: number) => void;
  onHighlightArrow?: (arrow: { from: string; to: string } | null) => void;
  onPlayVariation?: (lineSan: string[], baseFen: string) => void;
  onLiveEvalUpdate?: (snap: {
    evalCp: number;
    mateIn: number | null;
    bestMoveFrom: string;
    bestMoveTo: string;
    bestMoveSan: string;
    depth: number;
  }) => void;
  isExploring?: boolean;
  queuedPrompt?: { id: number; text: string } | null;
  defaultTab?: 'report' | 'tutor';
  onMoveStepCloseSheet?: () => void;
  coachId?: CoachPersonaId;
  whiteName?: string;
  blackName?: string;
  whiteRating?: number;
  blackRating?: number;
  onOpenFullReport?: () => void;
}

export function CoachWorkspace({
  fen,
  pgn,
  mode,
  playerColor,
  resultLabel = '*',
  evalCp,
  lastMoveSan = '',
  suggestedMoveSan = '',
  contextNote = '',
  externalMoves,
  externalAnalyzedCount,
  selectedPly: controlledPly,
  onSelectPly,
  onHighlightArrow,
  onPlayVariation,
  onLiveEvalUpdate,
  isExploring = false,
  queuedPrompt = null,
  defaultTab = 'report',
  onMoveStepCloseSheet,
  coachId = 'viktor',
  whiteName,
  blackName,
  whiteRating,
  blackRating,
  onOpenFullReport,
}: CoachWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'report' | 'tutor'>(defaultTab);
  const [internalMoves, setInternalMoves] = useState<EvaluatedMove[]>([]);
  const [internalAnalyzedCount, setInternalAnalyzedCount] = useState(0);
  const [internalPly, setInternalPly] = useState<number>(0);

  const [cloudEval, setCloudEval] = useState<
    (CloudEvalSummary & { available: boolean; nps?: number; engineLabel?: string }) | null
  >(null);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [selectedLineIdx, setSelectedLineIdx] = useState<number>(0);
  const cloudCacheRef = useRef<
    Map<string, CloudEvalSummary & { available: boolean; nps?: number; engineLabel?: string }>
  >(new Map());
  const latestCloudFenRef = useRef<string>('');
  const liveAbortRef = useRef<AbortController | null>(null);

  const [debrief, setDebrief] = useState<AiDebrief | null>(null);
  const [debriefLoading, setDebriefLoading] = useState(false);
  const [debriefError, setDebriefError] = useState<string | null>(null);
  const lastQueuedIdRef = useRef<number | null>(null);

  // Auto-switch to Ask AI Tutor whenever an "Ask Why?" prompt is queued
  useEffect(() => {
    if (queuedPrompt && queuedPrompt.id !== lastQueuedIdRef.current) {
      lastQueuedIdRef.current = queuedPrompt.id;
      setActiveTab('tutor');
    }
  }, [queuedPrompt]);

  // Run batched frame-budgeted progressive analysis when parent doesn't supply externalMoves
  useEffect(() => {
    if (externalMoves) return;
    if (!pgn.trim()) {
      setInternalMoves([]);
      setInternalAnalyzedCount(0);
      setInternalPly(0);
      return;
    }

    let skeleton: EvaluatedMove[] = [];
    try {
      skeleton = extractGameSkeleton(pgn);
    } catch {
      skeleton = [];
    }
    setInternalMoves(skeleton);
    setInternalAnalyzedCount(0);
    setInternalPly(mode === 'review' ? (skeleton.length > 0 ? 1 : 0) : skeleton.length);

    if (skeleton.length === 0) return;

    let cancelled = false;
    let idx = 0;
    const working = [...skeleton];
    let timerId = 0;

    const step = () => {
      if (cancelled || idx >= working.length) return;
      idx = evaluateMovesBatch(working, idx, 10, 12);
      setInternalMoves([...working]);
      setInternalAnalyzedCount(idx);
      if (idx < working.length) {
        timerId = window.setTimeout(step, 16);
      }
    };

    timerId = window.setTimeout(step, 16);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [externalMoves, mode, pgn]);

  // Clear previous AI debrief if PGN changes substantially
  useEffect(() => {
    setDebrief(null);
    setDebriefError(null);
  }, [pgn]);

  const moves = externalMoves ?? internalMoves;
  const analyzedCount =
    typeof externalAnalyzedCount === 'number' ? externalAnalyzedCount : internalAnalyzedCount;
  const activePly =
    typeof controlledPly === 'number' ? controlledPly : internalPly;

  const setPly = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(moves.length, next));
      if (onSelectPly) {
        onSelectPly(clamped);
      } else {
        if (clamped !== activePly) {
          const navSound = getStepNavigationSound(moves, activePly, clamped);
          if (navSound) {
            playMoveSound({
              capture: navSound.capture,
              check: navSound.check,
              castle: navSound.castle,
              promotion: navSound.promotion,
              toSquare: navSound.toSquare,
            });
          }
        }
        setInternalPly(clamped);
      }
    },
    [activePly, moves, onSelectPly],
  );

  const moveListRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!moveListRef.current || activePly <= 0) return;
    const row = moveListRef.current.querySelector<HTMLElement>(`[data-coach-ply="${activePly}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activePly]);

  const analysis = useMemo(() => summarizeGameReview(moves), [moves]);
  const postGameSummary = useMemo(
    () =>
      buildPostGameReviewSummary({
        evaluated: analysis.moves,
        resultLabel,
        whiteBaseRating: whiteRating,
        blackBaseRating: blackRating,
      }),
    [analysis.moves, blackRating, resultLabel, whiteRating],
  );
  const isAnalyzing = moves.length > 0 && analyzedCount < moves.length;

  const currentMove =
    activePly > 0 && activePly <= analysis.moves.length
      ? analysis.moves[activePly - 1]
      : null;

  const prevMove =
    activePly > 1 && activePly - 1 <= analysis.moves.length
      ? analysis.moves[activePly - 2]
      : null;

  const smartMove = useMemo(
    () => (currentMove ? buildSmartMoveAnalysis(currentMove, prevMove, coachId) : null),
    [coachId, currentMove, prevMove],
  );

  const smartInsights = useMemo(
    () => buildSmartGameInsights(analysis.moves, playerColor, coachId),
    [analysis.moves, coachId, playerColor],
  );

  const activeFen = useMemo(() => {
    if (isExploring) return fen;
    if (currentMove) return currentMove.fenAfter;
    if (moves.length > 0 && activePly === 0) {
      return moves[0].fenBefore;
    }
    return fen;
  }, [activePly, currentMove, fen, isExploring, moves]);

  const activeEval = isExploring ? evalCp : currentMove ? currentMove.evalCp : evalCp;
  const currentMeta = currentMove ? MOVE_QUALITY_META[currentMove.quality] : null;

  const criticalMoves = useMemo(
    () =>
      analysis.moves.filter(
        (m) =>
          m.quality === 'Blunder' ||
          m.quality === 'Miss' ||
          m.quality === 'Mistake' ||
          m.quality === 'Inaccuracy',
      ),
    [analysis.moves],
  );

  const jumpToNextCritical = () => {
    if (criticalMoves.length === 0) return;
    const next = criticalMoves.find((m) => m.ply > activePly) ?? criticalMoves[0];
    setPly(next.ply);
    onMoveStepCloseSheet?.();
  };

  const snapshotToCloudPayload = (
    snap: PositionAnalysisSnapshot,
  ): CloudEvalSummary & { available: boolean; nps?: number; engineLabel?: string } => ({
    available: snap.lines.length > 0,
    source: snap.source === 'lichess-cloud' ? 'lichess-cloud' : 'stockfish-19-nnue',
    depth: snap.depth,
    knodes: snap.nodes ? Math.max(1, Math.round(snap.nodes / 1000)) : 0,
    nps: snap.nps,
    engineLabel:
      snap.source === 'stockfish-19-wasm'
        ? 'Analysis Engine'
        : snap.source === 'lichess-cloud'
          ? 'Cloud Engine'
          : 'Local Engine',
    lines: snap.lines.map((l) => ({
      evalText: l.evalText,
      evalCp: l.evalCp,
      firstMoveFrom: l.firstMoveFrom,
      firstMoveTo: l.firstMoveTo,
      firstMoveSan: l.firstMoveSan,
      lineSan: l.lineSan,
    })),
  });

  const fetchCloudEval = useCallback(
    async (targetFen: string, forceRefresh = false) => {
      if (!targetFen) return;
      latestCloudFenRef.current = targetFen;
      if (!forceRefresh) {
        const cached = cloudCacheRef.current.get(targetFen);
        if (cached) {
          setCloudEval(cached);
          setSelectedLineIdx(0);
          return;
        }
      }

      liveAbortRef.current?.abort();
      const controller = new AbortController();
      liveAbortRef.current = controller;
      setCloudLoading(true);

      try {
        const snap = await analyzeLivePositionWithStockfish19(targetFen, {
          depth: forceRefresh ? 19 : 16,
          movetimeMs: forceRefresh ? 1500 : 850,
          multiPv: 3,
          forceRefresh,
          signal: controller.signal,
          onProgress: (partial) => {
            if (latestCloudFenRef.current !== targetFen || controller.signal.aborted) return;
            const payload = snapshotToCloudPayload(partial);
            setCloudEval(payload);
            if (partial.bestMoveFrom && partial.bestMoveTo) {
              onLiveEvalUpdate?.({
                evalCp: partial.evalCp,
                mateIn: partial.mateIn,
                bestMoveFrom: partial.bestMoveFrom,
                bestMoveTo: partial.bestMoveTo,
                bestMoveSan: partial.bestMoveSan,
                depth: partial.depth,
              });
            }
          },
        });

        if (latestCloudFenRef.current !== targetFen || controller.signal.aborted) return;
        const payload = snapshotToCloudPayload(snap);
        cloudCacheRef.current.set(targetFen, payload);
        setCloudEval(payload);
        setSelectedLineIdx(0);
        if (snap.bestMoveFrom && snap.bestMoveTo) {
          onLiveEvalUpdate?.({
            evalCp: snap.evalCp,
            mateIn: snap.mateIn,
            bestMoveFrom: snap.bestMoveFrom,
            bestMoveTo: snap.bestMoveTo,
            bestMoveSan: snap.bestMoveSan,
            depth: snap.depth,
          });
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (latestCloudFenRef.current === targetFen) {
          setCloudEval({ available: false, depth: 0, knodes: 0, lines: [] });
        }
      } finally {
        if (latestCloudFenRef.current === targetFen && !controller.signal.aborted) {
          setCloudLoading(false);
        }
      }
    },
    [onLiveEvalUpdate],
  );

  // Auto-load real Stockfish 19 WASM Multi-PV lines whenever Report tab & position settle
  // Avoid spawning a competing worker while the full-game review scan is actively running
  useEffect(() => {
    if (activeTab !== 'report') return;
    latestCloudFenRef.current = activeFen;
    const cached = cloudCacheRef.current.get(activeFen);
    if (cached) {
      setCloudEval(cached);
      setSelectedLineIdx(0);
      const top = cached.lines[0];
      if (top) {
        onLiveEvalUpdate?.({
          evalCp: top.evalCp,
          mateIn: null,
          bestMoveFrom: top.firstMoveFrom,
          bestMoveTo: top.firstMoveTo,
          bestMoveSan: top.firstMoveSan,
          depth: cached.depth,
        });
      }
      return;
    }
    if (isAnalyzing && !isExploring) {
      liveAbortRef.current?.abort();
      setCloudLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void fetchCloudEval(activeFen);
    }, isExploring ? 60 : 120);
    return () => {
      window.clearTimeout(timer);
      liveAbortRef.current?.abort();
    };
  }, [activeFen, activeTab, fetchCloudEval, isAnalyzing, isExploring, onLiveEvalUpdate]);

  const runAiDebrief = async () => {
    if (debriefLoading) return;
    setDebriefLoading(true);
    setDebriefError(null);
    try {
      const keyMoments = analysis.moves
        .filter(
          (m) =>
            m.quality === 'Mistake' ||
            m.quality === 'Miss' ||
            m.quality === 'Blunder' ||
            m.quality === 'Inaccuracy',
        )
        .map((m) => ({
          move: `${m.moveNumber}${m.color === 'w' ? '.' : '...'} ${m.san}`,
          quality: m.quality,
          bestWas: m.bestMoveSan,
          cpLoss: m.cpLoss,
        }));

      const fallbackPgn = (() => {
        if (pgn.trim()) return pgn;
        try {
          const c = new Chess(activeFen);
          return c.pgn() || `[FEN "${activeFen}"]`;
        } catch {
          return '1. e4';
        }
      })();

      const activeCoach = getCoachProfile(coachId);
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pgn: fallbackPgn,
          playerColor,
          result: resultLabel,
          accuracy:
            playerColor === 'w' ? analysis.whiteAccuracy : analysis.blackAccuracy,
          mistakes: keyMoments,
          bestFind: smartInsights.bestMomentText ?? undefined,
          phaseAccuracies: {
            opening: smartInsights.openingAccuracy,
            middlegame: smartInsights.middlegameAccuracy,
            endgame: smartInsights.endgameAccuracy,
          },
          coachProfile: {
            id: activeCoach.id,
            name: activeCoach.name,
            title: activeCoach.title,
            specialty: activeCoach.specialty,
            tone: activeCoach.tone,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate Coach Review.');
      setDebrief(data as AiDebrief);
    } catch (err: unknown) {
      setDebriefError(
        err instanceof Error ? err.message : 'Unable to generate Coach Review right now.',
      );
    } finally {
      setDebriefLoading(false);
    }
  };

  const showBestMoveArrow =
    currentMove &&
    (currentMove.quality === 'Inaccuracy' ||
      currentMove.quality === 'Mistake' ||
      currentMove.quality === 'Miss' ||
      currentMove.quality === 'Blunder') &&
    currentMove.bestMoveSan !== currentMove.san;

  const summaryItems: { quality: MoveQuality; label: string; count: number }[] = [
    { quality: 'Brilliant', label: 'Bril', count: analysis.counts.Brilliant },
    {
      quality: 'Best',
      label: 'Best',
      count:
        analysis.counts.Best +
        analysis.counts.Excellent +
        analysis.counts.Book +
        analysis.counts.Great,
    },
    { quality: 'Inaccuracy', label: 'Inacc', count: analysis.counts.Inaccuracy },
    { quality: 'Mistake', label: 'Mist', count: analysis.counts.Mistake },
    { quality: 'Miss', label: 'Miss', count: analysis.counts.Miss },
    { quality: 'Blunder', label: 'Blun', count: analysis.counts.Blunder },
  ];

  const evalFormatted = formatEvalDisplay(activeEval, currentMove?.mateIn ?? null);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[#262421]">
      {/* Chess.com Flush Two-Tab Header: Coach Report | Coach Chat */}
      <div
        role="tablist"
        aria-label="Coach workspace tabs"
        className="grid grid-cols-2 bg-[#1F1E1B] shrink-0"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'report'}
          onClick={() => setActiveTab('report')}
          className={`py-2.5 px-2 text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'report'
              ? 'bg-[#262421] text-white'
              : 'text-[#9B9A97] hover:text-white'
          }`}
        >
          Coach Report
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tutor'}
          onClick={() => setActiveTab('tutor')}
          className={`py-2.5 px-2 text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'tutor'
              ? 'bg-[#262421] text-white'
              : 'text-[#9B9A97] hover:text-white'
          }`}
        >
          Coach Chat
        </button>
      </div>

      {activeTab === 'report' ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="p-2 border-b border-white/10 space-y-1.5 bg-[#1A1917] shrink-0 overflow-y-auto max-h-[72%]">
            {/* Compact Chess.com Accuracy + Game Rating Strip */}
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                <div
                  data-testid="coach-white-summary"
                  className="px-2.5 py-1.5 rounded-lg bg-[#262421] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-white truncate">
                      {whiteName || 'White'}
                    </div>
                    <div className="text-[10px] font-semibold text-[#9E998F]">
                      Rating{' '}
                      <span
                        data-testid="coach-white-game-rating"
                        className="font-extrabold text-white tabular-nums"
                      >
                        {postGameSummary.whiteGameRating}
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-1 rounded-[5px] bg-white text-[#262421] text-[13px] font-extrabold tabular-nums shrink-0">
                    {postGameSummary.whiteAccuracyExact.toFixed(1)}
                  </span>
                </div>

                <div
                  data-testid="coach-black-summary"
                  className="px-2.5 py-1.5 rounded-lg bg-[#262421] flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold text-white truncate">
                      {blackName || 'Black'}
                    </div>
                    <div className="text-[10px] font-semibold text-[#9E998F]">
                      Rating{' '}
                      <span
                        data-testid="coach-black-game-rating"
                        className="font-extrabold text-white tabular-nums"
                      >
                        {postGameSummary.blackGameRating}
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-1 rounded-[5px] bg-[#3C3A37] text-white text-[13px] font-extrabold tabular-nums shrink-0">
                    {postGameSummary.blackAccuracyExact.toFixed(1)}
                  </span>
                </div>
              </div>

              {onOpenFullReport && analysis.moves.length > 0 && (
                <button
                  type="button"
                  data-testid="coach-open-full-report-btn"
                  onClick={onOpenFullReport}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-[#312F2C] hover:bg-[#3C3A37] text-[11px] font-extrabold text-[#E6E2DA] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <BarChart3 className="w-3.5 h-3.5 text-[#81B64C]" />
                  <span>Open Game Review Report</span>
                </button>
              )}
            </div>

            {/* Active Move Verdict Card + Master Cloud Multi-PV */}
            <div className="p-2 rounded bg-[#262421] border border-white/10 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MoveBadge quality={currentMove?.quality ?? 'Good'} size="md" />
                  <div className="min-w-0">
                    {currentMove && currentMeta ? (
                      <>
                        <div className="text-xs font-bold text-[#F2F0EC] truncate">
                          {currentMove.moveNumber}
                          {currentMove.color === 'w' ? '.' : '...'} {currentMove.san}{' '}
                          <span className={currentMeta.textColor}>
                            is {currentMeta.label}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#9E998F] truncate font-mono tabular-nums">
                          {showBestMoveArrow
                            ? `Best move was ${currentMove.bestMoveSan} (-${(currentMove.cpLoss / 100).toFixed(2)})`
                            : `Eval ${evalFormatted}`}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-xs font-bold text-[#F2F0EC] truncate">
                          {mode === 'puzzles'
                            ? 'Tactical Position'
                            : lastMoveSan
                              ? `Last move: ${lastMoveSan}`
                              : 'Opening Position'}
                        </div>
                        <div className="text-[11px] text-[#9E998F] truncate font-mono tabular-nums">
                          {cloudEval?.available && cloudEval.lines[0]?.firstMoveSan
                            ? `Top move ${cloudEval.lines[0].firstMoveSan} · Eval ${cloudEval.lines[0].evalText}`
                            : suggestedMoveSan
                              ? `Top move ${suggestedMoveSan} · Eval ${evalFormatted}`
                              : `Eval ${evalFormatted}`}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    data-testid="sf19-nnue-eval-btn"
                    onClick={() => void fetchCloudEval(activeFen, true)}
                    disabled={cloudLoading}
                    className="px-2 py-1 rounded bg-[#1E1C19] hover:bg-[#312E2A] border border-white/10 text-[11px] font-semibold text-[#AEE076] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    title="Search deeper with analysis engine"
                  >
                    <Cpu className="w-3 h-3" />
                    <span>{cloudLoading ? 'Analyzing...' : 'Deeper Line'}</span>
                  </button>
                  {criticalMoves.length > 0 && (
                    <button
                      type="button"
                      onClick={jumpToNextCritical}
                      className="px-2 py-1 rounded bg-[#312E2A] hover:bg-[#3E3A35] text-[11px] font-semibold text-[#F7C045] flex items-center gap-1 cursor-pointer"
                      title="Jump to next mistake or blunder"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      <span>Next Error</span>
                    </button>
                  )}
                </div>
              </div>

              {smartMove && !isExploring && (
                <div className="pt-1 border-t border-white/8 space-y-1">
                  <p className="text-[11px] text-[#E6E2DA] leading-snug">
                    {currentMove?.classificationNote && currentMove.quality !== 'Book'
                      ? `${currentMove.classificationNote} — ${smartMove.why}`
                      : smartMove.why}
                  </p>
                  {smartMove.betterPlan && (
                    <p className="text-[11px] text-[#AEE076] font-semibold leading-snug">
                      {smartMove.betterPlan}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    <span className="px-1.5 py-0.5 rounded bg-[#1A1917] text-[10px] font-mono font-bold text-[#C8C4BC] tabular-nums">
                      Win {smartMove.winChanceMover}% ({smartMove.winChanceDelta >= 0 ? '+' : ''}
                      {smartMove.winChanceDelta}%)
                    </span>
                    {smartMove.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 rounded bg-[#312E2A] text-[10px] font-semibold text-[#DEDAD2]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {cloudEval && !cloudEval.available && (
                <p className="text-[11px] text-[#9E998F]">
                  Position is terminal — switch to Coach Chat for strategic guidance.
                </p>
              )}

              {cloudEval && cloudEval.available && cloudEval.lines.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-white/8">
                  <div className="flex items-center justify-between gap-2">
                    <div
                      data-testid="engine-source-label"
                      className="text-[11px] font-bold text-[#9B9A97]"
                    >
                      Top Lines
                    </div>
                    {onPlayVariation && cloudEval.lines[selectedLineIdx]?.lineSan.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const targetLine = cloudEval.lines[selectedLineIdx];
                          if (targetLine?.lineSan.length) {
                            onPlayVariation(targetLine.lineSan, activeFen);
                          }
                        }}
                        className="px-2 py-0.5 rounded bg-[#81B64C]/20 hover:bg-[#81B64C]/35 text-[10px] font-bold text-[#AEE076] cursor-pointer"
                      >
                        Play Line
                      </button>
                    )}
                  </div>
                  {cloudEval.lines.slice(0, 3).map((line, idx) => {
                    const blackBetter = line.evalText.trim().startsWith('-');
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setSelectedLineIdx(idx);
                          onHighlightArrow?.({
                            from: line.firstMoveFrom,
                            to: line.firstMoveTo,
                          });
                        }}
                        className={`w-full flex items-center gap-2 text-left px-1.5 py-1 rounded-[4px] text-[12px] cursor-pointer transition-colors ${
                          selectedLineIdx === idx
                            ? 'bg-[#312E2A] ring-1 ring-white/15'
                            : 'bg-[#21201D] hover:bg-[#2C2A27]'
                        }`}
                      >
                        <span
                          className={`min-w-[44px] px-1.5 py-0.5 rounded-[3px] text-center font-mono text-[11px] font-extrabold tabular-nums shrink-0 leading-none ${
                            blackBetter
                              ? 'bg-[#1F1E1B] text-white border border-white/15'
                              : 'bg-white text-[#262421]'
                          }`}
                        >
                          {line.evalText}
                        </span>
                        <span className="font-semibold text-[#E5E3DF] truncate">
                          {line.lineSan.join(' ')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Coach Report Card (Verdict, Key Moments, Strengths & Phase Breakdown) */}
            {analysis.moves.length > 0 && (
              <div
                data-testid="coach-report-summary-card"
                className="p-2.5 rounded-lg bg-[#262421] border border-white/10 space-y-2 text-[11px]"
              >
                <div className="flex items-start gap-2">
                  <div className="shrink-0 mt-0.5">
                    <BotAvatar botId={coachId} size={26} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#AEE076] truncate">
                        {smartInsights.summaryHeadline}
                      </span>
                      <span className="text-[10px] font-semibold text-[#9E998F] shrink-0">
                        {getCoachProfile(coachId).name}
                      </span>
                    </div>
                    <p className="text-[#E6E2DA] leading-snug">
                      {smartInsights.coachVerdict}
                    </p>
                  </div>
                </div>

                {smartInsights.keyMoments.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-white/8">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#9E998F]">
                      Key Moments (Click to Jump)
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {smartInsights.keyMoments.map((km) => (
                        <button
                          key={`${km.kind}-${km.ply}`}
                          type="button"
                          data-testid={`coach-key-moment-${km.ply}`}
                          onClick={() => {
                            setPly(km.ply);
                            onMoveStepCloseSheet?.();
                          }}
                          title={km.note}
                          className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors border ${
                            activePly === km.ply
                              ? 'bg-[#81B64C]/25 border-[#81B64C] text-white'
                              : 'bg-[#1A1917] hover:bg-[#312E2A] border-white/8 text-[#DEDAD2]'
                          }`}
                        >
                          <MoveBadge quality={km.quality} size="sm" />
                          <span>
                            {km.label}: {km.moveNumber}
                            {km.color === 'b' ? '...' : '.'}
                            {km.san}
                          </span>
                          <span className="font-mono text-[#9E998F]">{km.evalSwingText}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1 pt-1 border-t border-white/8 text-[11px] leading-snug">
                  <p className="text-[#C8E89C]">
                    <span className="font-bold text-[#9CD363]">Worked well:</span>{' '}
                    {smartInsights.strengthSummary}
                  </p>
                  <p className="text-[#E6E2DA]">
                    <span className="font-bold text-[#F7C045]">Focus next:</span>{' '}
                    {smartInsights.weaknessSummary}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-1 pt-0.5 font-mono text-[10px] tabular-nums">
                  <div className="px-1.5 py-1 rounded bg-[#1A1917] flex items-center justify-between">
                    <span className="text-[#9E998F]">Open</span>
                    <span className="font-bold text-white">
                      {smartInsights.openingAccuracy !== null
                        ? `${smartInsights.openingAccuracy}%`
                        : '—'}
                    </span>
                  </div>
                  <div className="px-1.5 py-1 rounded bg-[#1A1917] flex items-center justify-between">
                    <span className="text-[#9E998F]">Mid</span>
                    <span className="font-bold text-white">
                      {smartInsights.middlegameAccuracy !== null
                        ? `${smartInsights.middlegameAccuracy}%`
                        : '—'}
                    </span>
                  </div>
                  <div className="px-1.5 py-1 rounded bg-[#1A1917] flex items-center justify-between">
                    <span className="text-[#9E998F]">End</span>
                    <span className="font-bold text-white">
                      {smartInsights.endgameAccuracy !== null
                        ? `${smartInsights.endgameAccuracy}%`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Interactive Evaluation Advantage Graph */}
            <EvalAdvantageChart
              moves={analysis.moves}
              selectedPly={activePly}
              analyzedCount={analyzedCount}
              heightClass="h-[46px]"
              onSelectPly={(ply) => {
                setPly(ply);
                onMoveStepCloseSheet?.();
              }}
            />

            {/* Move Quality Counts Strip */}
            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-mono tabular-nums text-[#C8C4BC]">
              {summaryItems
                .filter(
                  (item) =>
                    (item.quality !== 'Brilliant' && item.quality !== 'Miss') || item.count > 0,
                )
                .map((item) => (
                  <div key={item.quality} className="flex items-center gap-1">
                    <MoveBadge quality={item.quality} size="sm" />
                    <span className={MOVE_QUALITY_META[item.quality].textColor}>
                      {item.label}: {item.count}
                    </span>
                  </div>
                ))}
            </div>

            {/* Progressive Analysis Bar */}
            {isAnalyzing && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-[#9E998F] font-mono tabular-nums">
                  <span>Analyzing moves...</span>
                  <span>
                    {analyzedCount}/{moves.length}
                  </span>
                </div>
                <div className="h-1 w-full bg-[#262421] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#81B64C] transition-all duration-150"
                    style={{
                      width: `${Math.round((analyzedCount / Math.max(1, moves.length)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Full Coach Debrief Card */}
            {debrief ? (
              <div className="p-2.5 rounded-lg bg-[#262421] border border-[#81B64C]/35 space-y-1.5 text-xs">
                <div className="font-bold text-[#9CD363]">{debrief.headline}</div>
                {debrief.gameStory && (
                  <p className="text-[#E6E2DA] leading-snug">{debrief.gameStory}</p>
                )}
                <p className="text-[#DEDAD2] leading-snug">
                  <strong>Strength:</strong> {debrief.strength}
                </p>
                <p className="text-[#DEDAD2] leading-snug">
                  <strong>Priority Fix:</strong> {debrief.priorityFix}
                </p>
                <p className="text-[#E59A28] leading-snug">
                  <strong>Next Drill:</strong> {debrief.sundayDrill}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void runAiDebrief()}
                disabled={debriefLoading}
                className="w-full min-h-[38px] py-1.5 px-3 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[3px] border-[#457524] active:border-b-0 active:translate-y-[2px] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {debriefLoading
                    ? `${getCoachProfile(coachId).name} Reviewing...`
                    : 'Full Coach Debrief'}
                </span>
              </button>
            )}

            {debriefError && <p className="text-xs text-[#F5B8B0]">{debriefError}</p>}
          </div>

          {/* Scrollable Clickable Move List */}
          <div
            ref={moveListRef}
            className="flex-1 overflow-y-auto p-2.5 space-y-1 font-mono text-xs tabular-nums min-h-[140px]"
          >
            {analysis.moves.length === 0 ? (
              <div className="text-center py-6 font-sans text-xs text-[#8E8980]">
                {mode === 'puzzles'
                  ? 'Click any Master Cloud line above to preview best continuations, or switch to Ask AI Tutor.'
                  : 'Play moves on the board to build your live Coach move report.'}
              </div>
            ) : (
              analysis.moves.map((m) => {
                const meta = MOVE_QUALITY_META[m.quality];
                return (
                  <button
                    key={m.ply}
                    type="button"
                    data-coach-ply={m.ply}
                    onClick={() => {
                      setPly(m.ply);
                      onMoveStepCloseSheet?.();
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded text-left cursor-pointer transition-colors ${
                      activePly === m.ply
                        ? 'bg-[#81B64C]/20 text-[#F2F0EC]'
                        : 'hover:bg-white/5 text-[#C8C4BC]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[#8E8980] w-8">
                        {m.moveNumber}
                        {m.color === 'w' ? '.' : '...'}
                      </span>
                      <span className="font-semibold">{m.san}</span>
                      {(m.quality === 'Mistake' ||
                        m.quality === 'Miss' ||
                        m.quality === 'Blunder') &&
                        m.bestMoveSan !== m.san && (
                          <span className="text-[11px] text-[#9E998F] truncate">
                            (best {m.bestMoveSan})
                          </span>
                        )}
                    </div>
                    <span
                      className={`font-sans text-[11px] font-semibold flex items-center gap-1.5 shrink-0 ${meta.textColor}`}
                    >
                      <span>{m.quality}</span>
                      <MoveBadge quality={m.quality} size="sm" />
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* 4-Button Transport Bar */}
          <div className="grid p-3 border-t border-white/10 bg-[#1A1917] grid-cols-4 gap-1.5 shrink-0">
            <button
              type="button"
              aria-label="Start of game"
              disabled={analysis.moves.length === 0}
              onClick={() => setPly(0)}
              className="py-2 rounded bg-[#2B2925] hover:bg-[#383530] flex items-center justify-center cursor-pointer disabled:opacity-40"
            >
              <ChevronFirst className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Previous move"
              disabled={analysis.moves.length === 0}
              onClick={() => setPly(activePly - 1)}
              className="py-2 rounded bg-[#2B2925] hover:bg-[#383530] flex items-center justify-center cursor-pointer disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Next move"
              disabled={analysis.moves.length === 0}
              onClick={() => setPly(activePly + 1)}
              className="py-2 rounded bg-[#2B2925] hover:bg-[#383530] flex items-center justify-center cursor-pointer disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="End of game"
              disabled={analysis.moves.length === 0}
              onClick={() => setPly(analysis.moves.length)}
              className="py-2 rounded bg-[#2B2925] hover:bg-[#383530] flex items-center justify-center cursor-pointer disabled:opacity-40"
            >
              <ChevronLast className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <TutorPanel
          fen={activeFen}
          pgn={pgn}
          mode={mode}
          lastMove={currentMove?.san ?? lastMoveSan}
          evalCp={activeEval}
          playerColor={playerColor}
          suggestedMoveSan={currentMove?.bestMoveSan ?? suggestedMoveSan}
          contextNote={
            currentMove
              ? `Inspecting move ${currentMove.moveNumber}${currentMove.color === 'w' ? '.' : '...'} ${currentMove.san} (${currentMove.quality}, best was ${currentMove.bestMoveSan}).`
              : contextNote
          }
          queuedPrompt={queuedPrompt}
          coachId={coachId}
        />
      )}
    </div>
  );
}
