const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoomSession, MESSAGE } = require('../public/game/net/room.js');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createFakeTransportPair(roomCode) {
  const endpoints = [];
  function createEndpoint(role) {
    const endpoint = {
      role,
      roomCode,
      handlers: {},
      queue: [],
      closed: false,
      send(message) {
        if (endpoint.closed) return false;
        const other = endpoints.find(item => item !== endpoint);
        if (other && other.handlers.onMessage) {
          const payload = JSON.parse(JSON.stringify(message));
          setTimeout(() => other.handlers.onMessage(payload), 0);
        } else {
          endpoint.queue.push(message);
        }
        return true;
      },
      close() {
        endpoint.closed = true;
        if (endpoint.handlers.onClose) endpoint.handlers.onClose();
      },
      setHandlers(handlers) {
        endpoint.handlers = handlers || {};
        setTimeout(() => {
          if (endpoint.closed) return;
          if (handlers && handlers.onOpen) handlers.onOpen();
          const other = endpoints.find(item => item !== endpoint);
          if (other && other.handlers.onMessage) {
            for (const message of endpoint.queue.splice(0)) {
              setTimeout(() => other.handlers.onMessage(message), 0);
            }
          }
        }, 0);
      }
    };
    endpoints.push(endpoint);
    return endpoint;
  }
  return {
    host: createEndpoint('host'),
    guest: createEndpoint('guest')
  };
}

test('room session performs handshake, readiness, start, input and snapshots', async () => {
  const pair = createFakeTransportPair('ROOM01');
  const hostEvents = [];
  const guestEvents = [];
  const hostRoom = createRoomSession({
    transport: pair.host,
    role: 'host',
    name: 'Héctor',
    settings: { matchId: 'japan', hostHero: 'isagi', guestHero: 'sae' },
    onEvent: event => hostEvents.push(event)
  });
  const guestRoom = createRoomSession({
    transport: pair.guest,
    role: 'guest',
    name: 'Rin',
    settings: { guestHero: 'sae' },
    onEvent: event => guestEvents.push(event)
  });

  await wait(60);
  const hostPeer = hostEvents.find(event => event.type === 'peer');
  assert.ok(hostPeer);
  assert.equal(hostPeer.name, 'Rin');
  const guestPeer = guestEvents.find(event => event.type === 'peer' || event.type === 'welcome');
  assert.ok(guestPeer);
  assert.equal(guestPeer.name, 'Héctor');

  guestRoom.setReady(true);
  await wait(40);
  assert.equal(hostRoom.getRemoteReady(), true);
  assert.ok(hostEvents.some(event => event.type === 'ready' && event.ready === true));

  const settings = { matchId: 'japan', hostHero: 'isagi', guestHero: 'sae' };
  const roster = [
    { id: 'h1', team: 'blue', type: 'hero', charKey: 'isagi', role: 'FWD' },
    { id: 'g1', team: 'red', type: 'hero', charKey: 'sae', role: 'MID' }
  ];
  hostRoom.startMatch({ settings, roster, hostPlayerId: 'h1', guestPlayerId: 'g1', localPlayerId: 'g1' });
  await wait(40);
  const start = guestEvents.find(event => event.type === 'start');
  assert.ok(start);
  assert.deepEqual(start.settings, settings);
  assert.equal(start.localPlayerId, 'g1');
  assert.equal(start.roster.length, 2);

  guestRoom.sendInput({ up: true, left: false, down: false, right: true }, ['pass', 'ability']);
  await wait(40);
  assert.deepEqual(hostRoom.getRemoteInput(), { up: true, down: false, left: false, right: true });
  assert.deepEqual(hostRoom.consumeRemoteActions(), ['pass', 'ability']);
  assert.deepEqual(hostRoom.consumeRemoteActions(), []);

  hostRoom.sendSnapshot({ timeLeft: 42, players: [{ id: 'h1', x: 10 }] });
  await wait(40);
  assert.equal(guestRoom.getLatestSnapshot().timeLeft, 42);

  hostRoom.sendPause(true);
  await wait(40);
  assert.ok(guestEvents.some(event => event.type === 'pause' && event.paused === true));

  hostRoom.sendEnd({ scoreBlue: 1, scoreRed: 0 });
  await wait(40);
  const end = guestEvents.find(event => event.type === 'end');
  assert.ok(end);
  assert.equal(end.scoreBlue, 1);

  guestRoom.close();
  await wait(40);
  assert.equal(guestRoom.isClosed(), true);
  assert.equal(hostRoom.isClosed(), true);
});

test('room session exposes protocol message constants', () => {
  assert.equal(MESSAGE.HELLO, 'hello');
  assert.equal(MESSAGE.SNAPSHOT, 'snapshot');
  assert.equal(MESSAGE.START, 'start');
});
