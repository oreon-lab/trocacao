import { T, ATTACKS, SPECIALS } from './config.js';
import { clamp, damp } from './fighter.js';

// turn = velocidade de giro (rad/s): dá pra "sair da mira" do bot com dash
// tell = quanto tempo o bot "arma" o golpe antes de soltar (aviso no HUD)
const LEVELS = {
  easy: { grab: 0, turn: 4, react: 0.25, delay: [0.25, 0.45], aggro: 0.55, block: 0.5, dodge: 0.3, lunge: 0.2, tell: 0.4 },
  normal: { grab: 0.08, turn: 7, react: 0.5, delay: [0.15, 0.3], aggro: 0.85, block: 0.55, dodge: 0.4, lunge: 0.35, tell: 0.28 },
  // difícil = tryhard: esquiva perfeita, persegue arremessos, dash pros lados, pulo duplo, soco voador (crítico)
  hard: { turn: 16, react: 0.95, delay: [0.05, 0.14], aggro: 1.6, block: 0.5, dodge: 0.5, lunge: 0.8, tell: 0.12, perfect: 0.45, chase: 0.85, grab: 0.28, mobility: 2.2, air: 1.5 },
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

    // giro do furacão: girando, mira na borda mais perto (taca na parede); sendo girado, não faz nada
    if (me.grab) { if (Math.hypot(me.pos.x, me.pos.z) > 0.5) I.yaw = Math.atan2(-me.pos.x, -me.pos.z); this.yaw = I.yaw; return; }
    if (me.heldBy) return;
    const dx = foe.pos.x - me.pos.x, dz = foe.pos.z - me.pos.z, dist = Math.hypot(dx, dz);
    const want = Math.atan2(-dx, -dz);
    if (me.atk?.kind === 'blink') this.yaw = I.yaw; // Passo Sombrio já deixa virado pro alvo
    const turn = L.turn * (me.stunT > 0 ? 0.3 : 1);
    this.yaw += clamp(wrap(want - this.yaw), -turn * dt, turn * dt);
    this.pitch = damp(this.pitch, Math.atan2(foe.pos.y + foe.height * 0.62 - me.eyeY, Math.max(dist, 0.5)), 10, dt);
    I.yaw = this.yaw;
    I.pitch = this.pitch;
    if (!active || me.ko || foe.ko) return;
    const facing = Math.abs(wrap(want - this.yaw)) < 0.45;

    // tryhard: esquiva perfeita no último instante (vale pra qualquer golpe, até soco rápido)
    const pw = foe.atk || foe.incoming > 0;
    if (L.perfect && pw && this.pwSeen !== foe.atk && me.dashCd <= 0 && me.stunT <= 0 && me.perfectWindow(foe)) {
      this.pwSeen = foe.atk;
      if (Math.random() < L.perfect) { I.dodge = true; I.mx = Math.random() < 0.5 ? -1 : 1; }
    }
    // tryhard: oponente arremessado = dash atrás dele (cancela o fim do golpe que acertou) e soco voador
    const flying = foe.stunT > 0 && (foe.pos.y > 0.3 || Math.hypot(foe.vel.x, foe.vel.z) > 6);
    if (L.chase && flying && this.mode !== 'chase' && this.chased !== foe.comboN + ':' + foe.hp && dist > 2 && dist < 12 && me.charges > 0 && (!me.atk || me.atk.hit)) {
      this.chased = foe.comboN + ':' + foe.hp;
      if (Math.random() < L.chase) { this.mode = 'chase'; this.modeT = 0.8; this.step = 0; }
    }

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
    // habilidades do jogador: pula o Terremoto, esquiva da investida e do Passo Sombrio
    if (fa?.def.special && fa.phase === 'windup' && this.seen !== fa) {
      this.seen = fa;
      const r = fa.kind === 'slam' ? (dist < 5.5 ? 'jump' : null) : fa.kind === 'charge' || fa.kind === 'blink' ? 'dodge' : null;
      if (r && Math.random() < L.react) { this.reactT = rand(...L.delay) * 0.6; this.reaction = r; }
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
      if (r === 'dodge') { I.dodge = true; I.mx = Math.random() < 0.5 ? -1 : 1; } // esquiva no Q (perfeita se acertar o tempo)
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
        else if (this.step === 1 && (me.sinceDash < 0.2 || me.sprinting) && dist < 3.4) { I.light = true; this.step = 2; }
        break;
      case 'chase':
        I.mz = 1;
        if (this.step === 0 && facing) { I.dash = true; I.dashZ = 1; this.step = 1; }
        else if (this.step === 1 && dist < 3) { I.light = true; this.step = 2; }
        break;
      case 'slidein':
        I.mz = 1;
        if (this.step === 0 && facing && me.charges > 0) { I.dash = true; I.dashZ = 1; this.step = 1; this.modeT = 1; }
        if (this.step >= 1) I.crouch = true;
        if (this.step === 1 && me.sliding && dist < 2.6) { I.light = true; this.step = 2; }
        break;
    }

    // tryhard: nunca fica parado — dash pros lados no meio da distância, pulo duplo e dash no ar
    if (L.mobility && me.stunT <= 0 && !me.atk) {
      if (dist > 3 && dist < 9 && me.charges > 1 && this.mode !== 'chase' && Math.random() < dt * L.mobility) {
        I.dash = true; I.dashX = this.dir; I.dashZ = dist > 5 ? 0.6 : 0; this.dir *= -1;
      }
      // de perto: dash pro lado ou atravessa pra trás do oponente (cross-up) e já soca
      if (dist <= 3 && me.charges > 1 && foe.stunT <= 0 && !this.tell && Math.random() < dt * L.mobility * 0.8) {
        const cross = Math.random() < 0.35;
        I.dash = true; I.dashX = cross ? 0 : this.dir; I.dashZ = cross ? 1 : 0.2; this.dir *= -1;
        this.atkCd = Math.min(this.atkCd, 0.12);
      }
      if (me.grounded && dist > 3 && Math.random() < dt * L.air) { I.jump = true; this.jumpT = 0.25; }
      if (!me.grounded && me.airJumps < 1 && me.vel.y < 1 && me.pos.y > 0.6 && Math.random() < L.air * 0.2) {
        I.jump = true; this.jumpT = 0.2;
      }
      // depois do pulo duplo: dash no ar pra cima do oponente
      if (me.airJumps === 1 && me.airDashes === 0 && me.charges > 0 && dist > 4 && Math.random() < dt * 3) { I.dash = true; I.dashZ = 1; }
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

    // meteoro caindo em cima: sai do círculo (e dá dash se estiver bem no meio)
    if (me.danger !== this.dangerSeen) { this.dangerSeen = me.danger; this.flee = !!me.danger && Math.random() < L.react + 0.25; }
    if (me.danger && this.flee) {
      const ax = me.pos.x - me.danger.x, az = me.pos.z - me.danger.z, al = Math.hypot(ax, az);
      if (al < 0.05) { I.mx = this.dir; I.mz = 0; }
      else {
        const s = Math.sin(me.yaw), c = Math.cos(me.yaw);
        I.mz = (-ax * s - az * c) / al;
        I.mx = (ax * c - az * s) / al;
      }
      if (al < 1.2 && me.charges > 0 && Math.random() < dt * 4) { I.dash = true; I.dashX = I.mx; I.dashZ = I.mz; }
    }

    // poderes: super quando a barra enche e o jogador tá perto; habilidade na distância em que ela funciona
    if (!me.atk && facing && me.stunT <= 0) {
      const sp = SPECIALS[me.char]?.kind;
      const ok = sp === 'slam' ? dist < 4.2 && foe.grounded : sp === 'charge' ? dist > 2.5 && dist < 9 : sp === 'blink' ? dist > 3 && dist < 11 : dist > 4 && dist < 18;
      // giro do furacão: colado, com energia e sem recarga
      if (L.grab && me.meter >= T.costG && me.grabCd <= 0 && dist < 3 && !foe.ko && Math.random() < dt * 4 * L.grab) I.grab = true;
      else if (me.meter >= T.costR && dist < 5 && Math.random() < dt * 1.5 * L.aggro) I.r = true;
      else if (me.meter >= T.costQ && ok && Math.random() < dt * 0.6 * L.aggro) I.q = true;
    }
    // meteoro quase caindo: defende ou esquiva
    if (me.incoming > 0 && this.blockT <= 0 && Math.random() < L.react * dt * 8) {
      if (Math.random() < 0.5) this.blockT = 0.4; else I.dodge = true;
    }
  }
}
