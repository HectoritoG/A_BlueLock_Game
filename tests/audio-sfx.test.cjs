const test = require('node:test');
const assert = require('node:assert/strict');

const { createSfx } = require('../public/game/audio/sfx.js');

test('createSfx returns the expected sound interface', () => {
  const sfx = createSfx();

  for (const method of ['init', 'resume', 'kick', 'shoot', 'goal', 'whistle', 'ability', 'tackle', 'awaken', 'save', 'intercept', 'hit', 'ui', 'possession', 'startCrowd', 'cheer', 'setVolume']) {
    assert.equal(typeof sfx[method], 'function');
  }
});

test('sound methods are safe without an AudioContext', () => {
  const sfx = createSfx();

  assert.doesNotThrow(() => {
    sfx.init();
    sfx.resume();
    sfx.kick();
    sfx.shoot();
    sfx.goal();
    sfx.whistle(true);
    sfx.ability();
    sfx.tackle();
    sfx.awaken();
    sfx.save();
    sfx.intercept();
    sfx.hit();
    sfx.ui();
    sfx.possession();
    sfx.startCrowd();
    sfx.cheer(0.3);
    sfx.setVolume(0.5);
  });
  assert.equal(sfx.enabled, false);
});
