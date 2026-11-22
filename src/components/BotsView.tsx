import { useId, useState } from 'react';
import type { Color, PieceSymbol } from 'chess.js';
import { ArrowLeft, ChevronDown, Crown, FlipVertical2, Settings } from 'lucide-react';
import {
  BOT_PROFILES,
  MAX_BOT_ELO,
  MIN_BOT_ELO,
  getBotTierMeta,
  getNearestBotForElo,
  type BotId,
  type BotProfile,
} from '../chess/engine';
import { BOT_FLAGS, BOT_GREETINGS } from '../chess/botSpeech';
import { loadBeatenBots } from '../chess/analytics';
import type { BoardTheme } from '../chess/theme';
import { TIME_CONTROLS } from './PlayView';
import { BotAvatar } from './BotAvatar';
import { PlayerAvatar } from './PlayerAvatar';
import { ChessBoard } from './ChessBoard';
import { NavBotsIcon } from './ChessIcons';

interface BotsViewProps {
  initialBotId?: BotId;
  boardTheme?: BoardTheme;
  playerUsername?: string;
  playerAvatarUrl?: string;
  onBack: () => void;
  onStartMatch: (opts: {
    botId: BotId;
    botElo: number;
    timeId: string;
    color: Color | 'random';
    coachGuard: boolean;
    initialMove?: { from: string; to: string; promotion?: PieceSymbol };
  }) => void;
}

const BOT_TIERS: { label: string; tier: BotProfile['tier'] }[] = [
  { label: 'New to Chess', tier: 'New to Chess' },
  { label: 'Beginner', tier: 'Beginner' },
  { label: 'Intermediate', tier: 'Intermediate' },
  { label: 'Advanced', tier: 'Advanced' },
  { label: 'Master', tier: 'Master' },
  { label: 'Grandmaster', tier: 'Grandmaster' },
];

/** Checkered mini-board + clock icon for the Options button */
function OptionsBoardClockIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="2.5" y="3" width="15" height="15" rx="2" fill="#E6E4DF" />
      <rect x="2.5" y="3" width="5" height="5" rx="1" fill="#5A5854" />
      <rect x="12.5" y="3" width="5" height="5" fill="#5A5854" />
      <rect x="7.5" y="8" width="5" height="5" fill="#5A5854" />
      <rect x="2.5" y="13" width="5" height="5" fill="#5A5854" />
      <rect x="12.5" y="13" width="5" height="5" fill="#5A5854" />
      <circle cx="16.5" cy="16.5" r="5.5" fill="#262421" stroke="#D7D5D0" strokeWidth="1.6" />
      <path d="M16.5 13.8V16.6L18.4 17.7" stroke="#D7D5D0" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Crisp King piece outline icon for White/Black color picker buttons */
