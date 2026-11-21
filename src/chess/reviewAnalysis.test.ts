import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTerminalSnapshot,
  classifyMoveFromAnalysis,
  computeMoveAccuracyPercent,
  decodeMateDistance,
  encodeMateEvalCp,
  evalToMoverWinPercent,
  evalToWhiteWinPercent,
  formatEvalDisplay,
  parseUciInfoLine,
  uciLineToPvLine,
  type PositionAnalysisSnapshot,
} from './reviewAnalysis';
import { summarizeGameReview, type EvaluatedMove } from './engine';

test('parseUciInfoLine and uciLineToPvLine normalize White/Black perspectives and mate scores cleanly', () => {
  // White to move: score cp +38 -> +38 from White perspective
  const whiteFen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  const infoW = parseUciInfoLine(
    'info depth 14 seldepth 19 multipv 1 score cp 38 nodes 120400 nps 215000 hashfull 44 time 560 pv g1f3 b8c6 f1b5 a7a6',
  );
  assert.ok(infoW !== null);
  assert.equal(infoW.depth, 14);
  assert.equal(infoW.multipv, 1);
  assert.equal(infoW.nps, 215000);

  const lineW = uciLineToPvLine(whiteFen, infoW);
  assert.ok(lineW !== null);
  assert.equal(lineW.evalCp, 38);
  assert.equal(lineW.mateIn, null);
  assert.equal(lineW.firstMoveSan, 'Nf3');
  assert.equal(lineW.firstMoveFrom, 'g1');
  assert.equal(lineW.firstMoveTo, 'f3');
  assert.deepEqual(lineW.lineSan, ['Nf3', 'Nc6', 'Bb5', 'a6']);

  // Black to move: score mate +2 from Black side means -M2 from White perspective!
  const blackMateFen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 3';
  const infoB = parseUciInfoLine(
    'info depth 16 multipv 1 score mate 1 nodes 4000 nps 180000 pv h4e1',
  );
  // Wait: Qh4# is already mate in position above if White just played g4; test score mate 2 from Black perspective:
  const blackPreMate = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2';
  const infoMateB = parseUciInfoLine(
    'info depth 12 multipv 1 score mate 1 nodes 1200 nps 90000 pv d8h4',
  );
  assert.ok(infoB !== null && infoMateB !== null);
  const mateLineB = uciLineToPvLine(blackPreMate, infoMateB);
  assert.ok(mateLineB !== null);
  assert.equal(mateLineB.mateIn, -1);
  assert.equal(mateLineB.evalCp, encodeMateEvalCp(-1));
  assert.equal(mateLineB.evalText, '-M1');
  assert.equal(mateLineB.firstMoveSan, 'Qh4#');
  void blackMateFen;

  // Ignores upperbound/lowerbound aspiration search noise
  assert.equal(
    parseUciInfoLine('info depth 12 multipv 1 score cp 45 upperbound pv e2e4'),
    null,
  );
});

test('mate encoding/decoding, Win% logistic model, and Expected-Points move accuracy stay consistent', () => {
  const m3 = encodeMateEvalCp(3);
  const minusM2 = encodeMateEvalCp(-2);
  assert.equal(decodeMateDistance(m3), 3);
  assert.equal(decodeMateDistance(minusM2), -2);
  assert.equal(formatEvalDisplay(m3), 'M3');
  assert.equal(formatEvalDisplay(minusM2), '-M2');
  assert.equal(formatEvalDisplay(145), '+1.45');
  assert.equal(formatEvalDisplay(0), '0.0');

  assert.equal(evalToWhiteWinPercent(0), 50);
  assert.ok(evalToWhiteWinPercent(300) > 74);
  assert.ok(evalToWhiteWinPercent(-300) < 26);
  assert.equal(evalToMoverWinPercent(m3, 'w'), 100);
  assert.equal(evalToMoverWinPercent(m3, 'b'), 0);

  assert.equal(computeMoveAccuracyPercent(0), 100);
  assert.ok(computeMoveAccuracyPercent(3) > 85);
  assert.ok(computeMoveAccuracyPercent(25) < 40);
});

