import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  buildLocalFallbackExplorer,
  buildMyGamesExplorer,
  computeWinDrawLossPct,
  detectOpeningForPosition,
  formatCompactGamesCount,
  formatMoveLabelForTurn,
  formatPopularityPct,
  normalizeExplorerPayload,
  normalizeFenKey,
} from './explorer';
import type { LichessUserGame } from './lichess';

test('computeWinDrawLossPct always sums to 100 for positive totals and 0 for empty', () => {
  assert.deepEqual(computeWinDrawLossPct(0, 0, 0), {
    whitePct: 0,
    drawPct: 0,
    blackPct: 0,
  });

  const sample = computeWinDrawLossPct(862000, 598000, 740000);
  assert.equal(sample.whitePct + sample.drawPct + sample.blackPct, 100);
  assert.equal(sample.whitePct, 39);
  assert.equal(sample.drawPct, 27);
  assert.equal(sample.blackPct, 34);

  const even = computeWinDrawLossPct(1, 1, 1);
  assert.equal(even.whitePct + even.drawPct + even.blackPct, 100);
});

test('formatCompactGamesCount matches Chess.com Explorer compact style', () => {
  assert.equal(formatCompactGamesCount(2_200_000), '2.2M');
  assert.equal(formatCompactGamesCount(477_120), '477K');
  assert.equal(formatCompactGamesCount(37_510), '37.5K');
  assert.equal(formatCompactGamesCount(1240), '1,240');
  assert.equal(formatCompactGamesCount(82), '82');
});

test('formatPopularityPct returns <1% for rare moves and rounded integers otherwise', () => {
  assert.equal(formatPopularityPct(460, 1000), '46%');
  assert.equal(formatPopularityPct(3, 1000), '<1%');
  assert.equal(formatPopularityPct(0, 1000), '0%');
});

test('formatMoveLabelForTurn renders White and Black move notation accurately', () => {
  assert.equal(formatMoveLabelForTurn('e4', 1, 'w'), '1. e4');
  assert.equal(formatMoveLabelForTurn('e5', 1, 'b'), '1... e5');
  assert.equal(formatMoveLabelForTurn('Nc6', 2, 'b'), '2... Nc6');
});

test('detectOpeningForPosition identifies starting position and transpositions', () => {
  const start = new Chess();
  assert.deepEqual(detectOpeningForPosition(start.fen(), []), {
    eco: 'A00',
    name: 'Starting Position',
  });

  const italian = new Chess();
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'].forEach((m) => italian.move(m));
  const detected = detectOpeningForPosition(italian.fen(), ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']);
  assert.equal(detected.eco, 'C50');
  assert.equal(detected.name, 'Italian Game: Giuoco Piano');
});

test('normalizeExplorerPayload sanitizes brand labels and sorts moves by volume', () => {
  const startFen = new Chess().fen();
  const normalized = normalizeExplorerPayload(
    {
      white: 500,
      draws: 300,
      black: 200,
      opening: { eco: 'A00', name: 'Starting Position' },
      moves: [
        { uci: 'd2d4', san: 'd4', white: 150, draws: 100, black: 80 },
        { uci: 'e2e4', san: 'e4', white: 250, draws: 140, black: 100 },
      ],
      topGames: [
        {
          id: 'g1',
          winner: 'white',
          white: { name: 'Carlsen', rating: 2860 },
          black: { name: 'Nakamura', rating: 2802 },
          year: 2025,
        },
      ],
    },
    startFen,
    'masters',
    [],
  );

  assert.equal(normalized.totalGames, 1000);
  assert.equal(normalized.moves.length, 2);
  assert.equal(normalized.moves[0].san, 'e4');
  assert.equal(normalized.moves[0].from, 'e2');
  assert.equal(normalized.moves[0].to, 'e4');
  assert.equal(normalized.topGames[0].whiteName, 'Carlsen');
});

test('buildMyGamesExplorer aggregates real user PGNs at the current FEN', () => {
  const games: LichessUserGame[] = [
    {
      id: 'my-1',
      rated: true,
      speed: 'rapid',
      status: 'resign',
      winner: 'white',
      white: { name: 'Alex', rating: 1500 },
      black: { name: 'Bot1', rating: 1480 },
      pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0',
      createdAt: 1735689600000,
    },
    {
      id: 'my-2',
      rated: true,
      speed: 'blitz',
      status: 'mate',
      winner: 'black',
      white: { name: 'Alex', rating: 1505 },
      black: { name: 'Bot2', rating: 1510 },
      pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 0-1',
      createdAt: 1735776000000,
    },
    {
      id: 'my-3',
      rated: true,
      speed: 'rapid',
      status: 'draw',
      white: { name: 'Alex', rating: 1502 },
      black: { name: 'Bot3', rating: 1495 },
      pgn: '1. d4 d5 2. c4 e6 1/2-1/2',
      createdAt: 1735862400000,
    },
  ];

  const pos = new Chess();
  ['e4', 'e5', 'Nf3', 'Nc6'].forEach((m) => pos.move(m));

  const res = buildMyGamesExplorer(pos.fen(), games, ['e4', 'e5', 'Nf3', 'Nc6']);
  assert.equal(res.totalGames, 2);
  assert.equal(res.white, 1);
  assert.equal(res.black, 1);
  assert.equal(res.draws, 0);
  assert.equal(res.moves.length, 2);
  assert.equal(res.topGames.length, 2);
  assert.ok(res.moves.some((m) => m.san === 'Bc4' && m.white === 1));
  assert.ok(res.moves.some((m) => m.san === 'Bb5' && m.black === 1));
});

test('buildLocalFallbackExplorer serves rich curated master stats for standard openings', () => {
  const start = new Chess();
  const data = buildLocalFallbackExplorer(start.fen(), 'masters', []);
  assert.equal(data.source, 'curated-book');
  assert.ok(data.moves.length >= 5);
  assert.equal(data.moves[0].san, 'e4');
  assert.equal(normalizeFenKey(start.fen()), normalizeFenKey(data.fen));
});
