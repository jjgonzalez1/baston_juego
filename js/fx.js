// ═══ Efectos: anillos de pulso, partículas, destellos y rayos de energía ═══
import * as THREE from 'three';

function dotTexture(size = 64, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner); grad.addColorStop(1, outer);
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const makeDotTex = () => dotTexture();
export const makeGlowTex = () => dotTexture(128);

export class FX {
  constructor(scene) {
    this.root = new THREE.Group(); scene.add(this.root);
    this.tex = makeDotTex();

    // ── Anillos de pulso expansivos ──
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.86, 1, 48);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: 0x7fe8d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide, depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 5;
      this.root.add(m);
      this.rings.push({ m, t: 1, dur: 1, r: 1 });
    }

    // ── Partículas (pool) ──
    this.N = 420;
    this.pos = new Float32Array(this.N * 3);
    this.col = new Float32Array(this.N * 3);
    this.vel = new Float32Array(this.N * 3);
    this.life = new Float32Array(this.N);
    this.life0 = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) this.pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.09, map: this.tex, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    this.root.add(this.points);
    this.cursor = 0;

    // ── Destellos de luz (pool) ──
    this.flashes = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0x7fe8d0, 0, 9, 2);
      this.root.add(l); this.flashes.push({ l, t: 1, dur: 1, i0: 0 });
    }

    // ── Rayos de energía (haz bastón→objetivo en AR) ──
    this.beams = [];
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
        color: 0x9fe8d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.visible = false; this.root.add(m);
      this.beams.push({ m, t: 1, dur: 1 });
    }
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._c = new THREE.Color();
  }

  burst(p, color, count = 24, speed = 2, up = 1.6) {
    this._c.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor; this.cursor = (this.cursor + 1) % this.N;
      const j = i * 3;
      this.pos[j] = p.x + (Math.random() - 0.5) * 0.06;
      this.pos[j + 1] = p.y + 0.05 + Math.random() * 0.06;
      this.pos[j + 2] = p.z + (Math.random() - 0.5) * 0.06;
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.65);
      this.vel[j] = Math.cos(a) * s;
      this.vel[j + 1] = up * (0.4 + Math.random() * 0.8);
      this.vel[j + 2] = Math.sin(a) * s;
      this.life[i] = this.life0[i] = 0.5 + Math.random() * 0.6;
      const k = 0.75 + Math.random() * 0.25;
      this.col[j] = this._c.r * k; this.col[j + 1] = this._c.g * k; this.col[j + 2] = this._c.b * k;
    }
  }

  ring(p, radius, color = 0x7fe8d0, dur = 0.8) {
    const r = this.rings.find((x) => x.t >= 1) || this.rings[0];
    r.t = 0; r.dur = dur; r.r = radius;
    r.m.position.set(p.x, p.y + 0.03, p.z);
    r.m.material.color.set(color);
    r.m.scale.setScalar(0.15); r.m.visible = true;
  }

  flash(p, color = 0x7fe8d0, intensity = 3, dur = 0.35) {
    const f = this.flashes.find((x) => x.t >= 1) || this.flashes[0];
    f.t = 0; f.dur = dur; f.i0 = intensity;
    f.l.position.copy(p); f.l.position.y += 0.5;
    f.l.color.set(color); f.l.intensity = intensity;
  }

  beam(from, to, color = 0x9fe8d0, dur = 0.45) {
    const b = this.beams.find((x) => x.t >= 1) || this.beams[0];
    b.t = 0; b.dur = dur;
    const mid = this._v.copy(from).add(to).multiplyScalar(0.5);
    const len = this._v2.copy(to).sub(from).length();
    b.m.position.copy(mid);
    b.m.scale.set(0.03, len, 0.03);
    b.m.quaternion.setFromUnitVectors(this._v2.set(0, 1, 0), this._v2.copy(to).sub(from).normalize());
    b.m.material.color.set(color);
    b.m.visible = true;
  }

  update(dt) {
    // anillos
    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt / r.dur);
      const e = 1 - Math.pow(1 - r.t, 3); // easeOutCubic
      r.m.scale.setScalar(0.15 + r.r * e);
      r.m.material.opacity = 0.85 * (1 - r.t);
      if (r.t >= 1) r.m.visible = false;
    }
    // partículas
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      if (this.life[i] <= 0) { this.pos[j + 1] = -999; this.col[j] = this.col[j + 1] = this.col[j + 2] = 0; continue; }
      this.vel[j + 1] -= 1.6 * dt;
      this.vel[j] *= 0.985; this.vel[j + 2] *= 0.985;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      const f = this.life[i] / this.life0[i];
      this.col[j] *= 0.996; this.col[j + 1] *= 0.996; this.col[j + 2] *= 0.996;
      if (f < 0.2) { this.col[j] *= 0.9; this.col[j + 1] *= 0.9; this.col[j + 2] *= 0.9; }
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    // destellos
    for (const f of this.flashes) {
      if (f.t >= 1) continue;
      f.t = Math.min(1, f.t + dt / f.dur);
      f.l.intensity = f.i0 * (1 - f.t);
    }
    // rayos
    for (const b of this.beams) {
      if (b.t >= 1) continue;
      b.t = Math.min(1, b.t + dt / b.dur);
      b.m.material.opacity = 0.7 * (1 - b.t);
      b.m.scale.x = b.m.scale.z = 0.03 * (1 - b.t * 0.6);
      if (b.t >= 1) b.m.visible = false;
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map && m.map.dispose(); m.dispose(); }); }
    });
    this.tex.dispose();
    this.root.parent && this.root.parent.remove(this.root);
  }
}
