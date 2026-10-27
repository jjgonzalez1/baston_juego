// ════════════════════════════════════════════════════════════════════
//   BASTÓN VIVO — Guardián del Bosque · juego de realidad mixta
//   El bastón del boceto cobra vida: mango bio-sensor (❤️/🫁), sensor de
//   fuerza en la punta (💪) y baterías (🔋) en un bosque nocturno reactivo.
// ════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { G, resetState, inFlow, clamp, rand } from './state.js';
import { AudioEngine } from './audio.js';
import { Bio } from './bio.js';
import { FX, makeDotTex, makeGlowTex } from './fx.js';
import { Cane } from './cane.js';
import { World } from './world.js';
import { Fireflies, Spirits, Sparks } from './entities.js';
import { HUD } from './hud.js';
import { XRManager } from './xr.js';
import { Input3D } from './input.js';

// ── Escenario base ──────────────────────────────────────────────────
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
renderer.xr.enabled = true;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1220);
scene.fog = new THREE.FogExp2(0x0a1220, 0.024);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.08, 140);
camera.position.set(0, 3.2, 9.2);

// luces: luna + hemisferio nocturno
scene.add(new THREE.HemisphereLight(0x33415c, 0x0c1410, 0.8));
const moonLight = new THREE.DirectionalLight(0x9db4ff, 0.6);
moonLight.position.set(-14, 20, -8);
scene.add(moonLight);

// ── Cielo: estrellas + luna (solo modo 3D) ──
const skyGroup = new THREE.Group();
{
  const n = 380;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), r = rand(40, 70), y = rand(6, 60);
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.32, color: 0xcfe4ff, transparent: true, opacity: 0.85,
    map: makeDotTex(), depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  }));
  skyGroup.add(stars);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTex(), color: 0xdfe9ff, transparent: true, opacity: 0.95, fog: false, depthWrite: false,
  }));
  moon.position.set(-22, 26, -42); moon.scale.setScalar(9);
  skyGroup.add(moon);
}
scene.add(skyGroup);

// ── Sistemas del juego (se crean al empezar) ──
let world = null, cane = null, fx = null, fireflies = null, spirits = null, sparks = null;
let bio = null, input = null, hud = null;
const audio = new AudioEngine();
const xr = new XRManager(renderer);
let flowWasOn = false, batteryDeadWarned = false;
const pendingPoint = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc2 = new THREE.Vector2();
const camTarget = new THREE.Vector3();
const _prevViewer = new THREE.Vector3();
const windVec = new THREE.Vector3();

// ── HUD y botones ──
hud = new HUD();
const $ = (id) => document.getElementById(id);

$('btn3D').addEventListener('click', () => startGame('3d'));
$('btnAR').addEventListener('click', () => startGame('ar'));
$('btnMute').addEventListener('click', () => {
  G.muted = !G.muted;
  audio.setMuted(G.muted);
  $('btnMute').textContent = G.muted ? '🔇' : '🔊';
});
$('btnHelp').addEventListener('click', () => $('helpModal').classList.remove('hidden'));
$('btnCloseHelp').addEventListener('click', () => $('helpModal').classList.add('hidden'));
$('btnContinue').addEventListener('click', () => hud.hideWin());
$('btnExitXR').addEventListener('click', () => { xr.exit(); });

// comprobar soporte AR
(async () => {
  const ok = await xr.isSupported();
  const btn = $('btnAR');
  if (ok) {
    btn.disabled = false;
    $('arNote').textContent = '✅ AR disponible — el bosque se materializará en tu habitación';
  } else {
    $('arNote').textContent = 'ℹ️ AR no disponible aquí — ábrelo en Chrome/Android o un visor compatible. El modo 3D funciona en cualquier navegador.';
  }
})();

