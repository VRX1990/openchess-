import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PUZZLE_STATS,
  buildReviewedGameRecord,
  buildStreakWeekStrip,
  calculatePuzzleEloDelta,
  calculateUpdatedElo,
  computeUserAwards,
  countryCodeToFlagEmoji,
  decodePositionThreats,
  formatGamePlayedAgo,
  formatJoinedDate,
  formatLastSeenAgo,
  getPuzzleAccuracy,
  hasPlayableMovesInPgn,
  isGamePlayedAsBlack,
  mergePuzzleSyncStats,
  mergeSyncedAccountStats,
  mergeSyncedGames,
  recordDailyAppOpen,
  recordPuzzleResult,
  shouldConfirmLeaveGame,
  summarizeTrainingDna,
} from './analytics';
import {
  COACH_PROFILES,
  COACH_STRENGTH_LEVELS,
  buildSmartGameInsights,
  buildSmartMoveAnalysis,
  cpToWhiteWinPercent,
  evaluateCoachStudentMove,
  explainCoachReplyMove,
  getCoachProfile,
} from './coach';
import { SHARPING_DAILY_PLANS, getSharpingPlanForDay } from './content';
import {
  AVATAR_PRESETS,
  findAvatarPreset,
  isCustomImageAvatar,
  resolveDeterministicPlayerBotId,
} from './avatars';
import {
  isDuplicateRemoteChat,
  mergeFriendsWithRemote,
  pruneExpiredInvites,
  removePendingInvite,
  upsertPendingInvite,
  type PendingGameInvite,
} from './syncHelpers';
import { convertChessApiPayload, convertCloudEvalPayload, parseUciMovesToGameState } from './lichess';
import {
  type EvaluatedMove,
  BOT_PROFILES,
  MAX_BOT_ELO,
  MIN_BOT_ELO,
  STOCKFISH_19_NNUE_ENGINE_VERSION,
  buildPostGameReviewSummary,
  checkBlunderFast,
  chooseBotMove,
  computeClientStockfish19NnueMultiPv,
  evaluateMovesBatch,
  evaluateSinglePly,
  extractGameSkeleton,
  getBotTierMeta,
  getNearestBotForElo,
  pickCalibratedEngineLine,
  resolveSingleHintMove,
  summarizeGameReview,
} from './engine';
import {
  clampOpponentEloToBand,
  getFairMatchmakingEloBand,
  isWithinFairEloBand,
} from './onlineHelpers';
import {
  CHESS_BASICS_LESSONS,
  PRACTICE_COURSES,
  applyBasicsStarMove,
  getBasicsLegalMoves,
  parseFenToBasicsPieces,
  parseStudyPgnChapters,
  pickNextCoordinate,
  simulatePieceMove,
} from './learnCurriculum';

test('buildReviewedGameRecord & summarizeTrainingDna diagnose phase accuracy', () => {
  const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7';
  const skeleton = extractGameSkeleton(pgn);
  const evaluated = skeleton.map((m, idx) => evaluateSinglePly(m, idx));

  const record = buildReviewedGameRecord('test-game-1', evaluated, 'w', 1700000000000);
  assert.equal(record.playerColor, 'w');
  assert.equal(record.moveCount, 5);
  assert.ok(record.playerAccuracy >= 15 && record.playerAccuracy <= 99);
  assert.ok(record.openingAccuracy !== null);
  assert.equal(record.middlegameAccuracy, null);
  assert.equal(record.endgameAccuracy, null);

  const dna = summarizeTrainingDna([
    record,
    {
      id: 'test-game-2',
      timestamp: 1700000100000,
      playerColor: 'w',
      playerAccuracy: 74,
      openingAccuracy: 88,
      middlegameAccuracy: 64,
      endgameAccuracy: 91,
      blunders: 0,
      mistakes: 2,
      inaccuracies: 1,
      bestMoves: 10,
      moveCount: 15,
    },
  ]);

  assert.equal(dna.gamesAnalyzed, 2);
  assert.equal(dna.weakestPhase, 'Middlegame');
  assert.equal(dna.recommendedTab, 'puzzles');
  assert.ok(dna.recommendation.includes('Middlegame'));
});

test('decodePositionThreats identifies hanging pieces, checks, and captures', () => {
  const fen = 'r1bqkbnr/pp3ppp/2p5/1B2p3/4P3/8/PPPP1PPP/RNBQK1NR w KQkq - 0 4';
  const summary = decodePositionThreats(fen);

  assert.equal(summary.sideToMove, 'White');
  assert.ok(summary.hangingWhitePieces.some((p) => p.includes('Bishop on b5')));
  assert.ok(summary.captures.length > 0);
  assert.ok(summary.headline.includes('Undefended'));
});

test('convertCloudEvalPayload converts Lichess Depth-60 UCI lines into SAN', () => {
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const parsed = convertCloudEvalPayload({
    fen: startFen,
    depth: 60,
    knodes: 482000,
    pvs: [
      { moves: 'e2e4 e7e5 g1f3 b8c6', cp: 22 },
      { moves: 'd2d4 d7d5 c2c4', cp: 20 },
      { moves: 'g1f3 g8f6', mate: 0 },
    ],
  });

  assert.equal(parsed.source, 'lichess-cloud');
  assert.equal(parsed.depth, 60);
  assert.equal(parsed.lines.length, 3);
  assert.equal(parsed.lines[0].firstMoveSan, 'e4');
  assert.equal(parsed.lines[0].firstMoveFrom, 'e2');
  assert.equal(parsed.lines[0].firstMoveTo, 'e4');
  assert.equal(parsed.lines[0].evalText, '+0.22');
  assert.deepEqual(parsed.lines[0].lineSan, ['e4', 'e5', 'Nf3', 'Nc6']);
  assert.equal(parsed.lines[1].firstMoveSan, 'd4');
});

