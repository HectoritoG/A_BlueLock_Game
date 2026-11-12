(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLNetInterpolation = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const DEFAULTS = {
    // Render slightly behind the newest snapshot so there is always a pair to
    // interpolate, even when packets arrive with a little jitter.
    delayMs: 90,
    // Extra render delay added when packet arrival jitter is high. This trades
    // a little input latency for smooth motion instead of frequent stalls.
    maxExtraDelayMs: 100,
    // Maximum change of the render delay per received snapshot. Squeezing the
    // delay in small steps avoids visible rewinds when the network changes.
    maxDelayStepMs: 12,
    maxSnapshots: 40,
    maxPlayerJump: 600,
    maxBallJump: 1200,
    maxExtrapolationMs: 50
  };

  function nowMs() {
    if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  function numberOr(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpAngle(a, b, t) {
    let from = numberOr(a, 0);
    let to = numberOr(b, 0);
    let delta = to - from;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return from + delta * t;
  }

  function cloneSnapshot(snapshot) {
    if (!snapshot) return null;
    const out = Object.assign({}, snapshot);
    out.players = (snapshot.players || []).map(function(player) {
      return player ? Object.assign({}, player) : player;
    });
    if (snapshot.ball) out.ball = Object.assign({}, snapshot.ball);
    if (snapshot.karasuCrow) out.karasuCrow = Object.assign({}, snapshot.karasuCrow);
    if (snapshot.nagiSkull) out.nagiSkull = Object.assign({}, snapshot.nagiSkull);
    return out;
  }

  function blendPosition(out, older, newer, t, maxJump) {
    const oldX = numberOr(older.x, numberOr(newer.x, 0));
    const oldY = numberOr(older.y, numberOr(newer.y, 0));
    const newX = numberOr(newer.x, oldX);
    const newY = numberOr(newer.y, oldY);
    const dx = newX - oldX;
    const dy = newY - oldY;
    // A large jump is usually a reset/teleport, not movement. Snapping avoids
    // sliding a player across the field after a goal or a substitution.
    if (dx * dx + dy * dy > maxJump * maxJump) {
      out.x = newX;
      out.y = newY;
    } else {
      out.x = lerp(oldX, newX, t);
      out.y = lerp(oldY, newY, t);
    }
  }

  function blendPlayer(older, newer, t, maxJump) {
    const out = Object.assign({}, newer);
    if (!older) return out;
    blendPosition(out, older, newer, t, maxJump);
    out.vx = lerp(numberOr(older.vx, 0), numberOr(newer.vx, 0), t);
    out.vy = lerp(numberOr(older.vy, 0), numberOr(newer.vy, 0), t);
    out.facingAngle = lerpAngle(older.facingAngle, newer.facingAngle, t);
    return out;
  }

  function blendBall(older, newer, t, maxJump) {
    if (!older || !newer) return newer ? Object.assign({}, newer) : newer;
    const out = Object.assign({}, newer);
    blendPosition(out, older, newer, t, maxJump);
    out.z = lerp(numberOr(older.z, 0), numberOr(newer.z, 0), t);
    out.vx = lerp(numberOr(older.vx, 0), numberOr(newer.vx, 0), t);
    out.vy = lerp(numberOr(older.vy, 0), numberOr(newer.vy, 0), t);
    out.vz = lerp(numberOr(older.vz, 0), numberOr(newer.vz, 0), t);
    out.rotation = lerp(numberOr(older.rotation, 0), numberOr(newer.rotation, 0), t);
    if (older.dribbleOffset && newer.dribbleOffset) {
      out.dribbleOffset = {
        x: lerp(numberOr(older.dribbleOffset.x, 0), numberOr(newer.dribbleOffset.x, 0), t),
        y: lerp(numberOr(older.dribbleOffset.y, 0), numberOr(newer.dribbleOffset.y, 0), t)
      };
    }
    return out;
  }

  function blendSnapshots(older, newer, t, options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    if (!older) return cloneSnapshot(newer);
    if (!newer) return cloneSnapshot(older);
    const amount = Math.max(0, numberOr(t, 0));
    const out = Object.assign({}, newer);
    out.timeLeft = lerp(numberOr(older.timeLeft, 0), numberOr(newer.timeLeft, 0), amount);

    const olderPlayers = new Map();
    (older.players || []).forEach(function(player) {
      if (player && player.id !== undefined && player.id !== null) olderPlayers.set(player.id, player);
    });
    const olderList = older.players || [];
    out.players = (newer.players || []).map(function(player, index) {
      const previous = player && player.id !== undefined && player.id !== null
        ? olderPlayers.get(player.id)
        : olderList[index];
      return blendPlayer(previous, player, amount, opts.maxPlayerJump);
    });

    if (newer.ball) out.ball = blendBall(older.ball, newer.ball, amount, opts.maxBallJump);

    if (older.karasuCrow && newer.karasuCrow) {
      out.karasuCrow = Object.assign({}, newer.karasuCrow);
      blendPosition(out.karasuCrow, older.karasuCrow, newer.karasuCrow, amount, opts.maxBallJump);
    }
    if (older.nagiSkull && newer.nagiSkull) {
      out.nagiSkull = Object.assign({}, newer.nagiSkull);
      blendPosition(out.nagiSkull, older.nagiSkull, newer.nagiSkull, amount, opts.maxBallJump);
      out.nagiSkull.z = lerp(
        numberOr(older.nagiSkull.z, 0),
        numberOr(newer.nagiSkull.z, 0),
        amount
      );
    }
    return out;
  }

  function createSnapshotInterpolator(options) {
    const opts = Object.assign({}, DEFAULTS, options || {});
    let entries = [];
    // Smallest observed (arrival - host timestamp). This is the best estimate
    // of the clock difference between the two pages. Using the first packet
    // would bake its connection-setup delay into every frame and make the
    // guest render hundreds of milliseconds late.
    let clockOffset = null;
    let clockDelay = opts.delayMs;
    let lastSequence = null;

    function reset() {
      entries = [];
      clockOffset = null;
      clockDelay = opts.delayMs;
      lastSequence = null;
    }

    function push(snapshot, receivedAt) {
      if (!snapshot) return false;
      const now = numberOr(receivedAt, nowMs());
      const stampedHostTime = numberOr(snapshot.hostTime, NaN);
      let hostTime = stampedHostTime;
      if (!Number.isFinite(hostTime)) {
        // Compatibility with an older host that does not stamp snapshots:
        // use local arrival time as a monotonic clock.
        hostTime = entries.length
          ? entries[entries.length - 1].hostTime + (now - entries[entries.length - 1].receivedAt)
          : now;
      }
      const sequence = numberOr(snapshot.seq, NaN);
      if (Number.isFinite(sequence) && lastSequence !== null && sequence <= lastSequence) {
        return false;
      }
      const entry = {
        snapshot,
        hostTime,
        receivedAt: now,
        sequence: Number.isFinite(sequence) ? sequence : null,
        offset: Number.isFinite(stampedHostTime) ? now - stampedHostTime : null
      };
      if (!entries.length || hostTime >= entries[entries.length - 1].hostTime) {
        entries.push(entry);
      } else {
        entries.push(entry);
        entries.sort(function(a, b) { return a.hostTime - b.hostTime; });
      }
      if (entry.sequence !== null) {
        lastSequence = lastSequence === null ? entry.sequence : Math.max(lastSequence, entry.sequence);
      }
      while (entries.length > opts.maxSnapshots) entries.shift();
      // Keep a sliding-window minimum so a change in network conditions can
      // still adjust the render clock instead of freezing on an old offset.
      // The p85 offset (relative to the fastest packet) estimates jitter and
      // adds delay only when the connection actually needs it.
      const offsets = [];
      for (let i = 0; i < entries.length; i++) {
        if (entries[i].offset !== null) offsets.push(entries[i].offset);
      }
      if (offsets.length) {
        offsets.sort(function(a, b) { return a - b; });
        clockOffset = offsets[0];
        const p85 = offsets[Math.floor((offsets.length - 1) * 0.85)];
        const jitter = Math.max(0, p85 - clockOffset);
        const targetDelay = opts.delayMs + Math.min(opts.maxExtraDelayMs, jitter);
        // Move the render delay towards its target in small steps so the
        // rendered timeline never jumps backwards when the jitter changes.
        const maxStep = numberOr(opts.maxDelayStepMs, DEFAULTS.maxDelayStepMs);
        const delta = targetDelay - clockDelay;
        clockDelay += Math.max(-maxStep, Math.min(maxStep, delta));
      } else {
        clockOffset = 0;
        clockDelay = opts.delayMs;
      }
      return true;
    }

    function sample(now) {
      if (!entries.length) return null;
      const at = numberOr(now, nowMs());
      const renderHostTime = at - (clockOffset === null ? 0 : clockOffset) - clockDelay;
      if (entries.length === 1 || renderHostTime <= entries[0].hostTime) {
        return cloneSnapshot(entries[0].snapshot);
      }
      const newest = entries[entries.length - 1];
      if (renderHostTime >= newest.hostTime) {
        const previous = entries[entries.length - 2];
        const gap = newest.hostTime - previous.hostTime;
        const ahead = Math.min(renderHostTime - newest.hostTime, opts.maxExtrapolationMs);
        if (gap > 0 && ahead > 0) {
          const extrapolated = Math.min(1.5, 1 + ahead / gap);
          return blendSnapshots(previous.snapshot, newest.snapshot, extrapolated, opts);
        }
        return cloneSnapshot(newest.snapshot);
      }
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].hostTime >= renderHostTime) {
          const older = entries[i - 1];
          const newer = entries[i];
          const span = newer.hostTime - older.hostTime;
          const t = span > 0 ? (renderHostTime - older.hostTime) / span : 1;
          return blendSnapshots(older.snapshot, newer.snapshot, t, opts);
        }
      }
      return cloneSnapshot(newest.snapshot);
    }

    return {
      push,
      sample,
      reset,
      size: function() { return entries.length; }
    };
  }

  return {
    DEFAULTS,
    blendSnapshots,
    createSnapshotInterpolator,
    lerpAngle
  };
});