// ── Arranque / parada ───────────────────────────────────────────────
function startGame(mode) {
  audio.init(); audio.resume(); audio.setMuted(G.muted);
  resetState();
  G.mode = mode; G.running = true;
  flowWasOn = false; batteryDeadWarned = false;
  hud.showGame(); hud.setMode(mode);

  const ar = mode === 'ar';
  scene.background = ar ? null : new THREE.Color(0x0a1220);
  scene.fog = ar ? null : new THREE.FogExp2(0x0a1220, ar ? 0 : 0.024);
  skyGroup.visible = !ar;

  const S = ar ? 0.45 : 1;
  world = new World(scene, { ar, S, center: new THREE.Vector3(0, 0, ar ? -1.5 : 0) });
  cane = new Cane(scene);
  if (ar) cane.root.scale.setScalar(0.62); // bastón de bolsillo en AR (~0,8 m)
  cane.onImpact = onCaneImpact;
  fx = new FX(scene);
  fireflies = new Fireflies(scene, makeDotTex(), 64, world.bounds);
  spirits = new Spirits(scene, makeGlowTex(), world.center.clone(), 2);
  sparks = new Sparks(scene);
  bio = new Bio();
  bindBio();

  if (!ar) {
    input = new Input3D(renderer.domElement, {
      onQuickStrike: (speed) => { cane.quickStrike(speed); },
      onChargeStart: () => cane.beginCharge(),
      onChargeRelease: () => { const f = cane.releaseCharge(); if (f) /* impacto en update */ ; },
    });
    cane.pos.set(0, 0, 3.5);
  }

  if (ar) {
    xr.enter(scene, {
      onSelect: (point, force) => {
        if (!G.running) return;
        const p = point || xr.fallbackPoint(new THREE.Vector3());
        pendingPoint.copy(p);
        cane.strike(clamp(force, 0.3, 1));
      },
      onEnd: () => stopGame(),
    }).catch((err) => {
      console.warn('XR error', err);
      hud.toast('No se pudo iniciar la sesión AR: ' + (err && err.message ? err.message : err));
      stopGame();
    });
    _prevViewer.copy(xr.viewerPos);
  }

  hud.toast(ar
    ? '🌲 Bosque materializado — toca la pantalla para golpear con el bastón'
    : '🌲 Mueve el ratón para guiar el bastón — haz clic para golpear el suelo', 4200);
}

function stopGame() {
  G.running = false;
  [world, cane, fx, fireflies, spirits, sparks].forEach((s) => s && s.dispose());
  world = cane = fx = fireflies = spirits = sparks = null;
  if (xr.session) xr.exit();
  hud.wind(false);
  hud.showStart();
}

function bindBio() {
  bio.onCalmCycle = (n) => {
    G.battery = Math.min(100, G.battery + 9);
    audio.collect();
    fx.burst(cane.handlePos, 0x37f5c8, 18, 1, 1.2);
    hud.toast(`🧘 Ciclo de respiración ${n}/3 — baterías +9%`);
  };
  bio.onFlowStart = () => {
    G.flowUntil = G.time + 60;
    audio.success();
    fireflies.setActive(fireflies.count);
    hud.toast('🌊 ¡MODO FLOW! 60 s de conexión total: golpes más baratos y amplios, luciérnagas danzando', 4200);
  };
  bio.onCalmAbort = (r) => hud.toast('💨 ' + r);
}

// ── Impacto del golpe del bastón (común a 3D y AR) ──
function onCaneImpact(force) {
  if (!G.running) return;
  const point = G.mode === 'ar' ? pendingPoint.clone() : cane.pos.clone();
  doPulse(point, force);
}

