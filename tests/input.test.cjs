const test = require('node:test');
const assert = require('node:assert/strict');

const { createInput } = require('../public/game/input/input.js');

function createPlayer(overrides) {
  return Object.assign({
    hasBall: false,
    nagiCharge: 0,
    kiyoraSpinTimer: 0,
    awakening: 0,
    isAwakened: false,
    shotCharging: false,
    cancelled: 0,
    passed: 0,
    started: 0,
    released: 0,
    used: 0,
    tackled: 0,
    cancelShotCharge() { this.cancelled++; },
    findBestPassTarget() { return null; },
    doPass() { this.passed++; },
    startShotCharge() { this.started++; this.shotCharging = true; },
    releaseShotCharge() { this.released++; this.shotCharging = false; },
    useAbility() { this.used++; },
    tackle() { this.tackled++; }
  }, overrides || {});
}

function createHarness(player, overrides) {
  const G = Object.assign({
    gameRunning: true,
    paused: false,
    players: []
  }, (overrides && overrides.G) || {});
  const keys = {};
  const remoteCalls = [];
  const actions = Object.assign({
    pauseCalls: 0,
    switchCalls: 0,
    awakenCalls: 0,
    togglePause() { this.pauseCalls++; },
    switchHero() { this.switchCalls++; },
    grantAwakening() { this.awakenCalls++; },
    remote(action) { remoteCalls.push(action); }
  }, (overrides && overrides.actions) || {});
  const input = createInput({
    G,
    keys,
    isMobile: false,
    getActivePlayer: () => player,
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    HEROES: {},
    RIVALS: {},
    actions,
    isRemote: overrides && overrides.isRemote,
    window: overrides && overrides.window,
    document: null
  });
  return { G, keys, actions, remoteCalls, input };
}

test('Escape toggles pause', () => {
  const { actions, input } = createHarness(createPlayer());

  input.handleKeyDown({ code: 'Escape', preventDefault() {} });
  assert.equal(actions.pauseCalls, 1);
});

test('ability, tackle and shot charge keys reach the active player', () => {
  const player = createPlayer({ hasBall: true });
  const { input, keys } = createHarness(player);

  input.handleKeyDown({ code: 'KeyE', preventDefault() {} });
  assert.equal(player.used, 1);

  input.handleKeyDown({ code: 'ShiftLeft', preventDefault() {} });
  assert.equal(player.started, 1);

  input.handleKeyUp({ code: 'ShiftLeft' });
  assert.equal(player.released, 1);

  input.handleKeyDown({ code: 'KeyF', preventDefault() {} });
  assert.equal(player.tackled, 0);

  player.hasBall = false;
  input.handleKeyDown({ code: 'KeyF', preventDefault() {} });
  assert.equal(player.tackled, 1);
  assert.equal(keys.KeyF, true);
});

test('pass and awakening actions use the injected callbacks', () => {
  const target = createPlayer();
  const player = createPlayer({
    hasBall: true,
    awakening: 100,
    findBestPassTarget() { return target; },
    doPass(passedTarget) { this.passed++; this.passedTarget = passedTarget; }
  });
  const { input, actions } = createHarness(player);

  input.handleKeyDown({ code: 'Space', preventDefault() {} });
  assert.equal(player.passed, 1);
  assert.equal(player.passedTarget, target);

  input.handleKeyDown({ code: 'KeyR', preventDefault() {} });
  assert.equal(actions.awakenCalls, 1);
});

test('remote mode forwards actions without mutating the guest player', () => {
  const player = createPlayer({ hasBall: true, awakening: 100 });
  const { input, actions, remoteCalls, G } = createHarness(player, { isRemote: true });

  input.handleKeyDown({ code: 'KeyE', preventDefault() {} });
  input.handleKeyDown({ code: 'Space', preventDefault() {} });
  input.handleKeyDown({ code: 'ShiftLeft', preventDefault() {} });
  input.handleKeyUp({ code: 'ShiftLeft' });
  input.handleKeyDown({ code: 'KeyF', preventDefault() {} });
  input.handleKeyDown({ code: 'KeyR', preventDefault() {} });
  input.handleKeyDown({ code: 'KeyQ', preventDefault() {} });
  input.handleKeyDown({ code: 'Escape', preventDefault() {} });

  assert.deepEqual(remoteCalls, [
    'ability', 'pass', 'shootStart', 'shootRelease', 'tackle', 'awaken', 'switch', 'pause'
  ]);
  assert.equal(player.used, 0);
  assert.equal(player.passed, 0);
  assert.equal(player.started, 0);
  assert.equal(player.released, 0);
  assert.equal(player.tackled, 0);
  assert.equal(player.cancelled, 0);
  assert.equal(actions.pauseCalls, 0);
  assert.equal(actions.switchCalls, 0);
  assert.equal(actions.awakenCalls, 0);

  G.paused = true;
  input.handleKeyUp({ code: 'ShiftLeft' });
  assert.equal(remoteCalls[remoteCalls.length - 1], 'shootCancel');
});

test('setup registers keyboard listeners and cleanup removes them', () => {
  const listeners = {};
  const win = {
    addEventListener(type, handler) {
      (listeners[type] = listeners[type] || []).push(handler);
    },
    removeEventListener(type, handler) {
      listeners[type] = (listeners[type] || []).filter(item => item !== handler);
    }
  };
  const { input } = createHarness(createPlayer(), { window: win });

  const cleanup = input.setup();
  assert.equal(listeners.keydown.length, 1);
  assert.equal(listeners.keyup.length, 1);

  cleanup();
  assert.equal(listeners.keydown.length, 0);
  assert.equal(listeners.keyup.length, 0);
});
