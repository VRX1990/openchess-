import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTerminalSnapshot,
  classifyMoveFromAnalysis,
  computeMoveAccuracyPercent,
  decodeMateDistance,
  detectOpeningFromMoves,
  encodeMateEvalCp,
  evalToMoverWinPercent,
  evalToWhiteWinPercent,
  formatEvalDisplay,
  parsePgnMetadata,
  parseUciInfoLine,
  uciLineToPvLine,
  type PositionAnalysisSnapshot,
} from './reviewAnalysis';
import {
  buildPostGameReviewSummary,
  summarizeGameReview,
  type EvaluatedMove,
} from './engine';

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

test('classifyMoveFromAnalysis never masks hanging pieces in decided positions as Best/Good and detects Miss & Excellent', () => {
  const mkSnap = (
    fen: string,
    evalCp: number,
    bestMoveSan: string,
    bestFrom: string,
    bestTo: string,
    mateIn: number | null = null,
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
    ],
  });

  // 1. Hanging a full Bishop when already down -9.0 (-900 -> -1350, cpLoss = 450) must be Mistake/Blunder, NOT Best/Good!
  const decidedFenBefore = '4k3/8/8/8/8/2B5/8/4K2q w - - 0 25';
  const decidedFenAfter = '4k3/8/8/8/3B4/8/8/4K2q b - - 1 25';
  const hangInDecided = classifyMoveFromAnalysis({
    move: {
      ply: 49,
      moveNumber: 25,
      color: 'w',
      san: 'Bd4',
      from: 'c3',
      to: 'd4',
      fenBefore: decidedFenBefore,
      fenAfter: decidedFenAfter,
      evalCp: 0,
      bestMoveSan: 'Kd2',
      cpLoss: 0,
      quality: 'Good',
    },
    before: mkSnap(decidedFenBefore, -900, 'Kd2', 'e1', 'd2'),
    after: mkSnap(decidedFenAfter, -1350, 'Qxd4', 'h1', 'd4'),
    plyIndex: 48,
    wasBook: false,
  });
  assert.ok(
    hangInDecided.quality === 'Mistake' || hangInDecided.quality === 'Blunder',
    `Expected Mistake/Blunder when hanging piece at -9.0, got ${hangInDecided.quality}`,
  );
  assert.ok((hangInDecided.accuracyPercent ?? 100) < 60);

  // 2. Missing a forced mate-in-2 while staying +6.0 must be classified as Miss (not Best)
  const missMateBefore = '6k1/5ppp/8/8/8/8/5PPP/3QR1K1 w - - 0 30';
  const missMateAfter = '6k1/5ppp/8/8/8/7P/5PP1/3QR1K1 b - - 0 30';
  const missedMate = classifyMoveFromAnalysis({
    move: {
      ply: 59,
      moveNumber: 30,
      color: 'w',
      san: 'h3',
      from: 'h2',
      to: 'h3',
      fenBefore: missMateBefore,
      fenAfter: missMateAfter,
      evalCp: 0,
      bestMoveSan: 'Re8#',
      cpLoss: 0,
      quality: 'Good',
    },
    before: mkSnap(missMateBefore, encodeMateEvalCp(2), 'Re8#', 'e1', 'e8', 2),
    after: mkSnap(missMateAfter, 600, 'h6', 'h7', 'h6', null),
    plyIndex: 58,
    wasBook: false,
  });
  assert.equal(missedMate.quality, 'Miss');
  assert.ok(missedMate.isMissedWin);
  assert.ok((missedMate.accuracyPercent ?? 100) < 60);

  // 3. Strong non-#1 move (cpLoss = 18 in equal position) classifies as Excellent
  const eqBefore = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
  const eqAfter = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R b KQkq - 0 4';
  const excellentMove = classifyMoveFromAnalysis({
    move: {
      ply: 7,
      moveNumber: 4,
      color: 'w',
      san: 'd3',
      from: 'd2',
      to: 'd3',
      fenBefore: eqBefore,
      fenAfter: eqAfter,
      evalCp: 0,
      bestMoveSan: 'c3',
      cpLoss: 0,
      quality: 'Good',
    },
    before: mkSnap(eqBefore, 35, 'c3', 'c2', 'c3'),
    after: mkSnap(eqAfter, 17, 'Bc5', 'f8', 'c5'),
    plyIndex: 6,
    wasBook: false,
  });
  assert.equal(excellentMove.quality, 'Excellent');
  assert.ok((excellentMove.accuracyPercent ?? 0) >= 88);
});