function PickerKingIcon({ variant }: { variant: 'w' | 'b' }) {
  const isWhite = variant === 'w';
  return (
    <svg viewBox="0 0 40 40" className="w-[26px] h-[26px]" fill="none" aria-hidden="true">
      <path
        d="M20 6V11.5M17.2 8.8H22.8"
        stroke={isWhite ? '#4A4845' : '#D2D0CC'}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M20 12.2C17.8 12.2 16.5 13.8 16.8 16.1C13.6 14.3 9.2 16.2 9.4 20.5C9.6 23.8 11.7 26.2 13.4 27.6V31.5H26.6V27.6C28.3 26.2 30.4 23.8 30.6 20.5C30.8 16.2 26.4 14.3 23.2 16.1C23.5 13.8 22.2 12.2 20 12.2Z"
        fill={isWhite ? '#F5F4F0' : '#262421'}
        stroke={isWhite ? '#4A4845' : '#CFCBC4'}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M13 31.5H27M13.6 27.8H26.4"
        stroke={isWhite ? '#4A4845' : '#CFCBC4'}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Split dark/light question mark icon with per-instance unique clipPath IDs for Firefox compatibility */
function RandomSideQuestionIcon() {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const leftId = `${uid}-rand-left`;
  const rightId = `${uid}-rand-right`;

  return (
    <svg viewBox="0 0 28 28" className="relative z-10 w-6 h-6" aria-hidden="true">
      <defs>
        <clipPath id={leftId}>
          <rect x="0" y="0" width="14" height="28" />
        </clipPath>
        <clipPath id={rightId}>
          <rect x="14" y="0" width="14" height="28" />
        </clipPath>
      </defs>
      <text
        x="14"
        y="21"
        textAnchor="middle"
        fontSize="21"
        fontWeight="900"
        fontFamily="system-ui, sans-serif"
        fill="#2E2C29"
        clipPath={`url(#${leftId})`}
      >
        ?
      </text>
      <text
        x="14"
        y="21"
        textAnchor="middle"
        fontSize="21"
        fontWeight="900"
        fontFamily="system-ui, sans-serif"
        fill="#E5E3DD"
        clipPath={`url(#${rightId})`}
      >
        ?
      </text>
    </svg>
  );
}

export function BotsView({
  initialBotId = 'milo',
  boardTheme = 'green',
  playerUsername = 'Guest Player',
  playerAvatarUrl,
  onBack,
  onStartMatch,
}: BotsViewProps) {
  const initialBot =
    BOT_PROFILES.find((b) => b.id === initialBotId) ??
    BOT_PROFILES.find((b) => b.id === 'milo') ??
    BOT_PROFILES[0];
  const [selectedBotId, setSelectedBotId] = useState<BotId>(initialBot.id);
  const [targetElo, setTargetElo] = useState<number>(initialBot.rating);
  const [expandedTier, setExpandedTier] = useState<BotProfile['tier'] | null>(initialBot.tier);
  const [selectedColor, setSelectedColor] = useState<Color | 'random'>('w');
  const [previewFlipped, setPreviewFlipped] = useState(false);
  const [timeId, setTimeId] = useState('10+0');
  const [coachGuard, setCoachGuard] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const beatenBots = loadBeatenBots();
  const activeBot =
    BOT_PROFILES.find((b) => b.id === selectedBotId) ?? initialBot;
  const tierMeta = getBotTierMeta(targetElo);
  const botGreeting =
    BOT_GREETINGS[activeBot.id] ?? `Hi, I'm ${activeBot.name}! Let's play a great game.`;
  const sliderPct = Math.max(
    0,
    Math.min(100, ((targetElo - MIN_BOT_ELO) / (MAX_BOT_ELO - MIN_BOT_ELO)) * 100),
  );

  const handleSelectBot = (bot: BotProfile) => {
    setSelectedBotId(bot.id);
    setTargetElo(bot.rating);
    setExpandedTier(bot.tier);
  };

  const handleSliderChange = (nextElo: number) => {
    setTargetElo(nextElo);
    const nearest = getNearestBotForElo(nextElo);
    setSelectedBotId(nearest.id);
    setExpandedTier(nearest.tier);
  };

  const renderBotTile = (bot: BotProfile, compact = false) => {
    const selected = bot.id === selectedBotId;
    const beaten = beatenBots.includes(bot.id);
    return (
      <button
        key={bot.id}
        type="button"
        onClick={() => handleSelectBot(bot)}
        aria-label={`${bot.name} (${bot.rating})`}
        title={`${bot.name} (${bot.rating})`}
        aria-pressed={selected}
        className="flex flex-col items-center gap-1 text-center cursor-pointer group focus-visible:outline-none"
      >
        <div
          className={`relative w-full aspect-square rounded-[7px] overflow-hidden bg-[#262421] transition-transform duration-100 ${
            selected
              ? 'ring-[3px] ring-[#81B64C] scale-[1.02] shadow-[0_3px_12px_rgba(0,0,0,0.45)]'
              : 'ring-1 ring-white/[0.08] group-hover:ring-white/35'
          }`}
        >
          <BotAvatar id={bot.id} />
          {beaten && (
            <div className="absolute bottom-0.5 inset-x-0 flex items-center justify-center gap-0.5 pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
              <Crown className="w-3 h-3 text-[#F7C045] fill-[#F7C045]" />
              <Crown className="w-3.5 h-3.5 text-[#F7C045] fill-[#F7C045] -mt-0.5" />
              <Crown className="w-3 h-3 text-[#F7C045] fill-[#F7C045]" />
            </div>
          )}
        </div>
        {!compact && (
          <div className="w-full min-w-0 leading-tight">
            <div
              className={`text-[11px] font-bold truncate ${
                selected ? 'text-[#A2D968]' : 'text-[#DFDDD8]'
              }`}
            >
              {bot.name}
            </div>
            <div className="text-[10px] font-semibold text-[#8E8C88] tabular-nums">
              {bot.rating}
            </div>
          </div>
        )}
      </button>
    );
  };

  const renderBottomControls = () => (
    <div className="sticky bottom-0 z-20 bg-[#262421] lg:bg-[#1F1E1B] border-t border-white/[0.06] px-4 py-3 space-y-2.5 shrink-0">
      {optionsOpen && (
        <div className="p-3 rounded-[8px] bg-[#1F1E1B] lg:bg-[#262421] space-y-2.5 animate-view-enter border border-white/[0.06]">
          <div>
            <div className="text-[11px] font-bold text-[#9B9A97] uppercase tracking-wider mb-1.5">
              Time Control
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {TIME_CONTROLS.map((tc) => (
                <button
                  key={tc.id}
                  type="button"
                  onClick={() => setTimeId(tc.id)}
                  className={`py-1.5 px-1 rounded-[6px] text-xs font-bold cursor-pointer border-2 ${
                    timeId === tc.id
                      ? 'bg-[#363431] border-[#81B64C] text-white'
                      : 'bg-[#262421] lg:bg-[#1F1E1B] border-transparent text-[#9B9A97] hover:text-white'
                  }`}
                >
                  {tc.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCoachGuard((g) => !g)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-[6px] bg-[#262421] lg:bg-[#1F1E1B] text-xs font-bold text-white cursor-pointer"
          >
            <span>Coach Blunder Guard</span>
            <span className={coachGuard ? 'text-[#81B64C]' : 'text-[#9B9A97]'}>
              {coachGuard ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>
      )}

      {/* Row 1: Options pill + White King / Split Random ? / Black King */}
      <div className="flex items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={() => setOptionsOpen((v) => !v)}
          className="flex-1 h-[46px] px-3.5 rounded-[9px] bg-[#363431] hover:bg-[#413E3A] text-[14px] font-extrabold text-white flex items-center justify-between gap-2 cursor-pointer transition-colors"
        >
          <span className="flex items-center gap-2.5">
            <OptionsBoardClockIcon className="w-5 h-5 shrink-0" />
            <span>Options</span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-[#B8B6B2] transition-transform ${
              optionsOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Exact Chess.com 3-Square Color Selector: White King | Split Half-White/Black ? | Black King */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            aria-label="Play as White"
            aria-pressed={selectedColor === 'w'}
            onClick={() => setSelectedColor('w')}
            className={`w-[46px] h-[46px] rounded-[9px] bg-[#E5E3DD] flex items-center justify-center cursor-pointer transition-all ${
              selectedColor === 'w'
                ? 'ring-[3px] ring-[#81B64C]'
                : 'opacity-80 hover:opacity-100'
            }`}
          >
            <PickerKingIcon variant="w" />
          </button>

          <button
            type="button"
            aria-label="Play as Random color"
            aria-pressed={selectedColor === 'random'}
            onClick={() => setSelectedColor('random')}
            className={`relative w-[46px] h-[46px] rounded-[9px] overflow-hidden flex items-center justify-center cursor-pointer transition-all ${
              selectedColor === 'random'
                ? 'ring-[3px] ring-[#81B64C]'
                : 'opacity-85 hover:opacity-100'
            }`}
          >
            <span className="absolute inset-y-0 left-0 w-1/2 bg-[#E5E3DD]" aria-hidden="true" />
            <span className="absolute inset-y-0 right-0 w-1/2 bg-[#383633]" aria-hidden="true" />
            <RandomSideQuestionIcon />
          </button>

          <button
            type="button"
            aria-label="Play as Black"
            aria-pressed={selectedColor === 'b'}
            onClick={() => setSelectedColor('b')}
            className={`w-[46px] h-[46px] rounded-[9px] bg-[#383633] flex items-center justify-center cursor-pointer transition-all ${
              selectedColor === 'b'
                ? 'ring-[3px] ring-[#81B64C]'
                : 'opacity-80 hover:opacity-100'
            }`}
          >
            <PickerKingIcon variant="b" />
          </button>
        </div>
      </div>

      {/* Row 2: Giant 3D Beveled Green Play CTA */}
      <button
        type="button"
        onClick={() =>
          onStartMatch({
            botId: selectedBotId,
            botElo: targetElo,
            timeId,
            color: selectedColor,
            coachGuard,
          })
        }
        className="w-full h-[54px] rounded-[10px] bg-[#81B64C] border-b-[4px] border-[#457524] cc-btn-primary text-white font-extrabold font-display text-[21px] cursor-pointer"
      >
        Play
      </button>
    </div>
  );

  const previewOrientation: Color =
    selectedColor === 'b' ? 'b' : selectedColor === 'w' ? 'w' : previewFlipped ? 'b' : 'w';

  return (
    <div className="max-w-[1180px] mx-auto pb-0">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_410px] gap-0 lg:gap-5 items-start">
        {/* Left Column (Desktop ONLY): Live Preview Chessboard + Top Bot Strip & Bottom Player Strip */}
        <div className="hidden lg:flex flex-col gap-2 w-full max-w-[min(calc(100dvh-112px),760px)] mx-auto">
          <div className="flex items-center justify-between gap-3 pr-9">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-[38px] h-[38px] rounded-[4px] overflow-hidden bg-[#262421] shrink-0">
                <BotAvatar id={activeBot.id} />
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[14px] font-bold text-white truncate">
                  {activeBot.name}
                </span>
                <span className="text-[13px] font-normal text-[#9B9A97] tabular-nums">
                  ({targetElo})
                </span>
                {BOT_FLAGS[activeBot.id] && (
                  <span className="text-[14px] leading-none" aria-hidden="true">
                    {BOT_FLAGS[activeBot.id]}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="flex-1 aspect-square select-none">
              <ChessBoard
                fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
                orientation={previewOrientation}
                theme={boardTheme}
                interactive={previewOrientation === 'w'}
                allowedColor="w"
                onMove={(from, to, promotion) => {
                  onStartMatch({
                    botId: selectedBotId,
                    botElo: targetElo,
                    timeId,
                    color: 'w',
                    coachGuard,
                    initialMove: { from, to, promotion },
                  });
                  return true;
                }}
              />
            </div>

            {/* Subtle Board Utility Icons matching Chess.com Desktop /play/computer */}
            <div className="flex flex-col gap-1.5 pt-0.5 shrink-0">
              <button
                type="button"
                aria-label="Match options"
                onClick={() => setOptionsOpen((v) => !v)}
                className="w-7 h-7 rounded flex items-center justify-center text-[#9B9A97] hover:text-white hover:bg-white/5 cursor-pointer"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                type="button"
                aria-label="Flip board preview"
                onClick={() => setPreviewFlipped((f) => !f)}
                className="w-7 h-7 rounded flex items-center justify-center text-[#9B9A97] hover:text-white hover:bg-white/5 cursor-pointer"
              >
                <FlipVertical2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pr-9">
            <div className="flex items-center gap-2.5 min-w-0">
              <PlayerAvatar
                username={playerUsername}
                avatarUrl={playerAvatarUrl}
                isCurrentUser
                size={38}
                rounded="rounded-[4px]"
              />
              <span className="text-[14px] font-bold text-white truncate">
                {playerUsername}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column (Desktop Dock) / Native Full-Screen Layout (Mobile) */}
        <aside className="w-full max-w-[480px] lg:max-w-none mx-auto rounded-none lg:rounded-[5px] bg-[#302E2B] lg:bg-[#262421] overflow-hidden flex flex-col h-[calc(100dvh-16px)] lg:h-[min(calc(100dvh-2rem),836px)] lg:shadow-[0_6px_22px_rgba(0,0,0,0.28)]">
          {/* Top Header: Mobile "← [Bot] Bots" / Desktop "[Bot] Play Bots" */}
          <div className="h-[52px] lg:h-[48px] bg-[#302E2B] lg:bg-[#1F1E1B] px-3 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="lg:hidden min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg text-[#9B9A97] hover:text-white cursor-pointer"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="hidden lg:block w-8" />

            <div className="flex items-center gap-2.5">
              <NavBotsIcon className="w-7 h-7 lg:w-6 lg:h-6 shrink-0" />
              <h1 className="text-[20px] lg:text-[17px] font-extrabold text-white font-display tracking-tight">
                <span className="lg:hidden">Bots</span>
                <span className="hidden lg:inline">Play Bots</span>
              </h1>
            </div>

            <div className="w-[38px] lg:w-8" />
          </div>

          {/* MOBILE ONLY: Level Heading + Sleek White-Thumb Slider + Open Categorized Grid */}
          <div className="lg:hidden flex-1 overflow-y-auto px-4 pt-2 pb-4 space-y-5">
            {/* Level Title & White-Thumb Rating Slider */}
            <div className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[22px] font-extrabold text-white font-display leading-none">
                    {tierMeta.title}
                  </span>
                  <span className="text-[18px] font-semibold text-[#9B9A97] tabular-nums leading-none">
                    {targetElo}
                  </span>
                </div>
                <span className="text-[13px] font-bold text-[#A2D968] truncate">
                  {activeBot.name}
                </span>
              </div>

              <div className="relative flex items-center py-1">
                <input
                  type="range"
                  aria-label="Bot rating level"
                  min={MIN_BOT_ELO}
                  max={MAX_BOT_ELO}
                  step={25}
                  value={targetElo}
                  onChange={(e) => handleSliderChange(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #81B64C 0%, #81B64C ${sliderPct}%, #3D3B38 ${sliderPct}%, #3D3B38 100%)`,
                  }}
                  className="cc-bot-slider w-full cursor-pointer"
                />
              </div>
            </div>

            {/* Selected Bot Preview Bubble (Compact) */}
            <div className="flex items-center gap-2.5">
              <div className="w-[50px] h-[50px] rounded-[7px] overflow-hidden bg-[#262421] ring-2 ring-[#81B64C] shrink-0">
                <BotAvatar id={activeBot.id} />
              </div>
              <div className="relative flex-1 min-w-0 cc-speech-bubble px-3.5 py-2.5 min-h-[48px] flex items-center">
                <svg
                  viewBox="0 0 10 14"
                  className="w-2.5 h-3.5 absolute -left-2 top-1/2 -translate-y-1/2 text-white fill-current"
                  aria-hidden="true"
                >
                  <path d="M10 0 L0 7 L10 14 Z" />
                </svg>
                <p className="text-[13px] font-semibold text-[#262421] leading-snug">
                  {botGreeting}
                </p>
              </div>
            </div>

            {/* Open Categorized Bot Sections matching Mobile Chess.com Bots Screenshot */}
            <div className="space-y-5">
              {BOT_TIERS.map(({ label, tier }) => {
                const botsInTier = BOT_PROFILES.filter((b) => b.tier === tier);
                return (
                  <section key={tier} className="space-y-2.5">
                    <div className="flex items-baseline gap-2">
                      <h2 className="text-[16px] font-extrabold text-white font-display">
                        {label}
                      </h2>
                      <span className="text-[15px] font-bold text-[#8E8C88] tabular-nums">
                        {botsInTier.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      {botsInTier.map((bot) => renderBotTile(bot, false))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          {/* DESKTOP ONLY: Exact Blind Copy of Chess.com /play/computer */}
          <div className="hidden lg:flex lg:flex-col flex-1 min-h-0">
            {/* Selected Bot Portrait + Crisp White Speech Bubble + Name/Rating/Flag */}
            <div className="px-4 pt-4 pb-3 space-y-2.5 shrink-0">
              <div className="flex items-start gap-3">
                <div className="w-[68px] h-[68px] rounded-[6px] overflow-hidden bg-[#1F1E1B] shrink-0">
                  <BotAvatar id={activeBot.id} />
                </div>
                <div className="relative flex-1 cc-speech-bubble rounded-[12px] px-3.5 py-2.5 min-h-[66px] flex items-center">
                  <svg
                    viewBox="0 0 10 14"
                    className="w-2.5 h-3.5 absolute -left-2 top-5 text-white fill-current"
                    aria-hidden="true"
                  >
                    <path d="M10 0 L0 7 L10 14 Z" />
                  </svg>
                  <p className="text-[13.5px] font-semibold leading-snug text-[#262421]">
                    {botGreeting}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pl-0.5">
                <span className="text-[16px] font-extrabold text-white font-display">
                  {activeBot.name}
                </span>
                <span className="text-[15px] font-medium text-[#9B9A97] tabular-nums">
                  {targetElo}
                </span>
                {BOT_FLAGS[activeBot.id] && (
                  <span className="text-[16px] leading-none" aria-hidden="true">
                    {BOT_FLAGS[activeBot.id]}
                  </span>
                )}
              </div>
            </div>

            {/* Scrollable Tiered Accordion — Exact 4-Column Portrait Grid Matching Chess.com /play/computer */}
            <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
              {BOT_TIERS.map(({ label, tier }) => {
                const botsInTier = BOT_PROFILES.filter((b) => b.tier === tier);
                const isOpen = expandedTier === tier;
                const leadBot = botsInTier[0];
                const beatenInTier = botsInTier.filter((b) => beatenBots.includes(b.id)).length;
                return (
                  <section
                    key={tier}
                    className="rounded-[6px] bg-[#302E2B] overflow-hidden"
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() =>
                        setExpandedTier((prev) => (prev === tier ? null : tier))
                      }
                      className={`w-full px-3.5 flex items-center justify-between gap-2.5 hover:bg-white/[0.04] transition-colors cursor-pointer ${
                        isOpen ? 'py-2.5' : 'h-[54px]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {!isOpen && leadBot && (
                          <div className="w-[38px] h-[38px] rounded-[5px] overflow-hidden bg-[#262421] shrink-0">
                            <BotAvatar id={leadBot.id} />
                          </div>
                        )}
                        <span className="text-[15px] font-extrabold text-white truncate font-display">
                          {label}
                        </span>
                      </div>
                      <span className="text-[13px] font-semibold text-[#9B9A97] tabular-nums shrink-0">
                        {beatenInTier > 0
                          ? `${beatenInTier}/${botsInTier.length}`
                          : `${botsInTier.length} bots`}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="px-3.5 pb-3.5 pt-1 grid grid-cols-4 gap-2.5">
                        {botsInTier.map((bot) => renderBotTile(bot, true))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>

          {renderBottomControls()}
        </aside>
      </div>
    </div>
  );
}
