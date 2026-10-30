import * as THREE from 'three';
import { T, ATTACKS, SPECIALS } from './config.js';

// Eventos de gameplay (hit, dash, pulo...) que o main transforma em som/partícula/shake.
export const events = [];

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

const _o = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _hit = new THREE.Vector3();

// Input abstrato: o jogador (teclado/mouse) e o bot preenchem a mesma coisa.
// mx = direita, mz = frente. jump/dash/light/heavy são "apertou neste frame" e são consumidos.
export function emptyInput() {
  return { mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, jumpHeld: false, dash: false, dashX: 0, dashZ: 0, crouch: false, light: false, heavy: false, block: false, dodge: false, grab: false, q: false, r: false };
}

// Distância mínima entre os segmentos p1q1 e p2q2; escreve em `out` o ponto mais próximo do primeiro.
export function segSeg(p1, q1, p2, q2, out) {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz, c = d1x * rx + d1y * ry + d1z * rz, b = d1x * d2x + d1y * d2y + d1z * d2z;
  const den = a * e - b * b;
  let s = den > 1e-8 ? clamp((b * f - c * e) / den, 0, 1) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  out.set(p1.x + d1x * s, p1.y + d1y * s, p1.z + d1z * s);
  const qx = p2.x + d2x * t - out.x, qy = p2.y + d2y * t - out.y, qz = p2.z + d2z * t - out.z;
  return Math.sqrt(qx * qx + qy * qy + qz * qz);
}

// golpe crítico: muito mais dano e arremessa lá pra trás
export const critDef = def => ({ ...def, dmg: def.dmg * T.critMul, knock: def.knock * T.critKnock, up: Math.max(def.up, 5), stun: def.stun * 1.4 });

export class Fighter {
  constructor(name, color) {
    this.name = name;
    this.color = color;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.dashDir = new THREE.Vector3();
    this.dashLocal = { x: 0, z: 1 };
    this.input = emptyInput();
    this.char = 'Barbarian'; // define a habilidade do Q
    this.reset(new THREE.Vector3(), 0);
  }

  reset(p, yaw) {
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.yaw = this.input.yaw = yaw;
    this.pitch = this.input.pitch = 0;
    Object.assign(this, {
      height: T.standHeight, grounded: true, coyoteT: 0, jumpBufT: 0, jumpCutDone: true,
      crouching: false, sliding: false, slideT: 0, slideLock: false,
      dashT: 0, dashCd: 0, charges: T.dashCharges, rechargeT: 0, airDashes: 0, airJumps: 0, sinceDash: 9, sprinting: false, bounced: false,
      hp: T.hp, stunT: 0, blocking: false, blockT: 0,
      atk: null, queued: null, queueT: 0, hand: 1, flashT: 0, ko: false, // hand 1 -> 1º soco rápido = jab (esquerda)
      walkPhase: 0, landImpact: 0, comboN: 0, comboT: 0, tell: null,
      invulnT: 0, counterT: 0, meter: 0, dodgeSide: 1, incoming: 0, grab: null, heldBy: null, thrown: null, grabCd: 0,
    });
  }

  get eyeY() { return this.pos.y + this.height * T.eyeRatio; }
  get invuln() { return this.invulnT > 0 || (this.dashT > 0 && T.dashTime - this.dashT < T.dashIFrames); }
  gain(n) { this.meter = clamp(this.meter + n, 0, T.meterMax); }

