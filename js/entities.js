// ═══ Entidades vivas del bosque: luciérnagas, espíritus y chispas de energía ═══
import * as THREE from 'three';
import { clamp, rand } from './state.js';

// ─────────────────────────── Luciérnagas ───────────────────────────
const WANDER = 0, SEEK = 1, FLEE = 2, DANCE = 3;

export class Fireflies {
  constructor(parent, tex, count = 64, bounds = 22) {
    this.count = count; this.bounds = bounds;
    this.active = 26;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.state = new Uint8Array(count);
    this.seed = new Float32Array(count);
    this.target = new THREE.Vector3();
    this.seekT = 0;
    this.celebrateT = 0;
    for (let i = 0; i < count; i++) {
      this.seed[i] = Math.random() * 100;
      const j = i * 3;
      if (i < this.active) {
        this.pos[j] = rand(-bounds * 0.6, bounds * 0.6);
        this.pos[j + 1] = rand(0.4, 2.6);
        this.pos[j + 2] = rand(-bounds * 0.6, bounds * 0.6);
      } else this.pos[j + 1] = -999;
    }
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.17, map: tex, color: 0xffe28a, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.95,
    }));
    this.points.frustumCulled = false;
    parent.add(this.points);
    this._v = new THREE.Vector3();
  }

  setActive(n) { this.active = clamp(Math.round(n), 0, this.count); }

  pulse(point, force) {
    this.target.copy(point); this.target.y = Math.max(0.5, point.y);
    this.seekT = 3;
    for (let i = 0; i < this.active; i++) {
      const d = Math.hypot(this.pos[i * 3] - point.x, this.pos[i * 3 + 2] - point.z);
      if (force > 0.55 && d < 6) this.state[i] = FLEE;
      else if (force <= 0.55 && d < 5 && Math.random() < 0.55) this.state[i] = SEEK;
    }
  }

  celebrate(sec) { this.celebrateT = sec; }

  update(dt, t, caneHandle, windVec, center, flow) {
    const dancing = this.celebrateT > 0 || flow;
    if (this.celebrateT > 0) this.celebrateT -= dt;
    if (this.seekT > 0) this.seekT -= dt;
    const B = this.bounds;
    for (let i = 0; i < this.count; i++) {
      const j = i * 3;
      if (i >= this.active) { this.pos[j + 1] = -999; continue; }
      let vx = this.vel[j], vy = this.vel[j + 1], vz = this.vel[j + 2];
      const st = this.state[i];
      if (st === FLEE) {
        vx += (this.pos[j] - this.target.x) * 0.9 * dt;
        vz += (this.pos[j + 2] - this.target.z) * 0.9 * dt;
        vy += 0.6 * dt;
        if (this.seekT <= 0) this.state[i] = WANDER;
      } else if (st === SEEK) {
        vx += (this.target.x - this.pos[j]) * 1.1 * dt;
        vz += (this.target.z - this.pos[j + 2]) * 1.1 * dt;
        vy += (this.target.y - this.pos[j + 1]) * 0.8 * dt;
        if (Math.hypot(this.pos[j] - this.target.x, this.pos[j + 2] - this.target.z) < 0.45) this.state[i] = WANDER;
      } else if (dancing) {
        const a = t * 0.7 + this.seed[i];
        const r = 1.1 + Math.sin(this.seed[i] * 3.7) * 0.6;
        vx += (caneHandle.x + Math.cos(a) * r - this.pos[j]) * 1.6 * dt;
        vz += (caneHandle.z + Math.sin(a) * r - this.pos[j + 2]) * 1.6 * dt;
        vy += (caneHandle.y + 0.4 + Math.sin(t * 2 + this.seed[i]) * 0.4 - this.pos[j + 1]) * 1.6 * dt;
      } else {
        // vagar con ruido suave
        const s = this.seed[i];
        vx += Math.sin(t * 0.6 + s) * 0.5 * dt + Math.cos(t * 0.23 + s * 2) * 0.3 * dt;
        vz += Math.cos(t * 0.5 + s * 1.3) * 0.5 * dt;
        vy += Math.sin(t * 0.9 + s * 0.7) * 0.25 * dt;
      }
      // deriva del viento y límites
      vx += windVec.x * dt * 1.6; vz += windVec.z * dt * 1.6;
      const sp = Math.hypot(vx, vy, vz), maxS = st === FLEE ? 3.4 : dancing ? 1.6 : 0.9;
      if (sp > maxS) { const k = maxS / sp; vx *= k; vy *= k; vz *= k; }
      vx *= 0.995; vy *= 0.995; vz *= 0.995;
      let x = this.pos[j] + vx * dt, y = this.pos[j + 1] + vy * dt, z = this.pos[j + 2] + vz * dt;
      if (Math.hypot(x - center.x, z - center.z) > B) {
        x = center.x + (x - center.x) * 0.92; z = center.z + (z - center.z) * 0.92;
        vx *= -0.5; vz *= -0.5;
      }
      y = clamp(y, 0.25, 4.2);
      this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
      this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
    }
    this.attr.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.points.parent && this.points.parent.remove(this.points);
  }
}

