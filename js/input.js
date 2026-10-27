// ═══ Entrada de usuario en modo 3D: puntero/táctil → objetivo del bastón ═══
export class Input3D {
  constructor(dom, handlers) {
    // handlers: { onQuickStrike(speedNorm), onChargeStart(), onChargeRelease() }
    this.ndc = { x: 0, y: -0.35 };
    this.speed = 0;          // velocidad del puntero normalizada 0..1
    this._last = null;
    this._down = false;
    this._downT = 0;
    this._moved = false;
    this._chargeTimer = null;
    this._charging = false;

    dom.addEventListener('pointermove', (e) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      const now = performance.now();
      if (this._last) {
        const dt = Math.max(8, now - this._last.t);
        const dx = e.clientX - this._last.x, dy = e.clientY - this._last.y;
        const pxSpeed = Math.hypot(dx, dy) / dt; // px/ms
        this.speed = Math.min(1, this.speed + (pxSpeed / 2.2 - this.speed) * 0.4);
      }
      this._last = { x: e.clientX, y: e.clientY, t: now };
      this.ndc.x = x; this.ndc.y = y;
      if (this._down && (Math.abs(dx ?? 0) > 6 || Math.abs(dy ?? 0) > 6)) this._moved = true;
    });

    dom.addEventListener('pointerdown', (e) => {
      this._down = true; this._moved = false; this._downT = performance.now();
      this.ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
      dom.setPointerCapture && dom.setPointerCapture(e.pointerId);
      clearTimeout(this._chargeTimer);
      this._chargeTimer = setTimeout(() => {
        if (this._down && !this._moved) {
          this._charging = true;
          handlers.onChargeStart();
        }
      }, 260);
    });

    dom.addEventListener('pointerup', () => {
      const quick = performance.now() - this._downT < 300 && !this._moved;
      clearTimeout(this._chargeTimer);
      if (this._charging) {
        this._charging = false;
        handlers.onChargeRelease();
      } else if (quick) {
        handlers.onQuickStrike(this.speed);
      }
      this._down = false;
    });

    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat) handlers.onQuickStrike(0.55);
    });
  }

  // Decae cada frame para que el bio-sensor lea la agitación
  update(dt) { this.speed = Math.max(0, this.speed - dt * 1.6); }
}
