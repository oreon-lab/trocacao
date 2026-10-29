import { T } from './config.js';
import { clamp } from './fighter.js';

// Ações configuráveis (tela Configurações > Controles). Cada uma tem 2 teclas: primária e secundária.
// Botões do mouse viram 'Mouse0' (esq), 'Mouse1' (meio), 'Mouse2' (dir), 'Mouse3'/'Mouse4' (laterais).
export const ACTIONS = [
  ['forward', 'Andar pra frente'], ['back', 'Andar pra trás'], ['left', 'Andar pra esquerda'], ['right', 'Andar pra direita'],
  ['jump', 'Pular'], ['dash', 'Dash'], ['crouch', 'Agachar / slide'],
  ['light', 'Soco rápido'], ['heavy', 'Soco pesado'], ['block', 'Defender / parry'], ['dodge', 'Esquivar'],
  ['q', 'Bola de energia'], ['r', 'Super soco'], ['lock', 'Travar a mira no oponente'], ['view', 'Trocar 1ª/3ª pessoa'], ['pause', 'Pausar'],
];
export const DEFAULT_BINDS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space', ''], dash: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC', 'ControlLeft'],
  light: ['Mouse0', ''], heavy: ['Mouse2', ''], block: ['KeyF', 'Mouse4'], dodge: ['KeyE', 'Mouse3'],
  q: ['KeyQ', ''], r: ['KeyR', ''], lock: ['Mouse1', 'KeyT'], view: ['KeyV', ''], pause: ['KeyP', ''],
};
const EDGE = new Set(['jump', 'dash', 'dodge', 'q', 'r', 'light', 'heavy']); // "apertou agora"
const MOVE = { forward: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0] };     // toque duplo = dash

const NAMES = {
  Space: 'Espaço', ShiftLeft: 'Shift', ShiftRight: 'Shift Dir.', ControlLeft: 'Ctrl', ControlRight: 'Ctrl Dir.',
  AltLeft: 'Alt', AltRight: 'Alt Gr', Tab: 'Tab', CapsLock: 'Caps', Enter: 'Enter', Backquote: "'",
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Mouse0: 'Mouse Esq.', Mouse1: 'Mouse Meio', Mouse2: 'Mouse Dir.', Mouse3: 'Mouse Lateral 1', Mouse4: 'Mouse Lateral 2',
};
export function keyName(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

// Teclado + mouse -> input abstrato do Fighter, seguindo as teclas configuradas.
export class PlayerInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.binds = structuredClone(DEFAULT_BINDS);
    this.down = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.sens = 1;
    this.invertY = false;
    this.doubleTap = true;
    this.dx = 0; // delta do mouse no frame (balanço dos braços)
    this.dy = 0;
    this.p = { dashX: 0, dashZ: 0 };
    this.lastTap = { a: '', t: 0 };
    this.onToggleView = null;
    this.onLock = null;

    const press = (code, e) => {
      if (!this.locked) return;
      const acts = this.actionsOf(code);
      if (acts.length) e.preventDefault(); // só segura as teclas que o jogo usa
      if (e.repeat) return;
      this.down.add(code);
      for (const a of acts) {
        if (EDGE.has(a)) this.p[a] = true;
        if (a === 'view') this.onToggleView?.();
        if (a === 'lock') this.onLock?.();
        if (a === 'pause') document.exitPointerLock();
        if (MOVE[a] && this.doubleTap) {
          const now = performance.now();
          if (this.lastTap.a === a && now - this.lastTap.t < T.doubleTap * 1000) {
            Object.assign(this.p, { dash: true, dashX: MOVE[a][0], dashZ: MOVE[a][1] });
            this.lastTap.t = 0;
          } else this.lastTap = { a, t: now };
        }
      }
    };
    addEventListener('keydown', e => {
      if (e.code === 'Escape' && this.locked) return document.exitPointerLock();
      press(e.code, e);
    });
    addEventListener('keyup', e => this.down.delete(e.code));
    addEventListener('mousedown', e => press('Mouse' + e.button, e));
    addEventListener('mouseup', e => { this.down.delete('Mouse' + e.button); if (this.locked) e.preventDefault(); });
    addEventListener('blur', () => this.down.clear());
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (!this.locked) return;
      const k = 0.0022 * this.sens;
      this.yaw -= e.movementX * k;
      this.pitch = clamp(this.pitch - e.movementY * k * (this.invertY ? -1 : 1), -1.45, 1.45);
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
  }

  get locked() { return document.pointerLockElement === this.canvas; }
  actionsOf(code) { return ACTIONS.map(([a]) => a).filter(a => this.binds[a]?.includes(code)); }
  held(a) { return this.binds[a]?.some(c => c && this.down.has(c)); }

  fill(I, active) {
    I.yaw = this.yaw;
    I.pitch = this.pitch;
    const p = this.p;
    if (!active) {
      I.mx = I.mz = 0;
      I.crouch = I.block = I.jumpHeld = false;
    } else {
      I.mx = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
      I.mz = (this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0);
      I.jumpHeld = this.held('jump');
      I.crouch = this.held('crouch');
      I.block = this.held('block');
      for (const a of EDGE) if (p[a] && a !== 'dash') I[a] = true;
      if (p.dash) { I.dash = true; I.dashX = p.dashX; I.dashZ = p.dashZ; }
    }
    for (const a of EDGE) p[a] = false;
    p.dashX = p.dashZ = 0;
  }
}
