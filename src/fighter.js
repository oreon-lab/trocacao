import * as THREE from 'three';
import { T, ATTACKS } from './config.js';
import * as AB from './abilities/index.js';

// Eventos de gameplay (hit, dash, pulo...) que o main transforma em som/partícula/shake.
export const events = [];

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

const _o = new THREE.Vector3(), _e = new THREE.Vector3(), _d = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _hit = new THREE.Vector3();

// Input abstrato: o jogador (teclado/mouse) e o bot preenchem a mesma coisa.
// mx = direita, mz = frente. jump/dash/light/heavy/a1.. são "apertou neste frame" e são consumidos.
// blockTap = apertou a defesa agora (parry só vale no aperto, não segurando).
export function emptyInput() {
  return { mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, jumpHeld: false, dash: false, dashX: 0, dashZ: 0, crouch: false, light: false, heavy: false, block: false, blockTap: false, dodge: false, grab: false, a1: false, a2: false, a3: false, ult: false };
}
const EDGES = ['jump', 'dash', 'light', 'heavy', 'dodge', 'grab', 'blockTap', 'a1', 'a2', 'a3', 'ult'];
export const clearEdges = I => { for (const k of EDGES) I[k] = false; I.dashX = I.dashZ = 0; };

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
const PUNCHES = ['light', 'heavy', 'lunge', 'sweep'];

