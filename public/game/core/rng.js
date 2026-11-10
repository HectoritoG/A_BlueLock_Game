(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLRng = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Deterministic PRNG for gameplay. The server can seed this per match.
  function createRng(seed) {
    let state = (Number(seed) || 0) >>> 0;
    return function rng() {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomRange(rng, min, max) {
    return min + (max - min) * rng();
  }

  function randomInt(rng, min, max) {
    return Math.floor(randomRange(rng, min, max + 1));
  }

  function pick(rng, items) {
    return items[Math.floor(rng() * items.length)];
  }

  function chance(rng, probability) {
    return rng() < probability;
  }

  // Visual-only randomness. Gameplay code should use createRng(seed).
  const visualRng = createRng((Date.now() ^ 0x9E3779B9) >>> 0);

  return {
    createRng,
    randomRange,
    randomInt,
    pick,
    chance,
    visualRng
  };
});