// ── Pipeline central: un pulso del sensor de fuerza transforma el entorno ──
function doPulse(point, force) {
  bio.interrupt();
  if (G.battery <= 0.5) {
    audio.fail();
    hud.toast('🔋 Batería agotada — quédate QUIETO y sigue la respiración guiada para recargar');
    return;
  }
  const flow = inFlow();
  const cost = (1.2 + force * 4.5) * (flow ? 0.5 : 1);
  G.battery = Math.max(0, G.battery - cost);
  G.taps++;
  G.lastForce = Math.round(force * 80 + Math.random() * 4);
  bio.feedMotion(0.14 + force * 0.25);

  const radius = (1 + force * 4.2) * (flow ? 1.35 : 1);
  const color = force > 0.55 ? 0xffd166 : 0x7fe8d0;
  fx.ring(point, radius, color, 0.75);
  fx.burst(point, color, 14 + Math.round(force * 22), 1.4 + force * 1.6, 1.4 + force);
  fx.flash(point, color, 2 + force * 3, 0.32);
  audio.thump(force);
  if (navigator.vibrate) { try { navigator.vibrate(20 + force * 45); } catch (e) { /* noop */ } }

  world.onPulse(point, force, fx, audio, {
    flow,
    toast: (m) => hud.toast(m),
    onCrystalRevealed: () => {
      G.crystals++;
      addProgress(10);
      audio.success();
      fireflies.setActive(26 + G.link * 0.34);
      hud.toast(`💎 ¡Cristal revelado! (${G.crystals}/3) — golpéalo SUAVE otra vez para absorberlo`, 3800);
    },
    onCrystalCollected: () => {
      G.battery = Math.min(100, G.battery + 18);
      hud.toast('🔋 Cristal absorbido por las baterías: +18%');
    },
    onRune: () => {
      G.runesLit++;
      addProgress(8);
      if (G.runesLit >= 5) hud.toast('🏮 ¡Todas las runas encendidas! El altar central despierta — golpéalo', 4200);
      else hud.toast(`🏮 Runa encendida (${G.runesLit}/5)`);
    },
    onAltar: () => {
      G.altarAwake = true;
      addProgress(20);
      world.celebrate();
      fireflies.celebrate(30);
      audio.success();
      hud.toast('🌲✨ ¡SANTUARIO CONECTADO! El bosque entero responde a tu bastón', 4600);
      if (G.link >= 100 && !G.winShown) {
        G.winShown = true;
        setTimeout(() => G.running && hud.showWin(), 2600);
      }
    },
    onMushroom: () => {
      if (G.mushPoints < 10) { G.mushPoints += 2; addProgress(2); }
      audio.sparkle();
    },
    spawnSparks: (pos, n) => sparks.spawn(pos, n),
  });

  // luciérnagas y espíritus reaccionan
  fireflies.pulse(point, force);
  spirits.pulse(point, force, fx, () => {
    addProgress(3);
    audio.chime(1320);
    hud.toast('💫 Has acariciado a un espíritu con un golpe suave — +3% vínculo');
  });

  if (!G.firstPulseDone) {
    G.firstPulseDone = true;
    addProgress(10);
    hud.toast('🌱 El bosque siente tu bastón…', 2600);
  }
}

function addProgress(n) { G.link = Math.min(100, G.link + n); if (G.link > G.best) { G.best = G.link; try { localStorage.setItem('baston_best', String(G.best)); } catch (e) { /* noop */ } } }