export class Fighter {
  constructor(name, color) {
    this.name = name;
    this.color = color;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.dashDir = new THREE.Vector3();
    this.dashLocal = { x: 0, z: 1 };
    this.input = emptyInput();
    this.char = 'Barbarian'; // define as habilidades (src/abilities/<char>.js)
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
      dashT: 0, dashT0: 0, dashIF: 0, dashV: T.dashSpeed, dashCd: 0, charges: T.dashCharges, rechargeT: 0, airDashes: 0, airJumps: 0, sinceDash: 9, sprinting: false, bounced: false,
      hp: T.hp, stunT: 0, blocking: false, parryT: 0, parryLock: 0, lastDmg: 0,
      atk: null, queued: null, queueT: 0, hand: 1, flashT: 0, ko: false, // hand 1 -> 1º soco rápido = jab (esquerda)
      walkPhase: 0, landImpact: 0, comboN: 0, comboT: 0, tell: null,
      invulnT: 0, counterT: 0, meter: 0, dodgeSide: 1, incoming: 0, danger: null, grab: null, heldBy: null, thrown: null, grabCd: 0, power: null, powerT: 0,
      st: {}, dr: {}, slots: null, _ab: null, // status (preso, veneno...), retorno decrescente, recargas das habilidades
    });
    AB.recompute(this);
  }

  get eyeY() { return this.pos.y + this.height * T.eyeRatio; }
  // invencível: esquiva perfeita/habilidade (invulnT) ou começo do dash (dashIF do dash atual)
  get invuln() { return this.invulnT > 0 || (this.dashT > 0 && this.dashT0 - this.dashT < this.dashIF); }
  gain(n) { this.meter = clamp(this.meter + n, 0, T.meterMax); }

  // janela da esquiva perfeita: quanto falta (s) pro golpe/projétil chegar, se já dá pra apertar; -1 = ainda não.
  // Cada golpe abre a janela UMA vez (no máx. perfectWindow): golpe longo (investida, giro) não deixa esquivar a qualquer hora.
  perfectLeft(foe) {
    if (this.incoming > 0) return this.incoming; // projétil/zona quase batendo (world.js marca quanto falta)
    if (!foe || foe.ko) return -1;
    const a = foe.atk, d = a?.def;
    if (!a || a.hit || a.done || (a.phase !== 'windup' && a.phase !== 'active')) return -1;
    const dist = Math.hypot(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z);
    const left = a.phase === 'windup' ? d.windup - a.t + (d.hitDelay || 0) : Math.max(0, (d.hitDelay || 0) - a.t);
    if (left > T.perfectWindow) return -1;
    const near = d.perfectNear ? d.perfectNear(foe, this, a, dist) : d.radius && !d.range ? dist < d.radius + 0.5 : d.range ? foe.reach(this, d) < 0.9 : false;
    if (!near) return -1;
    const age = a.t + (a.phase === 'active' ? d.windup : 0);
    a.pw ??= age;
    return age - a.pw <= T.perfectWindow ? left : -1;
  }
  perfectWindow(foe) { return this.perfectLeft(foe) >= 0; }
  forward(out) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  lookDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  update(dt, foe, arena) {
    const I = this.input;
    AB.ended(this, foe); // habilidade cortada (golpe do outro, KO...) desde o último passo
    AB.tick(this, dt);  // recargas + status (veneno, preso...)
    const canAct = this.stunT <= 0 && !this.ko, rooted = !!this.m.root;
    if (!this.ko) { this.yaw = I.yaw; this.pitch = I.pitch; } // caído não gira

    // timers
    this.stunT = Math.max(0, this.stunT - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.counterT = Math.max(0, this.counterT - dt);
    this.incoming = Math.max(0, this.incoming - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.parryT = Math.max(0, this.parryT - dt);
    this.parryLock = Math.max(0, this.parryLock - dt);
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
      clearEdges(I);
      return;
    }

    // direção desejada no mundo
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let wx = 0, wz = 0;
    if (canAct && !rooted) {
      wx = fx * I.mz + rx * I.mx;
      wz = fz * I.mz + rz * I.mx;
      const wl = Math.hypot(wx, wz);
      if (wl > 1) { wx /= wl; wz /= wl; }
    }
    let hs = Math.hypot(this.vel.x, this.vel.z);

    // defesa. Parry = APERTAR a defesa na hora (0.15s); apertar à toa trava o parry meio segundo. Segurar só defende.
    this.blocking = canAct && I.block && !this.atk && !this.sliding && this.dashT <= 0;
    if (I.blockTap && canAct && this.parryLock <= 0) { this.parryT = T.parryWindow; this.parryLock = 0.5; }

    // agachar / slide (segurar agachar durante o dash = slide quando o dash acaba)
    if (!I.crouch) this.slideLock = false;
    if (canAct && !rooted && I.crouch && this.grounded && !this.sliding && !this.slideLock && this.dashT <= 0 && hs > T.slideMinSpeed) {
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

    // habilidade que não deixa cancelar no dash (o dash dela é dela)
    const lockedAtk = this.atk?.def.slot && !this.atk.def.dashCancel && this.atk.phase !== 'recovery';
    // esquiva (Q): desvio rápido pro lado (ou pra onde o WASD aponta). Na hora certa = ESQUIVA PERFEITA:
    // não gasta carga, fica invencível mais tempo, dá contra-ataque e energia.
    if (I.dodge && canAct && !rooted && !lockedAtk && this.dashCd <= 0) {
      const perfect = this.perfectWindow(foe);
      if (perfect || this.charges > 0) {
        I.dash = true;
        I.dashX = I.mx || (this.dodgeSide = -this.dodgeSide);
        I.dashZ = I.mz ? I.mz * 0.5 : -0.35;
        if (perfect) {
          this.charges++;
          this.invulnT = T.perfectIFrames;
          this.counterT = T.counterTime;
          this.gain(20);
          events.push({ type: 'perfect', f: this });
        }
      }
    }

    // dash: direção do WASD (ou do toque duplo); sem direção = pra frente
    if (I.dash && canAct && !rooted && !lockedAtk && this.charges > 0 && this.dashCd <= 0 && (this.grounded || this.airDashes < 1)) {
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
      Object.assign(this, { dashT: T.dashTime, dashT0: T.dashTime, dashIF: T.dashIFrames, dashV: T.dashSpeed, dashCd: T.dashTime + T.dashCooldown, sliding: false, sinceDash: 0, blocking: false, bounced: false });
      this.charges--;
      if (!this.grounded) this.airDashes++;
      if (this.grounded && dz > 0.3) this.sprinting = true; // dash pra frente no chão emenda em corrida
      // dash cancela o golpe (finta no windup, emenda depois de acertar). No active o golpe NÃO viaja junto com o dash.
      this.atk = null;
      events.push({ type: 'dash', f: this });
    }

    // corrida: continua enquanto segura frente; defender, agachar, golpear ou apanhar para
    if (!canAct || I.mz <= 0 || this.blocking || this.crouching || (this.atk && this.dashT <= 0)) this.sprinting = false;

    // velocidade
    if (this.atk?.drive) { // a habilidade manda (investida, giro...)
      this.vel.x = this.atk.drive.x;
      this.vel.z = this.atk.drive.z;
    } else if (this.dashT > 0) {
      this.dashT -= dt;
      const s = this.dashT > 0 ? this.dashV : T.dashExitSpeed;
      this.vel.set(this.dashDir.x * s, 0, this.dashDir.z * s);
    } else if (this.sliding) {
      const k = Math.max(0, hs - T.slideDecel * dt) / hs;
      this.vel.x *= k; this.vel.z *= k;
    } else {
      let max = (this.crouching ? T.crouchSpeed : this.sprinting ? T.sprintSpeed : T.walkSpeed) * this.m.move;
      if (this.blocking) max *= T.blockSpeedMul;
      if (this.atk?.def.moveMul !== undefined) max *= this.atk.def.moveMul;
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
    if (this.jumpBufT > 0 && this.coyoteT > 0 && canAct && !rooted && this.dashT <= 0 && !lockedAtk) {
      this.vel.y = T.jumpVel;
      this.grounded = false;
      this.coyoteT = this.jumpBufT = 0;
      this.jumpCutDone = false;
      this.sliding = false;
      events.push({ type: 'jump', f: this });
    } else if (I.jump && !this.grounded && this.pos.y > 0.4 && this.airJumps < 1 && canAct && !rooted && this.dashT <= 0 && !this.atk) {
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
    // habilidades (a1 a2 a3 ult) e giro (G): o aperto fica guardado um instante e sai assim que der.
    // Soco que ACERTOU pode ser cancelado direto na habilidade (combo); a ULT cancela também habilidade que acertou.
    for (const k of ['ult', 'a3', 'a2', 'a1', 'grab']) if (I[k]) { this.power = k; this.powerT = T.powerBuffer; break; }
    if (this.power && (this.powerT -= dt) <= 0) this.power = null;
    const a0 = this.atk;
    const cancel = a0 && a0.phase === 'recovery' && a0.landed && (PUNCHES.includes(a0.kind) || (this.power === 'ult' && a0.def.slot && !a0.def.ult));
    if (this.power && canAct && (!a0 || cancel)) {
      const why = this.power === 'grab' ? this.useGrab(foe) : AB.cast(this, this.power, foe);
      if (why) events.push({ type: 'deny', f: this, power: this.power, why });
      this.power = null;
    }
    if (this.queued && !this.atk && canAct && !this.blocking) this.startAttack(this.queued, foe);
    if (this.atk) {
      const a = this.atk, d = a.def, c = d.slot ? AB.ctx(this, foe, a) : null;
      a.t += dt;
      c && d.onUpdate?.(c, dt);
      if (this.atk === a && a.phase === 'windup' && a.t >= d.windup) {
        a.phase = 'active';
        a.t -= d.windup;
        events.push({ type: 'swing', f: this, kind: a.kind });
        c && d.onActive?.(c);
      }
      if (this.atk === a && a.phase === 'active') {
        if (!a.hit && !a.done && d.range && !(d.hitDelay && a.t < d.hitDelay)) this.tryHit(foe); // golpe corpo a corpo (soco ou habilidade com range)
        if (this.atk === a && a.t >= d.active) { a.phase = 'recovery'; a.t -= d.active; }
      }
      // acertar encurta a recuperação = combos (defendido não encurta)
      if (this.atk === a && a.phase === 'recovery' && a.t >= d.recovery * (a.landed && d.landedCut !== false ? 0.6 : 1)) { a.phase = 'done'; this.atk = null; }
    }
    AB.ended(this, foe);
    clearEdges(I);
  }

  // GIRO DO FURACÃO (G): só recarga, sem energia. null = saiu; senão o motivo ('cd', 'far', 'online')
  useGrab(foe) {
    const d = foe && !foe.ko ? Math.hypot(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z) : Infinity;
    if (!foe || foe.remote) return 'online';
    if (this.grabCd > 0) return 'cd';
    if (d > T.grabRange) return 'far';
    this.grabCd = T.grabWhiffCd;
    this.atk = null; // cancela a recuperação do soco que acertou
    this.blocking = false;
    this.queued = null;
    this.startAttack('grab', foe);
    this.atk.aim = foe; // mira automática
    if (d > 1.1) { // passo rápido até ele
      const v = Math.min(10, (d - 1.0) * 6);
      this.vel.x += (foe.pos.x - this.pos.x) / d * v;
      this.vel.z += (foe.pos.z - this.pos.z) / d * v;
    }
    return null;
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
    if (k === 'grab') { this.dashT = 0; this.vel.multiplyScalar(0.2); } // freia o dash (senão atravessa o oponente)
    // passo à frente: o soco "anda" até o oponente se ele tá quase no alcance
    const d = foe && k !== 'sweep' && k !== 'grab' ? this.inCone(foe, 4.5, 0.75) : 0;
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
    const d = foe ? (this.atk?.aim === foe ? Math.hypot(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z) : this.inCone(foe, def.range + T.assistRange)) : 0;
    if (d) {
      const yaw = Math.atan2(-(foe.pos.x - this.pos.x), -(foe.pos.z - this.pos.z));
      const up = Math.atan2(foe.pos.y + foe.height * 0.6 - _o.y, d);
      const pitch = def.low ? 0 : this.atk?.aim === foe ? up : clamp(up, this.pitch - 0.15, this.pitch + 0.15); // mira automática: altura certa
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

  // ---- GIRO DO FURACÃO ----
  startGrab(foe) {
    this.atk = null;
    this.grabCd = T.grabCooldown; // pegou: começa a recarga
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
    Object.assign(v, { thrown: this, bounced: false, stunT: 1.1, flashT: 0.12, jumpCutDone: true, grounded: false }); // combo continua contando (sem zerar)
    v.hp -= T.throwDmg;
    v.checkKO();
    this.gain(10);
    this.dashCd = 0.15;
    events.push({ type: 'throw', f: this, victim: v, point: v.pos.clone(), from, dmg: T.throwDmg });
  }

  tryHit(foe) {
    if (foe.ko || foe.invuln) return;
    // agarrão: pega quem estiver colado (não precisa mirar exato); passa pela defesa
    if (this.atk.kind === 'grab') {
      if (Math.hypot(foe.pos.x - this.pos.x, foe.pos.z - this.pos.z) < 2.4 && foe.pos.y < 1.2 && !foe.grab && !foe.heldBy && !foe.sliding) this.startGrab(foe);
      return;
    }
    if (this.reach(foe, this.atk.def) > 0) return;
    // slide passa por baixo de soco alto
    if (foe.sliding && !this.atk.def.low) {
      if (!this.atk.under) { this.atk.under = true; events.push({ type: 'under', f: foe, point: foe.pos.clone().setY(1) }); }
      return;
    }
    this.land(foe, this.atk.kind);
  }

  // acertou (_hit = ponto do impacto). Dano/online/evento: AB.deal (igual pra soco, habilidade, projétil)
  land(foe, kind) {
    const crit = kind === 'lunge' && Math.random() < T.critChance; // soco voador às vezes crita
    AB.deal(this, foe, kind, _hit, { crit });
  }

  // quem APANHA decide: escudo, armadura, defesa/parry/quebra, acerto (combo, status). o: { mul, counter, crit, dir:[x,z], by, x }
  receive(att, def, o = {}) {
    if (o.crit) def = critDef(def);
    let nx, nz;
    if (o.dir) { nx = o.dir[0]; nz = o.dir[1]; } else { nx = this.pos.x - att.pos.x; nz = this.pos.z - att.pos.z; }
    let nl = Math.hypot(nx, nz);
    if (nl < 1e-3) { nx = Math.sin(this.yaw); nz = Math.cos(this.yaw); nl = 1; } // bem no centro: empurra pra trás
    nx /= nl; nz /= nl;
    const front = -(nx * -Math.sin(this.yaw) + nz * -Math.cos(this.yaw)) > 0.3, facing = front || !!def.zone; // zona: defende de qualquer lado
    const dmg = def.dmg * (o.mul || 1) * this.m.dmgIn, kn = o.counter ? 1.3 : 1;
    const knock = (m, up = 0) => {
      this.vel.x = nx * def.knock * m * kn;
      this.vel.z = nz * def.knock * m * kn;
      if (up > 0) { this.vel.y = Math.max(this.vel.y, up); this.grounded = false; this.jumpCutDone = true; }
    };
    const status = () => { for (const [id, t, x] of def.status || []) AB.addStatus(this, id, t, { ...x, by: o.by }); };
    const take = d => { this.lastDmg = d; this.hp -= d; };
    this.lastDmg = 0;

    // escudo frontal (Investida Sagrada): segura o que vem de frente
    if (this.atk?.def.armor === 'front' && this.atk.phase !== 'recovery' && front) {
      att.vel.x = -nx * 6;
      att.vel.z = -nz * 6;
      this.gain(4);
      return 'shield';
    }
    // dano sem reação (tick de zona/aura)
    if (def.soft) { take(dmg); status(); this.checkKO(); return 'status'; }
    // armadura: leva parte do dano, não atordoa nem é empurrado (quebra-defesa passa)
    const armor = this.m.armor || (this.atk?.def.armor === 'super' && this.atk.phase !== 'recovery' ? 0.6 : 0);
    if (armor && !def.guardBreak) { take(dmg * armor); this.flashT = 0.12; status(); def.onVictim?.(this, att, 'armor', o.x); this.checkKO(); return 'armor'; }
    // defesa (rasteira só agachado; zona não tem parry)
    if (this.blocking && facing && !def.unblockable && (!def.low || this.crouching)) {
      if (this.parryT > 0 && !def.zone && !def.noParry) {
        Object.assign(att, { stunT: 0.7, flashT: 0.12, atk: null }); // quem levou parry cambaleia (com animação)
        att.vel.x = -nx * 8;
        att.vel.z = -nz * 8;
        this.parryT = this.parryLock = 0;
        this.gain(15);
        return 'parry';
      }
      if (def.statusOnBlock) status(); // ex.: Prisão de Ossos prende mesmo defendendo
      if (def.guardBreak) {
        this.blocking = false;
        this.stunT = 0.6;
        take(dmg * 0.35);
        knock(0.7);
        this.flashT = 0.1;
        this.gain(2);
        this.checkKO();
        return 'break';
      }
      take(dmg * 0.1);
      knock(0.6);
      this.gain(2);
      this.checkKO();
      return 'block';
    }

    // combo: só conta se ainda estava tonto/no ar (golpe que dava pra defender começa outro combo).
    // Depois do 2º hit cada um tira menos; o 4º arremessa (dá chance de reagir).
    const chained = this.comboT > 0 && (this.stunT > 0 || !this.grounded);
    this.comboN = chained ? this.comboN + 1 : 1;
    this.comboT = 0.9;
    const n = this.comboN, fin = n === T.comboMax, air = !this.grounded; // no ar: cada golpe levanta mais (malabarismo)
    take(dmg * Math.max(0.5, 1 - 0.1 * Math.max(0, n - 2)));
    this.stunT = def.stun * Math.max(0.35, 1 - T.comboDecay * (n - 1));
    Object.assign(this, { atk: null, tell: null, sliding: false, dashT: 0, sprinting: false, bounced: false, flashT: 0.12 });
    knock(fin ? 1.8 : 1, fin ? Math.max(def.up, 4) : air ? Math.max(def.up, 5.5) : def.up);
    if (def.pull) { this.vel.x = -nx * def.pull; this.vel.z = -nz * def.pull; } // puxa pra perto
    this.gain(2);
    status();
    def.onVictim?.(this, att, 'hit', o.x);
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
