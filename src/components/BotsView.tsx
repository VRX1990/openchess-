import { useState } from 'react';
import type { Color } from 'chess.js';
import { ArrowLeft, ChevronDown, Crown, SlidersHorizontal, Monitor } from 'lucide-react';
import {
  BOT_PROFILES,
  MAX_BOT_ELO,
  MIN_BOT_ELO,
  getBotTierMeta,
  getNearestBotForElo,
  type BotId,
  type BotProfile,
} from '../chess/engine';
import { loadBeatenBots } from '../chess/analytics';
import { TIME_CONTROLS } from './PlayView';
import { BotAvatar } from './BotAvatar';

interface BotsViewProps {
  initialBotId?: BotId;
  onBack: () => void;
  onStartMatch: (opts: {
    botId: BotId;
    botElo: number;
    timeId: string;
    color: Color | 'random';
    coachGuard: boolean;
  }) => void;
}

const BOT_TIERS: { label: string; tier: BotProfile['tier'] }[] = [
  { label: 'New to Chess', tier: 'New to Chess' },
  { label: 'Beginner', tier: 'Beginner' },
  { label: 'Intermediate', tier: 'Intermediate' },
  { label: 'Advanced', tier: 'Advanced' },
  { label: 'Master', tier: 'Master' },
  { label: 'Grandmaster & Engine', tier: 'Grandmaster' },
];

