const test = require('node:test');
const assert = require('node:assert/strict');
const transport = require('../public/game/net/transport.js');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class FakeBroadcastChannel {
  static channels = new Map();
  static reset() { FakeBroadcastChannel.channels.clear(); }
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    this.closed = false;
    if (!FakeBroadcastChannel.channels.has(name)) FakeBroadcastChannel.channels.set(name, new Set());
    FakeBroadcastChannel.channels.get(name).add(this);
  }
  postMessage(data) {
    if (this.closed) return;
    const peers = FakeBroadcastChannel.channels.get(this.name) || new Set();
    for (const peer of peers) {
      if (peer === this || peer.closed || !peer.onmessage) continue;
      peer.onmessage({ data: JSON.parse(JSON.stringify(data)) });
    }
  }
  close() {
    this.closed = true;
    const peers = FakeBroadcastChannel.channels.get(this.name);
    if (peers) peers.delete(this);
  }
}

test('room code helpers normalize and generate safe codes', () => {
  const code = transport.generateRoomCode(6, () => 0.42);
  assert.equal(code.length, 6);
  assert.match(code, /^[A-Z0-9]+$/);
  assert.equal(transport.normalizeRoomCode(' ab-cd 12 '), 'ABCD12');
  assert.equal(transport.normalizeRoomCode(null), '');
});

test('broadcast transport connects two peers and forwards messages', () => {
  FakeBroadcastChannel.reset();
  const host = transport.createBroadcastTransport({
    role: 'host',
    roomCode: 'ABC123',
    BroadcastChannel: FakeBroadcastChannel
  });
  const guest = transport.createBroadcastTransport({
    role: 'guest',
    roomCode: 'ABC123',
    BroadcastChannel: FakeBroadcastChannel
  });

  const hostEvents = [];
  const guestEvents = [];
  host.setHandlers({
    onOpen: () => hostEvents.push('open'),
    onMessage: data => hostEvents.push(data)
  });
  guest.setHandlers({
    onOpen: () => guestEvents.push('open'),
    onMessage: data => guestEvents.push(data)
  });

  assert.equal(host.isConnected(), true);
  assert.equal(guest.isConnected(), true);
  assert.deepEqual(hostEvents, ['open']);
  assert.deepEqual(guestEvents, ['open']);

  host.send({ type: 'hello', from: 'host' });
  guest.send({ type: 'ready', from: 'guest', ready: true });
  assert.deepEqual(hostEvents[1], { type: 'ready', from: 'guest', ready: true });
  assert.deepEqual(guestEvents[1], { type: 'hello', from: 'host' });

  host.close();
  guest.close();
});

test('broadcast transport queues messages until the peer is present', () => {
  FakeBroadcastChannel.reset();
  const host = transport.createBroadcastTransport({
    role: 'host',
    roomCode: 'QUEUE1',
    BroadcastChannel: FakeBroadcastChannel
  });
  const received = [];
  host.setHandlers({ onMessage: data => received.push(data) });
  host.send({ type: 'early', from: 'host' });
  assert.equal(received.length, 0);

  const guest = transport.createBroadcastTransport({
    role: 'guest',
    roomCode: 'QUEUE1',
    BroadcastChannel: FakeBroadcastChannel
  });
  guest.setHandlers({ onMessage: data => received.push(data) });
  assert.equal(received.length, 1);
  assert.equal(received[0].type, 'early');
  host.close();
  guest.close();
});

test('peer transport reports a clear error when PeerJS is unavailable', () => {
  const statuses = [];
  const peer = transport.createPeerTransport({
    role: 'host',
    roomCode: 'NOPE01',
    window: {},
    Peer: null
  });
  peer.setHandlers({ onStatus: (status, detail) => statuses.push({ status, detail }) });
  assert.equal(statuses[0].status, 'error');
  assert.equal(statuses[0].detail.code, 'peerjs-missing');
  peer.close();
});

const PEERJS_JSON_LIMIT = 16300;

class FakeConnection {
  constructor(other) {
    this.other = other;
    this.open = false;
    this.handlers = {};
  }
  on(type, callback) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(callback);
  }
  emit(type, data) {
    for (const callback of this.handlers[type] || []) callback(data);
  }
  send(data) {
    if (!this.open) throw new Error('closed');
    const json = JSON.stringify(data);
    // Mirrors PeerJS 1.5.5's JSON channel limit. Without application-level
    // chunking, match snapshots (~25 KB) fail with "message-too-big".
    if (new TextEncoder().encode(json).byteLength >= PEERJS_JSON_LIMIT) {
      throw new Error('Message too big for JSON channel');
    }
    const payload = JSON.parse(json);
    setTimeout(() => this.other.emit('data', payload), 0);
  }
  close() {
    this.open = false;
    this.emit('close');
    if (this.other.open) this.other.close();
  }
}

