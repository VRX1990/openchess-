import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  RotateCw,
  Search,
  Settings,
  Share2,
  Star,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
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

const CORE_QUALITY_ROWS: Array<{ quality: MoveQuality; label: string }> = [
  { quality: 'Brilliant', label: 'Brilliant' },
  { quality: 'Great', label: 'Great' },
  { quality: 'Best', label: 'Best' },
  { quality: 'Mistake', label: 'Mistake' },
  { quality: 'Miss', label: 'Miss' },
  { quality: 'Blunder', label: 'Blunder' },
];

const ALL_QUALITY_ROWS: Array<{ quality: MoveQuality; label: string }> = [
  { quality: 'Brilliant', label: 'Brilliant' },
  { quality: 'Great', label: 'Great' },
  { quality: 'Best', label: 'Best' },
  { quality: 'Excellent', label: 'Excellent' },
  { quality: 'Good', label: 'Good' },
  { quality: 'Book', label: 'Book' },
  { quality: 'Inaccuracy', label: 'Inaccuracy' },
  { quality: 'Mistake', label: 'Mistake' },
  { quality: 'Miss', label: 'Miss' },
  { quality: 'Blunder', label: 'Blunder' },
];

export function GameReviewSummaryScreen({
  pgn,
  resultLabel,
  whiteName,
  blackName,
  whiteRating,
  blackRating,
  whiteAvatarId = null,
  blackAvatarId = null,
  whiteAvatarUrl = null,
  blackAvatarUrl = null,
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
  const [showAllQualities, setShowAllQualities] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  // Sync if ReviewView streams updated engine plies while Report modal is open
  useEffect(() => {
    if (!hasSharedMoves || !initialMoves) return;
    setMoves(initialMoves);
    setAnalyzedCount(
      typeof initialAnalyzedCount === 'number' ? initialAnalyzedCount : initialMoves.length,
    );
  }, [hasSharedMoves, initialAnalyzedCount, initialMoves]);

  // Run progressive engine scan when opened directly after a live game (without shared moves)
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
        whiteBaseRating: whiteRating,
        blackBaseRating: blackRating,
      }),
    [blackRating, moves, resultLabel, whiteRating],
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

  const visibleQualityRows = showAllQualities ? ALL_QUALITY_ROWS : CORE_QUALITY_ROWS;
  const hasOpening = moves.length > 0;
  const hasMiddlegame = moves.length >= 16;
  const hasEndgame = moves.length >= 44;

  const handleShare = () => {
    const text = [
      `OpenChess Game Review · ${whiteName} vs ${blackName} (${resultLabel})`,
      `Accuracy: ${whiteName} ${summary.whiteAccuracyExact.toFixed(1)} · ${blackName} ${summary.blackAccuracyExact.toFixed(1)}`,
      `Game Rating: ${summary.whiteGameRating} vs ${summary.blackGameRating}`,
      '',
      pgn,
    ].join('\n');
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedShare(true);
    window.setTimeout(() => setCopiedShare(false), 1800);
  };

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Post-game review report"
      data-testid="post-game-review-screen"
      className="animate-fade-in fixed inset-0 z-[80] bg-[#262421] text-white flex flex-col overflow-hidden"
    >
      {/* Clean Chess.com-style Top Bar */}
      <header className="shrink-0 h-[48px] bg-[#262421] border-b border-white/[0.06] px-3 sm:px-5 flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to board"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[#B8B4AC] hover:text-white hover:bg-white/5 cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <span className="w-5 h-5 rounded-full bg-[#C8C4BC] text-[#262421] inline-flex items-center justify-center shrink-0">
            <Star className="w-3 h-3 fill-current" />
          </span>
          <h1 className="text-[18px] font-extrabold font-display text-white tracking-tight truncate">
            Game Review
          </h1>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onStartReview}
            aria-label="Inspect moves on board"
            title="Self-Analysis"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#B8B4AC] hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <Search className="w-[18px] h-[18px]" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Return to game"
            title="Close report"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#B8B4AC] hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <Settings className="w-[18px] h-[18px]" />
          </button>
        </div>
      </header>

      {/* Scrollable Summary Content */}
      <div className="flex-1 overflow-y-auto px-4 py-2.5">
        <div className="max-w-[420px] mx-auto space-y-2.5">
          {/* Coach Avatar + Crisp White Speech Bubble */}
          {moves.length > 0 && (
            <div
              data-testid="summary-coach-report"
              className="flex items-center gap-3"
            >
              <div className="shrink-0">
                <BotAvatar botId={activeCoach.id} size={46} />
              </div>
              <div className="relative flex-1 min-w-0 rounded-xl bg-white text-[#262421] px-3.5 py-2 text-[12.5px] font-semibold leading-[1.32] shadow-sm">
                <span
                  aria-hidden="true"
                  className="absolute -left-[7px] top-1/2 -translate-y-1/2 w-0 h-0 border-y-[6px] border-y-transparent border-r-[8px] border-r-white"
                />
                {isAnalyzing
                  ? `Reviewing move ${scanTelemetry?.currentMoveSan || Math.max(1, Math.ceil((analyzedCount + 1) / 2))} (${progressPct}%)...`
                  : coachInsights.coachVerdict}
              </div>
            </div>
          )}

          {/* Evaluation Advantage Timeline Graph */}
          <div className="space-y-1">
            <EvalAdvantageChart
              moves={moves}
              selectedPly={moves.length}
              analyzedCount={analyzedCount}
              heightClass="h-[60px]"
              showActiveCursor={false}
              onSelectPly={
                onSelectPly
                  ? (ply) => {
                      onSelectPly(ply);
                      onClose();
                    }
                  : undefined
              }
            />
            {isAnalyzing && (
              <div className="h-1 rounded-full bg-[#1A1917] overflow-hidden">
                <div
                  className="h-full bg-[#81B64C] transition-all duration-150"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            )}
          </div>

          {/* Players + Accuracy Block */}
          <div className="space-y-2">
            {/* Usernames Row */}
            <div className="grid grid-cols-[96px_1fr_1fr] items-center gap-x-2">
              <div />
              <div className="text-center text-[13px] font-bold text-white truncate px-1">
                {whiteName}
              </div>
              <div className="text-center text-[13px] font-bold text-white truncate px-1">
                {blackName}
              </div>
            </div>

            {/* Avatars Row */}
            <div className="grid grid-cols-[96px_1fr_1fr] items-center gap-x-2">
              <div className="text-[13.5px] font-bold text-[#C8C4BC]">Players</div>

              <div className="flex justify-center">
                <div
                  className={`w-[58px] h-[58px] rounded-[9px] bg-[#EAE8E3] flex items-center justify-center overflow-hidden ${
                    whiteWon ? 'ring-[3px] ring-[#81B64C]' : ''
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
                    size={58}
                    rounded="rounded-[9px]"
                  />
                </div>
              </div>

              <div className="flex justify-center">
                <div
                  className={`w-[58px] h-[58px] rounded-[9px] bg-[#1A1917] flex items-center justify-center overflow-hidden ${
                    blackWon ? 'ring-[3px] ring-[#81B64C]' : ''
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
                    size={58}
                    rounded="rounded-[9px]"
                  />
                </div>
              </div>
            </div>

            {/* Accuracy Row */}
            <div className="grid grid-cols-[96px_1fr_1fr] items-center gap-x-2">
              <div className="text-[13.5px] font-bold text-[#C8C4BC]">Accuracy</div>
              <div
                data-testid="summary-white-accuracy"
                className="w-[86px] h-[34px] mx-auto rounded-[7px] bg-white text-[#262421] flex items-center justify-center text-[18px] font-extrabold tabular-nums"
              >
                {summary.whiteAccuracyExact.toFixed(1)}
              </div>
              <div
                data-testid="summary-black-accuracy"
                className="w-[86px] h-[34px] mx-auto rounded-[7px] bg-[#3C3A37] text-white flex items-center justify-center text-[18px] font-extrabold tabular-nums"
              >
                {summary.blackAccuracyExact.toFixed(1)}
              </div>
            </div>
          </div>

          {/* Hairline Divider */}
          <div className="border-t border-white/[0.08]" />

          {/* Move Classification Breakdown (6 Core Rows + Expandable to All 10 Rows) */}
          <div className="space-y-1">
            {visibleQualityRows.map((row) => {
              const meta = MOVE_QUALITY_META[row.quality];
              const wVal = summary.whiteCounts[row.quality];
              const bVal = summary.blackCounts[row.quality];
              return (
                <div
                  key={row.quality}
                  className="grid grid-cols-[96px_1fr_32px_1fr] items-center py-[2px]"
                >
                  <span className="text-[13.5px] font-bold text-[#D6D2CA]">
                    {row.label}
                  </span>
                  <span
                    className={`text-center text-[17px] font-extrabold tabular-nums ${meta.textColor}`}
                  >
                    {wVal}
                  </span>
                  <div className="flex justify-center">
                    <MoveBadge quality={row.quality} size="lg" />
                  </div>
                  <span
                    className={`text-center text-[17px] font-extrabold tabular-nums ${meta.textColor}`}
                  >
                    {bVal}
                  </span>
                </div>
              );
            })}

            {/* Centered Chevron Expand/Collapse Toggle */}
            <div className="grid grid-cols-[96px_1fr_32px_1fr] items-center pt-0.5">
              <div />
              <div />
              <button
                type="button"
                data-testid="summary-toggle-all-moves"
                onClick={() => setShowAllQualities((v) => !v)}
                aria-expanded={showAllQualities}
                aria-label={
                  showAllQualities
                    ? 'Show fewer move classifications'
                    : 'Show all move classifications'
                }
                className="w-8 h-7 mx-auto rounded-md flex items-center justify-center text-[#9E998F] hover:text-white hover:bg-white/5 cursor-pointer"
              >
                {showAllQualities ? (
                  <ChevronUp className="w-5 h-5" />
                ) : (
                  <ChevronDown className="w-5 h-5" />
                )}
              </button>
              <div />
            </div>
          </div>

          {/* Hairline Divider */}
          <div className="border-t border-white/[0.08]" />

          {/* Game Rating + Game Phases (Opening / Middlegame / Endgame) */}
          <div className="space-y-2 pb-1">
            <div className="grid grid-cols-[96px_1fr_1fr] items-center gap-x-2">
              <div className="text-[13.5px] font-bold text-[#C8C4BC] leading-tight">
                Game Rating
              </div>
              <div
                data-testid="summary-white-game-rating"
                className="w-[86px] h-[34px] mx-auto rounded-[7px] bg-white text-[#262421] flex items-center justify-center text-[18px] font-extrabold tabular-nums"
              >
                {summary.whiteGameRating}
              </div>
              <div
                data-testid="summary-black-game-rating"
                className="w-[86px] h-[34px] mx-auto rounded-[7px] bg-[#3C3A37] text-white flex items-center justify-center text-[18px] font-extrabold tabular-nums"
              >
                {summary.blackGameRating}
              </div>
            </div>

            {(
              [
                {
                  label: 'Opening',
                  active: hasOpening,
                  w: summary.whitePhases.opening,
                  b: summary.blackPhases.opening,
                },
                {
                  label: 'Middlegame',
                  active: hasMiddlegame,
                  w: summary.whitePhases.strategy,
                  b: summary.blackPhases.strategy,
                },
                {
                  label: 'Endgame',
                  active: hasEndgame,
                  w: summary.whitePhases.endgame,
                  b: summary.blackPhases.endgame,
                },
              ] as const
            ).map((phase) => (
              <div
                key={phase.label}
                className="grid grid-cols-[96px_1fr_1fr] items-center gap-x-2 py-0.5"
              >
                <span className="text-[13.5px] font-bold text-[#D6D2CA]">
                  {phase.label}
                </span>
                <div className="flex justify-center">
                  {phase.active ? (
                    <MoveBadge quality={phase.w} size="lg" />
                  ) : (
                    <span className="text-base font-bold text-[#7C7870]">-</span>
                  )}
                </div>
                <div className="flex justify-center">
                  {phase.active ? (
                    <MoveBadge quality={phase.b} size="lg" />
                  ) : (
                    <span className="text-base font-bold text-[#7C7870]">-</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Action Footer */}
      <footer className="shrink-0 bg-[#262421] border-t border-white/[0.06] px-4 pt-2.5 pb-3.5">
        <div className="max-w-[420px] mx-auto space-y-2">
          <button
            type="button"
            onClick={onStartReview}
            className="w-full h-[50px] rounded-xl bg-[#81B64C] hover:bg-[#95BB4A] border-b-[4px] border-[#4E7837] active:border-b-0 active:translate-y-[1px] text-white font-extrabold text-[18px] flex items-center justify-center cursor-pointer transition-all shadow-md"
          >
            Start Review
          </button>

          <div className="flex items-center justify-center gap-2">
            {onRematch && (
              <button
                type="button"
                onClick={onRematch}
                disabled={rematchDisabled}
                className="flex-1 h-[36px] rounded-lg bg-[#312F2C] hover:bg-[#3C3A37] text-xs font-bold text-[#F7C045] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>{rematchLabel}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleShare}
              className="flex-1 h-[36px] rounded-lg bg-[#312F2C] hover:bg-[#3C3A37] text-xs font-bold text-[#C8C4BC] hover:text-white flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {copiedShare ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#81B64C]" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onNewGame}
              className="flex-1 h-[36px] rounded-lg bg-[#312F2C] hover:bg-[#3C3A37] text-xs font-bold text-[#C8C4BC] hover:text-white flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Game</span>
            </button>
            {onMessageOpponent && (
              <button
                type="button"
                onClick={onMessageOpponent}
                aria-label="Message opponent"
                title="Message"
                className="w-[36px] h-[36px] rounded-lg bg-[#312F2C] hover:bg-[#3C3A37] text-[#7FC4ED] flex items-center justify-center cursor-pointer shrink-0"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            )}
            {onAddFriendOpponent && (
              <button
                type="button"
                onClick={onAddFriendOpponent}
                aria-label="Add opponent as friend"
                title="Add Friend"
                className="w-[36px] h-[36px] rounded-lg bg-[#312F2C] hover:bg-[#3C3A37] text-[#81B64C] flex items-center justify-center cursor-pointer shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(content, document.body);
  }
  return content;
}
