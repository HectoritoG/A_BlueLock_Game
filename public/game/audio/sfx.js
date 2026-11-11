(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLAudio = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Procedural Web Audio sound effects. The module is safe to require in Node:
  // init() simply disables audio when no AudioContext is available.
  function createSfx() {
    return {
      ctx: null, master: null, enabled: true, crowdSrc: null, crowdGain: null,
      init() {
        if (this.ctx) return;
        try {
          const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
          if (!AC) { this.enabled = false; return; }
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.55;
          this.master.connect(this.ctx.destination);
        } catch (e) {
          this.enabled = false;
        }
      },
      resume() {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      },
      _noise(duration) {
        if (!this.ctx) return null;
        const len = Math.floor(this.ctx.sampleRate * duration);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        return src;
      },
      _tone(freq, type, duration, gainVal, slideTo) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), this.ctx.currentTime + duration);
        g.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(g);
        g.connect(this.master);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      },
      kick() {
        if (!this.ctx) return;
        const n = this._noise(0.12); if (!n) return;
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.35, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
        n.connect(f); f.connect(g); g.connect(this.master); n.start(); n.stop(this.ctx.currentTime + 0.12);
        this._tone(140, 'sine', 0.1, 0.3, 70);
      },
      shoot() {
        if (!this.ctx) return;
        const n = this._noise(0.22); if (!n) return;
        const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(1200, this.ctx.currentTime); f.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.22); f.Q.value = 1.5;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.5, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);
        n.connect(f); f.connect(g); g.connect(this.master); n.start(); n.stop(this.ctx.currentTime + 0.22);
        this._tone(110, 'sawtooth', 0.2, 0.35, 50);
      },
      goal() {
        if (!this.ctx) return;
        const notes = [392, 523, 659, 784, 1047];
        notes.forEach((n, i) => { setTimeout(() => this._tone(n, 'square', 0.22, 0.18), i * 110); });
        const n2 = this._noise(1.2); if (!n2) return;
        const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.7;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0, this.ctx.currentTime); g.gain.linearRampToValueAtTime(0.35, this.ctx.currentTime + 0.15); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.2);
        n2.connect(f); f.connect(g); g.connect(this.master); n2.start(); n2.stop(this.ctx.currentTime + 1.2);
      },
      whistle(long) {
        if (!this.ctx) return;
        const dur = long ? 0.7 : 0.25;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        osc.type = 'square'; osc.frequency.value = 2200;
        lfo.frequency.value = 18; lfoGain.gain.value = 120;
        lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
        g.gain.setValueAtTime(0.22, this.ctx.currentTime); g.gain.setValueAtTime(0.22, this.ctx.currentTime + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        osc.connect(g); g.connect(this.master); osc.start(); lfo.start(); osc.stop(this.ctx.currentTime + dur); lfo.stop(this.ctx.currentTime + dur);
      },
      ability() {
        if (!this.ctx) return;
        this._tone(300, 'sawtooth', 0.35, 0.2, 1400);
        setTimeout(() => this._tone(800, 'square', 0.2, 0.12, 1600), 80);
        const n = this._noise(0.3); if (!n) return;
        const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.15, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
        n.connect(f); f.connect(g); g.connect(this.master); n.start(); n.stop(this.ctx.currentTime + 0.3);
      },
      tackle() {
        if (!this.ctx) return;
        const n = this._noise(0.15); if (!n) return;
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.45, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
        n.connect(f); f.connect(g); g.connect(this.master); n.start(); n.stop(this.ctx.currentTime + 0.15);
        this._tone(80, 'square', 0.1, 0.3, 40);
      },
      awaken() {
        if (!this.ctx) return;
        this._tone(60, 'sine', 0.8, 0.4, 220);
        setTimeout(() => this._tone(440, 'sawtooth', 0.5, 0.18, 880), 120);
        setTimeout(() => this._tone(880, 'square', 0.4, 0.12, 1760), 300);
        const n = this._noise(0.6); if (!n) return;
        const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(200, this.ctx.currentTime); f.frequency.exponentialRampToValueAtTime(2000, this.ctx.currentTime + 0.6); f.Q.value = 2;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.25, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.6);
        n.connect(f); f.connect(g); g.connect(this.master); n.start(); n.stop(this.ctx.currentTime + 0.6);
      },
      save() {
        if (!this.ctx) return;
        this._tone(180, 'square', 0.1, 0.3, 90);
        const n = this._noise(0.1); if (!n) return;
        const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.3, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
        n.connect(f); f.connect(g); g.connect(this.master); n.start(); n.stop(this.ctx.currentTime + 0.1);
      },
      intercept() {
        if (!this.ctx) return;
        this._tone(1200, 'square', 0.12, 0.18, 600);
        this._tone(600, 'sine', 0.15, 0.12, 300);
      },
      hit() {
        if (!this.ctx) return;
        const n = this._noise(0.08); if (!n) return;
        const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.3, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
        n.connect(f); f.connect(g); g.connect(this.master); n.start(); n.stop(this.ctx.currentTime + 0.08);
      },
      ui() { if (!this.ctx) return; this._tone(660, 'square', 0.06, 0.12, 880); },
      possession() { if (!this.ctx) return; this._tone(520, 'triangle', 0.05, 0.08); },
      startCrowd() {
        if (!this.ctx || this.crowdSrc) return;
        const n = this._noise(8); if (!n) return; n.loop = true;
        const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.4;
        this.crowdGain = this.ctx.createGain(); this.crowdGain.gain.value = 0.08;
        n.connect(f); f.connect(this.crowdGain); this.crowdGain.connect(this.master); n.start();
        this.crowdSrc = n;
      },
      cheer(level) {
        if (!this.ctx) return;
        const dur = 0.8 + Math.random() * 0.6;
        const n = this._noise(dur); if (!n) return;
        const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600 + Math.random() * 400; f.Q.value = 0.8;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0, this.ctx.currentTime); g.gain.linearRampToValueAtTime((level || 0.25), this.ctx.currentTime + 0.1); g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
        n.connect(f); f.connect(g); g.connect(this.master); n.start(); n.stop(this.ctx.currentTime + dur);
      },
      setVolume(v) { if (this.master) this.master.gain.value = v; }
    };
  }

  return { createSfx };
});