class FakePeer {
  static peers = new Map();
  static nextId = 0;
  static reset() { FakePeer.peers.clear(); FakePeer.nextId = 0; }
  constructor(idOrOptions, options) {
    this.isHost = typeof idOrOptions === 'string';
    this.id = this.isHost ? idOrOptions : 'guest-' + (++FakePeer.nextId);
    this.handlers = {};
    this.destroyed = false;
    FakePeer.peers.set(this.id, this);
    setTimeout(() => {
      if (!this.destroyed) this.emit('open', this.id);
    }, 0);
  }
  on(type, callback) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(callback);
  }
  emit(type, data) {
    for (const callback of this.handlers[type] || []) callback(data);
  }
  connect(peerId) {
    const host = FakePeer.peers.get(peerId);
    const guestConnection = new FakeConnection(null);
    if (!host || host.destroyed) {
      setTimeout(() => this.emit('error', { type: 'peer-unavailable' }), 0);
      return guestConnection;
    }
    const hostConnection = new FakeConnection(guestConnection);
    guestConnection.other = hostConnection;
    host.emit('connection', hostConnection);
    setTimeout(() => {
      if (hostConnection.open || guestConnection.open) return;
      hostConnection.open = true;
      guestConnection.open = true;
      hostConnection.emit('open');
      guestConnection.emit('open');
    }, 0);
    return guestConnection;
  }
  destroy() {
    this.destroyed = true;
    FakePeer.peers.delete(this.id);
  }
}

test('peer transport connects host and guest through a PeerJS-like broker', async () => {
  FakePeer.reset();
  const host = transport.createPeerTransport({
    role: 'host',
    roomCode: 'PEER01',
    window: {},
    Peer: FakePeer
  });
  const hostReceived = [];
  const guestReceived = [];
  host.setHandlers({
    onMessage: data => hostReceived.push(data),
    onStatus: () => {}
  });

  await wait(10);
  const guest = transport.createPeerTransport({
    role: 'guest',
    roomCode: 'PEER01',
    window: {},
    Peer: FakePeer
  });
  guest.setHandlers({
    onMessage: data => guestReceived.push(data),
    onStatus: () => {}
  });

  await wait(20);
  assert.equal(host.isConnected(), true);
  assert.equal(guest.isConnected(), true);
  host.send({ type: 'hello', from: 'host' });
  guest.send({ type: 'ready', from: 'guest', ready: true });
  await wait(10);
  assert.deepEqual(hostReceived[0], { type: 'ready', from: 'guest', ready: true });
  assert.deepEqual(guestReceived[0], { type: 'hello', from: 'host' });

  host.close();
  guest.close();
});

test('peer transport chunks snapshots larger than the PeerJS JSON limit', async () => {
  FakePeer.reset();
  const host = transport.createPeerTransport({
    role: 'host',
    roomCode: 'PEER02',
    window: {},
    Peer: FakePeer
  });
  const guest = transport.createPeerTransport({
    role: 'guest',
    roomCode: 'PEER02',
    window: {},
    Peer: FakePeer
  });
  const guestReceived = [];
  const statuses = [];
  host.setHandlers({ onStatus: (status, detail) => statuses.push({ status, detail }) });
  guest.setHandlers({
    onMessage: data => guestReceived.push(data),
    onStatus: (status, detail) => statuses.push({ status, detail })
  });

  await wait(20);
  const snapshot = {
    type: 'snapshot',
    from: 'host',
    payload: '"\\ñ'.repeat(8000),
    players: Array.from({ length: 18 }, (_, index) => ({
      id: 'p' + index,
      x: index * 10.5,
      y: index * 7.25,
      name: 'Jugador ' + index
    }))
  };
  assert.equal(host.send(snapshot), true);
  await wait(50);

  assert.equal(guestReceived.length, 1);
  assert.equal(guestReceived[0].type, 'snapshot');
  assert.equal(guestReceived[0].payload, snapshot.payload);
  assert.deepEqual(guestReceived[0].players, snapshot.players);
  assert.equal(statuses.some(entry => entry.status === 'error'), false);

  host.close();
  guest.close();
});