test('convertChessApiPayload converts Stockfish 17 NNUE response into SAN', () => {
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const parsed = convertChessApiPayload(startFen, {
    move: 'e2e4',
    centipawns: '32',
    depth: 15,
    continuationArr: ['e7e5', 'g1f3', 'b8c6'],
  });

  assert.equal(parsed.source, 'stockfish-17');
  assert.equal(parsed.depth, 15);
  assert.equal(parsed.lines.length, 1);
  assert.equal(parsed.lines[0].firstMoveSan, 'e4');
  assert.equal(parsed.lines[0].firstMoveFrom, 'e2');
  assert.equal(parsed.lines[0].firstMoveTo, 'e4');
  assert.equal(parsed.lines[0].evalCp, 32);
  assert.equal(parsed.lines[0].evalText, '+0.32');
  assert.deepEqual(parsed.lines[0].lineSan, ['e4', 'e5', 'Nf3', 'Nc6']);
});

test('checkBlunderFast detects hanging pieces and mate-in-1 instantaneously without false alarms', () => {
  // 1. e4 e5 2. Nf3 Nc6: White playing Nxe5?? hangs a Knight cleanly after ...Nxe5
  const knightHangFen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
  const start = performance.now();
  const caught = checkBlunderFast(knightHangFen, 'f3', 'e5', 'q', {
    san: 'Bc4',
    from: 'f1',
    to: 'c4',
    evalCp: 25,
  });
  const elapsedMs = performance.now() - start;

  assert.ok(caught?.isBlunder, 'Expected 3. Nxe5?? to be caught as a blunder');
  assert.ok(caught.cpLoss >= 150);
  assert.ok(elapsedMs < 250, `Expected <250ms, took ${elapsedMs}ms`);

  // Safe developing move 3. Bc4 should NOT trigger guard
  const safe = checkBlunderFast(knightHangFen, 'f1', 'c4', 'q', {
    san: 'Bb5',
    from: 'f1',
    to: 'b5',
    evalCp: 25,
  });
  assert.equal(safe, null);

  // Fool's mate setup: 1. f3 e5 2. g4?? allows ...Qh4#
  const foolsFen = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';
  const mateCaught = checkBlunderFast(foolsFen, 'g2', 'g4');
  assert.ok(mateCaught?.isBlunder, 'Expected 2. g4?? to be flagged for allowing mate in 1');
  assert.ok(mateCaught.reason.toLowerCase().includes('checkmate'));
});

test('resolveSingleHintMove picks one authoritative hint and ignores stale board responses', () => {
  const fenA = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const fenB = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

  const sfHint = { from: 'c7', to: 'c5', san: 'c5' };
  const localHint = { from: 'e7', to: 'e5', san: 'e5' };

  // Prefers authoritative Stockfish result without mixing
  assert.deepEqual(resolveSingleHintMove(fenA, fenA, sfHint, localHint), sfHint);

  // Uses local fallback only when server engine is unavailable
  assert.deepEqual(resolveSingleHintMove(fenA, fenA, null, localHint), localHint);

  // Discards stale result if position moved forward while waiting
  assert.equal(resolveSingleHintMove(fenA, fenB, sfHint, localHint), null);
});

test('chooseBotMove and tier helpers support 18 bots across full 100 to 3200 ELO range', () => {
  assert.equal(MIN_BOT_ELO, 100);
  assert.equal(MAX_BOT_ELO, 3200);
  assert.equal(BOT_PROFILES.length, 18);
  assert.equal(getNearestBotForElo(100).id, 'pip');
  assert.equal(getNearestBotForElo(2950).name, 'Chronos');
  assert.equal(getNearestBotForElo(3200).id, 'apex');
  assert.equal(getNearestBotForElo(3200).name, 'Cat');
  assert.equal(getBotTierMeta(100).title, 'New to Chess');
  assert.equal(getBotTierMeta(3200).title, 'Maximum Engine');

  const startFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const lowMove = chooseBotMove(startFen, 'pip', () => 0.25, 100);
  const maxMove = chooseBotMove(startFen, 'apex', () => 0.0, 3200);
  assert.ok(lowMove !== null && lowMove.san.length > 0);
  assert.ok(maxMove !== null && maxMove.san.length > 0);

  // Verify Guard catches Queen-recapture-trap blunders without cachedBest
  const queenTrapFen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5Q2/PPPP1PPP/RNB1KBNR w KQkq - 0 3';
  const qTrap = checkBlunderFast(queenTrapFen, 'f3', 'f7', 'q', null);
  assert.ok(qTrap?.isBlunder, 'Expected Qxf7+?? into Kxf7 to be caught by Guard');
  assert.notEqual(qTrap?.bestSan, 'Qxf7+');
});

test('puzzle Elo delta, streak, best streak, and accuracy update cleanly', () => {
  const highPuzzleWin = calculatePuzzleEloDelta(1150, 1550, true);
  const lowPuzzleWin = calculatePuzzleEloDelta(1150, 800, true);
  assert.ok(highPuzzleWin > lowPuzzleWin, 'Beating a stronger puzzle awards more Elo');

  let stats = { ...DEFAULT_PUZZLE_STATS };
  assert.equal(getPuzzleAccuracy(stats), null);

  stats = recordPuzzleResult({ stats, puzzleRating: 1550, outcome: 'clean-solve' });
  assert.equal(stats.streak, 1);
  assert.equal(stats.bestStreak, 1);
  assert.equal(stats.solvedCount, 1);
  assert.equal(getPuzzleAccuracy(stats), 100);
  assert.ok(stats.rating > 1150);

  const ratingBeforeMiss = stats.rating;
  stats = recordPuzzleResult({ stats, puzzleRating: 1150, outcome: 'miss' });
  assert.equal(stats.streak, 0);
  assert.equal(stats.bestStreak, 1);
  assert.ok(stats.rating < ratingBeforeMiss);
  assert.equal(getPuzzleAccuracy(stats), 50);

  stats = recordPuzzleResult({ stats, puzzleRating: 1150, outcome: 'retry-solve' });
  assert.equal(stats.streak, 0);
  assert.equal(stats.solvedCount, 2);
  assert.equal(getPuzzleAccuracy(stats), 50);
});

