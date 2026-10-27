// ═══ Biofeedback simulado — sensores del mango (frecuencia cardíaca y respiración) ═══
// La "actividad" del jugador (movimiento, golpes) eleva el pulso; la quietud lo calma
// y habilita el minijuego de respiración guiada que recarga baterías y desbloquea Flow.
import { clamp } from './state.js';

const INHALE = 4, EXHALE = 6; // segundos por fase

export class Bio {
  constructor() {
    this.activity = 0;      // 0..1 agitación del usuario
    this.bpm = 62;
    this.respPhase = 0;     // 0..1 ciclo respiratorio
    this.stillness = 0;     // segundos en calma
    this.flowT = 0;         // segundos restantes de Flow
    this.calm = { active: false, phase: 'inhale', t: 0, done: 0 };
    this._cooldown = 0;
    // callbacks (los conecta main.js)
    this.onCalmCycle = null;   // (n) => {}
    this.onFlowStart = null;   // () => {}
    this.onCalmAbort = null;   // (motivo) => {}
  }

  get flow() { return this.flowT > 0; }
  get respRate() { return Math.round(11 + this.activity * 9 + (this.flow ? -1 : 0)); }
  get inhaling() { return this.respPhase < 0.4; } // 40% inhalar, 60% exhalar

  feedMotion(amount) {
    this.activity = clamp(this.activity + amount, 0, 1);
    if (amount > 0.22 && this.calm.active) this._abortCalm('¡Te moviste! La respiración se detuvo');
  }

  update(dt) {
    this.activity = Math.max(0, this.activity - dt * 0.1);
    const target = 62 + this.activity * 78 + (this.flow ? -10 : 0);
    this.bpm += (target - this.bpm) * Math.min(1, dt * 0.5);
    this.respPhase = (this.respPhase + dt * this.respRate / 60) % 1;

    if (this.activity > 0.15) {
      this.stillness = 0;
      if (this.calm.active) this._abortCalm('Detectado movimiento — calma interrumpida');
    } else {
      this.stillness += dt;
    }

    if (this._cooldown > 0) this._cooldown -= dt;

    // Arranque automático del Modo Calma tras unos segundos de quietud
    if (!this.calm.active && !this.flow && this.stillness > 3.5 && this._cooldown <= 0) {
      this.calm.active = true; this.calm.phase = 'inhale'; this.calm.t = 0;
    }

    if (this.calm.active) {
      const c = this.calm;
      c.t += dt;
      const dur = c.phase === 'inhale' ? INHALE : EXHALE;
      if (c.t >= dur) {
        c.t = 0;
        if (c.phase === 'inhale') c.phase = 'exhale';
        else {
          c.phase = 'inhale'; c.done++;
          this.onCalmCycle && this.onCalmCycle(c.done);
          if (c.done >= 3) {
            c.active = false; c.done = 0;
            this.flowT = 60;
            this.onFlowStart && this.onFlowStart();
          }
        }
      }
    }

    if (this.flow) this.flowT -= dt;
  }

  // Un golpe interrumpe la meditación
  interrupt() { if (this.calm.active) this._abortCalm('Golpe detectado — calma interrumpida'); }

  _abortCalm(reason) {
    this.calm.active = false; this.calm.done = 0; this._cooldown = 5;
    this.onCalmAbort && this.onCalmAbort(reason);
  }
}
