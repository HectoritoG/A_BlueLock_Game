const test = require('node:test');
const assert = require('node:assert/strict');

const { createHud } = require('../public/game/ui/hud.js');

function createClassList() {
  const values = new Set();
  return {
    add(name) { values.add(name); },
    remove(name) { values.delete(name); },
    toggle(name, force) {
      if (force === undefined) {
        if (values.has(name)) values.delete(name);
        else values.add(name);
      } else if (force) values.add(name);
      else values.delete(name);
    },
    contains(name) { return values.has(name); }
  };
}

function createElement(id) {
  return {
    id,
    textContent: '',
    innerHTML: '',
    offsetWidth: 0,
    dataset: {},
    style: { setProperty() {}, width: '' },
    classList: createClassList(),
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

function createDocument(ids) {
  const elements = {};
  for (const id of ids) elements[id] = createElement(id);
  return {
    elements,
    getElementById(id) { return elements[id] || null; },
    createElement(tag) { return createElement(tag); }
  };
}

function createHudFixture() {
  const doc = createDocument([
    'scoreBlue', 'scoreRed', 'timer', 'abilityNotif', 'posIndicator',
    'ballOwnerTag', 'possessionBar', 'heroPanel', 'hpName', 'hpPassive',
    'hpActive', 'shotChargeWrap', 'btnShoot', 'shotChargeFill',
    'shotChargePct', 'powerupHud', 'cdFill', 'awFill', 'awName',
    'tackleFill', 'tName'
  ]);
  const G = {
    scoreBlue: 3,
    scoreRed: 2,
    timeLeft: 65,
    stats: { possBlueTime: 30, possRedTime: 30 },
    ball: { x: 100, y: 100, owner: null }
  };
  let activePlayer = null;
  const hud = createHud({
    G,
    HEROES: { isagi: { name: 'ISAGI', passive: 'P', active: 'A', color: '#00d9ff', activeCooldown: 10 } },
    RIVALS: { sae: { name: 'SAE', passive: 'Genius Passer', active: 'Genius Flow', color: '#ff8c00', activeCooldown: 5 } },
    FIELD: { w: 1000 },
    POWERUP_TYPES: {},
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    getActivePlayer: () => activePlayer,
    getMVP: () => null,
    camera: { x: 0, y: 0 },
    document: doc,
    now: () => 1000
  });
  return { doc, G, hud, setActivePlayer(player) { activePlayer = player; } };
}

test('createHud returns the HUD update interface', () => {
  const { hud } = createHudFixture();
  for (const method of [
    'updateScoreUI', 'updateTimerUI', 'updateHeroPanel', 'updateCooldownUI',
    'updateShotChargeUI', 'showAbilityNotif', 'updatePosIndicator',
    'updateBallOwnerTag', 'updatePossessionBar', 'showMatchStats',
    'showPowerupHud', 'updatePowerupHud', 'clearPowerupHud'
  ]) {
    assert.equal(typeof hud[method], 'function');
  }
});

test('score and timer helpers update their DOM elements', () => {
  const { doc, hud } = createHudFixture();

  hud.updateScoreUI();
  assert.equal(doc.elements.scoreBlue.textContent, 3);
  assert.equal(doc.elements.scoreRed.textContent, 2);

  hud.updateTimerUI();
  assert.equal(doc.elements.timer.textContent, '1:05');
  assert.equal(doc.elements.timer.classList.contains('urgent'), false);
});

test('hero panel and cooldown support rival heroes for the guest', () => {
  const { doc, hud, setActivePlayer } = createHudFixture();
  const rival = {
    rivalKey: 'sae', heroKey: null, activeCd: 0, awakening: 100,
    isAwakened: false, tackleCd: 0
  };
  setActivePlayer(rival);
  hud.updateHeroPanel(rival);
  assert.equal(doc.elements.hpName.textContent, 'SAE');
  assert.equal(doc.elements.hpPassive.textContent, 'Genius Passer');
  assert.equal(doc.elements.hpActive.textContent, 'Genius Flow');
  hud.updateCooldownUI();
  assert.equal(doc.elements.cdFill.style.width, '100%');
  assert.equal(doc.elements.awFill.style.width, '100%');
  assert.equal(doc.elements.awName.textContent, '¡DESPERTAR LISTO!');
  assert.equal(doc.elements.tName.textContent, 'TACLEADA LISTA');
});

test('notification and owner tag helpers handle missing owners', () => {
  const { doc, hud } = createHudFixture();

  hud.showAbilityNotif('TEST', '#fff');
  assert.equal(doc.elements.abilityNotif.textContent, 'TEST');
  assert.equal(doc.elements.abilityNotif.classList.contains('show'), true);

  hud.updateBallOwnerTag();
  assert.equal(doc.elements.ballOwnerTag.style.opacity, '0');
});
