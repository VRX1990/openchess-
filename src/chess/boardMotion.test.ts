import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  computeBoardTransitions,
  computeDragTiltDeg,
  computeMotionTrailPolygon,
  computeOverlaySlideGeometry,
  getDragActivationThreshold,
  getPieceAnimationTiming,
  getStepNavigationSound,
} from './boardMotion';

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
  const c1 = new Chess('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  const beforeCap = c1.fen();
  c1.move('exd5');
  const afterCap = c1.fen();

  const forward = computeBoardTransitions(beforeCap, afterCap, { from: 'e4', to: 'd5' });
  assert.equal(forward.slides.length, 1);
  assert.equal(forward.slides[0].from, 'e4');
  assert.equal(forward.slides[0].to, 'd5');
  assert.deepEqual(forward.captured, { square: 'd5', type: 'p', color: 'b' });

  const backward = computeBoardTransitions(afterCap, beforeCap, null);
  assert.equal(backward.slides.length, 1);
  assert.equal(backward.slides[0].from, 'd5');
  assert.equal(backward.slides[0].to, 'e4');

  const ep = new Chess('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
  const beforeEp = ep.fen();
  ep.move('exf6');
  const afterEp = ep.fen();
  const epRes = computeBoardTransitions(beforeEp, afterEp, { from: 'e5', to: 'f6' });
  assert.equal(epRes.slides.length, 1);
  assert.equal(epRes.slides[0].from, 'e5');
  assert.equal(epRes.slides[0].to, 'f6');
  assert.deepEqual(epRes.captured, { square: 'f5', type: 'p', color: 'b' });

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

test('getPieceAnimationTiming returns Arcade Smooth, Fast, and None timings', () => {
  const smooth = getPieceAnimationTiming('smooth');
  assert.equal(smooth.durationMs, 185);
  assert.ok(smooth.trailDurationMs > smooth.durationMs);
  assert.ok(smooth.easing.includes('cubic-bezier'));
  assert.ok(smooth.captureDelayMs > 0 && smooth.captureDelayMs < smooth.durationMs);

  const fast = getPieceAnimationTiming('fast');
  assert.equal(fast.durationMs, 115);
  assert.ok(fast.durationMs < smooth.durationMs);
  assert.ok(fast.trailDurationMs > fast.durationMs);

  const none = getPieceAnimationTiming('none');
  assert.equal(none.durationMs, 0);
  assert.equal(none.captureFadeMs, 0);
  assert.equal(none.trailDurationMs, 0);
});

test('computeMotionTrailPolygon produces tapered SVG quad geometry', () => {
  assert.equal(computeMotionTrailPolygon(4, 6, 4, 6), null);

  const vertical = computeMotionTrailPolygon(4, 6, 4, 4);
  assert.ok(vertical);
  assert.equal(vertical.x1, 450);
  assert.equal(vertical.y1, 650);
  assert.equal(vertical.x2, 450);
  assert.equal(vertical.y2, 450);
  assert.equal(vertical.length, 200);
  assert.equal(vertical.points.split(' ').length, 4);

  const diagonal = computeMotionTrailPolygon(3, 7, 7, 3);
  assert.ok(diagonal);
  assert.ok(diagonal.length > 560 && diagonal.length < 570);
});

test('computeDragTiltDeg clamps horizontal tilt and decays smoothly to zero', () => {
  const rightTilt = computeDragTiltDeg(40, 0);
  assert.ok(rightTilt > 0 && rightTilt <= 10);

  const leftTilt = computeDragTiltDeg(-50, 0);
  assert.ok(leftTilt < 0 && leftTilt >= -10);

  // Decay when stationary
  let tilt = 8;
  for (let i = 0; i < 20; i++) {
    tilt = computeDragTiltDeg(0, tilt);
  }
  assert.equal(tilt, 0);
});

test('getStepNavigationSound resolves forward and backward piece sounds accurately', () => {
  const moves = [
    { san: 'e4', from: 'e2', to: 'e4', flags: 'b' },
    { san: 'd5', from: 'd7', to: 'd5', flags: 'b' },
    { san: 'exd5', from: 'e4', to: 'd5', captured: 'p', flags: 'c' },
    { san: 'Qxd5+', from: 'd8', to: 'd5', captured: 'p', flags: 'c' },
    { san: 'O-O', from: 'e1', to: 'g1', flags: 'k' },
  ];

  // No-op returns null
  assert.equal(getStepNavigationSound(moves, 3, 3), null);

  // Forward onto capture + check
  const capCheck = getStepNavigationSound(moves, 3, 4);
  assert.deepEqual(capCheck, {
    capture: true,
    check: true,
    castle: false,
    promotion: false,
    toSquare: 'd5',
    direction: 'forward',
  });

  // Forward onto castling
  const castle = getStepNavigationSound(moves, 4, 5);
  assert.equal(castle?.castle, true);
  assert.equal(castle?.direction, 'forward');

  // Step backward ALWAYS emits a crisp move sound (including stepping to ply 0)
  const stepBack = getStepNavigationSound(moves, 4, 3);
  assert.deepEqual(stepBack, {
    capture: false,
    check: false,
    castle: false,
    promotion: false,
    toSquare: 'd8',
    direction: 'backward',
  });

  const backToStart = getStepNavigationSound(moves, 1, 0);
  assert.deepEqual(backToStart, {
    capture: false,
    check: false,
    castle: false,
    promotion: false,
    toSquare: 'e2',
    direction: 'backward',
  });
});

test('computeOverlaySlideGeometry maps board squares to clip-free overlay coordinates', () => {
  assert.equal(computeOverlaySlideGeometry(4, 6, 4, 6), null);

  // e2 (col 4, row 6) -> e4 (col 4, row 4)
  const e2e4 = computeOverlaySlideGeometry(4, 6, 4, 4);
  assert.deepEqual(e2e4, {
    leftPct: 50,
    topPct: 50,
    fromXPercent: 0,
    fromYPercent: 200,
    midXPercent: 0,
    midYPercent: 92,
  });

  // g1 (col 6, row 7) -> f3 (col 5, row 5)
  const g1f3 = computeOverlaySlideGeometry(6, 7, 5, 5);
  assert.deepEqual(g1f3, {
    leftPct: 62.5,
    topPct: 62.5,
    fromXPercent: 100,
    fromYPercent: 200,
    midXPercent: 46,
    midYPercent: 92,
  });
});

test('getDragActivationThreshold uses wider threshold for touch taps than mouse', () => {
  assert.equal(getDragActivationThreshold('touch'), 8);
  assert.equal(getDragActivationThreshold('mouse'), 5);
  assert.equal(getDragActivationThreshold('pen'), 5);
  assert.equal(getDragActivationThreshold(undefined), 5);
});
