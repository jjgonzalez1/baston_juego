// ═══ El bastón inteligente — modelo 3D según el boceto + física de manejo ═══
// Estructura del boceto: mango en garfio con sensores cardíaco/respiratorios,
// compartimento de baterías en el mástil, anillo sensor de fuerza y punta de goma.
import * as THREE from 'three';
import { clamp } from './state.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function heartTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ff5e7a'; g.shadowColor = '#ff5e7a'; g.shadowBlur = 18;
  g.beginPath();
  const s = 3.2;
  g.moveTo(64, 96 / s + 32);
  g.bezierCurveTo(64, 88 / s + 32, 40, 76 / s + 32, 40, 56 / s + 32);
  g.bezierCurveTo(40, 42 / s + 32, 58, 40 / s + 32, 64, 52 / s + 32);
  g.bezierCurveTo(70, 40 / s + 32, 88, 42 / s + 32, 88, 56 / s + 32);
  g.bezierCurveTo(88, 76 / s + 32, 64, 88 / s + 32, 64, 96 / s + 32);
  g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Cane {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.pos = V(0, 0, 2);       // posición de la punta
    this.vel = new THREE.Vector3();
    this.strikeT = 1;            // 0..1 animación de golpe (1 = reposo)
    this.strikeDur = 0.34;
    this.impacted = true;
    this.pendingForce = 0;
    this.charge = 0;
    this.charging = false;
    this.battery = 100;
    this.bpm = 62;
    this.flow = false;
    this.onImpact = null;        // callback al tocar el suelo
    this._t = 0;
    this._tmp = V(0, 0, 0);
    this._build();
  }

  _build() {
    const wood = new THREE.MeshStandardMaterial({ color: 0xa06d3d, roughness: 0.55, metalness: 0.08 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x6b4726, roughness: 0.7 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.95 });

    // ── Mástil + mango en garfio (perfil del boceto) ──
    const profile = [
      V(0, 0.1, 0), V(0, 0.62, 0.004), V(0, 0.98, 0.012), V(0, 1.14, 0.06),
      V(0, 1.22, 0.16), V(0, 1.24, 0.28), V(0, 1.18, 0.38), V(0, 1.05, 0.425), V(0, 0.92, 0.42),
    ];
    const curve = new THREE.CatmullRomCurve3(profile);
    const shaft = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.034, 12, false), wood);
    this.root.add(shaft);

    // empuñadura de goma sobre la zona recta del mango
    const gripCurve = new THREE.CatmullRomCurve3([V(0, 0.84, 0.006), V(0, 1.02, 0.018), V(0, 1.15, 0.062)]);
    const grip = new THREE.Mesh(new THREE.TubeGeometry(gripCurve, 20, 0.049, 12, false),
      new THREE.MeshStandardMaterial({ color: 0x2e3338, roughness: 0.95 }));
    this.root.add(grip);

    // ── Pastillas sensoras del mango (cardíaca + respiración) — pulsan con el BPM ──
    this.padMat = new THREE.MeshStandardMaterial({
      color: 0x0d3a33, emissive: 0x37f5c8, emissiveIntensity: 0.8, roughness: 0.4,
    });
    [0.9, 0.98, 1.06].forEach((y, i) => {
      const pad = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.03, 4, 8), this.padMat);
      pad.rotation.z = Math.PI / 2;
      pad.position.set(0, y, 0.048 + (i === 1 ? 0.004 : 0));
      this.root.add(pad);
    });

    // glifo de corazón (frecuencia cardíaca) en el frontal del mango
    this.heartSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: heartTexture(), transparent: true, depthWrite: false, opacity: 0.95,
    }));
    this.heartSprite.position.set(0, 0.76, 0.06);
    this.heartSprite.scale.setScalar(0.085);
    this.root.add(this.heartSprite);

    // ── Compartimento de baterías (cápsula verde del boceto) ──
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.22, 0.028), rubber);
    slot.position.set(0, 0.44, 0.036);
    this.root.add(slot);
    this.battMat = new THREE.MeshStandardMaterial({
      color: 0x123312, emissive: 0x39d353, emissiveIntensity: 1.4, roughness: 0.3,
    });
    const cell = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.12, 4, 10), this.battMat);
    cell.position.set(0, 0.44, 0.052);
    this.root.add(cell);

    // ── Anillo sensor de fuerza + punta de goma ──
    this.sensorMat = new THREE.MeshStandardMaterial({
      color: 0x0a2d33, emissive: 0x35d5ff, emissiveIntensity: 1, roughness: 0.35,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.013, 10, 24), this.sensorMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.115;
    this.root.add(ring);
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.038, 0.1, 14), rubber);
    ferrule.position.y = 0.05;
    this.root.add(ferrule);

    // luz propia del bastón
    this.light = new THREE.PointLight(0xbfead0, 1, 8, 2);
    this.light.position.set(0, 0.25, 0);
    this.root.add(this.light);

    // sombra de contacto
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.17, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012;
    this.root.add(shadow);
  }

  // Lanza un golpe con fuerza normalizada 0..1 — devuelve false si ya hay uno en curso
  strike(force) {
    if (this.strikeT < 1) return false;
    this.strikeT = 0; this.impacted = false; this.pendingForce = force;
    return true;
  }

  beginCharge() { if (this.strikeT >= 1) { this.charging = true; this.charge = 0; } }
  chargeUpdate(dt) { if (this.charging) this.charge = Math.min(1, this.charge + dt / 1.2); }
  releaseCharge() {
    if (!this.charging) return 0;
    this.charging = false;
    const f = 0.45 + 0.55 * this.charge;
    this.charge = 0;
    return this.strike(f) ? f : 0;
  }

  quickStrike(speedNorm = 0.4) {
    const f = clamp(0.3 + speedNorm * 0.65, 0.3, 0.95);
    return this.strike(f) ? f : 0;
  }

  update(dt, t, target) {
    this._t = t;
    // resorte: la punta persigue el objetivo
    this._tmp.copy(target).sub(this.pos).multiplyScalar(38);
    this.vel.addScaledVector(this._tmp, dt);
    this.vel.multiplyScalar(Math.max(0, 1 - 7.5 * dt));
    this.pos.addScaledVector(this.vel, dt);

    // animación de golpe: la cabeza se inclina y vuelve; impacto al 45%
    let baseX = 0.05 + clamp(-this.vel.z * 0.12, -0.3, 0.3);
    if (this.strikeT < 1) {
      this.strikeT = Math.min(1, this.strikeT + dt / this.strikeDur);
      const s = Math.sin(this.strikeT * Math.PI);
      baseX -= s * 0.62;
      if (!this.impacted && this.strikeT >= 0.45) {
        this.impacted = true;
        this.onImpact && this.onImpact(this.pendingForce);
      }
    }
    this.root.position.copy(this.pos);
    this.root.rotation.x = baseX;
    this.root.rotation.z = clamp(-this.vel.x * 0.2, -0.5, 0.5) + Math.sin(t * 0.9) * 0.015;

    // ── respuestas de los sensores ──
    const beat = Math.pow(Math.max(0, Math.sin(t * (this.bpm / 60) * Math.PI)), 24); // pico por latido
    this.padMat.emissiveIntensity = 0.5 + beat * 1.6;
    this.heartSprite.scale.setScalar(0.08 + beat * 0.035);

    // batería: verde → ámbar → rojo
    if (this.flow) this.battMat.emissive.set(0x35d5ff);
    else if (this.battery > 45) this.battMat.emissive.set(0x39d353);
    else if (this.battery > 20) this.battMat.emissive.set(0xffc94d);
    else this.battMat.emissive.set(0xff5e5e);
    const blink = this.battery <= 15 ? (Math.sin(t * 8) > 0 ? 1 : 0.15) : 1;
    this.battMat.emissiveIntensity = (0.5 + (this.battery / 100) * 1.4) * blink;

    // sensor de fuerza: carga o pulso tras el golpe
    if (this.charging) this.sensorMat.emissiveIntensity = 1 + this.charge * 3;
    else this.sensorMat.emissiveIntensity = Math.max(0.6, 2.2 - this.strikeT * 2) + beat * 0.3;

    // luz del bastón según batería
    this.light.intensity = this.flow
      ? 1.6 + Math.sin(t * 4) * 0.4
      : 0.3 + (this.battery / 100) * 0.95;
    this.light.color.set(this.flow ? 0x9fd8ff : 0xbfead0);
  }

  get handlePos() { return this.root.localToWorld(this._tmp.set(0, 1.02, 0)); }
  get tipPos() { return this._tmp.copy(this.pos); }
  get chargeLevel() { return this.charging ? this.charge : 0; }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); }
    });
    this.root.parent && this.root.parent.remove(this.root);
  }
}
