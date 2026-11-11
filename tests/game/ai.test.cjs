const test = require('node:test');
const assert = require('node:assert/strict');

const BLAI = require('../../public/game/ai.js');
const constants = require('../../public/game/core/constants.js');

const FIELD = constants.FIELD;

function makePlayer(x, y, role, team, homeY, key){
  return {
    x, y,
    role,
    team: team || 'blue',
    speed: 4,
    size: 1,
    heroKey: team === 'red' ? null : (key || null),
    rivalKey: team === 'red' ? (key || null) : null,
    formationHome: { x, y: homeY == null ? y : homeY }
  };
}

function makeContext(overrides){
  return Object.assign({
    attackDir: 1,
    ball: { x: 2100, y: 400, vx: 0, vy: 0, z: 0, state: 'free' },
    carrier: null,
    teammates: [],
    opponents: [],
    goalY: FIELD.y + FIELD.h / 2,
    goalW: constants.GOAL_W,
    field: FIELD
  }, overrides || {});
}

// Blue defends on the left and attacks to the right.
test('wide players are pushed towards the touchline', () => {
  const winger = makePlayer(2100, 400, 'MID', 'blue', FIELD.y + FIELD.h * 0.30);
  winger.tacticalLane = BLAI.playerLane(winger, FIELD);
  const ctx = makeContext();
  const target = BLAI.supportTarget(winger, ctx, FIELD);

  assert.ok(target.y <= FIELD.y + 100, `expected a touchline target, got ${target.y}`);
});

test('central defenders stay behind the ball while the team attacks', () => {
  const defender = makePlayer(2600, 400, 'DEF', 'blue', FIELD.y + FIELD.h * 0.383);
  defender.tacticalLane = BLAI.playerLane(defender, FIELD);
  const ctx = makeContext({ ball: { x: 3000, y: 400, vx: 0, vy: 0, z: 0, state: 'free' } });
  const target = BLAI.supportTarget(defender, ctx, FIELD);

  assert.ok(target.x <= 3000 - 250, `expected the defender behind the ball, got ${target.x}`);
  assert.equal(target.kind, 'rest');
});

test('forwards run beyond the carrier and end up in the box', () => {
  const striker = makePlayer(3000, 400, 'FWD', 'blue', FIELD.y + FIELD.h * 0.325);
  striker.tacticalLane = BLAI.playerLane(striker, FIELD);
  const ctx = makeContext({ ball: { x: 3600, y: 400, vx: 0, vy: 0, z: 0, state: 'free' } });
  const target = BLAI.supportTarget(striker, ctx, FIELD);

  assert.ok(target.x > 3600, `expected the striker ahead of the ball, got ${target.x}`);
  assert.equal(target.kind, 'box');
});

test('the attacking shape keeps two players behind the ball', () => {
  const players = [
    makePlayer(2100, 100, 'FWD', 'blue', FIELD.y + FIELD.h * 0.325),
    makePlayer(2100, 700, 'FWD', 'blue', FIELD.y + FIELD.h * 0.675),
    makePlayer(2100, 240, 'MID', 'blue', FIELD.y + FIELD.h * 0.30),
    makePlayer(2100, 560, 'MID', 'blue', FIELD.y + FIELD.h * 0.70),
    makePlayer(2100, 120, 'DEF', 'blue', FIELD.y + FIELD.h * 0.15),
    makePlayer(2100, 680, 'DEF', 'blue', FIELD.y + FIELD.h * 0.85),
    makePlayer(2100, 306, 'DEF', 'blue', FIELD.y + FIELD.h * 0.383),
    makePlayer(2100, 494, 'DEF', 'blue', FIELD.y + FIELD.h * 0.617)
  ];
  players.forEach(p => { p.tacticalLane = BLAI.playerLane(p, FIELD); });
  const ctx = makeContext({ ball: { x: 3000, y: 400, vx: 0, vy: 0, z: 0, state: 'free' } });
  const targets = BLAI.assignSupportTargets(players, ctx, FIELD);

  let behind = 0;
  for(const p of players){
    const t = targets.get(p);
    if((t.x - 3000) < -60) behind++;
  }
  assert.ok(behind >= 2, `expected at least two players behind the ball, got ${behind}`);
});

