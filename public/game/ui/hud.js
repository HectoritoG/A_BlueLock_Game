(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLHud = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // DOM-only HUD helpers. The simulation keeps calling these functions through
  // the aliases created in the main script, so gameplay code stays unchanged.
  function createHud(runtime) {
    const G = runtime.G;
    const HEROES = runtime.HEROES;
    const FIELD = runtime.FIELD;
    const POWERUP_TYPES = runtime.POWERUP_TYPES;
    const clamp = runtime.clamp;
    const getActivePlayer = runtime.getActivePlayer;
    const getMVP = runtime.getMVP;
    const camera = runtime.camera || { x: 0, y: 0 };
    const doc = runtime.document || (typeof document !== 'undefined' ? document : null);
    const now = runtime.now || (() => performance.now());

    function updateScoreUI() {
      if (!doc) return;
      const blue = doc.getElementById('scoreBlue');
      const red = doc.getElementById('scoreRed');
      if (blue) blue.textContent = G.scoreBlue;
      if (red) red.textContent = G.scoreRed;
    }

    function updateTimerUI() {
      if (!doc) return;
      const t = doc.getElementById('timer');
      if (!t) return;
      const m = Math.floor(G.timeLeft / 60);
      const s = Math.floor(G.timeLeft % 60);
      t.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      t.classList.toggle('urgent', G.timeLeft < 30);
    }

    function updateHeroPanel(p) {
      if (!doc || !p || !p.heroKey) return;
      const h = HEROES[p.heroKey];
      if (!h) return;
      const name = doc.getElementById('hpName');
      const passive = doc.getElementById('hpPassive');
      const active = doc.getElementById('hpActive');
      const panel = doc.getElementById('heroPanel');
      if (name) name.textContent = h.name;
      if (passive) passive.textContent = h.passive;
      if (active) active.textContent = h.active;
      if (panel) panel.style.setProperty('--hero-color', h.color);
    }

    function updateCooldownUI() {
      if (!doc) return;
      const p = getActivePlayer();
      if (!p || !p.heroKey) return;
      const h = HEROES[p.heroKey];
      if (!h) return;
      const fill = doc.getElementById('cdFill');
      if (fill) {
        if (p.activeCd > 0) {
          fill.style.width = ((1 - p.activeCd / h.activeCooldown) * 100) + '%';
          fill.classList.add('cooling');
        } else {
          fill.style.width = '100%';
          fill.classList.remove('cooling');
        }
      }
      const awFill = doc.getElementById('awFill');
      const awName = doc.getElementById('awName');
      if (awFill) awFill.style.width = p.awakening + '%';
      if (awName) {
        if (p.awakening >= 100) {
          if (awFill) awFill.classList.add('ready');
          awName.textContent = '¡DESPERTAR LISTO!';
        } else if (p.isAwakened) {
          awName.textContent = '¡DESPIERTO!';
          if (awFill) awFill.classList.remove('ready');
        } else {
          awName.textContent = 'DESPERTAR';
          if (awFill) awFill.classList.remove('ready');
        }
      }
      const tFill = doc.getElementById('tackleFill');
      const tName = doc.getElementById('tName');
      const maxTackleCd = 3.1;
      if (tFill && tName) {
        if (p.tackleCd > 0) {
          tFill.style.width = ((1 - p.tackleCd / maxTackleCd) * 100) + '%';
          tFill.classList.remove('ready');
          tName.textContent = 'CARGANDO...';
        } else {
          tFill.style.width = '100%';
          tFill.classList.add('ready');
          tName.textContent = 'TACLEADA LISTA';
        }
      }
    }

    function updateShotChargeUI() {
      if (!doc) return;
      const p = getActivePlayer();
      const wrap = doc.getElementById('shotChargeWrap');
      const btn = doc.getElementById('btnShoot');
      if (!wrap) return;
      const charging = !!(p && p.shotCharging && p.hasBall);
      wrap.classList.toggle('show', charging);
      if (btn) btn.classList.toggle('charging', charging);
      if (!charging) return;
      const charge = clamp(p.shotCharge || 0, 0, 1);
      const pct = Math.round(charge * 100);
      const fill = doc.getElementById('shotChargeFill');
      const pctEl = doc.getElementById('shotChargePct');
      if (fill) fill.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct >= 100 ? 'MAX' : pct + '%';
      wrap.classList.toggle('full', charge >= 0.999);
    }

    function showAbilityNotif(text, color) {
      if (!doc) return;
      const n = doc.getElementById('abilityNotif');
      if (!n) return;
      n.textContent = text;
      n.style.color = color;
      n.classList.remove('show');
      void n.offsetWidth;
      n.classList.add('show');
    }

    function updatePosIndicator() {
      if (!doc || !G.ball) return;
      const ind = doc.getElementById('posIndicator');
      if (!ind) return;
      const ballZone = G.ball.x / FIELD.w;
      let zone = 'MEDIO CAMPO';
      if (ballZone < 0.25) zone = '◀ DEFENSA AZUL';
      else if (ballZone < 0.45) zone = '◀ MEDIO AZUL';
      else if (ballZone < 0.55) zone = 'CENTRO';
      else if (ballZone < 0.75) zone = 'MEDIO ROJO ▶';
      else zone = 'ATAQUE ROJO ▶';
      ind.textContent = zone;
    }

    function updateBallOwnerTag() {
      if (!doc) return;
      const tag = doc.getElementById('ballOwnerTag');
      if (!tag) return;
      if (G.ball && G.ball.owner) {
        const o = G.ball.owner;
        tag.textContent = `${o.team === 'blue' ? 'BLUE' : 'RED'} · ${o.getName()}`;
        tag.style.background = o.team === 'blue' ? '#00d9ff' : '#ff2e63';
        tag.style.color = '#000';
        tag.style.opacity = '1';
        const sx = o.x - camera.x;
        const sy = o.y - camera.y - 45;
        tag.style.left = sx + 'px';
        tag.style.top = sy + 'px';
        tag.style.transform = 'translateX(-50%)';
      } else {
        tag.style.opacity = '0';
      }
    }

    function updatePossessionBar() {
      if (!doc) return;
      const bar = doc.getElementById('possessionBar');
      if (!bar) return;
      const total = G.stats.possBlueTime + G.stats.possRedTime;
      let bp = 50;
      let rp = 50;
      if (total > 0.1) {
        bp = (G.stats.possBlueTime / total) * 100;
        rp = 100 - bp;
      }
      const blue = bar.querySelector('.blue-pos');
      const red = bar.querySelector('.red-pos');
      if (blue) blue.style.width = bp + '%';
      if (red) red.style.width = rp + '%';
    }

    function setStatBars(blueId, redId, blueVal, redVal) {
      if (!doc) return;
      const total = blueVal + redVal;
      let bp = 50;
      let rp = 50;
      if (total > 0) {
        bp = (blueVal / total) * 100;
        rp = 100 - bp;
      }
      const blue = doc.getElementById(blueId);
      const red = doc.getElementById(redId);
      if (blue) blue.style.width = bp + '%';
      if (red) red.style.width = rp + '%';
    }

    function showMatchStats() {
      if (!doc) return;
      const sp = doc.getElementById('statsPanel');
      if (!sp) return;
      const sb = G.stats.shotsBlue;
      const sr = G.stats.shotsRed;
      const statShotsBlue = doc.getElementById('statShotsBlue');
      const statShotsRed = doc.getElementById('statShotsRed');
      if (statShotsBlue) statShotsBlue.textContent = sb;
      if (statShotsRed) statShotsRed.textContent = sr;
      setStatBars('shotsBlueBar', 'shotsRedBar', sb, sr);
      const total = G.stats.possBlueTime + G.stats.possRedTime;
      let pb = 50;
      let pr = 50;
      if (total > 0.1) {
        pb = Math.round((G.stats.possBlueTime / total) * 100);
        pr = 100 - pb;
      }
      const statPossBlue = doc.getElementById('statPossBlue');
      const statPossRed = doc.getElementById('statPossRed');
      if (statPossBlue) statPossBlue.textContent = pb + '%';
      if (statPossRed) statPossRed.textContent = pr + '%';
      setStatBars('possBlueBar', 'possRedBar', pb, pr);
      const tb = G.stats.tacklesBlue;
      const tr = G.stats.tacklesRed;
      const statTacklesBlue = doc.getElementById('statTacklesBlue');
      const statTacklesRed = doc.getElementById('statTacklesRed');
      if (statTacklesBlue) statTacklesBlue.textContent = tb;
      if (statTacklesRed) statTacklesRed.textContent = tr;
      setStatBars('tacklesBlueBar', 'tacklesRedBar', tb, tr);
      const psb = G.stats.passesBlue;
      const psr = G.stats.passesRed;
      const statPassesBlue = doc.getElementById('statPassesBlue');
      const statPassesRed = doc.getElementById('statPassesRed');
      if (statPassesBlue) statPassesBlue.textContent = psb;
      if (statPassesRed) statPassesRed.textContent = psr;
      setStatBars('passesBlueBar', 'passesRedBar', psb, psr);
      const mvp = getMVP();
      const mvpName = doc.getElementById('mvpName');
      const mvpDetail = doc.getElementById('mvpDetail');
      if (mvp) {
        if (mvpName) mvpName.textContent = mvp.name;
        if (mvpDetail) mvpDetail.textContent = `${mvp.goals}G · ${mvp.shots}D · ${mvp.tackles}T`;
      } else {
        if (mvpName) mvpName.textContent = '—';
        if (mvpDetail) mvpDetail.textContent = 'Sin datos';
      }
      sp.classList.add('show');
    }

    function showPowerupHud(type, duration) {
      if (!doc) return;
      const hud = doc.getElementById('powerupHud');
      if (!hud) return;
      let badge = hud.querySelector('[data-pu="' + type + '"]');
      if (!badge) {
        badge = doc.createElement('div');
        badge.className = 'pu-badge';
        badge.dataset.pu = type;
        badge.innerHTML = '<span class="pu-icon">' + POWERUP_TYPES[type].icon + '</span><span class="pu-text"></span>';
        badge.style.color = POWERUP_TYPES[type].color;
        hud.appendChild(badge);
      }
      badge.classList.add('show');
      badge.dataset.endTime = (now() / 1000 + duration).toString();
    }

    function updatePowerupHud() {
      if (!doc) return;
      const hud = doc.getElementById('powerupHud');
      if (!hud) return;
      const current = now() / 1000;
      hud.querySelectorAll('.pu-badge').forEach(b => {
        const end = parseFloat(b.dataset.endTime);
        const remain = end - current;
        if (remain <= 0) b.classList.remove('show');
        else {
          const text = b.querySelector('.pu-text');
          if (text) text.textContent = remain.toFixed(1) + 's';
        }
      });
    }

    function clearPowerupHud() {
      if (!doc) return;
      const hud = doc.getElementById('powerupHud');
      if (hud) hud.innerHTML = '';
    }

    return {
      updateScoreUI,
      updateTimerUI,
      updateHeroPanel,
      updateCooldownUI,
      updateShotChargeUI,
      showAbilityNotif,
      updatePosIndicator,
      updateBallOwnerTag,
      updatePossessionBar,
      showMatchStats,
      showPowerupHud,
      updatePowerupHud,
      clearPowerupHud
    };
  }

  return { createHud };
});
