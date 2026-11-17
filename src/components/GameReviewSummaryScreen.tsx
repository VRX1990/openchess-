import { useEffect, useMemo, useState } from 'react';
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
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import { countryCodeToFlagEmoji } from '../chess/analytics';
import {
  buildPostGameReviewSummary,
  evaluateMovesBatch,
  extractGameSkeleton,
  type BotId,
  type EvaluatedMove,
  type MoveQuality,
} from '../chess/engine';
import type { CoachPersonaId } from '../chess/coach';
import { PlayerAvatar } from './PlayerAvatar';
import { MOVE_QUALITY_META, MoveBadge } from './MoveBadge';

export interface GameReviewSummaryScreenProps {
  pgn: string;
  resultLabel: string;
  resultTitle: string;
  whiteName: string;
  blackName: string;
  whiteRating?: number;
  blackRating?: number;
  whiteAvatarId?: BotId | CoachPersonaId | null;
  blackAvatarId?: BotId | CoachPersonaId | null;
  whiteAvatarUrl?: string | null;
  blackAvatarUrl?: string | null;
  whiteFlag?: string | null;
  blackFlag?: string | null;
  currentUsername?: string | null;
  onRematch?: (() => void) | null;
  rematchLabel?: string;
  rematchDisabled?: boolean;
  onAddFriendOpponent?: (() => void) | null;
  onMessageOpponent?: (() => void) | null;
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
  whiteAvatarId = null,
  blackAvatarId = null,
  whiteAvatarUrl = null,
  blackAvatarUrl = null,
  whiteFlag = null,
  blackFlag = null,
  currentUsername = null,
  onRematch = null,
  rematchLabel = 'Rematch',
  rematchDisabled = false,
  onAddFriendOpponent = null,
  onMessageOpponent = null,
  onStartReview,
  onNewGame,
  onClose,
}: GameReviewSummaryScreenProps) {
  const [moves, setMoves] = useState<EvaluatedMove[]>(() => extractGameSkeleton(pgn));
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [showPerformance, setShowPerformance] = useState(true);
  const [copiedShare, setCopiedShare] = useState(false);

  // Progressive chunked evaluation so long games never freeze UI on game over
  useEffect(() => {
    const skeleton = extractGameSkeleton(pgn);
    setMoves(skeleton);
    if (skeleton.length === 0) {
      setAnalyzedCount(0);
      return;
    }

    setAnalyzedCount(0);
    let cancelled = false;
    const working = [...skeleton];
    let idx = 0;

    const step = () => {
      if (cancelled) return;
      idx = evaluateMovesBatch(working, idx, 8, 14);
      setMoves([...working]);
      setAnalyzedCount(idx);
      if (idx < working.length) {
        window.setTimeout(step, 8);
      }
    };

    const timer = window.setTimeout(step, 16);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pgn]);

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

  const isAnalyzing = moves.length > 0 && analyzedCount < moves.length;
  const whiteWon = resultLabel === '1-0';
  const blackWon = resultLabel === '0-1';

  // White-vs-Black Eval Area Graph SVG coordinates
  const graphData = useMemo(() => {
    const w = 360;
    const h = 84;
    const midY = h / 2;
    const pts = moves.length > 0 ? [0, ...moves.map((m) => m.evalCp)] : [0, 0];
    const total = Math.max(1, pts.length - 1);

    const coords = pts.map((cp, i) => {
      const x = (i / total) * w;
      const clamped = Math.max(-700, Math.min(700, cp));
      // White advantage rises UP (y closer to 0), Black advantage drops DOWN (y closer to h)
      const norm = clamped / 700;
      const y = midY - norm * (h * 0.44);
      return { x, y, move: i > 0 ? moves[i - 1] : null };
    });

    const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`;

    const keyDots = coords.filter(
      (c) =>
        c.move &&
        (c.move.quality === 'Brilliant' ||
          c.move.quality === 'Great' ||
          c.move.quality === 'Inaccuracy' ||
          c.move.quality === 'Mistake' ||
          c.move.quality === 'Blunder'),
    );

    return { w, h, midY, areaPath, linePath, keyDots };
  }, [moves]);

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
      {/* Top Header Bar matching reference */}
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
            {resultTitle} ({resultLabel})
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
          {/* Eval Timeline Area Graph */}
          <div className="rounded-xl overflow-hidden bg-[#1A1917] border border-white/10 shadow-inner">
            <svg
              viewBox={`0 0 ${graphData.w} ${graphData.h}`}
              className="w-full h-20 block"
              preserveAspectRatio="none"
              aria-label="Game evaluation advantage timeline"
            >
              <rect x="0" y="0" width={graphData.w} height={graphData.h} fill="#2A2824" />
              <path d={graphData.areaPath} fill="#F2F0EC" />
              <line
                x1="0"
                y1={graphData.midY}
                x2={graphData.w}
                y2={graphData.midY}
                stroke="rgba(120,115,105,0.45)"
                strokeWidth="1"
              />
              <path
                d={graphData.linePath}
                fill="none"
                stroke="#9E998F"
                strokeWidth="1.5"
              />
              {graphData.keyDots.map((dot, idx) => {
                const dotColor = dot.move ? MOVE_QUALITY_META[dot.move.quality].bg : '#81B64C';
                return (
                  <circle
                    key={idx}
                    cx={dot.x}
                    cy={dot.y}
                    r="3.2"
                    fill={dotColor}
                    stroke="#1D1B18"
                    strokeWidth="1"
                  />
                );
              })}
            </svg>
            {isAnalyzing && (
              <div className="h-1 bg-[#1A1917]">
                <div
                  className="h-full bg-[#81B64C] transition-all duration-100"
                  style={{
                    width: `${Math.round((analyzedCount / Math.max(1, moves.length)) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>

          {/* Players Comparison Header */}
          <div className="grid grid-cols-[96px_1fr_1fr] sm:grid-cols-[120px_1fr_1fr] items-center gap-2.5 text-center">
            <div className="text-left text-xs font-bold text-[#B8B4AC]">Players</div>

            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <span className="text-xs font-extrabold text-white truncate max-w-full">
                {whiteName} {countryCodeToFlagEmoji(whiteFlag ?? undefined)}
              </span>
              <div
                className={`w-16 h-16 sm:w-18 sm:h-18 rounded-xl bg-[#EAE8E3] flex items-center justify-center overflow-hidden shadow-md ${
                  whiteWon
                    ? 'ring-3 ring-[#81B64C]'
                    : 'ring-1 ring-white/15'
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

            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <span className="text-xs font-extrabold text-white truncate max-w-full">
                {blackName} {countryCodeToFlagEmoji(blackFlag ?? undefined)}
              </span>
              <div
                className={`w-16 h-16 sm:w-18 sm:h-18 rounded-xl bg-[#1A1917] flex items-center justify-center overflow-hidden shadow-md ${
                  blackWon
                    ? 'ring-3 ring-[#81B64C]'
                    : 'ring-1 ring-white/15'
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
                  <span className={`text-center font-mono text-sm font-extrabold tabular-nums ${meta.textColor}`}>
                    {wVal}
                  </span>
                  <div className="flex justify-center">
                    <MoveBadge quality={row.quality} size="sm" />
                  </div>
                  <span className={`text-center font-mono text-sm font-extrabold tabular-nums ${meta.textColor}`}>
                    {bVal}
                  </span>
                </div>
              );
            })}
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

          {/* Game Rating + Phase Breakdown (Opening / Tactics / Strategy / Endgame) */}
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
