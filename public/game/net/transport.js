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
    const mode = opts.mode || 'peer';
    if (mode === 'broadcast') return createBroadcastTransport(opts);
    if (mode === 'relay') return createRelayTransport(opts);
    if (mode === 'auto') return createAutoTransport(opts);
    return createPeerTransport(opts);
  }

  // Fallback relay over a public MQTT broker (MQTT 3.1.1 over TLS WebSocket).
  // It only needs one outbound HTTPS/WSS connection per player, so it works
  // behind symmetric NATs and strict firewalls where a direct WebRTC data
  // channel cannot be established.
  function createRelayTransport(runtime) {
    const opts = runtime || {};
    const win = opts.window || (typeof window !== 'undefined' ? window : null);
    const createMqttClient = opts.createMqttClient ||
      (win && win.BLMqtt && win.BLMqtt.createMqttClient) ||
      (typeof BLMqtt !== 'undefined' && BLMqtt.createMqttClient);
    const role = opts.role === 'host' ? 'host' : 'guest';
    const roomCode = normalizeRoomCode(opts.roomCode);
    const base = 'bluelock/v1/' + roomCode;
    const ownTopic = base + '/' + role;
    const peerTopic = base + '/' + (role === 'host' ? 'guest' : 'host');
    const leavePayload = JSON.stringify({ v: 1, type: 'leave', from: role });
    let handlers = {};
    let client = null;
    let closed = false;
    let connected = false;
    let lastStatus = { status: 'opening', detail: null };
    let peerSeen = false;
    let lastHello = null;
    let lastRepeat = null;
    let repeatLeft = 0;
    let repeatTimer = null;
    const queue = [];

    function emitStatus(status, detail) {
      lastStatus = { status, detail: detail || null };
      if (handlers.onStatus) handlers.onStatus(status, detail || null);
    }

    function publishHello() {
      if (!connected || !client || !lastHello) return;
      try {
        client.publish(ownTopic, JSON.stringify(lastHello), true);
      } catch (error) {}
    }

    // A public broker can drop a message or a subscriber can join a moment
    // late, so the hello is repeated until the peer answers. The room setup
    // messages are repeated a few times as well; they are idempotent.
    function scheduleRepeats() {
      if (repeatTimer || closed) return;
      repeatTimer = setInterval(function() {
        if (closed) return;
        if (!peerSeen) publishHello();
        if (repeatLeft > 0 && lastRepeat) {
          repeatLeft--;
          try {
            if (connected && client) client.publish(ownTopic, JSON.stringify(lastRepeat), false);
          } catch (error) {}
        }
        if (peerSeen && repeatLeft <= 0 && repeatTimer) { clearInterval(repeatTimer); repeatTimer = null; }
      }, 1500);
      if (repeatTimer && typeof repeatTimer.unref === 'function') repeatTimer.unref();
    }

    function noteMessage(message) {
      if (!message || !message.type) return;
      if (message.type === 'hello') { lastHello = message; peerSeen = false; scheduleRepeats(); return; }
      if (message.type === 'ready' || message.type === 'start') {
        lastRepeat = message;
        repeatLeft = 3;
        scheduleRepeats();
      }
    }

    function flush() {
      while (queue.length && connected && client) {
        const message = queue.shift();
        try {
          const text = JSON.stringify(message);
          // The hello is retained so a peer that joins later still finds us.
          client.publish(ownTopic, text, message && message.type === 'hello');
          noteMessage(message);
        } catch (error) {
          emitStatus('error', { code: 'relay-publish-failed', error: error });
          break;
        }
      }
    }

    function handlePayload(text) {
      let message = null;
      try { message = JSON.parse(text); } catch (error) { return; }
      if (!message || typeof message !== 'object') return;
      peerSeen = true;
      if (handlers.onMessage) handlers.onMessage(message);
    }

    function start() {
      if (closed || client) return;
      if (typeof createMqttClient !== 'function') {
        emitStatus('error', { code: 'mqtt-missing' });
        return;
      }
      client = createMqttClient({
        window: win,
        clientId: 'bl-' + role + '-' + roomCode.toLowerCase() + '-' + Math.random().toString(36).slice(2, 8),
        willTopic: ownTopic,
        willPayload: leavePayload,
        willRetain: false,
        keepAliveMs: 45000,
        onStatus: function(status, detail) {
          if (status === 'open') {
            connected = true;
            emitStatus('connected', detail);
            flush();
            if (handlers.onOpen) handlers.onOpen();
            return;
          }
          if (status === 'error') {
            emitStatus('error', detail);
            if (handlers.onError) handlers.onError(detail);
            return;
          }
          if (status === 'disconnected') {
            connected = false;
            emitStatus('disconnected', detail);
            return;
          }
          if (status === 'closed') {
            connected = false;
            emitStatus('closed');
            if (!closed && handlers.onClose) handlers.onClose();
            return;
          }
          emitStatus(status, detail);
        },
        onMessage: function(topic, text) {
          if (topic !== peerTopic) return;
          handlePayload(text);
        },
        onError: function(error) {
          if (handlers.onError) handlers.onError(error);
        }
      });
      client.subscribe(peerTopic);
      client.connect();
    }

    function send(message) {
      if (closed) return false;
      if (!connected || !client) {
        queue.push(message);
        noteMessage(message);
        return false;
      }
      try {
        const text = JSON.stringify(message);
        client.publish(ownTopic, text, message && message.type === 'hello');
        noteMessage(message);
        return true;
      } catch (error) {
        emitStatus('error', { code: 'relay-send-failed', error: error });
        return false;
      }
    }

    function close() {
      if (closed) return;
      closed = true;
      connected = false;
      if (repeatTimer) { clearInterval(repeatTimer); repeatTimer = null; }
      try {
        // Clear the retained hello so a future guest does not find a ghost.
        if (client && client.isConnected()) client.publish(ownTopic, '', true);
      } catch (error) {}
      try { if (client) client.close(); } catch (error) {}
      client = null;
      emitStatus('closed');
      if (handlers.onClose) handlers.onClose();
    }

    function setHandlers(next) {
      handlers = next || {};
      if (handlers.onStatus) handlers.onStatus(lastStatus.status, lastStatus.detail);
      if (connected && handlers.onOpen) handlers.onOpen();
      else start();
    }

    return {
      mode: 'relay',
      role: role,
      roomCode: roomCode,
      ownTopic: ownTopic,
      peerTopic: peerTopic,
      send: send,
      close: close,
      setHandlers: setHandlers,
      isConnected: function() { return connected && !closed; },
      getStatus: function() { return lastStatus.status; }
    };
  }

  // Hybrid transport: tries the direct WebRTC channel first and transparently
  // falls back to the relay when the network blocks the peer connection.
  function createAutoTransport(runtime) {
    const opts = runtime || {};
    const role = opts.role === 'host' ? 'host' : 'guest';
    const roomCode = normalizeRoomCode(opts.roomCode);
    const fallbackDelayMs = Math.max(1000, Number(opts.fallbackDelayMs) || 12000);
    let handlers = {};
    let closed = false;
    let active = null;
    let opened = false;
    let peer = null;
    let relay = null;
    let fallbackTimer = null;
    const queue = [];
    const lastStatus = { status: 'opening', detail: null };

    function emitStatus(status, detail) {
      lastStatus.status = status;
      lastStatus.detail = detail || null;
      if (handlers.onStatus) handlers.onStatus(status, detail || null);
    }

    function activeChannel() {
      if (active === 'peer') return peer;
      if (active === 'relay') return relay;
      return null;
    }

    function flush() {
      const channel = activeChannel();
      if (!channel) return;
      while (queue.length) {
        const message = queue.shift();
        try { channel.send(message); } catch (error) { queue.push(message); break; }
      }
    }

    function lock(channelName) {
      if (active || closed) return;
      active = channelName;
      if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
      flush();
      if (!opened) {
        opened = true;
        emitStatus('connected', { via: channelName });
        if (handlers.onOpen) handlers.onOpen();
      }
    }

    function handleChannelMessage(channel, message) {
      if (!message || message.from === role) return;
      // Both sides lock onto the channel that carries the first hello, so the
      // host and the guest always end up on the same path.
      if (!active && message.type === 'hello') lock(channel);
      if (active !== channel) return;
      if (handlers.onMessage) handlers.onMessage(message);
    }

    function ensureRelay() {
      if (closed || relay) return;
      relay = createRelayTransport({
        role: role,
        roomCode: roomCode,
        window: opts.window,
        createMqttClient: opts.createMqttClient,
        brokers: opts.brokers
      });
      relay.setHandlers({
        onOpen: function() {
          if (role === 'guest') lock('relay');
        },
        onMessage: function(message) { handleChannelMessage('relay', message); },
        onStatus: function(status, detail) {
          if (status === 'connected') {
            // The relay reached the broker; the peer may still be missing.
            if (role === 'guest') lock('relay');
            else if (!active) emitStatus('relay-ready', detail);
            return;
          }
          if (status === 'error') {
            if (!active) {
              emitStatus('error', detail);
              if (handlers.onError) handlers.onError(detail);
            }
            return;
          }
          if (status === 'closed') {
            if (active === 'relay') {
              emitStatus('closed');
              if (handlers.onClose) handlers.onClose();
            }
            return;
          }
          if (!active) emitStatus(status, detail);
        },
        onClose: function() {
          if (active === 'relay') {
            emitStatus('closed');
            if (handlers.onClose) handlers.onClose();
          }
        },
        onError: function(error) {
          if (!active && handlers.onError) handlers.onError(error);
        }
      });
    }

    peer = createPeerTransport({
      role: role,
      roomCode: roomCode,
      window: opts.window,
      Peer: opts.Peer
    });
    peer.setHandlers({
      onOpen: function() {
        // The guest trusts the channel it opened; the host waits for the
        // hello so both sides pick the same path.
        if (role === 'guest') lock('peer');
      },
      onMessage: function(message) { handleChannelMessage('peer', message); },
      onStatus: function(status, detail) {
        if (status === 'error') {
          // The direct path failed: the relay takes over when allowed.
          if (role === 'guest') ensureRelay();
          return;
        }
        if (status === 'closed' && active === 'peer') {
          if (role === 'guest') ensureRelay();
          return;
        }
        if (!active) emitStatus(status, detail);
      },
      onClose: function() {
        if (active === 'peer' && role === 'guest') ensureRelay();
      },
      onError: function(error) {
        if (role === 'guest') ensureRelay();
        else if (!active && handlers.onError) handlers.onError(error);
      }
    });

    if (role === 'guest') {
      // If the peer connection is not ready in time, use the relay instead.
      fallbackTimer = setTimeout(function() {
        if (!active) ensureRelay();
      }, fallbackDelayMs);
    } else {
      // The host listens on the relay from the start so a guest that cannot
      // do P2P still finds the room.
      ensureRelay();
    }

    function send(message) {
      if (closed) return false;
      const channel = activeChannel();
      if (!channel) {
        queue.push(message);
        return false;
      }
      try { return channel.send(message); } catch (error) { return false; }
    }

    function close() {
      if (closed) return;
      closed = true;
      if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
      try { if (peer) peer.close(); } catch (error) {}
      try { if (relay) relay.close(); } catch (error) {}
      peer = null;
      relay = null;
      emitStatus('closed');
      if (handlers.onClose) handlers.onClose();
    }

    function setHandlers(next) {
      handlers = next || {};
      if (handlers.onStatus) handlers.onStatus(lastStatus.status, lastStatus.detail);
      if (opened && handlers.onOpen) handlers.onOpen();
    }

    return {
      mode: 'auto',
      role: role,
      roomCode: roomCode,
      send: send,
      close: close,
      setHandlers: setHandlers,
      isConnected: function() { return !!active && !closed; },
      getStatus: function() { return lastStatus.status; },
      getActiveChannel: function() { return active; }
    };
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
    createBroadcastTransport,
    createRelayTransport,
    createAutoTransport
  };
});
