import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichGamePgnWithHeaders, FEATURED_MASTER_GAMES, mergeSyncedGames } from './analytics';
import { extractGameSkeleton } from './engine';
import {
  appendRatingHistoryPoint,
  canonicalizeGmailAddress,
  computeLeagueInfo,
  computePremoveTargets,
  countUnreadDirectMessages,
  enqueuePremoveMove,
  filterNamedOpenChallenges,
  formatOnlineTimeControl,
  isGoogleMxHost,
  isPlaceholderPlayerUsername,
  isPremoveLegalAfterReply,
  mergeFriendsBackupWithServer,
  mergeLocalAccountProgress,
  mergeOpenChessAccountProgress,
  parseFicsGameEndLine,
  parseFicsSoughtOutput,
  parseFicsStyle12Line,
  parseFicsWhoOutput,
  projectBoardForPremove,
  resolveOnlineOpponentRating,
  upsertDirectMessage,
  validateGoogleOrGmailEmail,
} from './onlineHelpers';
import { DEFAULT_THEME_PREFS, normalizeThemePrefs } from './theme';

test('computePremoveTargets computes pseudo-legal premove squares including captures, castling, and promotions', () => {
  const pawnStart = computePremoveTargets('p', 'w', 'e2', new Set(['d3', 'f3']));
  assert.equal(pawnStart.has('e3'), true);
  assert.equal(pawnStart.has('e4'), true);
  assert.equal(pawnStart.get('d3')?.isCapture, true);
  assert.equal(pawnStart.get('f3')?.isCapture, true);

  const pawnPromo = computePremoveTargets('p', 'w', 'a7', new Set());
  assert.equal(pawnPromo.get('a8')?.isPromo, true);
  assert.equal(pawnPromo.get('b8')?.isPromo, true);

  const knightCenter = computePremoveTargets('n', 'w', 'g1', new Set(['e2']));
  assert.equal(knightCenter.has('f3'), true);
  assert.equal(knightCenter.has('h3'), true);
  assert.equal(knightCenter.get('e2')?.isCapture, true);

  const kingCastle = computePremoveTargets('k', 'w', 'e1', new Set());
  assert.equal(kingCastle.has('g1'), true);
  assert.equal(kingCastle.has('c1'), true);

  // Post-reply turn & coordinate guard
  const fenAfterBlackE5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';
  assert.equal(
    isPremoveLegalAfterReply({ fen: fenAfterBlackE5, playerColor: 'w', from: 'g1', to: 'f3' }),
    true,
  );
  assert.equal(
    isPremoveLegalAfterReply({ fen: fenAfterBlackE5, playerColor: 'b', from: 'g8', to: 'f6' }),
    false,
  );
  assert.equal(
    isPremoveLegalAfterReply({ fen: fenAfterBlackE5, playerColor: 'w', from: 'e2', to: 'e2' }),
    false,
  );
});

test('filterNamedOpenChallenges strips placeholder names like Lichess Player and enforces ±200 Elo band', () => {
  assert.equal(isPlaceholderPlayerUsername('Lichess Player'), true);
  assert.equal(isPlaceholderPlayerUsername('Lichess_ab12'), true);
  assert.equal(isPlaceholderPlayerUsername('Anonymous'), true);
  assert.equal(isPlaceholderPlayerUsername('RealGM_Hikaru'), false);

  const raw = [
    { id: '1', username: 'Lichess Player', rating: 1200 },
    { id: '2', username: 'Lichess_9f2a', rating: 1210 },
    { id: '3', username: 'Anonymous', rating: 1180 },
    { id: '4', username: 'AlexOpenChess', rating: 1240 },
    { id: '5', username: 'FarStrongPlayer', rating: 1650 },
  ];
  const filtered = filterNamedOpenChallenges(raw, 1200);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].username, 'AlexOpenChess');
});

test('resolveOnlineOpponentRating reads genuine opponent ratings and returns undefined for unrated guests', () => {
  assert.equal(
    resolveOnlineOpponentRating({ hookRating: 1684, v5OpponentRating: 1690, speed: 'rapid' }),
    1684,
  );
  assert.equal(
    resolveOnlineOpponentRating({
      v5OpponentRating: 1825,
      publicPerfs: { blitz: { rating: 1750 } },
      speed: 'blitz',
    }),
    1825,
  );
  assert.equal(
    resolveOnlineOpponentRating({
      publicPerfs: { blitz: { rating: 1540 }, rapid: { rating: 1612 } },
      speed: 'rapid',
    }),
    1612,
  );
  assert.equal(
    resolveOnlineOpponentRating({ publicPerfs: null, speed: 'rapid' }),
    undefined,
  );
});

