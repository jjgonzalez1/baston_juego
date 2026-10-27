// ═══ Realidad Mixta (WebXR immersive-ar): anclaje por hit-test y retículo ═══
import * as THREE from 'three';

export class XRManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.session = null;
    this.hitSource = null;
    this.reticlePos = new THREE.Vector3();
    this.reticleVisible = false;
    this.viewerPos = new THREE.Vector3();
    this.viewerQuat = new THREE.Quaternion();
    this.hasViewer = false;
    this._selectStart = 0;
    this.reticle = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.09, 0.115, 32),
      new THREE.MeshBasicMaterial({ color: 0x7fe8d0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.016, 16),
      new THREE.MeshBasicMaterial({ color: 0x7fe8d0, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    dot.rotation.x = -Math.PI / 2;
    this.reticle.add(ring, dot);
    this.reticle.visible = false;
    this.reticle.matrixAutoUpdate = false;
  }

  async isSupported() {
    if (!('xr' in navigator) || !navigator.xr.isSessionSupported) return false;
    try { return await navigator.xr.isSessionSupported('immersive-ar'); }
    catch (e) { return false; }
  }

  async enter(scene, handlers) {
    // handlers: { onSelect(point|null, force 0..1), onEnd() }
    this.session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'local-floor', 'anchors'],
      domOverlay: { root: document.getElementById('hud') },
    });
    this.renderer.xr.setReferenceSpaceType('local');
    await this.renderer.xr.setSession(this.session);
    scene.add(this.reticle);

    const viewerSpace = await this.session.requestReferenceSpace('viewer');
    this.hitSource = await this.session.requestHitTestSource({ space: viewerSpace });

    // Duración de la pulsación → fuerza del golpe (mantener = cargar)
    this.session.addEventListener('selectstart', () => { this._selectStart = performance.now(); });
    this.session.addEventListener('select', () => {
      const dur = performance.now() - this._selectStart;
      const force = dur > 350 ? Math.min(1, 0.45 + dur / 1600) : 0.5;
      if (navigator.vibrate) { try { navigator.vibrate(28); } catch (e) { /* noop */ } }
      handlers.onSelect(this.reticleVisible ? this.reticlePos.clone() : null, force);
    });
    this.session.addEventListener('end', () => {
      this.hitSource = null;
      this.reticle.parent && this.reticle.parent.remove(this.reticle);
      handlers.onEnd();
    });
    return this.session;
  }

  // Llamar cada frame de XR con (frame, refSpace)
  updateFrame(frame, refSpace) {
    if (!frame || !this.hitSource) return;
    const viewerPose = frame.getViewerPose(refSpace);
    if (viewerPose) {
      const p = viewerPose.views[0].transform.position;
      const o = viewerPose.views[0].transform.orientation;
      this.viewerPos.set(p.x, p.y, p.z);
      this.viewerQuat.set(o.x, o.y, o.z, o.w);
      this.hasViewer = true;
    }
    const hits = frame.getHitTestResults(this.hitSource);
    if (hits.length > 0) {
      const pose = hits[0].getPose(refSpace);
      const t = pose.transform.position;
      const q = pose.transform.orientation;
      this.reticlePos.set(t.x, t.y, t.z);
      this.reticle.visible = true;
      this.reticleVisible = true;
      const rot = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
      this.reticle.matrix.copy(rot.setPosition(t.x, t.y + 0.01, t.z));
    } else {
      this.reticle.visible = false;
      this.reticleVisible = false;
    }
  }

  // Punto de pulso por defecto si no hay superficie detectada: frente al usuario
  fallbackPoint(out) {
    const fwd = out.set(0, 0, -1).applyQuaternion(this.viewerQuat);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); else fwd.normalize();
    out.copy(this.viewerPos).addScaledVector(fwd, 2.5);
    out.y = this.viewerPos.y - 1.3;
    return out;
  }

  exit() { if (this.session) this.session.end().catch(() => { }); }
}