test('support targets do not stack on top of each other', () => {
  const players = [
    makePlayer(2100, 240, 'MID', 'blue', FIELD.y + FIELD.h * 0.30),
    makePlayer(2100, 260, 'MID', 'blue', FIELD.y + FIELD.h * 0.30),
    makePlayer(2100, 560, 'MID', 'blue', FIELD.y + FIELD.h * 0.70),
    makePlayer(2100, 580, 'MID', 'blue', FIELD.y + FIELD.h * 0.70)
  ];
  players.forEach(p => { p.tacticalLane = BLAI.playerLane(p, FIELD); });
  const ctx = makeContext({ ball: { x: 2100, y: 400, vx: 0, vy: 0, z: 0, state: 'free' } });
  const targets = BLAI.assignSupportTargets(players, ctx, FIELD);

  for(let i = 0; i < players.length; i++){
    for(let j = i + 1; j < players.length; j++){
      const a = targets.get(players[i]);
      const b = targets.get(players[j]);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(d >= 100, `expected the support targets to spread, got ${d}`);
    }
  }
});

test('a player that pushed too far up comes back to the goal side', () => {
  const fullback = makePlayer(3000, 100, 'DEF', 'blue', FIELD.y + FIELD.h * 0.15);
  fullback.tacticalLane = BLAI.playerLane(fullback, FIELD);
  const ctx = makeContext({ ball: { x: 2000, y: 400, vx: 0, vy: 0, z: 0, state: 'free' } });
  const target = BLAI.defensiveTarget(fullback, ctx, FIELD);

  assert.ok(target.x < 2000, `expected the fullback to recover behind the ball, got ${target.x}`);
  assert.equal(target.kind, 'recover');
});

test('the ball path is predicted in the direction of the ball', () => {
  const ball = { x: 2100, y: 400, vx: 8, vy: 0, z: 0, state: 'free' };
  const path = BLAI.predictBallPath(ball, FIELD, { friction: 0.975, horizon: 1.0, step: 1 / 30 });

  assert.ok(path.points.length > 3);
  assert.ok(path.stop.x > ball.x, 'the prediction must move with the ball');
  assert.ok(path.stop.x < FIELD.x + FIELD.w, 'the prediction must stay inside the field');
});

test('a rolling ball stops inside the field', () => {
  const ball = { x: 400, y: 400, vx: -6, vy: 0, z: 0, state: 'free' };
  const path = BLAI.predictBallPath(ball, FIELD, { friction: 0.975, horizon: 1.2, step: 1 / 30 });

  assert.ok(path.stop.x >= FIELD.x, 'the ball must not leave the pitch');
  assert.ok(path.stop.x < 400, 'the ball must slow down and stop');
});

test('the chaser is the player that reaches the ball first', () => {
  const ball = { x: 2100, y: 400, vx: 10, vy: 0, z: 0, state: 'free' };
  const path = BLAI.predictBallPath(ball, FIELD, { friction: 0.975, horizon: 1.2, step: 1 / 30 });

  // The blue player stands right in front of the ball.
  const inFront = makePlayer(2200, 400, 'MID', 'blue');
  // The red player is closer to the ball but has to run against it.
  const chasing = makePlayer(2060, 400, 'MID', 'red');

  const roles = BLAI.chooseLooseBallRoles([inFront, chasing], path, FIELD);
  assert.ok(roles.chaser, 'a chaser must be selected');
  assert.ok(roles.cover, 'a cover player must be selected');
  assert.notEqual(roles.chaser, roles.cover);
  assert.equal(roles.chaser.team, 'blue', 'the player in front of the ball should win the race');
});

test('the keeper only claims a slow ball inside his area', () => {
  const gk = makePlayer(FIELD.x + 35, FIELD.y + FIELD.h / 2, 'GK', 'blue');
  gk.speed = 3.5;

  const slow = { x: FIELD.x + 150, y: FIELD.y + FIELD.h / 2, vx: 1, vy: 0, z: 0, state: 'free' };
  const claim = BLAI.gkClaimTarget(gk, slow, null, FIELD, constants.GOAL_W);
  assert.ok(claim, 'the keeper must claim a slow ball in the area');

  const fast = { x: FIELD.x + 150, y: FIELD.y + FIELD.h / 2, vx: 14, vy: 0, z: 0, state: 'free' };
  assert.equal(BLAI.gkClaimTarget(gk, fast, null, FIELD, constants.GOAL_W), null);

  const far = { x: FIELD.x + 900, y: FIELD.y + FIELD.h / 2, vx: 1, vy: 0, z: 0, state: 'free' };
  assert.equal(BLAI.gkClaimTarget(gk, far, null, FIELD, constants.GOAL_W), null);
});