test('Guard never gives contradictory warnings or flags its own suggested move', () => {
  // Exact middlegame position from user screenshot: Ng5 and Bb5 should NOT be flagged as blunders
  const midFen = 'r1b1kb1r/pp1n1ppp/5n2/2p1p3/1qB1P3/2N2N2/PPPPQPPP/R1B1K2R w KQkq - 0 1';
  assert.equal(checkBlunderFast(midFen, 'f3', 'g5', 'q', null), null);
  assert.equal(checkBlunderFast(midFen, 'c4', 'b5', 'q', null), null);

  // When Guard DOES catch a blunder (e.g. Qxf7+??), its suggested move must pass Guard cleanly
  const queenTrapFen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5Q2/PPPP1PPP/RNB1KBNR w KQkq - 0 3';
  const hit = checkBlunderFast(queenTrapFen, 'f3', 'f7', 'q', null);
  assert.ok(hit?.isBlunder);
  assert.equal(checkBlunderFast(queenTrapFen, hit.bestFrom, hit.bestTo, 'q', null), null);
});

test('chooseBotMove at 1200+ ELO never hangs a Queen on blunder rolls', () => {
  // Position where Black's Queen is developed cleanly and can capture or stay safe, while Qxh2+?? or Qa5+?? might exist
  const midFen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R b KQkq - 3 3';
  for (let i = 0; i < 10; i++) {
    const move = chooseBotMove(midFen, 'viktor', () => i / 10, 1500);
    assert.ok(move !== null, 'Expected a legal move for 1500 bot');
    // Should never throw the Queen onto an undefended attacked square
    assert.notEqual(move.san, 'Qh4');
  }
});

test('parseUciMovesToGameState reconstructs live Lichess stream moves cleanly', () => {
  const state = parseUciMovesToGameState('e2e4 e7e5 g1f3 b8c6');
  assert.equal(state.plyCount, 4);
  assert.equal(state.turn, 'w');
  assert.deepEqual(state.lastMove, {
    from: 'b8',
    to: 'c6',
    san: 'Nc6',
    captured: false,
  });
  assert.ok(state.pgn.includes('1. e4 e5 2. Nf3 Nc6'));
});

test('recordDailyAppOpen increments daily streak once per consecutive calendar day', () => {
  const day1 = recordDailyAppOpen(null, '2026-11-10');
  assert.deepEqual(day1, { days: 1, bestDays: 1, lastOpenDate: '2026-11-10' });

  // Opening again same day or winning games does not increment daily streak
  const sameDay = recordDailyAppOpen(day1, '2026-11-10');
  assert.deepEqual(sameDay, { days: 1, bestDays: 1, lastOpenDate: '2026-11-10' });

  // Consecutive next day increments streak
  const day2 = recordDailyAppOpen(sameDay, '2026-11-11');
  assert.deepEqual(day2, { days: 2, bestDays: 2, lastOpenDate: '2026-11-11' });

  const day3 = recordDailyAppOpen(day2, '2026-11-12');
  assert.deepEqual(day3, { days: 3, bestDays: 3, lastOpenDate: '2026-11-12' });

  // Missing a day resets days to 1 while preserving bestDays
  const missed = recordDailyAppOpen(day3, '2026-11-14');
  assert.deepEqual(missed, { days: 1, bestDays: 3, lastOpenDate: '2026-11-14' });
});

test('calculateUpdatedElo adjusts ratings accurately for win, draw, and loss', () => {
  const afterWin = calculateUpdatedElo(1200, 1200, 'win');
  const afterLoss = calculateUpdatedElo(1200, 1200, 'loss');
  const afterDrawEqual = calculateUpdatedElo(1200, 1200, 'draw');
  const afterUpsetWin = calculateUpdatedElo(1200, 1600, 'win');

  assert.equal(afterWin, 1212);
  assert.equal(afterLoss, 1188);
  assert.equal(afterDrawEqual, 1200);
  assert.ok(afterUpsetWin > afterWin, 'Beating a stronger opponent should award more Elo');
});

test('Chess Basics star-capture engine computes rook/knight/pawn moves without kings', () => {
  const knightPieces = [
    { square: 'e4', type: 'n' as const, color: 'w' as const },
    { square: 'd4', type: 'p' as const, color: 'w' as const },
    { square: 'e5', type: 'p' as const, color: 'w' as const },
  ];
  const knightTargets = getBasicsLegalMoves(knightPieces, 'e4', ['f6', 'g3']);
  assert.ok(knightTargets.includes('f6'), 'Knight should jump over pawns to f6');
  assert.ok(knightTargets.includes('g3'));

  const moved = applyBasicsStarMove({
    pieces: knightPieces,
    stars: ['f6', 'g3'],
    from: 'e4',
    to: 'f6',
  });
  assert.equal(moved.moved, true);
  assert.equal(moved.captured, true);
  assert.deepEqual(moved.stars, ['g3']);

  const pawnPromo = applyBasicsStarMove({
    pieces: [{ square: 'd7', type: 'p', color: 'w' }],
    stars: ['d8'],
    from: 'd7',
    to: 'd8',
  });
  assert.equal(pawnPromo.moved, true);
  assert.equal(pawnPromo.pieces[0].type, 'q');
});

test('pickNextCoordinate picks valid distinct algebraic squares', () => {
  let prev = 'e4';
  for (let i = 0; i < 20; i++) {
    const next = pickNextCoordinate(prev);
    assert.match(next, /^[a-h][1-8]$/);
    assert.notEqual(next, prev);
    prev = next;
  }
});

test('parseStudyPgnChapters parses study annotations, arrows, highlights, and sanitizes Lichess text', () => {
  const samplePgn = `[Event "Lichess Practice: The Pin: Pin #1"]
[StudyName "Lichess Practice: The Pin"]
[ChapterName "Set up a pin"]
[Orientation "black"]
[Termination "+200cp in 2"]
[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]
[Annotator "https://lichess.org/@/arex"]

{ [%cal Ye5h8,Rd4h8][%csl Gf2] Welcome to Lichess study! } 1. e4 e5 (1... c5 2. Nf3) 2. Nf3! { Developing on Lichess cleanly } *`;

  const chapters = parseStudyPgnChapters(samplePgn);
  assert.equal(chapters.length, 1);
  const ch = chapters[0];
  assert.equal(ch.studyName, 'The Pin');
  assert.equal(ch.name, 'Set up a pin');
  assert.equal(ch.orientation, 'b');
  assert.equal(ch.goalCp, 200);
  assert.equal(ch.goalMoves, 2);
  assert.ok(!ch.initialComment.toLowerCase().includes('lichess'));
  assert.equal(ch.initialArrows.length, 2);
  assert.deepEqual(ch.initialArrows[0], { from: 'e5', to: 'h8', color: 'yellow' });
  assert.deepEqual(ch.initialHighlights, [{ square: 'f2', color: 'green' }]);
  assert.equal(ch.moves.length, 3);
  assert.equal(ch.moves[1].variationsText[0], '1... c5 2. Nf3');
  assert.ok(!ch.moves[2].comment.toLowerCase().includes('lichess'));
});

