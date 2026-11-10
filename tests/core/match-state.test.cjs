const test = require('node:test');
const assert = require('node:assert/strict');

const { createMatchState } = require('../../public/game/core/match-state.js');

test('createMatchState returns the default match state', () => {
  const state = createMatchState();

  assert.equal(state.selectedHero, 'isagi');
  assert.equal(state.selectedMatch, 'japan');
  assert.equal(state.difficulty, 'normal');
  assert.equal(state.isMobile, false);
  assert.equal(state.matchDuration, 180);
  assert.equal(state.timeLeft, 180);
  assert.equal(state.gameRunning, false);
  assert.equal(state.paused, false);
  assert.deepEqual(state.players, []);
  assert.equal(state.ball, null);
  assert.deepEqual(state.stats.playerStats, {});
  assert.deepEqual(state.combo.blue, { count: 0, timer: 0 });
  assert.deepEqual(state.combo.red, { count: 0, timer: 0 });
});

test('createMatchState applies match options', () => {
  const state = createMatchState({
    selectedHero: 'rin',
    selectedMatch: 'pxg',
    difficulty: 'legend',
    isMobile: true,
    matchDuration: 300,
    timeLeft: 120
  });

  assert.equal(state.selectedHero, 'rin');
  assert.equal(state.selectedMatch, 'pxg');
  assert.equal(state.difficulty, 'legend');
  assert.equal(state.isMobile, true);
  assert.equal(state.matchDuration, 300);
  assert.equal(state.timeLeft, 120);
});

test('each match state owns independent arrays and nested objects', () => {
  const first = createMatchState();
  const second = createMatchState();

  first.players.push({ name: 'isagi' });
  first.particles.push({ x: 1, y: 2 });
  first.stats.shotsBlue = 3;
  first.stats.playerStats.isagi = { goals: 1 };
  first.combo.blue.count = 2;
  first.recentSave.team = 'blue';
  first.powerups.push({ type: 'speed' });

  assert.deepEqual(second.players, []);
  assert.deepEqual(second.particles, []);
  assert.equal(second.stats.shotsBlue, 0);
  assert.deepEqual(second.stats.playerStats, {});
  assert.equal(second.combo.blue.count, 0);
  assert.equal(second.recentSave.team, null);
  assert.deepEqual(second.powerups, []);
});
