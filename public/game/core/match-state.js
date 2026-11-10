(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLMatchState = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

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
      _cachedHuman: null
    };
  }

  return { createMatchState };
});