export function BotsView({
  initialBotId = 'viktor',
  onBack,
  onStartMatch,
}: BotsViewProps) {
  const initialBot =
    BOT_PROFILES.find((b) => b.id === initialBotId) ??
    BOT_PROFILES.find((b) => b.id === 'viktor') ??
    BOT_PROFILES[0];
  const [selectedBotId, setSelectedBotId] = useState<BotId>(initialBot.id);
  const [targetElo, setTargetElo] = useState<number>(initialBot.rating);
  const [selectedColor, setSelectedColor] = useState<Color | 'random'>('w');
  const [timeId, setTimeId] = useState('10+0');
  const [coachGuard, setCoachGuard] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  const beatenBots = loadBeatenBots();
  const activeBot =
    BOT_PROFILES.find((b) => b.id === selectedBotId) ?? initialBot;
  const tierMeta = getBotTierMeta(targetElo);

  const handleSelectBot = (bot: BotProfile) => {
    setSelectedBotId(bot.id);
    setTargetElo(bot.rating);
  };

  const handleSliderChange = (nextElo: number) => {
    setTargetElo(nextElo);
    setSelectedBotId(getNearestBotForElo(nextElo).id);
  };

  const renderBotCard = (bot: BotProfile) => {
    const selected = bot.id === selectedBotId;
    const beaten = beatenBots.includes(bot.id);
    return (
      <button
        key={bot.id}
        type="button"
        onClick={() => handleSelectBot(bot)}
        className="flex flex-col items-center gap-1.5 text-center cursor-pointer group"
      >
        <div
          className={`relative w-full aspect-square rounded-xl overflow-hidden transition-all ${
            selected
              ? 'ring-3 ring-[#81B64C] scale-[1.03] shadow-lg'
              : 'ring-1 ring-white/10 group-hover:ring-white/30'
          }`}
        >
          <BotAvatar id={bot.id} />
          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/75 font-mono text-[10px] font-bold text-[#F7C045] tabular-nums">
            {bot.rating}
          </span>
        </div>
        <div className="w-full min-w-0">
          <div className="text-xs font-bold text-white truncate">{bot.name}</div>
          {beaten ? (
            <div className="flex items-center justify-center gap-0.5 text-[#F7C045] mt-0.5">
              <Crown className="w-3 h-3 fill-[#F7C045]" />
              <Crown className="w-3 h-3 fill-[#F7C045]" />
              <Crown className="w-3 h-3 fill-[#F7C045]" />
            </div>
          ) : (
            <div className="text-[10px] text-[#9E998F] truncate">{bot.title}</div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="max-w-md mx-auto flex flex-col min-h-dvh lg:min-h-[680px]">
      {/* Chess.com Mobile Bots Top Header */}
      <div className="sticky top-0 z-20 bg-[#302E2B]/95 backdrop-blur-sm flex items-center justify-between px-1 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#C8C4BC] hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-[#5694B8]/25 flex items-center justify-center">
            <Monitor className="w-4 h-4 text-[#7FC4ED]" />
          </div>
          <h1 className="text-lg font-extrabold text-white font-display">Bots</h1>
        </div>

        <div className="w-10" />
      </div>

      {/* Scrollable Tiered Bots Body */}
      <div className="flex-1 space-y-5 px-1 pt-2 pb-6">
        {/* Selected Bot Difficulty Slider Header (100 - 3200 ELO) */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-extrabold text-white font-display">
                {activeBot.name}
              </span>
              <span className="font-mono text-sm font-bold text-[#F7C045] tabular-nums">
                {targetElo}
              </span>
            </div>
            <span className="text-xs font-semibold text-[#81B64C]">
              {tierMeta.title}
            </span>
          </div>

          <input
            type="range"
            aria-label="Bot rating level"
            min={MIN_BOT_ELO}
            max={MAX_BOT_ELO}
            step={25}
            value={targetElo}
            onChange={(e) => handleSliderChange(Number(e.target.value))}
            className="w-full accent-[#81B64C] cursor-pointer"
          />
          <div className="flex items-center justify-between text-[11px] font-mono text-[#9E998F] tabular-nums -mt-1">
            <span>{MIN_BOT_ELO}</span>
            <span>{MAX_BOT_ELO}</span>
          </div>
          <p className="text-xs text-[#C8C4BC] leading-relaxed">{tierMeta.style}</p>
        </div>

        {/* All 18 Bots Grouped Across Every ELO Tier */}
        {BOT_TIERS.map(({ label, tier }) => {
          const botsInTier = BOT_PROFILES.filter((b) => b.tier === tier);
          return (
            <section key={tier} className="space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-extrabold text-white">
                <span>{label}</span>
                <span className="text-xs font-mono text-[#9E998F]">
                  {botsInTier.length}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {botsInTier.map(renderBotCard)}
              </div>
            </section>
          );
        })}

        {/* Collapsible Time & Guard Options */}
        {optionsOpen && (
          <div className="p-3 rounded-xl bg-[#262421] border border-white/10 space-y-3 animate-view-enter">
            <div>
              <div className="text-xs font-bold text-[#C8C4BC] mb-1.5">Time Control</div>
              <div className="grid grid-cols-4 gap-1.5">
                {TIME_CONTROLS.map((tc) => (
                  <button
                    key={tc.id}
                    type="button"
                    onClick={() => setTimeId(tc.id)}
                    className={`py-2 px-1.5 rounded-lg text-xs font-bold cursor-pointer border ${
                      timeId === tc.id
                        ? 'bg-[#383530] border-[#81B64C] text-white'
                        : 'bg-[#1E1C19] border-white/8 text-[#9E998F]'
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
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#1E1C19] border border-white/8 text-xs font-semibold text-white cursor-pointer"
            >
              <span>Coach OpenChess Blunder Guard</span>
              <span className={coachGuard ? 'text-[#81B64C]' : 'text-[#9E998F]'}>
                {coachGuard ? 'ON' : 'OFF'}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Chess.com Pinned Bottom Bar: Options + Color King Squares + Giant Green Play */}
      <div className="sticky bottom-0 z-20 bg-[#262421] border-t border-white/10 -mx-2.5 sm:mx-0 px-3 pt-2.5 pb-3 space-y-2.5 sm:rounded-xl sm:border">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setOptionsOpen((v) => !v)}
            className="flex-1 min-h-[46px] px-3 rounded-xl bg-[#383530] hover:bg-[#43403A] text-sm font-bold text-white flex items-center justify-between gap-2 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#C8C4BC]" />
              <span>Options</span>
            </span>
            <span className="flex items-center gap-1 text-xs font-normal text-[#9E998F]">
              <span>{TIME_CONTROLS.find((t) => t.id === timeId)?.label ?? '10 min'}</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${optionsOpen ? 'rotate-180' : ''}`}
              />
            </span>
          </button>

          {/* White / Random / Black King Squares */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              aria-label="Play as White"
              onClick={() => setSelectedColor('w')}
              className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl font-bold cursor-pointer border-2 transition-colors ${
                selectedColor === 'w'
                  ? 'bg-[#EEEED2] text-[#23211E] border-[#81B64C]'
                  : 'bg-[#383530] text-[#DEDAD2] border-transparent'
              }`}
            >
              ♔
            </button>
            <button
              type="button"
              aria-label="Play as Random color"
              onClick={() => setSelectedColor('random')}
              className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-extrabold cursor-pointer border-2 transition-colors ${
                selectedColor === 'random'
                  ? 'bg-[#383530] text-white border-[#81B64C]'
                  : 'bg-[#383530] text-[#C8C4BC] border-transparent'
              }`}
            >
              ?
            </button>
            <button
              type="button"
              aria-label="Play as Black"
              onClick={() => setSelectedColor('b')}
              className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl font-bold cursor-pointer border-2 transition-colors ${
                selectedColor === 'b'
                  ? 'bg-[#1D1C19] text-white border-[#81B64C]'
                  : 'bg-[#383530] text-[#9E998F] border-transparent'
              }`}
            >
              ♚
            </button>
          </div>
        </div>

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
          className="w-full min-h-[54px] rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[5px] border-[#457524] active:border-b-0 active:translate-y-[2px] text-white font-extrabold text-lg transition-all cursor-pointer shadow-lg"
        >
          Play
        </button>
      </div>
    </div>
  );
}