test('validateGoogleOrGmailEmail allows genuine Gmail addresses and rejects fakes/disposables', () => {
  const valid = validateGoogleOrGmailEmail('  Alex.Morgan2025+chess@Gmail.com  ');
  assert.equal(valid.valid, true);
  assert.equal(valid.isGmailConsumer, true);
  assert.equal(valid.requiresGoogleMxCheck, false);
  assert.equal(valid.canonicalEmail, 'alexmorgan2025@gmail.com');

  const tooShort = validateGoogleOrGmailEmail('a.b@gmail.com');
  assert.equal(tooShort.valid, false);
  assert.match(tooShort.error ?? '', /6 characters/i);

  const disposable = validateGoogleOrGmailEmail('chessplayer@mailinator.com');
  assert.equal(disposable.valid, false);
  assert.match(disposable.error ?? '', /Disposable/i);

  const nonGoogleConsumer = validateGoogleOrGmailEmail('chessplayer@yahoo.com');
  assert.equal(nonGoogleConsumer.valid, false);
  assert.match(nonGoogleConsumer.error ?? '', /Google/i);

  const workspaceCandidate = validateGoogleOrGmailEmail('player@customclub.org');
  assert.equal(workspaceCandidate.valid, true);
  assert.equal(workspaceCandidate.isGmailConsumer, false);
  assert.equal(workspaceCandidate.requiresGoogleMxCheck, true);
});

test('canonicalizeGmailAddress normalizes dot and plus aliases', () => {
  assert.equal(canonicalizeGmailAddress('j.d.o.e+promo@googlemail.com'), 'jdoe@gmail.com');
  assert.equal(canonicalizeGmailAddress('Alice.Smith@Workspace.com'), 'alice.smith@workspace.com');
});

test('isGoogleMxHost recognizes official Google mail exchangers only', () => {
  assert.equal(isGoogleMxHost('aspmx.l.google.com.'), true);
  assert.equal(isGoogleMxHost('alt2.gmail-smtp-in.l.google.com'), true);
  assert.equal(isGoogleMxHost('smtp.google.com'), true);
  assert.equal(isGoogleMxHost('mx1.mailinator.com'), false);
  assert.equal(isGoogleMxHost('fakegoogle.com'), false);
});

test('mergeOpenChessAccountProgress never overwrites local OpenChess ratings or profile', () => {
  const merged = mergeOpenChessAccountProgress({
    local: {
      isLocalOpenChessAccount: true,
      localProgressInitialized: true,
      perfs: {
        rapid: { rating: 1345, games: 9 },
        blitz: { rating: 1210, games: 4 },
      },
      count: { all: 13, win: 8, loss: 3, draw: 2, rated: 13 },
      profile: {
        bio: 'Club grinder on OpenChess',
        flag: 'IQ',
        country: 'IQ',
        avatarUrl: 'data:image/jpeg;base64,ABC',
      },
    },
    remote: {
      perfs: {
        rapid: { rating: 1500, games: 0 },
        blitz: { rating: 1500, games: 0 },
      },
      count: { all: 0, win: 0, loss: 0, draw: 0 },
      profile: {
        bio: 'External bio',
        flag: 'US',
        country: 'US',
      },
    },
  });

  assert.equal(merged.perfs?.rapid?.rating, 1345);
  assert.equal(merged.perfs?.rapid?.games, 9);
  assert.equal(merged.count?.win, 8);
  assert.equal(merged.profile.bio, 'Club grinder on OpenChess');
  assert.equal(merged.profile.flag, 'IQ');
  assert.equal(merged.profile.avatarUrl, 'data:image/jpeg;base64,ABC');
});

