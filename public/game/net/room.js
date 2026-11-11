(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./protocol.js'));
  } else {
    root.BLRoom = factory(root.BLNetProtocol);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function(protocol) {
  'use strict';

  const MESSAGE = (protocol && protocol.MESSAGE) || {
    HELLO: 'hello',
    WELCOME: 'welcome',
    READY: 'ready',
    START: 'start',
    INPUT: 'input',
    SNAPSHOT: 'snapshot',
    PAUSE: 'pause',
    END: 'end',
    LEAVE: 'leave'
  };
  const createMessage = (protocol && protocol.createMessage) || function(type, from, payload) {
    return Object.assign({ v: 1, type, from: from || null }, payload || {});
  };

  // Room/session protocol on top of any transport with the same tiny surface.
  // The host is authoritative: the guest only sends input and receives
  // snapshots. This module deliberately knows nothing about rendering or the
  // match state, which keeps it reusable for WebRTC, BroadcastChannel or a
  // future authoritative server transport.
  function createRoomSession(runtime) {
    const opts = runtime || {};
    const transport = opts.transport;
    const role = opts.role === 'host' ? 'host' : 'guest';
    const onEvent = typeof opts.onEvent === 'function' ? opts.onEvent : function() {};
    const localName = String(opts.name || (role === 'host' ? 'Anfitrión' : 'Invitado'));
    const settingsSource = opts.settings || {};
    let remoteName = '';
    let remoteSettings = null;
    let remoteReady = false;
    let localReady = false;
    let started = false;
    let closed = false;
    let status = 'opening';
    let remoteInput = { up: false, down: false, left: false, right: false };
    let remoteActions = [];
    let latestSnapshot = null;
    let lastError = null;

    if (!transport) throw new Error('createRoomSession requires a transport');

    function currentSettings() {
      return typeof settingsSource === 'function' ? settingsSource() : settingsSource;
    }

    function emit(type, payload) {
      try {
        onEvent(Object.assign({ type, role, roomCode: transport.roomCode || '' }, payload || {}));
      } catch (error) {
        // A UI callback must never break the transport event loop.
        if (typeof console !== 'undefined' && console.error) console.error('[BLRoom] event handler failed', error);
      }
    }

    function send(type, payload) {
      if (closed) return false;
      return transport.send(createMessage(type, role, payload));
    }

    function handleOpen() {
      status = 'connected';
      emit('status', { status });
      send(MESSAGE.HELLO, { name: localName, settings: currentSettings() });
    }

    function handleStatus(nextStatus, detail) {
      status = nextStatus;
      if (nextStatus === 'error') lastError = detail || null;
      emit('status', { status: nextStatus, detail: detail || null });
    }

    function handleClose() {
      if (closed) return;
      closed = true;
      status = 'closed';
      emit('leave', { reason: 'transport-closed' });
    }

    function handleMessage(message) {
      if (!message || message.from === role) return;
      const type = message.type;
      if (type === MESSAGE.HELLO) {
        remoteName = String(message.name || (message.from === 'host' ? 'Anfitrión' : 'Invitado'));
        remoteSettings = message.settings || null;
        emit('peer', { name: remoteName, peerRole: message.from, settings: remoteSettings });
        if (role === 'host') {
          send(MESSAGE.WELCOME, { name: localName, settings: currentSettings() });
        }
        return;
      }
      if (type === MESSAGE.WELCOME) {
        remoteName = String(message.name || remoteName || 'Anfitrión');
        remoteSettings = message.settings || remoteSettings;
        emit('welcome', { name: remoteName, peerRole: message.from, settings: remoteSettings });
        return;
      }
      if (type === MESSAGE.READY) {
        remoteReady = !!message.ready;
        emit('ready', { ready: remoteReady });
        return;
      }
      if (type === MESSAGE.START) {
        started = true;
        remoteSettings = message.settings || remoteSettings;
        emit('start', {
          settings: message.settings || null,
          roster: Array.isArray(message.roster) ? message.roster : [],
          localPlayerId: message.localPlayerId || null,
          hostPlayerId: message.hostPlayerId || null,
          guestPlayerId: message.guestPlayerId || null
        });
        return;
      }
      if (type === MESSAGE.INPUT) {
        if (message.input && typeof message.input === 'object') {
          remoteInput = {
            up: !!message.input.up,
            down: !!message.input.down,
            left: !!message.input.left,
            right: !!message.input.right
          };
        }
        if (Array.isArray(message.actions)) {
          remoteActions.push.apply(remoteActions, message.actions.slice(0, 16));
          if (remoteActions.length > 64) remoteActions = remoteActions.slice(-64);
        }
        emit('input', { input: remoteInput, actions: message.actions || [] });
        return;
      }
      if (type === MESSAGE.SNAPSHOT) {
        latestSnapshot = message.snapshot || null;
        emit('snapshot', { snapshot: latestSnapshot });
        return;
      }
      if (type === MESSAGE.PAUSE) {
        emit('pause', { paused: !!message.paused });
        return;
      }
      if (type === MESSAGE.END) {
        emit('end', {
          scoreBlue: Number(message.scoreBlue) || 0,
          scoreRed: Number(message.scoreRed) || 0,
          stats: message.stats || null
        });
        return;
      }
      if (type === MESSAGE.LEAVE) {
        closed = true;
        status = 'closed';
        emit('leave', { reason: 'peer-left' });
      }
    }

    transport.setHandlers({
      onOpen: handleOpen,
      onMessage: handleMessage,
      onClose: handleClose,
      onStatus: handleStatus,
      onError: function(error) {
        emit('error', { error });
      }
    });

    function setReady(ready) {
      localReady = !!ready;
      emit('localReady', { ready: localReady });
      return send(MESSAGE.READY, { ready: localReady });
    }

    function startMatch(payload) {
      const data = payload || {};
      started = true;
      return send(MESSAGE.START, {
        settings: data.settings || currentSettings(),
        roster: data.roster || [],
        localPlayerId: data.localPlayerId || null,
        hostPlayerId: data.hostPlayerId || null,
        guestPlayerId: data.guestPlayerId || null
      });
    }

    function sendInput(input, actions) {
      return send(MESSAGE.INPUT, {
        input: input || { up: false, down: false, left: false, right: false },
        actions: Array.isArray(actions) ? actions.slice(0, 16) : []
      });
    }

    function sendSnapshot(snapshot) {
      return send(MESSAGE.SNAPSHOT, { snapshot });
    }

    function sendPause(paused) {
      return send(MESSAGE.PAUSE, { paused: !!paused });
    }

    function sendEnd(payload) {
      const data = payload || {};
      return send(MESSAGE.END, {
        scoreBlue: Number(data.scoreBlue) || 0,
        scoreRed: Number(data.scoreRed) || 0,
        stats: data.stats || null
      });
    }

    function close() {
      if (closed) return;
      try { send(MESSAGE.LEAVE, {}); } catch (error) {}
      closed = true;
      status = 'closed';
      if (transport.close) transport.close();
    }

    return {
      role,
      roomCode: transport.roomCode || '',
      setReady,
      startMatch,
      sendInput,
      sendSnapshot,
      sendPause,
      sendEnd,
      close,
      getRemoteInput: function() { return remoteInput; },
      consumeRemoteActions: function() {
        const actions = remoteActions;
        remoteActions = [];
        return actions;
      },
      getLatestSnapshot: function() { return latestSnapshot; },
      isMatchStarted: function() { return started; },
      isClosed: function() { return closed; },
      getStatus: function() { return status; },
      getRemoteName: function() { return remoteName; },
      getRemoteSettings: function() { return remoteSettings; },
      getRemoteReady: function() { return remoteReady; },
      getLocalReady: function() { return localReady; },
      getLastError: function() { return lastError; }
    };
  }

  return {
    MESSAGE,
    createRoomSession
  };
});
