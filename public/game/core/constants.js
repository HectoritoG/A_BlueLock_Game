(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLConstants = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const HEROES = {
    isagi: { name:'ISAGI', passive:'Spatial Awareness', active:'Direct Shot', awakenName:'World\'s Best', passiveDesc:'Pases precisos y visión de juego.', activeDesc:'Sin balón: al recibir o con un balón suelto muy cerca, dispara automáticamente al ángulo más abierto y gana velocidad x1.2 mientras esté armado.', awakenDesc:'Dash + mismo disparo automático o tiro directo a balón suelto; muy difícil de atajar y gana velocidad x1.3 mientras esté armado.', color:'#4fc3f7', num:'11', speed:3.9, ballControl:1.3, passPower:1.8, passAccuracy:1.7, shotPower:1.3, shotAccuracy:1.5, size:1.0, dribbleStyle:'calculated', activeDuration:1.0, activeCooldown:11.0, awakenDuration:8.0, rarity:'SR' },
    rin: { name:'RIN', passive:'Precision Striker', active:'Pulverize', awakenName:'Pulverize Curve', passiveDesc:'Disparos potentes y precisos.', activeDesc:'Carga un tiro curvo al palo lejano y ralentiza a todos.', awakenDesc:'Congela el tiempo un instante y remata con un tiro curvo potente.', color:'#2dd4a8', num:'10', speed:4.0, ballControl:1.2, passPower:1.2, passAccuracy:1.2, shotPower:1.7, shotAccuracy:1.7, size:1.0, dribbleStyle:'aggressive', activeDuration:2.0, activeCooldown:9.0, awakenDuration:12.0, rarity:'SSR' },
    nagi: { name:'NAGI', passive:'Perfect Trap', active:'Trap', awakenName:'Genius Trap', passiveDesc:'Control perfecto y 0.5s de inmunidad al recibir el balón.', activeDesc:'Con balón: carga y remata un tiro trampa; si un rival intenta robarte, ejecutas un Fake Volley. Sin balón: dash hacia la pelota; si la atrapas, aturdes rivales cercanos y rematas con Trap Shot.', awakenDesc:'Voleas falsas encadenadas: cada intento de robo ejecuta un Fake Volley; a la 4.ª, remate automático esquinado con Five Stage Volley. Sin balón: dash al balón, aturde y remata con Trap Shot. Sin cooldown hasta el remate.', color:'#b14aed', num:'07', speed:3.6, ballControl:2.5, passPower:1.2, passAccuracy:1.2, shotPower:1.5, shotAccuracy:1.4, size:1.05, dribbleStyle:'sticky', activeDuration:1.5, activeCooldown:8.0, awakenDuration:8.0, rarity:'SSR' },
    bachira: { name:'BACHIRA', passive:'Monster Dribble', active:'Scissors Dribble', awakenName:'Elastic Sombrero', passiveDesc:'Regate impredecible y difícil de tacklear.', activeDesc:'Tijeras que aturden rivales y avanzan. Al activar, elimina efectos de control.', awakenDesc:'Combo invencible e inmune a efectos de control: Tijeras → Elástica → Sombrerito.', color:'#ffd700', num:'08', speed:4.3, ballControl:1.7, passPower:1.2, passAccuracy:1.2, shotPower:1.2, shotAccuracy:1.2, size:1.0, dribbleStyle:'zigzag', activeDuration:2.5, activeCooldown:14.0, awakenDuration:8.0, rarity:'SR' },
    chigiri: { name:'CHIGIRI', passive:'Speed Demon', active:'Light Speed', awakenName:'Lightspeed God', passiveDesc:'El más rápido del campo.', activeDesc:'2.5s de velocidad x1.3 y roba al contacto.', awakenDesc:'Mini dash, velocidad x1.7 y roba el balón al chocar.', color:'#e8365d', num:'22', speed:4.8, ballControl:1.4, passPower:1.2, passAccuracy:1.2, shotPower:1.3, shotAccuracy:1.3, size:0.95, dribbleStyle:'speed', activeDuration:2.5, activeCooldown:19.0, awakenDuration:8.0, rarity:'SR' },
    yukimiya: { name:'YUKIMIYA', passive:'Phantom Dribble', active:'La Boba', awakenName:'Phantom Feint', passiveDesc:'Regate elegante que confunde a los rivales.', activeDesc:'Crea un fantasma, da un dash y es inmune a control; aturde rivales cercanos y gana velocidad x1.2 por 2s.', awakenDesc:'La Boba x3 seguidas con dash e inmunidad a control (0.5s entre cada una y menos distancia), aturde 1.2s y gana velocidad x1.2.', color:'#ffb347', num:'16', speed:4.1, ballControl:1.8, passPower:1.2, passAccuracy:1.2, shotPower:1.3, shotAccuracy:1.3, size:1.0, dribbleStyle:'precise', activeDuration:1.8, activeCooldown:10.0, awakenDuration:8.0, rarity:'R' },
    kurona: { name:'KURONA', passive:'Shark Tackle', active:'Planetary Hotline', awakenName:'Apex Predator', passiveDesc:'Su tacleada DASH tiene mayor alcance.', activeDesc:'Dash + pase perfecto; el aliado hace un dash y te lo devuelve. 3s: agujero negro que ralentiza rivales y roba al chocar.', awakenDesc:'Hotline potenciado: el compañero hace un dash mayor + agujero negro que ralentiza rivales 3s y roba al chocar.', color:'#c27890', num:'23', speed:4.4, ballControl:1.4, passPower:1.2, passAccuracy:1.2, shotPower:1.3, shotAccuracy:1.3, size:0.95, dribbleStyle:'speed', activeDuration:3.0, activeCooldown:11.0, awakenDuration:8.0, rarity:'R' },
    hiori: { name:'HIORI', passive:'AI Network', active:'Cold Pass', awakenName:'System Override', passiveDesc:'Calcula rutas y sus pases curvan automáticamente.', activeDesc:'Pase perfecto que prioriza al jugador humano + ralentiza rivales 1.5s.', awakenDesc:'Pase perfecto + crea un área de copo de nieve celeste: congela rivales 1.5s y los ralentiza 3s.', color:'#00ff88', num:'14', speed:4.0, ballControl:1.6, passPower:2.0, passAccuracy:2.2, shotPower:1.3, shotAccuracy:1.1, size:1.0, dribbleStyle:'tactical', activeDuration:1.0, activeCooldown:7.0, awakenDuration:8.0, rarity:'SR' },
    kunigami: { name:'KUNIGAMI', passive:'Power Forward', active:'Power Dash', awakenName:'Hero Shot', passiveDesc:'Disparos devastadores y embestidas potentes.', activeDesc:'Embiste con escudo hacia adelante.', awakenDesc:'Escudo reforzado y embestida más potente.', color:'#ff8c00', num:'22', speed:3.8, ballControl:1.2, passPower:2.0, passAccuracy:2.0, shotPower:3.4, shotAccuracy:2.6, size:1.1, dribbleStyle:'aggressive', activeDuration:1.5, activeCooldown:8.0, awakenDuration:8.0, rarity:'SR' },
    kaiser: { name:'KAISER', passive:'Absolute Accuracy', active:'Ruta del Emperador', awakenName:'Ruta del Emperador: Zero', passiveDesc:'Sus disparos son devastadores y precisos.', activeDesc:'Sin balón: mini dash en zigzag con partículas rosa y azul. Si recibes el balón en 2s, disparas el Kaiser Impact. Con balón: Kaiser Impact directo.', awakenDesc:'Ruta mejorada: zigzag más rápido. Si recibes el balón en 2s, ejecutas el Kaiser Impact Zero. Con balón: dash + tiro curvo.', color:'#e040fb', num:'10', speed:4.1, ballControl:1.4, passPower:1.3, passAccuracy:1.5, shotPower:2.0, shotAccuracy:1.8, size:1.0, dribbleStyle:'aggressive', activeDuration:1.5, activeCooldown:8.0, awakenDuration:10.0, rarity:'SSR' },
    ness: { name:'NESS', passive:'Precision Dribble', active:'World Class Pass', awakenName:'World Class Awakening', passiveDesc:'Regate preciso y pases de clase mundial.', activeDesc:'Pase no interceptable al compañero. Reinicia su cooldown y pasas a controlarlo.', awakenDesc:'Pase no interceptable que despierta al compañero en vez de reiniciar su cooldown; pasas a controlarlo.', color:'#4488ff', num:'14', speed:3.9, ballControl:1.8, passPower:2.2, passAccuracy:2.4, shotPower:1.2, shotAccuracy:1.3, size:1.0, dribbleStyle:'precise', activeDuration:1.5, activeCooldown:7.0, awakenDuration:8.0, rarity:'SR' },
    kiyora: { name:'KIYORA', passive:'Agile Steps', active:'Breakdance Spin', awakenName:'Breakdance Storm', passiveDesc:'Esquiva natural y aceleración superior.', activeDesc:'Con balón: giro breakdance que aturde a los rivales cercanos, pasa y da velocidad x1.3. Sin balón: rechaza el balón solo si un rival lo tiene y aturde 1.8s.', awakenDesc:'Aturdimiento aumentado y velocidad x1.4 por 2s.', color:'#00e5a0', num:'15', speed:4.7, ballControl:1.7, passPower:1.6, passAccuracy:1.6, shotPower:1.2, shotAccuracy:1.2, size:0.95, dribbleStyle:'speed', activeDuration:2.0, activeCooldown:9.0, awakenDuration:8.0, rarity:'SR' }
  };

  const RIVALS = {
    sae: { name:'SAE', passive:'Genius Passer', active:'Genius Flow', awakenName:'Divine Destruction', color:'#ff8c00', num:'06', speed:4.4, ballControl:1.8, passPower:3.4, passAccuracy:3.6, shotPower:2.8, shotAccuracy:3.0, size:1.05, dribbleStyle:'precise', activeDuration:3.0, activeCooldown:5.0, awakenDuration:10.0 },
    shidou: { name:'SHIDOU', passive:'Wild Striker', active:'Wild King Bicycle Kick', awakenName:'Wild King', color:'#ff2e63', num:'99', speed:4.5, ballControl:1.2, passPower:1.8, passAccuracy:1.8, shotPower:3.2, shotAccuracy:2.4, size:1.05, dribbleStyle:'wild', activeDuration:2.0, activeCooldown:3.5, awakenDuration:10.0 },
    aiku: { name:'AIKU', passive:'Iron Wall', active:'Iron Wall Intercept', awakenName:'Absolute Iron Wall', color:'#00ff88', num:'04', speed:3.7, ballControl:1.3, passPower:2.0, passAccuracy:2.0, shotPower:1.8, shotAccuracy:2.0, size:1.15, dribbleStyle:'defensive', activeDuration:2.0, activeCooldown:4.5, awakenDuration:8.0 },
    karasu: { name:'KARASU', passive:'Tactician', active:'Zone Control', awakenName:'Absolute Zone', color:'#b14aed', num:'03', speed:3.8, ballControl:1.4, passPower:2.4, passAccuracy:2.6, shotPower:2.0, shotAccuracy:2.2, size:1.0, dribbleStyle:'tactical', activeDuration:3.0, activeCooldown:8.0, awakenDuration:8.0 },
    otoya: { name:'OTOYA', passive:'Ninja Step', active:'Shadow Step', awakenName:'Shadow Ninja', color:'#ff69b4', num:'09', speed:4.5, ballControl:1.5, passPower:2.0, passAccuracy:2.0, shotPower:2.2, shotAccuracy:2.2, size:0.95, dribbleStyle:'ninja', activeDuration:2.5, activeCooldown:8.0, awakenDuration:8.0 },
    reo: { name:'REO', passive:'Chameleon', active:'Copycat', awakenName:'Perfect Copy', color:'#b14aed', num:'07', speed:4.0, ballControl:1.5, passPower:2.4, passAccuracy:2.4, shotPower:2.6, shotAccuracy:2.4, size:1.0, dribbleStyle:'precise', activeDuration:2.0, activeCooldown:8.0, awakenDuration:8.0 },
    kunigami: { name:'KUNIGAMI', passive:'Power Forward', active:'Power Dash', awakenName:'Hero Shot', color:'#ff8c00', num:'22', speed:3.8, ballControl:1.2, passPower:2.0, passAccuracy:2.0, shotPower:3.4, shotAccuracy:2.6, size:1.1, dribbleStyle:'aggressive', activeDuration:1.5, activeCooldown:3.5, awakenDuration:8.0 },
    barou: { name:'BAROU', passive:'Center Shot King', active:'Charging King', awakenName:'Tyrant King', color:'#ffd700', num:'04', speed:3.9, ballControl:1.4, passPower:1.6, passAccuracy:1.6, shotPower:3.6, shotAccuracy:3.2, size:1.1, dribbleStyle:'aggressive', activeDuration:2.2, activeCooldown:5.5, awakenDuration:10.0 },
    snuffy: { name:'SNUFFY', passive:'Master Tactician', active:'Tactical Command', awakenName:'Absolute Command', color:'#ff4444', num:'10', speed:3.6, ballControl:1.5, passPower:2.2, passAccuracy:2.2, shotPower:2.0, shotAccuracy:2.0, size:1.0, dribbleStyle:'tactical', activeDuration:3.0, activeCooldown:8.0, awakenDuration:8.0 },
    aryu: { name:'ARYU', passive:'Elegant Steal', active:'Graceful Tackle', awakenName:'Perfect Steal', color:'#ff66aa', num:'05', speed:3.9, ballControl:1.3, passPower:1.5, passAccuracy:1.5, shotPower:1.5, shotAccuracy:1.5, size:1.05, dribbleStyle:'defensive', activeDuration:1.5, activeCooldown:5.0, awakenDuration:8.0 },
    niko: { name:'NIKO', passive:'Time Lag', active:'Time Stop', awakenName:'Eternal Lag', color:'#66ccff', num:'06', speed:3.7, ballControl:1.4, passPower:1.8, passAccuracy:1.8, shotPower:1.6, shotAccuracy:1.6, size:1.0, dribbleStyle:'tactical', activeDuration:2.0, activeCooldown:10.0, awakenDuration:8.0 },
    donlorenzo: { name:'D.LORENZO', passive:'Absolute Wall', active:'Iron Fortress', awakenName:'Impenetrable Wall', color:'#ffaa00', num:'03', speed:3.5, ballControl:1.3, passPower:1.8, passAccuracy:1.8, shotPower:1.8, shotAccuracy:1.8, size:1.15, dribbleStyle:'defensive', activeDuration:2.5, activeCooldown:6.0, awakenDuration:8.0 },
    shiguma: { name:'SHIGUMA', passive:'Basic Play', active:'Sprint', awakenName:'Full Sprint', color:'#888888', num:'08', speed:3.6, ballControl:1.1, passPower:1.2, passAccuracy:1.2, shotPower:1.2, shotAccuracy:1.2, size:1.0, dribbleStyle:'basic', activeDuration:2.0, activeCooldown:12.0, awakenDuration:8.0 },
    // === PXG TEAM ===
    rinpxg: { name:'RIN PXG', passive:'Ruthless Striker', active:'Pulverize', awakenName:'MASS DESTRUCTION', color:'#2dd4a8', num:'10', speed:4.2, ballControl:1.3, passPower:1.2, passAccuracy:1.2, shotPower:1.8, shotAccuracy:1.8, size:1.0, dribbleStyle:'aggressive', activeDuration:2.0, activeCooldown:9.0, awakenDuration:10.0 },
    loki: { name:'LOKI', passive:'Wind God', active:'Phantom Sprint', awakenName:'Phantom God', color:'#00e5ff', num:'99', speed:5.5, ballControl:1.5, passPower:1.2, passAccuracy:1.2, shotPower:1.8, shotAccuracy:1.5, size:0.95, dribbleStyle:'speed', activeDuration:2.5, activeCooldown:8.0, awakenDuration:8.0 },
    charles: { name:'C.CHEVALIER', passive:'Genius Passer', active:'Laser Pass', awakenName:'Genius Laser', color:'#e0e060', num:'10', speed:3.8, ballControl:1.6, passPower:2.8, passAccuracy:3.0, shotPower:1.5, shotAccuracy:1.5, size:1.0, dribbleStyle:'tactical', activeDuration:1.0, activeCooldown:5.0, awakenDuration:8.0 },
    nanase: { name:'NANASE', passive:'Silent Assist', active:'Shield Pass', awakenName:'Perfect Shield Pass', color:'#88ccaa', num:'14', speed:4.0, ballControl:1.5, passPower:2.2, passAccuracy:2.4, shotPower:1.0, shotAccuracy:1.2, size:0.95, dribbleStyle:'tactical', activeDuration:0.8, activeCooldown:3.0, awakenDuration:8.0 },
    tokimitsu: { name:'TOKIMITSU', passive:'Power Forward', active:'Power Dash', awakenName:'Hero Shot', color:'#44aa44', num:'17', speed:3.8, ballControl:1.2, passPower:2.0, passAccuracy:2.0, shotPower:3.4, shotAccuracy:2.6, size:1.1, dribbleStyle:'aggressive', activeDuration:1.5, activeCooldown:3.5, awakenDuration:8.0 },
    zantetsu: { name:'ZANTETSU', passive:'Ninja Step', active:'Shadow Step', awakenName:'Shadow Ninja', color:'#cccccc', num:'11', speed:4.5, ballControl:1.5, passPower:2.0, passAccuracy:2.0, shotPower:2.2, shotAccuracy:2.2, size:0.95, dribbleStyle:'ninja', activeDuration:2.5, activeCooldown:8.0, awakenDuration:8.0 }
  };

  const RIVAL_GK_NAMES = ['IBARAKI','DARAI','NIKA','HAO','WAKABAYASHI'];
  const MATCHES = {
    japan: {
      id:'japan', name:'SELECCIÓN JAPÓN',
      blueLabel:'BLUE LOCK', redLabel:'SELECCIÓN JAPÓN',
      blueHeroes:['isagi','rin','nagi','bachira','chigiri','yukimiya','kurona','hiori'],
      redRivals:['aiku','karasu','otoya','sae','reo','kunigami','barou','shidou'],
      blueInfo:'Gagamaru (POR) · Kurona · Hiori · Bachira · Chigiri · Yukimiya · Nagi · Isagi/Rin (Tú)',
      redInfo:'Sae · Shidou · Reo · Kunigami · Barou · Aiku · Karasu · Otoya + Portero'
    },
    pxg: {
      id:'pxg', name:'PXG',
      blueLabel:'BASTARD MÜNCHEN', redLabel:'PXG',
      blueHeroes:['kaiser','isagi','ness','kunigami','kiyora','yukimiya','kurona','hiori'],
      redRivals:['karasu','tokimitsu','loki','nanase','charles','zantetsu','rinpxg','shidou'],
      blueInfo:'Gagamaru (POR) · Kurona · Hiori · Ness · Kiyora · Yukimiya · Kunigami · Kaiser/Isagi (Tú)',
      redInfo:'Shidou · Rin PXG · Zantetsu · Charles · Nanase · Loki · Tokimitsu · Karasu + Portero'
    }
  };
  const MATCH_ORDER = ['japan','pxg'];

  // === TAMAÑOS AJUSTADOS (LIGERAMENTE MÁS GRANDES QUE EL ORIGINAL) ===
  const FIELD = { x:0, y:0, w:4200, h:800 };
  const GOAL_W = 280, GOAL_DEPTH = 40, PLAYER_R = 18, BALL_R = 14, MATCH_TIME = 180;
  const AWAKEN_CHARGE_EXTRA_TIME = 1.0; // A full awaken charge takes 1 extra second
  const SHOT_CHARGE_TIME = 0.6; // Seconds to fully charge a normal shot
  const SAE_OFF_BALANCE_RANGE = 270; // Max distance for Sae to target the ball carrier with Off Balance
  const SHOT_MIN_POWER = 0.35; // A tap still fires at 35% of the normal shot power

  // Difficulty multipliers: rivalSpeed, rivalAbility, rivalGKSave, blueGKSave
  const DIFFICULTY = {
    easy:      { rivalSpeed:0.85, rivalAbility:0.55, rivalGKSave:-0.15, blueGKSave:0.20, label:'Rivales lentos y porteros débiles. Ideal para practicar.', name:'Fácil' },
    normal:    { rivalSpeed:1.00, rivalAbility:1.00, rivalGKSave:0.00,  blueGKSave:0.00, label:'Equilibrio equilibrado para un desafío justo.', name:'Normal' },
    hard:      { rivalSpeed:1.12, rivalAbility:1.40, rivalGKSave:0.12,  blueGKSave:-0.10, label:'Rivales rápidos y agresivos. Portero rival experto.', name:'Difícil' },
    legendary: { rivalSpeed:1.25, rivalAbility:1.80, rivalGKSave:0.22,  blueGKSave:-0.18, label:'Modo pesadilla. Rivales letales y habilidosos.', name:'Leyenda' }
  };

  // === FORMATION CONSTANTS ===

  const BLUE_ROLES = {
    isagi:'FWD', rin:'FWD', kaiser:'FWD',
    kurona:'MID', hiori:'MID',
    nagi:'DEF', bachira:'DEF', chigiri:'DEF', yukimiya:'DEF',
    ness:'DEF', kunigami:'DEF', kiyora:'DEF'
  };

  const FORMATION_STORAGE_PREFIX = 'bluelockFormation:';

  const FORMATION_DEFAULT_SLOTS = {
    GK:  [{ x:0.0286, y:0.500 }],
    DEF: [{ x:0.3810, y:0.150 }, { x:0.3810, y:0.383 }, { x:0.3810, y:0.617 }, { x:0.3810, y:0.850 }],
    MID: [{ x:0.6670, y:0.300 }, { x:0.6670, y:0.700 }],
    FWD: [{ x:0.8810, y:0.325 }, { x:0.8810, y:0.675 }]
  };

  // === POWER-UP TYPES ===
  const POWERUP_TYPES = {
    speed:   { color:'#00ced1', icon:'⚡', name:'VELOCIDAD', duration:5.0 },
    shield:  { color:'#ffd700', icon:'🛡', name:'ESCUDO', duration:4.0 },
    cooldown:{ color:'#ff00ff', icon:'✦', name:'COOLDOWN RESET', duration:0 },
    heal:    { color:'#00ff88', icon:'♥', name:'DESPERTAR +30', duration:0 }
  };

  // === VISUAL EFFECT LIMITS ===

  const MAX_PARTICLES = 200;

  return {
    HEROES,
    RIVALS,
    RIVAL_GK_NAMES,
    MATCHES,
    MATCH_ORDER,
    FIELD,
    GOAL_W,
    GOAL_DEPTH,
    PLAYER_R,
    BALL_R,
    MATCH_TIME,
    AWAKEN_CHARGE_EXTRA_TIME,
    SHOT_CHARGE_TIME,
    SAE_OFF_BALANCE_RANGE,
    SHOT_MIN_POWER,
    DIFFICULTY,
    BLUE_ROLES,
    FORMATION_STORAGE_PREFIX,
    FORMATION_DEFAULT_SLOTS,
    POWERUP_TYPES,
    MAX_PARTICLES
  };
});