test('formatLastSeenAgo, formatJoinedDate, mergeSyncedAccountStats, and leave guard work reliably', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatLastSeenAgo(now - 60_000, now), 'Online now');
  assert.equal(formatLastSeenAgo(now - 25 * 60_000, now), 'Online 25 mins ago');
  assert.equal(formatLastSeenAgo(now - 16 * 3600_000, now), 'Online 16 hours ago');
  assert.equal(formatLastSeenAgo(now - 90 * 86_400_000, now), 'Online 3 mos ago');
  assert.equal(formatLastSeenAgo(now - 400 * 86_400_000, now), 'Online 1 yr ago');
  assert.equal(formatLastSeenAgo(now - 4500 * 86_400_000, now), 'Offline');
  assert.equal(formatLastSeenAgo(Math.floor((now - 10 * 60_000) / 1000), now), 'Online 10 mins ago');
  assert.equal(formatLastSeenAgo(undefined, now), 'Active player');
  assert.ok(formatJoinedDate(1_765_411_200_000).includes('2025'));

  const merged = mergeSyncedAccountStats({
    localPerfs: {
      rapid: { rating: 1200, games: 0 },
      blitz: { rating: 1150, games: 2 },
      bullet: { rating: 1100, games: 0 },
      puzzle: { rating: 1150, games: 0 },
    },
    remotePerfs: {
      rapid: { rating: 1580, games: 42 },
      blitz: { rating: 1490, games: 15 },
      bullet: { rating: 1320, games: 0 },
      puzzle: { rating: 1710, games: 85 },
    },
    localCount: { all: 2, win: 1, loss: 1, draw: 0 },
    remoteCount: { all: 57, win: 30, loss: 22, draw: 5 },
  });
  assert.equal(merged.perfs.rapid.rating, 1580);
  assert.equal(merged.perfs.blitz.rating, 1490);
  assert.equal(merged.perfs.bullet.rating, 1100);
  assert.equal(merged.count.all, 57);

  const awards = computeUserAwards({
    streakDays: 3,
    puzzleSolved: 12,
    puzzleBestStreak: 5,
    rushBest: 7,
    gamesPlayed: 4,
    beatenBotsCount: 2,
    lessonsCompleted: 1,
  });
  assert.equal(awards.length, 6);
  assert.equal(awards.every((a) => a.unlocked), true);

  assert.equal(
    shouldConfirmLeaveGame({ activeTab: 'play', isOnlineMode: true, isGameOver: false, moveCount: 0 }),
    true,
  );
  assert.equal(
    shouldConfirmLeaveGame({ activeTab: 'play', isOnlineMode: false, isGameOver: false, moveCount: 2 }),
    true,
  );
  assert.equal(
    shouldConfirmLeaveGame({ activeTab: 'play', isOnlineMode: true, isGameOver: true, moveCount: 10 }),
    false,
  );
  assert.equal(
    shouldConfirmLeaveGame({ activeTab: 'home', isOnlineMode: true, isGameOver: false, moveCount: 10 }),
    false,
  );
});

test('countryCodeToFlagEmoji, formatGamePlayedAgo, and expanded curriculum work reliably', () => {
  const now = 1_700_000_000_000;
  assert.equal(countryCodeToFlagEmoji('iq'), '🇮🇶');
  assert.equal(countryCodeToFlagEmoji('NO'), '🇳🇴');
  assert.equal(countryCodeToFlagEmoji(''), '');
  assert.equal(countryCodeToFlagEmoji('USA'), '');

  assert.equal(formatGamePlayedAgo(now - 20_000, now), 'Just now');
  assert.equal(formatGamePlayedAgo(now - 12 * 60_000, now), '12m ago');
  assert.equal(formatGamePlayedAgo(now - 5 * 3600_000, now), '5h ago');
  assert.equal(formatGamePlayedAgo(now - 3 * 86400_000, now), '3d ago');
  assert.equal(formatGamePlayedAgo(undefined, now), '');

  const lessonIds = new Set(CHESS_BASICS_LESSONS.map((l) => l.id));
  assert.equal(CHESS_BASICS_LESSONS.length, 18);
  const totalBasicsStages = CHESS_BASICS_LESSONS.reduce((acc, l) => acc + l.stages.length, 0);
  assert.equal(totalBasicsStages, 110);
  assert.ok(lessonIds.has('basics-combat'));
  assert.ok(lessonIds.has('basics-setup'));
  assert.ok(lessonIds.has('basics-check2'));
  assert.ok(CHESS_BASICS_LESSONS.some((l) => l.section === 'Chess pieces'));
  assert.ok(CHESS_BASICS_LESSONS.some((l) => l.section === 'Fundamentals'));
  assert.ok(CHESS_BASICS_LESSONS.some((l) => l.section === 'Intermediate'));
  assert.ok(CHESS_BASICS_LESSONS.some((l) => l.section === 'Advanced'));

  assert.equal(PRACTICE_COURSES.length, 32);
  const totalPracticeExercises = PRACTICE_COURSES.reduce((acc, c) => acc + c.totalExercises, 0);
  assert.equal(totalPracticeExercises, 316);
  const pieceCheckmates = PRACTICE_COURSES.find((c) => c.id === 'BJy6fEDf');
  assert.equal(pieceCheckmates?.totalExercises, 6);
  const patternsI = PRACTICE_COURSES.find((c) => c.id === 'fE4k21MW');
  assert.equal(patternsI?.totalExercises, 18);
  assert.ok(PRACTICE_COURSES.some((c) => c.id === 'heQDnvq7' && c.title === 'Intermediate Rook Endings'));
  assert.ok(PRACTICE_COURSES.some((c) => c.id === 'wS23j5Tm' && c.title === 'Practical Rook Endings'));
});

