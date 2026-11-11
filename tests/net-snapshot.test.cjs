const test = require('node:test');
const assert = require('node:assert/strict');
const snapshot = require('../public/game/net/snapshot.js');

class FakePlayer {
  constructor(x, y, team, type, charKey, role) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.team = team;
    this.type = type;
    this.charKey = charKey;
    this.heroKey = team === 'blue' && type === 'hero' ? charKey : null;
    this.rivalKey = team === 'red' && type === 'hero' ? charKey : null;
    this.role = role;
    this.facingAngle = 0;
    this.hasBall = false;
    this.size = 1;
    this.speed = 3.5;
    this.isHuman = false;
    this.isRemoteHuman = false;
    this.crowDefenseTimer = 0;
    this.speedBuff = 1;
    this.aiTarget = { x: 1, y: 2 };
    this.id = null;
  }
}

class FakeBall {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.spin = 0;
    this.state = 'free';
    this.owner = null;
    this.passTarget = null;
    this.lastShooter = null;
    this.lastPasser = null;
    this.lastTouch = null;
    this.rotation = 0;
    this.dribbleOffset = { x: 0, y: 0 };
  }
}

test('serializeMatch captures render state and resolves entity references', () => {
  const host = { players: [], ball: new FakeBall(), stats: { possession: { blue: 4, red: 2 } }, powerups: [] };
  const isagi = new FakePlayer(100, 200, 'blue', 'hero', 'isagi', 'FWD');
  isagi.id = 'b1';
  isagi.isHuman = true;
  isagi.hasBall = true;
  isagi.crowDefenseTimer = 2.5;
  isagi.speedBuff = 1.6;
  const sae = new FakePlayer(300, 400, 'red', 'hero', 'sae', 'MID');
  sae.id = 'r1';
  sae.isRemoteHuman = true;
  host.players.push(isagi, sae);
  host.ball.owner = isagi;
  host.ball.lastShooter = sae;
  host.ball.x = 123;
  host.ball.y = 456;
  host.ball.z = 12;
  host.ball.dribbleOffset = { x: 4, y: -3 };
  host.timeLeft = 88;
  host.scoreBlue = 2;
  host.scoreRed = 1;
  host.paused = true;
  host.goalCelebrating = false;
  host.goalTimer = 0;
  host.stats = { possession: { blue: 10, red: 5 }, shots: { blue: 3, red: 1 } };
  host.powerups = [{ x: 50, y: 60, type: 'speed', life: 12, phase: 0.5, collected: false }];
  host.karasuCrow = { player: sae, x: 10, y: 20, life: 1, maxLife: 1.5, team: 'red' };
  host.nagiSkull = { x: 7, y: 8, z: 9, life: 0.5, maxLife: 1.35 };
  host.shidouAnimActive = true;
  host.shidouAnimTimer = 0.4;
  host.shidouAnimPlayer = isagi;

  const data = snapshot.serializeMatch(host);
  assert.equal(data.timeLeft, 88);
  assert.equal(data.scoreBlue, 2);
  assert.equal(data.scoreRed, 1);
  assert.equal(data.paused, true);
  assert.equal(data.players.length, 2);
  assert.equal(data.players[0].id, 'b1');
  assert.equal(data.players[0].isHuman, true);
  assert.equal(data.players[0].crowDefenseTimer, 2.5);
  assert.equal(data.players[0].speedBuff, 1.6);
  assert.equal(data.players[0].aiTarget, undefined);
  assert.equal(data.ball.ownerId, 'b1');
  assert.equal(data.ball.lastShooterId, 'r1');
  assert.deepEqual(data.ball.dribbleOffset, { x: 4, y: -3 });
  assert.equal(data.karasuCrow.playerId, 'r1');
  assert.equal(data.nagiSkull.z, 9);
  assert.equal(data.shidouAnimPlayerId, 'b1');
  assert.deepEqual(data.stats, host.stats);
  assert.equal(data.powerups[0].type, 'speed');
});

