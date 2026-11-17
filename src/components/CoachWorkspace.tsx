import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color } from 'chess.js';
import {
  AlertTriangle,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Sparkles,
} from 'lucide-react';
import {
  analyzeClientStockfish19Nnue,
  computeClientStockfish19NnueMultiPv,
  evaluateMovesBatch,
  extractGameSkeleton,
  summarizeGameReview,
  type EvaluatedMove,
  type MoveQuality,
} from '../chess/engine';
import type { CloudEvalSummary } from '../chess/lichess';
import {
  buildSmartGameInsights,
  buildSmartMoveAnalysis,
  getCoachProfile,
  type CoachPersonaId,
} from '../chess/coach';
import { MOVE_QUALITY_META, MoveBadge } from './MoveBadge';
import { TutorPanel } from './TutorPanel';

export interface AiDebrief {
  headline: string;
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
  queuedPrompt?: { id: number; text: string } | null;
  defaultTab?: 'report' | 'tutor';
  onMoveStepCloseSheet?: () => void;
  coachId?: CoachPersonaId;
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
  queuedPrompt = null,
  defaultTab = 'report',
  onMoveStepCloseSheet,
  coachId = 'viktor',
}: CoachWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'report' | 'tutor'>(defaultTab);
  const [internalMoves, setInternalMoves] = useState<EvaluatedMove[]>([]);
  const [internalAnalyzedCount, setInternalAnalyzedCount] = useState(0);
  const [internalPly, setInternalPly] = useState<number>(0);

  const [cloudEval, setCloudEval] = useState<(CloudEvalSummary & { available: boolean }) | null>(
    null,
  );
  const [cloudLoading, setCloudLoading] = useState(false);
  const [selectedLineIdx, setSelectedLineIdx] = useState<number>(0);
  const cloudCacheRef = useRef<Map<string, CloudEvalSummary & { available: boolean }>>(new Map());
  const latestCloudFenRef = useRef<string>('');

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
        setInternalPly(clamped);
      }
    },
    [moves.length, onSelectPly],
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
    if (currentMove) return currentMove.fenAfter;
    if (moves.length > 0 && activePly === 0) {
      return moves[0].fenBefore;
    }
    return fen;
  }, [activePly, currentMove, fen, moves]);

  const activeEval = currentMove ? currentMove.evalCp : evalCp;
  const currentMeta = currentMove ? MOVE_QUALITY_META[currentMove.quality] : null;

  const criticalMoves = useMemo(
    () =>
      analysis.moves.filter(
        (m) => m.quality === 'Blunder' || m.quality === 'Mistake' || m.quality === 'Inaccuracy',
      ),
    [analysis.moves],
  );

  const jumpToNextCritical = () => {
    if (criticalMoves.length === 0) return;
    const next = criticalMoves.find((m) => m.ply > activePly) ?? criticalMoves[0];
    setPly(next.ply);
    onMoveStepCloseSheet?.();
  };

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
      setCloudLoading(true);
      // 1. Run Client-Side Stockfish 19 NNUE immediately in the browser
      const clientSf19 = await analyzeClientStockfish19Nnue(targetFen, 19, 3);
      if (clientSf19.available && clientSf19.lines.length > 0) {
        const clientPayload: CloudEvalSummary & { available: boolean } = {
          available: true,
          source: 'stockfish-19-nnue',
          depth: clientSf19.depth,
          knodes: clientSf19.knodes,
          lines: clientSf19.lines,
        };
        cloudCacheRef.current.set(targetFen, clientPayload);
        if (latestCloudFenRef.current === targetFen) {
          setCloudEval(clientPayload);
          setSelectedLineIdx(0);
        }
      }
      try {
        const res = await fetch(`/api/lichess/eval?fen=${encodeURIComponent(targetFen)}`);
        const data = (await res.json()) as CloudEvalSummary & { available: boolean };
        if (data?.available && Array.isArray(data.lines) && data.lines.length > 0) {
          const enriched: CloudEvalSummary & { available: boolean } = {
            ...data,
            source: 'stockfish-19-nnue',
            depth: Math.max(19, data.depth || 19),
            lines:
              data.lines.length >= 2 || !clientSf19.available
                ? data.lines
                : [
                    data.lines[0],
                    ...clientSf19.lines.filter(
                      (l) => l.firstMoveSan !== data.lines[0]?.firstMoveSan,
                    ),
                  ].slice(0, 3),
          };
          cloudCacheRef.current.set(targetFen, enriched);
          if (latestCloudFenRef.current !== targetFen) return;
          setCloudEval(enriched);
          setSelectedLineIdx(0);
        } else if (!clientSf19.available && latestCloudFenRef.current === targetFen) {
          setCloudEval({ available: false, depth: 0, knodes: 0, lines: [] });
        }
      } catch {
        if (latestCloudFenRef.current !== targetFen) return;
        if (!clientSf19.available) {
          const syncFallback = computeClientStockfish19NnueMultiPv(targetFen, 19, 3);
          setCloudEval({
            available: syncFallback.available,
            source: 'stockfish-19-nnue',
            depth: syncFallback.depth,
            knodes: syncFallback.knodes,
            lines: syncFallback.lines,
          });
        }
      } finally {
        if (latestCloudFenRef.current === targetFen) {
          setCloudLoading(false);
        }
      }
    },
    [],
  );

  // Auto-load Client-Side Stockfish 19 NNUE Multi-PV lines whenever Report tab & position settle
  useEffect(() => {
    if (activeTab !== 'report') return;
    latestCloudFenRef.current = activeFen;
    const cached = cloudCacheRef.current.get(activeFen);
    if (cached) {
      setCloudEval(cached);
      setSelectedLineIdx(0);
      return;
    }
    const timer = window.setTimeout(() => {
      void fetchCloudEval(activeFen);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [activeFen, activeTab, fetchCloudEval]);

  const runAiDebrief = async () => {
    if (debriefLoading) return;
    setDebriefLoading(true);
    setDebriefError(null);
    try {
      const keyMoments = analysis.moves
        .filter(
          (m) =>
            m.quality === 'Mistake' ||
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

  const sparkPoints = useMemo(() => {
    const w = 320;
    const h = 54;
    if (analysis.moves.length === 0) {
      const clamped = Math.max(-600, Math.min(600, activeEval));
      const y = h / 2 - (clamped / 600) * (h / 2 - 4);
      return `0,${y.toFixed(1)} ${w},${y.toFixed(1)}`;
    }
    return analysis.moves
      .map((m, i) => {
        const x =
          analysis.moves.length === 1
            ? w / 2
            : (i / (analysis.moves.length - 1)) * w;
        const clamped = Math.max(-600, Math.min(600, m.evalCp));
        const y = h / 2 - (clamped / 600) * (h / 2 - 4);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [activeEval, analysis.moves]);

  const showBestMoveArrow =
    currentMove &&
    (currentMove.quality === 'Inaccuracy' ||
      currentMove.quality === 'Mistake' ||
      currentMove.quality === 'Blunder') &&
    currentMove.bestMoveSan !== currentMove.san;

  const summaryItems: { quality: MoveQuality; label: string; count: number }[] = [
    { quality: 'Brilliant', label: 'Bril', count: analysis.counts.Brilliant },
    {
      quality: 'Best',
      label: 'Best',
      count: analysis.counts.Best + analysis.counts.Book + analysis.counts.Great,
    },
    { quality: 'Inaccuracy', label: 'Inacc', count: analysis.counts.Inaccuracy },
    { quality: 'Mistake', label: 'Mist', count: analysis.counts.Mistake },
    { quality: 'Blunder', label: 'Blun', count: analysis.counts.Blunder },
  ];

  const evalFormatted =
    Math.abs(activeEval) >= 90000
      ? activeEval > 0
        ? 'White Mate'
        : 'Black Mate'
      : `${activeEval >= 0 ? '+' : ''}${(activeEval / 100).toFixed(2)}`;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden bg-[#21201D]">
      {/* Exact Reference Two-Tab Header: Coach Report | Ask AI Tutor */}
      <div
        role="tablist"
        aria-label="Coach workspace tabs"
        className="grid grid-cols-2 bg-[#1A1917] border-b border-white/10 p-1 gap-1 shrink-0"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'report'}
          onClick={() => setActiveTab('report')}
          className={`py-2 px-2 rounded text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'report'
              ? 'bg-[#312E2A] text-[#F2F0EC]'
              : 'text-[#9E998F] hover:text-[#F2F0EC]'
          }`}
        >
          Coach Report
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tutor'}
          onClick={() => setActiveTab('tutor')}
          className={`py-2 px-2 rounded text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === 'tutor'
              ? 'bg-[#312E2A] text-[#F2F0EC]'
              : 'text-[#9E998F] hover:text-[#F2F0EC]'
          }`}
        >
          Ask AI Tutor
        </button>
      </div>

      {activeTab === 'report' ? (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="p-2 border-b border-white/10 space-y-1.5 bg-[#1A1917] shrink-0 overflow-y-auto max-h-[68%]">
            {/* 2-col Accuracy Cards */}
            <div className="grid grid-cols-2 gap-1.5">
              <div className="p-2 rounded bg-[#262421] border border-white/8 flex items-center justify-between">
                <span className="text-xs text-[#B8B4AC]">White Acc.</span>
                <span className="font-mono text-base font-bold text-[#F2F0EC] tabular-nums">
                  {analysis.whiteAccuracy}%
                </span>
              </div>
              <div className="p-2 rounded bg-[#262421] border border-white/8 flex items-center justify-between">
                <span className="text-xs text-[#B8B4AC]">Black Acc.</span>
                <span className="font-mono text-base font-bold text-[#F2F0EC] tabular-nums">
                  {analysis.blackAccuracy}%
                </span>
              </div>
            </div>

            {/* Active Move Verdict Card + Master Cloud Multi-PV */}
            <div className="p-2.5 rounded bg-[#262421] border border-white/10 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
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
                    title="Stockfish 19 NNUE (Client-Side Multi-PV)"
                  >
                    <Cpu className="w-3 h-3" />
                    <span>{cloudLoading ? '...' : 'SF 19 NNUE'}</span>
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

              {smartMove && (
                <div className="pt-1.5 border-t border-white/8 space-y-1">
                  <p className="text-[11px] text-[#E6E2DA] leading-snug">
                    {smartMove.why}
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
                  Engine lines unavailable offline — switch to Ask AI Tutor for strategic advice.
                </p>
              )}

              {cloudEval && cloudEval.available && cloudEval.lines.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-white/8">
                  <div
                    data-testid="engine-source-label"
                    className="text-[10px] font-mono text-[#9E998F] tabular-nums"
                  >
                    {`Stockfish 19 NNUE (Client-Side) · Depth ${Math.max(19, cloudEval.depth || 19)}`}
                  </div>
                  {cloudEval.lines.slice(0, 3).map((line, idx) => (
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
                      className={`w-full flex items-center gap-2 text-left px-2 py-1 rounded font-mono text-[11px] tabular-nums cursor-pointer transition-colors ${
                        selectedLineIdx === idx
                          ? 'bg-[#312E2A] ring-1 ring-[#81B64C]/40'
                          : 'bg-[#1A1917] hover:bg-[#312E2A]'
                      }`}
                    >
                      <span className="font-bold text-[#81B64C] w-11 shrink-0">
                        {line.evalText}
                      </span>
                      <span className="text-[#DEDAD2] truncate">
                        {line.lineSan.join(' ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Smart Game Insights Strip (Phase Accuracies + Turning Point) */}
            {analysis.moves.length > 0 && (
              <div className="p-2 rounded bg-[#262421] border border-white/8 space-y-1.5 text-[11px]">
                <div className="font-bold text-[#AEE076] truncate">
                  {smartInsights.summaryHeadline}
                </div>
                <p className="text-[#D6D2CA] leading-snug">{smartInsights.coachVerdict}</p>
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

            {/* Evaluation Timeline SVG Sparkline */}
            <div className="bg-[#262421] rounded border border-white/8 p-1">
              <svg viewBox="0 0 320 54" className="w-full h-8" aria-label="Evaluation timeline">
                <line
                  x1="0"
                  y1="27"
                  x2="320"
                  y2="27"
                  stroke="rgba(255,255,255,0.14)"
                  strokeWidth="1"
                />
                <polyline
                  fill="none"
                  stroke="#81B64C"
                  strokeWidth="2"
                  points={sparkPoints}
                />
              </svg>
            </div>

            {/* Move Quality Counts Strip */}
            <div className="flex items-center justify-between gap-1 text-[11px] font-mono tabular-nums text-[#C8C4BC]">
              {summaryItems
                .filter((item) => item.quality !== 'Brilliant' || item.count > 0)
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

            {/* Generate Coach Review CTA / Debrief Card */}
            {debrief ? (
              <div className="p-3 rounded bg-[#262421] border border-[#81B64C]/35 space-y-1.5 text-xs">
                <div className="font-bold text-[#9CD363]">{debrief.headline}</div>
                <p className="text-[#DEDAD2]">
                  <strong>Strength:</strong> {debrief.strength}
                </p>
                <p className="text-[#DEDAD2]">
                  <strong>Priority Fix:</strong> {debrief.priorityFix}
                </p>
                <p className="text-[#E59A28]">
                  <strong>Daily Sharping Drill:</strong> {debrief.sundayDrill}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void runAiDebrief()}
                disabled={debriefLoading}
                className="w-full min-h-[44px] py-2 px-3 rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-4 border-[#457524] active:border-b-0 active:translate-y-[2px] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {debriefLoading
                    ? 'Coach OpenChess Reviewing...'
                    : 'Generate Coach Review'}
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
                      {(m.quality === 'Mistake' || m.quality === 'Blunder') &&
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