test('mergeSyncedGames deduplicates by id, keeps richer PGN/opening, and sorts newest first', () => {
  const older = {
    id: 'g-1',
    rated: true,
    speed: 'rapid',
    status: 'mate',
    winner: 'white' as const,
    white: { name: 'Alice', rating: 1450 },
    black: { name: 'Bob', rating: 1440 },
    pgn: '1. e4 e5',
    createdAt: 1000,
    lastMoveAt: 2000,
  };
  const richerSame = {
    id: 'g-1',
    rated: true,
    speed: 'rapid',
    status: 'mate',
    winner: 'white' as const,
    white: { name: 'Alice', rating: 1450 },
    black: { name: 'Bob', rating: 1440 },
    opening: 'Italian Game',
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4',
    createdAt: 1000,
    lastMoveAt: 2500,
  };
  const newest = {
    id: 'g-2',
    rated: true,
    speed: 'blitz',
    status: 'resign',
    winner: 'black' as const,
    white: { name: 'Bob' },
    black: { name: 'Alice', rating: 1462 },
    pgn: '1. d4 Nf6',
    createdAt: 5000,
    lastMoveAt: 6000,
  };

  const merged = mergeSyncedGames([older], [richerSame, newest]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'g-2');
  assert.equal(merged[1].id, 'g-1');
  assert.equal(merged[1].opening, 'Italian Game');
  assert.equal(merged[1].pgn, '1. e4 e5 2. Nf3 Nc6 3. Bc4');
  assert.equal(merged[1].lastMoveAt, 2500);
});

test('mergePuzzleSyncStats adopts remote rating before local attempts and preserves active local progression', () => {
  const freshLocal = { ...DEFAULT_PUZZLE_STATS };
  const adopted = mergePuzzleSyncStats(freshLocal, {
    syncedPuzzleRating: 1685,
    syncedStreakHigh: 9,
  });
  assert.equal(adopted.rating, 1685);
  assert.equal(adopted.bestStreak, 9);

  const activeLocal = {
    ...DEFAULT_PUZZLE_STATS,
    rating: 1712,
    attemptCount: 4,
    bestStreak: 12,
  };
  const preserved = mergePuzzleSyncStats(activeLocal, {
    syncedPuzzleRating: 1685,
    syncedStreakHigh: 9,
  });
  assert.equal(preserved, activeLocal);
  assert.equal(preserved.rating, 1712);
  assert.equal(preserved.bestStreak, 12);

  // When remote puzzle rating changed since last sync, propagate remote rating even after local attempts
  const remoteUpdated = mergePuzzleSyncStats(activeLocal, {
    syncedPuzzleRating: 1740,
    syncedStreakHigh: 15,
    prevSyncedPuzzleRating: 1685,
  });
  assert.equal(remoteUpdated.rating, 1740);
  assert.equal(remoteUpdated.bestStreak, 15);
});

test('isGamePlayedAsBlack and authoritativeRemote account merging handle Lichess sync accurately', () => {
  const game = {
    white: { name: 'OpponentA', rating: 1500 },
    black: { name: 'AliChess99', rating: 1520 },
  };
  assert.equal(isGamePlayedAsBlack(game, 'alichess99'), true);
  assert.equal(isGamePlayedAsBlack(game, 'OpponentA'), false);
  assert.equal(isGamePlayedAsBlack({ white: { name: 'Bot' }, black: { name: 'You' } }, null), true);
  assert.equal(isGamePlayedAsBlack({ white: { name: 'You' }, black: { name: 'Bot' } }, null), false);
  assert.equal(
    isGamePlayedAsBlack({ white: { name: 'Guest Opponent' }, black: { name: 'Guest Player' } }, null),
    true,
  );
  assert.equal(
    isGamePlayedAsBlack({ white: { name: 'Guest Player' }, black: { name: 'Guest Opponent' } }, null),
    false,
  );

  const synced = mergeSyncedAccountStats({
    localPerfs: {
      rapid: { rating: 1200, games: 5 },
      blitz: { rating: 1150, games: 10 },
      bullet: { rating: 1100, games: 0 },
      puzzle: { rating: 1150, games: 0 },
    },
    remotePerfs: {
      rapid: { rating: 1612, games: 3 },
      blitz: { rating: 1545, games: 24 },
      bullet: { rating: 1500, games: 0 },
      puzzle: { rating: 1790, games: 40 },
      classical: { rating: 1660, games: 8 },
      correspondence: { rating: 1580, games: 4 },
      storm: { runs: 12, score: 34 },
      streak: { runs: 7, score: 19 },
    },
    localCount: { all: 15, win: 8, loss: 6, draw: 1 },
    remoteCount: { all: 35, win: 18, loss: 14, draw: 3 },
    authoritativeRemote: true,
  });

  assert.equal(synced.perfs.rapid.rating, 1612);
  assert.equal(synced.perfs.blitz.rating, 1545);
  assert.equal(synced.perfs.bullet.rating, 1500);
  assert.equal(synced.perfs.puzzle.rating, 1790);
  assert.equal(synced.perfs.classical?.rating, 1660);
  assert.equal(synced.perfs.correspondence?.rating, 1580);
  assert.equal(synced.perfs.storm?.score, 34);
  assert.equal(synced.perfs.streak?.score, 19);
  assert.equal(synced.count.all, 35);
});