test('applyMatch updates an existing guest state and resolves references', () => {
  const data = {
    timeLeft: 33,
    scoreBlue: 1,
    scoreRed: 2,
    paused: false,
    goalCelebrating: true,
    goalTimer: 1.2,
    cameraShake: 4,
    stats: { possession: { blue: 2, red: 8 } },
    powerups: [{ x: 1, y: 2, type: 'shot', life: 5, phase: 0, collected: false }],
    players: [
      { id: 'b1', x: 11, y: 22, team: 'blue', type: 'hero', charKey: 'isagi', role: 'FWD', isHuman: true, isRemoteHuman: false, hasBall: true, crowDefenseTimer: 0, speedBuff: 1 },
      { id: 'r1', x: 33, y: 44, team: 'red', type: 'hero', charKey: 'sae', role: 'MID', isHuman: false, isRemoteHuman: true, hasBall: false }
    ],
    ball: {
      x: 55, y: 66, z: 7, vx: 1, vy: 2, vz: 3, spin: 4, state: 'owned',
      rotation: 5, ownerId: 'b1', lastShooterId: 'r1', lastPasserId: null,
      passTargetId: null, lastTouchId: 'b1', dribbleOffset: { x: 1, y: 2 }
    },
    karasuCrow: { playerId: 'r1', x: 1, y: 2, life: 1, maxLife: 1.5, team: 'red' },
    nagiSkull: { x: 3, y: 4, z: 5, life: 0.5, maxLife: 1.35 },
    shidouAnimActive: true,
    shidouAnimTimer: 0.2,
    shidouAnimPlayerId: 'b1'
  };
  const guest = { players: [], ball: null, stats: {} };
  snapshot.applyMatch(guest, data, { Player: FakePlayer, Ball: FakeBall });
  assert.equal(guest.players.length, 2);
  assert.equal(guest.players[0].x, 11);
  assert.equal(guest.players[0].hasBall, true);
  assert.equal(guest.players[1].isRemoteHuman, true);
  assert.equal(guest.ball.owner, guest.players[0]);
  assert.equal(guest.ball.lastShooter, guest.players[1]);
  assert.equal(guest.ball.lastTouch, guest.players[0]);
  assert.deepEqual(guest.ball.dribbleOffset, { x: 1, y: 2 });
  assert.equal(guest.timeLeft, 33);
  assert.equal(guest.scoreBlue, 1);
  assert.equal(guest.scoreRed, 2);
  assert.equal(guest.goalCelebrating, true);
  assert.equal(guest.cameraShake, 4);
  assert.deepEqual(guest.stats, data.stats);
  assert.equal(guest.powerups[0].type, 'shot');
  assert.equal(guest.karasuCrow.player, guest.players[1]);
  assert.equal(guest.nagiSkull.z, 5);
  assert.equal(guest.shidouAnimPlayer, guest.players[0]);
});

test('roster helpers recreate the guest lineup with stable ids', () => {
  const players = [
    new FakePlayer(1, 2, 'blue', 'hero', 'isagi', 'FWD'),
    new FakePlayer(3, 4, 'red', 'hero', 'sae', 'MID')
  ];
  players[0].id = 'b1';
  players[0].isHuman = true;
  players[1].id = 'r1';
  players[1].isRemoteHuman = true;
  const roster = snapshot.buildRoster(players);
  assert.deepEqual(roster[0], {
    id: 'b1', team: 'blue', type: 'hero', charKey: 'isagi', role: 'FWD',
    gkName: null, isHuman: true, isRemoteHuman: false
  });
  const recreated = snapshot.createPlayersFromRoster(FakePlayer, roster, 'r1');
  assert.equal(recreated.length, 2);
  assert.equal(recreated[0].id, 'b1');
  assert.equal(recreated[0].isHuman, false);
  assert.equal(recreated[1].id, 'r1');
  assert.equal(recreated[1].isRemoteHuman, true);
});
