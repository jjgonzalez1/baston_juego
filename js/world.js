// ═══ Mundo procedural reactivo: bosque nocturno, rocas, setas, santuario y viento ═══
import * as THREE from 'three';
import { rand } from './state.js';

function runeTexture(i) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#ffd166'; g.lineWidth = 10; g.lineCap = 'round';
  g.shadowColor = '#ffd166'; g.shadowBlur = 14;
  g.beginPath();
  const strokes = [
    () => { g.moveTo(40, 24); g.lineTo(40, 104); g.moveTo(40, 40); g.lineTo(88, 24); g.moveTo(40, 72); g.lineTo(88, 56); },
    () => { g.moveTo(64, 20); g.lineTo(64, 108); g.moveTo(36, 48); g.lineTo(92, 48); g.moveTo(36, 84); g.lineTo(92, 84); },
    () => { g.moveTo(30, 100); g.lineTo(64, 24); g.lineTo(98, 100); g.moveTo(44, 72); g.lineTo(84, 72); },
    () => { g.moveTo(34, 30); g.lineTo(94, 30); g.lineTo(34, 98); g.lineTo(94, 98); },
    () => { g.moveTo(64, 20); g.lineTo(34, 64); g.lineTo(64, 108); g.lineTo(94, 64); g.lineTo(64, 20); g.moveTo(64, 44); g.lineTo(64, 84); },
  ][i % 5];
  strokes();
  g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class World {
  // opts: { ar:boolean, S:escala, center:Vector3 }
  constructor(parent, opts = {}) {
    this.ar = !!opts.ar;
    this.S = opts.S || 1;
    this.center = (opts.center || new THREE.Vector3()).clone();
    this.bounds = this.ar ? 8 : 22;
    this.root = new THREE.Group();
    parent.add(this.root);

    this.shrinePos = this.center.clone().add(new THREE.Vector3(0, 0, -10 * this.S));
    this.trees = [];
    this.mushrooms = [];
    this.rocks = [];
    this.runes = [];
    this.wind = { level: 0, target: 0, gusting: false, dur: 0, next: rand(9, 15), dir: new THREE.Vector3(1, 0, 0), gustEvent: false };

    this._buildGround();
    this._buildTrees();
    this._buildRocks();
    this._buildMushrooms();
    this._buildShrine();
    this._v = new THREE.Vector3();
  }

  _p(x, z) { return new THREE.Vector3(this.center.x + x * this.S, this.center.y, this.center.z + z * this.S); }

  _buildGround() {
    if (this.ar) {
      // disco de "musgo" para anclar visualmente el área de juego sobre el suelo real
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(3.1 * this.S, 40),
        new THREE.MeshBasicMaterial({ color: 0x0e2a1c, transparent: true, opacity: 0.3, depthWrite: false }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.copy(this.center); disc.position.y += 0.008;
      this.root.add(disc);
      return;
    }
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 56),
      new THREE.MeshStandardMaterial({ color: 0x1d3526, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.root.add(ground);
    // parches de musgo
    for (let i = 0; i < 16; i++) {
      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(rand(0.7, 2.2), 20),
        new THREE.MeshStandardMaterial({ color: Math.random() > 0.5 ? 0x182d1d : 0x24402c, roughness: 1 }),
      );
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(rand(-20, 20), 0.005 + i * 0.0004, rand(-20, 20));
      this.root.add(patch);
    }
  }

  _blobShadow(x, z, r) {
    const s = new THREE.Mesh(
      new THREE.CircleGeometry(r, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    s.rotation.x = -Math.PI / 2;
    s.position.copy(this._p(x, z)); s.position.y += 0.012;
    this.root.add(s);
  }

  _buildTrees() {
    const n = this.ar ? 9 : 26;
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.95 });
    const leafMats = [
      new THREE.MeshStandardMaterial({ color: 0x14301f, roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: 0x0f2718, roughness: 1 }),
    ];
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const rMin = this.ar ? 3.4 : 7.5, rMax = this.ar ? 8.5 : 21;
      const r = rand(rMin, rMax) * (this.ar ? 1 : 1);
      const x = this.center.x + Math.cos(a) * r * (this.ar ? this.S : 1);
      const z = this.center.z + Math.sin(a) * r * (this.ar ? this.S : 1);
      if (!this.ar || true) {
        const dShrine = Math.hypot(x - this.shrinePos.x, z - this.shrinePos.z);
        if (dShrine < (this.ar ? 2.6 : 6.5)) continue; // despejar el santuario
      }
      const grp = new THREE.Group();
      const s = rand(0.8, 1.5) * this.S * (this.ar ? 0.62 : 1);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.11 * s, 1.1 * s, 7), trunkMat);
      trunk.position.y = 0.55 * s;
      grp.add(trunk);
      let y = 1.0 * s;
      for (let k = 0; k < 3; k++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry((0.62 - k * 0.16) * s, 0.8 * s, 8), leafMats[k % 2]);
        cone.position.y = y + 0.32 * s;
        grp.add(cone);
        y += 0.42 * s;
      }
      grp.position.set(x, this.center.y, z);
      this.root.add(grp);
      this.trees.push({ grp, phase: rand(0, 6.28), amp: rand(0.015, 0.04) });
      if (!this.ar) this._blobShadow(x - this.center.x, z - this.center.z, 0.5 * s);
    }
  }

  _buildRocks() {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5b626d, roughness: 0.9, flatShading: true });
    const spots = [[4.6, -1.2], [-4.9, -3.6], [2.4, -6.4]];
    spots.forEach(([x, z], i) => {
      const p = this._p(x, z);
      const grp = new THREE.Group();
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42 * this.S), rockMat);
      rock.scale.y = 0.72;
      rock.position.y = 0.26 * this.S;
      rock.rotation.y = rand(0, 3);
      grp.add(rock);
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.2 * this.S),
        new THREE.MeshStandardMaterial({
          color: 0x7fd4ff, emissive: 0x4db8ff, emissiveIntensity: 1.6, roughness: 0.15, flatShading: true,
        }),
      );
      crystal.position.y = 0.75 * this.S;
      crystal.scale.setScalar(0.001);
      grp.add(crystal);
      grp.position.copy(p);
      this.root.add(grp);
      this.rocks.push({ grp, rock, crystal, pos: p, taps: 0, revealed: false, collected: false, revealT: 0, shake: 0, phase: i * 2.1 });
      if (!this.ar) this._blobShadow(x, z, 0.5 * this.S);
    });
  }

  _buildMushrooms() {
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xd8d2be, roughness: 0.8 });
    const colors = [0x37f5c8, 0xff6ea9, 0x9fe870, 0x37f5c8];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rand(-0.4, 0.4);
      const r = rand(3.2, 10) * this.S;
      const px = this.center.x + Math.cos(a) * r;
      const pz = this.center.z + Math.sin(a) * r;
      if (Math.hypot(px - this.shrinePos.x, pz - this.shrinePos.z) < 3.4 * this.S) continue;
      const color = colors[i % colors.length];
      const capMat = new THREE.MeshStandardMaterial({ color: 0x1a3a33, emissive: color, emissiveIntensity: 0.7, roughness: 0.5 });
      const grp = new THREE.Group();
      const count = 2 + Math.floor(Math.random() * 2);
      for (let k = 0; k < count; k++) {
        const sc = rand(0.7, 1.3) * this.S;
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * sc, 0.024 * sc, 0.14 * sc, 6), stemMat);
        stem.position.set(rand(-0.09, 0.09) * this.S, 0.07 * sc, rand(-0.09, 0.09) * this.S);
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(0.055 * sc, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
          capMat,
        );
        cap.position.copy(stem.position); cap.position.y += 0.07 * sc;
        grp.add(stem, cap);
      }
      grp.position.set(px, this.center.y, pz);
      this.root.add(grp);
      this.mushrooms.push({ grp, capMat, color, pos: grp.position.clone(), cd: 0, phase: rand(0, 6) });
    }
  }

  _buildShrine() {
    const c = this.shrinePos;
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 0.85 });
    // plataforma circular
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(1.35 * this.S, 1.55 * this.S, 0.16 * this.S, 24), stoneMat);
    dais.position.set(c.x, c.y + 0.08 * this.S, c.z);
    this.root.add(dais);
    // altar central
    this.altar = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * this.S, 0.38 * this.S, 0.5 * this.S, 12), stoneMat);
    this.altar.position.set(c.x, c.y + 0.42 * this.S, c.z);
    this.root.add(this.altar);
    this.orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.17 * this.S, 1),
      new THREE.MeshStandardMaterial({ color: 0x1c2733, emissive: 0x8899aa, emissiveIntensity: 0.25, roughness: 0.2, flatShading: true }),
    );
    this.orb.position.set(c.x, c.y + 0.95 * this.S, c.z);
    this.root.add(this.orb);
    // haz del despertar (oculto hasta la victoria)
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * this.S, 0.32 * this.S, 9 * this.S, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9fe8d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beam.position.set(c.x, c.y + 4.5 * this.S, c.z);
    this.root.add(this.beam);
    // 5 runas alrededor
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 5;
      const rx = c.x + Math.cos(a) * 2.3 * this.S;
      const rz = c.z + Math.sin(a) * 2.3 * this.S;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.17 * this.S, 0.78 * this.S, 0.14 * this.S), stoneMat);
      pillar.position.set(rx, c.y + 0.39 * this.S, rz);
      pillar.rotation.y = -a + Math.PI / 2;
      pillar.rotation.z = rand(-0.05, 0.05);
      this.root.add(pillar);
      const glyphMat = new THREE.MeshBasicMaterial({
        map: runeTexture(i), color: 0xffd166, transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.13 * this.S, 0.5 * this.S), glyphMat);
      glyph.position.set(rx, c.y + 0.46 * this.S, rz);
      glyph.rotation.y = -a + Math.PI / 2;
      glyph.translateZ(0.08 * this.S);
      this.root.add(glyph);
      this.runes.push({ pillar, glyphMat, pos: new THREE.Vector3(rx, c.y, rz), lit: false, phase: i });
    }
  }

  // ═══════════ Resposta a un pulso del bastón ═══════════
  // cb: { onCrystalRevealed, onCrystalCollected(pos), onRune, onAltar, onMushroom(color), spawnSparks(pos,n), toast(msg) }
  onPulse(point, force, fx, audio, cb) {
    const S = this.S;

    // Rocas → cristales (solo golpes SUAVES)
    for (const r of this.rocks) {
      const d = Math.hypot(point.x - r.pos.x, point.z - r.pos.z);
      if (d > 0.95 * S) continue;
      if (!r.revealed) {
        if (force < 0.55) {
          r.taps++;
          fx.ring(r.pos, 0.9 * S, 0x7fd4ff, 0.5);
          audio.chime(340 + r.taps * 140);
          if (r.taps >= 3) {
            r.revealed = true; r.revealT = 0;
            fx.burst(r.pos.clone().setY(r.pos.y + 0.6 * S), 0x7fd4ff, 30, 1.6, 2);
            fx.flash(r.pos, 0x7fd4ff, 3);
            cb.onCrystalRevealed();
          } else {
            cb.toast(`Roca: golpe suave ${r.taps}/3 — sigue así…`);
          }
        } else {
          r.taps = 0; r.shake = 1;
          audio.fail();
          fx.burst(r.pos, 0x888888, 10, 1.2, 1);
          cb.toast('💥 Demasiado fuerte — la roca se agrietó. Prueba golpes suaves');
        }
      } else if (!r.collected && force < 0.6) {
        r.collected = true;
        r.crystal.visible = false;
        fx.burst(r.pos.clone().setY(r.pos.y + 0.7 * S), 0xb8ff7a, 34, 2, 2.4);
        fx.flash(r.pos, 0xb8ff7a, 3);
        audio.collect();
        cb.onCrystalCollected(r.pos.clone().setY(r.pos.y + 0.7 * S));
      }
    }

    // Setas → esporas
    for (const m of this.mushrooms) {
      const d = Math.hypot(point.x - m.pos.x, point.z - m.pos.z);
      if (d < 0.8 * S && m.cd <= 0) {
        m.cd = 6;
        const top = m.pos.clone(); top.y += 0.16 * S;
        fx.burst(top, m.color, 22, 1.1, 1.8);
        fx.flash(top, m.color, 1.8, 0.3);
        audio.chime(1000 + Math.random() * 500);
        cb.onMushroom(m.color);
      }
    }

    // Runas del santuario
    for (const rn of this.runes) {
      const d = Math.hypot(point.x - rn.pos.x, point.z - rn.pos.z);
      if (d < 0.75 * S && force > 0.25) {
        if (!rn.lit) {
          rn.lit = true;
          fx.flash(rn.pos, 0xffd166, 3);
          fx.ring(rn.pos, 1.4 * S, 0xffd166, 0.7);
          audio.chime(660 + rn.phase * 60);
          cb.onRune();
        } else {
          fx.burst(rn.pos.clone().setY(rn.pos.y + 0.5 * S), 0xffd166, 8, 0.8, 1.2);
        }
      }
    }

    // Altar (requiere las 5 runas)
    const dAltar = Math.hypot(point.x - this.shrinePos.x, point.z - this.shrinePos.z);
    if (dAltar < 1.1 * S && this.runes.every((r) => r.lit) && !this._altarAwake) {
      this._altarAwake = true;
      cb.onAltar();
    }

    // Chispas de energía (más con ráfaga o Flow)
    let n = force > 0.72 ? 2 : 1;
    if (this.wind.gusting) n *= 2;
    if (cb.flow) n += 1;
    if (Math.random() < 0.9) cb.spawnSparks(point.clone().setY(point.y + 0.1), n);
  }

  celebrate() {
    this.beamOn = true;
    for (const m of this.mushrooms) m.cd = 0;
  }

  get altarAwake() { return !!this._altarAwake; }

  update(dt, t) {
    // ── viento ──
    const w = this.wind;
    if (!w.gusting) {
      w.next -= dt;
      if (w.next <= 0) { w.gusting = true; w.dur = 3.6; w.gustEvent = true; }
    } else {
      w.dur -= dt;
      if (w.dur <= 0) { w.gusting = false; w.next = rand(18, 34); }
    }
    const a = Math.atan2(w.dir.z, w.dir.x);
    if (w.gusting && w.dur > 3.2) {
      // recién iniciada: escoger dirección (guardada por main al leer gustEvent)
    }
    w.target = w.gusting ? Math.min(1, (3.6 - w.dur) * 1.2) * Math.min(1, w.dur * 1.4) : 0;
    w.level += (w.target - w.level) * Math.min(1, dt * 3);

    // ── árboles ──
    for (const tr of this.trees) {
      tr.grp.rotation.z = Math.sin(t * 1.1 + tr.phase) * (tr.amp + w.level * 0.07);
      tr.grp.rotation.x = Math.cos(t * 0.7 + tr.phase) * (tr.amp * 0.5 + w.level * 0.03);
    }

    // ── setas ──
    for (const m of this.mushrooms) {
      if (m.cd > 0) m.cd -= dt;
      m.capMat.emissiveIntensity = 0.55 + Math.sin(t * 2 + m.phase) * 0.25 + (m.cd > 5.4 ? 2.5 : 0);
    }

    // ── rocas y cristales ──
    for (const r of this.rocks) {
      if (r.shake > 0) {
        r.shake = Math.max(0, r.shake - dt * 2);
        r.rock.position.x = Math.sin(t * 42) * 0.03 * r.shake;
      } else r.rock.position.x = 0;
      if (r.revealed && !r.collected) {
        if (r.revealT < 1) r.revealT = Math.min(1, r.revealT + dt * 0.9);
        const e = 1 - Math.pow(1 - r.revealT, 3);
        r.crystal.scale.setScalar(0.001 + e);
        r.crystal.position.y = (0.72 + Math.sin(t * 1.6 + r.phase) * 0.05) * this.S * e + 0.03;
        r.crystal.rotation.y += dt * 1.2;
      }
    }

    // ── runas ──
    for (const rn of this.runes) {
      if (rn.lit) rn.glyphMat.opacity = 0.85 + Math.sin(t * 3 + rn.phase) * 0.15;
    }

    // ── altar ──
    if (this._altarAwake) {
      this.orb.rotation.y += dt * 1.4;
      this.orb.position.y = this.shrinePos.y + (1.0 + Math.sin(t * 1.8) * 0.1) * this.S;
      this.orb.material.emissive.set(0x9fe8d0);
      this.orb.material.emissiveIntensity = 1.6 + Math.sin(t * 4) * 0.7;
      this.beam.material.opacity = this.beamOn ? 0.22 + Math.sin(t * 2.2) * 0.08 : Math.max(0, this.beam.material.opacity - dt);
      this.beam.rotation.y += dt * 0.3;
    } else if (this.runes.every((r) => r.lit)) {
      this.orb.material.emissive.set(0xffd166);
      this.orb.material.emissiveIntensity = 1.2 + Math.sin(t * 6) * 0.6;
      this.orb.position.y = this.shrinePos.y + (0.95 + Math.sin(t * 3) * 0.06) * this.S;
    } else {
      this.orb.position.y = this.shrinePos.y + 0.95 * this.S;
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); }
    });
    this.root.parent && this.root.parent.remove(this.root);
  }
}
