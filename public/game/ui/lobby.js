(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLLobby = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Private 1v1 lobby. It owns the DOM, the transport and the room session,
  // then hands the live room to the game once both players are ready.
  function createLobby(runtime) {
    const opts = runtime || {};
    const win = opts.window || (typeof window !== 'undefined' ? window : null);
    const doc = opts.document || (typeof document !== 'undefined' ? document : null);
    const G = opts.G || {};
    const MATCHES = opts.MATCHES || {};
    const createTransport = opts.createTransport;
    const createRoomSession = opts.createRoomSession;
    const generateRoomCode = opts.generateRoomCode;
    const normalizeRoomCode = opts.normalizeRoomCode;
    const onHostStart = typeof opts.onHostStart === 'function' ? opts.onHostStart : function() {};
    const onGuestStart = typeof opts.onGuestStart === 'function' ? opts.onGuestStart : function() {};
    const onRoomEvent = typeof opts.onRoomEvent === 'function' ? opts.onRoomEvent : function() {};
    const audio = opts.audio || null;

    let mode = 'host';
    let room = null;
    let transport = null;
    let started = false;
    let hostName = '';
    let guestName = '';
    let remoteName = '';
    let remoteSettings = null;
    let guestReady = false;
    let hostReady = false;
    let currentCode = '';
    let bound = false;

    function el(id) { return doc ? doc.getElementById(id) : null; }
    function show(node) { if (node) node.classList.remove('hidden'); }
    function hide(node) { if (node) node.classList.add('hidden'); }
    function setText(id, text) {
      const node = el(id);
      if (node) node.textContent = text == null ? '' : String(text);
    }
    function setStatus(which, text, tone) {
      const id = which === 'host' ? 'roomHostStatus' : 'roomJoinStatus';
      const node = el(id);
      if (!node) return;
      node.textContent = text || '';
      node.dataset.tone = tone || '';
    }
    function setMode(nextMode) {
      mode = nextMode === 'join' ? 'join' : 'host';
      const hostPanel = el('roomHostPanel');
      const joinPanel = el('roomJoinPanel');
      if (mode === 'host') {
        if (hostPanel) hostPanel.classList.remove('hidden');
        if (joinPanel) joinPanel.classList.add('hidden');
      } else {
        if (hostPanel) hostPanel.classList.add('hidden');
        if (joinPanel) joinPanel.classList.remove('hidden');
      }
      const tabs = doc ? doc.querySelectorAll('.room-tab') : [];
      for (const tab of tabs) tab.classList.toggle('active', tab.dataset.mode === mode);
    }
    function getMatch() {
      return MATCHES[G.selectedMatch] || MATCHES.japan || null;
    }
    function getHostHero() {
      const match = getMatch();
      const select = el('roomHostHero');
      const value = select ? select.value : '';
      if (value) return value;
      return match && match.blueHeroes && match.blueHeroes[0] ? match.blueHeroes[0] : 'isagi';
    }
    function getGuestHero() {
      const match = getMatch();
      const select = el('roomGuestHero');
      const value = select ? select.value : '';
      if (value) return value;
      return match && match.redRivals && match.redRivals[0] ? match.redRivals[0] : 'sae';
    }
    function getHostSettings() {
      return {
        matchId: G.selectedMatch || 'japan',
        difficulty: G.difficulty || 'normal',
        duration: G.matchDuration || 120,
        hostHero: getHostHero(),
        guestHero: (remoteSettings && remoteSettings.guestHero) || getGuestHero(),
        hostName: hostName || 'Anfitrión',
        guestName: remoteName || 'Invitado'
      };
    }
    function getGuestSettings() {
      return {
        guestHero: getGuestHero(),
        guestName: guestName || 'Invitado'
      };
    }
    function fillSelect(id, values, preferred) {
      const select = el(id);
      if (!select) return;
      const previous = preferred || select.value;
      select.innerHTML = '';
      (values || []).forEach(function(key) {
        const option = doc.createElement('option');
        option.value = key;
        option.textContent = key.toUpperCase();
        select.appendChild(option);
      });
      if (!select.options.length) {
        const option = doc.createElement('option');
        option.value = '';
        option.textContent = 'Sin héroes';
        select.appendChild(option);
      }
      if (previous && Array.from(select.options).some(function(option) { return option.value === previous; })) {
        select.value = previous;
      }
    }
    function refreshHeroes() {
      const match = getMatch();
      fillSelect('roomHostHero', match ? match.blueHeroes : [], G.selectedHero);
      fillSelect('roomGuestHero', match ? match.redRivals : [], (remoteSettings && remoteSettings.guestHero) || null);
    }
    function updatePlayers() {
      const hostPlayers = el('roomHostPlayers');
      const joinPlayers = el('roomJoinPlayers');
      if (hostPlayers) {
        hostPlayers.innerHTML = '';
        const self = doc.createElement('div');
        self.className = 'room-player';
        self.textContent = 'Tú: ' + (hostName || 'Anfitrión') + ' (local)';
        hostPlayers.appendChild(self);
        const other = doc.createElement('div');
        other.className = 'room-player' + (remoteName ? ' connected' : '');
        other.textContent = remoteName ? 'Invitado: ' + remoteName : 'Invitado: esperando...';
        hostPlayers.appendChild(other);
      }
      if (joinPlayers) {
        joinPlayers.innerHTML = '';
        const host = doc.createElement('div');
        host.className = 'room-player' + (remoteName ? ' connected' : '');
        host.textContent = remoteName ? 'Anfitrión: ' + remoteName : 'Anfitrión: conectando...';
        joinPlayers.appendChild(host);
        const self = doc.createElement('div');
        self.className = 'room-player';
        self.textContent = 'Tú: ' + (guestName || 'Invitado');
        joinPlayers.appendChild(self);
      }
    }
    function setStartEnabled(enabled) {
      const button = el('roomStartBtn');
      if (button) button.disabled = !enabled;
    }
    function setReadyEnabled(enabled) {
      const button = el('roomReadyBtn');
      if (button) button.disabled = !enabled;
    }
    function setCode(code) {
      currentCode = code || '';
      const box = el('roomCodeBox');
      if (currentCode) show(box); else hide(box);
      setText('roomCodeValue', currentCode);
    }
    function disposeRoom() {
      if (room) {
        try { room.close(); } catch (error) {}
      }
      room = null;
      transport = null;
      guestReady = false;
      hostReady = false;
      remoteName = '';
      remoteSettings = null;
      setStartEnabled(false);
      setReadyEnabled(false);
      setCode('');
      updatePlayers();
    }
    function statusText(status, detail) {
      if (status === 'opening') return 'Creando conexión...';
      if (status === 'waiting') return 'Sala creada. Esperando al invitado...';
      if (status === 'relay-ready') return 'Sala creada y relé listo. Esperando al invitado...';
      if (status === 'connecting') {
        const via = detail && detail.via === 'relay' ? ' (por relé)' : '';
        return 'Conectando con la sala' + via + '...';
      }
      if (status === 'disconnected') return 'Conexión perdida. Reintentando...';
      if (status === 'connected') {
        const via = detail && detail.via === 'relay' ? ' por relé' : '';
        return 'Conectado' + via + '.';
      }
      if (status === 'closed') return 'Conexión cerrada.';
      if (status === 'error') return 'Error de conexión.';
      return status || '';
    }
    function handleRoomEvent(event) {
      if (!event) return;
      onRoomEvent(event);
      if (event.type === 'status') {
        const text = statusText(event.status, event.detail);
        if (mode === 'host') setStatus('host', text, event.status === 'error' ? 'error' : '');
        else setStatus('join', text, event.status === 'error' ? 'error' : '');
        if (event.status === 'connected') {
          const via = event.detail && event.detail.via === 'relay' ? ' por relé' : '';
          if (mode === 'host') setStatus('host', 'Invitado conectado' + via + '.', 'ok');
          else setStatus('join', 'Conectado al anfitrión' + via + '. Pulsa Listo.', 'ok');
        }
        return;
      }
      if (event.type === 'error') {
        const code = event.error && (event.error.code || event.error.type);
        const detail = code ? ' (' + code + ')' : '';
        const message = 'No se pudo conectar' + detail +
          '. Si tu red bloquea el P2P, elegid "Solo relé" en los dos equipos y volved a intentarlo.';
        if (mode === 'host') setStatus('host', message, 'error');
        else setStatus('join', message, 'error');
        return;
      }
      if (event.type === 'peer') {
        remoteName = event.name || remoteName;
        remoteSettings = event.settings || remoteSettings;
        updatePlayers();
        if (mode === 'host') {
          setStatus('host', 'Invitado conectado: ' + remoteName + '. Esperando a que esté listo.', 'ok');
        } else {
          setStatus('join', 'Conectado a ' + remoteName + '. Pulsa Listo.', 'ok');
          setReadyEnabled(true);
        }
        return;
      }
      if (event.type === 'welcome') {
        remoteName = event.name || remoteName;
        remoteSettings = event.settings || remoteSettings;
        updatePlayers();
        if (mode === 'join') {
          setStatus('join', 'Conectado a ' + (remoteName || 'la sala') + '. Pulsa Listo.', 'ok');
          setReadyEnabled(true);
        }
        return;
      }
      if (event.type === 'ready') {
        guestReady = !!event.ready;
        setStartEnabled(mode === 'host' && guestReady && !!room);
        if (mode === 'host') {
          setStatus('host', guestReady ? 'Invitado listo. Puedes iniciar el partido.' : 'Esperando a que el invitado esté listo.', guestReady ? 'ok' : '');
        }
        return;
      }
      if (event.type === 'localReady') {
        hostReady = !!event.ready;
        if (mode === 'join' && hostReady) {
          setReadyEnabled(false);
          setStatus('join', 'Listo. Esperando a que el anfitrión inicie el partido...', 'ok');
        }
        return;
      }
      if (event.type === 'start') {
        if (mode !== 'join' || started) return;
        started = true;
        hide(el('roomModal'));
        setReadyEnabled(false);
        try {
          onGuestStart(Object.assign({}, event, { room }));
        } catch (error) {
          if (win && win.console) win.console.error('[BLLobby] guest start failed', error);
        }
        return;
      }
      if (event.type === 'leave') {
        if (started) return;
        if (mode === 'host') {
          guestReady = false;
          remoteName = '';
          remoteSettings = null;
          setStartEnabled(false);
          updatePlayers();
          setStatus('host', 'El invitado salió. La sala sigue abierta.', 'warn');
        } else {
          setReadyEnabled(false);
          setStatus('join', 'El anfitrión cerró la sala.', 'warn');
        }
        return;
      }
    }
    function createHostRoom() {
      disposeRoom();
      hostName = (el('roomHostName') && el('roomHostName').value.trim()) || 'Anfitrión';
      const transportMode = (el('roomHostTransport') && el('roomHostTransport').value) || 'peer';
      currentCode = generateRoomCode(6);
      setCode(currentCode);
      setStatus('host', 'Creando sala...', '');
      setStartEnabled(false);
      transport = createTransport({
        mode: transportMode,
        role: 'host',
        roomCode: currentCode,
        window: win,
        Peer: win && win.Peer,
        BroadcastChannel: win && win.BroadcastChannel
      });
      room = createRoomSession({
        transport,
        role: 'host',
        name: hostName,
        settings: getHostSettings,
        onEvent: handleRoomEvent
      });
      updatePlayers();
    }
    function joinRoom() {
      disposeRoom();
      guestName = (el('roomJoinName') && el('roomJoinName').value.trim()) || 'Invitado';
      const codeInput = el('roomJoinCode');
      const code = normalizeRoomCode(codeInput ? codeInput.value : '');
      if (code.length < 4) {
        setStatus('join', 'Escribe un código de sala válido.', 'error');
        return;
      }
      const transportMode = (el('roomJoinTransport') && el('roomJoinTransport').value) || 'peer';
      setStatus('join', 'Conectando a la sala ' + code + '...', '');
      setReadyEnabled(false);
      transport = createTransport({
        mode: transportMode,
        role: 'guest',
        roomCode: code,
        window: win,
        Peer: win && win.Peer,
        BroadcastChannel: win && win.BroadcastChannel
      });
      room = createRoomSession({
        transport,
        role: 'guest',
        name: guestName,
        settings: getGuestSettings,
        onEvent: handleRoomEvent
      });
      updatePlayers();
    }
    function startHostMatch() {
      if (!room || !guestReady || started) return;
      started = true;
      const settings = getHostSettings();
      hide(el('roomModal'));
      try {
        onHostStart({ settings, room });
      } catch (error) {
        if (win && win.console) win.console.error('[BLLobby] host start failed', error);
      }
    }
    function copyCode() {
      if (!currentCode) return;
      if (win && win.navigator && win.navigator.clipboard && win.navigator.clipboard.writeText) {
        win.navigator.clipboard.writeText(currentCode).catch(function() {});
      }
      const value = el('roomCodeValue');
      if (value && doc && doc.createRange) {
        try {
          const range = doc.createRange();
          range.selectNodeContents(value);
          const selection = win.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        } catch (error) {}
      }
      if (audio && audio.ui) audio.ui();
    }
    function bind() {
      if (bound || !doc) return;
      bound = true;
      const closeBtn = el('roomCloseBtn');
      if (closeBtn) closeBtn.addEventListener('click', function() { close(); });
      const hostTab = el('roomHostTab');
      const joinTab = el('roomJoinTab');
      if (hostTab) hostTab.addEventListener('click', function() { setMode('host'); });
      if (joinTab) joinTab.addEventListener('click', function() { setMode('join'); });
      const createBtn = el('roomCreateBtn');
      if (createBtn) createBtn.addEventListener('click', createHostRoom);
      const joinBtn = el('roomJoinBtn');
      if (joinBtn) joinBtn.addEventListener('click', joinRoom);
      const startBtn = el('roomStartBtn');
      if (startBtn) startBtn.addEventListener('click', startHostMatch);
      const readyBtn = el('roomReadyBtn');
      if (readyBtn) readyBtn.addEventListener('click', function() {
        if (!room) return;
        setReadyEnabled(false);
        room.setReady(true);
      });
      const copyBtn = el('roomCopyBtn');
      if (copyBtn) copyBtn.addEventListener('click', copyCode);
      const codeInput = el('roomJoinCode');
      if (codeInput) {
        codeInput.addEventListener('input', function() {
          const normalized = normalizeRoomCode(codeInput.value);
          if (codeInput.value !== normalized) codeInput.value = normalized;
        });
      }
      const modal = el('roomModal');
      if (modal) {
        modal.addEventListener('click', function(event) {
          if (event.target === modal) close();
        });
      }
    }
    function open() {
      bind();
      refreshHeroes();
      setMode('host');
      updatePlayers();
      const modal = el('roomModal');
      if (modal) modal.classList.add('show');
      if (audio && audio.ui) audio.ui();
    }
    function close() {
      const modal = el('roomModal');
      if (modal) modal.classList.remove('show');
      if (!started) disposeRoom();
    }
    function destroy() {
      disposeRoom();
      const modal = el('roomModal');
      if (modal) modal.classList.remove('show');
    }

    bind();
    return {
      open,
      close,
      destroy,
      refreshHeroes,
      isOpen: function() { return !!(el('roomModal') && el('roomModal').classList.contains('show')); },
      isStarted: function() { return started; },
      getRoom: function() { return room; },
      getCode: function() { return currentCode; },
      setMode
    };
  }

  return { createLobby };
});