// ─────────────────────────── Espíritus (fuego fatuo) ───────────────────────────
export class Spirits {
  constructor(parent, tex, center, count = 2) {
    this.center = center.clone();
    this.list = [];
    for (let i = 0; i < count; i++) {
      const grp = new THREE.Group();
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0x9fd8ff }),
      );
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, color: 0x9fd8ff, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.setScalar(0.9);
      grp.add(core, glow);
      parent.add(grp);
      this.list.push({
        grp, core, glow, pos: new THREE.Vector3(center.x + rand(-3, 3), 1.2, center.z + rand(-3, 3)),
        vel: new THREE.Vector3(), angle: rand(0, Math.PI * 2), happyT: 0, rewardCd: 0,
      });
    }
    this._v = new THREE.Vector3();
  }

  // El estado de calma del jugador cambia su humor
  update(dt, t, caneHandle, calm, bounds) {
    for (const s of this.list) {
      if (s.rewardCd > 0) s.rewardCd -= dt;
      let target;
      if (s.happyT > 0) {
        s.happyT -= dt;
        s.angle += dt * 5;
        target = this._v.set(
          caneHandle.x + Math.cos(s.angle) * 0.7,
          caneHandle.y + 0.5 + Math.sin(t * 6) * 0.2,
          caneHandle.z + Math.sin(s.angle) * 0.7);
      } else if (calm) {
        s.angle += dt * 0.9;
        target = this._v.set(
          caneHandle.x + Math.cos(s.angle) * 1.25,
          caneHandle.y + 0.15 + Math.sin(t * 1.8 + s.angle) * 0.15,
          caneHandle.z + Math.sin(s.angle) * 1.25);
      } else {
        // inquieto: se mantiene lejos del bastón
        target = this._v.set(
          this.center.x + Math.sin(t * 0.3 + s.angle * 4) * bounds * 0.45,
          1.6 + Math.sin(t * 0.7 + s.angle) * 0.5,
          this.center.z + Math.cos(t * 0.25 + s.angle * 3) * bounds * 0.45);
      }
      s.vel.addScaledVector(this._v.copy(target).sub(s.pos), dt * 1.6);
      s.vel.multiplyScalar(0.96);
      s.pos.addScaledVector(s.vel, dt);
      s.grp.position.copy(s.pos);
      // humor: azul tranquilo ↔ rojo agitado
      const mood = calm ? 1 : 0;
      s.core.material.color.lerpColors(new THREE.Color(0xff7a6e), new THREE.Color(0x9fd8ff), mood);
      s.glow.material.color.copy(s.core.material.color);
      const pulse = 0.75 + Math.sin(t * (calm ? 2.2 : 5) + s.angle) * 0.25;
      s.glow.material.opacity = 0.35 * pulse + 0.2;
      s.grp.scale.setScalar(1 + (s.happyT > 0 ? Math.sin(t * 12) * 0.15 : 0));
    }
  }

  pulse(point, force, fx, cb) {
    if (force > 0.5) return; // solo responde a golpes suaves
    for (const s of this.list) {
      if (s.rewardCd > 0) continue;
      if (s.pos.distanceTo(point) < 1.0) {
        s.happyT = 2.5; s.rewardCd = 25;
        fx.burst(s.pos, 0x9fd8ff, 26, 1.6, 1.2);
        fx.flash(s.pos, 0x9fd8ff, 2.5);
        cb();
        return;
      }
    }
  }

  dispose() {
    for (const s of this.list) {
      s.core.geometry.dispose(); s.core.material.dispose();
      s.glow.material.map && s.glow.material.map.dispose(); s.glow.material.dispose();
      s.grp.parent && s.grp.parent.remove(s.grp);
    }
  }
}

// ─────────────────────────── Chispas de energía → batería ───────────────────────────
export class Sparks {
  constructor(parent) {
    this.list = [];
    const geo = new THREE.OctahedronGeometry(0.075);
    const mat = new THREE.MeshBasicMaterial({ color: 0xb8ff7a });
    this.pool = [];
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false; parent.add(m); this.pool.push(m);
    }
    this._v = new THREE.Vector3();
  }

  spawn(point, n) {
    for (let k = 0; k < n; k++) {
      const m = this.pool.find((p) => !p.visible);
      if (!m) return;
      m.visible = true;
      m.position.copy(point);
      m.position.x += rand(-0.2, 0.2); m.position.z += rand(-0.2, 0.2);
      this.list.push({ m, age: 0, vel: this._v.set(rand(-0.4, 0.4), rand(1.2, 2), rand(-0.4, 0.4)).clone() });
    }
  }

  update(dt, t, handlePos, onCollect) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.age += dt;
      if (s.age < 0.8) {
        // flota hacia arriba un momento
        s.vel.y -= 0.4 * dt;
        s.m.position.addScaledVector(s.vel, dt);
      } else {
        // homing hacia el mango del bastón
        this._v.copy(handlePos).sub(s.m.position).normalize().multiplyScalar(7);
        s.vel.lerp(this._v, Math.min(1, dt * 4));
        s.m.position.addScaledVector(s.vel, dt);
        if (s.m.position.distanceTo(handlePos) < 0.35) {
          s.m.visible = false; this.list.splice(i, 1);
          onCollect && onCollect();
          continue;
        }
      }
      s.m.rotation.y += dt * 6; s.m.rotation.x += dt * 4;
      s.m.scale.setScalar(1 + Math.sin(t * 10 + s.age * 7) * 0.25);
      if (s.age > 12) { s.m.visible = false; this.list.splice(i, 1); }
    }
  }

  dispose() {
    for (const m of this.pool) { m.geometry.dispose(); m.material.dispose(); m.parent && m.parent.remove(m); }
  }
}
