(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLMqtt = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Minimal MQTT 3.1.1 client over WebSocket. It is only used as a fallback
  // relay when the direct WebRTC path is blocked by the network (symmetric
  // NAT, corporate firewall, mobile carrier NAT). Both peers only need to
  // reach a public MQTT broker over TLS on port 443/8084/8884.
  const PACKET_CONNECT = 1;
  const PACKET_CONNACK = 2;
  const PACKET_PUBLISH = 3;
  const PACKET_SUBSCRIBE = 8;
  const PACKET_SUBACK = 9;
  const PACKET_PINGREQ = 12;
  const PACKET_PINGRESP = 13;
  const PACKET_DISCONNECT = 14;

  const DEFAULT_BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt'
  ];

  const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

  function bytesOf(text) {
    if (encoder) return encoder.encode(text);
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
    return out;
  }

  function concatBytes() {
    let total = 0;
    for (let i = 0; i < arguments.length; i++) total += arguments[i].length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (let i = 0; i < arguments.length; i++) {
      out.set(arguments[i], offset);
      offset += arguments[i].length;
    }
    return out;
  }

  function encodeLength(value) {
    const bytes = [];
    let remaining = Math.max(0, Math.floor(value));
    do {
      let digit = remaining % 128;
      remaining = Math.floor(remaining / 128);
      if (remaining > 0) digit |= 0x80;
      bytes.push(digit);
    } while (remaining > 0);
    return bytes;
  }

  function encodeString(text) {
    const raw = bytesOf(String(text == null ? '' : text));
    const out = new Uint8Array(2 + raw.length);
    out[0] = (raw.length >> 8) & 0xff;
    out[1] = raw.length & 0xff;
    out.set(raw, 2);
    return out;
  }

  function buildPacket(type, body) {
    const payload = body || new Uint8Array(0);
    const header = new Uint8Array(1 + encodeLength(payload.length).length);
    header[0] = type;
    const lengthBytes = encodeLength(payload.length);
    header.set(lengthBytes, 1);
    return concatBytes(header, payload);
  }

  function buildConnect(clientId, options) {
    const opts = options || {};
    const parts = [];
    parts.push(encodeString('MQTT'));
    const flags = new Uint8Array([4, 0x02]); // protocol level 4, clean session
    if (opts.willTopic) flags[1] |= 0x04 | 0x08; // will flag + will QoS 1
    if (opts.willTopic && opts.willRetain) flags[1] |= 0x20;
    if (opts.username) flags[1] |= 0x80;
    if (opts.password) flags[1] |= 0x40;
    parts.push(flags);
    const keepAlive = Math.max(0, Math.floor((Number(opts.keepAlive) || 45) / 1000));
    parts.push(new Uint8Array([(keepAlive >> 8) & 0xff, keepAlive & 0xff]));
    parts.push(encodeString(clientId));
    if (opts.willTopic) {
      parts.push(encodeString(opts.willTopic));
      parts.push(encodeString(opts.willPayload || ''));
    }
    if (opts.username) parts.push(encodeString(opts.username));
    if (opts.password) parts.push(encodeString(opts.password));
    return buildPacket(PACKET_CONNECT << 4, concatBytes.apply(null, parts));
  }

  function buildSubscribe(packetId, topics) {
    const parts = [new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff])];
    (topics || []).forEach(function(topic) {
      parts.push(encodeString(topic));
      parts.push(new Uint8Array([1])); // QoS 1
    });
    return buildPacket((PACKET_SUBSCRIBE << 4) | 0x02, concatBytes.apply(null, parts));
  }

  function buildPublish(topic, payload, retain) {
    const body = concatBytes(encodeString(topic), bytesOf(payload == null ? '' : payload));
    return buildPacket((PACKET_PUBLISH << 4) | (retain ? 0x01 : 0x00), body);
  }

  function buildPingReq() {
    return new Uint8Array([PACKET_PINGREQ << 4, 0]);
  }

  function buildDisconnect() {
    return new Uint8Array([PACKET_DISCONNECT << 4, 0]);
  }

  // Splits a byte stream into MQTT packets. Returns the parsed packets plus
  // the bytes that belong to an incomplete packet.
  function decodePackets(buffer) {
    const packets = [];
    let offset = 0;
    while (offset < buffer.length) {
      const type = buffer[offset];
      let multiplier = 1;
      let length = 0;
      let index = offset + 1;
      let digit;
      do {
        if (index >= buffer.length) return { packets: packets, rest: buffer.slice(offset) };
        digit = buffer[index++];
        length += (digit & 127) * multiplier;
        multiplier *= 128;
        if (multiplier > 128 * 128 * 128) return { packets: packets, rest: new Uint8Array(0) };
      } while (digit & 128);
      if (index + length > buffer.length) return { packets: packets, rest: buffer.slice(offset) };
      packets.push({ type: type, body: buffer.slice(index, index + length) });
      offset = index + length;
    }
    return { packets: packets, rest: new Uint8Array(0) };
  }

  function decodeString(bytes, offset) {
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    const end = offset + 2 + length;
    let text = '';
    if (typeof TextDecoder !== 'undefined') {
      text = new TextDecoder().decode(bytes.slice(offset + 2, end));
    } else {
      for (let i = offset + 2; i < end; i++) text += String.fromCharCode(bytes[i]);
    }
    return { text: text, next: end };
  }

  function createMqttClient(runtime) {
    const opts = runtime || {};
    const win = opts.window || (typeof window !== 'undefined' ? window : null);
    const WebSocketCtor = opts.WebSocket || (win && win.WebSocket) ||
      (typeof WebSocket !== 'undefined' ? WebSocket : null);
    const brokers = opts.brokers && opts.brokers.length ? opts.brokers.slice() : DEFAULT_BROKERS.slice();
    const clientId = String(opts.clientId || ('bl-' + Math.random().toString(36).slice(2, 12)));
    const keepAliveMs = Math.max(5000, Number(opts.keepAliveMs) || 45000);
    const onMessage = typeof opts.onMessage === 'function' ? opts.onMessage : function() {};
    const onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : function() {};
    const onError = typeof opts.onError === 'function' ? opts.onError : function() {};

    let socket = null;
    let buffer = new Uint8Array(0);
    let connected = false;
    let closed = false;
    let brokerIndex = 0;
    let packetId = 0;
    let pingTimer = null;
    let retryTimer = null;
    let attempts = 0;
    const subscriptions = [];

    function emitStatus(status, detail) {
      onStatus(status, detail || null);
    }

    function clearTimers() {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    }

    function nextPacketId() {
      packetId = (packetId + 1) & 0xffff;
      return packetId || 1;
    }

    function send(bytes) {
      if (!socket || socket.readyState !== 1) return false;
      try {
        socket.send(bytes);
        return true;
      } catch (error) {
        return false;
      }
    }

    function subscribeAll() {
      if (!connected || !subscriptions.length) return;
      send(buildSubscribe(nextPacketId(), subscriptions));
    }

    function handlePacket(packet) {
      const type = packet.type >> 4;
      if (type === PACKET_CONNACK) {
        const code = packet.body[1];
        if (code !== 0) {
          emitStatus('error', { code: 'mqtt-connack-' + code });
          try { socket && socket.close(); } catch (error) {}
          return;
        }
        connected = true;
        attempts = 0;
        subscribeAll();
        emitStatus('open', { broker: brokers[brokerIndex] });
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(function() { send(buildPingReq()); }, Math.floor(keepAliveMs / 2));
        // Node keeps the process alive for pending timers; the browser does not
        // need this, but it makes the module testable.
        if (pingTimer && typeof pingTimer.unref === 'function') pingTimer.unref();
        return;
      }
      if (type === PACKET_PUBLISH) {
        const topic = decodeString(packet.body, 0);
        const payload = packet.body.slice(topic.next);
        let text = '';
        if (typeof TextDecoder !== 'undefined') text = new TextDecoder().decode(payload);
        else for (let i = 0; i < payload.length; i++) text += String.fromCharCode(payload[i]);
        onMessage(topic.text, text);
        return;
      }
      if (type === PACKET_SUBACK) return;
      if (type === PACKET_PINGRESP) return;
    }

    function handleData(data) {
      let bytes;
      if (data instanceof Uint8Array) bytes = data;
      else if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) bytes = new Uint8Array(data);
      else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      else if (typeof data === 'string') bytes = bytesOf(data);
      else return;
      buffer = concatBytes(buffer, bytes);
      const parsed = decodePackets(buffer);
      buffer = parsed.rest;
      parsed.packets.forEach(handlePacket);
    }

    function openBroker(index) {
      if (closed) return;
      const url = brokers[index % brokers.length];
      if (!url) {
        emitStatus('error', { code: 'mqtt-no-broker' });
        return;
      }
      brokerIndex = index % brokers.length;
      emitStatus('connecting', { broker: url });
      try {
        socket = new WebSocketCtor(url, 'mqtt');
      } catch (error) {
        onError({ code: 'mqtt-init-failed', error: error, broker: url });
        retry(index);
        return;
      }
      socket.binaryType = 'arraybuffer';
      socket.onopen = function() {
        send(buildConnect(clientId, {
          keepAlive: keepAliveMs,
          willTopic: opts.willTopic,
          willPayload: opts.willPayload,
          willRetain: opts.willRetain
        }));
      };
      socket.onmessage = function(event) { handleData(event && event.data); };
      socket.onerror = function(event) {
        onError({ code: 'mqtt-socket-error', error: event, broker: url });
      };
      socket.onclose = function() {
        const wasConnected = connected;
        connected = false;
        if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
        if (closed) {
          emitStatus('closed');
          return;
        }
        if (wasConnected) emitStatus('disconnected', { broker: url });
        retry(brokerIndex);
      };
    }

    function retry(index) {
      if (closed) return;
      attempts++;
      if (attempts > 6) {
        // Move to the next public broker before giving up.
        attempts = 0;
        openBroker(index + 1);
        return;
      }
      const delay = Math.min(4000, 400 * Math.pow(1.6, attempts - 1));
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(function() { openBroker(index); }, delay);
      if (retryTimer && typeof retryTimer.unref === 'function') retryTimer.unref();
    }

    function connect() {
      if (closed || connected || socket) return;
      openBroker(0);
    }

    function subscribe(topic) {
      if (!topic) return false;
      if (subscriptions.indexOf(topic) === -1) subscriptions.push(topic);
      if (connected) send(buildSubscribe(nextPacketId(), [topic]));
      return true;
    }

    function publish(topic, payload, retain) {
      if (!connected) return false;
      return send(buildPublish(topic, payload, !!retain));
    }

    function close() {
      if (closed) return;
      closed = true;
      clearTimers();
      try {
        if (connected) send(buildDisconnect());
      } catch (error) {}
      connected = false;
      try { if (socket) socket.close(); } catch (error) {}
      socket = null;
      emitStatus('closed');
    }

    return {
      clientId: clientId,
      brokers: brokers,
      connect: connect,
      subscribe: subscribe,
      publish: publish,
      close: close,
      isConnected: function() { return connected; },
      getBroker: function() { return brokers[brokerIndex % brokers.length]; }
    };
  }

  return {
    DEFAULT_BROKERS,
    encodeLength,
    encodeString,
    buildPacket,
    buildConnect,
    buildSubscribe,
    buildPublish,
    buildPingReq,
    buildDisconnect,
    decodePackets,
    decodeString,
    createMqttClient
  };
});
