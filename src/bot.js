import { T, ATTACKS } from './config.js';
import { clamp, damp } from './fighter.js';

// turn = velocidade de giro (rad/s): dá pra "sair da mira" do bot com dash
// tell = quanto tempo o bot "arma" o golpe antes de soltar (aviso no HUD)
const LEVELS = {
  easy: { turn: 4, react: 0.25, delay: [0.25, 0.45], aggro: 0.55, block: 0.5, dodge: 0.3, lunge: 0.2, tell: 0.4 },
  normal: { turn: 7, react: 0.5, delay: [0.15, 0.3], aggro: 0.85, block: 0.55, dodge: 0.4, lunge: 0.35, tell: 0.28 },
  hard: { turn: 12, react: 0.85, delay: [0.08, 0.2], aggro: 1.15, block: 0.55, dodge: 0.45, lunge: 0.5, tell: 0.18 },
};
const rand = (a, b) => a + Math.random() * (b - a);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// O bot usa exatamente o mesmo input que o jogador — sem trapaça de física.
export class Bot {
  constructor() {
    this.setLevel('normal');
    this.reset(Math.PI);
  }

  setLevel(l) { this.L = LEVELS[l] || LEVELS.normal; }

  reset(yaw) {
    Object.assign(this, { yaw, pitch: 0, mode: 'approach', modeT: 0.4, dir: 1, step: 0, atkCd: 0.5, blockT: 0, crouchT: 0, jumpT: 0, reactT: -1, reaction: null, seen: null, seenAny: null, seenSlide: false, tell: null });
  }

