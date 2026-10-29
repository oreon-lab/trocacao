import * as THREE from 'three';
import { T, ATTACKS } from './config.js';

// Eventos de gameplay (hit, dash, pulo...) que o main transforma em som/partícula/shake.
export const events = [];

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

const _o = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _hit = new THREE.Vector3();

// Input abstrato: o jogador (teclado/mouse) e o bot preenchem a mesma coisa.
// mx = direita, mz = frente. jump/dash/light/heavy são "apertou neste frame" e são consumidos.
export function emptyInput() {
  return { mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, jumpHeld: false, dash: false, dashX: 0, dashZ: 0, crouch: false, light: false, heavy: false, block: false, dodge: false, q: false, r: false };
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

export class Fighter {
  constructor(name, color) {
    this.name = name;
    this.color = color;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.dashDir = new THREE.Vector3();
    this.dashLocal = { x: 0, z: 1 };
    this.input = emptyInput();
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
      dashT: 0, dashCd: 0, charges: T.dashCharges, rechargeT: 0, airDashes: 0, sinceDash: 9,
      hp: T.hp, stunT: 0, blocking: false, blockT: 0,
      atk: null, queued: null, queueT: 0, hand: 1, flashT: 0, ko: false, // hand 1 -> 1º soco rápido = jab (esquerda)
      walkPhase: 0, landImpact: 0, comboN: 0, comboT: 0, tell: null,
      invulnT: 0, counterT: 0, meter: 0, dodgeSide: 1, incoming: 0,
    });
  }

  get eyeY() { return this.pos.y + this.height * T.eyeRatio; }
  get invuln() { return this.invulnT > 0 || (this.dashT > 0 && T.dashTime - this.dashT < T.dashIFrames); }
  gain(n) { this.meter = clamp(this.meter + n, 0, T.meterMax); }

  // o golpe do oponente (ou um projétil) vai chegar em instantes? = janela da esquiva perfeita
  perfectWindow(foe) {
    if (this.incoming > 0) return true; // projétil quase batendo (o main marca)
    if (!foe || foe.ko) return false;
    const a = foe.atk;
    if (a && !a.hit && !a.def.ranged) {
      const left = a.phase === 'windup' ? a.def.windup - a.t : a.phase === 'active' ? 0 : 9;
      if (left <= T.perfectWindow && foe.reach(this, a.def) < 0.9) return true;
    }
    const tl = foe.tell; // bot armando o golpe
    return !!(tl && !tl.pressed && tl.dur - tl.el < 0.08 && Math.hypot(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z) < 3);
  }
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
    this.dashCd -= dt;
    this.sinceDash += dt;
    if (this.charges < T.dashCharges && (this.rechargeT += dt) >= T.dashRecharge) { this.charges++; this.rechargeT = 0; }
    this.jumpBufT -= dt;
    if (I.jump) this.jumpBufT = T.jumpBuffer;
    this.coyoteT = this.grounded ? T.coyote : this.coyoteT - dt;
    if ((this.queueT -= dt) <= 0) this.queued = null;
    if ((this.comboT -= dt) <= 0) this.comboN = 0;

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

    // esquiva (E): desvio rápido pro lado (ou pra onde o WASD aponta). Na hora certa = ESQUIVA PERFEITA:
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
      this.dashT = T.dashTime;
      this.dashCd = T.dashTime + T.dashCooldown;
      this.charges--;
      if (!this.grounded) this.airDashes++;
      this.sliding = false;
      this.sinceDash = 0;
      this.blocking = false;
      if (this.atk && this.atk.phase !== 'active') this.atk = null; // dash cancela golpe (fintas)
      events.push({ type: 'dash', f: this });
    }

    // velocidade
    if (this.dashT > 0) {
      this.dashT -= dt;
      const s = this.dashT > 0 ? T.dashSpeed : T.dashExitSpeed;
      this.vel.set(this.dashDir.x * s, 0, this.dashDir.z * s);
    } else if (this.sliding) {
      const k = Math.max(0, hs - T.slideDecel * dt) / hs;
      this.vel.x *= k; this.vel.z *= k;
    } else {
      let max = this.crouching ? T.crouchSpeed : T.walkSpeed;
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
    }
    if (!I.jumpHeld && !this.jumpCutDone && this.vel.y > 0) { this.vel.y *= T.jumpCut; this.jumpCutDone = true; }
    if (this.dashT <= 0 && !this.grounded) this.vel.y -= T.gravity * (this.vel.y < 0 ? T.fallMul : 1) * dt;

    // integra
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) {
      if (!this.grounded) {
        this.landImpact = Math.min(1, -this.vel.y / 18);
        this.airDashes = 0;
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
    // poderes: R = super soco (barra cheia), Q = bola de energia
    if (canAct && !this.atk && !this.blocking && (I.q || I.r)) {
      if (I.r && this.meter >= T.costR) { this.meter -= T.costR; this.startAttack('super', foe); events.push({ type: 'superStart', f: this }); }
      else if (I.q && this.meter >= T.costQ) { this.meter -= T.costQ; this.startAttack('cast', foe); }
      else events.push({ type: 'noMeter', f: this });
    }
    if (this.queued && !this.atk && canAct && !this.blocking) this.startAttack(this.queued, foe);
    if (this.atk) {
      const a = this.atk, d = a.def;
      a.t += dt;
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
      }
      if (a.phase === 'active') {
        if (!a.hit) this.tryHit(foe);
        if (this.atk && a.t >= d.active) { a.phase = 'recovery'; a.t -= d.active; }
      }
      // acertar encurta a recuperação = combos
      if (this.atk && a.phase === 'recovery' && a.t >= d.recovery * (a.hit ? 0.6 : 1)) this.atk = null;
    }

    I.jump = I.dash = I.light = I.heavy = I.dodge = I.q = I.r = false;
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
    else if (kind === 'light' && (this.dashT > 0 || this.sinceDash < 0.18)) k = 'lunge';
    const def = ATTACKS[k];
    this.atk = { id: (this.atkN = (this.atkN || 0) + 1), kind: k, def, t: 0, phase: 'windup', hit: false, hand: k === 'light' ? (this.hand ^= 1) : 1 };
    // passo à frente: o soco "anda" até o oponente se ele tá quase no alcance
    const d = foe && k !== 'sweep' && k !== 'cast' && k !== 'super' ? this.inCone(foe, 4.5, 0.75) : 0;
    if (d > 1.1) {
      const v = Math.min(k === 'lunge' ? 9 : k === 'heavy' ? 5 : 3.5, (d - 1.0) * 6);
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

  tryHit(foe) {
    if (foe.ko || foe.invuln) return;
    let def = this.atk.def;
    if (this.reach(foe, def) > 0) return;
    this.atk.hit = true;
    const kind = this.atk.kind, point = _hit.clone();
    // contra-ataque depois de uma esquiva perfeita: golpe mais forte
    const mul = this.counterT > 0 ? T.counterMul : 1;
    if (mul > 1) { def = { ...def, dmg: def.dmg * mul, knock: def.knock * 1.3 }; this.counterT = 0; }
    // online: quem apanha decide o resultado (defesa/parry/acerto) na máquina dele
    if (foe.remote) return foe.onRemoteHit(kind, point, mul);
    const result = foe.receive(this, def);
    this.gain(result === 'hit' ? 7 : result === 'break' ? 6 : result === 'block' ? 2 : 0);
    events.push({ type: result, f: this, victim: foe, kind, point, dmg: Math.round(def.dmg), combo: foe.comboN, counter: mul > 1 });
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
    const fin = this.comboN >= T.comboMax;
    this.hp -= def.dmg;
    this.stunT = def.stun * Math.max(0.35, 1 - T.comboDecay * (this.comboN - 1));
    this.atk = null;
    this.tell = null;
    this.sliding = false;
    this.dashT = 0;
    this.flashT = 0.12;
    knock(fin ? 1.8 : 1, fin ? Math.max(def.up, 4) : def.up);
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