test('evaluateCoachStudentMove and explainCoachReplyMove give interactive teaching feedback across personas', () => {
  assert.equal(COACH_STRENGTH_LEVELS.length, 5);
  assert.equal(COACH_PROFILES.length, 4);
  assert.equal(getCoachProfile('dante').title, 'GM');
  assert.equal(getCoachProfile('elena').title, 'WGM');

  // Opening move 1. e4 is Book/Good and should not pause
  const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const e4Eval = evaluateCoachStudentMove(startFen, 'e2', 'e4', 'q', 0, 'dante');
  assert.ok(e4Eval !== null);
  assert.equal(e4Eval.shouldPause, false);
  assert.ok(e4Eval.quality === 'Book' || e4Eval.quality === 'Best' || e4Eval.quality === 'Good');
  assert.ok(e4Eval.explanation.length > 10);

  // Hanging knight blunder 3. Nxe5?? should pause with a better suggestion
  const knightHangFen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
  const blunderEval = evaluateCoachStudentMove(knightHangFen, 'f3', 'e5', 'q', 4, 'elena');
  assert.ok(blunderEval !== null);
  assert.equal(blunderEval.shouldPause, true);
  assert.ok(blunderEval.quality === 'Blunder' || blunderEval.quality === 'Mistake');
  assert.notEqual(blunderEval.bestSan, 'Nxe5');

  // Fool's mate setup 2. g4?? should pause and warn about checkmate
  const foolsFen = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';
  const foolsEval = evaluateCoachStudentMove(foolsFen, 'g2', 'g4', 'q', 2, 'vera');
  assert.ok(foolsEval !== null);
  assert.equal(foolsEval.shouldPause, true);
  assert.ok((foolsEval.tacticalWarning ?? '').toLowerCase().includes('checkmate'));

  // Coach reply move explanation describes development cleanly and reflects persona
  const afterE4Fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const replyDante = explainCoachReplyMove(
    afterE4Fen,
    { san: 'Nc6', from: 'b8', to: 'c6', piece: 'n', color: 'b', flags: 'n' },
    1,
    'dante',
  );
  const replyVera = explainCoachReplyMove(
    afterE4Fen,
    { san: 'Nc6', from: 'b8', to: 'c6', piece: 'n', color: 'b', flags: 'n' },
    1,
    'vera',
  );
  assert.ok(replyDante.length > 10);
  assert.notEqual(replyDante, replyVera);
});

test('mergeFriendsWithRemote respects removedFriends and deduplicates case-insensitively', () => {
  const merged = mergeFriendsWithRemote({
    existingFriends: ['MagnusCarlsen', 'Hikaru'],
    remoteFollowing: ['magnuscarlsen', 'DanielNaroditsky', 'AlirezaFirouzja'],
    removedFriends: ['AlirezaFirouzja'],
  });
  assert.deepEqual(merged, ['MagnusCarlsen', 'Hikaru', 'DanielNaroditsky']);
});

test('isDuplicateRemoteChat suppresses echoed self messages while preserving opponent chat', () => {
  const now = 1_700_000_000_000;
  const recentMessages = [
    { sender: 'AliChess99', color: 'w' as const, text: 'Good luck!', timestamp: now - 500 },
  ];

  // Echo from same username or Lichess system is suppressed
  assert.equal(
    isDuplicateRemoteChat({
      senderRaw: 'alichess99',
      text: 'Good luck!',
      humanName: 'AliChess99',
      humanColor: 'w',
      recentMessages,
      now,
    }),
    true,
  );
  assert.equal(
    isDuplicateRemoteChat({
      senderRaw: 'lichess',
      text: 'Takeback declined',
      humanName: 'AliChess99',
      humanColor: 'w',
      recentMessages,
      now,
    }),
    true,
  );
  // Real opponent message passes through
  assert.equal(
    isDuplicateRemoteChat({
      senderRaw: 'Opponent99',
      text: 'Have fun!',
      humanName: 'AliChess99',
      humanColor: 'w',
      recentMessages,
      now,
    }),
    false,
  );
});

test('mergePuzzleSyncStats adopts authoritative remote rating even with prior local attempts', () => {
  const localAfterGuestSolves = {
    ...DEFAULT_PUZZLE_STATS,
    rating: 1184,
    attemptCount: 5,
    solvedCount: 4,
    bestStreak: 3,
  };

  // Without authoritative flag and unchanged prevSyncedPuzzleRating, local rating would win
  const nonAuth = mergePuzzleSyncStats(localAfterGuestSolves, {
    syncedPuzzleRating: 1945,
    syncedStreakHigh: 12,
    prevSyncedPuzzleRating: 1945,
    authoritative: false,
  });
  assert.equal(nonAuth.rating, 1184);

  // With authoritative real account connected, real remote puzzle rating overrides local rating
  const authSynced = mergePuzzleSyncStats(localAfterGuestSolves, {
    syncedPuzzleRating: 1945,
    syncedStreakHigh: 12,
    prevSyncedPuzzleRating: 1945,
    authoritative: true,
  });
  assert.equal(authSynced.rating, 1945);
  assert.equal(authSynced.bestStreak, 12);
});

test('evaluateMovesBatch matches per-ply evaluation cleanly across full game skeleton', () => {
  const samplePgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5';
  const skeleton = extractGameSkeleton(samplePgn);
  const perPly = skeleton.map((m, idx) => evaluateSinglePly(m, idx));

  const working = [...skeleton];
  let idx = 0;
  while (idx < working.length) {
    idx = evaluateMovesBatch(working, idx, 4, 100);
  }
  assert.equal(idx, working.length);

  const expectedSummary = summarizeGameReview(perPly);
  const batchSummary = summarizeGameReview(working);
  assert.equal(batchSummary.whiteAccuracy, expectedSummary.whiteAccuracy);
  assert.equal(batchSummary.blackAccuracy, expectedSummary.blackAccuracy);
  assert.deepEqual(
    batchSummary.moves.map((m) => [m.san, m.quality, m.evalCp]),
    expectedSummary.moves.map((m) => [m.san, m.quality, m.evalCp]),
  );
});

