import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { computeBoardTransitions } from './boardMotion';

test('computeBoardTransitions detects standard pawn and knight moves', () => {
  const c = new Chess();
  const f0 = c.fen();
  c.move('e4');
  const f1 = c.fen();
  const r1 = computeBoardTransitions(f0, f1, { from: 'e2', to: 'e4' });
  assert.equal(r1.slides.length, 1);
  assert.equal(r1.slides[0].from, 'e2');
  assert.equal(r1.slides[0].to, 'e4');
  assert.equal(r1.slides[0].isKnight, false);
  assert.equal(r1.captured, null);

  c.move('Nf6');
  const f2 = c.fen();
  const r2 = computeBoardTransitions(f1, f2, null);
  assert.equal(r2.slides.length, 1);
  assert.equal(r2.slides[0].from, 'g8');
  assert.equal(r2.slides[0].to, 'f6');
  assert.equal(r2.slides[0].isKnight, true);
});

test('computeBoardTransitions animates both king and rook during castling', () => {
  const c = new Chess('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
  const f0 = c.fen();
  c.move('O-O');
  const f1 = c.fen();
  const res = computeBoardTransitions(f0, f1, { from: 'e1', to: 'g1' });
  assert.equal(res.slides.length, 2);
  const king = res.slides.find((s) => s.type === 'k');
  const rook = res.slides.find((s) => s.type === 'r');
  assert.deepEqual({ from: king?.from, to: king?.to }, { from: 'e1', to: 'g1' });
  assert.deepEqual(
    { from: rook?.from, to: rook?.to, isCastlingRook: rook?.isCastlingRook },
    { from: 'h1', to: 'f1', isCastlingRook: true },
  );
});

test('computeBoardTransitions tracks captures, en passant, promotions, and reverse stepping', () => {
  // Capture + reverse step
  const c1 = new Chess('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  const beforeCap = c1.fen();
  c1.move('exd5');
  const afterCap = c1.fen();

  const forward = computeBoardTransitions(beforeCap, afterCap, { from: 'e4', to: 'd5' });
  assert.equal(forward.slides.length, 1);
  assert.equal(forward.slides[0].from, 'e4');
  assert.equal(forward.slides[0].to, 'd5');
  assert.deepEqual(forward.captured, { square: 'd5', type: 'p', color: 'b' });

  // Stepping backward in Game Review (lastMove is stale or null)
  const backward = computeBoardTransitions(afterCap, beforeCap, null);
  assert.equal(backward.slides.length, 1);
  assert.equal(backward.slides[0].from, 'd5');
  assert.equal(backward.slides[0].to, 'e4');

  // En passant capture
  const ep = new Chess('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
  const beforeEp = ep.fen();
  ep.move('exf6');
  const afterEp = ep.fen();
  const epRes = computeBoardTransitions(beforeEp, afterEp, { from: 'e5', to: 'f6' });
  assert.equal(epRes.slides.length, 1);
  assert.equal(epRes.slides[0].from, 'e5');
  assert.equal(epRes.slides[0].to, 'f6');
  assert.deepEqual(epRes.captured, { square: 'f5', type: 'p', color: 'b' });

  // Promotion without explicit lastMove
  const pr = new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
  const beforePr = pr.fen();
  pr.move('a8=Q+');
  const afterPr = pr.fen();
  const prRes = computeBoardTransitions(beforePr, afterPr, null);
  assert.equal(prRes.slides.length, 1);
  assert.equal(prRes.slides[0].from, 'a7');
  assert.equal(prRes.slides[0].to, 'a8');
  assert.equal(prRes.slides[0].type, 'q');
});

test('computeBoardTransitions skips animation when loading an unrelated position', () => {
  const start = new Chess().fen();
  const puzzle = '6rk/3n1p1p/rq2pPpQ/2p1P3/p4R2/P1p5/1PP3PP/R5K1 w - - 0 1';
  const res = computeBoardTransitions(start, puzzle, null);
  assert.equal(res.slides.length, 0);
  assert.equal(res.captured, null);
});
