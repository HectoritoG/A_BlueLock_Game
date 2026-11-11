(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLEntities = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Browser-facing simulation classes. Rendering lives in render/entities.js.
  // Audio is injected through runtime.audio and randomness goes through
  // runtime.rng when a deterministic seed is available.
  function createEntityClasses(runtime) {
    const {
      HEROES,
      RIVALS,
      FIELD,
      GOAL_W,
      GOAL_DEPTH,
      PLAYER_R,
      BALL_R,
      AWAKEN_CHARGE_EXTRA_TIME,
      SHOT_CHARGE_TIME,
      SAE_OFF_BALANCE_RANGE,
      SHOT_MIN_POWER,
      DIFFICULTY,
      MAX_PARTICLES
    } = runtime.constants;
    const {
      dist,
      pointToSegmentDistance,
      lerp,
      clamp,
      angleTo,
      normalize
    } = runtime.math;
    const G = runtime.G;
    const audio = runtime.audio || runtime.SFX;
    const rng = typeof runtime.rng === 'function' ? runtime.rng : () => Math.random();
    const {
      trackShot,
      trackPass,
      trackTackle,
      trackGoal,
      addCombo,
      suppressControlEffects,
      moveToward,
      switchToHumanPlayer,
      spawnParticles,
      triggerGoal,
      grantAwakening,
      updateShotChargeUI,
      showAbilityNotif
    } = runtime.helpers;

class Ball {
  constructor(){
    this.x = FIELD.x + FIELD.w/2; this.y = FIELD.y + FIELD.h/2; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0; this.spin = 0;
    this.state = 'free'; this.owner = null; this.passTarget = null; this.perfectHoming = false; this.uninterceptablePass = false;
    this.lastShooter = null; this.shotPower = 0; this.rotation = 0;
    this.lastPasser = null; this.lastPassTime = 0;
    this.dribbleOffset = {x:0, y:0}; this.dribblePhase = 0;
    this.nagiAwakened = false; this.isagiAwakened = false;
    this.shidouShot = false; this.shidouGuaranteed = false; this.saeGuaranteed = false; this.massDestructionShot = false;
    this.rinCurved = false; this.rinFarPostY = 0;
    this.planetaryHotline = null;
  }

  update(dt){
    if(this.state === 'owned' && this.owner){
      const o = this.owner;
      
      if(o.nagiCharge > 0){
        this.x = o.x; this.y = o.y;
        this.z = lerp(this.z, 45, 0.2);
        this.rotation += 0.3;
        return;
      }

      const ang = o.facingAngle;
      const baseOff = PLAYER_R * o.size * 0.9;
      let offX = Math.cos(ang) * baseOff, offY = Math.sin(ang) * baseOff;
      this.dribblePhase += dt * 8;
      const style = o.heroKey ? HEROES[o.heroKey].dribbleStyle : (o.rivalKey ? RIVALS[o.rivalKey].dribbleStyle : 'normal');
      switch(style){
        case 'zigzag': this.dribbleOffset.x = Math.cos(this.dribblePhase * 1.5) * 9; this.dribbleOffset.y = Math.sin(this.dribblePhase * 2) * 6; break;
        case 'sticky': this.dribbleOffset.x = Math.cos(this.dribblePhase) * 3; this.dribbleOffset.y = Math.sin(this.dribblePhase) * 3; break;
        case 'aggressive': this.dribbleOffset.x = Math.cos(this.dribblePhase * 3) * 12; this.dribbleOffset.y = Math.sin(this.dribblePhase * 3) * 7; break;
        case 'speed': offX *= 1.4; this.dribbleOffset.x = Math.cos(this.dribblePhase * 2) * 5; this.dribbleOffset.y = Math.sin(this.dribblePhase * 2) * 3; break;
        case 'calculated': this.dribbleOffset.x = Math.cos(this.dribblePhase) * 4; this.dribbleOffset.y = Math.sin(this.dribblePhase * 0.8) * 4; break;
        case 'precise': this.dribbleOffset.x = Math.cos(this.dribblePhase) * 3; this.dribbleOffset.y = Math.sin(this.dribblePhase) * 3; break;
        case 'wild': this.dribbleOffset.x = Math.cos(this.dribblePhase * 2.5) * 11; this.dribbleOffset.y = Math.sin(this.dribblePhase * 3) * 7; break;
        case 'defensive': this.dribbleOffset.x = Math.cos(this.dribblePhase * 0.8) * 3; this.dribbleOffset.y = Math.sin(this.dribblePhase * 0.8) * 3; break;
        case 'tactical': this.dribbleOffset.x = Math.cos(this.dribblePhase * 1.2) * 5; this.dribbleOffset.y = Math.sin(this.dribblePhase) * 5; break;
        case 'ninja': this.dribbleOffset.x = Math.cos(this.dribblePhase * 3) * 7; this.dribbleOffset.y = Math.sin(this.dribblePhase * 4) * 5; break;
        default: this.dribbleOffset.x = Math.cos(this.dribblePhase) * 4; this.dribbleOffset.y = Math.sin(this.dribblePhase) * 4;
      }
      const bachiraSombrero = o.heroKey === 'bachira' && o.bachiraCombo && o.bachiraComboPhase === 2;
      const saeHeelLift = o.rivalKey === 'sae' && o.saeCombo && o.saeComboPhase === 1;
      const targetX = o.x + offX + this.dribbleOffset.x + (bachiraSombrero ? o.bachiraVisualX : 0) + (saeHeelLift ? o.saeVisualX : 0);
      const targetY = o.y + offY + this.dribbleOffset.y + (bachiraSombrero ? o.bachiraVisualY : 0) + (saeHeelLift ? o.saeVisualY : 0);
      this.x = lerp(this.x, targetX, 0.4); this.y = lerp(this.y, targetY, 0.4);
      if(bachiraSombrero){
        const sombreroT = clamp(o.bachiraComboTimer / 1.0, 0, 1);
        this.z = Math.sin(sombreroT * Math.PI) * 72;
        this.rotation += 0.2;
      } else if(saeHeelLift){
        const heelT = clamp(o.saeComboTimer / 0.8, 0, 1);
        this.z = Math.sin(heelT * Math.PI) * 72;
        this.rotation += 0.2;
      } else {
        this.z = 0;
      }
      const oSpeed = Math.hypot(o.vx, o.vy); this.rotation += oSpeed * 0.08 * dt * 60;
      return;
    }

    const prevX = this.x, prevY = this.y;
    this.x += this.vx * dt * 60; this.y += this.vy * dt * 60; this.z += this.vz * dt * 60;

    if(Math.abs(this.spin) > 0.01 && this.z < 6){
      const speed = Math.hypot(this.vx, this.vy);
      if(speed > 0.5){
        const ang = Math.atan2(this.vy, this.vx); const perp = ang + Math.PI/2;
        this.vx += Math.cos(perp) * this.spin * 0.08 * dt * 60;
        this.vy += Math.sin(perp) * this.spin * 0.08 * dt * 60;
      }
      this.spin *= 0.99;
    }
    // Rin curved shot: perfect homing toward far post
    if(this.rinCurved && this.state === 'shot' && this.z < 25 && this.lastShooter){
      const goalX = this.lastShooter.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
      const dToGoalX = Math.abs(this.x - goalX);
      if(dToGoalX > 20){
        const speed = Math.hypot(this.vx, this.vy);
        if(speed > 1){
          const desiredAng = Math.atan2(this.rinFarPostY - this.y, goalX - this.x);
          const curAng = Math.atan2(this.vy, this.vx);
          let angDiff = desiredAng - curAng;
          while(angDiff > Math.PI) angDiff -= Math.PI * 2;
          while(angDiff < -Math.PI) angDiff += Math.PI * 2;
          // Homing gets stronger near the goal for a natural bending effect
          const totalDist = Math.abs(goalX - (this.lastShooter ? this.lastShooter.x : this.x));
          const progress = 1.0 - clamp(dToGoalX / Math.max(totalDist, 1), 0, 1);
          const homingStr = 0.02 + progress * 0.04; // 0.02 at start → 0.06 near goal
          const newAng = curAng + angDiff * homingStr;
          this.vx = Math.cos(newAng) * speed;
          this.vy = Math.sin(newAng) * speed;
        }
      }
    }
    if(this.z > 0) this.vz -= 0.4 * dt * 60;
    if(this.z <= 0){ this.z = 0; if(this.vz < 0){ this.vz = -this.vz * 0.45; if(Math.abs(this.vz) < 0.5) this.vz = 0; } }

    // Shots and loose balls lose a little more speed on the ground so they
    // stop rolling for so long after a save/deflection. Free balls lose extra
    // speed so rebounds and clearances settle before they roll forever.
    const groundFriction = this.state === 'pass' ? 0.985 : (this.state === 'free' ? 0.975 : 0.983);
    const friction = this.z > 0.5 ? (this.state === 'free' ? 0.995 : 0.997) : groundFriction;
    this.vx *= friction; this.vy *= friction;
    const speed = Math.hypot(this.vx, this.vy);
    this.rotation += speed * 0.03 * dt * 60;

    if(this.y < FIELD.y + BALL_R){ this.y = FIELD.y + BALL_R; this.vy = Math.abs(this.vy) * 0.6; }
    if(this.y > FIELD.y + FIELD.h - BALL_R){ this.y = FIELD.y + FIELD.h - BALL_R; this.vy = -Math.abs(this.vy) * 0.6; }

    const inGoalZone = this.y > FIELD.y + FIELD.h/2 - GOAL_W/2 && this.y < FIELD.y + FIELD.h/2 + GOAL_W/2;
    if(this.x < FIELD.x + BALL_R){ if(inGoalZone && this.x > FIELD.x - GOAL_DEPTH){} else { this.x = FIELD.x + BALL_R; this.vx = Math.abs(this.vx) * 0.6; if(this.state === 'shot'){ this.state = 'free'; this.spin = 0; this.shidouShot = false; this.shidouGuaranteed = false; this.saeGuaranteed = false; this.massDestructionShot = false; this.rinCurved = false; this.nagiAwakened = false; this.isagiAwakened = false; this.lastShooter = null; this.lastPasser = null; this.lastPassTime = 0; } } }
    if(this.x > FIELD.x + FIELD.w - BALL_R){ if(inGoalZone && this.x < FIELD.x + FIELD.w + GOAL_DEPTH){} else { this.x = FIELD.x + FIELD.w - BALL_R; this.vx = -Math.abs(this.vx) * 0.6; if(this.state === 'shot'){ this.state = 'free'; this.spin = 0; this.shidouShot = false; this.shidouGuaranteed = false; this.saeGuaranteed = false; this.massDestructionShot = false; this.rinCurved = false; this.nagiAwakened = false; this.isagiAwakened = false; this.lastShooter = null; this.lastPasser = null; this.lastPassTime = 0; } } }

    const postPositions = [
      {x: FIELD.x, y: FIELD.y + FIELD.h/2 - GOAL_W/2}, {x: FIELD.x, y: FIELD.y + FIELD.h/2 + GOAL_W/2},
      {x: FIELD.x + FIELD.w, y: FIELD.y + FIELD.h/2 - GOAL_W/2}, {x: FIELD.x + FIELD.w, y: FIELD.y + FIELD.h/2 + GOAL_W/2}
    ];
    for(const pp of postPositions){
      const d = Math.hypot(this.x - pp.x, this.y - pp.y);
      if(d < BALL_R + 5){
        const ang = Math.atan2(this.y - pp.y, this.x - pp.x);
        this.x = pp.x + Math.cos(ang) * (BALL_R + 5); this.y = pp.y + Math.sin(ang) * (BALL_R + 5);
        const dot = this.vx * Math.cos(ang) + this.vy * Math.sin(ang);
        this.vx -= 2 * dot * Math.cos(ang) * 0.7; this.vy -= 2 * dot * Math.sin(ang) * 0.7;
        if(this.state === 'shot' || this.state === 'pass'){
          // A post rebound is a loose ball, not a shot/pass that can keep
          // spinning or bypass the normal loose-ball trapping logic.
          this.state = 'free';
          this.spin = 0;
          this.passTarget = null;
          this.perfectHoming = false;
          this.uninterceptablePass = false;
          this.planetaryHotline = null;
          this.shidouShot = false;
          this.shidouGuaranteed = false;
          this.saeGuaranteed = false;
          this.massDestructionShot = false;
          this.rinCurved = false;
          this.nagiAwakened = false;
          this.isagiAwakened = false;
          this.lastShooter = null;
          this.lastPasser = null;
          this.lastPassTime = 0;
        }
        spawnParticles(pp.x, pp.y, '#ffffff', 6);
      }
    }

    this.checkGoal();

    if(speed < 0.05 && this.z === 0){ this.vx = 0; this.vy = 0; this.spin = 0; if(this.state === 'pass' || this.state === 'shot'){ this.state = 'free'; this.passTarget = null; this.perfectHoming = false; this.uninterceptablePass = false; this.planetaryHotline = null; } }

    if(this.state === 'pass' && this.passTarget){
      const dToTarget = dist(this, this.passTarget);
      // === HOMING: gently steer the pass toward the target ===
      const homingRange = this.perfectHoming ? 9999 : 400;
      if(dToTarget > 20 && dToTarget < homingRange){
        const speed = Math.hypot(this.vx, this.vy);
        if(speed > 0.5){
          const desiredAng = Math.atan2(this.passTarget.y - this.y, this.passTarget.x - this.x);
          const curAng = Math.atan2(this.vy, this.vx);
          let angDiff = desiredAng - curAng;
          while(angDiff > Math.PI) angDiff -= Math.PI * 2;
          while(angDiff < -Math.PI) angDiff += Math.PI * 2;
          const homingStrength = this.perfectHoming ? 0.9 : 0.06;
          const newAng = curAng + angDiff * homingStrength;
          this.vx = Math.cos(newAng) * speed; this.vy = Math.sin(newAng) * speed;
        }
      }
      const receiveRadius = PLAYER_R * this.passTarget.size + BALL_R + 14;
      // Continuous check: a high-power Sae pass can cross the receiver between
      // two frames. Use the swept segment so it still registers as received.
      const targetHit = dToTarget < receiveRadius ||
        pointToSegmentDistance(this.passTarget.x, this.passTarget.y, prevX, prevY, this.x, this.y) < receiveRadius;
      if(targetHit && this.z < 12){ this.beOwnedBy(this.passTarget); spawnParticles(this.x, this.y, this.passTarget.team === 'blue' ? '#00d9ff' : '#ff2e63', 8); return; }
      for(const p of G.players){
        if(this.uninterceptablePass) break;
        if(p.team === this.passTarget.team || p.stunTimer > 0) continue;
        if(p.type === 'goalkeeper' && p.team !== this.passTarget.team){ const d = dist(this, p); if(d < PLAYER_R + BALL_R + 12 && this.z < 15){ this.beOwnedBy(p); spawnParticles(this.x, this.y, '#ffff00', 10); audio.intercept(); return; } continue; }
        if(this.perfectHoming) continue; // Perfect homing passes cannot be intercepted by field players
        const d = dist(this, p);
        if(d < PLAYER_R * p.size + BALL_R + 3 && this.z < 10){ this.beOwnedBy(p); spawnParticles(this.x, this.y, '#ff8800', 10); audio.intercept(); return; }
      }
    }

    // === INTERCEPTACIÓN DE AIKU ===
    if(this.state === 'shot' && this.z < 25 && !this.shidouGuaranteed && !this.saeGuaranteed){
      for(const p of G.players){
        if(p.rivalKey !== 'aiku' || p.stunTimer > 0) continue;
        if(p.interceptActive > 0){
          const d = dist(this, p);
          if(d < PLAYER_R * p.size + BALL_R + 35){
            this.vx *= -0.4; this.vy *= 0.3; this.vz = 3;
            this.state = 'free'; this.spin = 0;
            this.shidouShot = false; this.massDestructionShot = false; this.rinCurved = false;
            this.nagiAwakened = false; this.isagiAwakened = false;
            this.lastShooter = null; this.lastPasser = null; this.lastPassTime = 0;
            p.interceptActive = 0;
            spawnParticles(p.x, p.y, '#00ff88', 30);
            G.cameraShake = 6;
            showAbilityNotif('INTERCEPTED!', '#00ff88');
            audio.intercept(); audio.cheer(0.2);
            return;
          }
        }
      }
    }

    if((this.state === 'free' || this.state === 'shot') && this.z < 15){
      // Guaranteed shots cannot be intercepted by field players
      if((this.shidouGuaranteed || this.saeGuaranteed) && this.state === 'shot') { /* skip interception */ }
      else {
        const interceptSpeed = this.state === 'free' ? 7.0 : 10.0;
        for(const p of G.players){
          if(p.stunTimer > 0 || p.freezeTimer > 0 || (p.nagiCharge > 0 && p.team !== this.team)) continue;
          const d = dist(this, p);
          let controlRange = PLAYER_R * p.size + BALL_R + 4;
          if(p.heroKey === 'nagi') controlRange += 10;
          if(p.rivalKey === 'sae') controlRange += 5;
          if(d >= controlRange) continue;
          let canControl = speed < interceptSpeed;
          if(!canControl && this.state === 'free' && speed < 30){
            // Fast loose balls can still be trapped. Better ball control and
            // lower speed increase the chance, so clearances do not roll past
            // every NPC until they stop.
            const trapChance = clamp(0.65 - speed * 0.02 + p.ballControl * 0.08, 0.05, 0.85);
            canControl = rng() < trapChance;
          }
          if(canControl){
            this.beOwnedBy(p);
            spawnParticles(this.x, this.y, p.team === 'blue' ? '#00d9ff' : '#ff2e63', 6);
            break;
          }
        }
      }
    }

    if(speed > 3 && this.state !== 'owned' && G.trails.length < 80){ G.trails.push({x:this.x, y:this.y, z:this.z, life:0.3, maxLife:0.3, color:this.massDestructionShot ? '#2dd4a8' : (this.perfectHoming ? '#00ced1' : this.state === 'shot' ? '#ffaa00' : '#ffffff')}); }
    if(this.perfectHoming && this.state === 'pass' && rng() < 0.3 && G.particles.length < MAX_PARTICLES){ spawnParticles(this.x, this.y, '#00ced1', 1); }
    // MASS DESTRUCTION: Extra epic particles
    if(this.massDestructionShot && this.state === 'shot' && G.particles.length < MAX_PARTICLES){ spawnParticles(this.x + (rng()-0.5)*20, this.y + (rng()-0.5)*20, rng() < 0.5 ? '#00ffcc' : '#0affce', 1); }
  }

  beOwnedBy(player){
    const prevTeam = this.owner ? this.owner.team : null;
    if(this.lastPasser && this.lastPasser.team !== player.team){ this.lastPasser = null; this.lastPassTime = 0; }
    const prevOwnerKey = prevTeam ? (prevTeam.heroKey || prevTeam.rivalKey || null) : null; const prevNagiCharging = prevTeam && prevTeam.nagiCharge > 0;
    this.state = 'owned'; this.owner = player; player.hasBall = true; player.receiveImmunity = player.heroKey === 'nagi' ? 0.5 : 0.2; this.vx = 0; this.vy = 0; this.vz = 0; this.spin = 0; this.nagiAwakened = false; this.isagiAwakened = false; this.shidouShot = false; this.shidouGuaranteed = false; this.saeGuaranteed = false; this.massDestructionShot = false; this.perfectHoming = false; this.uninterceptablePass = false; this.rinCurved = false; this.rinFarPostY = 0; if(prevTeam && prevTeam !== player.team){ audio.possession(); }
  if(player.heroKey === 'isagi' && player.isagiAutoTimer > 0) player.isagiAutoPending = true;
  // KAISER: receiving the ball during Emperor's Route arms an automatic Kaiser Impact.
  if(player.heroKey === 'kaiser' && player.kaiserRouteShotTimer > 0){
    player.kaiserRouteShotTimer = 0;
    player.kaiserRouteTimer = 0;
    player.pendingShot = Math.max(player.pendingShot, 0.16);
    showAbilityNotif(player.isAwakened ? 'KAISER IMPACT ZERO!' : 'KAISER IMPACT!', player.isAwakened ? '#ff00ff' : '#ff4fd8');
    spawnParticles(player.x, player.y, '#ff4fd8', 14);
    spawnParticles(player.x, player.y, '#4fc3f7', 14);
    G.cameraShake = Math.max(G.cameraShake || 0, 4);
  }
  // NAGI: catching the ball during Trap's off-ball dash stuns nearby rivals
  // and fires the normal Trap Shot.
  if(player.heroKey === 'nagi' && player.nagiTrapDash > 0){
    player.nagiTrapDash = 0;
    player.nagiOffBallShot = true;
    player.nagiSkullShot = false;
    player.nagiFakeCount = 0;
    player.nagiVolleyLock = 0;
    player.pendingShot = 0;
    // Reuse the Trap charge animation: the ball rises/spins and Nagi braces
    // before the ground-hugging Trap Shot is fired.
    player.nagiCharge = 0.45;
    for(const p of G.players){
      if(p.team === player.team) continue;
      if(p.isControlImmune()) continue;
      if(dist(player, p) < 240){
        p.stunTimer = Math.max(p.stunTimer, 1.5);
        spawnParticles(p.x, p.y, '#b14aed', 10);
      }
    }
    spawnParticles(player.x, player.y, '#b14aed', 24);
    showAbilityNotif('TRAP CATCH!', '#b14aed');
    G.cameraShake = Math.max(G.cameraShake || 0, 6);
  }
  // === RIVAL ON-BALL-DRIBBLE TRIGGER: Sae and Barou auto-use ability when gaining ball ===
  if(player.team === 'red' && player.activeCd <= 0 && !player.isHuman && prevTeam && prevTeam !== player.team){
    if(player.rivalKey === 'barou'){
      // Barou: Immediately activate zigzag shield charge
      player.useAbility();
    }
    else if(player.rivalKey === 'sae'){
      // Sae: Only auto-start Divine Destruction when the shot can reach the goal.
      const abMult = DIFFICULTY[G.difficulty].rivalAbility;
      const goalX = player.team === 'red' ? FIELD.x : FIELD.x + FIELD.w;
      const dToGoal = Math.abs(player.x - goalX);
      const divineChance = player.isAwakened ? 1.0 : 0.65;
      if(dToGoal < 1200 && rng() < divineChance * abMult){
        player.useAbility();
      }
    }
    else if(player.rivalKey === 'shidou'){
      // Shidou: Use ability aggressively when getting ball
      const abMult = DIFFICULTY[G.difficulty].rivalAbility;
      const goalX = player.team === 'red' ? FIELD.x : FIELD.x + FIELD.w;
      const dToGoal = Math.abs(player.x - goalX);
      if(dToGoal < 600 && rng() < 0.50 * abMult){
        player.useAbility();
      }
    }
  }
  // === LOKI PASSIVE: Auto-dash to rival goal when receiving ball ===
  if(player.rivalKey === 'loki'){
    const goalX = player.team === 'red' ? FIELD.x : FIELD.x + FIELD.w;
    const goalAng = angleTo(player, {x: goalX, y: FIELD.y + FIELD.h/2});
    player.vx += Math.cos(goalAng) * 18;
    player.vy += Math.sin(goalAng) * 18;
    player.dashTimer = 2.0;
    spawnParticles(player.x, player.y, '#00e5ff', 15);
  }
  // === NANASE SHIELD PASS: Apply shield to Rin PXG when he receives the ball ===
  if(player.rivalKey === 'rinpxg' && player._nanaseShieldPending){
    player._nanaseShieldPending = false;
    player.shieldTimer = Math.max(player.shieldTimer, 1.0);
    spawnParticles(player.x, player.y, '#88ccaa', 12);
    showAbilityNotif('SHIELD ACTIVE!', '#88ccaa');
  }
  // === KURONA PLANETARY HOTLINE: the receiver dashes and returns the pass ===
  const hotlineStage = this.planetaryHotline;
  if(hotlineStage === 'outbound'){
    this.planetaryHotline = null;
    if(this.lastPasser && this.lastPasser.heroKey === 'kurona' && this.lastPasser.team === player.team && player !== this.lastPasser){
      const returnTarget = this.lastPasser;
      const awakenedHotline = !!(returnTarget.isAwakened && returnTarget.heroKey === 'kurona');
      const attackGoalX = player.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
      const dashAng = angleTo(player, {x: attackGoalX, y: FIELD.y + FIELD.h/2});
      const dashPower = awakenedHotline ? 20 : 12;
      player.vx += Math.cos(dashAng) * dashPower;
      player.vy += Math.sin(dashAng) * dashPower;
      player.dashTimer = Math.max(player.dashTimer, awakenedHotline ? 0.95 : 0.55);
      spawnParticles(player.x, player.y, awakenedHotline ? '#ff00ff' : '#c27890', awakenedHotline ? 30 : 20);
      G.cameraShake = Math.max(G.cameraShake || 0, awakenedHotline ? 6 : 4);
      if(player.hasBall){
        player.doPass(returnTarget);
        if(this.state === 'pass'){
          this.perfectHoming = true;
          this.planetaryHotline = 'return';
          showAbilityNotif(awakenedHotline ? 'APEX HOTLINE RETURN!' : 'HOTLINE RETURN!', awakenedHotline ? '#ff00ff' : '#c27890');
        }
      }
    }
  } else if(hotlineStage === 'return'){
    this.planetaryHotline = null;
  }
  }
  checkGoal(){
    if(G.goalCelebrating) return;
    const goalY1 = FIELD.y + FIELD.h/2 - GOAL_W/2, goalY2 = FIELD.y + FIELD.h/2 + GOAL_W/2;
    if(this.x < FIELD.x - 2 && this.y > goalY1 && this.y < goalY2 && this.z < 50){ trackGoal('red', this.lastShooter, this.lastPasser); triggerGoal('red'); }
    if(this.x > FIELD.x + FIELD.w + 2 && this.y > goalY1 && this.y < goalY2 && this.z < 50){ trackGoal('blue', this.lastShooter, this.lastPasser); triggerGoal('blue'); }
  }

  shoot(shooter, power, angle, height, curve, isAbility){
    this.x = shooter.x + Math.cos(angle) * (PLAYER_R * shooter.size + BALL_R + 3);
    this.y = shooter.y + Math.sin(angle) * (PLAYER_R * shooter.size + BALL_R + 3);
    this.z = shooter.nagiCharge > 0 ? 45 : 0; 
    this.vx = Math.cos(angle) * power; this.vy = Math.sin(angle) * power; this.vz = height;
    this.spin = curve; this.state = 'shot'; this.owner = null; this.lastShooter = shooter; this.shotPower = power; this.perfectHoming = false; this.uninterceptablePass = false; this.planetaryHotline = null;
    shooter.hasBall = false;
    spawnParticles(shooter.x, shooter.y, isAbility ? (shooter.heroKey ? HEROES[shooter.heroKey].color : RIVALS[shooter.rivalKey].color) : '#ffaa00', 12);
    G.cameraShake = isAbility ? 8 : 0;
    for(let i=0; i<5; i++){ G.trails.push({x:this.x, y:this.y, z:this.z, life:0.5, maxLife:0.5, color: isAbility ? (shooter.heroKey ? HEROES[shooter.heroKey].color : RIVALS[shooter.rivalKey].color) : '#ffaa00'}); }
    this.nagiAwakened = shooter.isAwakened && shooter.heroKey === 'nagi';
    this.isagiAwakened = shooter.isAwakened && shooter.heroKey === 'isagi';
    this.shidouShot = shooter.rivalKey === 'shidou' && isAbility;
    if(this.isagiAwakened){
      G.illusions = [
        {x:this.x, y:this.y - 25, vx:this.vx, vy:this.vy, life:1.0},
        {x:this.x, y:this.y + 25, vx:this.vx, vy:this.vy, life:1.0}
      ];
    }
    if(isAbility) audio.shoot(); else audio.kick();
    trackShot(shooter);
    addCombo(shooter.team, 'shot', shooter.x, shooter.y);
  }

  pass(passer, target, power){
    // === LEADING: predict where the target will be ===
    const d = dist(passer, target);
    const flightTime = d / Math.max(power, 1);
    const leadX = target.x + (target.vx || 0) * flightTime * 0.8;
    const leadY = target.y + (target.vy || 0) * flightTime * 0.8;
    const angle = angleTo(passer, {x: leadX, y: leadY});
    this.x = passer.x + Math.cos(angle) * (PLAYER_R * passer.size + BALL_R + 3);
    this.y = passer.y + Math.sin(angle) * (PLAYER_R * passer.size + BALL_R + 3);
    this.z = 0; this.vx = Math.cos(angle) * power; this.vy = Math.sin(angle) * power; this.vz = 0; this.spin = 0;
    this.state = 'pass'; this.owner = null; this.passTarget = target; this.uninterceptablePass = false; this.perfectHoming = !!(passer.activeTimer > 0 && passer.heroKey === 'kurona'); passer.hasBall = false;
    // A pass must start from a clean ball state. Leftover shot flags can make a
    // later Sae pass behave like a shot, bypass interceptions, or spin oddly.
    this.lastShooter = null; this.shotPower = 0;
    this.shidouShot = false; this.shidouGuaranteed = false; this.saeGuaranteed = false; this.massDestructionShot = false;
    this.rinCurved = false; this.rinFarPostY = 0; this.nagiAwakened = false; this.isagiAwakened = false;
    this.planetaryHotline = null;
    this.lastPasser = passer; this.lastPassTime = performance.now();
    audio.kick();
    trackPass(passer);
    addCombo(passer.team, 'pass', passer.x, passer.y);
  }

}

class Player {
  constructor(x, y, team, type, charKey, role){
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.team = team; this.type = type;
    this.heroKey = (team === 'blue' && type === 'hero') ? charKey : null;
    this.rivalKey = (team === 'red' && type === 'hero') ? charKey : null;
    this.charKey = charKey; this.role = role;
    this.facingAngle = team === 'blue' ? 0 : Math.PI;
    this.hasBall = false; this.tackleCd = 0; this.activeCd = 0; this.activeTimer = 0; this.stunTimer = 0;
    this.isHuman = false; this.size = 1.0; this.speed = 3.5; this.ballControl = 1.0;
    this.passPower = 1.2; this.passAccuracy = 1.2; this.shotPower = 1.2; this.shotAccuracy = 1.2;
    this.aiState = 'idle'; this.aiTimer = 0;
    this.awakening = 0; this.isAwakened = false; this.awakeningTimer = 0; this.awakenDuration = 8.0;
    this.tackleActive = 0; 
    this.nagiCharge = 0; 
    this.nagiFakeCount = 0; this.nagiSkullShot = false; this.nagiVolleyLock = 0;
    this.nagiTrapDash = 0; this.nagiOffBallShot = false;
    this.dashTimer = 0; 
    this.slowTimer = 0; 
    this.kuronaSlowTimer = 0;
    this.freezeTimer = 0;
    this.rinChargeDuration = 0.6;
    this.commandRun = 0; 
    this.interceptActive = 0; 
    this.shieldTimer = 0;
    this.barouZigzag = false;
    this.bachiraCombo = false; this.bachiraComboPhase = 0; this.bachiraComboTimer = 0; this.bachiraBallImmune = 0; this.bachiraVisualX = 0; this.bachiraVisualY = 0;
    this.saeCombo = false; this.saeComboPhase = 0; this.saeComboTimer = 0; this.saeBallImmune = 0; this.saeVisualX = 0; this.saeVisualY = 0; this.saeFlowTimer = 0;
    this.yukimiyaBobaQueue = 0; this.yukimiyaBobaTimer = 0; this.yukimiyaBobaSide = 1;
    this.yukimiyaControlImmune = 0;
    this.kiyoraSpinTimer = 0; this.kiyoraSpinPassPending = false; this.kiyoraSpinAngle = 0;
    this.receiveImmunity = 0;
    this.pendingShot = 0;
    this.shotCharge = 0; this.shotCharging = false;
    this.isagiAutoTimer = 0; this.isagiAutoPending = false;
    this.kaiserRouteTimer = 0; this.kaiserRouteShotTimer = 0; this.kaiserRoutePhase = 0;
    this.homeY = y;

    const config = this.getConfig();
    if(config){
      this.speed = config.speed; this.ballControl = config.ballControl; this.passPower = config.passPower;
      this.passAccuracy = config.passAccuracy; this.shotPower = config.shotPower; this.shotAccuracy = config.shotAccuracy;
      this.size = config.size; this.charData = config; this.awakenDuration = config.awakenDuration || 8.0;
    }
    if(type === 'goalkeeper'){ this.speed = 3.5; this.size = charKey === 'gagamaru' ? 1.35 : 1.2; this.ballControl = 1.0; }
    else if(type === 'normal'){ this.speed = 3.5 + rng() * 0.4; this.size = 1.0; }
  }

  getConfig(){ if(this.heroKey && HEROES[this.heroKey]) return HEROES[this.heroKey]; if(this.rivalKey && RIVALS[this.rivalKey]) return RIVALS[this.rivalKey]; return null; }
  getName(){ if(this.heroKey) return HEROES[this.heroKey].name; if(this.rivalKey) return RIVALS[this.rivalKey].name; if(this.type === 'goalkeeper') return this.charKey === 'gagamaru' ? 'GAGAMARU' : (this.gkName || 'GK'); return 'PLAYER'; }
  getColor(){ if(this.heroKey) return HEROES[this.heroKey].color; if(this.rivalKey) return RIVALS[this.rivalKey].color; return this.team === 'blue' ? '#0088cc' : '#cc2244'; }
  getNum(){ if(this.heroKey) return HEROES[this.heroKey].num; if(this.rivalKey) return RIVALS[this.rivalKey].num; if(this.type === 'goalkeeper') return 'GK'; return this.team === 'blue' ? 'B' : 'R'; }

  update(dt){
    if(this.tackleCd > 0) this.tackleCd -= dt * (this.isAwakened && (this.heroKey === 'isagi' || this.heroKey === 'hiori' || this.heroKey === 'kurona') ? 1.4 : 1.0);
    if(this.activeCd > 0) this.activeCd -= dt;
    if(this.activeTimer > 0) this.activeTimer -= dt;
    if(this.kiyoraSpinTimer > 0){
      this.kiyoraSpinTimer -= dt;
      this.kiyoraSpinAngle += dt * 14;
      this.facingAngle = this.kiyoraSpinAngle % (Math.PI * 2);
      this.vx = 0; this.vy = 0;
      if(rng() < 0.35) spawnParticles(this.x + (rng()-0.5)*36, this.y + (rng()-0.5)*36, this.isAwakened ? '#ff00ff' : '#00e5a0', 1);
      if(this.kiyoraSpinTimer <= 0){
        this.kiyoraSpinTimer = 0;
        if(this.kiyoraSpinPassPending){
          this.kiyoraSpinPassPending = false;
          if(this.hasBall){
            const target = this.findKiyoraPassTarget();
            if(target) this.doPass(target);
          }
        }
      }
    }
    if(this.yukimiyaControlImmune > 0) this.yukimiyaControlImmune -= dt;
    suppressControlEffects(this);
    if(this.isagiAutoTimer > 0){
      this.isagiAutoTimer -= dt;
      if(this.isagiAutoPending && this.hasBall && this.stunTimer <= 0 && this.nagiCharge <= 0){
        this.isagiAutoPending = false;
        this.isagiAutoTimer = 0;
        this.doShoot(true);
      }
      if(this.isagiAutoTimer <= 0){
        this.isagiAutoTimer = 0;
        this.isagiAutoPending = false;
      }
    }
    if(this.isControlImmune()){
      // Bachira's dribble combo is uninterruptible: clear any control effect
      // that slipped through before it can slow him down.
      this.stunTimer = 0;
      this.freezeTimer = 0;
      this.slowTimer = 0;
      this.kuronaSlowTimer = 0;
    }
    if(this.stunTimer > 0){ this.stunTimer -= dt; this.vx *= 0.5; this.vy *= 0.5; }
    if(this.tackleActive > 0) this.tackleActive -= dt;
    if(this.dashTimer > 0) this.dashTimer -= dt;
    if(this.slowTimer > 0) this.slowTimer -= dt;
    if(this.kuronaSlowTimer > 0) this.kuronaSlowTimer -= dt;
    if(this.freezeTimer > 0){
      this.freezeTimer -= dt;
      // Time-freeze: nearly stop any velocity the AI or player just added.
      this.vx *= 0.05; this.vy *= 0.05;
    }
    // NAGI OFF-BALL TRAP: home toward the ball and catch it if possible.
    if(this.nagiTrapDash > 0){
      this.nagiTrapDash = Math.max(0, this.nagiTrapDash - dt);
      if(!this.hasBall && this.stunTimer <= 0 && this.freezeTimer <= 0){
        const ballAng = angleTo(this, G.ball);
        const dashSpeed = this.isAwakened ? 24 : 22;
        this.vx = lerp(this.vx, Math.cos(ballAng) * dashSpeed, 0.35);
        this.vy = lerp(this.vy, Math.sin(ballAng) * dashSpeed, 0.35);
        this.facingAngle = ballAng;
        if(rng() < 0.6) spawnParticles(this.x + (rng()-0.5)*18, this.y + (rng()-0.5)*18, '#b14aed', 1);
        const canCatch = !G.ball.uninterceptablePass && !G.ball.perfectHoming && G.ball.state !== 'owned' && (G.ball.state !== 'shot' || Math.hypot(G.ball.vx, G.ball.vy) < 12);
        if(canCatch && G.ball.z < 15 && dist(this, G.ball) < PLAYER_R * this.size + BALL_R + 10){
          G.ball.beOwnedBy(this);
        }
      }
    }
    if(this.nagiVolleyLock > 0) this.nagiVolleyLock = Math.max(0, this.nagiVolleyLock - dt);
    if(this.commandRun > 0) this.commandRun -= dt;
    if(this.interceptActive > 0) this.interceptActive -= dt;
    if(this.shieldTimer > 0) this.shieldTimer -= dt;
    if(this.bachiraBallImmune > 0) this.bachiraBallImmune -= dt;
    if(this.saeBallImmune > 0) this.saeBallImmune -= dt;
    if(this.saeFlowTimer > 0) this.saeFlowTimer -= dt;
    if(this.receiveImmunity > 0) this.receiveImmunity -= dt;
    if(this.shotCharging){
      if(!this.hasBall || this.stunTimer > 0 || this.freezeTimer > 0 || this.kiyoraSpinTimer > 0 || this.nagiCharge > 0 || this.pendingShot > 0 || this.isagiAutoPending){
        this.cancelShotCharge();
      } else {
        this.shotCharge = Math.min(1, this.shotCharge + dt / SHOT_CHARGE_TIME);
      }
    }
    if(this.pendingShot > 0){
      this.pendingShot -= dt;
      if(this.pendingShot <= 0){
        this.pendingShot = 0;
        if(this.hasBall) this.doShoot(true);
        else if(this.heroKey === 'nagi'){ this.nagiFakeCount = 0; this.nagiSkullShot = false; this.nagiOffBallShot = false; }
      }
    }
    if(this.kaiserRouteTimer > 0){
      this.kaiserRouteTimer -= dt;
      if(this.kaiserRouteTimer < 0) this.kaiserRouteTimer = 0;
    }
    if(this.kaiserRouteShotTimer > 0){
      this.kaiserRouteShotTimer -= dt;
      if(this.kaiserRouteShotTimer < 0) this.kaiserRouteShotTimer = 0;
    }

    if(this.nagiCharge > 0){
      // Check if any opponent is trying to steal — trigger fake volley feint
      let feintTriggered = false;
      if(this.heroKey === 'nagi' && !this.nagiOffBallShot){
        for(const opp of G.players){
          if(opp.team === this.team) continue;
          const d = dist(this, opp);
          if(d < PLAYER_R * (this.size + opp.size) + 25){
            // Opponent too close — cancel shot as fake volley
            feintTriggered = true;
            this.nagiFakeVolley(opp);
            break;
          }
        }
      }
      if(!feintTriggered){
        const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
        const goalAng = angleTo(this, {x:goalX, y:FIELD.y+FIELD.h/2});
        if(this.heroKey === 'rin'){
          // RIN: the slow/freeze is applied once when the ability starts.
          this.vx *= 0.8; this.vy *= 0.8;
        } else {
          this.vx *= 0.8; this.vy *= 0.8;
        }
        this.facingAngle = goalAng;
        this.nagiCharge -= dt;
        if(this.nagiCharge <= 0){
          const offBallTrapShot = this.nagiOffBallShot;
          this.doShoot(true);
          G.cameraShake = 10;
          const chargeColor = this.heroKey === 'rin' ? (HEROES.rin.color) : (HEROES.nagi.color);
          const particleCount = this.heroKey === 'rin' ? 30 : 40;
          spawnParticles(this.x, this.y, chargeColor, particleCount);
          audio.shoot(); audio.cheer(0.15);
          if(offBallTrapShot) showAbilityNotif('TRAP SHOT!', '#b14aed');
        }
      }
    }

    if(this.commandRun > 0){
      // While the command pass is travelling toward Shidou, run to meet it
      // instead of sprinting away and letting the pass die behind him.
      const passToMe = !this.hasBall && G.ball.state === 'pass' && G.ball.passTarget === this;
      const targetX = passToMe ? G.ball.x : (this.team === 'red' ? FIELD.x : FIELD.x + FIELD.w);
      const targetY = passToMe ? G.ball.y : FIELD.y + FIELD.h/2;
      const dir = normalize({x: targetX - this.x, y: targetY - this.y});
      const runAccel = passToMe ? 0.15 : 0.25;
      this.vx += dir.x * this.speed * runAccel;
      this.vy += dir.y * this.speed * runAccel;
      spawnParticles(this.x, this.y, '#ff8c00', 2);
    }

    // BAROU ZIGZAG SHIELD CHARGE
    if(this.barouZigzag && this.activeTimer > 0){
      const goalX = this.team === 'red' ? FIELD.x : FIELD.x + FIELD.w;
      const goalY = FIELD.y + FIELD.h/2;
      const toGoal = normalize({x: goalX - this.x, y: goalY - this.y});
      // Zigzag perpendicular movement
      const zigzagFreq = 4.0;
      const zigzagAmp = 6.0;
      const perpX = -toGoal.y;
      const perpY = toGoal.x;
      const zigzagPhase = performance.now() * 0.008 * zigzagFreq;
      const zigzagOff = Math.sin(zigzagPhase) * zigzagAmp;
      const chargeSpeed = this.speed * 0.4;
      this.vx += (toGoal.x * chargeSpeed) + (perpX * zigzagOff * 0.15);
      this.vy += (toGoal.y * chargeSpeed) + (perpY * zigzagOff * 0.15);
      // Shield visual
      spawnParticles(this.x + (rng()-0.5)*30, this.y + (rng()-0.5)*30, '#ffd700', 1);
      if(this.activeTimer <= 0 || !this.hasBall) this.barouZigzag = false;
    }

    // KAISER: Emperor's Route zigzag dash (off-ball activation)
    if(this.heroKey === 'kaiser' && this.kaiserRouteTimer > 0 && !this.hasBall){
      const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
      const goalY = FIELD.y + FIELD.h/2;
      const routeAng = angleTo(this, {x: goalX, y: goalY});
      const forwardX = Math.cos(routeAng), forwardY = Math.sin(routeAng);
      const perpX = -forwardY, perpY = forwardX;
      this.kaiserRoutePhase += dt;
      const zig = Math.sin(this.kaiserRoutePhase * 27);
      const dashMult = this.isAwakened ? 1.18 : 1.0;
      this.vx += (forwardX * 0.72 + perpX * zig * 0.9) * dashMult;
      this.vy += (forwardY * 0.72 + perpY * zig * 0.9) * dashMult;
      this.facingAngle = Math.atan2(forwardY + perpY * zig * 0.55, forwardX + perpX * zig * 0.55);
      if(rng() < 0.85){
        const routeColor = rng() < 0.5 ? '#ff4fd8' : '#4fc3f7';
        spawnParticles(this.x + (rng()-0.5)*18, this.y + (rng()-0.5)*18, routeColor, 1);
      }
    }

    if(this.isAwakened){
      this.awakeningTimer -= dt;
      if(rng() < 0.5) spawnParticles(this.x, this.y, '#ff00ff', 1);
      if(this.awakeningTimer <= 0){
        this.isAwakened = false;
        if(this.heroKey === 'nagi'){ this.nagiFakeCount = 0; this.nagiSkullShot = false; }
        if(this.charKey === 'gagamaru') this.size = 1.5; 
      }
    } else {
      let gainRate = 4.0;
      if(this.hasBall) gainRate = 10.0;
      if(this.type === 'goalkeeper' && G.ball.state === 'shot' && dist(this, G.ball) < 120) gainRate = 25.0;
      if(this.stunTimer > 0) gainRate = 2.0;
      // Keep the same relative charge pace, but make a full bar take 1 extra second.
      gainRate = 100 / (100 / gainRate + AWAKEN_CHARGE_EXTRA_TIME);
      this.awakening = clamp(this.awakening + dt * gainRate, 0, 100);
    }

    this.x += this.vx * dt * 60; this.y += this.vy * dt * 60;
    this.vx *= 0.82; this.vy *= 0.82;
    this.x = clamp(this.x, FIELD.x + PLAYER_R, FIELD.x + FIELD.w - PLAYER_R);
    this.y = clamp(this.y, FIELD.y + PLAYER_R, FIELD.y + FIELD.h - PLAYER_R);

    if(this.type === 'goalkeeper'){
      if(this.team === 'blue'){ this.x = clamp(this.x, FIELD.x + 5, FIELD.x + 100); this.y = clamp(this.y, FIELD.y + FIELD.h/2 - GOAL_W/2 - 25, FIELD.y + FIELD.h/2 + GOAL_W/2 + 25); }
      else { this.x = clamp(this.x, FIELD.x + FIELD.w - 100, FIELD.x + FIELD.w - 5); this.y = clamp(this.y, FIELD.y + FIELD.h/2 - GOAL_W/2 - 25, FIELD.y + FIELD.h/2 + GOAL_W/2 + 25); }
    }

    if(Math.hypot(this.vx, this.vy) > 0.3 && this.nagiCharge <= 0) this.facingAngle = Math.atan2(this.vy, this.vx);
    // === BACHIRA COMBO ANIMATION ===
    this.bachiraVisualX = 0; this.bachiraVisualY = 0;
    if(this.bachiraCombo){
      this.bachiraComboTimer += dt;
      const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
      const goalAng = angleTo(this, {x: goalX, y: FIELD.y + FIELD.h/2});
      if(this.isAwakened){
        // AWAKENED COMBO: Scissors → Elastico → Sombrero
        if(this.bachiraComboPhase === 0){
          // SCISSORS (0 - 1.0s): Side-to-side oscillation
          const t = this.bachiraComboTimer;
          const perpAng = goalAng + Math.PI/2;
          this.bachiraVisualX = Math.sin(t * 16) * 18 * Math.cos(perpAng);
          this.bachiraVisualY = Math.sin(t * 16) * 18 * Math.sin(perpAng);
          // Push nearby opponents
          if(rng() < 0.15){
            for(const p of G.players){
              if(p.team === this.team) continue;
              if(dist(this, p) < 90){
                const ang = angleTo(this, p);
                p.vx += Math.cos(ang) * 6; p.vy += Math.sin(ang) * 6;
                p.stunTimer = Math.max(p.stunTimer, 0.3);
                spawnParticles(p.x, p.y, '#ffd700', 3);
              }
            }
          }
          if(this.bachiraComboTimer >= 1.0){
            this.bachiraComboPhase = 1; this.bachiraComboTimer = 0;
            showAbilityNotif('ELÁSTICA!', '#ff00ff');
            spawnParticles(this.x, this.y, '#ff00ff', 20);
          }
        } else if(this.bachiraComboPhase === 1){
          // ELASTICO (1.0 - 2.0s): Forward-back-forward feint
          const t = this.bachiraComboTimer;
          const fwdAmt = Math.sin(t * 14) * 15;
          this.bachiraVisualX = Math.cos(goalAng) * fwdAmt;
          this.bachiraVisualY = Math.sin(goalAng) * fwdAmt;
          // Bigger push
          if(rng() < 0.2){
            for(const p of G.players){
              if(p.team === this.team) continue;
              if(dist(this, p) < 100){
                const ang = angleTo(this, p);
                p.vx += Math.cos(ang) * 10; p.vy += Math.sin(ang) * 10;
                p.stunTimer = Math.max(p.stunTimer, 0.5);
                spawnParticles(p.x, p.y, '#ff00ff', 5);
              }
            }
          }
          if(this.bachiraComboTimer >= 1.0){
            this.bachiraComboPhase = 2; this.bachiraComboTimer = 0;
            const fwdX = Math.cos(goalAng), fwdY = Math.sin(goalAng);
            this.vx += fwdX * 9; this.vy += fwdY * 9;
            this.dashTimer = Math.max(this.dashTimer, 0.65);
            showAbilityNotif('SOMBRERITO!', '#ffd700');
            spawnParticles(this.x, this.y, '#ffd700', 30);
          }
        } else if(this.bachiraComboPhase === 2){
          // SOMBRERITO (2.0 - 3.0s): lifts the ball and surges forward
          const t = Math.min(1, this.bachiraComboTimer / 1.0);
          const lunge = Math.sin(t * Math.PI) * 42;
          this.bachiraVisualX = Math.cos(goalAng) * lunge;
          this.bachiraVisualY = Math.sin(goalAng) * lunge;
          if(rng() < 0.35){
            for(const p of G.players){
              if(p.team === this.team) continue;
              if(dist(this, p) < 120){
                const ang = angleTo(this, p);
                p.vx += Math.cos(ang) * 14; p.vy += Math.sin(ang) * 14;
                p.stunTimer = Math.max(p.stunTimer, 0.8);
                spawnParticles(p.x, p.y, '#ffd700', 6);
              }
            }
          }
          if(this.hasBall && rng() < 0.35 && G.particles.length < MAX_PARTICLES){
            spawnParticles(G.ball.x, G.ball.y - 30, '#ffd700', 1);
          }
          if(this.bachiraComboTimer >= 1.0){
            this.bachiraCombo = false; this.bachiraBallImmune = 0;
          }
        }
      } else {
        // NORMAL: Just scissors (oscillate side to side for 1.5s)
        if(this.bachiraComboTimer < 1.5){
          const t = this.bachiraComboTimer;
          const perpAng = goalAng + Math.PI/2;
          this.bachiraVisualX = Math.sin(t * 14) * 14 * Math.cos(perpAng);
          this.bachiraVisualY = Math.sin(t * 14) * 14 * Math.sin(perpAng);
          // Push opponents
          if(rng() < 0.12){
            for(const p of G.players){
              if(p.team === this.team) continue;
              if(dist(this, p) < 80){
                const ang = angleTo(this, p);
                p.vx += Math.cos(ang) * 5; p.vy += Math.sin(ang) * 5;
                p.stunTimer = Math.max(p.stunTimer, 0.3);
                spawnParticles(p.x, p.y, '#ffd700', 2);
              }
            }
          }
        } else {
          this.bachiraCombo = false;
        }
      }
    }

    // === SAE: DIVINE DESTRUCTION COMBO (Scissors → Heel Lift → Elastica → Shot) ===
    this.saeVisualX = 0; this.saeVisualY = 0;
    if(this.saeCombo){
      if(!this.hasBall || this.stunTimer > 0 || this.freezeTimer > 0){
        this.saeCombo = false; this.saeBallImmune = 0;
      } else {
        this.saeComboTimer += dt;
        const saeGoalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
        const saeGoalY = FIELD.y + FIELD.h / 2;
        const saeGoalAng = angleTo(this, { x: saeGoalX, y: saeGoalY });
        const saePerpAng = saeGoalAng + Math.PI / 2;
        const saePush = (radius, force, stun) => {
          for(const p of G.players){
            if(p.team === this.team) continue;
            if(p.isControlImmune()) continue;
            if(dist(this, p) < radius){
              const ang = angleTo(this, p);
              p.vx += Math.cos(ang) * force;
              p.vy += Math.sin(ang) * force;
              p.stunTimer = Math.max(p.stunTimer, stun);
              spawnParticles(p.x, p.y, '#ff8c00', 5);
            }
          }
        };
        if(this.saeComboPhase === 0){
          // TIJERAS (0 - 0.8s): side-to-side scissors.
          const t = this.saeComboTimer;
          this.saeVisualX = Math.sin(t * 18) * 18 * Math.cos(saePerpAng);
          this.saeVisualY = Math.sin(t * 18) * 18 * Math.sin(saePerpAng);
          if(rng() < 0.18) saePush(95, 7, 0.35);
          if(this.saeComboTimer >= 0.8){
            this.saeComboPhase = 1; this.saeComboTimer = 0;
            showAbilityNotif('HEEL LIFT!', '#ff8c00');
            spawnParticles(this.x, this.y, '#ff8c00', 20);
          }
        } else if(this.saeComboPhase === 1){
          // SOMBRERITO / HEEL LIFT (0.8 - 1.6s): lift the ball and surge forward.
          const t = Math.min(1, this.saeComboTimer / 0.8);
          const lunge = Math.sin(t * Math.PI) * 42;
          this.saeVisualX = Math.cos(saeGoalAng) * lunge;
          this.saeVisualY = Math.sin(saeGoalAng) * lunge;
          if(rng() < 0.28) saePush(115, 10, 0.55);
          if(this.saeComboTimer >= 0.8){
            this.saeComboPhase = 2; this.saeComboTimer = 0;
            this.vx += Math.cos(saeGoalAng) * 8;
            this.vy += Math.sin(saeGoalAng) * 8;
            this.dashTimer = Math.max(this.dashTimer, 0.7);
            showAbilityNotif('ELÁSTICA!', '#ff8c00');
            spawnParticles(this.x, this.y, '#ff8c00', 26);
          }
        } else if(this.saeComboPhase === 2){
          // ELÁSTICA (1.6 - 2.4s): forward-back-forward feint, then shoot.
          const t = this.saeComboTimer;
          const feint = Math.sin(t * 16) * 16;
          this.saeVisualX = Math.cos(saeGoalAng) * feint;
          this.saeVisualY = Math.sin(saeGoalAng) * feint;
          if(rng() < 0.22) saePush(105, 8, 0.45);
          if(this.saeComboTimer >= 0.8){
            this.saeCombo = false; this.saeBallImmune = 0;
            const gk = G.players.find(p => p.team !== this.team && p.type === 'goalkeeper');
            let aimY = saeGoalY;
            if(gk) aimY = gk.y < saeGoalY ? saeGoalY + GOAL_W / 2 - 30 : saeGoalY - GOAL_W / 2 + 30;
            const shotAng = angleTo(this, { x: saeGoalX, y: aimY });
            G.ball.shoot(this, 30, shotAng, 2, 1.5, true);
            G.ball.saeGuaranteed = true;
            G.cameraShake = 16;
            spawnParticles(this.x, this.y, '#ff8c00', 45);
            showAbilityNotif('DIVINE DESTRUCTION!', '#ff8c00');
            audio.shoot(); audio.cheer(0.35);
          }
        }
      }
    }

    // === YUKIMIYA: three sequential La Boba feints on awakening ===
    if(this.yukimiyaBobaQueue > 0){
      if(!this.isAwakened){
        this.yukimiyaBobaQueue = 0;
        this.yukimiyaBobaTimer = 0;
      } else {
        this.yukimiyaBobaTimer -= dt;
        while(this.yukimiyaBobaQueue > 0 && this.yukimiyaBobaTimer <= 0){
          this.yukimiyaBobaQueue--;
          this.yukimiyaBobaTimer += 0.5;
          this.spawnYukimiyaBoba();
        }
      }
    }

    if(this.tackleActive > 0){
      spawnParticles(this.x, this.y, '#ff8c00', 2);
      for(const opp of G.players){
        if(opp.team === this.team || !opp.hasBall) continue;
        if(opp.nagiCharge > 0 && opp.heroKey === 'nagi'){
          this.tackleActive = 0;
          opp.nagiFakeVolley(this);
          return;
        }
        if(dist(this, opp) < PLAYER_R * (this.size + opp.size) + 8){
          let chance = 0.85 - opp.ballControl * 0.05;
          if(opp.activeTimer > 0 && opp.heroKey === 'bachira' && opp.isAwakened) chance = 0;
          if(opp.bachiraBallImmune > 0) chance = 0; // Bachira combo immune
          if(opp.saeBallImmune > 0) chance = 0; // Sae Divine Destruction combo immune
          if(opp.rivalKey === 'barou' && opp.activeTimer > 0) chance = 0; 
          if(opp.shieldTimer > 0) chance = 0; // Shield blocks tackles 
          if(opp.receiveImmunity > 0) chance = 0; // Brief immunity after receiving the ball
          if(opp.nagiCharge > 0 && opp.heroKey === 'nagi') chance = 0; // Nagi charge immune
          if(opp.nagiCharge > 0 && opp.heroKey === 'rin' && opp.isAwakened) chance = 0; // Awakened Rin time-freeze charge immune
          if(rng() < chance){
            opp.hasBall = false; G.ball.beOwnedBy(this); spawnParticles(this.x, this.y, '#00ff88', 15);
            this.tackleActive = 0; audio.tackle(); trackTackle(this); addCombo(this.team, 'tackle', this.x, this.y); return;
          } else {
            this.stunTimer = 0.5; spawnParticles(this.x, this.y, '#ff4444', 8);
            this.tackleActive = 0; audio.hit(); return;
          }
        }
      }
    }

    if(this.activeTimer > 0){
      if(this.rivalKey === 'barou'){
        for(const p of G.players){
          if(p.team === this.team) continue;
          if(p.isControlImmune()) continue;
          const d = dist(this, p);
          if(d < PLAYER_R * this.size + PLAYER_R * p.size + 5){
            const ang = angleTo(this, p); p.vx += Math.cos(ang) * 8; p.vy += Math.sin(ang) * 8;
            p.stunTimer = Math.max(p.stunTimer, this.isAwakened ? 2.0 : 0.5);
          }
        }
      }
      if(this.heroKey === 'chigiri' || this.heroKey === 'kurona' || this.rivalKey === 'shidou'){
        for(const opp of G.players){
          if(opp.team === this.team || !opp.hasBall) continue;
          if(opp.nagiCharge > 0 && opp.heroKey === 'nagi') continue; // Nagi charge immune
          if(opp.nagiCharge > 0 && opp.heroKey === 'rin' && opp.isAwakened) continue; // Awakened Rin time-freeze charge immune
          if(opp.receiveImmunity > 0) continue; // Brief immunity after receiving the ball
          if(dist(this, opp) < PLAYER_R * (this.size + opp.size) + 6){ opp.hasBall = false; G.ball.beOwnedBy(this); spawnParticles(this.x, this.y, '#00ff00', 12); break; }
        }
      }
      if(this.rivalKey === 'karasu'){
        for(const p of G.players){ if(p.team === this.team) continue; if(p.isControlImmune()) continue; if(dist(this, p) < 100){ p.vx *= 0.7; p.vy *= 0.7; } }
      }
    }

    if(this.rivalKey === 'aiku' && this.interceptActive > 0 && G.ball.state === 'shot' && G.ball.z < 25){
      const ballGoalX = this.team === 'red' ? FIELD.x : FIELD.x + FIELD.w;
      if((this.team === 'red' && G.ball.vx < -1) || (this.team === 'blue' && G.ball.vx > 1)){
        moveToward(this, G.ball.x, G.ball.y, 2.0);
      }
    }
  }

  canTackle(){ return this.tackleCd <= 0 && this.stunTimer <= 0 && !this.hasBall && this.tackleActive <= 0; }

  tackle(){
    if(!this.canTackle()) return false;
    this.tackleCd = 3.1;
    this.tackleActive = 0.3;
    
    const dashDir = (Math.hypot(this.vx, this.vy) > 0.1) ? normalize({x:this.vx, y:this.vy}) : {x:Math.cos(this.facingAngle), y:Math.sin(this.facingAngle)};
    const dashPower = this.heroKey === 'kurona' ? 22 : 20;
    this.vx += dashDir.x * dashPower;
    this.vy += dashDir.y * dashPower;
    spawnParticles(this.x, this.y, '#ff8c00', 10);
    audio.tackle();
    return true;
  }

  // Trap feint: when a rival tries to steal during Nagi's charge, he dashes away.
  // Awakened chains four fake volleys before queuing the Five Stage Volley.
  nagiFakeVolley(opponent){
    if(this.heroKey !== 'nagi') return;
    if(opponent && !opponent.isControlImmune()){
      opponent.stunTimer = Math.max(opponent.stunTimer, 1.6);
      opponent.slowTimer = Math.max(opponent.slowTimer, 2.0);
      spawnParticles(opponent.x, opponent.y, '#00e5ff', 8);
    }
    this.nagiCharge = 0;
    const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
    const goalAng = angleTo(this, {x:goalX, y:FIELD.y + FIELD.h/2});
    this.vx = Math.cos(goalAng) * 18;
    this.vy = Math.sin(goalAng) * 18;
    this.facingAngle = goalAng;
    if(this.isAwakened){
      this.nagiFakeCount = Math.min(this.nagiFakeCount + 1, 4);
      spawnParticles(this.x, this.y, '#00e5ff', 24);
      showAbilityNotif('FAKE VOLLEY ' + this.nagiFakeCount + '/4', '#00e5ff');
      if(this.nagiFakeCount >= 4){
        this.nagiSkullShot = true;
        this.nagiVolleyLock = 0.35;
        this.pendingShot = 0.22;
        G.cameraShake = Math.max(G.cameraShake, 9);
        spawnParticles(this.x, this.y, '#7ffcff', 20);
      }
    } else {
      spawnParticles(this.x, this.y, '#b14aed', 18);
      showAbilityNotif('FAKE VOLLEY!', '#b14aed');
    }
    audio.hit();
  }

  spawnYukimiyaBoba(){
    const config = HEROES.yukimiya;
    const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
    const goalAng = angleTo(this, {x: goalX, y: FIELD.y + FIELD.h/2});
    const spread = this.isAwakened ? this.yukimiyaBobaSide * 0.6 : 0;
    const ghostSpeed = this.speed * (this.isAwakened ? 0.65 : 1.2);
    const ghostAng = goalAng + spread;
    // Every boba includes the same sideways dash as the normal ability.
    const dashAng = goalAng + (rng() < 0.5 ? Math.PI/2 : -Math.PI/2);
    this.vx += Math.cos(dashAng) * 15;
    this.vy += Math.sin(dashAng) * 15;
    this.dashTimer = Math.max(this.dashTimer, config.activeDuration);
    this.yukimiyaBobaSide *= -1;
    G.yukimiyaGhosts.push({
      x: this.x, y: this.y,
      vx: Math.cos(ghostAng) * ghostSpeed,
      vy: Math.sin(ghostAng) * ghostSpeed,
      life: 1.2, maxLife: 1.2,
      color: config.color,
      size: this.isAwakened ? this.size : this.size * 1.3
    });
    const stunRadius = this.isAwakened ? 150 : 120;
    const stunDuration = this.isAwakened ? 1.2 : 0.8;
    for(const p of G.players){
      if(p.team === this.team) continue;
      if(p.isControlImmune()) continue;
      if(dist(this, p) < stunRadius){
        p.stunTimer = Math.max(p.stunTimer, stunDuration);
        spawnParticles(p.x, p.y, config.color, 8);
      }
    }
    spawnParticles(this.x, this.y, this.isAwakened ? '#ff00ff' : config.color, this.isAwakened ? 12 : 18);
  }

  isControlImmune(){
    // Only awakened Bachira's combo is control-immune. His base ability just
    // cleanses existing control effects on activation.
    return this.heroKey === 'bachira' && this.isAwakened && (this.bachiraCombo || this.bachiraBallImmune > 0);
  }

  useAbility(){
    if(this.activeCd > 0 || !this.charKey) return false;
    if(this.heroKey === 'nagi' && this.nagiVolleyLock > 0) return false;
    const config = this.getConfig(); if(!config) return false;
    // Habilidades de disparo/regate necesitan balón; las de movimiento/defensa no.
    const needsBall = ['rin','bachira','hiori','ness','kurona'].includes(this.heroKey);
    if(needsBall && !this.hasBall) return false;
    if(this.heroKey === 'kiyora'){
      if(this.hasBall){
        if(!this.findKiyoraPassTarget()){ showAbilityNotif('SIN RECEPTOR', config.color); return false; }
      } else {
        const ballOwner = G.ball.owner;
        const canClear = !!ballOwner && ballOwner.team !== this.team && dist(this, G.ball) < 200;
        if(!canClear){ showAbilityNotif('SIN RIVAL CON BALÓN', config.color); return false; }
      }
    }
    let nessTarget = null;
    if(this.heroKey === 'ness'){
      nessTarget = this.findNessPassTarget();
      if(!nessTarget){ showAbilityNotif('SIN RECEPTOR', config.color); return false; }
    }
    const offBallNagiTrap = this.heroKey === 'nagi' && !this.hasBall;
    this.activeTimer = config.activeDuration;
    // Awakened Nagi keeps the on-ball ability ready until the fourth fake volley
    // fires the Five Stage Volley. The off-ball Trap dash is a separate entry,
    // so it does start the cooldown even while awakened.
    this.activeCd = (this.heroKey === 'nagi' && this.isAwakened && !offBallNagiTrap) ? 0 : config.activeCooldown;
    if(this.heroKey !== 'kaiser' && this.rivalKey !== 'sae' && !offBallNagiTrap) showAbilityNotif((this.isAwakened ? 'AWAKENED ' : '') + config.active, this.isAwakened ? '#ff00ff' : config.color);
    audio.ability();
    
    if(this.heroKey === 'bachira'){
      // BACHIRA: Scissors Dribble (Normal) / Elastic Sombrero Combo (Awakened)
      // Both forms cleanse control effects on activation. Only the awakened
      // combo keeps immunity afterward.
      this.stunTimer = 0;
      this.slowTimer = 0;
      this.kuronaSlowTimer = 0;
      this.freezeTimer = 0;
      this.bachiraCombo = true; this.bachiraComboPhase = 0; this.bachiraComboTimer = 0;
      this.bachiraBallImmune = this.isAwakened ? 3.0 : 0;
      this.dashTimer = this.isAwakened ? 3.0 : 1.5;
      spawnParticles(this.x, this.y, this.isAwakened ? '#ff00ff' : config.color, 30);
      showAbilityNotif(this.isAwakened ? 'SCISSORS!' : 'SCISSORS!', this.isAwakened ? '#ff00ff' : config.color);
      G.cameraShake = 4;
      // Initial push
      for(const p of G.players){
        if(p.team === this.team) continue;
        if(dist(this, p) < 80){
          const ang = angleTo(this, p);
          p.vx += Math.cos(ang) * 8; p.vy += Math.sin(ang) * 8;
          p.stunTimer = Math.max(p.stunTimer, 0.4);
          spawnParticles(p.x, p.y, this.isAwakened ? '#ff00ff' : '#ffd700', 8);
        }
      }
    }
    else if(this.heroKey === 'chigiri'){
      this.dashTimer = config.activeDuration;
      spawnParticles(this.x, this.y, '#e8365d', 25);
      // Chigiri awakened: mini dash burst (half tackle)
      if(this.isAwakened){
        const dashDir = (Math.hypot(this.vx, this.vy) > 0.1) ? normalize({x:this.vx, y:this.vy}) : {x:Math.cos(this.facingAngle), y:Math.sin(this.facingAngle)};
        this.vx += dashDir.x * 10;
        this.vy += dashDir.y * 10;
        spawnParticles(this.x, this.y, '#e8365d', 15);
      }
    }
    else if(this.heroKey === 'kurona'){
      // PLANETARY HOTLINE: Kurona dashes forward, starts a give-and-go, and
      // leaves a 3s black hole that slows rivals caught in its gravity well.
      this.dashTimer = Math.max(this.dashTimer, config.activeDuration);
      const hotlineColor = this.isAwakened ? '#ff00ff' : config.color;
      G.kuronaBlackHoles.push({
        x: this.x, y: this.y,
        radius: this.isAwakened ? 250 : 220,
        life: 3.0, maxLife: 3.0,
        team: this.team,
        hit: new Set(),
        spin: rng() * Math.PI * 2
      });
      spawnParticles(this.x, this.y, '#b026ff', 24);
      spawnParticles(this.x, this.y, '#00e5ff', 18);
      const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
      const goalAng = angleTo(this, {x: goalX, y: FIELD.y + FIELD.h/2});
      this.vx += Math.cos(goalAng) * 14;
      this.vy += Math.sin(goalAng) * 14;
      spawnParticles(this.x, this.y, hotlineColor, 28);
      G.cameraShake = Math.max(G.cameraShake || 0, 5);
      let target = this.findBestPassTarget();
      if(!target){
        const mates = G.players.filter(p => p.team === this.team && p !== this && p.type !== 'goalkeeper');
        let bestD = Infinity;
        for(const m of mates){
          const d = dist(this, m);
          if(d > 30 && d < 1200 && d < bestD){ bestD = d; target = m; }
        }
      }
      if(target && this.hasBall){
        this.doPass(target);
        G.ball.perfectHoming = true;
        G.ball.planetaryHotline = 'outbound';
        showAbilityNotif(this.isAwakened ? 'APEX HOTLINE!' : 'PLANETARY HOTLINE!', hotlineColor);
      } else {
        showAbilityNotif('PLANETARY DASH!', hotlineColor);
      }
    }
    else if(this.heroKey === 'yukimiya'){
      // LA BOBA: Awakened does three quick, shorter phantom feints in a row.
      this.yukimiyaBobaSide = 1;
      this.yukimiyaControlImmune = Math.max(this.yukimiyaControlImmune, config.activeDuration);
      suppressControlEffects(this);
      if(this.isAwakened){
        this.yukimiyaBobaQueue = 2;
        this.yukimiyaBobaTimer = 0.5;
      } else {
        this.yukimiyaBobaQueue = 0;
        this.yukimiyaBobaTimer = 0;
      }
      // Each boba (including all three awakened follow-ups) performs its dash.
      this.spawnYukimiyaBoba();
      spawnParticles(this.x, this.y, this.isAwakened ? '#ff00ff' : config.color, 30);
      showAbilityNotif(this.isAwakened ? 'PHANTOM FEINT x3!' : 'LA BOBA!', this.isAwakened ? '#ff00ff' : config.color);
      audio.ability();
    }
    else if(this.heroKey === 'nagi'){
      if(!this.hasBall){
        // Off-ball Trap: dash toward the ball. Catching it during the dash
        // stuns nearby rivals and fires the normal Trap Shot.
        const ballAng = angleTo(this, G.ball);
        const dashSpeed = this.isAwakened ? 24 : 22;
        this.vx = Math.cos(ballAng) * dashSpeed;
        this.vy = Math.sin(ballAng) * dashSpeed;
        this.facingAngle = ballAng;
        this.nagiTrapDash = 0.5;
        this.dashTimer = Math.max(this.dashTimer, 0.5);
        spawnParticles(this.x, this.y, config.color, 22);
        showAbilityNotif('TRAP!', config.color);
      } else {
        // Trap: charge the normal trap shot. If a rival tries to steal during
        // the charge, Nagi feints with the fake-volley dash instead.
        this.nagiCharge = 0.6;
        this.vx *= 0.5; this.vy *= 0.5;
        showAbilityNotif('TRAP', config.color);
      }
    }
    else if(this.heroKey === 'rin'){
      // RIN: charge a curved shot while slowing everyone else
      if(this.hasBall){
        const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
        const goalAng = angleTo(this, {x:goalX, y:FIELD.y + FIELD.h/2});
        const chargeDuration = this.isAwakened ? 1.0 : 0.6;
        this.rinChargeDuration = chargeDuration;
        if(this.isAwakened){
          // AWAKENED: time-freeze charge — stay in place, then fire the curved shot
          this.vx *= 0.5; this.vy *= 0.5;
          this.facingAngle = goalAng;
          for(const p of G.players){
            if(p === this) continue;
            if(p.isControlImmune()) continue;
            p.freezeTimer = Math.max(p.freezeTimer, chargeDuration + 0.15);
            p.vx *= 0.2; p.vy *= 0.2;
          }
          spawnParticles(this.x, this.y, '#00e5ff', 12);
          spawnParticles(this.x, this.y, '#ff00ff', 12);
          G.cameraShake = Math.max(G.cameraShake, 10);
        } else {
          this.vx *= 0.5; this.vy *= 0.5;
          for(const p of G.players){
            if(p === this) continue;
            if(p.isControlImmune()) continue;
            p.slowTimer = Math.max(p.slowTimer, chargeDuration + 0.1);
          }
          spawnParticles(this.x, this.y, config.color, 10);
        }
        this.nagiCharge = chargeDuration; // Charge then fire
        spawnParticles(this.x, this.y, config.color, 20);
        showAbilityNotif(this.isAwakened ? 'PULVERIZE CURVE — TIME FREEZE!' : 'PULVERIZE!', this.isAwakened ? '#ff00ff' : config.color);
        return true;
      }
      this.doShoot(true);
    }
    else if(this.heroKey === 'isagi'){
      // ISAGI: Off-ball ability.
      // 1) If a loose ball is very close, fire the base Direct Shot immediately.
      // 2) Otherwise, arm the automatic shot for the next reception.
      const looseBallRange = 150;
      const looseBallNear = !this.hasBall && G.ball && G.ball.state === 'free' && dist(this, G.ball) < looseBallRange;
      if(looseBallNear){
        const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
        const goalY = FIELD.y + FIELD.h/2;
        let shotAngle = angleTo(this, {x:goalX, y:goalY});
        const gk = G.players.find(p => p.team !== this.team && p.type === 'goalkeeper');
        if(gk){
          const topAng = angleTo(this, {x:goalX, y:FIELD.y + FIELD.h/2 - GOAL_W/2 + 20});
          const botAng = angleTo(this, {x:goalX, y:FIELD.y + FIELD.h/2 + GOAL_W/2 - 20});
          shotAngle = Math.abs(topAng - shotAngle) < Math.abs(botAng - shotAngle) ? topAng : botAng;
        }
        const power = 14; const height = 3; const curve = 0;
        G.ball.shoot(this, power, shotAngle, height, curve, true);
        spawnParticles(this.x, this.y, this.isAwakened ? '#ff00ff' : config.color, 25);
        G.cameraShake = Math.max(G.cameraShake || 0, 8);
        showAbilityNotif(this.isAwakened ? "WORLD'S BEST SHOT!" : 'DIRECT SHOT!', this.isAwakened ? '#ff00ff' : config.color);
        return true;
      }
      this.isagiAutoTimer = this.isAwakened ? 5.0 : 4.0;
      this.isagiAutoPending = false;
      if(this.isAwakened){
        let dashDir;
        const ballDx = G.ball ? G.ball.x - this.x : 0;
        const ballDy = G.ball ? G.ball.y - this.y : 0;
        if(G.ball && G.ball.state === 'pass' && G.ball.passTarget === this && Math.hypot(ballDx, ballDy) > 5){
          // Dash toward the incoming pass instead of away from it.
          dashDir = normalize({x:ballDx, y:ballDy});
        } else if(Math.hypot(this.vx, this.vy) > 0.5){
          dashDir = normalize({x:this.vx, y:this.vy});
        } else {
          const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
          const goalAng = angleTo(this, {x:goalX, y:FIELD.y + FIELD.h/2});
          dashDir = {x:Math.cos(goalAng), y:Math.sin(goalAng)};
        }
        this.vx += dashDir.x * 14;
        this.vy += dashDir.y * 14;
        this.dashTimer = Math.max(this.dashTimer, 0.5);
        G.cameraShake = Math.max(G.cameraShake || 0, 7);
        spawnParticles(this.x, this.y, '#ff00ff', 30);
        showAbilityNotif("WORLD'S BEST DASH!", '#ff00ff');
      } else {
        spawnParticles(this.x, this.y, config.color, 20);
        showAbilityNotif('DIRECT SHOT READY!', config.color);
      }
    }
    else if(this.heroKey === 'hiori'){
      const hioriColor = '#87ceeb';
      if(this.isAwakened){
        // Awakened Cold Pass: create a light-blue snowflake area.
        // Rivals hit by the area are frozen for 1.5s and slowed for 3s.
        G.hioriSnowfields.push({
          x: this.x, y: this.y,
          radius: 240,
          life: 1.5, maxLife: 1.5,
          team: this.team,
          hit: new Set()
        });
        spawnParticles(this.x, this.y, '#00e5ff', 22);
        spawnParticles(this.x, this.y, '#c8ffff', 16);
        G.cameraShake = Math.max(G.cameraShake || 0, 6);
        showAbilityNotif('SYSTEM OVERRIDE: FROST FIELD!', '#00e5ff');
      } else {
        // Slow all opponents
        for(const p of G.players){
          if(p.team === this.team) continue;
          if(p.isControlImmune()) continue;
          p.slowTimer = Math.max(p.slowTimer, 1.5);
          spawnParticles(p.x, p.y, hioriColor, 8);
        }
      }
      const mates = G.players.filter(p => p.team === this.team && p !== this);
      let best = null, bestAdv = -Infinity;
      const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
      for(const m of mates){
        const adv = this.team === 'blue' ? m.x : -m.x;
        if(adv > bestAdv){ bestAdv = adv; best = m; }
      }
      // Allied Hiori prefers the human player when you are in a useful forward position
      const human = G.players.find(p => p.isHuman && p.team === this.team && p !== this);
      if(human && human.type !== 'goalkeeper' && dist(this, human) < 1400){
        const humanForward = this.team === 'blue' ? human.x >= this.x - 200 : human.x <= this.x + 200;
        if(humanForward) best = human;
      }
      if(best && this.hasBall){
        const ang = angleTo(this, best);
        G.ball.shoot(this, 12, ang, 4, this.isAwakened ? 2.5 : 1.5, true);
        G.ball.state = 'pass'; G.ball.uninterceptablePass = false; G.ball.passTarget = best; G.ball.perfectHoming = true; this.hasBall = false;
        spawnParticles(this.x, this.y, hioriColor, 20);
      }
    }
    else if(this.rivalKey === 'sae'){
      // SAE OFF-BALL: Off Balance freezes the ball carrier; otherwise Genius Flow.
      if(!this.hasBall){
        const ballOwner = G.ball.owner;
        if(ballOwner && ballOwner.team !== this.team && !ballOwner.isControlImmune() && dist(this, ballOwner) <= SAE_OFF_BALANCE_RANGE){
          // OFF BALANCE: freeze the ball carrier for 1s and dash toward them.
          ballOwner.freezeTimer = Math.max(ballOwner.freezeTimer, 1.0);
          ballOwner.vx = 0; ballOwner.vy = 0;
          if(typeof ballOwner.cancelShotCharge === 'function') ballOwner.cancelShotCharge();
          const targetAng = angleTo(this, ballOwner);
          this.vx += Math.cos(targetAng) * 8;
          this.vy += Math.sin(targetAng) * 8;
          this.dashTimer = Math.max(this.dashTimer, 0.6);
          // Off Balance is a guaranteed 1s freeze, so it needs a much longer
          // cooldown than the other Sae branches.
          this.activeCd = 10.0;
          spawnParticles(ballOwner.x, ballOwner.y, '#7ffcff', 30);
          spawnParticles(this.x, this.y, '#ff8c00', 18);
          showAbilityNotif('OFF BALANCE!', '#7ffcff');
          G.cameraShake = Math.max(G.cameraShake || 0, 7);
          audio.ability(); audio.hit();
          return true;
        }
        // GENIUS FLOW: awakening + speed boost, but with a longer cooldown.
        this.isAwakened = true; this.awakening = 0; this.awakeningTimer = this.awakenDuration;
        this.saeFlowTimer = Math.max(this.saeFlowTimer, 3.5);
        this.activeTimer = Math.max(this.activeTimer, 3.5);
        this.dashTimer = Math.max(this.dashTimer, 0.6);
        this.activeCd = 8.0;
        spawnParticles(this.x, this.y, '#ff8c00', 40);
        showAbilityNotif('GENIUS FLOW!', '#ff8c00');
        G.cameraShake = Math.max(G.cameraShake || 0, 8);
        audio.awaken(); audio.cheer(0.25);
        return true;
      }
      // SAE ON-BALL AWAKENED: Divine Destruction dribble + shot combo.
      if(this.isAwakened){
        this.saeCombo = true; this.saeComboPhase = 0; this.saeComboTimer = 0;
        this.saeBallImmune = 2.4;
        this.dashTimer = Math.max(this.dashTimer, 2.4);
        this.activeTimer = 2.4;
        this.activeCd = 2.5; // Awakened Sae can chain Divine Destruction much sooner.
        this.aiTimer = 2.4;
        spawnParticles(this.x, this.y, '#ff8c00', 35);
        showAbilityNotif('TIJERAS!', '#ff8c00');
        G.cameraShake = Math.max(G.cameraShake || 0, 10);
        audio.ability(); audio.cheer(0.3);
        return true;
      }
      // SAE ON-BALL BASE: Genius Command — stun, dribble push, and pass to Shidou.
      for(const p of G.players){
        if(p.team === this.team) continue;
        if(p.isControlImmune()) continue;
        const d = dist(this, p);
        if(d < 130){
          // Stun, knockback and slow nearby opponents (dribble effect)
          const ang = angleTo(this, p);
          p.vx += Math.cos(ang) * 10;
          p.vy += Math.sin(ang) * 10;
          p.stunTimer = Math.max(p.stunTimer, 0.8);
          p.slowTimer = Math.max(p.slowTimer, 3.0);
        }
      }
      const shidou = G.players.find(p => p.team === this.team && p.rivalKey === 'shidou');
      if(shidou){
        shidou.commandRun = 3.0;
        shidou.aiTimer = 0;
        if(this.hasBall && G.ball.owner === this && G.ball.state === 'owned'){
          // Use the regular pass system: no spin or bouncing, so the ball cannot
          // orbit Shidou or keep spinning after a missed command pass.
          const commandPower = clamp(dist(this, shidou) * 0.03 + 8, 8, 22);
          G.ball.pass(this, shidou, commandPower);
        }
      }
      // Epic dribble visual
      this.dashTimer = config.activeDuration;
      G.cameraShake = 8;
      spawnParticles(this.x, this.y, '#ff8c00', 40);
      showAbilityNotif('GENIUS COMMAND!', '#ff8c00');
      audio.ability(); audio.cheer(0.25);
    }
    else if(this.rivalKey === 'shidou'){
      // Shidou animation
      G.shidouAnimActive = true;
      G.shidouAnimTimer = 0.8;
      G.shidouAnimPlayer = this;
      // If awaken + in rival half: guaranteed goal
      if(this.isAwakened && this.hasBall){
        const goalX = this.team === 'red' ? FIELD.x : FIELD.x + FIELD.w;
        const inRivalHalf = (this.team === 'red') ? (this.x < FIELD.x + FIELD.w/2) : (this.x > FIELD.x + FIELD.w/2);
        if(inRivalHalf){
          // Guaranteed goal shot — low and fast, straight into the goal
          const gk = G.players.find(p => p.team !== this.team && p.type === 'goalkeeper');
          let aimY = FIELD.y + FIELD.h/2;
          if(gk){
            aimY = gk.y < FIELD.y + FIELD.h/2 ? (FIELD.y + FIELD.h/2 + GOAL_W/2 - 20) : (FIELD.y + FIELD.h/2 - GOAL_W/2 + 20);
          }
          const goalAng = angleTo(this, {x: goalX, y: aimY});
          G.ball.shoot(this, 30, goalAng, 2, 0, true);
          G.ball.vx = Math.cos(goalAng) * 28;
          G.ball.vy = Math.sin(goalAng) * 28;
          G.ball.vz = 2; // Keep the ball LOW — no more flying over the goal
          G.ball.spin = 0; // No curve, straight shot
          G.ball.shidouGuaranteed = true;
          G.cameraShake = 18;
          for(let i = 0; i < 40; i++) spawnParticles(this.x, this.y, '#ff0000', 2);
          showAbilityNotif('🔥 WILD KING GUARANTEED 🔥', '#ff0000');
          audio.shoot(); audio.cheer(0.35);
          return true;
        }
      }
      this.doShoot(true);
      G.cameraShake = 12;
    }
    else if(this.rivalKey === 'aiku'){
      this.interceptActive = 4.0;
      spawnParticles(this.x, this.y, '#00ff88', 30);
    }
    else if(this.rivalKey === 'kunigami'){
      // Kunigami active: POWER DASH — dash forward and push nearby rivals
      const dashDir = (Math.hypot(this.vx, this.vy) > 0.5) ? normalize({x:this.vx, y:this.vy}) : {x:Math.cos(this.facingAngle), y:Math.sin(this.facingAngle)};
      const dashSpeed = this.isAwakened ? 16 : 12;
      this.vx += dashDir.x * dashSpeed;
      this.vy += dashDir.y * dashSpeed;
      this.dashTimer = this.activeTimer;
      // Push and stun nearby enemies on activation
      const pushRadius = this.isAwakened ? 200 : 160;
      for(const p of G.players){
        if(p.team === this.team) continue;
        if(p.isControlImmune()) continue;
        const d = dist(this, p);
        if(d < pushRadius){
          const ang = angleTo(this, p);
          const pushPower = this.isAwakened ? 22 : 16;
          p.vx += Math.cos(ang) * pushPower;
          p.vy += Math.sin(ang) * pushPower;
          p.stunTimer = Math.max(p.stunTimer, this.isAwakened ? 2.2 : 1.4);
          spawnParticles(p.x, p.y, '#ff8c00', 10);
        }
      }
      G.cameraShake = 10;
      spawnParticles(this.x, this.y, '#ff8c00', 35);
      showAbilityNotif(this.isAwakened ? 'POWER DASH!' : 'POWER DASH!', this.isAwakened ? '#ff00ff' : '#ff8c00');
      audio.ability();
    }
    else if(this.rivalKey === 'karasu' || this.rivalKey === 'reo'){ 
      this.dashTimer = config.activeDuration;
      // Karasu: enhanced zone control — stun + slow nearby enemies
      if(this.rivalKey === 'karasu'){
        const crowLife = this.isAwakened ? 1.8 : 1.5;
        G.karasuCrow = {
          player: this,
          x: this.x,
          y: this.y,
          life: crowLife,
          maxLife: crowLife,
          team: this.team
        };
        G.cameraShake = Math.max(G.cameraShake || 0, this.isAwakened ? 12 : 8);
        spawnParticles(this.x, this.y, '#b14aed', 26);
        spawnParticles(this.x, this.y, '#ff4fd8', 18);
        spawnParticles(this.x, this.y, '#00e5ff', 10);
        for(const p of G.players){
          if(p.team === this.team) continue;
          if(p.isControlImmune()) continue;
          const d = dist(this, p);
          if(d < 150){
            const ang = angleTo(this, p);
            p.vx += Math.cos(ang) * 6;
            p.vy += Math.sin(ang) * 6;
            p.stunTimer = Math.max(p.stunTimer, this.isAwakened ? 1.2 : 0.6);
            p.slowTimer = Math.max(p.slowTimer, 2.5);
            spawnParticles(p.x, p.y, '#b14aed', 5);
          }
        }
        showAbilityNotif('⚡ ZONE CONTROL ⚡', '#b14aed');
      }
      // Reo: copycat dash — if near ball carrier, steal the ball
      if(this.rivalKey === 'reo' && !this.hasBall){
        const owner = G.ball.owner;
        if(owner && owner.team !== this.team){
          const d = dist(this, owner);
          if(d < PLAYER_R * (this.size + owner.size) + 30){
            let stealChance = 0.75;
            if(owner.activeTimer > 0) stealChance = 0;
            if(owner.shieldTimer > 0) stealChance = 0;
            if(owner.receiveImmunity > 0) stealChance = 0;
            if(owner.nagiCharge > 0 && owner.heroKey === 'nagi') stealChance = 0; // Nagi charge immune
            if(owner.nagiCharge > 0 && owner.heroKey === 'rin' && owner.isAwakened) stealChance = 0; // Awakened Rin time-freeze charge immune
            if(rng() < stealChance){
              owner.hasBall = false; G.ball.beOwnedBy(this);
              spawnParticles(this.x, this.y, '#b14aed', 20);
              audio.tackle();
              // Immediately look for a forward to pass to
              const forwards = G.players.filter(p => p.team === this.team && p !== this && p.type !== 'goalkeeper' && p.role === 'FWD');
              const target = forwards.length > 0 ? forwards.reduce((best, f) => {
                const goalX = this.team === 'red' ? FIELD.x : FIELD.x + FIELD.w;
                const adv = this.team === 'red' ? -f.x : f.x;
                const bestAdv = this.team === 'red' ? -best.x : best.x;
                return adv < bestAdv ? f : best;
              }) : null;
              if(target){ this.doPass(target); }
            }
          }
        }
        showAbilityNotif('⚡ COPYCAT STEAL ⚡', '#b14aed');
      }
      if(this.rivalKey === 'reo') showAbilityNotif('⚡ COPYCAT ⚡', '#b14aed');
      spawnParticles(this.x, this.y, config.color, 25);
    }
    else if(this.rivalKey === 'barou'){
      // Barou active: zigzag shield charge toward goal
      this.dashTimer = config.activeDuration;
      this.shieldTimer = config.activeDuration;
      this.barouZigzag = true;
      spawnParticles(this.x, this.y, '#ffd700', 35);
      showAbilityNotif('CHARGING KING!', '#ffd700');
      audio.ability();
    }
    else if(this.rivalKey === 'otoya'){ const dir = this.team === 'red' ? -1 : 1; this.x += dir * (this.isAwakened ? 180 : 100); this.x = clamp(this.x, FIELD.x + PLAYER_R, FIELD.x + FIELD.w - PLAYER_R); spawnParticles(this.x, this.y, config.color, 15); }
    // === NEW HERO ABILITIES ===
    else if(this.heroKey === 'kaiser'){
      // KAISER: Off-ball = Emperor's Route zigzag dash, then a 2s Kaiser Impact window.
      // With ball = direct Kaiser Impact; awakened direct version is a dash + curved shot.
      if(!this.hasBall){
        const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
        const goalAng = angleTo(this, {x: goalX, y: FIELD.y + FIELD.h/2});
        this.kaiserRouteTimer = this.isAwakened ? 0.82 : 0.68;
        this.kaiserRouteShotTimer = 2.0;
        this.kaiserRoutePhase = 0;
        this.activeTimer = 2.0;
        this.dashTimer = this.kaiserRouteTimer;
        const launchPower = this.isAwakened ? 10 : 8;
        this.vx += Math.cos(goalAng) * launchPower;
        this.vy += Math.sin(goalAng) * launchPower;
        spawnParticles(this.x, this.y, '#ff4fd8', 16);
        spawnParticles(this.x, this.y, '#4fc3f7', 16);
        G.cameraShake = 5;
        showAbilityNotif(this.isAwakened ? 'RUTA DEL EMPERADOR: ZERO!' : 'RUTA DEL EMPERADOR!', this.isAwakened ? '#ff00ff' : '#ff4fd8');
      } else if(this.isAwakened){
        const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
        const goalAng = angleTo(this, {x: goalX, y: FIELD.y + FIELD.h/2});
        this.vx += Math.cos(goalAng) * 12; this.vy += Math.sin(goalAng) * 12;
        for(const p of G.players){ if(p.team === this.team) continue; if(p.isControlImmune()) continue; if(dist(this, p) < 90){ p.stunTimer = Math.max(p.stunTimer, 1.5); } }
        G.cameraShake = 8; spawnParticles(this.x, this.y, '#e040fb', 25);
        showAbilityNotif('KAISER IMPACT ZERO!', '#ff00ff');
        this.pendingShot = 0.3;
      } else {
        spawnParticles(this.x, this.y, '#e040fb', 20);
        G.cameraShake = 6;
        showAbilityNotif('KAISER IMPACT!', '#e040fb');
        this.doShoot(true);
      }
    }
    else if(this.heroKey === 'ness'){
      // NESS: Uninterceptable pass. Normal resets the receiver's cooldown; awakened grants them the awakening.
      const target = nessTarget;
      const passColor = this.isAwakened ? '#ff00ff' : '#4488ff';
      this.doPass(target);
      G.ball.perfectHoming = true;
      G.ball.uninterceptablePass = true;
      spawnParticles(this.x, this.y, passColor, 24);
      G.cameraShake = Math.max(G.cameraShake || 0, 5);
      if(this.isAwakened){
        if(!grantAwakening(target)) showAbilityNotif('WORLD CLASS PASS · ' + target.getName(), passColor);
      } else {
        target.activeCd = 0;
        showAbilityNotif('COOLDOWN RESET · ' + target.getName(), passColor);
      }
      if(this.isHuman) switchToHumanPlayer(target);
    }
    else if(this.heroKey === 'kiyora'){
      const awakened = this.isAwakened;
      const hasBallNow = this.hasBall;
      const stunDuration = hasBallNow ? (awakened ? 2.3 : 1.3) : (awakened ? 2.8 : 1.8);
      const stunRadius = hasBallNow ? (awakened ? 260 : 220) : (awakened ? 240 : 200);
      this.kiyoraSpinTimer = hasBallNow ? 0.6 : 0.4;
      this.kiyoraSpinPassPending = hasBallNow;
      this.kiyoraSpinAngle = this.facingAngle;
      this.vx = 0; this.vy = 0;
      for(const p of G.players){
        if(p.team === this.team) continue;
        if(p.isControlImmune()) continue;
        if(dist(this, p) < stunRadius){
          p.stunTimer = Math.max(p.stunTimer, stunDuration);
          spawnParticles(p.x, p.y, awakened ? '#ff00ff' : '#00e5a0', 4);
        }
      }
      if(!hasBallNow){
        const owner = G.ball.owner;
        if(owner && owner.team !== this.team) owner.hasBall = false;
        const clearGoalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
        let clearAng = angleTo(this, {x: clearGoalX, y: FIELD.y + FIELD.h/2});
        clearAng += (rng() - 0.5) * 0.5;
        G.ball.state = 'free'; G.ball.owner = null; G.ball.passTarget = null;
        G.ball.perfectHoming = false; G.ball.uninterceptablePass = false;
        G.ball.x = this.x + Math.cos(clearAng) * (PLAYER_R * this.size + BALL_R + 2);
        G.ball.y = this.y + Math.sin(clearAng) * (PLAYER_R * this.size + BALL_R + 2);
        G.ball.z = 4; G.ball.vx = Math.cos(clearAng) * (awakened ? 22 : 18);
        G.ball.vy = Math.sin(clearAng) * (awakened ? 22 : 18); G.ball.vz = 2;
        G.ball.spin = 0.15; G.ball.shotPower = 0;
        spawnParticles(G.ball.x, G.ball.y, awakened ? '#ff00ff' : '#00e5a0', 15);
      }
      if(awakened){
        for(let i = 0; i < 3; i++){
          G.illusions.push({x:this.x, y:this.y, vx:(rng()-0.5)*4, vy:(rng()-0.5)*4, life:1.2, maxLife:1.2});
        }
      }
      spawnParticles(this.x, this.y, awakened ? '#ff00ff' : '#00e5a0', 24);
      G.cameraShake = awakened ? 8 : 6;
      showAbilityNotif(hasBallNow ? (awakened ? 'BREAKDANCE STORM!' : 'BREAKDANCE SPIN!') : 'RECHAZO!', awakened ? '#ff00ff' : config.color);
    }
    else if(this.heroKey === 'kunigami'){
      this.shieldTimer = Math.max(this.shieldTimer, this.isAwakened ? 4.0 : 2.5);
      this.dashTimer = this.isAwakened ? 1.5 : 1.0;
      const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
      const goalAng = angleTo(this, {x: goalX, y: FIELD.y + FIELD.h/2});
      this.vx += Math.cos(goalAng) * 14; this.vy += Math.sin(goalAng) * 14;
      spawnParticles(this.x, this.y, config.color, 15); audio.ability();
    }
    // === NEW RIVAL ABILITIES ===
    else if(this.rivalKey === 'snuffy'){
      if(this.hasBall){ const target = this.findBestPassTarget(); if(target){ this.doPass(target); G.ball.perfectHoming = true; } }
      for(const p of G.players){ if(p.team === this.team && dist(this, p) < 200){ p.slowTimer = 0; p.kuronaSlowTimer = 0; } }
      spawnParticles(this.x, this.y, '#ff4444', 15);
    }
    else if(this.rivalKey === 'aryu'){
      this.tackleCd = 2.0; this.tackleActive = 0.5;
      const dashDir = (Math.hypot(this.vx, this.vy) > 0.1) ? normalize({x:this.vx, y:this.vy}) : {x:Math.cos(this.facingAngle), y:Math.sin(this.facingAngle)};
      this.vx += dashDir.x * 25; this.vy += dashDir.y * 25;
      spawnParticles(this.x, this.y, '#ff66aa', 12); audio.tackle();
    }
    else if(this.rivalKey === 'niko'){
      for(const p of G.players){ if(p.team !== this.team && !p.isControlImmune() && dist(this, p) < 200){ p.slowTimer = Math.max(p.slowTimer, this.isAwakened ? 3.0 : 2.0); } }
      spawnParticles(this.x, this.y, '#66ccff', 20);
    }
    else if(this.rivalKey === 'donlorenzo'){
      this.shieldTimer = Math.max(this.shieldTimer, this.isAwakened ? 4.0 : 2.5);
      this.commandRun = 1.5;
      spawnParticles(this.x, this.y, '#ffaa00', 15);
    }
    else if(this.rivalKey === 'shiguma'){
      this.dashTimer = 2.0;
      const goalX = this.team === 'red' ? FIELD.x : FIELD.x + FIELD.w;
      const goalAng = angleTo(this, {x: goalX, y: FIELD.y + FIELD.h/2});
      this.vx += Math.cos(goalAng) * 10; this.vy += Math.sin(goalAng) * 10;
      spawnParticles(this.x, this.y, '#888888', 8);
    }
    // === PXG ABILITIES ===
    else if(this.rivalKey === 'rinpxg'){
      if(this.isAwakened){
        // MASS DESTRUCTION: Guaranteed curved goal + stun ALL 1s + epic turquoise-green animation
        // 1. Stun ALL players on the field for 1 second
        for(const p of G.players){
          if(p === this) continue;
          if(p.isControlImmune()) continue;
          p.stunTimer = Math.max(p.stunTimer, 1.0);
          spawnParticles(p.x, p.y, '#2dd4a8', 5);
        }
        // 2. Epic turquoise-green particles explosion
        for(let i = 0; i < 60; i++) spawnParticles(this.x, this.y, i % 3 === 0 ? '#00ffcc' : (i % 3 === 1 ? '#2dd4a8' : '#0affce'), 1);
        G.cameraShake = 20;
        // 3. Guaranteed curved goal shot (like Shidou's guaranteed but curved)
        const goalX = this.team === 'red' ? FIELD.x : FIELD.x + FIELD.w;
        const gk = G.players.find(p => p.team !== this.team && p.type === 'goalkeeper');
        let aimY = FIELD.y + FIELD.h/2;
        if(gk){
          aimY = gk.y < FIELD.y + FIELD.h/2 ? (FIELD.y + FIELD.h/2 + GOAL_W/2 - 20) : (FIELD.y + FIELD.h/2 - GOAL_W/2 + 20);
        }
        const goalAng = angleTo(this, {x: goalX, y: aimY});
        G.ball.shoot(this, 26, goalAng, 3, 1.0, true);
        G.ball.vx = Math.cos(goalAng) * 24;
        G.ball.vy = Math.sin(goalAng) * 24;
        G.ball.vz = 3;
        G.ball.rinCurved = true;
        G.ball.rinFarPostY = aimY;
        G.ball.saeGuaranteed = true; // Use saeGuaranteed to bypass GK
        G.ball.massDestructionShot = true; // Turquoise-green visual
        G.cameraShake = 22;
        showAbilityNotif('⚡ MASS DESTRUCTION ⚡', '#2dd4a8');
        audio.shoot(); audio.cheer(0.35);
      } else {
        // Normal: Same as playable Rin's AWAKENED ability (mini dash + stun + curved shot)
        const dashDir = (Math.hypot(this.vx, this.vy) > 0.1) ? normalize({x:this.vx, y:this.vy}) : {x:Math.cos(this.facingAngle), y:Math.sin(this.facingAngle)};
        this.vx += dashDir.x * 10;
        this.vy += dashDir.y * 10;
        for(const p of G.players){
          if(p.team === this.team) continue;
          if(p.isControlImmune()) continue;
          if(dist(this, p) < 130){ // More area than playable Rin
            p.stunTimer = Math.max(p.stunTimer, 2.0);
            spawnParticles(p.x, p.y, '#2dd4a8', 10);
          }
        }
        this.nagiCharge = 0.6;
        this.vx *= 0.7; this.vy *= 0.7;
        G.cameraShake = 10;
        spawnParticles(this.x, this.y, '#2dd4a8', 30);
        showAbilityNotif('PULVERIZE!', '#2dd4a8');
        audio.ability();
      }
    }
    else if(this.rivalKey === 'loki'){
      // Loki: Phantom Sprint — massive speed burst + afterimages
      this.dashTimer = config.activeDuration;
      const goalX = this.team === 'red' ? FIELD.x : FIELD.x + FIELD.w;
      const goalAng = angleTo(this, {x: goalX, y: FIELD.y + FIELD.h/2});
      const burstSpeed = this.isAwakened ? 20 : 16;
      this.vx += Math.cos(goalAng) * burstSpeed;
      this.vy += Math.sin(goalAng) * burstSpeed;
      // Afterimages
      for(let i = 0; i < (this.isAwakened ? 3 : 1); i++){
        G.illusions.push({x:this.x, y:this.y, vx:(rng()-0.5)*2, vy:(rng()-0.5)*2, life:1.5, maxLife:1.5});
      }
      spawnParticles(this.x, this.y, '#00e5ff', 25);
      G.cameraShake = 5;
      showAbilityNotif(this.isAwakened ? 'PHANTOM GOD!' : 'PHANTOM SPRINT!', '#00e5ff');
      audio.ability();
    }
    else if(this.rivalKey === 'charles'){
      // Charles Chevalier: Perfect pass to Loki or Shidou (speed boost to receiver)
      const loki = G.players.find(p => p.team === this.team && p.rivalKey === 'loki');
      const shidou = G.players.find(p => p.team === this.team && p.rivalKey === 'shidou');
      const target = loki || shidou;
      if(target && this.hasBall){
        const ang = angleTo(this, target);
        const passPow = 14;
        G.ball.shoot(this, passPow, ang, 0, 0, true);
        G.ball.state = 'pass'; G.ball.uninterceptablePass = false; G.ball.passTarget = target; G.ball.perfectHoming = true; this.hasBall = false;
        // Slight speed boost to receiver
        target.dashTimer = Math.max(target.dashTimer, 1.5);
        // Epic pass particles
        for(let i = 0; i < 20; i++) spawnParticles(this.x, this.y, '#e0e060', 1);
        showAbilityNotif(this.isAwakened ? 'GENIUS LASER!' : 'LASER PASS!', '#e0e060');
      } else {
        spawnParticles(this.x, this.y, '#e0e060', 15);
        showAbilityNotif('LASER PASS!', '#e0e060');
      }
      audio.ability();
    }
    else if(this.rivalKey === 'nanase'){
      // Nanase: Interceptable pass to Rin PXG that gives 1s shield
      const rinpxg = G.players.find(p => p.team === this.team && p.rivalKey === 'rinpxg');
      if(rinpxg && this.hasBall){
        // Pass is interceptable (not perfectHoming)
        const ang = angleTo(this, rinpxg);
        const passPow = 10;
        G.ball.shoot(this, passPow, ang, 0, 0, true);
        G.ball.state = 'pass'; G.ball.uninterceptablePass = false; G.ball.passTarget = rinpxg; this.hasBall = false;
        // Rin PXG gets 1s shield when receiving
        rinpxg._nanaseShieldPending = true;
        spawnParticles(this.x, this.y, '#88ccaa', 15);
        showAbilityNotif(this.isAwakened ? 'PERFECT SHIELD PASS!' : 'SHIELD PASS!', '#88ccaa');
      } else {
        spawnParticles(this.x, this.y, '#88ccaa', 10);
        showAbilityNotif('SHIELD PASS!', '#88ccaa');
      }
      audio.ability();
    }
    else if(this.rivalKey === 'tokimitsu'){
      // Tokimitsu: Same as Kunigami rival (power dash + push + stun)
      const dashDir = (Math.hypot(this.vx, this.vy) > 0.5) ? normalize({x:this.vx, y:this.vy}) : {x:Math.cos(this.facingAngle), y:Math.sin(this.facingAngle)};
      const dashSpeed = this.isAwakened ? 16 : 12;
      this.vx += dashDir.x * dashSpeed;
      this.vy += dashDir.y * dashSpeed;
      this.dashTimer = this.activeTimer;
      const pushRadius = this.isAwakened ? 200 : 160;
      for(const p of G.players){
        if(p.team === this.team) continue;
        if(p.isControlImmune()) continue;
        const d = dist(this, p);
        if(d < pushRadius){
          const ang = angleTo(this, p);
          const pushPower = this.isAwakened ? 22 : 16;
          p.vx += Math.cos(ang) * pushPower;
          p.vy += Math.sin(ang) * pushPower;
          p.stunTimer = Math.max(p.stunTimer, this.isAwakened ? 2.2 : 1.4);
          spawnParticles(p.x, p.y, '#44aa44', 10);
        }
      }
      G.cameraShake = 10;
      spawnParticles(this.x, this.y, '#44aa44', 35);
      showAbilityNotif(this.isAwakened ? 'HERO SHOT!' : 'POWER DASH!', this.isAwakened ? '#ff00ff' : '#44aa44');
      audio.ability();
    }
    else if(this.rivalKey === 'zantetsu'){
      // Zantetsu: Same as Otoya (teleport forward)
      const dir = this.team === 'red' ? -1 : 1;
      this.x += dir * (this.isAwakened ? 180 : 100);
      this.x = clamp(this.x, FIELD.x + PLAYER_R, FIELD.x + FIELD.w - PLAYER_R);
      spawnParticles(this.x, this.y, config.color, 15);
      showAbilityNotif(this.isAwakened ? 'SHADOW NINJA!' : 'SHADOW STEP!', config.color);
      audio.ability();
    }
    return true;
  }

  startShotCharge(){
    if(G.replayMode || G.goalCelebrating) return false;
    if(!this.hasBall || this.nagiCharge > 0 || this.pendingShot > 0 || this.isagiAutoPending || this.stunTimer > 0 || this.freezeTimer > 0 || this.kiyoraSpinTimer > 0) return false;
    this.shotCharging = true;
    this.shotCharge = 0;
    updateShotChargeUI();
    return true;
  }

  releaseShotCharge(){
    if(!this.shotCharging) return false;
    const charge = clamp(this.shotCharge, 0, 1);
    this.shotCharging = false;
    this.shotCharge = 0;
    if(this.hasBall) this.doShoot(false, charge);
    updateShotChargeUI();
    return true;
  }

  cancelShotCharge(){
    this.shotCharging = false;
    this.shotCharge = 0;
    updateShotChargeUI();
  }

  doShoot(isAbility = false, charge = 1){
    if(!this.hasBall) return;
    const isNagiSkullShot = this.heroKey === 'nagi' && this.isAwakened && this.nagiSkullShot;
    const isNagiOffBallShot = this.heroKey === 'nagi' && this.nagiOffBallShot;
    if(this.heroKey === 'nagi' && this.isAwakened && !isNagiSkullShot) this.nagiFakeCount = 0;
    const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
    const goalY = FIELD.y + FIELD.h/2;
    let angle = angleTo(this, {x:goalX, y:goalY});
    const accuracy = this.shotAccuracy * (isAbility ? 1.5 : 1.0);
    
    // BAROU PASSIVE: Aim far from goalkeeper
    if(this.rivalKey === 'barou'){
      const gk = G.players.find(p => p.team !== this.team && p.type === 'goalkeeper');
      if(gk){
        const gkY = gk.y;
        // Aim to the side farthest from the GK
        const farPost = gkY < goalY ? (FIELD.y + FIELD.h/2 + GOAL_W/2 - 15) : (FIELD.y + FIELD.h/2 - GOAL_W/2 + 15);
        const targetAngle = angleTo(this, {x: goalX, y: farPost});
        // Blend between normal aim and far-post aim (stronger when closer)
        const dToGoal = dist(this, {x:goalX, y:goalY});
        const blendFactor = clamp(1.0 - dToGoal / 800, 0.3, 0.9);
        angle = angle * (1 - blendFactor) + targetAngle * blendFactor;
        // Much more power (Center Shot King)
        if(!isAbility) { /* power will be set below with boosted shotPower */ }
      }
    }
    
    if(!isAbility){ const d = dist(this, {x:goalX, y:goalY}); const noise = (1 - clamp(accuracy, 0, 1.5)) * 0.15 * (d / 400); angle += (rng() - 0.5) * noise; }
    let power, height, curve;
    if(isAbility){
      if(this.heroKey === 'rin'){
        // Far post based on SHOOTER position (not GK)
        const shooterAboveCenter = this.y < goalY;
        // Far post = the one furthest from the shooter's vertical position
        const farPostY = shooterAboveCenter 
          ? (FIELD.y + FIELD.h/2 + GOAL_W/2 - 15)  // Shooter above → far post is bottom
          : (FIELD.y + FIELD.h/2 - GOAL_W/2 + 15); // Shooter below → far post is top
        const targetAng = angleTo(this, {x: goalX, y: farPostY});
        angle = angle * 0.25 + targetAng * 0.75;
        curve = 0; // No spin — homing handles the curve
        power = this.isAwakened ? 17 : 14;
        height = 2;
      }
      else if(this.heroKey === 'nagi'){ 
        if(this.isAwakened && !isNagiOffBallShot){
          if(isNagiSkullShot){
            // FIVE STAGE VOLLEY: seek the corner like the normal trap shot, but keep awakened power
            power = 28; height = 4; curve = 0;
            const gk = G.players.find(p => p.team !== this.team && p.type === 'goalkeeper');
            if(gk){
              const farPost = gk.y < goalY ? (FIELD.y + FIELD.h/2 + GOAL_W/2 - 15) : (FIELD.y + FIELD.h/2 - GOAL_W/2 + 15);
              const targetAng = angleTo(this, {x: goalX, y: farPost});
              angle = angle * 0.2 + targetAng * 0.8;
            }
            for(let i = 0; i < 25; i++) spawnParticles(this.x, this.y, '#00e5ff', 1);
            G.cameraShake = 8;
          } else {
            // GENIUS TRAP: same power as the normal trap shot, with extreme curve
            power = 20; height = 4;
            const gk = G.players.find(p => p.team !== this.team && p.type === 'goalkeeper');
            if(gk){ curve = gk.y < FIELD.y + FIELD.h/2 ? 3.0 : -3.0; }
            else { curve = (this.y < FIELD.y + FIELD.h/2) ? 3.0 : -3.0; }
            for(let i = 0; i < 25; i++) spawnParticles(this.x, this.y, '#b14aed', 1);
            G.cameraShake = 6;
          }
        } else {
          // TRAP SHOT: Ground-hugging low shot that slides along the grass
          power = 20; height = 0; curve = 0;
          // Accuracy boost: aim closer to corners
          const gk = G.players.find(p => p.team !== this.team && p.type === 'goalkeeper');
          if(gk){
            const farPost = gk.y < goalY ? (FIELD.y + FIELD.h/2 + GOAL_W/2 - 15) : (FIELD.y + FIELD.h/2 - GOAL_W/2 + 15);
            const targetAng = angleTo(this, {x: goalX, y: farPost});
            angle = angle * 0.3 + targetAng * 0.7;
          }
        }
      } 
      else if(this.heroKey === 'isagi'){ const gk = G.players.find(p => p.team !== this.team && p.type === 'goalkeeper'); if(gk){ const topAng = angleTo(this, {x:goalX, y:FIELD.y + FIELD.h/2 - GOAL_W/2 + 20}); const botAng = angleTo(this, {x:goalX, y:FIELD.y + FIELD.h/2 + GOAL_W/2 - 20}); angle = Math.abs(topAng - angle) < Math.abs(botAng - angle) ? topAng : botAng; } power = 14; height = 3; curve = 0; }
      else if(this.heroKey === 'kaiser'){
        if(this.isAwakened){
          // AWAKENED: Curved shot toward far post (uses rinCurved homing)
          const gk = G.players.find(p => p.team !== this.team && p.type === 'goalkeeper');
          if(gk){ const farPost = gk.y < goalY ? (FIELD.y + FIELD.h/2 + GOAL_W/2 - 15) : (FIELD.y + FIELD.h/2 - GOAL_W/2 + 15); const targetAng = angleTo(this, {x: goalX, y: farPost}); angle = angle * 0.25 + targetAng * 0.75; }
          power = 20; height = 3; curve = 0.8; G.ball.rinCurved = true; G.ball.rinFarPostY = goalY;
        } else {
          // NORMAL: Super powerful STRAIGHT shot, no curve
          const gk = G.players.find(p => p.team !== this.team && p.type === 'goalkeeper');
          if(gk){ const farPost = gk.y < goalY ? (FIELD.y + FIELD.h/2 + GOAL_W/2 - 15) : (FIELD.y + FIELD.h/2 - GOAL_W/2 + 15); const targetAng = angleTo(this, {x: goalX, y: farPost}); angle = angle * 0.4 + targetAng * 0.6; }
          power = 22; height = 2; curve = 0;
        }
      }
      else if(this.rivalKey === 'shidou'){ 
        power = this.isAwakened ? 28 : 24; 
        height = this.isAwakened ? 5 : 3; 
        curve = this.isAwakened ? 1.2 : 0.5; 
        for(let i = 0; i < 20; i++) spawnParticles(this.x, this.y, '#ff2e63', 1);
      }
      else if(this.rivalKey === 'kunigami'){ power = this.isAwakened ? 26 : 22; height = 0; curve = 0; }
      else if(this.rivalKey === 'rinpxg'){
        // Rin PXG normal active: curved shot like Rin awakened (wider stun area)
        const shooterAboveCenter = this.y < goalY;
        const farPostY = shooterAboveCenter
          ? (FIELD.y + FIELD.h/2 + GOAL_W/2 - 15)
          : (FIELD.y + FIELD.h/2 - GOAL_W/2 + 15);
        const targetAng = angleTo(this, {x: goalX, y: farPostY});
        angle = angle * 0.2 + targetAng * 0.8;
        power = 17; height = 2; curve = 0;
      }
      else { power = 14; height = 2; curve = 0; }
    } else {
      const chargeAmount = clamp(charge, 0, 1);
      const chargeMult = SHOT_MIN_POWER + (1 - SHOT_MIN_POWER) * chargeAmount;
      power = clamp(10 * this.shotPower, 8, 16) * chargeMult;
      height = (rng() < 0.3 ? 3 + rng() * 4 : 1) * (0.45 + 0.55 * chargeAmount);
      curve = (rng() - 0.5) * 0.6 * this.shotAccuracy;
    }
    
    // Skip normal shoot if guaranteed shot is already set (Shidou awaken)
    if(G.ball && G.ball.shidouGuaranteed){
      if(isNagiOffBallShot) this.nagiOffBallShot = false;
      return;
    }
    
    G.ball.shoot(this, power, angle, height, curve, isAbility);
    if(isNagiOffBallShot) this.nagiOffBallShot = false;

    if(isNagiSkullShot){
      this.nagiSkullShot = false;
      this.nagiFakeCount = 0;
      this.pendingShot = 0;
      this.nagiVolleyLock = 0;
      // The Five Stage Volley is the moment the awakened ability finally goes on cooldown.
      this.activeCd = HEROES.nagi.activeCooldown;
      G.nagiSkull = { x: G.ball.x, y: G.ball.y, z: G.ball.z, life: 1.35, maxLife: 1.35 };
      G.cameraShake = Math.max(G.cameraShake, 18);
      spawnParticles(this.x, this.y, '#00e5ff', 40);
      for(let i = 0; i < 10; i++){ G.trails.push({x:G.ball.x, y:G.ball.y, z:G.ball.z, life:0.7, maxLife:0.7, color:'#00e5ff'}); }
      showAbilityNotif('FIVE STAGE VOLLEY', '#00e5ff');
      audio.ability();
    }
    
    // Rin curved shot: set homing target to far post based on shooter position
    if(isAbility && this.heroKey === 'rin'){
      const goalYC = FIELD.y + FIELD.h / 2;
      const shooterAboveCenter = this.y < goalYC;
      G.ball.rinCurved = true;
      G.ball.rinFarPostY = shooterAboveCenter
        ? (FIELD.y + FIELD.h/2 + GOAL_W/2 - 15)
        : (FIELD.y + FIELD.h/2 - GOAL_W/2 + 15);
    }
    // Rin PXG normal active: same homing
    if(isAbility && this.rivalKey === 'rinpxg' && !this.isAwakened){
      const goalYC = FIELD.y + FIELD.h / 2;
      const shooterAboveCenter = this.y < goalYC;
      G.ball.rinCurved = true;
      G.ball.rinFarPostY = shooterAboveCenter
        ? (FIELD.y + FIELD.h/2 + GOAL_W/2 - 15)
        : (FIELD.y + FIELD.h/2 - GOAL_W/2 + 15);
    }
  }

  doPass(targetPlayer){
    if(!this.hasBall || !targetPlayer || targetPlayer === this || targetPlayer.team !== this.team) return;
    if(G.ball.owner !== this || G.ball.state !== 'owned') return;
    const passPower = clamp(dist(this, targetPlayer) * 0.08 + 4, 4, 12) * this.passPower;
    G.ball.pass(this, targetPlayer, passPower);
  }
  findBestPassTarget(){
    const mates = G.players.filter(p => p.team === this.team && p !== this && p.type !== 'goalkeeper');
    let best = null, bestScore = -Infinity; const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
    for(const m of mates){
      const d = dist(this, m); if(d < 40 || d > 550) continue;
      const dirToMate = normalize({x:m.x-this.x, y:m.y-this.y});
      const dirToGoal = normalize({x:goalX-this.x, y:FIELD.y+FIELD.h/2-this.y});
      const alignment = dirToMate.x * dirToGoal.x + dirToMate.y * dirToGoal.y;
      let score = alignment * 15 - d * 0.04;
      const adv = this.team === 'blue' ? (m.x - this.x) : (this.x - m.x); score += adv * 0.08;
      for(const opp of G.players){ if(opp.team === this.team) continue; if(dist(m, opp) < 55) score -= 5; }
      if(this.heroKey === 'isagi' || this.heroKey === 'hiori') score += 5;
      if(this.rivalKey === 'sae') score += 5;
      if(score > bestScore){ bestScore = score; best = m; }
    }
    return best;
  }

  findNessPassTarget(){
    const mates = G.players.filter(p => p.team === this.team && p !== this && p.type === 'hero' && p.stunTimer <= 0 && p.freezeTimer <= 0);
    if(!mates.length) return null;
    const goalX = this.team === 'blue' ? FIELD.x + FIELD.w : FIELD.x;
    let best = null, bestScore = -Infinity;
    for(const m of mates){
      const d = dist(this, m);
      if(d < 30 || d > 900) continue;
      const dirToMate = normalize({x:m.x-this.x, y:m.y-this.y});
      const dirToGoal = normalize({x:goalX-this.x, y:FIELD.y+FIELD.h/2-this.y});
      let score = (dirToMate.x * dirToGoal.x + dirToMate.y * dirToGoal.y) * 10 - d * 0.015;
      const adv = this.team === 'blue' ? (m.x - this.x) : (this.x - m.x); score += adv * 0.05;
      for(const opp of G.players){ if(opp.team === this.team) continue; if(dist(m, opp) < 80) score -= 6; }
      if(this.isAwakened){
        if(!m.isAwakened) score += 12;
      } else {
        score += Math.max(0, Math.min(m.activeCd, 12)) * 1.2;
      }
      if(m.role === 'FWD') score += 4;
      if(score > bestScore){ bestScore = score; best = m; }
    }
    if(best) return best;
    let nearest = null, nearestD = Infinity;
    for(const m of mates){ const d = dist(this, m); if(d < nearestD){ nearestD = d; nearest = m; } }
    return nearest;
  }

  findKiyoraPassTarget(){
    const best = this.findBestPassTarget();
    if(best) return best;
    const mates = G.players.filter(p => p.team === this.team && p !== this && p.type !== 'goalkeeper');
    if(!mates.length) return null;
    let nearest = null, nearestD = Infinity;
    for(const m of mates){ const d = dist(this, m); if(d < nearestD){ nearestD = d; nearest = m; } }
    return nearest;
  }

}

    return { Ball, Player };
  }

  return { createEntityClasses };
});
