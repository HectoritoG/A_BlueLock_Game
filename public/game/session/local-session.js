(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLSession = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Owns one local match. The state object is reused in place so the entity
  // classes can keep a stable reference while a future networked session can
  // create a separate LocalSession per room.
  function createLocalSession(runtime) {
    const opts = runtime || {};
    const createMatchState = opts.createMatchState;
    if (typeof createMatchState !== 'function') {
      throw new Error('createLocalSession requires createMatchState');
    }

    const state = createMatchState(opts.options || {});
    let active = false;

    function resetTactics(matchState) {
      if (!matchState.tactics) return;
      matchState.tactics.path = null;
      for (const team of ['blue', 'red']) {
        const ctx = matchState.tactics[team];
        if (!ctx) continue;
        ctx.possessionTeam = null;
        ctx.phase = 'loose';
        ctx.looseTimer = 0;
        ctx.transitionTimer = 0;
        ctx.carrier = null;
        ctx.lastTouchTeam = null;
        ctx.human = null;
        ctx.humanIsCarrier = false;
        ctx.pressureOnHuman = false;
        ctx.teammates.length = 0;
        ctx.opponents.length = 0;
        ctx.chaser = null;
        ctx.cover = null;
        ctx.intercept = null;
        ctx.attackTargets = null;
        ctx.defenseTargets = null;
      }
    }

    function start(options) {
      const startOptions = options || {};
      if (startOptions.selectedHero) state.selectedHero = startOptions.selectedHero;
      if (startOptions.selectedMatch) state.selectedMatch = startOptions.selectedMatch;
      if (startOptions.difficulty) state.difficulty = startOptions.difficulty;
      if (startOptions.matchDuration != null) state.matchDuration = startOptions.matchDuration;

      state.players = [];
      state.ball = null;
      state.timeLeft = state.matchDuration;
      state.stats = {
        shotsBlue: 0,
        shotsRed: 0,
        tacklesBlue: 0,
        tacklesRed: 0,
        passesBlue: 0,
        passesRed: 0,
        possBlueTime: 0,
        possRedTime: 0,
        playerStats: {}
      };
      state.paused = false;
      state.replayMode = false;
      state.replayFrames = [];
      state.replayTimer = 0;
      state.replayFrameIdx = 0;
      state.replayTeam = null;
      state.replayGoalX = 0;
      state.powerups = [];
      state.powerupSpawnTimer = 8.0;
      state.combo = { blue: { count: 0, timer: 0 }, red: { count: 0, timer: 0 } };
      state.shidouAnimActive = false;
      state.shidouAnimTimer = 0;
      state.shidouAnimPlayer = null;
      state.yukimiyaGhosts = [];
      state.particles = [];
      state.trails = [];
      state.illusions = [];
      state.hioriSnowfields = [];
      state.kuronaBlackHoles = [];
      state.karasuCrow = null;
      state.cameraShake = 0;
      state.nagiSkull = null;
      state.recentSave = { team: null, timer: 0 };
      state.scoreBlue = 0;
      state.scoreRed = 0;
      state.goalCelebrating = false;
      state.goalTimer = 0;
      state.lastTime = 0;
      state.gameRunning = true;
      state._cachedHuman = null;
      resetTactics(state);
      active = true;
      return state;
    }

    function end() {
      state.gameRunning = false;
      state.paused = false;
      active = false;
      return state;
    }

    function setPaused(paused) {
      if (!state.gameRunning) return state.paused;
      state.paused = !!paused;
      return state.paused;
    }

    function togglePause() {
      if (!state.gameRunning) return state.paused;
      state.paused = !state.paused;
      return state.paused;
    }

    function isActive() {
      return active;
    }

    function getState() {
      return state;
    }

    return {
      state,
      start,
      end,
      setPaused,
      togglePause,
      isActive,
      getState
    };
  }

  return { createLocalSession };
});
