(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLNetTransport = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const PRESENCE_TYPE = '__presence__';
  // PeerJS JSON serialization rejects messages whose UTF-8 payload is >=
  // 16,300 bytes (its chunkedMTU). Snapshots are larger than that, so the
  // peer transport splits them into JSON-safe chunks and reassembles them.
  const PEER_JSON_MAX_BYTES = 15000;
  const CHUNK_ID = '__blc';
  const CHUNK_INDEX = '__bli';
  const CHUNK_TOTAL = '__blt';
  const CHUNK_DATA = '__bld';

  function generateRoomCode(length, random) {
    const size = Math.max(4, Math.min(12, Number(length) || 6));
    const rng = typeof random === 'function' ? random : Math.random;
    let code = '';
    for (let i = 0; i < size; i++) {
      code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
    }
    return code;
  }

  function normalizeRoomCode(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 12);
  }

  function createTransport(runtime) {
    const opts = runtime || {};
    const mode = opts.mode === 'broadcast' ? 'broadcast' : 'peer';
    if (mode === 'broadcast') return createBroadcastTransport(opts);
    return createPeerTransport(opts);
  }

  function createPeerTransport(runtime) {
    const opts = runtime || {};
    const win = opts.window || (typeof window !== 'undefined' ? window : null);
    const PeerCtor = opts.Peer || (win && win.Peer);
    const role = opts.role === 'host' ? 'host' : 'guest';
    const roomCode = normalizeRoomCode(opts.roomCode);
    const peerId = 'bluelock-' + roomCode.toLowerCase();
    let peer = null;
    let conn = null;
    let handlers = {};
    let closed = false;
    let connected = false;
    let lastStatus = { status: 'opening', detail: null };
    const queue = [];
    const chunkBuffers = new Map();
    const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    let chunkSequence = 0;

    function byteLength(value) {
      return textEncoder ? textEncoder.encode(value).byteLength : value.length;
    }

    function makeChunk(id, index, total, data) {
      const chunk = {};
      chunk[CHUNK_ID] = id;
      chunk[CHUNK_INDEX] = index;
      chunk[CHUNK_TOTAL] = total;
      chunk[CHUNK_DATA] = data;
      return chunk;
    }

    function splitMessage(message) {
      const json = JSON.stringify(message);
      if (json === undefined || byteLength(json) < PEER_JSON_MAX_BYTES) return null;
      const id = role + '-' + Date.now().toString(36) + '-' + (++chunkSequence).toString(36);
      const parts = [];
      let offset = 0;
      while (offset < json.length) {
        let size = Math.min(6000, json.length - offset);
        let data = json.slice(offset, offset + size);
        let chunk = makeChunk(id, parts.length, 9999, data);
        // JSON escaping (quotes, backslashes, unicode) can make the serialized
        // wrapper larger than the raw chunk. Shrink until PeerJS accepts it.
        while (size > 1 && byteLength(JSON.stringify(chunk)) >= PEER_JSON_MAX_BYTES) {
          size = Math.max(1, Math.floor(size / 2));
          data = json.slice(offset, offset + size);
          chunk = makeChunk(id, parts.length, 9999, data);
        }
        if (byteLength(JSON.stringify(chunk)) >= PEER_JSON_MAX_BYTES) {
          throw new Error('Message cannot be split into PeerJS chunks');
        }
        parts.push(data);
        offset += size;
      }
      return parts.map(function(data, index) {
        return makeChunk(id, index, parts.length, data);
      });
    }

    function sendPayload(message) {
      const chunks = splitMessage(message);
      if (!chunks) {
        conn.send(message);
        return true;
      }
      for (const chunk of chunks) conn.send(chunk);
      return true;
    }

    function handleIncomingData(data) {
      if (!data || typeof data !== 'object' || data[CHUNK_ID] === undefined) {
        if (handlers.onMessage) handlers.onMessage(data);
        return;
      }
      const id = String(data[CHUNK_ID]);
      const index = Number(data[CHUNK_INDEX]);
      const total = Number(data[CHUNK_TOTAL]);
      const chunk = data[CHUNK_DATA];
      if (!Number.isInteger(index) || !Number.isInteger(total) ||
          index < 0 || total <= 0 || index >= total || typeof chunk !== 'string') {
        return;
      }
      let buffer = chunkBuffers.get(id);
      if (!buffer) {
        buffer = { total, parts: new Array(total), received: 0 };
        chunkBuffers.set(id, buffer);
      }
      if (buffer.total !== total) {
        chunkBuffers.delete(id);
        return;
      }
      if (buffer.parts[index] === undefined) {
        buffer.parts[index] = chunk;
        buffer.received++;
      }
      if (buffer.received !== buffer.total) return;
      chunkBuffers.delete(id);
      let message;
      try {
        message = JSON.parse(buffer.parts.join(''));
      } catch (error) {
        emitStatus('error', { code: 'chunk-parse-failed', error });
        return;
      }
      if (handlers.onMessage) handlers.onMessage(message);
    }

    function emitStatus(status, detail) {
      lastStatus = { status, detail: detail || null };
      if (handlers.onStatus) handlers.onStatus(status, detail || null);
    }

    function emitOpen() {
      if (connected || closed) return;
      connected = true;
      emitStatus('connected');
      flush();
      if (handlers.onOpen) handlers.onOpen();
    }

    function flush() {
      while (queue.length) {
        const message = queue.shift();
        try {
          sendPayload(message);
        } catch (error) {
          emitStatus('error', { code: 'send-failed', error });
          break;
        }
      }
    }

    function bindConnection(nextConn) {
      if (!nextConn) return;
      if (conn && conn !== nextConn) {
        try { nextConn.close(); } catch (error) {}
        return;
      }
      conn = nextConn;
      conn.on('open', emitOpen);
      conn.on('data', handleIncomingData);
      conn.on('close', function() {
        connected = false;
        chunkBuffers.clear();
        emitStatus('closed');
        if (!closed && handlers.onClose) handlers.onClose();
      });
      conn.on('error', function(error) {
        emitStatus('error', { code: 'connection-error', error });
        if (handlers.onError) handlers.onError(error);
      });
    }

    if (!PeerCtor) {
      emitStatus('error', { code: 'peerjs-missing' });
    } else if (!roomCode) {
      emitStatus('error', { code: 'invalid-room-code' });
    } else {
      try {
        if (role === 'host') {
          peer = new PeerCtor(peerId, { debug: 0 });
          peer.on('open', function() { emitStatus('waiting'); });
          peer.on('connection', bindConnection);
        } else {
          peer = new PeerCtor({ debug: 0 });
          peer.on('open', function() {
            if (closed) return;
            emitStatus('connecting');
            bindConnection(peer.connect(peerId, { reliable: true, serialization: 'json' }));
          });
        }
        peer.on('error', function(error) {
          const code = (error && error.type) || 'peer-error';
          emitStatus('error', { code, error });
          if (handlers.onError) handlers.onError(error);
        });
      } catch (error) {
        emitStatus('error', { code: 'peer-init-failed', error });
      }
    }

    function send(message) {
      if (closed) return false;
      if (!conn || !connected) {
        queue.push(message);
        return false;
      }
      try {
        sendPayload(message);
        return true;
      } catch (error) {
        emitStatus('error', { code: 'send-failed', error });
        return false;
      }
    }

    function close() {
      if (closed) return;
      closed = true;
      connected = false;
      chunkBuffers.clear();
      try { if (conn) conn.close(); } catch (error) {}
      try { if (peer) peer.destroy(); } catch (error) {}
      emitStatus('closed');
      if (handlers.onClose) handlers.onClose();
    }

    function setHandlers(next) {
      handlers = next || {};
      if (handlers.onStatus) handlers.onStatus(lastStatus.status, lastStatus.detail);
      if (connected && handlers.onOpen) handlers.onOpen();
    }

    return {
      mode: 'peer',
      role,
      roomCode,
      peerId,
      send,
      close,
      setHandlers,
      isConnected: function() { return connected && !closed; },
      getStatus: function() { return lastStatus.status; }
    };
  }

  function createBroadcastTransport(runtime) {
    const opts = runtime || {};
    const win = opts.window || (typeof window !== 'undefined' ? window : null);
    const BroadcastChannelCtor = opts.BroadcastChannel || (win && win.BroadcastChannel);
    const role = opts.role === 'host' ? 'host' : 'guest';
    const roomCode = normalizeRoomCode(opts.roomCode);
    const channelName = 'bluelock-room-' + roomCode;
    let channel = null;
    let handlers = {};
    let closed = false;
    let connected = false;
    let handlersReady = false;
    let peerPresent = false;
    let peerReady = false;
    let lastStatus = { status: 'opening', detail: null };
    let announceTimer = null;
    const queue = [];

    function emitStatus(status, detail) {
      lastStatus = { status, detail: detail || null };
      if (handlers.onStatus) handlers.onStatus(status, detail || null);
    }

    function emitOpen() {
      if (connected || closed || !handlersReady || !peerPresent || !peerReady) return;
      connected = true;
      emitStatus('connected');
      flush();
      if (handlers.onOpen) handlers.onOpen();
    }

    function flush() {
      while (queue.length) {
        try {
          channel.postMessage(queue.shift());
        } catch (error) {
          emitStatus('error', { code: 'send-failed', error });
          break;
        }
      }
    }

    function announce() {
      if (!channel || closed) return;
      try {
        channel.postMessage({ type: PRESENCE_TYPE, from: role, role, ready: handlersReady });
      } catch (error) {}
    }

    if (!BroadcastChannelCtor) {
      emitStatus('error', { code: 'broadcast-missing' });
    } else if (!roomCode) {
      emitStatus('error', { code: 'invalid-room-code' });
    } else {
      try {
        channel = new BroadcastChannelCtor(channelName);
        channel.onmessage = function(event) {
          const message = event && event.data;
          if (!message || message.from === role) return;
          if (message.type === PRESENCE_TYPE) {
            const wasPresent = peerPresent;
            const wasReady = peerReady;
            peerPresent = true;
            peerReady = !!message.ready;
            if (handlersReady && (!wasPresent || (!wasReady && peerReady))) announce();
            emitOpen();
            return;
          }
          if (handlers.onMessage) handlers.onMessage(message);
        };
        emitStatus('waiting');
        announce();
        // Re-announce a couple of times so a tab opened at the same instant is
        // still discovered even if the first presence message is missed.
        if (typeof setTimeout === 'function') {
          announceTimer = setTimeout(function() {
            announce();
            announceTimer = setTimeout(announce, 300);
          }, 80);
        }
      } catch (error) {
        emitStatus('error', { code: 'broadcast-init-failed', error });
      }
    }

    function send(message) {
      if (closed || !channel) return false;
      if (!connected) {
        queue.push(message);
        return false;
      }
      try {
        channel.postMessage(message);
        return true;
      } catch (error) {
        emitStatus('error', { code: 'send-failed', error });
        return false;
      }
    }

    function close() {
      if (closed) return;
      closed = true;
      connected = false;
      if (announceTimer) clearTimeout(announceTimer);
      try { if (channel) channel.close(); } catch (error) {}
      emitStatus('closed');
      if (handlers.onClose) handlers.onClose();
    }

    function setHandlers(next) {
      handlers = next || {};
      handlersReady = true;
      if (handlers.onStatus) handlers.onStatus(lastStatus.status, lastStatus.detail);
      if (connected && handlers.onOpen) handlers.onOpen();
      else {
        announce();
        emitOpen();
      }
    }

    return {
      mode: 'broadcast',
      role,
      roomCode,
      send,
      close,
      setHandlers,
      isConnected: function() { return connected && !closed; },
      getStatus: function() { return lastStatus.status; }
    };
  }

  return {
    PRESENCE_TYPE,
    CODE_ALPHABET,
    generateRoomCode,
    normalizeRoomCode,
    createTransport,
    createPeerTransport,
    createBroadcastTransport
  };
});
