import test from 'node:test';
import assert from 'node:assert/strict';
import { BOT_FLAGS, BOT_GREETINGS, computeBotThinkDelayMs, pickBotReaction } from './botSpeech';
import { BOT_PROFILES } from './engine';

test('every bot profile has a flag and greeting', () => {
  for (const bot of BOT_PROFILES) {
    assert.ok(BOT_FLAGS[bot.id], `Missing flag for ${bot.id}`);
    assert.ok(BOT_GREETINGS[bot.id], `Missing greeting for ${bot.id}`);
  }
});

test('pickBotReaction returns contextual lines for game events', () => {
  const start = pickBotReaction({ botId: 'milo', botName: 'Milo', event: 'game_start' });
  assert.equal(start, BOT_GREETINGS.milo);

  const checkLine = pickBotReaction({
    botId: 'milo',
    botName: 'Milo',
    event: 'bot_check',
    moveSan: 'Qh5+',
    ply: 6,
  });
  assert.ok(checkLine && /check/i.test(checkLine));

  const lossLine = pickBotReaction({ botId: 'viktor', botName: 'Viktor', event: 'bot_loss' });
  assert.ok(lossLine && lossLine.length > 5);
});

test('computeBotThinkDelayMs stays in natural human-paced window', () => {
  const openingFast = computeBotThinkDelayMs({ botElo: 400, ply: 1 });
  const deepCheck = computeBotThinkDelayMs({ botElo: 2400, ply: 22, isCheck: true });
  assert.ok(openingFast >= 360 && openingFast <= 980);
  assert.ok(deepCheck >= 360 && deepCheck <= 980);
  assert.ok(deepCheck >= openingFast);
});
