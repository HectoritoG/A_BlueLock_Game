(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLNetSnapshot = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Fields that the guest needs to render the match and update the HUD. The
  // host keeps simulating everything; the guest never runs gameplay code.
  // Keeping an explicit list avoids sending AI-only state and keeps snapshots
  // small enough for a 10-15 Hz WebRTC stream.
  const PLAYER_SYNC_FIELDS = [
    'id', 'x', 'y', 'vx', 'vy', 'team', 'type', 'heroKey', 'rivalKey', 'charKey',
    'role', 'gkName', 'facingAngle', 'hasBall', 'size', 'speed', 'ballControl',
    'isHuman', 'isRemoteHuman', 'tackleCd', 'activeCd', 'activeTimer', 'stunTimer',
    'awakening', 'isAwakened', 'awakeningTimer', 'awakenDuration',
    'tackleActive', 'nagiCharge', 'nagiFakeCount', 'nagiSkullShot', 'nagiVolleyLock',
    'nagiTrapDash', 'nagiOffBallShot', 'dashTimer', 'slowTimer', 'kuronaSlowTimer',
    'freezeTimer', 'commandRun', 'interceptActive', 'gkRushTimer', 'crowDefenseTimer',
    'speedBuff', 'shieldTimer', 'barouZigzag', 'bachiraCombo', 'bachiraComboPhase',
    'bachiraComboTimer', 'bachiraBallImmune', 'bachiraVisualX', 'bachiraVisualY',
    'saeCombo', 'saeComboPhase', 'saeComboTimer', 'saeBallImmune', 'saeVisualX',
    'saeVisualY', 'saeFlowTimer', 'yukimiyaBobaQueue', 'yukimiyaBobaTimer',
    'yukimiyaBobaSide', 'yukimiyaControlImmune', 'kiyoraSpinTimer',
    'kiyoraSpinPassPending', 'kiyoraSpinAngle', 'receiveImmunity', 'pendingShot',
    'shotCharge', 'shotCharging', 'isagiAutoTimer', 'isagiAutoPending',
    'kaiserRouteTimer', 'kaiserRouteShotTimer', 'kaiserRoutePhase', 'homeY'
  ];

  const BALL_SYNC_FIELDS = [
    'x', 'y', 'z', 'vx', 'vy', 'vz', 'spin', 'state', 'rotation', 'shotPower',
    'dribblePhase', 'nagiAwakened', 'isagiAwakened', 'shidouShot',
    'shidouGuaranteed', 'saeGuaranteed', 'massDestructionShot', 'rinCurved',
    'rinFarPostY', 'perfectHoming', 'uninterceptablePass', 'lastTouchTeam',
    'lastTouchTime'
  ];

  // Index of every synced field. Copying and packing use it to walk the
  // properties a player actually has instead of probing every field name.
  const PLAYER_FIELD_INDEX = new Map();
  PLAYER_SYNC_FIELDS.forEach(function(field, index) { PLAYER_FIELD_INDEX.set(field, index); });
  const BALL_FIELD_INDEX = new Map();
  BALL_SYNC_FIELDS.forEach(function(field, index) { BALL_FIELD_INDEX.set(field, index); });

  function copyFields(source, fields, target, index) {
    const out = target || {};
    if (!source) return out;
    for (const key in source) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
      if (!index.has(key)) continue;
      out[key] = source[key];
    }
    return out;
  }

  function serializePlayer(player) {
    const out = copyFields(player, PLAYER_SYNC_FIELDS, undefined, PLAYER_FIELD_INDEX);
    out.id = player.id || null;
    out.isHuman = !!player.isHuman;
    out.isRemoteHuman = !!player.isRemoteHuman;
    return out;
  }

  function serializeBall(ball) {
    if (!ball) return null;
    const out = copyFields(ball, BALL_SYNC_FIELDS, undefined, BALL_FIELD_INDEX);
    out.ownerId = ball.owner && ball.owner.id ? ball.owner.id : null;
    out.passTargetId = ball.passTarget && ball.passTarget.id ? ball.passTarget.id : null;
    out.lastShooterId = ball.lastShooter && ball.lastShooter.id ? ball.lastShooter.id : null;
    out.lastPasserId = ball.lastPasser && ball.lastPasser.id ? ball.lastPasser.id : null;
    out.lastTouchId = ball.lastTouch && ball.lastTouch.id ? ball.lastTouch.id : null;
    out.dribbleOffset = ball.dribbleOffset ? { x: ball.dribbleOffset.x || 0, y: ball.dribbleOffset.y || 0 } : { x: 0, y: 0 };
    return out;
  }

  function clonePlain(value) {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function serializeMatch(G) {
    if (!G) return null;
    const powerups = Array.isArray(G.powerups) ? G.powerups.map(function(pu) {
      return {
        x: pu.x, y: pu.y, type: pu.type, life: pu.life,
        phase: pu.phase, collected: !!pu.collected
      };
    }) : [];
    return {
      timeLeft: Number(G.timeLeft) || 0,
      scoreBlue: Number(G.scoreBlue) || 0,
      scoreRed: Number(G.scoreRed) || 0,
      goalCelebrating: !!G.goalCelebrating,
      goalTimer: Number(G.goalTimer) || 0,
      replayMode: !!G.replayMode,
      replayTeam: G.replayTeam || null,
      replayGoalX: Number(G.replayGoalX) || 0,
      paused: !!G.paused,
      cameraShake: Number(G.cameraShake) || 0,
      stats: clonePlain(G.stats || {}),
      powerups,
      players: (G.players || []).map(serializePlayer),
      ball: serializeBall(G.ball),
      karasuCrow: G.karasuCrow ? {
        playerId: G.karasuCrow.player && G.karasuCrow.player.id ? G.karasuCrow.player.id : null,
        x: G.karasuCrow.x, y: G.karasuCrow.y, life: G.karasuCrow.life,
        maxLife: G.karasuCrow.maxLife, team: G.karasuCrow.team
      } : null,
      nagiSkull: G.nagiSkull ? {
        x: G.nagiSkull.x, y: G.nagiSkull.y, z: G.nagiSkull.z,
        life: G.nagiSkull.life, maxLife: G.nagiSkull.maxLife
      } : null,
      shidouAnimActive: !!G.shidouAnimActive,
      shidouAnimTimer: Number(G.shidouAnimTimer) || 0,
      shidouAnimPlayerId: G.shidouAnimPlayer && G.shidouAnimPlayer.id ? G.shidouAnimPlayer.id : null
    };
  }

  // Compact wire format. The guest needs the same state, but repeating every
  // field name for 18 players makes each JSON snapshot ~25 KB. Packing values
  // into arrays with a per-player field mask keeps the payload small enough
  // for a 15 Hz WebRTC stream without chunking on most connections.
  const PACK_VERSION = 1;
  const BALL_PACK_FIELDS = BALL_SYNC_FIELDS.concat([
    'ownerId', 'passTargetId', 'lastShooterId', 'lastPasserId', 'lastTouchId'
  ]);

  function packNumber(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return value;
    return Math.round(value * 100) / 100;
  }

  function packFields(source, fields) {
    const maskCount = Math.ceil(fields.length / 32);
    const masks = new Array(maskCount);
    for (let i = 0; i < maskCount; i++) masks[i] = 0;
    const values = [];
    for (let i = 0; i < fields.length; i++) {
      const value = source ? source[fields[i]] : undefined;
      // A missing field and a field set to undefined are treated the same, so
      // the guest keeps its previous value instead of receiving a null.
      if (value === undefined) continue;
      masks[Math.floor(i / 32)] = (masks[Math.floor(i / 32)] | (1 << (i % 32))) >>> 0;
      values.push(packNumber(value));
    }
    return [masks, values];
  }

  function unpackFields(data, fields) {
    const maskCount = Math.ceil(fields.length / 32);
    const masks = data || [];
    const values = masks[maskCount] || [];
    const out = {};
    let valueIndex = 0;
    for (let i = 0; i < fields.length; i++) {
      const mask = Number(masks[Math.floor(i / 32)]) >>> 0;
      if ((mask >>> (i % 32)) & 1) {
        out[fields[i]] = values[valueIndex++];
      }
    }
    return out;
  }

  function packPlayer(player) {
    const packed = packFields(player, PLAYER_SYNC_FIELDS);
    return packed[0].concat([packed[1]]);
  }

  function unpackPlayer(data) {
    return unpackFields(data, PLAYER_SYNC_FIELDS);
  }

  function packBall(ball) {
    if (!ball) return null;
    const packed = packFields(ball, BALL_PACK_FIELDS);
    const offset = ball.dribbleOffset || { x: 0, y: 0 };
    return packed[0].concat([packed[1], packNumber(offset.x), packNumber(offset.y)]);
  }

  function unpackBall(data) {
    if (!data) return null;
    const ball = unpackFields(data, BALL_PACK_FIELDS);
    const maskCount = Math.ceil(BALL_PACK_FIELDS.length / 32);
    ball.dribbleOffset = { x: Number(data[maskCount + 1]) || 0, y: Number(data[maskCount + 2]) || 0 };
    return ball;
  }

  function packSnapshot(snapshot) {
    if (!snapshot) return null;
    return {
      __bl: PACK_VERSION,
      h: snapshot.hostTime,
      q: snapshot.seq,
      t: packNumber(snapshot.timeLeft),
      b: snapshot.scoreBlue,
      r: snapshot.scoreRed,
      g: snapshot.goalCelebrating ? 1 : 0,
      gt: packNumber(snapshot.goalTimer),
      p: snapshot.paused ? 1 : 0,
      cs: packNumber(snapshot.cameraShake),
      st: snapshot.stats || {},
      pu: (snapshot.powerups || []).map(function(pu) {
        return [packNumber(pu.x), packNumber(pu.y), pu.type, packNumber(pu.life), packNumber(pu.phase), pu.collected ? 1 : 0];
      }),
      pl: (snapshot.players || []).map(packPlayer),
      ba: packBall(snapshot.ball),
      kc: snapshot.karasuCrow || null,
      ns: snapshot.nagiSkull || null,
      sa: snapshot.shidouAnimActive ? 1 : 0,
      sat: packNumber(snapshot.shidouAnimTimer),
      sap: snapshot.shidouAnimPlayerId || null,
      rm: snapshot.replayMode ? 1 : 0,
      rt: snapshot.replayTeam || null,
      rg: packNumber(snapshot.replayGoalX)
    };
  }

  function unpackSnapshot(packed) {
    if (!packed || packed.__bl !== PACK_VERSION) return packed;
    return {
      hostTime: packed.h,
      seq: packed.q,
      timeLeft: Number(packed.t) || 0,
      scoreBlue: Number(packed.b) || 0,
      scoreRed: Number(packed.r) || 0,
      goalCelebrating: !!packed.g,
      goalTimer: Number(packed.gt) || 0,
      replayMode: !!packed.rm,
      replayTeam: packed.rt || null,
      replayGoalX: Number(packed.rg) || 0,
      paused: !!packed.p,
      cameraShake: Number(packed.cs) || 0,
      stats: packed.st || {},
      powerups: (packed.pu || []).map(function(pu) {
        return { x: pu[0], y: pu[1], type: pu[2], life: pu[3], phase: pu[4], collected: !!pu[5] };
      }),
      players: (packed.pl || []).map(unpackPlayer),
      ball: unpackBall(packed.ba),
      karasuCrow: packed.kc || null,
      nagiSkull: packed.ns || null,
      shidouAnimActive: !!packed.sa,
      shidouAnimTimer: Number(packed.sat) || 0,
      shidouAnimPlayerId: packed.sap || null
    };
  }

  function buildRoster(players) {
    return (players || []).map(function(player) {
      return {
        id: player.id || null,
        team: player.team,
        type: player.type,
        charKey: player.charKey,
        role: player.role,
        gkName: player.gkName || null,
        isHuman: !!player.isHuman,
        isRemoteHuman: !!player.isRemoteHuman
      };
    });
  }

  function createPlayersFromRoster(PlayerCtor, roster, localPlayerId) {
    return (roster || []).map(function(entry) {
      const player = new PlayerCtor(0, 0, entry.team, entry.type, entry.charKey, entry.role);
      player.id = entry.id || null;
      if (entry.gkName) player.gkName = entry.gkName;
      player.isHuman = false;
      player.isRemoteHuman = !!localPlayerId && entry.id === localPlayerId;
      return player;
    });
  }

  function applyPlayer(player, data) {
    if (!player || !data) return;
    for (let i = 0; i < PLAYER_SYNC_FIELDS.length; i++) {
      const field = PLAYER_SYNC_FIELDS[i];
      if (field === 'id') continue;
      if (Object.prototype.hasOwnProperty.call(data, field)) player[field] = data[field];
    }
    player.id = data.id || player.id;
    player.isHuman = !!data.isHuman;
    player.isRemoteHuman = !!data.isRemoteHuman;
  }

  function applyBall(ball, data, playersById) {
    if (!ball || !data) return ball;
    for (let i = 0; i < BALL_SYNC_FIELDS.length; i++) {
      const field = BALL_SYNC_FIELDS[i];
      if (Object.prototype.hasOwnProperty.call(data, field)) ball[field] = data[field];
    }
    ball.owner = data.ownerId ? playersById.get(data.ownerId) || null : null;
    ball.passTarget = data.passTargetId ? playersById.get(data.passTargetId) || null : null;
    ball.lastShooter = data.lastShooterId ? playersById.get(data.lastShooterId) || null : null;
    ball.lastPasser = data.lastPasserId ? playersById.get(data.lastPasserId) || null : null;
    ball.lastTouch = data.lastTouchId ? playersById.get(data.lastTouchId) || null : null;
    if (data.dribbleOffset) ball.dribbleOffset = { x: data.dribbleOffset.x || 0, y: data.dribbleOffset.y || 0 };
    return ball;
  }

  function applyMatch(G, snapshot, runtime) {
    if (!G || !snapshot) return G;
    const opts = runtime || {};
    const PlayerCtor = opts.Player;
    const BallCtor = opts.Ball;

    if (!Array.isArray(G.players)) G.players = [];
    const byId = new Map();
    for (let i = 0; i < G.players.length; i++) {
      if (G.players[i] && G.players[i].id) byId.set(G.players[i].id, G.players[i]);
    }

    const incoming = Array.isArray(snapshot.players) ? snapshot.players : [];
    for (let i = 0; i < incoming.length; i++) {
      const data = incoming[i];
      let player = data && data.id ? byId.get(data.id) : null;
      if (!player && PlayerCtor && data) {
        player = new PlayerCtor(0, 0, data.team, data.type, data.charKey, data.role);
        player.id = data.id || null;
        G.players.push(player);
        if (player.id) byId.set(player.id, player);
      }
      if (player) applyPlayer(player, data);
    }

    if (snapshot.ball) {
      if (!G.ball && BallCtor) G.ball = new BallCtor();
      applyBall(G.ball, snapshot.ball, byId);
    }

    G.timeLeft = Number(snapshot.timeLeft) || 0;
    G.scoreBlue = Number(snapshot.scoreBlue) || 0;
    G.scoreRed = Number(snapshot.scoreRed) || 0;
    G.goalCelebrating = !!snapshot.goalCelebrating;
    G.goalTimer = Number(snapshot.goalTimer) || 0;
    G.replayMode = !!snapshot.replayMode;
    G.replayTeam = snapshot.replayTeam || null;
    G.replayGoalX = Number(snapshot.replayGoalX) || 0;
    G.paused = !!snapshot.paused;
    G.cameraShake = Number(snapshot.cameraShake) || 0;
    G.stats = clonePlain(snapshot.stats || {});
    G.powerups = Array.isArray(snapshot.powerups) ? snapshot.powerups.map(function(pu) {
      return {
        x: pu.x, y: pu.y, type: pu.type, life: pu.life,
        phase: pu.phase, collected: !!pu.collected
      };
    }) : [];

    G.karasuCrow = snapshot.karasuCrow ? {
      player: snapshot.karasuCrow.playerId ? byId.get(snapshot.karasuCrow.playerId) || null : null,
      x: snapshot.karasuCrow.x,
      y: snapshot.karasuCrow.y,
      life: snapshot.karasuCrow.life,
      maxLife: snapshot.karasuCrow.maxLife,
      team: snapshot.karasuCrow.team
    } : null;
    G.nagiSkull = snapshot.nagiSkull ? {
      x: snapshot.nagiSkull.x,
      y: snapshot.nagiSkull.y,
      z: snapshot.nagiSkull.z,
      life: snapshot.nagiSkull.life,
      maxLife: snapshot.nagiSkull.maxLife
    } : null;
    G.shidouAnimActive = !!snapshot.shidouAnimActive;
    G.shidouAnimTimer = Number(snapshot.shidouAnimTimer) || 0;
    G.shidouAnimPlayer = snapshot.shidouAnimPlayerId ? byId.get(snapshot.shidouAnimPlayerId) || null : null;

    return G;
  }

  return {
    PLAYER_SYNC_FIELDS,
    BALL_SYNC_FIELDS,
    serializePlayer,
    serializeBall,
    serializeMatch,
    packSnapshot,
    unpackSnapshot,
    PACK_VERSION,
    buildRoster,
    createPlayersFromRoster,
    applyPlayer,
    applyBall,
    applyMatch
  };
});
