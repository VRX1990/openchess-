import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import type { EvaluatedMove } from './engine';
import { buildSmartGameInsights, buildSmartMoveAnalysis } from './coach';

function makeMove(params: {
  ply: number;
  san: string;
  fenBefore: string;
  evalCp: number;
  bestMoveSan?: string;
  cpLoss?: number;
  quality: EvaluatedMove['quality'];
  accuracyPercent?: number;
  isMissedWin?: boolean;
  classificationNote?: string;
}): EvaluatedMove {
  const c = new Chess(params.fenBefore);
  const played = c.move(params.san);
  assert.ok(played, `Expected legal move ${params.san} on ${params.fenBefore}`);
  return {
    ply: params.ply,
    moveNumber: Math.ceil(params.ply / 2),
    color: played.color,
    san: played.san,
    from: played.from,
    to: played.to,
    fenBefore: params.fenBefore,
    fenAfter: c.fen(),
    evalCp: params.evalCp,
    bestMoveSan: params.bestMoveSan ?? played.san,
    bestMoveFrom: played.from,
    bestMoveTo: played.to,
    cpLoss: params.cpLoss ?? 0,
    quality: params.quality,
    accuracyPercent: params.accuracyPercent ?? 95,
    isMissedWin: params.isMissedWin ?? false,
    classificationNote: params.classificationNote,
  };
}

test('buildSmartMoveAnalysis avoids duplicated Book theory phrasing and explains development', () => {
  const chess = new Chess();
  chess.move('e4');
  chess.move('e5');
  const fenBefore = chess.fen();
  const move = makeMove({
    ply: 3,
    san: 'Nf3',
    fenBefore,
    evalCp: 25,
    quality: 'Book',
    classificationNote: 'Standard opening theory',
  });

  const smart = buildSmartMoveAnalysis(move, null, 'viktor');
  assert.equal(smart.quality, 'Book');
  assert.ok(smart.why.toLowerCase().includes('knight'));
  assert.equal(smart.why.includes('Standard opening theory. Standard opening theory'), false);
});

test('buildSmartMoveAnalysis detects double attack / fork and hanging piece blunders', () => {
  // Fork position: White knight on e5 forks c7? Actually White plays Nc7+ forking King e8 & Rook a8
  const forkPos = new Chess('r3k2r/pppq1ppp/2n5/4N3/8/8/PPPP1PPP/R1BQK2R w KQkq - 0 10');
  const forkMove = makeMove({
    ply: 19,
    san: 'Nxc6',
    fenBefore: forkPos.fen(),
    evalCp: 420,
    quality: 'Great',
    accuracyPercent: 100,
  });
  const forkSmart = buildSmartMoveAnalysis(forkMove, null, 'dante');
  assert.equal(forkSmart.phase, 'Middlegame');
  assert.ok(forkSmart.headline.includes('Great'));

  // Hanging piece blunder: White plays Qf5?? where Black's c8 bishop attacks undefended Queen on f5
  const blunderPos2 = new Chess('rnbqkb1r/ppp2ppp/3p4/4p3/3P4/5Q2/PPP2PPP/RNB1KBNR w KQkq - 0 4');
  const blunderMove2 = makeMove({
    ply: 7,
    san: 'Qf5',
    fenBefore: blunderPos2.fen(),
    evalCp: -800,
    bestMoveSan: 'Bc4',
    cpLoss: 820,
    quality: 'Blunder',
    accuracyPercent: 5,
  });
  const blunderSmart = buildSmartMoveAnalysis(blunderMove2, null, 'elena');
  assert.ok(blunderSmart.tags.includes('Hanging Piece'));
  assert.ok(blunderSmart.tacticalAlert?.includes('f5'));
  assert.ok(blunderSmart.betterPlan?.includes('Bc4'));
});

test('buildSmartGameInsights produces keyMoments, strengths, weaknesses, and drill', () => {
  const empty = buildSmartGameInsights([], 'w', 'viktor');
  assert.equal(empty.keyMoments.length, 0);
  assert.equal(empty.turningPointPly, null);

  const g = new Chess();
  const f1 = g.fen();
  const m1 = makeMove({
    ply: 1,
    san: 'e4',
    fenBefore: f1,
    evalCp: 25,
    quality: 'Book',
    accuracyPercent: 98,
  });
  g.move('e4');

  const f2 = g.fen();
  const m2 = makeMove({
    ply: 2,
    san: 'e5',
    fenBefore: f2,
    evalCp: 20,
    quality: 'Book',
    accuracyPercent: 97,
  });
  g.move('e5');

  const f3 = g.fen();
  const m3 = makeMove({
    ply: 3,
    san: 'Bc4',
    fenBefore: f3,
    evalCp: 35,
    quality: 'Best',
    accuracyPercent: 99,
  });
  g.move('Bc4');

  const f4 = g.fen();
  const m4 = makeMove({
    ply: 4,
    san: 'Nc6',
    fenBefore: f4,
    evalCp: 30,
    quality: 'Best',
    accuracyPercent: 98,
  });
  g.move('Nc6');

  const f5 = g.fen();
  const m5 = makeMove({
    ply: 5,
    san: 'Qh5',
    fenBefore: f5,
    evalCp: 160,
    quality: 'Great',
    accuracyPercent: 100,
    classificationNote: 'Only move! Threatens f7.',
  });
  g.move('Qh5');

  const f6 = g.fen();
  const m6 = makeMove({
    ply: 6,
    san: 'g6',
    fenBefore: f6,
    evalCp: 140,
    quality: 'Best',
    accuracyPercent: 95,
  });
  g.move('g6');

  const f7 = g.fen();
  const m7 = makeMove({
    ply: 7,
    san: 'Qg4',
    fenBefore: f7,
    evalCp: -350,
    bestMoveSan: 'Qf3',
    cpLoss: 490,
    quality: 'Blunder',
    accuracyPercent: 18,
    isMissedWin: true,
  });

  const insights = buildSmartGameInsights([m1, m2, m3, m4, m5, m6, m7], 'w', 'dante');
  assert.ok(insights.keyMoments.length >= 2);
  assert.ok(insights.keyMoments.some((km) => km.kind === 'best_find' && km.san === 'Qh5'));
  assert.ok(insights.keyMoments.some((km) => km.san === 'Qg4'));
  assert.equal(insights.turningPointPly, 7);
  assert.ok(insights.strengthSummary.length > 10);
  assert.ok(insights.weaknessSummary.includes('Qg4'));
  assert.ok(insights.focusDrill.includes('Qg4') || insights.focusDrill.includes('undefended'));
  assert.ok(insights.openingAccuracy !== null);
});
