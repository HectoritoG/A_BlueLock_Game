const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createRng,
  randomRange,
  randomInt,
  pick,
  chance
} = require('../../public/game/core/rng.js');

test('createRng is deterministic for the same seed', () => {
  const first = createRng(12345);
  const second = createRng(12345);

  for (let i = 0; i < 20; i++) {
    assert.equal(first(), second());
  }
});

test('createRng produces values in the [0, 1) range', () => {
  const rng = createRng(99);

  for (let i = 0; i < 1000; i++) {
    const value = rng();
    assert.ok(value >= 0 && value < 1);
  }
});

test('randomRange and randomInt respect their bounds', () => {
  const rng = createRng(7);

  for (let i = 0; i < 100; i++) {
    const value = randomRange(rng, -5, 5);
    assert.ok(value >= -5 && value <= 5);

    const integer = randomInt(rng, 1, 3);
    assert.ok(integer >= 1 && integer <= 3);
    assert.equal(Number.isInteger(integer), true);
  }
});

test('pick returns an item from the list', () => {
  const rng = createRng(42);
  const items = ['a', 'b', 'c'];

  for (let i = 0; i < 20; i++) {
    assert.ok(items.includes(pick(rng, items)));
  }
});

test('chance handles guaranteed and impossible probabilities', () => {
  const rng = createRng(1);

  assert.equal(chance(rng, 0), false);
  assert.equal(chance(rng, 1), true);
});
