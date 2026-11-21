import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Plus,
  RotateCw,
  Search,
  Settings,
  Share2,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import { countryCodeToFlagEmoji } from '../chess/analytics';
import {
  buildPostGameReviewSummary,
  extractGameSkeleton,
  type BotId,
  type EvaluatedMove,
  type MoveQuality,
} from '../chess/engine';
import {
  buildSmartGameInsights,
  getCoachProfile,
  type CoachPersonaId,
} from '../chess/coach';
import {
  scanGameWithStockfish19,
  type ScanProgressTelemetry,
} from '../chess/stockfishWorker';
import { EvalAdvantageChart } from './EvalAdvantageChart';
import { PlayerAvatar } from './PlayerAvatar';
import { BotAvatar } from './BotAvatar';
import { MOVE_QUALITY_META, MoveBadge } from './MoveBadge';

export interface GameReviewSummaryScreenProps {
  pgn: string;
  resultLabel: string;
  resultTitle: string;
  whiteName: string;
  blackName: string;
  whiteRating?: number;
  blackRating?: number;
  whiteRatingDelta?: number | null;
  blackRatingDelta?: number | null;
  isRatedMatch?: boolean;
  whiteAvatarId?: BotId | CoachPersonaId | null;
  blackAvatarId?: BotId | CoachPersonaId | null;
  whiteAvatarUrl?: string | null;
  blackAvatarUrl?: string | null;
  whiteFlag?: string | null;
  blackFlag?: string | null;
  currentUsername?: string | null;
  coachId?: CoachPersonaId;
  initialMoves?: EvaluatedMove[];
  initialAnalyzedCount?: number;
  onRematch?: (() => void) | null;
  rematchLabel?: string;
  rematchDisabled?: boolean;
  onAddFriendOpponent?: (() => void) | null;
  onMessageOpponent?: (() => void) | null;
  onSelectPly?: (ply: number) => void;
  onStartReview: () => void;
  onNewGame: () => void;
  onClose: () => void;
}

const QUALITY_ROWS: Array<{
  quality: MoveQuality;
  label: string;
}> = [
  { quality: 'Brilliant', label: 'Brilliant' },
  { quality: 'Great', label: 'Great' },
  { quality: 'Best', label: 'Best' },
  { quality: 'Good', label: 'Good' },
  { quality: 'Book', label: 'Book' },
  { quality: 'Inaccuracy', label: 'Inaccuracy' },
  { quality: 'Mistake', label: 'Mistake' },
  { quality: 'Blunder', label: 'Blunder' },
];