test('lanes come from the formation slot', () => {
  const wide = makePlayer(2100, 120, 'DEF', 'blue', FIELD.y + FIELD.h * 0.15);
  const central = makePlayer(2100, 400, 'DEF', 'blue', FIELD.y + FIELD.h * 0.383);

  assert.equal(BLAI.playerLane(wide, FIELD).side, 'top');
  assert.equal(BLAI.playerLane(wide, FIELD).isWide, true);
  assert.equal(BLAI.playerLane(central, FIELD).side, 'center');
  assert.equal(BLAI.playerLane(central, FIELD).isWide, false);
});

test('central defenders mark the most dangerous rival and stay goal side', () => {
  const aiku = makePlayer(3000, 400, 'DEF', 'red', FIELD.y + FIELD.h * 0.15, 'aiku');
  aiku.tacticalLane = BLAI.playerLane(aiku, FIELD);
  const striker = makePlayer(3400, 400, 'FWD', 'blue');
  const ctx = makeContext({
    attackDir: -1,
    ball: { x: 3400, y: 400, vx: 0, vy: 0, z: 0, state: 'free' },
    ownGoalX: FIELD.x + FIELD.w,
    opponents: [striker]
  });
  const target = BLAI.defensiveTarget(aiku, ctx, FIELD);

  assert.equal(target.kind, 'mark');
  assert.ok(target.x > striker.x, 'the defender has to stay between the rival and his goal');
  assert.ok(target.x < FIELD.x + FIELD.w, 'the defender stays inside the pitch');
  // The mark is tight: he does not fall back next to his own keeper.
  assert.ok(target.x - striker.x < 300, `the mark is too deep: ${target.x - striker.x}`);
});

test('a central defender holds a line well outside the goal area', () => {
  const aiku = makePlayer(3000, 400, 'DEF', 'red', FIELD.y + FIELD.h * 0.15, 'aiku');
  aiku.tacticalLane = BLAI.playerLane(aiku, FIELD);
  const ctx = makeContext({
    attackDir: -1,
    ball: { x: 1200, y: 400, vx: 0, vy: 0, z: 0, state: 'free' },
    ownGoalX: FIELD.x + FIELD.w,
    opponents: []
  });
  const target = BLAI.defensiveTarget(aiku, ctx, FIELD);

  assert.equal(target.kind, 'line');
  const depth = Math.abs(target.x - (FIELD.x + FIELD.w));
  assert.ok(depth >= BLAI.TACTICS.centralDefenderZoneMin - 1, `he must not drop inside his zone: ${depth}`);
});

test('the goal area is wide enough for the defence to work', () => {
  assert.ok(constants.SMALL_AREA.w >= 150, 'the small area has to be expanded');
  assert.ok(constants.AREA.w > constants.SMALL_AREA.w, 'the penalty area must be bigger than the goal area');
});

test('a shot that goes near the defender is detected', () => {
  const aiku = makePlayer(3600, 400, 'DEF', 'red', FIELD.y + FIELD.h * 0.15, 'aiku');
  // The shot travels towards the red goal, right in front of Aiku.
  const shot = { x: 3000, y: 380, vx: 10, vy: 0.5, z: 0, state: 'shot' };

  assert.equal(BLAI.shotPassesNear(aiku, shot), true, 'the shot goes straight past him');
});

test('a shot that misses the defender is not detected', () => {
  const aiku = makePlayer(3600, 700, 'DEF', 'red', FIELD.y + FIELD.h * 0.15, 'aiku');
  const shot = { x: 3000, y: 100, vx: 10, vy: 0.5, z: 0, state: 'shot' };

  assert.equal(BLAI.shotPassesNear(aiku, shot), false, 'the shot goes far away from him');
});

test('a shot moving away from the defender is not detected', () => {
  const aiku = makePlayer(3000, 400, 'DEF', 'red', FIELD.y + FIELD.h * 0.15, 'aiku');
  const shot = { x: 3600, y: 400, vx: 10, vy: 0, z: 0, state: 'shot' };

  assert.equal(BLAI.shotPassesNear(aiku, shot), false, 'the ball is already past him');
});

