const test = require('node:test');
const assert = require('node:assert/strict');

const { createMatchState } = require('../public/game/core/match-state.js');
const { createLocalSession } = require('../public/game/session/local-session.js');

function createSession(options) {
  return createLocalSession({ createMatchState, options });
}

test('createLocalSession owns one match state', () => {
  const session = createSession({ selectedHero: 'nagi', matchDuration: 120 });

  assert.equal(session.state.selectedHero, 'nagi');
  assert.equal(session.state.matchDuration, 120);
  assert.equal(session.isActive(), false);
  assert.equal(session.getState(), session.state);
});

test('start resets match data and applies the selected hero', () => {
  const session = createSession({ selectedHero: 'isagi', matchDuration: 180 });
  const state = session.state;

  state.scoreBlue = 4;
  state.scoreRed = 2;
  state.timeLeft = 12;
  state.gameRunning = false;
  state.paused = true;
  state.stats.shotsBlue = 9;
  state.particles.push({ x: 1, y: 2 });
  state.powerups.push({ type: 'speed' });
  state.selectedMatch = 'japan';
  if (state.tactics) {
    state.tactics.path = { points: [{ x: 1, y: 2 }] };
    state.tactics.blue.possessionTeam = 'red';
    state.tactics.blue.transitionTimer = 1;
    state.tactics.blue.teammates.push({ team: 'blue' });
  }

  session.start({ selectedHero: 'rin', matchDuration: 90 });

  assert.equal(state.selectedHero, 'rin');
  assert.equal(state.selectedMatch, 'japan');
  assert.equal(state.matchDuration, 90);
  assert.equal(state.timeLeft, 90);
  assert.equal(state.scoreBlue, 0);
  assert.equal(state.scoreRed, 0);
  assert.equal(state.stats.shotsBlue, 0);
  assert.deepEqual(state.particles, []);
  assert.deepEqual(state.powerups, []);
  assert.equal(state.gameRunning, true);
  assert.equal(state.paused, false);
  assert.equal(session.isActive(), true);
  if (state.tactics) {
    assert.equal(state.tactics.path, null);
    assert.equal(state.tactics.blue.possessionTeam, null);
    assert.equal(state.tactics.blue.transitionTimer, 0);
    assert.deepEqual(state.tactics.blue.teammates, []);
  }
});

test('end and pause methods update the session lifecycle', () => {
  const session = createSession();

  session.start();
  assert.equal(session.setPaused(true), true);
  assert.equal(session.state.paused, true);
  assert.equal(session.togglePause(), false);
  assert.equal(session.state.paused, false);

  session.end();
  assert.equal(session.state.gameRunning, false);
  assert.equal(session.state.paused, false);
  assert.equal(session.isActive(), false);
});
