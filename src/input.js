import { T } from './config.js';
import { clamp } from './fighter.js';

const TAP = { KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0] };
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyC', 'KeyF', 'KeyE', 'KeyV', 'Tab']);

// Teclado + mouse -> input abstrato do Fighter.
export class PlayerInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.sens = 1;
    this.doubleTap = true;
    this.dx = 0; // delta do mouse no frame (balanço dos punhos)
    this.dy = 0;
    this.p = { jump: false, dash: false, dashX: 0, dashZ: 0, light: false, heavy: false };
    this.lastTap = { code: '', t: 0 };
    this.onToggleView = null;

    addEventListener('keydown', e => {
      if (!this.locked) return;
      if (GAME_KEYS.has(e.code) || e.ctrlKey) e.preventDefault();
      if (e.code === 'Escape' || e.code === 'KeyP') return document.exitPointerLock();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.p.jump = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.p.dash = true;
      if (e.code === 'KeyV') this.onToggleView?.();
      const tap = TAP[e.code];
      if (tap && this.doubleTap) {
        const now = performance.now();
        if (this.lastTap.code === e.code && now - this.lastTap.t < T.doubleTap * 1000) {
          Object.assign(this.p, { dash: true, dashX: tap[0], dashZ: tap[1] });
          this.lastTap.t = 0;
        } else this.lastTap = { code: e.code, t: now };
      }
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousedown', e => {
      if (!this.locked) return;
      if (e.button === 0) this.p.light = true;
      if (e.button === 2) this.p.heavy = true;
    });
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (!this.locked) return;
      const k = 0.0022 * this.sens;
      this.yaw -= e.movementX * k;
      this.pitch = clamp(this.pitch - e.movementY * k, -1.45, 1.45);
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
  }

  get locked() { return document.pointerLockElement === this.canvas; }

  fill(I, active) {
    I.yaw = this.yaw;
    I.pitch = this.pitch;
    const k = this.keys, p = this.p;
    if (!active) {
      I.mx = I.mz = 0;
      I.crouch = I.block = I.jumpHeld = false;
    } else {
      I.mx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
      I.mz = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
      I.jumpHeld = k.has('Space');
      I.crouch = k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC');
      I.block = k.has('KeyF') || k.has('KeyE');
      if (p.jump) I.jump = true;
      if (p.light) I.light = true;
      if (p.heavy) I.heavy = true;
      if (p.dash) { I.dash = true; I.dashX = p.dashX; I.dashZ = p.dashZ; }
    }
    p.jump = p.dash = p.light = p.heavy = false;
    p.dashX = p.dashZ = 0;
  }
}