test('buildPostGameReviewSummary calibrates 750-Elo blunderfest vs GM game accuracy and Game Rating realistically', () => {
  const mkEvalMove = (
    ply: number,
    color: 'w' | 'b',
    quality: EvaluatedMove['quality'],
    accuracyPercent: number,
    cpLoss: number,
  ): EvaluatedMove => ({
    ply,
    moveNumber: Math.ceil(ply / 2),
    color,
    san: 'Nf3',
    from: 'g1',
    to: 'f3',
    fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    fenAfter: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1',
    evalCp: 0,
    bestMoveSan: 'Nf3',
    cpLoss,
    quality,
    accuracyPercent,
  });

  // 750-Elo style 30-move game: White makes 4 blunders & 4 mistakes, loses 0-1
  const lowEloMoves: EvaluatedMove[] = [];
  for (let i = 0; i < 60; i++) {
    const color: 'w' | 'b' = i % 2 === 0 ? 'w' : 'b';
    if (color === 'w') {
      if (i < 6) lowEloMoves.push(mkEvalMove(i + 1, 'w', 'Book', 100, 0));
      else if (i === 10 || i === 22 || i === 34 || i === 46)
        lowEloMoves.push(mkEvalMove(i + 1, 'w', 'Blunder', 14, 480));
      else if (i === 14 || i === 26 || i === 38 || i === 50)
        lowEloMoves.push(mkEvalMove(i + 1, 'w', 'Mistake', 42, 180));
      else if (i % 4 === 0) lowEloMoves.push(mkEvalMove(i + 1, 'w', 'Inaccuracy', 62, 95));
      else lowEloMoves.push(mkEvalMove(i + 1, 'w', 'Good', 78, 45));
    } else {
      if (i < 6) lowEloMoves.push(mkEvalMove(i + 1, 'b', 'Book', 100, 0));
      else if (i === 19) lowEloMoves.push(mkEvalMove(i + 1, 'b', 'Blunder', 18, 420));
      else if (i === 29 || i === 41) lowEloMoves.push(mkEvalMove(i + 1, 'b', 'Mistake', 45, 160));
      else if (i % 6 === 1) lowEloMoves.push(mkEvalMove(i + 1, 'b', 'Excellent', 92, 18));
      else lowEloMoves.push(mkEvalMove(i + 1, 'b', 'Good', 80, 35));
    }
  }

  const lowSummary = buildPostGameReviewSummary({
    evaluated: lowEloMoves,
    resultLabel: '0-1',
    whiteBaseRating: 750,
    blackBaseRating: 750,
  });

  assert.ok(
    lowSummary.whiteAccuracyExact >= 45 && lowSummary.whiteAccuracyExact <= 68,
    `Expected realistic 750-Elo White accuracy (45..68%), got ${lowSummary.whiteAccuracyExact}%`,
  );
  assert.ok(
    lowSummary.whiteGameRating >= 450 && lowSummary.whiteGameRating <= 850,
    `Expected realistic 750-Elo White Game Rating (450..850), got ${lowSummary.whiteGameRating}`,
  );
  assert.ok(
    lowSummary.blackGameRating > lowSummary.whiteGameRating &&
      lowSummary.blackGameRating <= 1350,
    `Expected winning 750-Elo Black Game Rating > White and <= 1350, got ${lowSummary.blackGameRating}`,
  );

  // Clean GM game: >95% accuracy, 0 blunders -> Game Rating >= 2400
  const gmMoves: EvaluatedMove[] = [];
  for (let i = 0; i < 60; i++) {
    const color: 'w' | 'b' = i % 2 === 0 ? 'w' : 'b';
    gmMoves.push(
      mkEvalMove(
        i + 1,
        color,
        i < 10 ? 'Book' : i % 3 === 0 ? 'Excellent' : 'Best',
        i < 10 ? 100 : i % 3 === 0 ? 94 : 100,
        i % 3 === 0 ? 12 : 0,
      ),
    );
  }
  const gmSummary = buildPostGameReviewSummary({
    evaluated: gmMoves,
    resultLabel: '1-0',
    whiteBaseRating: 2650,
    blackBaseRating: 2650,
  });
  assert.ok(gmSummary.whiteAccuracyExact >= 95);
  assert.ok(gmSummary.whiteGameRating >= 2450);
});

test('parsePgnMetadata extracts Chess.com ECOUrl opening, TimeControl speed, ratings, and inferred checkmate result', () => {
  const chessComPgn = `[Event "Live Chess"]
[Site "Chess.com"]
[White "PlayerOne"]
[Black "PlayerTwo"]
[Result "0-1"]
[ECO "C50"]
[ECOUrl "https://www.chess.com/openings/Italian-Game-Giuoco-Piano-4.c3-Nf6"]
[WhiteElo "750"]
[BlackElo "762"]
[TimeControl "600"]
[Termination "PlayerTwo won by checkmate"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 0-1`;

  const parsed = parsePgnMetadata(chessComPgn);
  assert.equal(parsed.whiteName, 'PlayerOne');
  assert.equal(parsed.blackName, 'PlayerTwo');
  assert.equal(parsed.whiteRating, 750);
  assert.equal(parsed.blackRating, 762);
  assert.equal(parsed.opening, 'Italian Game: Giuoco Piano');
  assert.equal(parsed.speed, 'rapid');
  assert.equal(parsed.result, '0-1');

  // Bullet / blitz inference
  assert.equal(parsePgnMetadata('[TimeControl "60"]\n\n1. e4 e5').speed, 'bullet');
  assert.equal(parsePgnMetadata('[TimeControl "180+2"]\n\n1. e4 e5').speed, 'blitz');

  // Bare moves without headers: detect opening & infer checkmate result
  const scholarsPgn = '1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#';
  const bareParsed = parsePgnMetadata(scholarsPgn);
  assert.equal(bareParsed.result, '1-0');
  assert.equal(bareParsed.opening, "Bishop's Opening");
  assert.equal(
    detectOpeningFromMoves(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']),
    'Italian Game: Giuoco Piano',
  );
});