test('buildPostGameReviewSummary computes decimal accuracy, counts, game ratings, and phase grades', () => {
  const mkMove = (
    ply: number,
    color: 'w' | 'b',
    quality: EvaluatedMove['quality'],
    cpLoss: number,
  ): EvaluatedMove => ({
    ply,
    moveNumber: Math.ceil(ply / 2),
    color,
    san: color === 'w' ? 'e4' : 'e5',
    from: 'e2',
    to: 'e4',
    fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    evalCp: color === 'w' ? 35 : -20,
    bestMoveSan: 'e4',
    cpLoss,
    quality,
  });

  // 48-ply synthetic game covering Opening (<16), Middlegame/Strategy (16..45), and Endgame (>=46)
  const evaluated: EvaluatedMove[] = [];
  for (let i = 0; i < 48; i++) {
    const color: 'w' | 'b' = i % 2 === 0 ? 'w' : 'b';
    if (color === 'w') {
      if (i === 0) evaluated.push(mkMove(i + 1, 'w', 'Book', 0));
      else if (i === 18) evaluated.push(mkMove(i + 1, 'w', 'Brilliant', 0));
      else evaluated.push(mkMove(i + 1, 'w', 'Best', 5));
    } else {
      if (i < 16) evaluated.push(mkMove(i + 1, 'b', 'Mistake', 180));
      else if (i === 25) evaluated.push(mkMove(i + 1, 'b', 'Blunder', 380));
      else if (i === 35) evaluated.push(mkMove(i + 1, 'b', 'Blunder', 350));
      else evaluated.push(mkMove(i + 1, 'b', 'Inaccuracy', 60));
    }
  }

  const summary = buildPostGameReviewSummary({
    evaluated,
    resultLabel: '1-0',
    whiteBaseRating: 1200,
    blackBaseRating: 1200,
  });

  assert.equal(summary.whiteCounts.Book, 1);
  assert.equal(summary.whiteCounts.Brilliant, 1);
  assert.equal(summary.whiteCounts.Best, 22);
  assert.equal(summary.blackCounts.Blunder, 2);
  assert.equal(summary.blackCounts.Mistake, 8);
  assert.ok(summary.whiteAccuracyExact > summary.blackAccuracyExact);
  assert.ok(summary.whiteAccuracyExact >= 95 && summary.whiteAccuracyExact <= 99.9);
  assert.ok(summary.whiteGameRating > summary.blackGameRating);
  assert.equal(summary.whiteGameRating % 50, 0);
  assert.equal(summary.blackGameRating % 50, 0);
  assert.equal(summary.whitePhases.opening, 'Best');
  assert.equal(summary.whitePhases.tactics, 'Best');
  assert.equal(summary.whitePhases.endgame, 'Best');
  assert.equal(summary.blackPhases.opening, 'Blunder');
  assert.equal(summary.blackPhases.tactics, 'Blunder');
});

test('buildSmartMoveAnalysis and buildSmartGameInsights generate rich coaching commentary and win probabilities', () => {
  assert.equal(cpToWhiteWinPercent(0), 50);
  assert.ok(cpToWhiteWinPercent(250) > 70);
  assert.ok(cpToWhiteWinPercent(-250) < 30);

  const samplePgn = '1. e4 e5 2. Nf3 Nc6 3. Nxe5 Nxe5 4. d4 Nc6';
  const skeleton = extractGameSkeleton(samplePgn);
  const evaluated = skeleton.map((m, idx) => evaluateSinglePly(m, idx));

  const move1Analysis = buildSmartMoveAnalysis(evaluated[0], null, 'dante');
  assert.ok(move1Analysis.headline.includes('1. e4'));
  assert.ok(move1Analysis.why.length > 20);
  assert.ok(move1Analysis.tags.length >= 1);
  assert.equal(move1Analysis.phase, 'Opening');

  const blunderMove = evaluated.find((m) => m.san === 'Nxe5' && m.color === 'w') ?? evaluated[4];
  const blunderAnalysis = buildSmartMoveAnalysis(blunderMove, evaluated[3], 'vera');
  assert.ok(blunderAnalysis.why.length > 20);
  assert.ok((blunderAnalysis.betterPlan ?? '').length > 10);

  const insights = buildSmartGameInsights(evaluated, 'w', 'dante');
  assert.ok(insights.summaryHeadline.length > 15);
  assert.ok(insights.coachVerdict.length > 15);
  assert.ok(insights.keyTakeaways.length >= 1);
});

test('SHARPING_DAILY_PLANS provides 7 distinct daily themes and supports drill rotation', () => {
  assert.equal(SHARPING_DAILY_PLANS.length, 7);
  const uniqueDays = new Set(SHARPING_DAILY_PLANS.map((p) => p.shortDay));
  assert.equal(uniqueDays.size, 7);
  const uniqueFocuses = new Set(SHARPING_DAILY_PLANS.map((p) => p.dayLabel));
  assert.equal(uniqueFocuses.size, 7);

  for (let d = 0; d < 7; d++) {
    const base = getSharpingPlanForDay(d, 0);
    const rotated = getSharpingPlanForDay(d, 1);
    assert.equal(base.weekdayIndex, d);
    assert.equal(base.tasks.length, 3);
    assert.equal(rotated.tasks.length, 3);
    assert.notDeepEqual(
      base.tasks.map((t) => t.id),
      rotated.tasks.map((t) => t.id),
      `Expected day ${d} (${base.shortDay}) to rotate into fresh drills`,
    );
  }
});

test('hasPlayableMovesInPgn and mergeSyncedGames filter out 0-move aborted games', () => {
  const abortedHeaderOnly = `[Event "Rated rapid game"]\n[White "PlayerOne"]\n[Black "Opponent"]\n[Result "*"]\n\n*`;
  assert.equal(hasPlayableMovesInPgn(abortedHeaderOnly), false);
  assert.equal(hasPlayableMovesInPgn(''), false);
  assert.equal(hasPlayableMovesInPgn('1. e4 e5 1-0'), true);

  const merged = mergeSyncedGames(
    [
      {
        id: 'aborted-1',
        rated: true,
        speed: 'rapid',
        status: 'aborted',
        white: { name: 'PlayerOne' },
        black: { name: 'Opponent' },
        pgn: abortedHeaderOnly,
      },
    ],
    [
      {
        id: 'valid-1',
        rated: true,
        speed: 'rapid',
        status: 'mate',
        winner: 'white',
        white: { name: 'PlayerOne', rating: 786 },
        black: { name: 'Opponent', rating: 775 },
        pgn: '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
      },
    ],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'valid-1');
});

test('AVATAR_PRESETS and resolveKnownBotOrCoachId never assign bot portraits to human usernames', () => {
  assert.equal(AVATAR_PRESETS.length, 19);
  assert.equal(findAvatarPreset('default'), null);
  assert.equal(findAvatarPreset('preset-sofia')?.label, 'Theory Sofia');
  assert.equal(isCustomImageAvatar('data:image/jpeg;base64,abc'), true);
  assert.equal(isCustomImageAvatar('preset-sofia'), false);

  const botId = resolveDeterministicPlayerBotId('PlayerOne');
  assert.ok(BOT_PROFILES.some((b) => b.id === botId));
});

