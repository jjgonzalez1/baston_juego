// ═══ Motor de audio sintetizado (Web Audio API) — sin ficheros externos ═══
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.hbT = 0; // temporizador de latidos
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);

    // ── Colchón ambiental: acorde grave y oscuro ──
    const padGain = ctx.createGain(); padGain.gain.value = 0.035;
    const padFilter = ctx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 340;
    padGain.connect(padFilter); padFilter.connect(this.master);
    [110, 164.8, 220].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = (i - 1) * 5;
      const g = ctx.createGain(); g.gain.value = i ? 0.5 : 0.8;
      o.connect(g); g.connect(padGain); o.start();
    });

    // ── Viento: ruido en bucle filtrado ──
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.6;
    const src = ctx.createBufferSource(); src.buffer = this._noise(2); src.loop = true;
    src.connect(wf); wf.connect(this.windGain); this.windGain.connect(this.master); src.start();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setMuted(m) { if (this.master) this.master.gain.value = m ? 0 : 0.9; }

  _noise(sec) {
    const b = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * sec), this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _env(g, t0, attack, peak, decay) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  // Latido del sensor cardíaco del mango (lub-dub)
  _heart(quiet) {
    const t = this.ctx.currentTime;
    const peak = quiet ? 0.045 : 0.085;
    const beat = (off, f, p) => {
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f, t + off);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f * 0.6), t + off + 0.1);
      const g = this.ctx.createGain(); this._env(g, t + off, 0.006, p, 0.12);
      o.connect(g); g.connect(this.master); o.start(t + off); o.stop(t + off + 0.25);
    };
    beat(0, 55, peak); beat(0.16, 46, peak * 0.7);
  }

  // Golpe del sensor de fuerza (0..1)
  thump(force) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this._noise(0.2);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220 + force * 620;
    const g = this.ctx.createGain(); this._env(g, t, 0.004, 0.2 + force * 0.5, 0.12 + force * 0.1);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.13);
    const g2 = this.ctx.createGain(); this._env(g2, t, 0.005, 0.28 + force * 0.4, 0.2);
    o.connect(g2); g2.connect(this.master); o.start(t); o.stop(t + 0.35);
  }

  chime(freq = 880) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [[freq, 0.11], [freq * 2.01, 0.04]].forEach(([f, p]) => {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = this.ctx.createGain(); this._env(g, t, 0.008, p, 0.9);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.1);
    });
  }

  sparkle() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = 1400 + Math.random() * 1800;
      const g = this.ctx.createGain(); this._env(g, t + i * 0.07, 0.005, 0.05, 0.15);
      o.connect(g); g.connect(this.master); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.25);
    }
  }

  collect() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [[660, 0], [990, 0.1]].forEach(([f, off]) => {
      const o = this.ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = this.ctx.createGain(); this._env(g, t + off, 0.01, 0.12, 0.25);
      o.connect(g); g.connect(this.master); o.start(t + off); o.stop(t + off + 0.4);
    });
  }

  success() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1046].forEach((f, i) => {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = this.ctx.createGain(); this._env(g, t + i * 0.13, 0.01, 0.12, 0.5);
      o.connect(g); g.connect(this.master); o.start(t + i * 0.13); o.stop(t + i * 0.13 + 0.7);
    });
  }

  fail() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 110;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = this.ctx.createGain(); this._env(g, t, 0.01, 0.1, 0.25);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.35);
  }

  whoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this._noise(1.4);
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(220, t);
    f.frequency.linearRampToValueAtTime(950, t + 0.55);
    f.frequency.linearRampToValueAtTime(260, t + 1.25);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.3);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }

  // Llamado cada frame: viento, latidos según bpm
  update(dt, bpm, wind, flow) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(Math.min(1, wind) * 0.32, t, 0.4);
    this.hbT -= dt;
    if (this.hbT <= 0) { this._heart(flow); this.hbT = 60 / Math.max(40, bpm); }
  }
}
