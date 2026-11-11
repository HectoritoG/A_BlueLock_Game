(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLEntityRenderer = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Canvas rendering for the entity classes. The simulation classes no longer
  // know about the canvas, camera or character images.
  function createEntityRenderer(runtime) {
    const { BALL_R, PLAYER_R } = runtime.constants;
    const { clamp } = runtime.math;
    const G = runtime.G;
    const ctx = runtime.ctx;
    const CHAR_IMAGES = runtime.charImages;
    const camera = runtime.camera;
    const viewport = runtime.viewport;

    function drawBall(ball) {
      const screenX = ball.x - camera.x, screenY = ball.y - camera.y;
      const shadowScale = clamp(1 - ball.z * 0.01, 0.3, 1);
      ctx.fillStyle = `rgba(0,0,0,${0.5 * shadowScale})`;
      ctx.beginPath(); ctx.ellipse(screenX, screenY + 3, BALL_R * shadowScale, BALL_R * 0.6 * shadowScale, 0, 0, Math.PI * 2); ctx.fill();

      const drawY = screenY - ball.z;
      const speed = Math.hypot(ball.vx, ball.vy);
      if(speed > 3){ ctx.shadowColor = ball.state === 'shot' ? (ball.massDestructionShot ? '#2dd4a8' : (ball.shidouGuaranteed || ball.saeGuaranteed ? '#ff0000' : (ball.shidouShot ? '#ff0000' : '#ff6600'))) : '#ffffff'; ctx.shadowBlur = ball.shidouGuaranteed || ball.saeGuaranteed || ball.massDestructionShot ? 40 : 25; }

      if(ball.state === 'owned' && ball.owner){
        const ox = ball.owner.x - camera.x, oy = ball.owner.y - camera.y;
        const ownerColor = ball.owner.team === 'blue' ? '#00d9ff' : '#ff2e63';
        ctx.strokeStyle = ownerColor + '80'; ctx.lineWidth = 4; ctx.setLineDash([6,6]);
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(screenX, drawY); ctx.stroke(); ctx.setLineDash([]);
      }

      ctx.fillStyle = ball.massDestructionShot ? '#2dd4a8' : '#ffffff'; ctx.strokeStyle = ball.massDestructionShot ? '#0affce' : '#111'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(screenX, drawY, BALL_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.save(); ctx.translate(screenX, drawY); ctx.rotate(ball.rotation);
      ctx.fillStyle = '#222';
      ctx.beginPath();
      for(let i=0; i<5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * BALL_R * 0.45;
        const y = Math.sin(a) * BALL_R * 0.45;
        if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fill();
      for(let i=0; i<5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * BALL_R * 0.8;
        const y = Math.sin(a) * BALL_R * 0.8;
        ctx.beginPath();
        ctx.arc(x, y, BALL_R * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if(ball.z > 2 && !G.nagiSkull){ ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 13px Orbitron'; ctx.textAlign = 'center'; ctx.fillText(Math.round(ball.z) + 'm', screenX, drawY - BALL_R - 8); }
    }

    function drawPlayer(player) {
      const screenX = (player.x + player.bachiraVisualX + player.saeVisualX) - camera.x, screenY = (player.y + player.bachiraVisualY + player.saeVisualY) - camera.y;
      if(screenX < -80 || screenX > (viewport.w / viewport.scale) + 80 || screenY < -80 || screenY > (viewport.h / viewport.scale) + 80) return;

      const baseColor = player.getColor();
      const teamBaseColor = player.team === 'blue' ? '#00d9ff' : '#ff2e63';
      const r = PLAYER_R * player.size;

      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(screenX, screenY + 4, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();

      if(player.isAwakened){
        ctx.shadowColor = '#ff00ff'; ctx.shadowBlur = 25;
        const pulse = 0.4 + Math.sin(Date.now() * 0.01) * 0.2;
        ctx.fillStyle = `rgba(255,0,255,${pulse})`;
        ctx.beginPath(); ctx.arc(screenX, screenY, r + 20 + Math.sin(Date.now()*0.008)*5, 0, Math.PI * 2); ctx.fill();
      } else if(player.activeTimer > 0 || player.dashTimer > 0 || player.interceptActive > 0){
        ctx.shadowColor = baseColor; ctx.shadowBlur = 15;
        ctx.fillStyle = baseColor + '50';
        ctx.beginPath(); ctx.arc(screenX, screenY, r + 15 + Math.sin(Date.now()*0.008)*4, 0, Math.PI * 2); ctx.fill();
      }

      if(player.kiyoraSpinTimer > 0){
        const spinColor = player.isAwakened ? '#ff00ff' : '#00e5a0';
        ctx.strokeStyle = spinColor;
        ctx.lineWidth = 4;
        for(let i = 0; i < 3; i++){
          const a = player.facingAngle + i * (Math.PI * 2 / 3);
          ctx.beginPath();
          ctx.arc(screenX, screenY, r + 12 + i * 4, a, a + 1.2);
          ctx.stroke();
        }
      }

      if(player.heroKey === 'isagi' && player.isagiAutoTimer > 0){
        const armedPulse = 0.55 + Math.sin(Date.now() * 0.014) * 0.25;
        ctx.strokeStyle = player.isAwakened ? `rgba(255,0,255,${armedPulse})` : `rgba(79,195,247,${armedPulse})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(screenX, screenY, r + 9, 0, Math.PI * 2); ctx.stroke();
      }

      if(player.slowTimer > 0 || player.kuronaSlowTimer > 0){
        ctx.shadowColor = '#ff8c00'; ctx.shadowBlur = 20;
        ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 3; ctx.setLineDash([6,6]);
        ctx.beginPath(); ctx.arc(screenX, screenY, r + 12, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }

      if(player.freezeTimer > 0){
        ctx.strokeStyle = 'rgba(0,229,255,0.85)'; ctx.lineWidth = 2; ctx.setLineDash([4,5]);
        ctx.beginPath(); ctx.arc(screenX, screenY, r + 14, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }

      if(player.commandRun > 0){
        ctx.shadowColor = '#ff8c00'; ctx.shadowBlur = 25;
        ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(screenX, screenY, r + 18, 0, Math.PI * 2); ctx.stroke();
      }

      if(player.hasBall){
        ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 15;
        ctx.strokeStyle = '#ffff00'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(screenX, screenY, r + 10, 0, Math.PI * 2); ctx.stroke();
      }
    
      if(player.isHuman || player.isRemoteHuman){
        ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(screenX, screenY, r + 15, 0, Math.PI * 2); ctx.stroke();
      }

      if(player.tackleActive > 0){
        ctx.shadowColor = '#ff8c00'; ctx.shadowBlur = 25;
        ctx.strokeStyle = '#ff8c00'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(screenX, screenY, r + 18, 0, Math.PI * 2); ctx.stroke();
      }

      if(player.interceptActive > 0){
        ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 30;
        ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(screenX, screenY, r + 18 + Math.sin(Date.now()*0.01)*3, 0, Math.PI * 2); ctx.stroke();
      }

      if(player.shieldTimer > 0){
        ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 25;
        ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 3; ctx.setLineDash([8,4]);
        ctx.beginPath(); ctx.arc(screenX, screenY, r + 14 + Math.sin(Date.now()*0.006)*4, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.shadowBlur = 0;

      const drawY = player.nagiCharge > 0 ? screenY - 25 : screenY;

      ctx.save();
      ctx.beginPath();
      ctx.arc(screenX, drawY, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // === LÓGICA DE IMAGEN DESPERTADO ===
      let imgKey = player.charKey;
      const awakenKey = player.charKey + '_awaken';
      const awakenImg = CHAR_IMAGES[awakenKey];
      if(player.isAwakened && awakenImg && awakenImg.complete && awakenImg.naturalWidth !== 0) imgKey = awakenKey;

      const img = CHAR_IMAGES[imgKey];
      if(img && img.complete && img.naturalWidth !== 0){
        ctx.drawImage(img, screenX - r, drawY - r, r*2, r*2);
      } else {
        ctx.fillStyle = teamBaseColor;
        ctx.fillRect(screenX - r, drawY - r, r*2, r*2);
      }
      ctx.restore();

      ctx.strokeStyle = player.team === 'blue' ? '#003355' : '#550022';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(screenX, drawY, r, 0, Math.PI * 2); ctx.stroke();

      const dirX = screenX + Math.cos(player.facingAngle) * (r + 5);
      const dirY = drawY + Math.sin(player.facingAngle) * (r + 5);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(screenX, drawY); ctx.lineTo(dirX, dirY); ctx.stroke();

      const showText = !img || !img.complete || img.naturalWidth === 0;
      if(showText){
        ctx.fillStyle = '#ffffff'; ctx.font = `bold ${Math.round(r * 0.8)}px Orbitron`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(player.getNum(), screenX, drawY);
      }
    
      ctx.fillStyle = player.isAwakened ? '#ff00ff' : baseColor; 
      ctx.font = 'bold 13px Orbitron'; ctx.textAlign = 'center';
      ctx.fillText(player.getName(), screenX, drawY - r - 15);

      if(player.heroKey === 'nagi' && player.isAwakened && player.nagiFakeCount > 0){
        ctx.fillStyle = '#00e5ff';
        ctx.font = 'bold 11px Orbitron';
        ctx.fillText('VOLLEY ' + player.nagiFakeCount + '/4', screenX, drawY - r - 30);
      }

      if(player.stunTimer > 0){ ctx.fillStyle = '#ffaa00'; ctx.font = '20px Arial'; ctx.fillText('★', screenX + r * 0.5, drawY - r); }
    }

    return { drawBall, drawPlayer };
  }

  return { createEntityRenderer };
});