test('upsertPendingInvite, pruneExpiredInvites, and removePendingInvite handle live game invites idempotently', () => {
  const now = 1_700_000_000_000;
  const expired: PendingGameInvite = {
    id: 'inv-old',
    fromUsername: 'Alice',
    toUsername: 'Bob',
    timeId: '10+0',
    initialSeconds: 600,
    incrementSeconds: 0,
    rated: false,
    fromColor: 'w',
    roomId: 'OCOLD1',
    createdAt: now - 200_000,
    expiresAt: now - 10_000,
  };
  const fresh: PendingGameInvite = {
    id: 'inv-1',
    fromUsername: 'Alice',
    toUsername: 'Bob',
    timeId: '5+0',
    initialSeconds: 300,
    incrementSeconds: 0,
    rated: false,
    fromColor: 'b',
    roomId: 'OCNEW1',
    createdAt: now - 1000,
    expiresAt: now + 180_000,
  };

  assert.equal(pruneExpiredInvites([expired, fresh], now).length, 1);
  const once = upsertPendingInvite([expired], fresh, now);
  assert.equal(once.length, 1);
  assert.equal(once[0].id, 'inv-1');

  // Re-applying same invite id does not duplicate it
  const twice = upsertPendingInvite(once, { ...fresh, timeId: '3+0' }, now);
  assert.equal(twice.length, 1);
  assert.equal(twice[0].timeId, '3+0');

  // Removing invite removes it cleanly
  assert.equal(removePendingInvite(twice, 'inv-1').length, 0);
});

test('computeClientStockfish19NnueMultiPv runs Stockfish 19 NNUE on client side with Multi-PV lines', () => {
  assert.equal(STOCKFISH_19_NNUE_ENGINE_VERSION, 'OpenChess Engine');
  const startFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const result = computeClientStockfish19NnueMultiPv(startFen, 19, 3, 25);

  assert.equal(result.source, 'stockfish-19-nnue');
  assert.equal(result.clientSide, true);
  assert.equal(result.depth, 19);
  assert.equal(result.lines.length, 3);
  assert.ok(result.lines[0].firstMoveSan.length >= 2);
  assert.ok(result.lines[0].lineSan.length >= 1);
  assert.match(result.lines[0].firstMoveFrom, /^[a-h][1-8]$/);
  assert.match(result.lines[0].firstMoveTo, /^[a-h][1-8]$/);
});

test('getFairMatchmakingEloBand and clampOpponentEloToBand enforce ±300 Elo matchmaking', () => {
  // User at 187 Elo must only face opponents within [100, 487] Elo (never 1800!)
  const band187 = getFairMatchmakingEloBand(187);
  assert.deepEqual(band187, { minElo: 100, maxElo: 487 });
  assert.equal(isWithinFairEloBand(187, 1800), false);
  assert.equal(isWithinFairEloBand(187, 300), true);

  const clamped187 = clampOpponentEloToBand(187, 1800, 'OpponentX');
  assert.ok(clamped187 >= 100 && clamped187 <= 487);
  assert.ok(Math.abs(clamped187 - 187) <= 300);

  // User at 1500 Elo must only face opponents within [1200, 1800] Elo
  const band1500 = getFairMatchmakingEloBand(1500);
  assert.deepEqual(band1500, { minElo: 1200, maxElo: 1800 });
  assert.equal(isWithinFairEloBand(1500, 1200), true);
  assert.equal(isWithinFairEloBand(1500, 1800), true);
  assert.equal(isWithinFairEloBand(1500, 1850), false);
  assert.equal(isWithinFairEloBand(1500, 1150), false);
});

test('chooseBotMove and pickCalibratedEngineLine enforce realistic human-like strength per Elo tier', () => {
  // Position where Black can blunder with Qxd4?? or play strong Nc6/e6
  const pos = 'rnbqkbnr/ppp2ppp/8/3pp3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 0 3';
  const lowMoves = new Set<string>();
  const highMoves = new Set<string>();
  const lowBotId = getNearestBotForElo(400).id;
  const highBotId = getNearestBotForElo(1700).id;
  for (let i = 0; i < 12; i++) {
    const r = (i + 0.5) / 12;
    const low = chooseBotMove(pos, lowBotId, () => r, 400);
    const high = chooseBotMove(pos, highBotId, () => r, 1700);
    if (low) lowMoves.add(low.san);
    if (high) highMoves.add(high.san);
  }
  assert.ok(lowMoves.size > 1, 'Low-Elo 400 bot should exhibit realistic move variety & inaccuracies');
  assert.ok(highMoves.size >= 1);

  const sampleLines = [
    { firstMoveFrom: 'e7', firstMoveTo: 'e5', firstMoveSan: 'e5', evalCp: 20, evalText: '+0.20', lineSan: ['e5'] },
    { firstMoveFrom: 'c7', firstMoveTo: 'c5', firstMoveSan: 'c5', evalCp: 28, evalText: '+0.28', lineSan: ['c5'] },
    { firstMoveFrom: 'g8', firstMoveTo: 'f6', firstMoveSan: 'Nf6', evalCp: 35, evalText: '+0.35', lineSan: ['Nf6'] },
    { firstMoveFrom: 'b8', firstMoveTo: 'c6', firstMoveSan: 'Nc6', evalCp: 85, evalText: '+0.85', lineSan: ['Nc6'] },
    { firstMoveFrom: 'a7', firstMoveTo: 'a6', firstMoveSan: 'a6', evalCp: 165, evalText: '+1.65', lineSan: ['a6'] },
  ];
  const gmPick = pickCalibratedEngineLine(sampleLines, 2850, () => 0.1);
  assert.equal(gmPick?.firstMoveSan, 'e5');

  const clubBestRoll = pickCalibratedEngineLine(sampleLines, 1700, () => 0.85);
  assert.equal(clubBestRoll?.firstMoveSan, 'e5');

  const clubAltRoll = pickCalibratedEngineLine(sampleLines, 1700, () => 0.15);
  assert.ok(clubAltRoll !== null);
  assert.notEqual(clubAltRoll.firstMoveSan, 'e5', '1700 bot picks realistic Multi-PV alternatives on suboptimal rolls');
});