export function GameReviewSummaryScreen({
  pgn,
  resultLabel,
  resultTitle,
  whiteName,
  blackName,
  whiteRating,
  blackRating,
  whiteRatingDelta = null,
  blackRatingDelta = null,
  isRatedMatch = true,
  whiteAvatarId = null,
  blackAvatarId = null,
  whiteAvatarUrl = null,
  blackAvatarUrl = null,
  whiteFlag = null,
  blackFlag = null,
  currentUsername = null,
  coachId = 'viktor',
  initialMoves,
  initialAnalyzedCount,
  onRematch = null,
  rematchLabel = 'Rematch',
  rematchDisabled = false,
  onAddFriendOpponent = null,
  onMessageOpponent = null,
  onSelectPly,
  onStartReview,
  onNewGame,
  onClose,
}: GameReviewSummaryScreenProps) {
  const hasSharedMoves = Array.isArray(initialMoves) && initialMoves.length > 0;
  const [moves, setMoves] = useState<EvaluatedMove[]>(() =>
    hasSharedMoves ? initialMoves : extractGameSkeleton(pgn),
  );
  const [analyzedCount, setAnalyzedCount] = useState<number>(() =>
    hasSharedMoves
      ? typeof initialAnalyzedCount === 'number'
        ? initialAnalyzedCount
        : initialMoves.length
      : 0,
  );
  const [scanTelemetry, setScanTelemetry] = useState<ScanProgressTelemetry | null>(null);
  const [showPerformance, setShowPerformance] = useState(true);
  const [copiedShare, setCopiedShare] = useState(false);

  // Sync if ReviewView streams updated Stockfish 19 plies while Report modal is open
  useEffect(() => {
    if (!hasSharedMoves || !initialMoves) return;
    setMoves(initialMoves);
    setAnalyzedCount(
      typeof initialAnalyzedCount === 'number' ? initialAnalyzedCount : initialMoves.length,
    );
  }, [hasSharedMoves, initialAnalyzedCount, initialMoves]);

  // Run Stockfish 19 WASM progressive scan when opened directly after a live game (without shared moves)
  useEffect(() => {
    if (hasSharedMoves) return;
    const skeleton = extractGameSkeleton(pgn);
    setMoves(skeleton);
    if (skeleton.length === 0) {
      setAnalyzedCount(0);
      return;
    }

    setAnalyzedCount(0);
    const controller = new AbortController();

    void scanGameWithStockfish19({
      skeleton,
      preset: 'fast',
      signal: controller.signal,
      onMovesUpdate: (updated, telemetry) => {
        if (controller.signal.aborted) return;
        setMoves(updated);
        setAnalyzedCount(telemetry.analyzedPlies);
        setScanTelemetry(telemetry);
      },
    });

    return () => {
      controller.abort();
    };
  }, [hasSharedMoves, pgn]);

  const summary = useMemo(
    () =>
      buildPostGameReviewSummary({
        evaluated: moves,
        resultLabel,
        whiteBaseRating: whiteRating ?? 1200,
        blackBaseRating: blackRating ?? 1200,
      }),
    [blackRating, moves, resultLabel, whiteRating],
  );

  const missedWinsWhite = useMemo(
    () => moves.filter((m) => m.color === 'w' && m.isMissedWin).length,
    [moves],
  );
  const missedWinsBlack = useMemo(
    () => moves.filter((m) => m.color === 'b' && m.isMissedWin).length,
    [moves],
  );

  const focusedColor = useMemo(() => {
    if (
      currentUsername &&
      blackName.toLowerCase() === currentUsername.toLowerCase()
    ) {
      return 'b' as const;
    }
    if (blackName.toLowerCase() === 'you') {
      return 'b' as const;
    }
    return 'w' as const;
  }, [blackName, currentUsername]);

  const coachInsights = useMemo(
    () => buildSmartGameInsights(moves, focusedColor, coachId),
    [coachId, focusedColor, moves],
  );
  const activeCoach = useMemo(() => getCoachProfile(coachId), [coachId]);

  const isAnalyzing = moves.length > 0 && analyzedCount < moves.length;
  const whiteWon = resultLabel === '1-0';
  const blackWon = resultLabel === '0-1';
  const progressPct =
    moves.length > 0 ? Math.min(100, Math.round((analyzedCount / moves.length) * 100)) : 100;

  const handleShare = () => {
    const text = [
      `OpenChess Game Review · ${whiteName} vs ${blackName} (${resultLabel})`,
      `Accuracy: ${whiteName} ${summary.whiteAccuracyExact.toFixed(1)}% · ${blackName} ${summary.blackAccuracyExact.toFixed(1)}%`,
      `Game Rating: ${summary.whiteGameRating} vs ${summary.blackGameRating}`,
      '',
      pgn,
    ].join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedShare(true);
    window.setTimeout(() => setCopiedShare(false), 1800);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Post-game review report"
      data-testid="post-game-review-screen"
      className="animate-fade-in fixed inset-0 z-50 bg-[#262421] text-white flex flex-col overflow-hidden"
    >
      {/* Top Header Bar */}
      <header className="shrink-0 h-13 bg-[#262421] border-b border-white/[0.07] px-3 sm:px-5 flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to board"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[#C8C4BC] hover:text-white hover:bg-white/5 cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="text-center min-w-0">
          <h1 className="text-base sm:text-lg font-extrabold font-display text-white tracking-tight">
            Game Review
          </h1>
          <p className="text-[11px] text-[#9E998F] truncate leading-none mt-0.5">
            {resultTitle} ({resultLabel}) · {isRatedMatch ? 'Rated' : 'Casual'}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onStartReview}
            aria-label="Inspect moves on board"
            title="Inspect moves on board"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#C8C4BC] hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Return to game options"
            title="Return to game"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#C8C4BC] hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Scrollable Summary Content */}
      <div className="flex-1 overflow-y-auto px-3.5 sm:px-6 py-3 space-y-4">
        <div className="max-w-lg mx-auto space-y-4">
          {/* Interactive Eval Timeline Graph + Visualized Stockfish 19 Scan Progress */}
          <div className="space-y-1.5">
            <EvalAdvantageChart
              moves={moves}
              selectedPly={moves.length}
              analyzedCount={analyzedCount}
              heightClass="h-20"
              onSelectPly={
                onSelectPly
                  ? (ply) => {
                      onSelectPly(ply);
                      onClose();
                    }
                  : undefined
              }
            />

            <div className="flex items-center justify-between gap-2 px-1 text-[11px] font-mono tabular-nums text-[#9E998F]">
              <span className="flex items-center gap-1.5 min-w-0 truncate">
                <Cpu className="w-3.5 h-3.5 text-[#81B64C] shrink-0" />
                <span className="truncate">
                  {isAnalyzing
                    ? `Analyzing ${scanTelemetry?.currentMoveSan || `move ${Math.max(1, Math.ceil((analyzedCount + 1) / 2))}`}...`
                    : 'Analysis Complete'}
                </span>
              </span>
              <span className="shrink-0 font-bold text-[#C8C4BC]">
                {analyzedCount}/{moves.length} · {progressPct}%
              </span>
            </div>

            {isAnalyzing && (
              <div className="h-1.5 rounded-full bg-[#1A1917] overflow-hidden">
                <div
                  className="h-full bg-[#81B64C] transition-all duration-150"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>

          {/* Players Comparison Header */}
          <div className="grid grid-cols-[96px_1fr_1fr] sm:grid-cols-[120px_1fr_1fr] items-center gap-2.5 text-center">
            <div className="text-left text-xs font-bold text-[#B8B4AC]">Players</div>

            <div className="flex flex-col items-center gap-1 min-w-0">
              <span className="text-xs font-extrabold text-white truncate max-w-full">
                {whiteName} {countryCodeToFlagEmoji(whiteFlag ?? undefined)}
              </span>
              <span
                data-testid="summary-white-rating"
                className="text-[11px] font-mono tabular-nums text-[#C8C4BC] flex items-center justify-center gap-1"
              >
                {typeof whiteRating === 'number' ? (
                  <>
                    <span>({whiteRating})</span>
                    {typeof whiteRatingDelta === 'number' && whiteRatingDelta !== 0 && (
                      <span
                        className={`font-bold ${
                          whiteRatingDelta > 0 ? 'text-[#81B64C]' : 'text-[#FA412D]'
                        }`}
                      >
                        {whiteRatingDelta > 0 ? `+${whiteRatingDelta}` : whiteRatingDelta}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[#9E998F]">(Unrated)</span>
                )}
              </span>
              <div
                className={`w-16 h-16 sm:w-18 sm:h-18 rounded-xl bg-[#EAE8E3] flex items-center justify-center overflow-hidden shadow-md ${
                  whiteWon ? 'ring-3 ring-[#81B64C]' : 'ring-1 ring-white/15'
                }`}
              >
                <PlayerAvatar
                  username={whiteName}
                  botId={whiteAvatarId}
                  avatarUrl={whiteAvatarUrl}
                  isCurrentUser={
                    whiteName.toLowerCase() === 'you' ||
                    Boolean(
                      currentUsername &&
                        whiteName.toLowerCase() === currentUsername.toLowerCase(),
                    )
                  }
                  size={68}
                  rounded="rounded-xl"
                />
              </div>
            </div>

            <div className="flex flex-col items-center gap-1 min-w-0">
              <span className="text-xs font-extrabold text-white truncate max-w-full">
                {blackName} {countryCodeToFlagEmoji(blackFlag ?? undefined)}
              </span>
              <span
                data-testid="summary-black-rating"
                className="text-[11px] font-mono tabular-nums text-[#C8C4BC] flex items-center justify-center gap-1"
              >
                {typeof blackRating === 'number' ? (
                  <>
                    <span>({blackRating})</span>
                    {typeof blackRatingDelta === 'number' && blackRatingDelta !== 0 && (
                      <span
                        className={`font-bold ${
                          blackRatingDelta > 0 ? 'text-[#81B64C]' : 'text-[#FA412D]'
                        }`}
                      >
                        {blackRatingDelta > 0 ? `+${blackRatingDelta}` : blackRatingDelta}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[#9E998F]">(Unrated)</span>
                )}
              </span>
              <div
                className={`w-16 h-16 sm:w-18 sm:h-18 rounded-xl bg-[#1A1917] flex items-center justify-center overflow-hidden shadow-md ${
                  blackWon ? 'ring-3 ring-[#81B64C]' : 'ring-1 ring-white/15'
                }`}
              >
                <PlayerAvatar
                  username={blackName}
                  botId={blackAvatarId}
                  avatarUrl={blackAvatarUrl}
                  isCurrentUser={
                    blackName.toLowerCase() === 'you' ||
                    Boolean(
                      currentUsername &&
                        blackName.toLowerCase() === currentUsername.toLowerCase(),
                    )
                  }
                  size={68}
                  rounded="rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Accuracy Boxes */}
          <div className="grid grid-cols-[96px_1fr_1fr] sm:grid-cols-[120px_1fr_1fr] items-center gap-2.5">
            <div className="text-xs font-bold text-[#B8B4AC]">Accuracy</div>
            <div className="py-2 rounded-lg bg-[#EAE8E3] text-[#1D1B18] text-center font-mono text-lg font-black tabular-nums shadow-sm">
              {summary.whiteAccuracyExact.toFixed(1)}
            </div>
            <div className="py-2 rounded-lg bg-[#393734] text-white text-center font-mono text-lg font-black tabular-nums border border-white/10">
              {summary.blackAccuracyExact.toFixed(1)}
            </div>
          </div>

          {/* Coach Report & Key Moments Card */}
          {moves.length > 0 && (
            <div
              data-testid="summary-coach-report"
              className="rounded-xl bg-[#1E1C19] border border-white/10 p-3 space-y-2.5 text-xs"
            >
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 mt-0.5">
                  <BotAvatar botId={activeCoach.id} size={32} />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-[#AEE076] truncate">
                      {coachInsights.summaryHeadline}
                    </span>
                    <span className="text-[11px] font-semibold text-[#9E998F] shrink-0">
                      {activeCoach.name}
                    </span>
                  </div>
                  <p className="text-[#E6E2DA] leading-snug">
                    {coachInsights.coachVerdict}
                  </p>
                </div>
              </div>

              {coachInsights.keyMoments.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t border-white/8">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#9E998F]">
                    Key Moments
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {coachInsights.keyMoments.map((km) => (
                      <button
                        key={`${km.kind}-${km.ply}`}
                        type="button"
                        onClick={() => {
                          onSelectPly?.(km.ply);
                          onClose();
                        }}
                        title={km.note}
                        className="px-2.5 py-1 rounded-lg bg-[#262421] hover:bg-[#312E2A] border border-white/10 text-[11px] font-bold text-[#DEDAD2] flex items-center gap-1.5 cursor-pointer"
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

              <div className="space-y-1 pt-2 border-t border-white/8 text-[11px] leading-snug">
                <p className="text-[#C8E89C]">
                  <span className="font-bold text-[#9CD363]">Worked well:</span>{' '}
                  {coachInsights.strengthSummary}
                </p>
                <p className="text-[#E6E2DA]">
                  <span className="font-bold text-[#F7C045]">Focus next:</span>{' '}
                  {coachInsights.weaknessSummary}
                </p>
                <p className="text-[#DEDAD2]">
                  <span className="font-bold text-[#E59A28]">Practice plan:</span>{' '}
                  {coachInsights.focusDrill}
                </p>
              </div>
            </div>
          )}

          {/* Per-Move Quality Breakdown Table */}
          <div className="border-t border-white/10 pt-2.5 space-y-1.5">
            {QUALITY_ROWS.map((row) => {
              const meta = MOVE_QUALITY_META[row.quality];
              const wVal = summary.whiteCounts[row.quality];
              const bVal = summary.blackCounts[row.quality];
              return (
                <div
                  key={row.quality}
                  className="grid grid-cols-[96px_1fr_32px_1fr] sm:grid-cols-[120px_1fr_36px_1fr] items-center gap-2 py-0.5"
                >
                  <span className="text-xs font-bold text-[#D6D2CA]">{row.label}</span>
                  <span
                    className={`text-center font-mono text-sm font-extrabold tabular-nums ${meta.textColor}`}
                  >
                    {wVal}
                  </span>
                  <div className="flex justify-center">
                    <MoveBadge quality={row.quality} size="sm" />
                  </div>
                  <span
                    className={`text-center font-mono text-sm font-extrabold tabular-nums ${meta.textColor}`}
                  >
                    {bVal}
                  </span>
                </div>
              );
            })}

            {(missedWinsWhite > 0 || missedWinsBlack > 0) && (
              <div className="grid grid-cols-[96px_1fr_32px_1fr] sm:grid-cols-[120px_1fr_36px_1fr] items-center gap-2 py-0.5">
                <span className="text-xs font-bold text-[#D6D2CA]">Missed Win</span>
                <span className="text-center font-mono text-sm font-extrabold tabular-nums text-[#E59A28]">
                  {missedWinsWhite}
                </span>
                <div className="flex justify-center text-xs font-mono font-extrabold text-[#E59A28]">
                  ×
                </div>
                <span className="text-center font-mono text-sm font-extrabold tabular-nums text-[#E59A28]">
                  {missedWinsBlack}
                </span>
              </div>
            )}
          </div>

          {/* Collapse / Expand Divider */}
          <div className="flex items-center justify-center border-t border-white/10 pt-2">
            <button
              type="button"
              onClick={() => setShowPerformance((v) => !v)}
              aria-expanded={showPerformance}
              aria-label={showPerformance ? 'Hide performance ratings' : 'Show performance ratings'}
              className="px-4 py-1 rounded-full text-[#9E998F] hover:text-white cursor-pointer"
            >
              {showPerformance ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Game Rating + Phase Breakdown */}
          {showPerformance && (
            <div className="space-y-3 pb-2 animate-view-enter">
              <div className="grid grid-cols-[96px_1fr_1fr] sm:grid-cols-[120px_1fr_1fr] items-center gap-2.5">
                <div className="text-xs font-bold text-[#B8B4AC]">Game Rating</div>
                <div className="py-2 rounded-lg bg-[#EAE8E3] text-[#1D1B18] text-center font-mono text-lg font-black tabular-nums shadow-sm">
                  {summary.whiteGameRating}
                </div>
                <div className="py-2 rounded-lg bg-[#393734] text-white text-center font-mono text-lg font-black tabular-nums border border-white/10">
                  {summary.blackGameRating}
                </div>
              </div>

              {(
                [
                  { label: 'Opening', w: summary.whitePhases.opening, b: summary.blackPhases.opening },
                  { label: 'Tactics', w: summary.whitePhases.tactics, b: summary.blackPhases.tactics },
                  { label: 'Strategy', w: summary.whitePhases.strategy, b: summary.blackPhases.strategy },
                  { label: 'Endgame', w: summary.whitePhases.endgame, b: summary.blackPhases.endgame },
                ] as const
              ).map((phase) => (
                <div
                  key={phase.label}
                  className="grid grid-cols-[96px_1fr_1fr] sm:grid-cols-[120px_1fr_1fr] items-center gap-2.5 py-0.5"
                >
                  <span className="text-xs font-bold text-[#D6D2CA]">{phase.label}</span>
                  <div className="flex justify-center">
                    <MoveBadge quality={phase.w} size="md" />
                  </div>
                  <div className="flex justify-center">
                    <MoveBadge quality={phase.b} size="md" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Action Dock */}
      <footer className="shrink-0 bg-[#21201D] border-t border-white/10 px-3.5 sm:px-6 py-3">
        <div className="max-w-lg mx-auto space-y-2.5">
          {(onRematch || onMessageOpponent || onAddFriendOpponent) && (
            <div className="flex items-center gap-2">
              {onRematch && (
                <button
                  type="button"
                  onClick={onRematch}
                  disabled={rematchDisabled}
                  className="flex-1 min-h-[42px] rounded-xl bg-[#393734] hover:bg-[#45423E] border-b-[3px] border-[#262421] text-xs font-extrabold text-[#F7C045] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>{rematchLabel}</span>
                </button>
              )}
              {onMessageOpponent && (
                <button
                  type="button"
                  onClick={onMessageOpponent}
                  className="min-h-[42px] px-3 rounded-xl bg-[#393734] hover:bg-[#45423E] text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-[#7FC4ED]" />
                  <span>Message</span>
                </button>
              )}
              {onAddFriendOpponent && (
                <button
                  type="button"
                  onClick={onAddFriendOpponent}
                  className="min-h-[42px] px-3 rounded-xl bg-[#393734] hover:bg-[#45423E] text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5 text-[#81B64C]" />
                  <span>Add Friend</span>
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleShare}
              className="min-h-[44px] rounded-xl bg-[#393734] hover:bg-[#45423E] border-b-[3px] border-[#262421] text-xs sm:text-sm font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer"
            >
              {copiedShare ? (
                <>
                  <Check className="w-4 h-4 text-[#81B64C]" />
                  <span>Copied Report!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-[#DEDAD2]" />
                  <span>Share</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onNewGame}
              className="min-h-[44px] rounded-xl bg-[#393734] hover:bg-[#45423E] border-b-[3px] border-[#262421] text-xs sm:text-sm font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#DEDAD2]" />
              <span>New Game</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onStartReview}
            className="w-full min-h-[50px] rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-4 border-[#457524] active:border-b-0 active:translate-y-[1px] text-white font-extrabold text-base flex items-center justify-center cursor-pointer transition-all"
          >
            Start Review
          </button>
        </div>
      </footer>
    </div>
  );
}
