(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLNetProtocol = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Versioned wire format shared by the host and the guest. Keeping the
  // protocol in its own DOM-free module makes it testable in Node and lets a
  // future WebSocket/authoritative server reuse the exact same messages.
  const PROTOCOL_VERSION = 1;

  const MESSAGE = Object.freeze({
    HELLO: 'hello',
    WELCOME: 'welcome',
    READY: 'ready',
    START: 'start',
    INPUT: 'input',
    SNAPSHOT: 'snapshot',
    PAUSE: 'pause',
    END: 'end',
    LEAVE: 'leave',
    PING: 'ping',
    PONG: 'pong'
  });

  function createMessage(type, from, payload) {
    return Object.assign({ v: PROTOCOL_VERSION, type: String(type), from: from || null }, payload || {});
  }

  function encode(message) {
    return JSON.stringify(message);
  }

  function decode(raw) {
    if (raw == null) return null;
    let message = raw;
    if (typeof raw === 'string') {
      try {
        message = JSON.parse(raw);
      } catch (error) {
        return null;
      }
    }
    if (!message || typeof message !== 'object') return null;
    if (message.v !== PROTOCOL_VERSION) return null;
    if (typeof message.type !== 'string' || !message.type) return null;
    return message;
  }

  function isMessage(message, type) {
    return !!message && message.v === PROTOCOL_VERSION && message.type === type;
  }

  return {
    PROTOCOL_VERSION,
    MESSAGE,
    createMessage,
    encode,
    decode,
    isMessage
  };
});
