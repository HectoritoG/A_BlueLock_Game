const test = require('node:test');
const assert = require('node:assert/strict');
const mqtt = require('../public/game/net/mqtt.js');

function toArray(bytes) {
  return Array.from(bytes);
}

function decodeText(bytes) {
  return new TextDecoder().decode(bytes);
}

class FakeSocket {
  constructor(url, protocol) {
    this.url = url;
    this.protocol = protocol;
    this.sent = [];
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
    FakeSocket.last = this;
  }
  send(data) { this.sent.push(data); }
  close() {
    this.readyState = 3;
    if (this.onclose) this.onclose({ code: 1000 });
  }
  open() {
    this.readyState = 1;
    if (this.onopen) this.onopen();
  }
  receive(bytes) {
    const copy = bytes.slice();
    if (this.onmessage) this.onmessage({ data: copy.buffer });
  }
}

function lastPackets(socket) {
  return socket.sent.map(bytes => {
    const parsed = mqtt.decodePackets(bytes);
    return parsed.packets;
  }).flat();
}

test('mqtt encodes the remaining length with the 7-bit continuation', () => {
  assert.deepEqual(toArray(mqtt.encodeLength(0)), [0]);
  assert.deepEqual(toArray(mqtt.encodeLength(127)), [127]);
  assert.deepEqual(toArray(mqtt.encodeLength(128)), [0x80, 0x01]);
  assert.deepEqual(toArray(mqtt.encodeLength(16383)), [0xff, 0x7f]);
});

test('connect packet uses MQTT 3.1.1 with the clean session flag', () => {
  const bytes = mqtt.buildConnect('bl-test', { keepAlive: 45000 });
  assert.equal(bytes[0], 0x10);
  const parsed = mqtt.decodePackets(bytes);
  assert.equal(parsed.packets.length, 1);
  const body = parsed.packets[0].body;
  const protocol = mqtt.decodeString(body, 0);
  assert.equal(protocol.text, 'MQTT');
  assert.equal(body[protocol.next], 4);
  assert.ok(body[protocol.next + 1] & 0x02, 'clean session flag expected');
  const keepAlive = (body[protocol.next + 2] << 8) | body[protocol.next + 3];
  assert.equal(keepAlive, 45);
  const clientId = mqtt.decodeString(body, protocol.next + 4);
  assert.equal(clientId.text, 'bl-test');
  assert.equal(clientId.next, body.length, 'the client id must be the last field');
});

test('connect packet carries the will topic used for drop detection', () => {
  const bytes = mqtt.buildConnect('bl-test', {
    keepAlive: 45000,
    willTopic: 'bluelock/v1/ABC123/host',
    willPayload: '{"type":"leave"}'
  });
  const parsed = mqtt.decodePackets(bytes);
  const body = parsed.packets[0].body;
  const protocol = mqtt.decodeString(body, 0);
  assert.ok(body[protocol.next + 1] & 0x04, 'will flag expected');
  const clientId = mqtt.decodeString(body, protocol.next + 4);
  assert.equal(clientId.text, 'bl-test');
  const willTopic = mqtt.decodeString(body, clientId.next);
  assert.equal(willTopic.text, 'bluelock/v1/ABC123/host');
  const willPayload = mqtt.decodeString(body, willTopic.next);
  assert.equal(willPayload.text, '{"type":"leave"}');
});

test('publish packets round-trip through the decoder', () => {
  const bytes = mqtt.buildPublish('bluelock/v1/ABC123/host', '{"v":1}', true);
  const parsed = mqtt.decodePackets(bytes);
  assert.equal(parsed.packets.length, 1);
  assert.equal(parsed.packets[0].type, 0x31);
  const topic = mqtt.decodeString(parsed.packets[0].body, 0);
  assert.equal(topic.text, 'bluelock/v1/ABC123/host');
  assert.equal(decodeText(parsed.packets[0].body.slice(topic.next)), '{"v":1}');
});

test('decoder keeps partial packets in the rest buffer', () => {
  const bytes = mqtt.buildPublish('t', 'hello', false);
  const parsed = mqtt.decodePackets(bytes.slice(0, bytes.length - 2));
  assert.equal(parsed.packets.length, 0);
  assert.ok(parsed.rest.length > 0);
  const full = mqtt.decodePackets(bytes);
  assert.equal(full.packets.length, 1);
});

test('client connects, subscribes and publishes through the websocket', () => {
  const client = mqtt.createMqttClient({
    WebSocket: FakeSocket,
    clientId: 'bl-test',
    brokers: ['wss://broker.test/mqtt'],
    onStatus: () => {},
    onMessage: () => {}
  });
  client.subscribe('bluelock/v1/ABC123/guest');
  client.connect();
  const socket = FakeSocket.last;
  assert.equal(socket.url, 'wss://broker.test/mqtt');
  assert.equal(socket.protocol, 'mqtt');
  socket.open();
  // The client sends CONNECT and waits for the CONNACK.
  let packets = lastPackets(socket);
  assert.equal(packets[0].type, 0x10);

  socket.receive(new Uint8Array([0x20, 0x02, 0x00, 0x00]));
  packets = lastPackets(socket);
  assert.ok(packets.some(packet => packet.type === 0x82), 'subscribe expected');
  assert.equal(client.isConnected(), true);

  const delivered = [];
  const publisher = mqtt.createMqttClient({
    WebSocket: FakeSocket,
    clientId: 'bl-test-2',
    brokers: ['wss://broker.test/mqtt'],
    onStatus: () => {},
    onMessage: (topic, payload) => delivered.push({ topic, payload })
  });
  publisher.connect();
  const socket2 = FakeSocket.last;
  socket2.open();
  socket2.receive(new Uint8Array([0x20, 0x02, 0x00, 0x00]));
  publisher.publish('bluelock/v1/ABC123/host', '{"type":"hello"}');
  const publishPackets = lastPackets(socket2).filter(packet => packet.type === 0x30);
  assert.equal(publishPackets.length, 1);
  client.close();
  publisher.close();
});
