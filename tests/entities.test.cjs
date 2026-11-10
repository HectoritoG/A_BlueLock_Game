const test = require('node:test');
const assert = require('node:assert/strict');

const { createEntityClasses } = require('../public/game/entities.js');
const constants = require('../public/game/core/constants.js');
const math = require('../public/game/core/math.js');

function createRuntime() {
  return {
    constants,
    math,
    G: { players: [], ball: null },
    SFX: {
      kick() {},
      shoot() {},
      possession() {},
      intercept() {},
      cheer() {}
    },
    ctx: {},
    charImages: {},
    camera: { x: 0, y: 0 },
    viewport: { w: 800, h: 600, scale: 1 },
    helpers: {
      trackShot() {},
      trackPass() {},
      trackTackle() {},
      trackGoal() {},
      addCombo() {},
      suppressControlEffects() {},
      moveToward() {},
      switchToHumanPlayer() {},
      spawnParticles() {},
      triggerGoal() {},
      grantAwakening() {},
      updateShotChargeUI() {},
      showAbilityNotif() {}
    }
  };
}

test('createEntityClasses returns Ball and Player constructors', () => {
  const { Ball, Player } = createEntityClasses(createRuntime());

  assert.equal(typeof Ball, 'function');
  assert.equal(typeof Player, 'function');
  assert.equal(typeof Ball.prototype.update, 'function');
  assert.equal(typeof Ball.prototype.draw, 'function');
  assert.equal(typeof Player.prototype.update, 'function');
  assert.equal(typeof Player.prototype.draw, 'function');
});

test('Ball starts in the middle of the field', () => {
  const { Ball } = createEntityClasses(createRuntime());
  const ball = new Ball();

  assert.equal(ball.state, 'free');
  assert.equal(ball.owner, null);
  assert.equal(ball.x, constants.FIELD.x + constants.FIELD.w / 2);
  assert.equal(ball.y, constants.FIELD.y + constants.FIELD.h / 2);
  assert.equal(ball.z, 0);
});

test('Player loads hero configuration', () => {
  const { Player } = createEntityClasses(createRuntime());
  const player = new Player(100, 200, 'blue', 'hero', 'isagi', 'FWD');

  assert.equal(player.heroKey, 'isagi');
  assert.equal(player.rivalKey, null);
  assert.equal(player.team, 'blue');
  assert.equal(player.role, 'FWD');
  assert.equal(player.speed, constants.HEROES.isagi.speed);
  assert.equal(player.getName(), 'ISAGI');
  assert.equal(player.getNum(), '11');
});
