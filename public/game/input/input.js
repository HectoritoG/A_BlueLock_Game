(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLInput = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Browser input adapter for keyboard and touch controls. Game actions are
  // injected so this module does not need to know about the HUD or audio.
  function createInput(runtime) {
    const opts = runtime || {};
    const G = opts.G;
    const keys = opts.keys;
    const getActivePlayer = opts.getActivePlayer;
    const dist = opts.dist;
    const HEROES = opts.HEROES;
    const actions = opts.actions || {};
    const win = opts.window || (typeof window !== 'undefined' ? window : null);
    const doc = opts.document || (typeof document !== 'undefined' ? document : null);
    const canvas = opts.canvas || (doc ? doc.getElementById('gameCanvas') : null);
    const isMobile = opts.isMobile != null ? !!opts.isMobile : !!(G && G.isMobile);

    function isBlocked() {
      return !G || !G.gameRunning || G.paused;
    }

    function handleKeyDown(e) {
      if (!G || !keys || !e) return;
      keys[e.code] = true;
      if (e.code === 'Escape' && G.gameRunning) {
        if (e.preventDefault) e.preventDefault();
        if (actions.togglePause) actions.togglePause();
        return;
      }
      if (e.code === 'F3') {
        // Debug overlay for the team AI: shows the shape and the ball tracking.
        if (e.preventDefault) e.preventDefault();
        if (actions.toggleDebugAI) actions.toggleDebugAI();
        return;
      }
      if (isBlocked()) return;
      const p = getActivePlayer();
      if (!p) return;
      if (p.kiyoraSpinTimer > 0) return;
      if (e.code === 'KeyQ') {
        if (e.preventDefault) e.preventDefault();
        p.cancelShotCharge();
        if (actions.switchHero) actions.switchHero();
      }
      if (e.code === 'Space') {
        if (e.preventDefault) e.preventDefault();
        p.cancelShotCharge();
        if (p.hasBall && p.nagiCharge <= 0) {
          const target = p.findBestPassTarget();
          if (target) p.doPass(target);
        } else if (p.nagiCharge <= 0) {
          const mates = G.players.filter(m => m.team === p.team && m.hasBall);
          if (mates.length > 0) {
            const mate = mates[0];
            const d = dist(mate, p);
            if (d > 40 && d < 550) mate.doPass(p);
          }
        }
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if (e.preventDefault) e.preventDefault();
        if (!e.repeat && p.hasBall && p.nagiCharge <= 0) p.startShotCharge();
      }
      if (e.code === 'KeyE') {
        if (e.preventDefault) e.preventDefault();
        p.cancelShotCharge();
        if (p.nagiCharge <= 0) p.useAbility();
      }
      if (e.code === 'KeyF') {
        if (e.preventDefault) e.preventDefault();
        p.cancelShotCharge();
        if (!p.hasBall) p.tackle();
      }
      if (e.code === 'KeyR') {
        if (e.preventDefault) e.preventDefault();
        if (p.awakening >= 100 && !p.isAwakened && actions.grantAwakening) {
          actions.grantAwakening(p);
        }
      }
    }

    function handleKeyUp(e) {
      if (!G || !keys || !e) return;
      keys[e.code] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        const p = getActivePlayer();
        if (p && p.shotCharging) {
          if (G.gameRunning && !G.paused) p.releaseShotCharge();
          else p.cancelShotCharge();
        }
      }
    }

    function createListenerRegistry() {
      const cleanups = [];
      function on(target, type, handler, options) {
        if (!target || !target.addEventListener) return;
        target.addEventListener(type, handler, options);
        cleanups.push(() => target.removeEventListener(type, handler, options));
      }
      function addCleanup(fn) {
        if (typeof fn === 'function') cleanups.push(fn);
      }
      function cleanup() {
        while (cleanups.length) {
          const fn = cleanups.pop();
          try { fn(); } catch (e) {}
        }
      }
      return { on, addCleanup, cleanup };
    }

    function setupKeyboard(registry) {
      registry.on(win, 'keydown', handleKeyDown);
      registry.on(win, 'keyup', handleKeyUp);
    }

    function setupMobile(registry) {
      if (!isMobile || !doc || !canvas) return;

      registry.on(canvas, 'touchstart', e => e.preventDefault(), { passive: false });
      registry.on(canvas, 'touchmove', e => e.preventDefault(), { passive: false });

      const jArea = doc.getElementById('joystickArea');
      const jBase = doc.getElementById('joystickBase');
      const jKnob = doc.getElementById('joystickKnob');
      let jTouchId = null;
      const jMaxDist = 43;
      const jDeadzone = 0.2;

      function updateJoystick(touch) {
        if (!jBase || !jKnob) return;
        const rect = jBase.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let dx = touch.clientX - cx;
        let dy = touch.clientY - cy;
        const distance = Math.hypot(dx, dy);
        if (distance > jMaxDist) {
          dx = dx / distance * jMaxDist;
          dy = dy / distance * jMaxDist;
        }
        jKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        if (distance > jMaxDist * jDeadzone) {
          keys['_mW'] = dy < -8;
          keys['_mS'] = dy > 8;
          keys['_mA'] = dx < -8;
          keys['_mD'] = dx > 8;
        } else {
          keys['_mW'] = false;
          keys['_mS'] = false;
          keys['_mA'] = false;
          keys['_mD'] = false;
        }
      }

      registry.on(jArea, 'touchstart', e => {
        e.preventDefault();
        const t = e.changedTouches[0];
        jTouchId = t.identifier;
        updateJoystick(t);
      }, { passive: false });

      registry.on(doc, 'touchmove', e => {
        for (const t of e.changedTouches) {
          if (t.identifier === jTouchId) {
            e.preventDefault();
            updateJoystick(t);
            break;
          }
        }
      }, { passive: false });

      registry.on(doc, 'touchend', e => {
        for (const t of e.changedTouches) {
          if (t.identifier === jTouchId) {
            jTouchId = null;
            if (jKnob) jKnob.style.transform = 'translate(-50%,-50%)';
            keys['_mW'] = false;
            keys['_mS'] = false;
            keys['_mA'] = false;
            keys['_mD'] = false;
            break;
          }
        }
      });

      function mobilePass() {
        if (isBlocked()) return;
        const p = getActivePlayer();
        if (!p || p.kiyoraSpinTimer > 0) return;
        p.cancelShotCharge();
        if (p.hasBall && p.nagiCharge <= 0) {
          const target = p.findBestPassTarget();
          if (target) p.doPass(target);
        } else if (p.nagiCharge <= 0) {
          const mates = G.players.filter(m => m.team === p.team && m.hasBall);
          if (mates.length > 0) {
            const mate = mates[0];
            const d = dist(mate, p);
            if (d > 40 && d < 550) mate.doPass(p);
          }
        }
      }

      function mobileShootStart() {
        if (isBlocked()) return;
        const p = getActivePlayer();
        if (!p || p.kiyoraSpinTimer > 0) return;
        if (p.hasBall && p.nagiCharge <= 0) p.startShotCharge();
      }

      function mobileShootRelease() {
        if (isBlocked()) {
          const p = getActivePlayer();
          if (p) p.cancelShotCharge();
          return;
        }
        const p = getActivePlayer();
        if (!p) return;
        if (p.shotCharging) p.releaseShotCharge();
      }

      function mobileAbility() {
        if (isBlocked()) return;
        const p = getActivePlayer();
        if (!p || p.kiyoraSpinTimer > 0) return;
        p.cancelShotCharge();
        if (p.nagiCharge <= 0) p.useAbility();
      }

      function mobileTackle() {
        if (isBlocked()) return;
        const p = getActivePlayer();
        if (!p || p.kiyoraSpinTimer > 0) return;
        p.cancelShotCharge();
        if (!p.hasBall) p.tackle();
      }

      function mobileAwaken() {
        if (isBlocked()) return;
        const p = getActivePlayer();
        if (!p) return;
        if (p.awakening >= 100 && !p.isAwakened && actions.grantAwakening) {
          actions.grantAwakening(p);
        }
      }

      function addBtnHandler(id, fn) {
        const el = doc.getElementById(id);
        if (!el) return;
        registry.on(el, 'touchstart', e => { e.preventDefault(); fn(); }, { passive: false });
      }

      addBtnHandler('btnPass', mobilePass);
      addBtnHandler('btnAbility', mobileAbility);
      addBtnHandler('btnTackle', mobileTackle);
      addBtnHandler('btnAwaken', mobileAwaken);
      addBtnHandler('btnSwitch', () => { if (actions.switchHero) actions.switchHero(); });

      const shootBtn = doc.getElementById('btnShoot');
      if (shootBtn) {
        registry.on(shootBtn, 'touchstart', e => { e.preventDefault(); mobileShootStart(); }, { passive: false });
        registry.on(shootBtn, 'touchend', e => { e.preventDefault(); mobileShootRelease(); }, { passive: false });
        registry.on(shootBtn, 'touchcancel', e => {
          e.preventDefault();
          const p = getActivePlayer();
          if (p) p.cancelShotCharge();
        }, { passive: false });
      }

      const pauseBtn = doc.getElementById('btnMobilePause');
      if (pauseBtn) {
        registry.on(pauseBtn, 'touchstart', e => {
          e.preventDefault();
          if (G.gameRunning && actions.togglePause) actions.togglePause();
        }, { passive: false });
      }

      const interval = setInterval(() => {
        if (!G.gameRunning) return;
        const p = getActivePlayer();
        if (!p || !p.heroKey) return;
        const h = HEROES[p.heroKey];
        if (!h) return;
        const ability = doc.getElementById('btnAbility');
        if (ability) {
          const cd = p.activeCd > 0 ? (p.activeCd / (p.activeMaxCd || h.activeCooldown)) : 0;
          ability.style.opacity = cd > 0 ? '0.4' : '1';
          ability.style.borderColor = cd > 0 ? 'rgba(255,215,0,.3)' : 'rgba(255,215,0,.6)';
        }
        const tackle = doc.getElementById('btnTackle');
        if (tackle) tackle.style.opacity = p.tackleCd > 0 ? '0.4' : '1';
        const awaken = doc.getElementById('btnAwaken');
        if (awaken) {
          const ready = p.awakening >= 100 || p.isAwakened;
          awaken.style.opacity = ready ? '1' : '0.5';
          awaken.style.boxShadow = ready ? '0 0 15px rgba(255,0,255,.6)' : 'none';
        }
      }, 150);
      registry.addCleanup(() => clearInterval(interval));
    }

    function setup() {
      const registry = createListenerRegistry();
      setupKeyboard(registry);
      setupMobile(registry);
      return registry.cleanup;
    }

    return {
      setup,
      handleKeyDown,
      handleKeyUp,
      isMobile
    };
  }

  return { createInput };
});