// ── Bucle principal ─────────────────────────────────────────────────
const clock = new THREE.Clock();
renderer.setAnimationLoop((tms, frame) => {
  const dt = Math.min(clock.getDelta(), 0.08);
  const t = clock.elapsedTime;

  if (!G.running) {
    // fondo animado tras el menú
    camera.position.x = Math.sin(t * 0.07) * 1.4;
    camera.position.y = 3.2 + Math.sin(t * 0.11) * 0.25;
    camera.lookAt(0, 1.2, -6);
    renderer.render(scene, camera);
    return;
  }

  G.time += dt;

  if (G.mode === '3d') {
    // cámara con paralaje suave
    const px = input ? input.ndc.x : 0, py = input ? input.ndc.y : -0.3;
    camera.position.x += (px * 1.2 - camera.position.x) * Math.min(1, dt * 3);
    camera.position.y += (3.2 + py * 0.5 - camera.position.y) * Math.min(1, dt * 3);
    camera.lookAt(0, 0.9, -4);
    // objetivo del bastón: intersección del puntero con el suelo
    ndc2.set(px, py);
    raycaster.setFromCamera(ndc2, camera);
    if (raycaster.ray.intersectPlane(groundPlane, camTarget)) {
      const d = Math.hypot(camTarget.x, camTarget.z);
      const maxR = world.bounds - 2;
      if (d > maxR) { camTarget.x *= maxR / d; camTarget.z *= maxR / d; }
    } else {
      camTarget.set(0, 0, 2);
    }
    camTarget.y = 0;
    if (input) {
      input.update(dt);
      bio.feedMotion(input.speed * dt * 1.1);
    }
  } else {
    // ══ Realidad mixta ══
    const refSpace = renderer.xr.getReferenceSpace();
    xr.updateFrame(frame, refSpace);
    // el bastón "se sostiene" frente al usuario, apuntando con la vista
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(xr.viewerQuat);
    fwd.y = 0;
    if (fwd.lengthSq() > 1e-6) fwd.normalize();
    camTarget.copy(xr.viewerPos).addScaledVector(fwd, 0.85);
    camTarget.y = xr.reticleVisible ? xr.reticlePos.y : xr.viewerPos.y - 1.35;
    // el movimiento del usuario alimenta el bio-sensor
    const moved = _prevViewer.distanceTo(xr.viewerPos);
    if (dt > 0) bio.feedMotion(clamp(moved / dt * 0.35, 0, 0.4));
    _prevViewer.copy(xr.viewerPos);
  }

  // carga del golpe (barra HUD)
  if (cane.charging) cane.chargeUpdate(dt);
  G._chargeLevel = cane.chargeLevel;

  cane.battery = G.battery;
  cane.bpm = bio.bpm;
  cane.flow = inFlow();
  cane.update(dt, t, camTarget);
  if (G.mode === 'ar') {
    // orientar el garfio del mango hacia el usuario
    cane.root.rotation.y = Math.atan2(xr.viewerPos.x - cane.pos.x, xr.viewerPos.z - cane.pos.z);
  }

  // viento
  windVec.set(Math.cos(world.wind.dirAng || 0), 0, Math.sin(world.wind.dirAng || 0));
  if (world.wind.gustEvent) {
    world.wind.gustEvent = false;
    world.wind.dirAng = rand(0, Math.PI * 2);
    audio.whoosh();
    hud.wind(true);
    setTimeout(() => hud.wind(false), 3600);
    hud.toast('🌬️ ¡Ráfaga! Los golpes sueltan el doble de chispas', 2400);
  }
  windVec.multiplyScalar(world.wind.level);

  world.update(dt, t);
  fireflies.update(dt, t, cane.handlePos, windVec, world.center, inFlow());
  spirits.update(dt, t, cane.handlePos, bio.activity < 0.15, world.bounds * 0.5);
  sparks.update(dt, t, cane.handlePos, () => {
    G.battery = Math.min(100, G.battery + 4);
    audio.sparkle();
  });
  fx.update(dt);

  // biofeedback + audio ambiental
  bio.update(dt);
  audio.update(dt, bio.bpm, world.wind.level, inFlow());

  // Flow se agota
  if (flowWasOn && !inFlow()) { hud.toast('El Flow se desvanece… quédate quieto para volver a conectar'); fireflies.setActive(26 + G.link * 0.34); }
  flowWasOn = inFlow();

  // drenaje pasivo de baterías + aviso
  if (G.battery > 0) G.battery = Math.max(0, G.battery - dt * 0.1);
  if (G.battery <= 0.5 && !batteryDeadWarned) {
    batteryDeadWarned = true;
    hud.toast('🔋 Baterías agotadas — el bastón entra en reposo. Quédate QUIETO: la respiración guiada lo reanimará', 5000);
  }
  if (G.battery > 20) batteryDeadWarned = false;

  hud.update(bio);
  renderer.render(scene, camera);
});

// ── Redimensionado ──
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Gancho de depuración/pruebas (expone el estado del juego) ──
window.__baston = {
  G, doPulse,
  get world() { return world; },
  get bio() { return bio; },
  get cane() { return cane; },
};
