const test = require('node:test');
const assert = require('node:assert/strict');
const interpolation = require('../public/game/net/interpolation.js');

function closeTo(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} is not close to ${expected}`);
}

function snapshot(hostTime, seq, playerX, ballX, extra) {
  return Object.assign({
    hostTime,
    seq,
    timeLeft: 180 - hostTime / 1000,
    players: [
      { id: 'p1', x: playerX, y: 10, vx: 20, vy: 0, facingAngle: 0, hasBall: false },
      { id: 'p2', x: playerX + 5, y: 20, vx: 0, vy: 0, facingAngle: 1, hasBall: true }
    ],
    ball: { x: ballX, y: 30, z: 0, vx: 100, vy: 0, vz: 0, rotation: 0, dribbleOffset: { x: 0, y: 0 } }
  }, extra || {});
}

test('blendSnapshots interpolates players, ball and time', () => {
  const older = snapshot(0, 1, 0, 0);
  const newer = snapshot(100, 2, 100, 200);
  const blended = interpolation.blendSnapshots(older, newer, 0.25);

  closeTo(blended.players[0].x, 25);
  closeTo(blended.players[1].x, 30);
  closeTo(blended.ball.x, 50);
  closeTo(blended.timeLeft, 179.975);
  assert.equal(blended.players[0].hasBall, false);
  assert.equal(blended.players[1].hasBall, true);
});

test('blendSnapshots snaps across a large teleport instead of sliding', () => {
  const older = snapshot(0, 1, 0, 0);
  const newer = snapshot(100, 2, 2000, 3000);
  const blended = interpolation.blendSnapshots(older, newer, 0.5);

  assert.equal(blended.players[0].x, 2000);
  assert.equal(blended.ball.x, 3000);
});

test('blendSnapshots uses the shortest path for facing angles', () => {
  const older = snapshot(0, 1, 0, 0);
  const newer = snapshot(100, 2, 0, 0);
  older.players[0].facingAngle = Math.PI - 0.1;
  newer.players[0].facingAngle = -Math.PI + 0.1;

  const blended = interpolation.blendSnapshots(older, newer, 0.5);
  const normalized = Math.atan2(Math.sin(blended.players[0].facingAngle), Math.cos(blended.players[0].facingAngle));
  closeTo(Math.abs(normalized), Math.PI, 1e-6);
});

test('interpolator renders between the two newest snapshots with a small delay', () => {
  const interpolator = interpolation.createSnapshotInterpolator({ delayMs: 50 });
  interpolator.push(snapshot(0, 1, 0, 0), 1000);
  interpolator.push(snapshot(100, 2, 100, 200), 1100);
  interpolator.push(snapshot(200, 3, 200, 400), 1200);

  const atFifty = interpolator.sample(1100);
  closeTo(atFifty.players[0].x, 50);
  closeTo(atFifty.ball.x, 100);

  const atOneFifty = interpolator.sample(1200);
  closeTo(atOneFifty.players[0].x, 150);
  closeTo(atOneFifty.ball.x, 300);
});

test('interpolator ignores a slow first packet when estimating the clock offset', () => {
  const interpolator = interpolation.createSnapshotInterpolator({ delayMs: 50 });
  // The first packet took ~1s to arrive; later packets are much faster. The
  // render clock must use the fastest observed offset, not the first one.
  interpolator.push(snapshot(0, 1, 0, 0), 1000);
  interpolator.push(snapshot(100, 2, 100, 200), 1010);
  interpolator.push(snapshot(200, 3, 200, 400), 1020);

  const sampled = interpolator.sample(1020);
  closeTo(sampled.players[0].x, 150);
  closeTo(sampled.ball.x, 300);
});

test('interpolator extrapolates briefly when the next snapshot is late', () => {
  const interpolator = interpolation.createSnapshotInterpolator({ delayMs: 0, maxExtrapolationMs: 50 });
  interpolator.push(snapshot(0, 1, 0, 0), 1000);
  interpolator.push(snapshot(100, 2, 100, 200), 1100);

  const ahead = interpolator.sample(1150);
  closeTo(ahead.players[0].x, 150);
  closeTo(ahead.ball.x, 300);
});

test('interpolator resets and falls back to local timing for unstamped snapshots', () => {
  const interpolator = interpolation.createSnapshotInterpolator({ delayMs: 0 });
  const first = snapshot(0, 1, 0, 0);
  const second = snapshot(0, 2, 100, 200);
  delete first.hostTime;
  delete second.hostTime;
  delete first.seq;
  delete second.seq;

  interpolator.push(first, 1000);
  interpolator.push(second, 1100);
  const sampled = interpolator.sample(1150);
  closeTo(sampled.players[0].x, 150);
  closeTo(sampled.ball.x, 300);

  interpolator.reset();
  assert.equal(interpolator.size(), 0);
  assert.equal(interpolator.sample(1200), null);
});
