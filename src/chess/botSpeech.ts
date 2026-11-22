import type { BotId } from './engine';

export type BotSpeechEvent =
  | 'game_start'
  | 'bot_move'
  | 'bot_capture'
  | 'bot_check'
  | 'player_capture'
  | 'player_check'
  | 'player_castle'
  | 'bot_win'
  | 'bot_loss'
  | 'draw';

export const BOT_FLAGS: Record<BotId, string> = {
  pip: '🇬🇧',
  noah: '🇺🇸',
  mia: '🇨🇦',
  milo: '🇷🇸',
  leo: '🇧🇷',
  hana: '🇯🇵',
  clara: '🇫🇷',
  omar: '🇪🇬',
  sofia: '🇪🇸',
  viktor: '🇵🇱',
  dante: '🇮🇹',
  elena: '🇺🇦',
  aurelius: '🇬🇷',
  vera: '🇩🇪',
  koren: '🇰🇷',
  nova: '🇸🇪',
  chronos: '🇨🇭',
  apex: '🇳🇴',
};

export const BOT_GREETINGS: Record<BotId, string> = {
  pip: 'Hi! I just learned how the pieces move. Let us have fun!',
  noah: 'Ready for a friendly match? I promise not to blink!',
  mia: 'I love trading pawns in the center. Show me your best opening!',
  milo: 'Let us see what kind of trouble we make.',
  leo: 'Attack first, ask questions later! Your move.',
  hana: 'Every piece has a purpose. Let us play a thoughtful game.',
  clara: 'A calm opening leads to a sharp middlegame. Good luck!',
  omar: 'Watch your diagonals — my bishops love open lines.',
  sofia: 'Let us test our tactics today. Ready when you are!',
  viktor: 'Solid structure wins games. Try to crack my defense.',
  dante: 'I see combinations everywhere. Stay sharp!',
  elena: 'Precision in the endgame decides everything. Let us begin.',
  aurelius: 'Control the center, control the board. Make your move.',
  vera: 'No free pawns today. Show me clean calculation.',
  koren: 'Fast, concrete, uncompromising chess. Let us go!',
  nova: 'I will punish any loose square. Bring your A-game.',
  chronos: 'Time and initiative are everything. Your turn.',
  apex: 'Maximum accuracy engaged. Good luck.',
};

const START_LINES = [
  'Good luck! Have a great game.',
  'Let us see what kind of trouble we make.',
  'I am ready — show me your favorite opening!',
];

const BOT_MOVE_LINES = [
  'Classic opening — let us see where this goes.',
  'Interesting start! Let me develop too.',
  'Fighting for the center right away.',
  'Getting my pieces active.',
  'Keeping everything defended.',
  'A quiet move with a plan behind it.',
  'Let us see how you answer this.',
  'Time to improve my worst piece.',
];

const BOT_CAPTURE_LINES = [
  'I will gladly take that!',
  'Ooh, thank you for the material!',
  'Looks like that piece was left unguarded.',
  'Let us simplify the board a bit.',
];

const BOT_CHECK_LINES = [
  'Check! Watch your king.',
  'Check! Time to find a safe square.',
  'Coming straight for your king — check!',
];

const PLAYER_CAPTURE_LINES = [
  'Hey! I was using that piece!',
  'Nice capture — I need to stay alert.',
  'Good eye! Let me regroup.',
  'Fair trade, let us keep fighting.',
];

const PLAYER_CHECK_LINES = [
  'Whoa, check! Good thing I have an escape.',
  'Nice check — putting pressure on my king!',
  'Okay, okay, I will step out of check.',
];

const PLAYER_CASTLE_LINES = [
  'Smart castling — king safety first!',
  'Tucking the king away nicely.',
  'Good castle. Now the middlegame really starts.',
];

const BOT_WIN_LINES = [
  'Good game! Want to run it back for a rematch?',
  'Checkmate! That was a fun battle — rematch?',
  'GG! Click Review to see the key moments.',
];

const BOT_LOSS_LINES = [
  'Well played! You outsmarted me this time.',
  'Great game! You spotted the winning tactics.',
  'You got me! Ready for a tougher challenge?',
];

const DRAW_LINES = [
  'A hard-fought draw! Very evenly matched.',
  'Dead even — nobody gave an inch!',
];

function deterministicPick(list: string[], seed: number): string {
  if (list.length === 0) return '';
  const idx = Math.abs(seed) % list.length;
  return list[idx];
}

export function pickBotReaction(params: {
  botId: BotId;
  botName: string;
  event: BotSpeechEvent;
  moveSan?: string;
  capturedPiece?: string;
  ply?: number;
}): string | null {
  const { botId, event, moveSan = '', ply = 0 } = params;
  const seed =
    botId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) +
    moveSan.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) +
    ply * 7;

  switch (event) {
    case 'game_start':
      return BOT_GREETINGS[botId] ?? deterministicPick(START_LINES, seed);
    case 'bot_check':
      return deterministicPick(BOT_CHECK_LINES, seed);
    case 'bot_capture':
      return deterministicPick(BOT_CAPTURE_LINES, seed);
    case 'player_check':
      return deterministicPick(PLAYER_CHECK_LINES, seed);
    case 'player_capture':
      return deterministicPick(PLAYER_CAPTURE_LINES, seed);
    case 'player_castle':
      return deterministicPick(PLAYER_CASTLE_LINES, seed);
    case 'bot_win':
      return deterministicPick(BOT_WIN_LINES, seed);
    case 'bot_loss':
      return deterministicPick(BOT_LOSS_LINES, seed);
    case 'draw':
      return deterministicPick(DRAW_LINES, seed);
    case 'bot_move':
      // Speak on early moves and periodically in the middlegame so it feels natural like Chess.com
      if (ply <= 4 || ply % 4 === 0) {
        return deterministicPick(BOT_MOVE_LINES, seed);
      }
      return null;
    default:
      return null;
  }
}

export function computeBotThinkDelayMs(params: {
  botElo: number;
  ply: number;
  isCapture?: boolean;
  isCheck?: boolean;
}): number {
  const { botElo, ply, isCapture = false, isCheck = false } = params;
  const base = ply <= 4 ? 420 : 560;
  const eloExtra = Math.round(Math.max(0, Math.min(280, (botElo - 400) * 0.12)));
  const tacticalExtra = isCheck ? 110 : isCapture ? 70 : 0;
  const variance = ((ply * 53 + Math.round(botElo)) % 140) - 50;
  return Math.max(360, Math.min(980, base + eloExtra + tacticalExtra + variance));
}
