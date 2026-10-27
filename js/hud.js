// ═══ HUD: sensores del bastón, vínculo, avisos, respiración y modales ═══
import { G, inFlow } from './state.js';

const $ = (id) => document.getElementById(id);
const HINTS = [
  '💡 Consejo: golpes suaves (&lt;45 N) para revelar los cristales de las rocas',
  '💡 Las luciérnagas se acercan a los golpes suaves y huyen de los fuertes',
  '💡 Quédate quieto unos segundos → Modo Calma → respiración guiada',
  '💡 Aprovecha las 🌬️ ráfagas: cada golpe suelta el doble de chispas',
  '💡 Mantén pulsado para cargar un golpe de alta fuerza',
  '💡 Los espíritus azules solo se dejan acariciar con golpes muy suaves',
];

export class HUD {
  constructor() {
    this.el = {
      hud: $('hud'), bpm: $('bpm'), resp: $('resp'), respPhase: $('respPhase'),
      forceN: $('forceN'), forceBar: $('forceBar'), chargeBar: $('chargeBar'),
      battPct: $('battPct'), battBar: $('battBar'), lowBatt: $('lowBatt'),
      flowBadge: $('flowBadge'), linkBar: $('linkBar'), linkPct: $('linkPct'),
      best: $('best'), objText: $('objText'), windBadge: $('windBadge'),
      breath: $('breath'), breathRing: $('breathRing'), breathPhase: $('breathPhase'),
      breathCount: $('breathCount'), toast: $('toast'), hint: $('hint'),
      vignette: $('vignette'), overlayStart: $('overlayStart'),
      winOverlay: $('winOverlay'), winStats: $('winStats'),
      helpModal: $('helpModal'), help3d: $('help3d'), helpxr: $('helpxr'),
      btnExitXR: $('btnExitXR'),
    };
    this._toastTimer = null;
    this._cache = {};
    this._hintIdx = 0;
    this.hintTimer = setInterval(() => {
      this._hintIdx = (this._hintIdx + 1) % HINTS.length;
      this.el.hint.innerHTML = HINTS[this._hintIdx];
    }, 14000);
    this.el.hint.innerHTML = HINTS[0];
  }

  showGame() {
    this.el.overlayStart.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
  }
  showStart() {
    this.el.overlayStart.classList.remove('hidden');
    this.el.hud.classList.add('hidden');
    this.el.winOverlay.classList.add('hidden');
    this.el.breath.classList.add('hidden');
  }

  toast(msg, ms = 3200) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.el.toast.classList.add('hidden'), ms);
  }

  setMode(mode) {
    this.el.help3d.classList.toggle('hidden', mode !== '3d');
    this.el.helpxr.classList.toggle('hidden', mode === '3d');
    this.el.btnExitXR.classList.toggle('hidden', mode !== 'ar');
  }

  objective() {
    if (!G.firstPulseDone) return '👆 Golpea el suelo con la punta del bastón para despertar el bosque';
    if (G.crystals < 3) return `💎 Revela los cristales: 3 golpes SUAVES a cada roca (${G.crystals}/3)`;
    if (G.runesLit < 5) return `🏮 Enciende las 5 runas del santuario, al fondo (${G.runesLit}/5)`;
    if (!G.altarAwake) return '🔮 Golpea el altar central para conectar el santuario';
    return '✨ Santuario conectado — mantén el Flow y explora';
  }

  // Actualización cada frame (escribe DOM solo si cambió)
  update(bio) {
    const c = this._cache;
    const put = (el, v, key) => { if (c[key] !== v) { c[key] = v; el.textContent = v; } };

    put(this.el.bpm, Math.round(bio.bpm), 'bpm');
    put(this.el.resp, bio.respRate, 'resp');
    const ph = bio.inhaling ? 'Inhalando' : 'Exhalando';
    put(this.el.respPhase, ph, 'ph');
    put(this.el.forceN, String(G.lastForce), 'fN');
    const fw = Math.min(100, (G.lastForce / 90) * 100);
    if (c.fBar !== fw) { c.fBar = fw; this.el.forceBar.style.width = fw + '%'; }

    const ch = Math.round((G._chargeLevel || 0) * 100);
    if (c.ch !== ch) { c.ch = ch; this.el.chargeBar.style.width = ch + '%'; }

    const batt = Math.round(G.battery);
    put(this.el.battPct, String(batt), 'batt');
    if (c.bBar !== batt) {
      c.bBar = batt;
      this.el.battBar.style.width = batt + '%';
      this.el.battBar.classList.toggle('low', batt <= 25);
    }
    this.el.lowBatt.classList.toggle('hidden', batt > 20 || !G.running);
    this.el.flowBadge.classList.toggle('hidden', !inFlow());

    if (c.link !== G.link) {
      c.link = G.link;
      this.el.linkBar.style.width = G.link + '%';
      this.el.linkPct.textContent = String(G.link);
    }
    if (c.best !== G.best) { c.best = G.best; this.el.best.textContent = `· récord ${G.best}%`; }
    const obj = this.objective();
    if (c.obj !== obj) { c.obj = obj; this.el.objText.innerHTML = obj; }

    // respiración guiada
    const b = this.el.breath;
    if (bio.calm.active) {
      b.classList.remove('hidden');
      const dur = bio.calm.phase === 'inhale' ? 4 : 6;
      const prog = bio.calm.t / dur;
      const off = 276.5 * (1 - (bio.calm.phase === 'inhale' ? prog : 1 - prog));
      this.el.breathRing.style.strokeDashoffset = off;
      this.el.breathRing.classList.toggle('exhale', bio.calm.phase === 'exhale');
      put(this.el.breathPhase, bio.calm.phase === 'inhale' ? 'Inhala…' : 'Exhala…', 'bph');
      put(this.el.breathCount, `ciclo ${bio.calm.done + 1}/3`, 'bc');
    } else {
      b.classList.add('hidden');
    }

    // viñeta: roja con agitación, cian en Flow
    const vig = this.el.vignette;
    if (inFlow()) { vig.classList.add('flow'); vig.style.opacity = 0.55; }
    else {
      vig.classList.remove('flow');
      vig.style.opacity = bio.activity > 0.55 ? String(Math.min(0.8, (bio.activity - 0.5) * 1.4)) : '0';
    }
  }

  wind(on) { this.el.windBadge.classList.toggle('hidden', !on); }

  showWin() {
    const mins = Math.floor(G.time / 60), secs = Math.floor(G.time % 60);
    this.el.winStats.innerHTML = [
      `👆 Golpes con el sensor de fuerza: <b>${G.taps}</b>`,
      `💎 Cristales revelados: <b>${G.crystals}/3</b>`,
      `🏮 Runas encendidas: <b>${G.runesLit}/5</b>`,
      `⏱️ Tiempo: <b>${mins}m ${String(secs).padStart(2, '0')}s</b>`,
      `🌿 Vínculo final: <b>100%</b> — ¡el bosque está vivo!`,
    ].join('<br>');
    this.el.winOverlay.classList.remove('hidden');
  }
  hideWin() { this.el.winOverlay.classList.add('hidden'); }
}