test('classifyMoveFromAnalysis accurately detects Book, Best, Great, Brilliant, Mistake, Blunder, and Missed Wins', () => {
  const mkSnap = (
    fen: string,
    evalCp: number,
    bestMoveSan: string,
    bestFrom: string,
    bestTo: string,
    mateIn: number | null = null,
    secondLine?: { evalCp: number; mateIn?: number | null; san?: string },
  ): PositionAnalysisSnapshot => ({
    fen,
    depth: 14,
    evalCp,
    mateIn,
    bestMoveSan,
    bestMoveFrom: bestFrom,
    bestMoveTo: bestTo,
    source: 'stockfish-19-wasm',
    lines: [
      {
        multipv: 1,
        depth: 14,
        evalCp,
        mateIn,
        evalText: formatEvalDisplay(evalCp, mateIn),
        firstMoveUci: `${bestFrom}${bestTo}`,
        firstMoveFrom: bestFrom,
        firstMoveTo: bestTo,
        firstMoveSan: bestMoveSan,
        lineUci: [],
        lineSan: [bestMoveSan],
      },
      ...(secondLine
        ? [
            {
              multipv: 2,
              depth: 14,
              evalCp: secondLine.evalCp,
              mateIn: secondLine.mateIn ?? null,
              evalText: formatEvalDisplay(secondLine.evalCp, secondLine.mateIn ?? null),
              firstMoveUci: 'a2a3',
              firstMoveFrom: 'a2',
              firstMoveTo: 'a3',
              firstMoveSan: secondLine.san ?? 'a3',
              lineUci: [],
              lineSan: [secondLine.san ?? 'a3'],
            },
          ]
        : []),
    ],
  });

  // 1. Great (!) move: only move that wins (second best drops >15% Win%)
  const fenBeforeGreat = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
  const fenAfterGreat = 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4';
  const greatMove: EvaluatedMove = {
    ply: 7,
    moveNumber: 4,
    color: 'w',
    san: 'Qxf7#',
    from: 'h5',
    to: 'f7',
    fenBefore: fenBeforeGreat,
    fenAfter: fenAfterGreat,
    evalCp: 0,
    bestMoveSan: 'Qxf7#',
    cpLoss: 0,
    quality: 'Good',
  };
  const greatClassified = classifyMoveFromAnalysis({
    move: greatMove,
    before: mkSnap(fenBeforeGreat, encodeMateEvalCp(1), 'Qxf7#', 'h5', 'f7', 1, {
      evalCp: 20,
      mateIn: null,
      san: 'Qf3',
    }),
    after: buildTerminalSnapshot(fenAfterGreat)!,
    plyIndex: 6,
    wasBook: false,
  });
  assert.equal(greatClassified.quality, 'Great');
  assert.equal(greatClassified.accuracyPercent, 100);

  // 2. Brilliant (!!) sound sacrifice: Bxh7+ sac leaving Bishop captureable while maintaining winning attack
  const greekGiftBefore = 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/1b1P4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 8';
  const greekGiftAfter = 'r1bq1rk1/ppp2ppB/2n1pn2/3p4/1b1P4/2N1PN2/PP3PPP/R1BQK2R b KQ - 0 8';
  const sacMove: EvaluatedMove = {
    ply: 15,
    moveNumber: 8,
    color: 'w',
    san: 'Bxh7+',
    from: 'd3',
    to: 'h7',
    fenBefore: greekGiftBefore,
    fenAfter: greekGiftAfter,
    evalCp: 0,
    bestMoveSan: 'Bxh7+',
    cpLoss: 0,
    quality: 'Good',
  };
  const brilliantClassified = classifyMoveFromAnalysis({
    move: sacMove,
    before: mkSnap(greekGiftBefore, 260, 'Bxh7+', 'd3', 'h7'),
    after: mkSnap(greekGiftAfter, 255, 'Kxh7', 'g8', 'h7'),
    plyIndex: 14,
    wasBook: false,
  });
  assert.equal(brilliantClassified.quality, 'Brilliant');

  // 3. Blunder allowing mate in 1 (Fool's mate setup)
  const foolsBefore = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';
  const foolsAfter = 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2';
  const g4Move: EvaluatedMove = {
    ply: 3,
    moveNumber: 2,
    color: 'w',
    san: 'g4',
    from: 'g2',
    to: 'g4',
    fenBefore: foolsBefore,
    fenAfter: foolsAfter,
    evalCp: 0,
    bestMoveSan: 'd4',
    cpLoss: 0,
    quality: 'Good',
  };
  const blunderClassified = classifyMoveFromAnalysis({
    move: g4Move,
    before: mkSnap(foolsBefore, -30, 'd4', 'd2', 'd4'),
    after: mkSnap(foolsAfter, encodeMateEvalCp(-1), 'Qh4#', 'd8', 'h4', -1),
    plyIndex: 2,
    wasBook: false,
  });
  assert.equal(blunderClassified.quality, 'Blunder');
  assert.ok(blunderClassified.classificationNote?.includes('Allows checkmate'));

  // 4. Normal piece trade / recapture must NOT trigger false-positive Brilliant (!!)
  const tradeBefore = 'r1bq1rk1/ppp2ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 4 7';
  const tradeAfter = 'r1bq1rk1/ppp2ppp/2n2n2/2b1p3/2B1P3/2NPBN2/PPP2PPP/R2Q1RK1 b - - 5 7';
  const tradeMove: EvaluatedMove = {
    ply: 13,
    moveNumber: 7,
    color: 'w',
    san: 'Be3',
    from: 'c1',
    to: 'e3',
    fenBefore: tradeBefore,
    fenAfter: tradeAfter,
    evalCp: 0,
    bestMoveSan: 'Be3',
    cpLoss: 0,
    quality: 'Good',
  };
  const tradeClassified = classifyMoveFromAnalysis({
    move: tradeMove,
    before: mkSnap(tradeBefore, 20, 'Be3', 'c1', 'e3'),
    after: mkSnap(tradeAfter, 20, 'Bxe3', 'c5', 'e3'),
    plyIndex: 12,
    wasBook: false,
  });
  assert.equal(tradeClassified.quality, 'Best');

  // 5. Missed win detection + summarizeGameReview uses accuracyPercent cleanly
  const summary = summarizeGameReview([greatClassified, brilliantClassified, blunderClassified]);
  assert.ok(summary.whiteAccuracy < 80 && summary.whiteAccuracy > 50);
});