  // janela da esquiva perfeita: quanto falta (s) pro golpe/projétil chegar, se já dá pra apertar; -1 = ainda não
  perfectLeft(foe) {
    if (this.incoming > 0) return this.incoming; // projétil quase batendo (o main marca quanto falta)
    if (!foe || foe.ko) return -1;
    const a = foe.atk;
    if (a && !a.hit && !a.done && !a.def.ranged) {
      const d = a.def, dist = Math.hypot(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z);
      const left = a.phase === 'windup' ? d.windup - a.t + (d.hitDelay || 0) : a.phase === 'active' ? Math.max(0, (d.hitDelay || 0) - a.t) : 9;
      const near = d.aoe ? dist < d.radius + 0.5
        : a.kind === 'blink' ? dist < 13
        : a.kind === 'charge' ? (a.phase === 'active' ? foe.inCone(this, d.range + d.speed * T.perfectWindow + 0.6, 0.5) > 0 : dist < 4)
        : foe.reach(this, d) < 0.9;
      if (left <= T.perfectWindow && near) return Math.max(0, left);
    }
    const tl = foe.tell; // bot armando o golpe (ainda vai apertar e depois tem o windup)
    if (tl && !tl.pressed && tl.dur - tl.el < 0.08 && Math.hypot(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z) < 3)
      return Math.min(T.perfectWindow, tl.dur - tl.el + (ATTACKS[tl.kind]?.windup || 0.1));
    return -1;
  }
  perfectWindow(foe) { return this.perfectLeft(foe) >= 0; }
  forward(out) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  lookDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  update(dt, foe, arena) {
    const I = this.input;
    const canAct = this.stunT <= 0 && !this.ko;
    if (!this.ko) { this.yaw = I.yaw; this.pitch = I.pitch; } // caído não gira

    // timers
    this.stunT = Math.max(0, this.stunT - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.counterT = Math.max(0, this.counterT - dt);
    this.incoming = Math.max(0, this.incoming - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.grabCd = Math.max(0, this.grabCd - dt);
    this.dashCd -= dt;
    this.sinceDash += dt;
    // defendendo recarrega mais devagar (quem ataca é recompensado)
    if (this.charges < T.dashCharges && (this.rechargeT += dt * (this.blocking ? T.dashBlockRecharge : 1)) >= T.dashRecharge) { this.charges++; this.rechargeT -= T.dashRecharge; }
    this.jumpBufT -= dt;
    if (I.jump) this.jumpBufT = T.jumpBuffer;
    this.coyoteT = this.grounded ? T.coyote : this.coyoteT - dt;
    if ((this.queueT -= dt) <= 0) this.queued = null;
    if ((this.comboT -= dt) <= 0) this.comboN = 0;

    // giro do furacão: quem gira controla tudo; quem é girado só é carregado
    if (this.heldBy || this.grab) {
      if (this.grab) this.updateGrab(dt, arena);
      I.jump = I.dash = I.light = I.heavy = I.dodge = I.grab = I.q = I.r = false;
      I.dashX = I.dashZ = 0;
      return;
    }

    // direção desejada no mundo
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let wx = 0, wz = 0;
    if (canAct) {
      wx = fx * I.mz + rx * I.mx;
      wz = fz * I.mz + rz * I.mx;
      const wl = Math.hypot(wx, wz);
      if (wl > 1) { wx /= wl; wz /= wl; }
    }
    let hs = Math.hypot(this.vel.x, this.vel.z);

    // defesa
    const wantBlock = canAct && I.block && !this.atk && !this.sliding && this.dashT <= 0;
    if (wantBlock && !this.blocking) this.blockT = 0;
    this.blocking = wantBlock;
    if (this.blocking) this.blockT += dt;

    // agachar / slide (segurar agachar durante o dash = slide quando o dash acaba)
    if (!I.crouch) this.slideLock = false;
    if (canAct && I.crouch && this.grounded && !this.sliding && !this.slideLock && this.dashT <= 0 && hs > T.slideMinSpeed) {
      this.sliding = true;
      this.slideT = 0;
      const k = (hs + T.slideBoost) / hs;
      this.vel.x *= k; this.vel.z *= k;
      hs *= k;
      events.push({ type: 'slide', f: this });
    }
    if (this.sliding) {
      this.slideT += dt;
      if (!I.crouch || this.slideT > T.slideMaxTime || hs < T.crouchSpeed || !this.grounded || !canAct) {
        this.sliding = false;
        this.slideLock = I.crouch;
      }
    }
    this.crouching = I.crouch && !this.sliding;
    const hTarget = this.sliding ? T.slideHeight : this.crouching ? T.crouchHeight : T.standHeight;
    this.height = damp(this.height, hTarget, 18, dt);

    // esquiva (Q): desvio rápido pro lado (ou pra onde o WASD aponta). Na hora certa = ESQUIVA PERFEITA:
    // não gasta carga, fica invencível mais tempo, dá contra-ataque e energia.
    if (I.dodge && canAct && this.dashCd <= 0) {
      const perfect = this.perfectWindow(foe);
      if (perfect || this.charges > 0) {
        I.dash = true;
        I.dashX = I.mx || (this.dodgeSide = -this.dodgeSide);
        I.dashZ = I.mz ? I.mz * 0.5 : -0.35;
        if (perfect) {
          this.charges++;
          this.invulnT = T.perfectIFrames;
          this.counterT = T.counterTime;
          this.gain(25);
          events.push({ type: 'perfect', f: this });
        }
      }
    }

    // dash: direção do WASD (ou do toque duplo); sem direção = pra frente
    if (I.dash && canAct && this.charges > 0 && this.dashCd <= 0 && (this.grounded || this.airDashes < 1)) {
      let dx = I.dashX, dz = I.dashZ;
      if (!dx && !dz) { dx = I.mx; dz = I.mz; }
      if (!dx && !dz) dz = 1;
      const l = Math.hypot(dx, dz);
      dx /= l; dz /= l;
      this.dashLocal = { x: dx, z: dz };
      this.dashDir.set(fx * dz + rx * dx, 0, fz * dz + rz * dx);
      // perseguição: dash pra frente com o oponente arremessado na frente = vai direto nele
      if (dz > 0 && foe && foe.stunT > 0 && (foe.pos.y > 0.3 || Math.hypot(foe.vel.x, foe.vel.z) > 6) && this.inCone(foe, 12, T.dashChaseCone)) {
        this.dashDir.set(foe.pos.x - this.pos.x, 0, foe.pos.z - this.pos.z).normalize();
        events.push({ type: 'chase', f: this });
      }
      this.dashT = T.dashTime;
      this.dashCd = T.dashTime + T.dashCooldown;
      this.charges--;
      if (!this.grounded) this.airDashes++;
      this.sliding = false;
      this.sinceDash = 0;
      this.blocking = false;
      this.bounced = false;
      if (this.grounded && dz > 0.3) this.sprinting = true; // dash pra frente no chão emenda em corrida
      // dash cancela golpe: finta no windup, e depois que acertou dá pra cancelar a qualquer hora e emendar
      if (this.atk && (this.atk.phase !== 'active' || this.atk.hit)) this.atk = null;
      events.push({ type: 'dash', f: this });
    }

    // corrida: continua enquanto segura frente; defender, agachar, golpear ou apanhar para
    if (!canAct || I.mz <= 0 || this.blocking || this.crouching || (this.atk && this.dashT <= 0)) this.sprinting = false;

    // velocidade
    if (this.dashT > 0) {
      this.dashT -= dt;
      const s = this.dashT > 0 ? T.dashSpeed : T.dashExitSpeed;
      this.vel.set(this.dashDir.x * s, 0, this.dashDir.z * s);
    } else if (this.sliding) {
      const k = Math.max(0, hs - T.slideDecel * dt) / hs;
      this.vel.x *= k; this.vel.z *= k;
    } else {
      let max = this.crouching ? T.crouchSpeed : this.sprinting ? T.sprintSpeed : T.walkSpeed;
      if (this.blocking) max *= T.blockSpeedMul;
      if (this.atk?.def.moveMul) max *= this.atk.def.moveMul;
      let tx = wx * max, tz = wz * max, rate;
      if (this.grounded) {
        const aligned = this.vel.x * tx + this.vel.z * tz >= 0;
        rate = !canAct ? 18 : hs > max + 0.01 && aligned ? T.overspeedDecel : (wx || wz) ? T.groundAccel : T.groundDecel;
      } else if (wx || wz) {
        // no ar: controla a direção sem matar o momentum
        const cap = Math.max(max, hs);
        tx = wx * cap; tz = wz * cap;
        rate = T.airAccel;
      } else rate = 0;
      const ddx = tx - this.vel.x, ddz = tz - this.vel.z, dl = Math.hypot(ddx, ddz);
      if (dl > 1e-5) {
        const step = Math.min(dl, rate * dt) / dl;
        this.vel.x += ddx * step;
        this.vel.z += ddz * step;
      }
    }

    // pulo (coyote time + buffer + altura variável)
    if (this.jumpBufT > 0 && this.coyoteT > 0 && canAct && this.dashT <= 0) {
      this.vel.y = T.jumpVel;
      this.grounded = false;
      this.coyoteT = this.jumpBufT = 0;
      this.jumpCutDone = false;
      this.sliding = false;
      events.push({ type: 'jump', f: this });
    } else if (I.jump && !this.grounded && this.pos.y > 0.4 && this.airJumps < 1 && canAct && this.dashT <= 0 && !this.atk) {
      // pulo duplo: devolve o dash do ar (pula, dash, pula, dash)
      this.vel.y = T.doubleJumpVel;
      this.airJumps++;
      this.airDashes = 0;
      this.jumpCutDone = false;
      this.jumpBufT = 0;
      events.push({ type: 'jump', f: this, double: true });
    }
    if (!I.jumpHeld && !this.jumpCutDone && this.vel.y > 0) { this.vel.y *= T.jumpCut; this.jumpCutDone = true; }
    if (this.dashT <= 0 && !this.grounded) this.vel.y -= T.gravity * (this.vel.y < 0 ? T.fallMul : 1) * (this.thrown ? T.throwGravity : 1) * dt;

    // integra
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) {
      if (!this.grounded) {
        this.landImpact = Math.min(1, -this.vel.y / 18);
        this.airDashes = this.airJumps = 0;
        this.thrown = null; // arremessado caiu no chão sem bater na parede
        events.push({ type: 'land', f: this, v: -this.vel.y });
      }
      this.pos.y = 0;
      this.vel.y = 0;
      this.grounded = true;
    } else this.grounded = false;
    arena.collide(this);
    if (this.grounded) this.walkPhase += Math.hypot(this.vel.x, this.vel.z) * dt * 1.5;

    // golpes
    // clique durante o atordoamento fica guardado e sai assim que der (não some mais)
    if (!this.ko && (I.light || I.heavy)) { this.queued = I.heavy ? 'heavy' : 'light'; this.queueT = 0.25; }
    // poderes: R = super soco (barra cheia), E = habilidade do lutador, G = giro do furacão (energia + recarga)
    if (canAct && !this.atk && !this.blocking && (I.q || I.r || I.grab)) {
      if (I.r && this.meter >= T.costR) { this.meter -= T.costR; this.startAttack('super', foe); }
      else if (I.q && this.meter >= T.costQ) { this.meter -= T.costQ; this.startAttack(SPECIALS[this.char]?.kind || 'slam', foe); }
      else if (I.grab && this.meter >= T.costG && this.grabCd <= 0 && foe && !foe.remote) { this.grabCd = T.grabWhiffCd; this.startAttack('grab', foe); } // a energia só sai se pegar
      else events.push({ type: 'noMeter', f: this });
    }
    if (this.queued && !this.atk && canAct && !this.blocking) this.startAttack(this.queued, foe);
    if (this.atk) {
      const a = this.atk, d = a.def;
      a.t += dt;
      if (a.kind === 'slam' && a.phase === 'windup') {
        // pulinho roteirizado: sobe devagar, desce rápido e bate no chão bem no fim do windup
        const u = a.t / d.windup, H = 1.3, W = d.windup;
        this.vel.y = u < 0.7 ? (H * Math.PI / 2 / (0.7 * W)) * Math.cos((Math.PI / 2) * (u / 0.7)) : (-H * Math.PI / 2 / (0.3 * W)) * Math.sin((Math.PI / 2) * Math.min(1, (u - 0.7) / 0.3));
      }
      if (a.kind === 'charge' && a.phase === 'active' && !a.hit) { this.vel.x = a.dir.x * d.speed; this.vel.z = a.dir.z * d.speed; }
      if (a.phase === 'windup' && a.t >= d.windup) {
        a.phase = 'active';
        a.t -= d.windup;
        events.push({ type: 'swing', f: this, kind: a.kind });
        if (d.ranged) { a.hit = true; events.push({ type: 'fire', f: this }); } // solta a bola de energia
        if (a.kind === 'super') { // avança voando até o oponente
          const dd = foe ? this.inCone(foe, 7, 0.6) : 0, f = this.forward(_d);
          const v = dd ? Math.min(16, (dd - 1) * 7) : 10;
          if (dd) f.set(foe.pos.x - this.pos.x, 0, foe.pos.z - this.pos.z).normalize();
          this.vel.x = f.x * v;
          this.vel.z = f.z * v;
        }
        if (a.kind === 'charge') { // investida reta: pro oponente se ele tá na frente, senão pra frente
          const dd = foe ? this.inCone(foe, 12, 0.6) : 0;
          a.dir = dd ? new THREE.Vector3(foe.pos.x - this.pos.x, 0, foe.pos.z - this.pos.z).normalize() : this.forward(new THREE.Vector3());
        }
        if (a.kind === 'blink') this.blinkTo(foe, arena);
        if (d.aoe) { a.done = true; this.aoeHit(foe); }
      }
      if (a.phase === 'active') {
        if (!a.hit && !a.done && !(d.hitDelay && a.t < d.hitDelay)) this.tryHit(foe);
        if (a.kind === 'charge' && a.hit && a.t < d.active) { a.t = d.active; this.vel.x *= 0.2; this.vel.z *= 0.2; } // bateu: para
        if (this.atk && a.t >= d.active) { a.phase = 'recovery'; a.t -= d.active; }
      }
      // acertar encurta a recuperação = combos
      if (this.atk && a.phase === 'recovery' && a.t >= d.recovery * (a.hit ? 0.6 : 1)) this.atk = null;
    }

    I.jump = I.dash = I.light = I.heavy = I.dodge = I.grab = I.q = I.r = false;
    I.dashX = I.dashZ = 0;
  }

  // oponente está no cone da frente e perto? (base da mira assistida)
  inCone(foe, maxDist, cone = this.assistCone || T.assistCone) {
    const dx = foe.pos.x - this.pos.x, dz = foe.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    if (foe.ko || d < 1e-3 || d > maxDist) return 0;
    return (dx * -Math.sin(this.yaw) + dz * -Math.cos(this.yaw)) / d >= cone ? d : 0;
  }

  startAttack(kind, foe) {
    this.queued = null;
    let k = kind;
    if (this.sliding && (kind === 'light' || kind === 'heavy')) k = 'sweep';
    else if (kind === 'light' && (this.dashT > 0 || this.sinceDash < 0.18 || this.sprinting)) k = 'lunge'; // soco voador
    const def = ATTACKS[k];
    this.atk = { id: (this.atkN = (this.atkN || 0) + 1), kind: k, def, t: 0, phase: 'windup', hit: false, hand: k === 'light' ? (this.hand ^= 1) : 1 };
    // passo à frente: o soco "anda" até o oponente se ele tá quase no alcance
    if (k === 'blink') this.invulnT = Math.max(this.invulnT, def.windup + 0.04); // some na fumaça
    if (k === 'grab') { this.dashT = 0; this.vel.multiplyScalar(0.2); } // freia o dash (senão atravessa o oponente)
    const d = foe && k !== 'sweep' && !def.special && k !== 'super' ? this.inCone(foe, 4.5, 0.75) : 0;
    if (d > 1.1) {
      const v = Math.min(k === 'lunge' || k === 'grab' ? 9 : k === 'heavy' ? 5 : 3.5, (d - 1.0) * 6);
      this.vel.x += (foe.pos.x - this.pos.x) / d * v;
      this.vel.z += (foe.pos.z - this.pos.z) / d * v;
    } else if (k === 'lunge') {
      const f = this.forward(_d);
      this.vel.x += f.x * 6;
      this.vel.z += f.z * 6;
    }
  }

  // segmento do golpe: soco sai do olho na direção da mira; rasteira sai do pé na horizontal.
  // Mira assistida: se o oponente tá no cone, o golpe vira pra ele (o pitch só corrige um pouco,
  // então agachar ainda desvia de soco reto).
  attackSeg(def, foe) {
    if (def.low) {
      _o.set(this.pos.x, this.pos.y + 0.35, this.pos.z);
      this.forward(_d);
    } else {
      _o.set(this.pos.x, this.eyeY, this.pos.z);
      this.lookDir(_d);
    }
    const d = foe ? this.inCone(foe, def.range + T.assistRange) : 0;
    if (d) {
      const yaw = Math.atan2(-(foe.pos.x - this.pos.x), -(foe.pos.z - this.pos.z));
      const pitch = def.low ? 0 : clamp(Math.atan2(foe.pos.y + foe.height * 0.6 - _o.y, d), this.pitch - 0.15, this.pitch + 0.15);
      const cp = Math.cos(pitch);
      _d.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
    }
    _e.copy(_o).addScaledVector(_d, def.range);
  }

  // distância do golpe até a cápsula do oponente (<= 0 = acerta)
  reach(foe, def) {
    this.attackSeg(def, foe);
    _a.set(foe.pos.x, foe.pos.y + T.radius, foe.pos.z);
    _b.set(foe.pos.x, foe.pos.y + Math.max(foe.height - T.radius, T.radius + 0.05), foe.pos.z);
    return segSeg(_o, _e, _a, _b, _hit) - (T.radius + def.hitR);
  }

  // Passo Sombrio: aparece atrás do oponente (do lado contrário de onde ele olha), já virado pra ele
  blinkTo(foe, arena) {
    const from = this.pos.clone();
    const fd = foe && !foe.ko ? Math.hypot(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z) : 99;
    if (fd < 12) {
      foe.forward(_d);
      this.pos.set(foe.pos.x - _d.x * 1.5, foe.pos.y, foe.pos.z - _d.z * 1.5);
    } else this.pos.addScaledVector(this.forward(_d), 6);
    const r = Math.hypot(this.pos.x, this.pos.z), lim = arena.R - T.radius - 0.2;
    if (r > lim) { this.pos.x *= lim / r; this.pos.z *= lim / r; }
    arena.collide(this);
    this.vel.set(0, 0, 0);
    if (fd < 12) this.yaw = this.input.yaw = Math.atan2(-(foe.pos.x - this.pos.x), -(foe.pos.z - this.pos.z));
    events.push({ type: 'blink', f: this, from, to: this.pos.clone() });
  }

  // ---- GIRO DO FURACÃO ----
  startGrab(foe) {
    this.atk = null;
    this.meter -= T.costG; // pegou: agora sim gasta a energia e começa a recarga
    this.grabCd = T.grabCooldown;
    this.grab = { victim: foe, t: 0, ang: Math.atan2(-(foe.pos.x - this.pos.x), -(foe.pos.z - this.pos.z)), prevD: 0, turns: 0 };
    Object.assign(foe, { heldBy: this, thrown: null, atk: null, tell: null, blocking: false, sliding: false, dashT: 0, sprinting: false, queued: null });
    this.sprinting = false;
    events.push({ type: 'grab', f: this, victim: foe, point: foe.pos.clone().setY(1.1) });
  }
  updateGrab(dt, arena) {
    const g = this.grab, v = g.victim, R = T.spinRadius;
    g.t += dt;
    const w = T.spinW0 + (T.spinW1 - T.spinW0) * Math.min(1, g.t / T.spinTime); // acelera
    g.ang += w * dt;
    g.turns += (w * dt) / (Math.PI * 2);
    // longe da borda pra caber o giro (pilar fica de fora: o corpo passa por cima)
    this.vel.set(0, 0, 0);
    this.pos.y = 0;
    this.grounded = true;
    const r = Math.hypot(this.pos.x, this.pos.z), lim = arena.R - R - 0.5;
    if (r > lim) { const k = Math.max(lim / r, 1 - 6 * dt); this.pos.x *= k; this.pos.z *= k; }
    this.invulnT = Math.max(this.invulnT, 0.05);
    const fx = -Math.sin(g.ang), fz = -Math.cos(g.ang);
    v.pos.set(this.pos.x + fx * R, T.spinHeight + Math.sin(g.t * 17) * 0.06, this.pos.z + fz * R);
    v.vel.set(fz * w * R, 0, -fx * w * R); // velocidade tangente (rastro, efeitos)
    Object.assign(v, { grounded: false, stunT: Math.max(v.stunT, 0.4), invulnT: Math.max(v.invulnT, 0.05) });
    // solta quando a vítima passa pela direção da mira (depois do giro mínimo)
    const d = wrapA(g.ang - this.yaw);
    if ((g.t >= T.spinMin && g.prevD < 0 && d >= 0 && d < 1) || g.t >= T.spinTime + 0.45 || v.ko) this.throwFoe();
    else g.prevD = d;
  }
  throwFoe() {
    const v = this.grab.victim, aim = this.forward(_d), from = v.pos.clone();
    this.grab = null;
    v.heldBy = null;
    v.pos.set(this.pos.x + aim.x * T.spinRadius, T.spinHeight, this.pos.z + aim.z * T.spinRadius);
    v.vel.set(aim.x * T.throwSpeed, T.throwUp, aim.z * T.throwSpeed);
    Object.assign(v, { thrown: this, bounced: false, stunT: 1.1, flashT: 0.12, comboN: 0, comboT: 0, jumpCutDone: true, grounded: false });
    v.hp -= T.throwDmg;
    v.checkKO();
    this.gain(10);
    this.dashCd = 0.15;
    events.push({ type: 'throw', f: this, victim: v, point: v.pos.clone(), from, dmg: T.throwDmg });
  }

  // Terremoto: onda no chão em volta; quem está no ar (pulou) escapa
  aoeHit(foe) {
    const d = this.atk.def, dist = Math.hypot(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z);
    if (foe.ko || foe.invuln || dist > d.radius + T.radius || foe.pos.y > 0.5) return;
    _hit.set(foe.pos.x, foe.pos.y + foe.height * 0.4, foe.pos.z);
    this.land(foe, d);
  }

  tryHit(foe) {
    if (foe.ko || foe.invuln) return;
    if (this.reach(foe, this.atk.def) > 0) return;
    // slide passa por baixo de soco alto
    if (foe.sliding && !this.atk.def.low) {
      if (!this.atk.under) { this.atk.under = true; events.push({ type: 'under', f: foe, point: foe.pos.clone().setY(1) }); }
      return;
    }
    if (this.atk.kind === 'grab') { if (foe.pos.y < 1.2 && !foe.grab && !foe.heldBy) this.startGrab(foe); return; } // agarrão passa pela defesa
    this.land(foe, this.atk.def);
  }

  // acertou (_hit = ponto do impacto)
  land(foe, def) {
    this.atk.hit = true;
    const kind = this.atk.kind, point = _hit.clone();
    // contra-ataque depois de uma esquiva perfeita: golpe mais forte
    const mul = this.counterT > 0 ? T.counterMul : 1;
    if (mul > 1) { def = { ...def, dmg: def.dmg * mul, knock: def.knock * 1.3 }; this.counterT = 0; }
    const crit = kind === 'lunge' && Math.random() < T.critChance;
    if (crit) def = critDef(def);
    // online: quem apanha decide o resultado (defesa/parry/acerto) na máquina dele
    if (foe.remote) return foe.onRemoteHit(kind, point, mul, crit);
    const result = foe.receive(this, def);
    this.gain(result === 'hit' ? 7 : result === 'break' ? 6 : result === 'block' ? 2 : 0);
    if (result === 'hit' && this.charges < T.dashCharges) this.rechargeT += T.dashRecharge * T.dashHitRefund;
    events.push({ type: result, f: this, victim: foe, kind, point, dmg: Math.round(def.dmg), combo: foe.comboN, counter: mul > 1, crit });
  }

  receive(att, def) {
    let nx = this.pos.x - att.pos.x, nz = this.pos.z - att.pos.z;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl; nz /= nl;
    const facing = -(nx * -Math.sin(this.yaw) + nz * -Math.cos(this.yaw)) > 0.3;
    const knock = (m, up = 0) => {
      this.vel.x = nx * def.knock * m;
      this.vel.z = nz * def.knock * m;
      if (up > 0) { this.vel.y = Math.max(this.vel.y, up); this.grounded = false; this.jumpCutDone = true; }
    };

    // investida do Cavaleiro: o escudo sagrado segura o que vem de frente
    if (this.atk?.def.armor && this.atk.phase !== 'recovery' && facing) {
      att.vel.x = -nx * 6;
      att.vel.z = -nz * 6;
      this.gain(4);
      return 'shield';
    }
    // rasteira só é defendida agachado
    if (this.blocking && facing && (!def.low || this.crouching)) {
      if (this.blockT < T.parryWindow) {
        att.stunT = 0.7;
        att.atk = null;
        att.vel.x = -nx * 8;
        att.vel.z = -nz * 8;
        this.gain(20);
        return 'parry';
      }
      if (def.guardBreak) {
        this.blocking = false;
        this.stunT = 0.6;
        this.hp -= def.dmg * 0.35;
        knock(0.7);
        this.flashT = 0.1;
        this.gain(3);
        this.checkKO();
        return 'break';
      }
      this.hp -= def.dmg * 0.1;
      knock(0.6);
      this.gain(3);
      this.checkKO();
      return 'block';
    }

    // cada hit seguido atordoa menos; o último da sequência arremessa (dá chance de reagir)
    this.comboN = this.comboT > 0 ? this.comboN + 1 : 1;
    this.comboT = 0.9;
    const fin = this.comboN >= T.comboMax, air = !this.grounded; // no ar: cada golpe levanta mais (malabarismo)
    this.hp -= def.dmg;
    this.stunT = def.stun * Math.max(0.35, 1 - T.comboDecay * (this.comboN - 1));
    this.atk = null;
    this.tell = null;
    this.sliding = false;
    this.dashT = 0;
    this.sprinting = false;
    this.bounced = false;
    this.flashT = 0.12;
    knock(fin ? 1.8 : 1, fin ? Math.max(def.up, 4) : air ? Math.max(def.up, 5.5) : def.up);
    if (fin) this.comboT = 0;
    this.gain(4);
    this.checkKO();
    return 'hit';
  }

  checkKO() {
    if (this.hp > 0) return;
    this.hp = 0;
    this.ko = true;
    this.atk = null;
    this.blocking = false;
    this.vel.x *= 1.6;
    this.vel.z *= 1.6;
    this.vel.y = 6;
    this.grounded = false;
  }
}
