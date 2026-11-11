(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLMatchState = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Per team tactical context, refreshed once per frame by the AI layer.
  function createTeamTactics(team) {
    return {
      team: team,
      attackDir: team === 'blue' ? 1 : -1,
      possessionTeam: null,
      phase: 'loose',
      looseTimer: 0,
      transitionTimer: 0,
      counterPressTime: 1.8,
      counterPressPlayers: 2,
      carrier: null,
      lastTouchTeam: null,
      human: null,
      humanIsCarrier: false,
      pressureOnHuman: false,
      teammates: [],
      opponents: [],
      ball: { x: 0, y: 0, vx: 0, vy: 0, z: 0, state: 'free' },
      goalY: 0,
      goalW: 280,
      ownGoalX: 0,
      oppGoalX: 0,
      chaser: null,
      cover: null,
      intercept: null,
      attackTargets: null,
      defenseTargets: null,
      aggression: 1
    };
  }

  // Creates a complete, independent match state. Every match gets its own
  // arrays and nested objects so a future host/guest session can own one
  // state per room without leaking data between games.
  function createMatchState(options) {
    const opts = options || {};
    const matchDuration = opts.matchDuration == null ? 180 : opts.matchDuration;

    return {
      players: [],
      ball: null,
      selectedHero: opts.selectedHero || 'isagi',
      selectedMatch: opts.selectedMatch || 'japan',
      isMobile: !!opts.isMobile,
      difficulty: opts.difficulty || 'normal',
      matchDuration,
      scoreBlue: 0,
      scoreRed: 0,
      timeLeft: opts.timeLeft == null ? matchDuration : opts.timeLeft,
      lastTime: 0,
      gameRunning: false,
      goalCelebrating: false,
      goalTimer: 0,
      particles: [],
      trails: [],
      illusions: [],
      cameraShake: 0,
      nagiSkull: null,
      stats: {
        shotsBlue: 0,
        shotsRed: 0,
        tacklesBlue: 0,
        tacklesRed: 0,
        passesBlue: 0,
        passesRed: 0,
        possBlueTime: 0,
        possRedTime: 0,
        playerStats: {}
      },
      paused: false,
      replayMode: false,
      replayTimer: 0,
      replayFrames: [],
      replayFrameIdx: 0,
      replayTeam: null,
      replayGoalX: 0,
      powerups: [],
      powerupSpawnTimer: 12.0,
      combo: {
        blue: { count: 0, timer: 0 },
        red: { count: 0, timer: 0 }
      },
      shidouAnimActive: false,
      shidouAnimTimer: 0,
      shidouAnimPlayer: null,
      yukimiyaGhosts: [],
      hioriSnowfields: [],
      kuronaBlackHoles: [],
      karasuCrow: null,
      recentSave: { team: null, timer: 0 },
      // Shared tactical context. Both teams read from it every frame so the
      // attacking shape and the loose ball roles stay consistent.
      tactics: {
        path: null,
        blue: createTeamTactics('blue'),
        red: createTeamTactics('red')
      },
      debugAI: false,
      _cachedHuman: null
    };
  }

  return { createMatchState };
});