test('mergeOpenChessAccountProgress syncs remote Lichess perfs and puzzles when preferRemote is true', () => {
  const merged = mergeOpenChessAccountProgress({
    preferRemote: true,
    local: {
      isLocalOpenChessAccount: true,
      localProgressInitialized: true,
      perfs: {
        rapid: { rating: 800, games: 0 },
        blitz: { rating: 800, games: 0 },
        puzzle: { rating: 800, games: 0 },
        storm: { runs: 1, score: 12 },
      },
      count: { all: 0, win: 0, loss: 0, draw: 0, rated: 0 },
      profile: {
        country: 'INT',
        flag: 'INT',
        avatarUrl: 'https://lh3.googleusercontent.com/photo.jpg',
      },
    },
    remote: {
      perfs: {
        rapid: { rating: 1742, games: 84 },
        blitz: { rating: 1690, games: 120 },
        puzzle: { rating: 2015, games: 310 },
        storm: { runs: 4, score: 29 },
      },
      count: { all: 210, win: 112, loss: 86, draw: 12, rated: 204 },
      profile: {
        country: 'NO',
        flag: 'NO',
        bio: 'Synced from Lichess',
      },
    },
  });

  assert.equal(merged.perfs?.rapid?.rating, 1742);
  assert.equal(merged.perfs?.puzzle?.rating, 2015);
  assert.equal(merged.perfs?.storm?.score, 29);
  assert.equal(merged.count?.all, 210);
  assert.equal(merged.profile.country, 'NO');
  assert.equal(merged.profile.bio, 'Synced from Lichess');
  assert.equal(merged.profile.avatarUrl, 'https://lh3.googleusercontent.com/photo.jpg');
});

test('appendRatingHistoryPoint and computeLeagueInfo track real progression', () => {
  let hist = appendRatingHistoryPoint(undefined, 'rapid', 800, 1000);
  hist = appendRatingHistoryPoint(hist, 'rapid', 816, 4000);
  assert.equal(hist.rapid.length, 2);
  assert.equal(hist.rapid[1].rating, 816);

  const stone = computeLeagueInfo(45);
  assert.equal(stone.tier, 'Stone');
  assert.equal(stone.nextTier, 'Bronze');

  const silver = computeLeagueInfo(200);
  assert.equal(silver.tier, 'Silver');
  assert.equal(silver.nextTier, 'Crystal');
  assert.equal(silver.progressPct, 50);

  const champion = computeLeagueInfo(750);
  assert.equal(champion.tier, 'Champion');
  assert.equal(champion.nextTier, 'Legend');

  const legend = computeLeagueInfo(1050);
  assert.equal(legend.tier, 'Legend');
  assert.equal(legend.nextTier, null);
  assert.equal(legend.progressPct, 100);
});

test('upsertDirectMessage & countUnreadDirectMessages manage 1-on-1 threads cleanly', () => {
  let threads = upsertDirectMessage({
    threads: {},
    partnerUsername: 'BobPlayer',
    message: {
      id: 'm1',
      from: 'BobPlayer',
      to: 'AlicePlayer',
      text: 'Want a rematch?',
      timestamp: 1000,
      read: false,
    },
  });
  threads = upsertDirectMessage({
    threads,
    partnerUsername: 'bobplayer',
    message: {
      id: 'm2',
      from: 'AlicePlayer',
      to: 'BobPlayer',
      text: 'Yes!',
      timestamp: 2000,
      read: true,
    },
  });

  assert.equal(threads['bobplayer'].length, 2);
  assert.equal(countUnreadDirectMessages(threads, 'AlicePlayer'), 1);
  assert.equal(countUnreadDirectMessages(threads, 'BobPlayer'), 0);
});

