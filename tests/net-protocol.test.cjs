const test = require('node:test');
const assert = require('node:assert/strict');
const protocol = require('../public/game/net/protocol.js');

test('protocol encodes and decodes versioned messages', () => {
  const message = protocol.createMessage(protocol.MESSAGE.HELLO, 'host', {
    name: 'Héctor',
    settings: { matchId: 'japan' }
  });
  assert.equal(message.v, protocol.PROTOCOL_VERSION);
  assert.equal(message.type, 'hello');
  assert.equal(message.from, 'host');

  const decoded = protocol.decode(protocol.encode(message));
  assert.deepEqual(decoded, message);
  assert.equal(protocol.isMessage(decoded, protocol.MESSAGE.HELLO), true);
});

test('protocol rejects malformed or stale messages', () => {
  assert.equal(protocol.decode('not-json'), null);
  assert.equal(protocol.decode(JSON.stringify({ v: 999, type: 'hello' })), null);
  assert.equal(protocol.decode(JSON.stringify({ v: 1, type: '' })), null);
  assert.equal(protocol.decode(null), null);
});

test('protocol accepts already-parsed objects', () => {
  const message = { v: protocol.PROTOCOL_VERSION, type: 'input', from: 'guest', input: { up: true } };
  assert.deepEqual(protocol.decode(message), message);
  assert.equal(protocol.isMessage(message, 'input'), true);
  assert.equal(protocol.isMessage(message, 'snapshot'), false);
});
