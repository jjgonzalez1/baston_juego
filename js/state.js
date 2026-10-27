// ═══ Estado global compartido del juego ═══
export const G = {
  mode: '3d',            // '3d' | 'ar'
  running: false,
  time: 0,               // reloj del juego (segundos)
  battery: 100,          // % baterías del bastón
  link: 0,               // vínculo con el bosque 0..100
  flowUntil: -1,         // instante hasta el que dura el modo Flow
  taps: 0,
  crystals: 0,           // cristales revelados
  runesLit: 0,           // runas encendidas
  altarAwake: false,
  firstPulseDone: false,
  mushPoints: 0,         // vínculo otorgado por setas (tope 10)
  lastForce: 0,          // último golpe medido por el sensor (N)
  winShown: false,
  muted: false,
  best: 0,
};
try { G.best = Number(localStorage.getItem('baston_best') || 0); } catch (e) { /* sin storage */ }

export const inFlow = () => G.time < G.flowUntil;

export function addLink(n) {
  G.link = Math.min(100, G.link + n);
  if (G.link > G.best) {
    G.best = G.link;
    try { localStorage.setItem('baston_best', String(G.best)); } catch (e) { /* noop */ }
  }
}

export function resetState() {
  G.time = 0; G.battery = 100; G.link = 0; G.flowUntil = -1; G.taps = 0;
  G.crystals = 0; G.runesLit = 0; G.altarAwake = false; G.firstPulseDone = false;
  G.mushPoints = 0; G.lastForce = 0; G.winShown = false;
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const rand = (a, b) => a + Math.random() * (b - a);
