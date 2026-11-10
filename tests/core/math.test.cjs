const test = require('node:test');
const assert = require('node:assert/strict');

const {
  dist,
  pointToSegmentDistance,
  lerp,
  clamp,
  angleTo,
  normalize
} = require('../../public/game/core/math.js');

test('clamp keeps values inside the requested range', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-2, 0, 10), 0);
  assert.equal(clamp(12, 0, 10), 10);
});

test('lerp interpolates between two values', () => {
  assert.equal(lerp(10, 20, 0), 10);
  assert.equal(lerp(10, 20, 0.5), 15);
  assert.equal(lerp(10, 20, 1), 20);
});

test('dist measures the distance between two points', () => {
  assert.equal(dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('normalize returns a unit vector and handles zero length', () => {
  assert.deepEqual(normalize({ x: 0, y: 0 }), { x: 0, y: 0 });

  const normalized = normalize({ x: 3, y: 4 });
  assert.ok(Math.abs(normalized.x - 0.6) < 1e-12);
  assert.ok(Math.abs(normalized.y - 0.8) < 1e-12);
});

test('angleTo points from one position to another', () => {
  assert.equal(angleTo({ x: 0, y: 0 }, { x: 1, y: 0 }), 0);
  assert.ok(Math.abs(angleTo({ x: 0, y: 0 }, { x: 0, y: 1 }) - Math.PI / 2) < 1e-12);
});

test('pointToSegmentDistance handles segments and degenerate segments', () => {
  assert.equal(pointToSegmentDistance(5, 3, 0, 0, 10, 0), 3);
  assert.equal(pointToSegmentDistance(-3, 4, 0, 0, 0, 0), 5);
  assert.equal(pointToSegmentDistance(2, 2, 0, 0, 10, 10), 0);
});