test('enrichGamePgnWithHeaders injects full player, rating, opening, and speed headers for Game Viewer', () => {
  const sampleGame = FEATURED_MASTER_GAMES[0];
  assert.ok(sampleGame, 'FEATURED_MASTER_GAMES should have at least 1 game');
  const enriched = enrichGamePgnWithHeaders({
    ...sampleGame,
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6',
  });
  assert.match(enriched, /\[White "DrNykterstein"\]/);
  assert.match(enriched, /\[Black "Hikaru"\]/);
  assert.match(enriched, /\[WhiteElo "3294"\]/);
  assert.match(enriched, /\[BlackElo "3268"\]/);
  assert.match(enriched, /\[Opening "Ruy Lopez: Berlin Defense/);
  assert.match(enriched, /\[Speed "blitz"\]/);

  for (const fg of FEATURED_MASTER_GAMES) {
    const skel = extractGameSkeleton(enrichGamePgnWithHeaders(fg));
    assert.ok(skel.length > 10, `Featured master game ${fg.id} should parse cleanly with >10 plies`);
  }
});

test('mergeFriendsBackupWithServer never wipes yesterday friends on server restart and respects explicit removals', () => {
  const mergedAfterRestart = mergeFriendsBackupWithServer({
    serverFriends: [],
    serverOutgoing: [],
    serverRemoved: [],
    localBackup: {
      friends: ['AlexFriend', 'SaraChess'],
      outgoingRequests: ['PendingPlayer'],
      removedFriends: [],
    },
  });
  assert.deepEqual(mergedAfterRestart.friends, ['AlexFriend', 'SaraChess']);
  assert.deepEqual(mergedAfterRestart.outgoingRequests, ['PendingPlayer']);

  const mergedWithRemoval = mergeFriendsBackupWithServer({
    serverFriends: ['AlexFriend'],
    serverOutgoing: ['PendingPlayer'],
    serverRemoved: ['sarachess'],
    localBackup: {
      friends: ['AlexFriend', 'SaraChess'],
      outgoingRequests: ['AlexFriend', 'PendingPlayer'],
      removedFriends: [],
    },
  });
  assert.deepEqual(mergedWithRemoval.friends, ['AlexFriend']);
  assert.deepEqual(mergedWithRemoval.outgoingRequests, ['PendingPlayer']);
  assert.equal(mergedWithRemoval.removedFriends.includes('sarachess'), true);
});

test('mergeSyncedGames deduplicates ws/oc room games and preserves completed played matches', () => {
  const clientRec = {
    id: 'ws-AB12CD-1700000000000',
    rated: true,
    speed: 'rapid' as const,
    status: 'resign',
    winner: 'white' as const,
    white: { name: 'PlayerOne', rating: 1320 },
    black: { name: 'FriendTwo', rating: 1290 },
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6',
    createdAt: 1700000000000,
    lastMoveAt: 1700000050000,
  };
  const serverRec = {
    id: 'oc-AB12CD-1700000055000',
    rated: true,
    speed: 'rapid' as const,
    status: 'resign',
    winner: 'white' as const,
    white: { name: 'PlayerOne', rating: 1332 },
    black: { name: 'FriendTwo', rating: 1278 },
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4',
    createdAt: 1700000055000,
    lastMoveAt: 1700000055000,
  };
  const merged = mergeSyncedGames([clientRec], [serverRec]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, serverRec.id);
  assert.equal(merged[0].white.rating, 1332);
  assert.equal(merged[0].black.name, 'FriendTwo');
});

test('mergeLocalAccountProgress restores ratings, game counts, leaguePoints, and profile after server restart', () => {
  const restored = mergeLocalAccountProgress({
    server: {
      localProgressInitialized: false,
      perfs: {
        rapid: { rating: 1200, games: 0 },
        blitz: { rating: 1200, games: 0 },
        bullet: { rating: 1200, games: 0 },
        puzzle: { rating: 1200, games: 0 },
      },
      count: { all: 0, win: 0, loss: 0, draw: 0, rated: 0 },
      leaguePoints: 0,
      profile: { country: 'INT', flag: 'INT' },
    },
    local: {
      perfs: {
        rapid: { rating: 1485, games: 12 },
        blitz: { rating: 1390, games: 6 },
        bullet: { rating: 1250, games: 2 },
        puzzle: { rating: 1620, games: 24 },
      },
      count: { all: 20, win: 13, loss: 5, draw: 2, rated: 18 },
      leaguePoints: 180,
      profile: { country: 'IQ', flag: 'IQ', bio: 'Daily rapid grinder' },
      ratingHistory: {
        rapid: [
          { rating: 1200, ts: 1000 },
          { rating: 1485, ts: 5000 },
        ],
      },
    },
  });

  assert.equal(restored.restoredFromLocal, true);
  assert.equal(restored.perfs.rapid?.rating, 1485);
  assert.equal(restored.perfs.rapid?.games, 12);
  assert.equal(restored.perfs.puzzle?.rating, 1620);
  assert.equal(restored.count.all, 20);
  assert.equal(restored.count.win, 13);
  assert.equal(restored.leaguePoints, 180);
  assert.equal(restored.profile.country, 'IQ');
  assert.equal(restored.profile.bio, 'Daily rapid grinder');
  assert.equal(restored.ratingHistory.rapid.length, 2);

  // Newer server state must NOT be overwritten by older local state
  const keepServer = mergeLocalAccountProgress({
    server: {
      localProgressInitialized: true,
      perfs: {
        rapid: { rating: 1550, games: 30 },
        blitz: { rating: 1410, games: 10 },
        bullet: { rating: 1260, games: 4 },
        puzzle: { rating: 1700, games: 40 },
      },
      count: { all: 44, win: 25, loss: 15, draw: 4, rated: 40 },
      leaguePoints: 320,
      profile: { country: 'IQ', flag: 'IQ', bio: 'Updated bio' },
    },
    local: {
      perfs: {
        rapid: { rating: 1485, games: 12 },
      },
      count: { all: 20, win: 13, loss: 5, draw: 2, rated: 18 },
      leaguePoints: 180,
    },
  });

  assert.equal(keepServer.restoredFromLocal, false);
  assert.equal(keepServer.perfs.rapid?.rating, 1550);
  assert.equal(keepServer.count.all, 44);
  assert.equal(keepServer.leaguePoints, 320);
});

test('parseFicsWhoOutput & parseFicsSoughtOutput parse human players and live seeks while skipping (C) computers and non-standard variants', () => {
  const whoRaw = `
1556 volki                ----:srBOT(TD)
1988 GriffySr(C)          ++++ GuestMMLX
1685^ChessMaster99        1420 PawnPusher
`;
  const whoPlayers = parseFicsWhoOutput(whoRaw);
  assert.equal(whoPlayers.some((p) => p.username === 'volki' && p.rating === 1556), true);
  assert.equal(whoPlayers.some((p) => p.username === 'ChessMaster99' && p.rating === 1685), true);
  assert.equal(whoPlayers.some((p) => p.username === 'PawnPusher' && p.rating === 1420), true);
  assert.equal(whoPlayers.some((p) => /GriffySr/i.test(p.username)), false);

  const soughtRaw = `
 17 1974 GreenArtifex       15   7 unrated standard               0-9999 
 16 ++++ soooyoulose        15   0 unrated standard   [black]     0-9999 m
 25 ++++ GuestMSJK           0  15 unrated blitz                  0-9999 
 36 1988 GriffySr(C)         2  12 unrated blitz                  0-9999 
 41 1820 VariantFan          3   0 unrated wild/fr                0-9999 
`;
  const seeks = parseFicsSoughtOutput(soughtRaw);
  assert.equal(seeks.length, 3);
  assert.equal(seeks[0].adId, '17');
  assert.equal(seeks[0].username, 'GreenArtifex');
  assert.equal(seeks[0].rating, 1974);
  assert.equal(seeks[0].initialSeconds, 900);
  assert.equal(seeks[0].incrementSeconds, 7);
  assert.equal(seeks[0].speed, 'rapid');

  assert.equal(seeks[1].username, 'soooyoulose');
  assert.equal(seeks[1].rating, undefined);
  assert.equal(seeks[1].color, 'black');

  assert.equal(seeks[2].username, 'GuestMSJK');
  assert.equal(seeks[2].speed, 'rapid');
});

test('parseFicsStyle12Line & parseFicsGameEndLine parse live FICS board state, clocks, moves, and termination', () => {
  const s12 =
    '<12> rnbqkbnr pppp-ppp -------- ----p--- ----P--- -------- PPPP-PPP RNBQKBNR W 4 1 1 1 1 0 20 GuestHYBS GuestMMLX -1 5 0 39 39 298 295 2 P/e7-e5 (0:05) e5 0 0 0';
  const parsed = parseFicsStyle12Line(s12);
  assert.ok(parsed);
  assert.equal(
    parsed.fen,
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
  );
  assert.equal(parsed.gameNumber, 20);
  assert.equal(parsed.whiteName, 'GuestHYBS');
  assert.equal(parsed.blackName, 'GuestMMLX');
  assert.equal(parsed.humanColor, 'b'); // myRelation = -1, turn = w -> human is black
  assert.equal(parsed.whiteClockMs, 298000);
  assert.equal(parsed.blackClockMs, 295000);
  assert.deepEqual(parsed.lastMove, { from: 'e7', to: 'e5' });
  assert.equal(parsed.san, 'e5');

  const end1 = parseFicsGameEndLine('{Game 20 (GuestHYBS vs. GuestMMLX) GuestHYBS resigns} 0-1');
  assert.deepEqual(end1, { winner: 'b', reason: 'GuestHYBS resigns' });

  const end2 = parseFicsGameEndLine('{Game 20 (GuestHYBS vs. GuestMMLX) Game aborted on move 1} *');
  assert.equal(end2?.aborted, true);
  assert.equal(end2?.winner, 'draw');
});

test('enqueuePremoveMove & projectBoardForPremove support chained premoves, captures, promotions, and castling', () => {
  let queue = enqueuePremoveMove([], { from: 'g1', to: 'f3' }, 5);
  queue = enqueuePremoveMove(queue, { from: 'f3', to: 'f3' }, 5); // ignored same-square
  queue = enqueuePremoveMove(queue, { from: 'f3', to: 'e5' }, 5);
  queue = enqueuePremoveMove(queue, { from: 'e1', to: 'g1' }, 5);
  assert.equal(queue.length, 3);

  // Enforce maxLength cap
  let capped = queue;
  capped = enqueuePremoveMove(capped, { from: 'd2', to: 'd4' }, 3);
  assert.equal(capped.length, 3);

  const startFen = 'rnbqk2r/pppp1ppp/5n2/4p3/4P3/5N2/PPPPBPPP/RNBQK2R w KQkq - 4 4';
  const proj = projectBoardForPremove(startFen, [
    { from: 'e1', to: 'g1' },
    { from: 'f3', to: 'e5' },
  ]);
  assert.equal(proj.pieces.get('g1')?.type, 'k');
  assert.equal(proj.pieces.get('f1')?.type, 'r');
  assert.equal(proj.vacatedOrigins.has('e1'), true);
  assert.equal(proj.vacatedOrigins.has('h1'), true);
  assert.equal(proj.pieces.get('e5')?.type, 'n');
  assert.equal(proj.pieces.get('e5')?.color, 'w');
  assert.equal(proj.ghostDestinations.get('g1')?.order, 1);
  assert.equal(proj.ghostDestinations.get('e5')?.order, 2);

  // Pawn promotion premove
  const promoFen = '8/P7/8/8/8/8/8/4K2k w - - 0 1';
  const promoProj = projectBoardForPremove(promoFen, [{ from: 'a7', to: 'a8', promotion: 'n' }]);
  assert.equal(promoProj.pieces.get('a8')?.type, 'n');
  assert.equal(promoProj.ghostDestinations.get('a8')?.type, 'n');
});

test('formatOnlineTimeControl formats standard and custom time controls into Bullet, Blitz, Rapid', () => {
  assert.deepEqual(formatOnlineTimeControl(60, 0), { id: '1+0', label: '1 min', category: 'Bullet' });
  assert.deepEqual(formatOnlineTimeControl(120, 12), { id: '2+12', label: '2 | 12', category: 'Rapid' });
  assert.deepEqual(formatOnlineTimeControl(180, 2), { id: '3+2', label: '3 | 2', category: 'Blitz' });
  assert.deepEqual(formatOnlineTimeControl(600, 0), { id: '10+0', label: '10 min', category: 'Rapid' });
});

test('normalizeThemePrefs accepts valid board/piece/premove preferences and falls back on invalid data', () => {
  const valid = normalizeThemePrefs({
    boardTheme: 'brown',
    pieceTheme: 'wood',
    premoveColor: 'violet',
    coordinateStyle: 'outside',
    animationSpeed: 'fast',
    highlightMoves: false,
  });
  assert.equal(valid.boardTheme, 'brown');
  assert.equal(valid.pieceTheme, 'wood');
  assert.equal(valid.premoveColor, 'violet');
  assert.equal(valid.coordinateStyle, 'outside');
  assert.equal(valid.animationSpeed, 'fast');
  assert.equal(valid.highlightMoves, false);

  const fallback = normalizeThemePrefs({
    boardTheme: 'invalid-board',
    pieceTheme: 123,
    premoveColor: 'neon-pink',
    coordinateStyle: 'diagonal',
    animationSpeed: 'instant',
  });
  assert.deepEqual(fallback, DEFAULT_THEME_PREFS);
});



