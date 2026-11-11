const test = require('node:test');
const assert = require('node:assert/strict');

const { createEntityRenderer } = require('../public/game/render/entities.js');
const { createEntityClasses } = require('../public/game/entities.js');
const constants = require('../public/game/core/constants.js');
const math = require('../public/game/core/math.js');

function createMockContext() {
  const calls = [];
  const target = {};

  return new Proxy(target, {
    get(object, property) {
      if (property === '__calls') return calls;
      if (property === 'canvas') return { width: 800, height: 600 };
      if (property === 'measureText') return () => ({ width: 10 });
      if (!(property in object)) {
        object[property] = (...args) => {
          calls.push([property, ...args]);
        };
      }
      return object[property];
    },
    set(object, property, value) {
      object[property] = value;
      return true;
    }
  });
}

function createRuntime(ctx) {
  return {
    constants,
    math,
    G: { nagiSkull: null },
    ctx,
    charImages: {},
    camera: { x: 0, y: 0 },
    viewport: { w: 800, h: 600, scale: 1 },
    audio: {
      kick() {},
      shoot() {},
      possession() {},
      intercept() {},
      cheer() {},
      tackle() {},
      hit() {},
      ability() {},
      awaken() {}
    },
    rng: () => 0.5,
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

test('createEntityRenderer returns canvas draw functions', () => {
  const renderer = createEntityRenderer(createRuntime(createMockContext()));

  assert.equal(typeof renderer.drawBall, 'function');
  assert.equal(typeof renderer.drawPlayer, 'function');
});

test('drawBall and drawPlayer render without a real canvas', () => {
  const ctx = createMockContext();
  const runtime = createRuntime(ctx);
  const renderer = createEntityRenderer(runtime);
  const { Ball, Player } = createEntityClasses(runtime);

  const ball = new Ball();
  const player = new Player(100, 200, 'blue', 'hero', 'isagi', 'FWD');

  assert.doesNotThrow(() => renderer.drawBall(ball));
  assert.doesNotThrow(() => renderer.drawPlayer(player));
  assert.ok(ctx.__calls.some(([name]) => name === 'arc'));
  assert.ok(ctx.__calls.some(([name]) => name === 'fillText'));
});