  update(dt, me, foe, I, active) {
    const L = this.L;
    I.mx = I.mz = 0;
    I.block = I.crouch = I.jumpHeld = false;

    const dx = foe.pos.x - me.pos.x, dz = foe.pos.z - me.pos.z, dist = Math.hypot(dx, dz);
    const want = Math.atan2(-dx, -dz);
    const turn = L.turn * (me.stunT > 0 ? 0.3 : 1);
    this.yaw += clamp(wrap(want - this.yaw), -turn * dt, turn * dt);
    this.pitch = damp(this.pitch, Math.atan2(foe.pos.y + foe.height * 0.62 - me.eyeY, Math.max(dist, 0.5)), 10, dt);
    I.yaw = this.yaw;
    I.pitch = this.pitch;
    if (!active || me.ko || foe.ko) return;
    const facing = Math.abs(wrap(want - this.yaw)) < 0.45;

    // reage só ao soco pesado (soco rápido não dá pra reagir: o bot tem que prever, igual gente)
    const fa = foe.atk;
    if (fa && fa.kind === 'heavy' && fa.phase === 'windup' && this.seen !== fa && dist < 4) {
      this.seen = fa;
      if (Math.random() < L.react) {
        this.reactT = rand(...L.delay);
        this.reaction = Math.random() < L.block / (L.block + L.dodge) ? 'block' : 'dodge';
        if (fa.def.guardBreak && Math.random() < 0.6) this.reaction = 'dodge';
      }
    }
    if (foe.sliding && !this.seenSlide && dist < 6) {
      this.seenSlide = true;
      if (Math.random() < L.react) { this.reactT = rand(...L.delay); this.reaction = Math.random() < 0.5 ? 'jump' : 'lowblock'; }
    }
    if (!foe.sliding) this.seenSlide = false;
    // jogador emendando socos: o bot prevê e levanta a guarda pros próximos
    if (fa && this.seenAny !== fa && dist < 3) {
      this.seenAny = fa;
      if (fa.kind === 'light' && Math.random() < L.react * 0.7) this.blockT = Math.max(this.blockT, me.stunT + rand(0.25, 0.45));
    }
    // defendeu e o jogador ficou exposto (recuperando)? contra-ataca
    if (me.blocking && fa?.phase === 'recovery' && dist < 2.6 && !this.tell && Math.random() < L.react) {
      this.blockT = 0;
      this.tell = { kind: 'light', el: 0, dur: 0.08, total: 0.08 + ATTACKS.light.windup, pressed: false };
    }
    if (this.reactT >= 0 && (this.reactT -= dt) < 0) {
      const r = this.reaction;
      if (r === 'block') this.blockT = rand(0.3, 0.6);
      if (r === 'lowblock') { this.blockT = this.crouchT = 0.5; }
      if (r === 'jump') { I.jump = true; this.jumpT = 0.3; }
      if (r === 'dodge') { I.dash = true; I.dashX = Math.random() < 0.5 ? -1 : 1; I.dashZ = Math.random() < 0.4 ? -1 : 0; }
    }
    if (this.blockT > 0) { this.blockT -= dt; I.block = true; }
    if (this.crouchT > 0) { this.crouchT -= dt; I.crouch = true; }
    if (this.jumpT > 0) { this.jumpT -= dt; I.jumpHeld = true; }

    // escolhe um "plano" a cada ~0.4-0.9s
    if ((this.modeT -= dt) <= 0) {
      const r = Math.random();
      if (dist > 7) this.mode = r < L.lunge ? 'dashin' : r < L.lunge * 1.4 ? 'slidein' : 'approach';
      else if (dist > 3) this.mode = r < 0.4 ? 'strafe' : r < 0.75 ? 'approach' : r < 0.88 ? 'dashin' : 'slidein';
      else this.mode = r < 0.45 * L.aggro ? 'pressure' : r < 0.62 ? 'guard' : r < 0.85 ? 'strafe' : 'retreat';
      if (this.mode === 'retreat' && Math.hypot(me.pos.x, me.pos.z) > T.arenaRadius - 3) this.mode = 'strafe';
      this.modeT = rand(0.4, 0.9);
      if (Math.random() < 0.4) this.dir *= -1;
      this.step = 0;
    }

    switch (this.mode) {
      case 'approach': I.mz = 1; I.mx = this.dir * 0.35; break;
      case 'strafe': I.mx = this.dir; I.mz = dist > 3.2 ? 0.5 : dist < 2.2 ? -0.5 : 0; if (Math.random() < dt * 0.15) I.jump = true; break;
      case 'retreat': I.mz = -1; I.mx = this.dir * 0.6; break;
      case 'pressure': I.mz = dist > 1.5 ? 1 : 0; I.mx = this.dir * 0.5; break;
      case 'guard': I.block = true; I.mx = this.dir * 0.7; I.mz = dist > 2.5 ? 0.5 : 0; break;
      case 'dashin':
        I.mz = 1;
        if (this.step === 0 && facing && me.charges > 0) { I.dash = true; I.dashZ = 1; this.step = 1; this.modeT = 0.6; }
        else if (this.step === 1 && me.sinceDash < 0.2 && dist < 3.4) { I.light = true; this.step = 2; }
        break;
      case 'slidein':
        I.mz = 1;
        if (this.step === 0 && facing && me.charges > 0) { I.dash = true; I.dashZ = 1; this.step = 1; this.modeT = 1; }
        if (this.step >= 1) I.crouch = true;
        if (this.step === 1 && me.sliding && dist < 2.6) { I.light = true; this.step = 2; }
        break;
    }

    // ataque: antes de bater o bot "arma" o golpe por um instante (me.tell) — é isso que o HUD avisa
    const tl = this.tell;
    if (tl) {
      tl.el += dt;
      if (me.stunT > 0) this.tell = null;
      else if (!tl.pressed && tl.el >= tl.dur) { I[tl.kind] = true; tl.pressed = true; }
      else if (tl.pressed && me.atk?.phase !== 'windup') this.tell = null;
    }
    this.atkCd -= dt;
    if (!this.tell && this.atkCd <= 0 && dist < 2.6 && facing && !me.atk && me.stunT <= 0 && this.blockT <= 0 && this.mode !== 'guard') {
      const kind = foe.blocking && Math.random() < 0.7 ? 'heavy' : Math.random() < 0.75 ? 'light' : 'heavy';
      const dur = L.tell * (kind === 'heavy' ? 0.6 : 1);
      this.tell = { kind, el: 0, dur, total: dur + ATTACKS[kind].windup, pressed: false };
      this.atkCd = rand(0.15, 0.55) / L.aggro;
    }
    me.tell = this.tell;
  }
}
