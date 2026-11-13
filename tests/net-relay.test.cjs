const test = require('node:test');
const assert = require('node:assert/strict');
const transport = require('../public/game/net/transport.js');

function createFakeMqtt() {
  const state = { published: [], subscribed: [], connected: false, options: null };
  const factory = function(options) {
    state.options = options;
    return {
      connect() {
        state.connected = true;
        if (options.onStatus) options.onStatus('open', { broker: 'fake' });
      },
      subscribe(topic) { state.subscribed.push(topic); },
      publish(topic, payload, retain) { state.published.push({ topic, payload, retain }); },
      close() {
        state.connected = false;
        if (options.onStatus) options.onStatus('closed');
      },
      isConnected() { return state.connected; }
    };
  };
  return { factory, state };
}

class FakeConnection {
  constructor() { this.handlers = {}; this.sent = []; }
  on(event, handler) { (this.handlers[event] = this.handlers[event] || []).push(handler); }
  emit(event, payload) { (this.handlers[event] || []).forEach(handler => handler(payload)); }
  send(data) { this.sent.push(data); }
  close() {}
}

class FakePeer {
  constructor(id, options) {
    this.id = id;
    this.options = options;
    this.handlers = {};
    this.connections = [];
    FakePeer.last = this;
  }
  on(event, handler) { (this.handlers[event] = this.handlers[event] || []).push(handler); }
  emit(event, payload) { (this.handlers[event] || []).forEach(handler => handler(payload)); }
  connect(id, options) {
    const conn = new FakeConnection();
    this.connections.push(conn);
    setTimeout(() => conn.emit('error', { type: 'peer-unavailable' }), 0);
    return conn;
  }
  destroy() {}
}

test('relay transport publishes on its own topic and forwards peer messages', () => {
  const { factory, state } = createFakeMqtt();
  const relay = transport.createRelayTransport({
    role: 'host',
    roomCode: 'ABC123',
    createMqttClient: factory
  });
  const received = [];
  let opened = false;
  relay.setHandlers({
    onOpen: () => { opened = true; },
    onMessage: message => received.push(message),
    onStatus: () => {},
    onError: () => {}
  });

  assert.equal(opened, true);
  assert.deepEqual(state.subscribed, ['bluelock/v1/ABC123/guest']);

  relay.send({ v: 1, type: 'hello', from: 'host' });
  assert.equal(state.published.length, 1);
  assert.equal(state.published[0].topic, 'bluelock/v1/ABC123/host');
  assert.equal(state.published[0].retain, true, 'the hello must be retained');

  relay.send({ v: 1, type: 'snapshot', from: 'host', snapshot: { x: 1 } });
  assert.equal(state.published.length, 2);
  assert.equal(state.published[1].retain, false);

  state.options.onMessage('bluelock/v1/ABC123/guest', JSON.stringify({ v: 1, type: 'ready', from: 'guest' }));
  assert.equal(received.length, 1);
  assert.equal(received[0].type, 'ready');
});

test('relay transport repeats the hello until the peer answers', async () => {
  const { factory, state } = createFakeMqtt();
  const relay = transport.createRelayTransport({
    role: 'host',
    roomCode: 'ABC123',
    createMqttClient: factory
  });
  relay.setHandlers({ onMessage: () => {}, onStatus: () => {}, onOpen: () => {}, onError: () => {} });
  relay.send({ v: 1, type: 'hello', from: 'host' });
  assert.equal(state.published.length, 1);
  assert.equal(state.published[0].retain, true);

  // Without an answer the hello is published again so a guest that joins
  // late (or a dropped message) still finds the room.
  await new Promise(resolve => setTimeout(resolve, 1700));
  assert.ok(state.published.length >= 2, 'the hello must be repeated');
  assert.equal(state.published[1].retain, true);

  // Once the peer answers the repetition stops.
  state.options.onMessage('bluelock/v1/ABC123/guest', JSON.stringify({ v: 1, type: 'hello', from: 'guest' }));
  const count = state.published.length;
  await new Promise(resolve => setTimeout(resolve, 1700));
  assert.equal(state.published.length, count, 'the hello must not be repeated any more');
  relay.close();
});

test('auto transport falls back to the relay when the peer connection fails', async () => {
  const { factory, state } = createFakeMqtt();
  const auto = transport.createAutoTransport({
    role: 'guest',
    roomCode: 'ABC123',
    Peer: FakePeer,
    createMqttClient: factory,
    fallbackDelayMs: 20
  });
  const received = [];
  let opened = false;
  auto.setHandlers({
    onOpen: () => { opened = true; },
    onMessage: message => received.push(message),
    onStatus: () => {},
    onError: () => {}
  });

  // The fake peer fails right away, so the guest must switch to the relay.
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.equal(state.connected, true, 'the relay must be connected');
  assert.equal(opened, true, 'the transport must report the connection');

  auto.send({ v: 1, type: 'hello', from: 'guest' });
  assert.ok(state.published.length >= 1);
  assert.equal(state.published[0].topic, 'bluelock/v1/ABC123/guest');

  state.options.onMessage('bluelock/v1/ABC123/host', JSON.stringify({ v: 1, type: 'welcome', from: 'host' }));
  assert.equal(received.length, 1);
  assert.equal(received[0].type, 'welcome');
  auto.close();
});

test('auto transport host locks onto the relay when the guest says hello there', () => {
  const { factory, state } = createFakeMqtt();
  const auto = transport.createAutoTransport({
    role: 'host',
    roomCode: 'ABC123',
    Peer: FakePeer,
    createMqttClient: factory
  });
  const received = [];
  let opened = false;
  auto.setHandlers({
    onOpen: () => { opened = true; },
    onMessage: message => received.push(message),
    onStatus: () => {},
    onError: () => {}
  });

  assert.equal(opened, false, 'the host waits for the peer before locking a channel');
  assert.equal(state.connected, true, 'the host keeps the relay ready');

  state.options.onMessage('bluelock/v1/ABC123/guest', JSON.stringify({ v: 1, type: 'hello', from: 'guest', name: 'Amigo' }));
  assert.equal(opened, true);
  assert.equal(received.length, 1);
  assert.equal(received[0].type, 'hello');

  auto.send({ v: 1, type: 'welcome', from: 'host' });
  assert.equal(state.published.length, 1);
  assert.equal(state.published[0].topic, 'bluelock/v1/ABC123/host');
  auto.close();
});