test('a central defender always defends the middle even from a wide slot', () => {
  const aiku = makePlayer(2100, 120, 'DEF', 'red', FIELD.y + FIELD.h * 0.15, 'aiku');
  const lane = BLAI.playerLane(aiku, FIELD);
  assert.equal(lane.side, 'center');
  assert.equal(lane.isWide, false);
});

test('a hybrid defender steps out of his line to press', () => {
  const reo = makePlayer(3000, 400, 'MID', 'red', FIELD.y + FIELD.h * 0.5, 'reo');
  reo.tacticalLane = BLAI.playerLane(reo, FIELD);
  const ctx = makeContext({
    attackDir: -1,
    ball: { x: 2600, y: 400, vx: 0, vy: 0, z: 0, state: 'free' },
    ownGoalX: FIELD.x + FIELD.w
  });
  const target = BLAI.defensiveTarget(reo, ctx, FIELD);

  assert.equal(target.kind, 'press');
  assert.ok(target.x > 2600, 'the hybrid has to step towards the carrier');
});

test('two central defenders do not mark the same rival', () => {
  const aiku = makePlayer(3000, 300, 'DEF', 'red', FIELD.y + FIELD.h * 0.15, 'aiku');
  const karasu = makePlayer(3000, 500, 'DEF', 'red', FIELD.y + FIELD.h * 0.5, 'karasu');
  aiku.tacticalLane = BLAI.playerLane(aiku, FIELD);
  karasu.tacticalLane = BLAI.playerLane(karasu, FIELD);
  const strikerA = makePlayer(3400, 300, 'FWD', 'blue');
  const strikerB = makePlayer(3300, 500, 'FWD', 'blue');
  const ctx = makeContext({
    attackDir: -1,
    ball: { x: 3400, y: 400, vx: 0, vy: 0, z: 0, state: 'free' },
    ownGoalX: FIELD.x + FIELD.w,
    opponents: [strikerA, strikerB]
  });
  const targets = BLAI.assignDefensiveTargets([aiku, karasu], ctx, FIELD);

  const a = targets.get(aiku);
  const k = targets.get(karasu);
  assert.notEqual(a.x, k.x, 'each central defender picks a different rival');
});

test('Karasu plays as a defensive midfielder that holds the middle', () => {
  assert.equal(constants.RIVAL_ROLE_OVERRIDES.karasu, 'MID');
  assert.equal(BLAI.profileOf(makePlayer(0, 0, 'MID', 'red', 0, 'karasu')), 'presser');

  const karasu = makePlayer(2100, 400, 'MID', 'red', FIELD.y + FIELD.h * 0.5, 'karasu');
  karasu.tacticalLane = BLAI.playerLane(karasu, FIELD);
  const ctx = makeContext({ ball: { x: 3000, y: 400, vx: 0, vy: 0, z: 0, state: 'free' } });
  const target = BLAI.supportTarget(karasu, ctx, FIELD);

  assert.equal(target.kind, 'holding');
  assert.ok(target.x < 3000, 'the holding midfielder stays behind the ball');
  assert.ok(Math.abs(target.y - (FIELD.y + FIELD.h / 2)) < 220, 'he stays in the central channel');
});

test('Shidou and Barou keep a high line instead of dropping', () => {
  const shidou = makePlayer(1500, 600, 'FWD', 'red', FIELD.y + FIELD.h * 0.675, 'shidou');
  shidou.tacticalLane = BLAI.playerLane(shidou, FIELD);
  const ctx = makeContext({
    attackDir: -1,
    ball: { x: 3600, y: 400, vx: 0, vy: 0, z: 0, state: 'free' },
    ownGoalX: FIELD.x + FIELD.w
  });
  const target = BLAI.defensiveTarget(shidou, ctx, FIELD);

  assert.equal(target.kind, 'high');
  assert.ok(target.x <= FIELD.x + FIELD.w / 2 - 250, `the striker must not drop deep, got ${target.x}`);
});

test('Aiku can use his ability much more often', () => {
  assert.ok(constants.RIVALS.aiku.activeCooldown <= 2.5, 'the wall has to be available almost always');
});

test('Karasu ability is called Crow Defense', () => {
  assert.equal(constants.RIVALS.karasu.active, 'Crow Defense');
});
