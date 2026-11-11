(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLAI = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Pure tactical helpers shared by the team AI.
  // No DOM, no canvas, no window: every function works on plain snapshots so
  // the behaviour can be unit tested in Node without a browser.

  const BALL_R = 14;
  const GOAL_W = 280;

  // Characters that are natural anchors: they hold the defensive line instead
  // of joining the attack.
  const HOLD_LINE_KEYS = ['niko', 'snuffy', 'tokimitsu'];

  // Tactical profiles. The formation slot is not enough to describe these
  // characters: Aiku and Karasu are central defenders no matter where the
  // formation puts them, Reo is a hybrid that steps out of his line and
  // Shidou and Barou keep a high line waiting for the counter attack.
  const PROFILES = {
    aiku: 'centralDefender',
    karasu: 'presser',
    reo: 'hybrid',
    shidou: 'striker',
    barou: 'striker'
  };

  const PROFILE_CENTRAL_DEFENDER = 'centralDefender';
  const PROFILE_HYBRID = 'hybrid';
  const PROFILE_HOLDER = 'holder';
  const PROFILE_STRIKER = 'striker';
  const PROFILE_PRESSER = 'presser';

  // Tunables for the tactical layer. Everything the AI does is driven from
  // here so the behaviour can be rebalanced without touching the logic.
  const TACTICS = {
    // --- attacking support -------------------------------------------------
    // The human moves at 60 * speed px/s while carrying the ball, so the
    // support needs a factor of 1.25 to stay next to him instead of
    // trailing behind the play.
    supportSpeed: 1.25,          // base factor for a support run
    supportRunSpeed: 1.32,       // forwards running beyond the carrier
    supportSprintFactor: 1.45,   // factor used when the player is behind the play
    supportSprintGap: 260,       // how far behind the ball triggers the sprint
    supportSprintDistance: 300,  // distance that triggers the sprint
    arriveRadius: 70,            // slow down inside this radius to avoid jitter
    maxSpeedFactor: 1.5,         // no AI runs faster than this factor
    restDefenseDepth: 330,       // central defenders stay this far behind the ball
    restDefenseMinDepth: 250,    // ...but never closer than this to their goal
    restDefenseMinGap: 120,      // ...and never closer than this to the ball
    wingerOverlapDepth: 120,     // wide midfielders pushing ahead of the carrier
    wingerUnderlapDepth: 30,     // ...or tucking in when the carrier is crowded
    fullbackOverlapDepth: 170,   // wide defenders overlapping in the final third
    fullbackSupportDepth: 40,    // ...otherwise they stay level with the carrier
    strikerDepth: 300,           // forwards running beyond the carrier
    strikerBoxDepth: 180,        // distance from the goal line inside the box
    touchlineInset: 70,          // how close the wide players hug the sideline
    minSpacing: 140,             // minimum distance between two support targets
    carrierLaneClearance: 110,   // nobody stands inside the carrier's lane
    crowdedRadius: 170,          // radius used to detect a crowded carrier
    minAhead: 2,                 // team mates ahead of the ball while attacking
    minBehind: 2,                // team mates behind the ball (rest defence)

    // --- defending and transitions ----------------------------------------
    counterPressTime: 1.8,       // seconds of counter pressure after losing the ball
    counterPressPlayers: 2,      // how many players counter press
    counterPressMarkDist: 420,   // how close the counter presser gets
    recoverySpeed: 1.45,         // speed factor while recovering to the goal side
    goalSideGap: 70,             // how far behind the ball a recovering player stays
    pressSpeed: 1.15,            // speed factor when pressing the carrier
    defensiveLineDepth: 300,     // depth of the defensive line behind the ball
    defensiveLineMinDepth: 260,  // ...but never deeper than this from own goal
    anchorDepth: 380,            // hold-the-line characters sit this deep
    markMaxDistance: 1150,       // a rival further away than this is not marked
    markGoalSide: 0.15,          // how close to our goal the mark is taken
    markMaxDepth: 520,           // the mark never goes deeper than this
    centralDefenderZone: 950,    // depth of the zone the centre backs defend
    centralDefenderZoneMin: 280, // they never drop closer than this to the goal
    shotDetectRange: 300,        // how close a shot has to pass to raise the wall
    strikerHighLine: 250,        // how far ahead of the centre the strikers stay
    holdingMidDepth: 160,        // depth of the holding midfielder behind the ball

    // --- loose balls -------------------------------------------------------
    chaseSpeed: 1.3,             // speed factor of the designated chaser
    chaseReboundBoost: 1.45,     // ...right after a shot or a save
    chaseReboundTime: 1.2,       // how long the boost lasts
    chaseMaxDistance: 2600,      // sanity cap for chasing a ball across the pitch
    coverRatio: 0.4,             // cover player sits this far between ball and goal
    coverSpeed: 1.1,
    interceptHorizon: 1.2,       // seconds of ball prediction
    interceptStep: 1 / 30,

    // --- goalkeeper --------------------------------------------------------
    gkClaimDepth: 380,           // how far the keeper leaves the goal line
    gkClaimWidth: 150,           // extra width around the goal mouth
    gkClaimMaxSpeed: 10,         // ball speed the keeper is willing to claim
    gkClaimMaxEta: 1.2,          // the keeper only leaves his line if he can get there
    gkRushSpeed: 1.3,
    gkSaveChaseTime: 1.5         // keeper hunts the rebound after its own save
  };

  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
  function dist(a, b){ return Math.hypot(a.x - b.x, a.y - b.y); }
  function goalYOf(field){ return field.y + field.h / 2; }

  // How far a player is behind the ball, in the direction his team attacks.
  // A positive value means he has to catch up with the play.
  function behindBall(player, ctx){
    return (ctx.ball.x - player.x) * ctx.attackDir;
  }

  // --- lanes ---------------------------------------------------------------

  // A lane is derived from the formation slot of the player, so the tactical
  // shape follows whatever formation the user saved.
  function playerLane(player, field){
    const home = player.formationHome || { x: player.x, y: player.y };
    const normY = clamp((home.y - field.y) / field.h, 0, 1);
    const profile = profileOf(player);
    // Central defenders always defend the central channel, even when the
    // formation slot puts them on the flank.
    if(profile === PROFILE_CENTRAL_DEFENDER){
      return { normY, side: 'center', isWide: false, homeY: home.y, profile: profile };
    }
    const side = normY < 0.35 ? 'top' : (normY > 0.65 ? 'bottom' : 'center');
    return { normY, side, isWide: Math.abs(normY - 0.5) > 0.18, homeY: home.y, profile: profile };
  }

  function profileOf(player){
    if(!player) return null;
    const key = player.heroKey || player.rivalKey;
    if(!key) return null;
    if(PROFILES[key]) return PROFILES[key];
    if(HOLD_LINE_KEYS.indexOf(key) >= 0) return PROFILE_HOLDER;
    return null;
  }

  function laneY(lane, field){
    if(lane.side === 'top') return field.y + TACTICS.touchlineInset;
    if(lane.side === 'bottom') return field.y + field.h - TACTICS.touchlineInset;
    return goalYOf(field);
  }

  // Anchor characters keep their position instead of joining the attack.
  function holdsLine(player){
    const profile = profileOf(player);
    return profile === PROFILE_CENTRAL_DEFENDER || profile === PROFILE_HOLDER;
  }

  // --- ball prediction -----------------------------------------------------

  // Closed form friendly prediction of the ball path. The ball decelerates
  // with a per frame friction factor, so the travelled distance over n frames
  // is v0 * (1 - f^n) / (1 - f).
  function predictBallPath(ball, field, opts){
    const o = opts || {};
    const horizon = o.horizon == null ? TACTICS.interceptHorizon : o.horizon;
    const step = o.step == null ? TACTICS.interceptStep : o.step;
    const friction = o.friction == null ? 0.975 : o.friction;
    const ballR = o.ballRadius == null ? BALL_R : o.ballRadius;
    const points = [];
    let x = ball.x, y = ball.y;
    let vx = ball.vx || 0, vy = ball.vy || 0;
    let t = 0;
    points.push({ x, y, t });
    // The simulation runs at 60 frames per second, so a step of 1/30s is two
    // simulation frames.
    const frames = Math.max(1, Math.round(step * 60));
    while(t < horizon){
      for(let i = 0; i < frames; i++){
        x += vx;
        y += vy;
        if(y < field.y + ballR){ y = field.y + ballR; vy = Math.abs(vy) * 0.6; }
        else if(y > field.y + field.h - ballR){ y = field.y + field.h - ballR; vy = -Math.abs(vy) * 0.6; }
        if(x < field.x + ballR){ x = field.x + ballR; vx = Math.abs(vx) * 0.6; }
        else if(x > field.x + field.w - ballR){ x = field.x + field.w - ballR; vx = -Math.abs(vx) * 0.6; }
        vx *= friction;
        vy *= friction;
      }
      t += step;
      points.push({ x, y, t });
      if(Math.abs(vx) < 0.05 && Math.abs(vy) < 0.05) break;
    }
    return { points, stop: points[points.length - 1] };
  }

  // Top speed of a player in pixels per second. The movement code adds
  // speed * 0.15 to the velocity and then damps it by 0.82 every frame, so the
  // terminal speed is speed * 0.15 / (1 - 0.82) * 60.
  function estimateMaxSpeed(player){ return (player.speed || 3.5) * 50; }

  // First point of the predicted path the player can actually reach.
  function reachablePoint(player, points){
    const list = points || [];
    const speed = estimateMaxSpeed(player);
    let fallback = null;
    let fallbackDist = Infinity;
    for(let i = 0; i < list.length; i++){
      const pt = list[i];
      const d = dist(player, pt);
      if(d < fallbackDist){ fallbackDist = d; fallback = pt; }
      if(d <= speed * pt.t) return { eta: pt.t, point: pt };
    }
    if(!fallback) return { eta: 0, point: { x: player.x, y: player.y, t: 0 } };
    return { eta: fallbackDist / Math.max(speed, 1), point: fallback };
  }

  // Picks the player that gets to the ball first and the one covering him.
  // Distance alone is not enough: a rolling ball is often closer to a player
  // that is running away from it.
  function chooseLooseBallRoles(candidates, path, field){
    const points = (path && path.points) || [];
    const ballStart = points.length ? points[0] : null;
    const evaluated = [];
    for(let i = 0; i < candidates.length; i++){
      const p = candidates[i];
      const reach = reachablePoint(p, points);
      evaluated.push({
        player: p,
        eta: reach.eta,
        point: reach.point,
        ballDist: ballStart ? dist(p, ballStart) : 0
      });
    }
    evaluated.sort(function(a, b){ return (a.eta - b.eta) || (a.ballDist - b.ballDist); });
    return {
      chaser: evaluated.length ? evaluated[0].player : null,
      cover: evaluated.length > 1 ? evaluated[1].player : null,
      intercept: evaluated.length ? evaluated[0].point : null,
      evaluated: evaluated
    };
  }

  // --- attacking shape -----------------------------------------------------

  function isCrowded(player, ctx){
    const carrier = ctx.carrier;
    if(!carrier || !ctx.opponents) return false;
    const lane = player.tacticalLane || { side: 'center' };
    const goalY = ctx.goalY || goalYOf(ctx.field);
    let n = 0;
    for(let i = 0; i < ctx.opponents.length; i++){
      const o = ctx.opponents[i];
      if(dist(o, carrier) > TACTICS.crowdedRadius) continue;
      if(lane.side !== 'center'){
        const oSide = o.y < goalY ? 'top' : 'bottom';
        if(oSide !== lane.side) continue;
      }
      n++;
    }
    return n >= 1;
  }

  function postTarget(lane, ctx){
    const goalY = ctx.goalY;
    const goalW = ctx.goalW || GOAL_W;
    if(lane.side === 'top') return goalY - goalW * 0.32;
    if(lane.side === 'bottom') return goalY + goalW * 0.32;
    return ctx.ball.y > goalY ? goalY - goalW * 0.28 : goalY + goalW * 0.28;
  }

  // Where a single team mate should be while the team has the ball.
  function supportTarget(player, ctx, field){
    const lane = player.tacticalLane || playerLane(player, field);
    const profile = profileOf(player);
    const dir = ctx.attackDir;
    const ball = ctx.ball;
    const bx = ball.x, by = ball.y;
    const goalY = ctx.goalY || goalYOf(field);
    const oppGoalX = dir > 0 ? field.x + field.w : field.x;
    const ownGoalX = dir > 0 ? field.x : field.x + field.w;
    const finalThird = dir > 0 ? bx > field.x + field.w * 0.78 : bx < field.x + field.w * 0.22;
    const crowded = isCrowded(player, ctx);
    let x = bx, y = by, kind = 'support';

    if(profile === PROFILE_HOLDER){
      // These characters hold their position instead of joining the attack.
      x = bx - dir * (TACTICS.restDefenseDepth + 60);
      y = lane.side === 'center' ? clamp(by, field.y + 140, field.y + field.h - 140) : laneY(lane, field);
      kind = 'rest';
    } else if(player.role === 'FWD'){
      if(finalThird){
        x = oppGoalX - dir * TACTICS.strikerBoxDepth;
        y = postTarget(lane, ctx);
        kind = 'box';
      } else {
        x = bx + dir * (TACTICS.strikerDepth + (crowded ? -140 : 0));
        y = lane.side === 'center' ? (by > goalY ? by - 150 : by + 150) : laneY(lane, field);
        kind = 'run';
      }
    } else if(profile === PROFILE_PRESSER){
      // Holding midfielder: he stays in the central channel behind the ball
      // and hunts the rival carrier from there.
      x = bx - dir * TACTICS.holdingMidDepth;
      y = clamp(by, goalY - 220, goalY + 220);
      kind = 'holding';
    } else if(player.role === 'MID' || profile === PROFILE_HYBRID){
      // A hybrid defender plays like a midfielder: he offers passing options
      // and steps out of his line when the team has the ball.
      if(lane.isWide){
        x = bx + dir * (crowded ? TACTICS.wingerUnderlapDepth : TACTICS.wingerOverlapDepth);
        y = laneY(lane, field);
        kind = crowded ? 'underlap' : 'overlap';
      } else {
        x = bx - dir * 90;
        y = by > goalY ? by - 160 : by + 160;
        kind = 'support';
      }
    } else {
      if(lane.isWide){
        if(finalThird){
          // In the last third the fullback overlaps to attack the box.
          x = bx + dir * TACTICS.fullbackOverlapDepth;
          kind = crowded ? 'support' : 'overlap';
        } else {
          // Otherwise he stays level with the carrier, wide, to give options.
          x = bx - dir * TACTICS.fullbackSupportDepth;
          kind = 'support';
        }
        y = laneY(lane, field);
      } else {
        x = clamp(
          bx - dir * TACTICS.restDefenseDepth,
          ownGoalX + dir * TACTICS.restDefenseMinDepth,
          bx - dir * TACTICS.restDefenseMinGap
        );
        // Central defenders stay in the central channel.
        y = profile === PROFILE_CENTRAL_DEFENDER
          ? clamp(by, goalY - 200, goalY + 200)
          : clamp(by, field.y + 120, field.y + field.h - 120);
        kind = 'rest';
      }
    }

    // Nobody stands in the same lane as the carrier.
    if(kind !== 'rest' && Math.abs(y - by) < TACTICS.carrierLaneClearance){
      y = by + (by > goalY ? -(TACTICS.carrierLaneClearance + 30) : (TACTICS.carrierLaneClearance + 30));
    }
    // Wide players keep their width and never run past the byline.
    if(lane.isWide && kind !== 'rest'){
      if(dir > 0) x = Math.min(x, field.x + field.w - 120);
      else x = Math.max(x, field.x + 120);
    }
    return {
      x: clamp(x, field.x + 40, field.x + field.w - 40),
      y: clamp(y, field.y + 40, field.y + field.h - 40),
      kind: kind
    };
  }

  // Keeps the support targets from stacking on top of each other.
  function relaxSpacing(players, targets, field){
    const min = TACTICS.minSpacing;
    for(let pass = 0; pass < 2; pass++){
      for(let i = 0; i < players.length; i++){
        for(let j = i + 1; j < players.length; j++){
          const a = targets.get(players[i]);
          const b = targets.get(players[j]);
          if(!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if(d >= min) continue;
          const push = (min - (d < 0.001 ? 0 : d)) / 2;
          const sign = d < 0.001 ? 1 : (b.y >= a.y ? 1 : -1);
          a.y -= push * sign;
          b.y += push * sign;
          a.y = clamp(a.y, field.y + 40, field.y + field.h - 40);
          b.y = clamp(b.y, field.y + 40, field.y + field.h - 40);
        }
      }
    }
  }

  // Guarantees the classic team shape: someone ahead of the ball to attack and
  // someone behind it to protect the goal.
  function enforceAdvance(players, targets, ctx, field){
    if(players.length < 5) return;
    const dir = ctx.attackDir;
    const bx = ctx.ball.x;
    const aheadness = new Map();
    let ahead = 0, behind = 0;
    for(let i = 0; i < players.length; i++){
      const p = players[i];
      const t = targets.get(p);
      if(!t) continue;
      const a = (t.x - bx) * dir;
      aheadness.set(p, a);
      if(a > 60) ahead++;
      else if(a < -60) behind++;
    }
    if(ahead < TACTICS.minAhead){
      const candidates = players.filter(function(p){
        const t = targets.get(p);
        return t && t.kind !== 'rest';
      }).sort(function(p, q){ return (aheadness.get(q) || 0) - (aheadness.get(p) || 0); });
      let need = TACTICS.minAhead - ahead;
      for(let i = 0; i < candidates.length && need > 0; i++){
        const t = targets.get(candidates[i]);
        t.x = clamp(t.x + dir * 220, field.x + 40, field.x + field.w - 40);
        t.kind = 'run';
        need--;
      }
    }
    if(behind < TACTICS.minBehind){
      const candidates = players.filter(function(p){
        const t = targets.get(p);
        return t && t.kind !== 'rest';
      }).sort(function(p, q){ return (aheadness.get(p) || 0) - (aheadness.get(q) || 0); });
      let need = TACTICS.minBehind - behind;
      for(let i = 0; i < candidates.length && need > 0; i++){
        const t = targets.get(candidates[i]);
        t.x = clamp(t.x - dir * 260, field.x + 40, field.x + field.w - 40);
        t.kind = 'rest';
        need--;
      }
    }
  }

  function assignSupportTargets(players, ctx, field){
    const targets = new Map();
    for(let i = 0; i < players.length; i++){
      targets.set(players[i], supportTarget(players[i], ctx, field));
    }
    relaxSpacing(players, targets, field);
    enforceAdvance(players, targets, ctx, field);
    return targets;
  }

  // Does the shot that is travelling now go near this player? It lets the
  // defenders raise the wall before the ball arrives.
  function shotPassesNear(player, ball, range){
    const vx = ball.vx || 0, vy = ball.vy || 0;
    const len = Math.hypot(vx, vy);
    if(len < 0.5) return false;
    const nx = vx / len, ny = vy / len;
    const rx = player.x - ball.x, ry = player.y - ball.y;
    const along = rx * nx + ry * ny;
    if(along < 0) return false;          // the ball is moving away from him
    const perp = Math.abs(rx * (-ny) + ry * nx);
    return perp <= (range == null ? TACTICS.shotDetectRange : range);
  }

  // --- defensive shape -----------------------------------------------------

  // Picks the rival that is the biggest threat for our goal and returns the
  // spot a central defender has to occupy: close to that rival, but always on
  // the goal side of him.
  function markTarget(player, ctx, field, used){
    const ownGoalX = ctx.ownGoalX;
    const goalY = ctx.goalY || goalYOf(field);
    let mark = null;
    let best = Infinity;
    const opponents = ctx.opponents || [];
    for(let i = 0; i < opponents.length; i++){
      const o = opponents[i];
      if(o.type === 'goalkeeper') continue;
      if(used && used.has(o)) continue;
      const threat = Math.abs(o.x - ownGoalX);
      if(threat < best){ best = threat; mark = o; }
    }
    if(!mark) return null;
    // A rival that is far away is not worth marking.
    if(best > TACTICS.markMaxDistance) return null;
    if(used) used.add(mark);
    const dir = ctx.attackDir;
    // He stays tight on his rival, only a little bit on the goal side, and he
    // never goes deeper than his zone.
    const goalSide = Math.min(TACTICS.markGoalSide * best, TACTICS.markMaxDepth);
    const x = mark.x - dir * goalSide;
    const y = mark.y + (goalY - mark.y) * 0.2;
    return { x: x, y: y, kind: 'mark', opponent: mark };
  }

  // Where a team mate should be while the rival has the ball.
  function defensiveTarget(player, ctx, field, used){
    const dir = ctx.attackDir;
    const ball = ctx.ball;
    const bx = ball.x, by = ball.y;
    const goalY = ctx.goalY || goalYOf(field);
    const ownGoalX = dir > 0 ? field.x : field.x + field.w;
    const lane = player.tacticalLane || playerLane(player, field);
    const profile = profileOf(player);
    const aheadness = (player.x - bx) * dir;
    // Depth of the ball measured from our own goal, in the attacking
    // direction. It keeps the maths readable for both teams.
    const ballDepth = (bx - ownGoalX) * dir;
    let x, y, kind;

    // Depth of a defender that holds the line: never closer than the edge of
    // the zone and never further than the ball.
    function lineDepth(minDepth){
      let depth = ballDepth - TACTICS.defensiveLineDepth;
      if(depth > ballDepth - 80) depth = ballDepth - 80;
      if(depth < minDepth) depth = minDepth;
      return depth;
    }

    if(profile === PROFILE_CENTRAL_DEFENDER){
      // Central defenders hold the middle and pick up the most dangerous
      // rival instead of chasing the ball around the pitch. They defend a
      // wide zone that goes well past the goal area.
      const mark = markTarget(player, ctx, field, used);
      if(mark){
        x = mark.x; y = mark.y; kind = 'mark';
      } else {
        x = ownGoalX + dir * lineDepth(TACTICS.centralDefenderZoneMin);
        y = clamp(by, goalY - 200, goalY + 200);
        kind = 'line';
      }
    } else if(profile === PROFILE_STRIKER){
      // Pure strikers keep a high line: they barely drop and wait for the
      // counter attack instead of defending deep.
      const highLine = (field.x + field.w / 2) + dir * TACTICS.strikerHighLine;
      x = dir > 0 ? Math.max(bx - dir * 60, highLine) : Math.min(bx - dir * 60, highLine);
      y = goalY + (laneY(lane, field) - goalY) * 0.5;
      kind = 'high';
    } else if(aheadness > 40){
      // The player pushed too far up: come back to the goal side of the ball.
      x = bx - dir * TACTICS.goalSideGap;
      y = lane.side === 'center' ? clamp(by, field.y + 120, field.y + field.h - 120) : laneY(lane, field);
      kind = 'recover';
    } else if(profile === PROFILE_HYBRID){
      // Hybrid defenders step out of their line to press and start the counter.
      x = bx - dir * 150;
      y = lane.isWide ? laneY(lane, field) : (by > goalY ? by - 140 : by + 140);
      kind = 'press';
    } else if(profile === PROFILE_PRESSER){
      // The pressing midfielder hunts the carrier from the middle.
      x = bx - dir * 160;
      y = lane.isWide ? laneY(lane, field) : clamp(by, goalY - 220, goalY + 220);
      kind = 'press';
    } else if(player.role === 'DEF' && !lane.isWide){
      x = ownGoalX + dir * lineDepth(TACTICS.defensiveLineMinDepth);
      y = clamp(by, field.y + 120, field.y + field.h - 120);
      kind = 'line';
    } else if(player.role === 'DEF'){
      x = bx - dir * 220;
      y = laneY(lane, field);
      kind = 'flank';
    } else if(player.role === 'MID'){
      x = bx - dir * 120;
      y = lane.isWide ? laneY(lane, field) : (by > goalY ? by - 140 : by + 140);
      kind = 'screen';
    } else {
      x = bx - dir * 60;
      y = lane.isWide ? laneY(lane, field) : goalY;
      kind = 'press';
    }

    return {
      x: clamp(x, field.x + 40, field.x + field.w - 40),
      y: clamp(y, field.y + 40, field.y + field.h - 40),
      kind: kind
    };
  }

  function assignDefensiveTargets(players, ctx, field){
    const targets = new Map();
    const used = new Set();
    for(let i = 0; i < players.length; i++){
      targets.set(players[i], defensiveTarget(players[i], ctx, field, used));
    }
    relaxSpacing(players, targets, field);
    return targets;
  }

  // --- goalkeeper ----------------------------------------------------------

  // The keeper leaves his line only for a slow ball inside his area.
  function gkClaimTarget(gk, ball, path, field, goalW){
    const dir = gk.team === 'blue' ? 1 : -1;
    const ownGoalX = dir > 0 ? field.x : field.x + field.w;
    const goalY = goalYOf(field);
    const width = (goalW || GOAL_W);
    if(ball.owner) return null;            // the carrier is handled by the press logic
    if(ball.state === 'shot') return null;  // shots are handled by the save logic
    if(Math.abs(ball.x - ownGoalX) > TACTICS.gkClaimDepth) return null;
    if(Math.abs(ball.y - goalY) > width / 2 + TACTICS.gkClaimWidth) return null;
    if((ball.z || 0) > 30) return null;
    const speed = Math.hypot(ball.vx || 0, ball.vy || 0);
    if(speed > TACTICS.gkClaimMaxSpeed) return null;
    const reach = reachablePoint(gk, (path && path.points) || []);
    // The keeper only leaves his line when he can realistically get there.
    if(reach.eta > TACTICS.gkClaimMaxEta) return null;
    return { x: reach.point.x, y: reach.point.y, kind: 'claim' };
  }

  return {
    TACTICS: TACTICS,
    HOLD_LINE_KEYS: HOLD_LINE_KEYS,
    PROFILES: PROFILES,
    profileOf: profileOf,
    playerLane: playerLane,
    laneY: laneY,
    holdsLine: holdsLine,
    behindBall: behindBall,
    predictBallPath: predictBallPath,
    estimateMaxSpeed: estimateMaxSpeed,
    reachablePoint: reachablePoint,
    shotPassesNear: shotPassesNear,
    chooseLooseBallRoles: chooseLooseBallRoles,
    supportTarget: supportTarget,
    assignSupportTargets: assignSupportTargets,
    defensiveTarget: defensiveTarget,
    assignDefensiveTargets: assignDefensiveTargets,
    markTarget: markTarget,
    gkClaimTarget: gkClaimTarget
  };
});
