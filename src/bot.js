import { T, ATTACKS } from './config.js';
import { clamp, damp } from './fighter.js';
import * as AB from './abilities/index.js';

// Bot com cabeça de gente (usa exatamente o mesmo input que o jogador, sem trapaça de física):
// - VÊ COM ATRASO: enxerga você como você estava há ~0.1-0.2s e prevê o movimento; não lê a sua tecla.
//   Soco rápido não dá pra reagir (é mais rápido que o reflexo): ele tem que prever, igual gente.
// - MIRA DE MOUSE: acelera, passa um pouco do ponto e corrige; perde você de vista um instante quando você dá dash.
// - ERRA O TEMPO: tenta a esquiva perfeita, mas às vezes esquiva cedo (gasta a carga) ou tarde (apanha).
// - PLANOS QUE DURAM: dança na distância, entra com dash, pressiona, espera seu erro, recua, faz isca.
// - COMBOS QUE CONFEREM: acertou = continua e fecha com poder; você defendeu = quebra a guarda, agarra ou sai fora.
// - PUNE ERRO: soco no ar = ele entra. APRENDE VOCÊ: defende muito? vem pesado/agarrão; ataca muito? segura a guarda.
// - HUMOR: tomou combo = recua e respira; tá ganhando ou você tá quase caindo = aperta. Cada luta tem um estilo.
// rt = tempo de reação (s); aimErr = erro de mira (rad); timing = erro no tempo da esquiva/pulo (s);
// see = chance de perceber um golpe; skill = execução (combos, punir, ler); decide = hesitação antes de atacar
const LEVELS = {
  easy: { rt: 0.36, rtVar: 0.14, flick: 8, aimErr: 0.2, timing: 0.14, see: 0.5, skill: 0.25, aggro: 0.55, decide: 0.3, perfect: 0.15, combo: 2, grab: 0, mobility: 0.3, keep: 0 },
  normal: { rt: 0.28, rtVar: 0.1, flick: 12, aimErr: 0.12, timing: 0.09, see: 0.72, skill: 0.55, aggro: 0.85, decide: 0.14, perfect: 0.35, combo: 3, grab: 0.1, mobility: 0.6, keep: 1 },
  hard: { rt: 0.21, rtVar: 0.06, flick: 17, aimErr: 0.06, timing: 0.055, see: 0.9, skill: 0.85, aggro: 1.1, decide: 0.04, perfect: 0.55, combo: 4, grab: 0.3, mobility: 1, keep: 1 },
};
// estilo da luta (sorteado; às vezes muda entre os rounds, como gente que muda de estratégia)
const STYLES = [
  { name: 'brigão', aggro: 1.35, patience: 0.6, mob: 0.8, mood: 0.3 },
  { name: 'paciente', aggro: 0.75, patience: 1.6, mob: 0.7, mood: 0 },
  { name: 'malandro', aggro: 1, patience: 1, mob: 1.6, mood: 0.15 },
];
const rand = (a, b) => a + Math.random() * (b - a);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.41; // ~normal, desvio 1
// quando cada habilidade faz sentido (b = leitura do momento); o kit diz bot.use ou cai no padrão do tipo
const USE = {
  poke: b => (!b.open && b.dist > 3 ? 1 : 0.25), punish: b => (b.open ? 1.8 : 0), close: b => (b.dist < 3 ? 1 : 0.1),
  gap: b => (b.dist > 4 ? 1.2 : 0.1), escape: b => (b.dist < 2.6 && b.hurt ? 1.5 : 0), combo: b => (b.confirm ? 1.6 : 0),
  zone: b => (b.P?.rootT > 0.3 || b.P?.blocking ? 1.4 : 0.5), anti: b => (b.P?.phase === 'windup' ? 1.4 : 0),
  antiAir: b => (b.P?.y > 0.6 ? 1.5 : 0), buff: b => (b.dist > 5 ? 1 : 0.15),
};
const FREQ = { a1: 1.4, a2: 1, a3: 0.9, ult: 1 };
const pick = w => { let s = 0; for (const k in w) s += w[k]; let r = Math.random() * s; for (const k in w) if ((r -= w[k]) <= 0) return k; return Object.keys(w)[0]; };

export class Bot {
  constructor() {
    this.setLevel('normal');
    this.reset(Math.PI);
  }

  setLevel(l) { this.L = LEVELS[l] || LEVELS.normal; }

  reset(yaw) {
    if (!this.style || Math.random() < 0.3) this.style = STYLES[(Math.random() * STYLES.length) | 0];
    const h = this.habit; // o que aprendeu de você continua no round seguinte (vai esquecendo aos poucos)
    this.habit = h ? Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v * 0.6])) : { atks: 0, blocked: 0, light: 0, heavy: 0, attacks: 0 };
    Object.assign(this, {
      yaw, pitch: 0, yawV: 0, aimOff: 0, t: 0, hist: [], acts: [], plan: 'approach', planT: 0.5, step: 0, dir: Math.random() < 0.5 ? -1 : 1,
      seenAtk: null, punished: null, guarded: null, combo: null, tell: null, atkCd: rand(0.3, 0.8), blockT: 0, crouchT: 0, jumpT: 0,
      mood: 0, myHp: null, foeHp: null, wasDash: false, incSeen: false, dangerSeen: null, fleeAt: Infinity, chased: null, wasStun: false,
    });
  }

  // o que ele "enxerga" agora: o oponente como estava há `lag` segundos
  see(lag) {
    const h = this.hist, t = this.t - lag;
    for (let i = h.length - 1; i >= 0; i--) if (h[i].t <= t) return h[i];
    return h[0];
  }
  later(delay, kind) { this.acts.push({ at: this.t + delay, kind }); }

  update(dt, me, foe, I, active) {
    const L = this.L;
    this.t += dt;
    I.mx = I.mz = 0;
    I.block = I.crouch = I.jumpHeld = false;
    const a0 = foe.atk;
    this.hist.push({
      t: this.t, x: foe.pos.x, z: foe.pos.z, vx: foe.vel.x, vz: foe.vel.z, y: foe.pos.y,
      atk: a0, kind: a0?.kind, phase: a0?.phase, at: a0?.t || 0, hit: !!a0?.hit, blocking: foe.blocking, dashT: foe.dashT, stunT: foe.stunT, rootT: foe.st?.root?.t || 0,
    });
    while (this.hist.length > 2 && this.hist[1].t < this.t - 1) this.hist.shift();

    // giro do furacão: girando, mira na borda mais perto (taca na parede); sendo girado, não faz nada
    if (me.grab) { if (Math.hypot(me.pos.x, me.pos.z) > 0.5) I.yaw = Math.atan2(-me.pos.x, -me.pos.z); this.yaw = I.yaw; return; }
    if (me.heldBy) return;

    // ---- olhos: vê com atraso e prevê pra onde você vai (quem joga bem "puxa a mira" na frente)
    const lag = L.rt * 0.6, P = this.see(lag), lead = lag * (0.4 + 0.6 * L.skill);
    const px = P.x + P.vx * lead, pz = P.z + P.vz * lead;
    const dx = px - me.pos.x, dz = pz - me.pos.z, dist = Math.hypot(dx, dz);

    // ---- mira de mouse
    if (P.dashT > 0 && !this.wasDash) this.aimOff += (Math.random() < 0.5 ? -1 : 1) * L.aimErr * 4; // dash = perdeu você de vista
    this.wasDash = P.dashT > 0;
    this.aimOff = damp(this.aimOff, 0, 3, dt) + gauss() * L.aimErr * Math.sqrt(dt) * 0.8;
    if (Math.abs(wrap(I.yaw - this.yaw)) > 1e-4) { this.yaw = I.yaw; this.yawV = 0; } // habilidade virou ele (Passo Sombrio): aceita
    const want = Math.atan2(-dx, -dz), err = wrap(want + this.aimOff - this.yaw), maxT = L.flick * (me.stunT > 0 ? 0.3 : 1);
    this.yawV = damp(this.yawV, clamp(err * L.flick, -maxT, maxT), 14, dt); // acelera, passa um pouco e volta
    this.yaw = wrap(this.yaw + this.yawV * dt);
    this.pitch = damp(this.pitch, Math.atan2(P.y + foe.height * 0.62 - me.eyeY, Math.max(dist, 0.5)), 8, dt);
    I.yaw = this.yaw;
    I.pitch = this.pitch;
    if (!active || me.ko || foe.ko) { this.combo = this.tell = me.tell = null; return; }
    const facing = Math.abs(wrap(want - this.yaw)) < 0.45;

    // ---- humor: apanhou = cabreiro; bateu = confiante
    if (this.myHp !== null && me.hp < this.myHp - 0.5) this.mood -= (this.myHp - me.hp) / 22;
    if (this.foeHp !== null && foe.hp < this.foeHp - 0.5) this.mood += (this.foeHp - foe.hp) / 30;
    this.myHp = me.hp; this.foeHp = foe.hp;
    this.mood = clamp(this.mood + (this.style.mood - this.mood) * Math.min(1, dt * 0.35), -1.5, 1.5);

    // ---- viu você armar um golpe: decide o que fazer (se perceber a tempo)
    if (P.atk && P.atk !== this.seenAtk && P.phase === 'windup') {
      this.seenAtk = P.atk;
      this.habit.attacks++;
      if (P.kind === 'heavy') this.habit.heavy++;
      if (P.kind === 'light') this.habit.light++;
      if (Math.random() < L.see) this.react(P, dist, lag);
      // socos rápidos em sequência: lê o ritmo e dá PARRY no próximo (aperta a defesa na hora em que ele vai chegar)
      if (P.kind === 'light') {
        const start = this.t - lag - P.at, prev = this.lastJab;
        this.lastJab = start;
        if (prev && start - prev < 0.65 && dist < 3.2 && Math.random() < L.skill * 0.65) {
          const land = start + (start - prev) + ATTACKS.light.windup; // quando o próximo deve chegar
          const delay = land - this.t - 0.07 + gauss() * L.timing;
          if (delay > 0.03) this.later(delay, 'parry');
        }
      }
    }
    // você está emendando socos: depois do 1º, levanta a guarda pros próximos (o 1º não dá pra ver)
    if (P.atk && P.kind === 'light' && P.phase !== 'windup' && this.guarded !== P.atk && dist < 3 && !me.atk) {
      this.guarded = P.atk;
      if (Math.random() < L.see * (0.35 + 0.4 * this.lean('light'))) this.later(L.rt * 0.4, 'block');
    }
    // errou o golpe (socou o ar)? entra e pune
    if (P.atk && P.phase === 'recovery' && !P.hit && this.punished !== P.atk && dist < 3.6) {
      this.punished = P.atk;
      if (Math.random() < L.skill) this.later(L.rt * 0.4 + rand(0, L.rtVar), 'punish');
    }
    // projétil / Prisão / mini-esqueleto quase chegando: esquiva (se viu vindo)
    if (me.incoming > 0 && !this.incSeen) {
      this.incSeen = true;
      if (Math.random() < L.see * 0.7) this.later(rand(0, L.rtVar), Math.random() < L.perfect + 0.3 ? 'dodge' : 'block');
    }
    if (me.incoming <= 0) this.incSeen = false;
    // círculo no chão (meteoro, Prisão): demora o tempo de reação pra perceber e sai
    if (me.danger && me.danger !== this.dangerSeen) { this.dangerSeen = me.danger; this.fleeAt = Math.random() < L.see + 0.1 ? this.t + L.rt + rand(0, L.rtVar) : Infinity; }
    if (!me.danger) this.dangerSeen = null;
    // levantou de um combo e você continua em cima: defende, esquiva pra fora ou soca de volta
    if (this.wasStun && me.stunT <= 0 && dist < 2.8) {
      const r = Math.random();
      if (r < 0.45) this.blockT = rand(0.3, 0.6);
      else if (r < 0.45 + L.skill * 0.35 && me.charges > 0) this.later(0, 'dodge');
      else this.later(rand(0, 0.08), 'jab');
    }
    this.wasStun = me.stunT > 0;

    // ---- ações agendadas (reações com atraso de gente)
    for (let i = this.acts.length - 1; i >= 0; i--) {
      if (this.acts[i].at > this.t) continue;
      const k = this.acts.splice(i, 1)[0].kind;
      this.act(k, me, foe, I, dist);
    }
    if (this.blockT > 0) { this.blockT -= dt; I.block = true; }
    if (this.crouchT > 0) { this.crouchT -= dt; I.crouch = true; }
    if (this.jumpT > 0) { this.jumpT -= dt; I.jumpHeld = true; }

    // ---- plano: dura um tempo (não sorteia ação a cada quadro)
    if ((this.planT -= dt) <= 0) this.choosePlan(me, foe, P, dist);
    this.move(me, foe, P, I, dist, facing);

    // ---- atacar: hesita um pouco (mais no fácil), depois solta o combo
    const tl = this.tell;
    if (tl) {
      tl.el += dt;
      if (me.stunT > 0 || dist > 3.4) this.tell = null;
      else if (tl.el >= tl.dur) { this.tell = null; this.startCombo(tl.kind); }
    }
    this.atkCd -= dt;
    const reach = 2.45 + rand(-0.15, 0.5) * (1 - L.skill); // gente erra a distância (às vezes soca o ar)
    // você vindo pra cima: antecipa e soca na beirada do alcance (previsão, não reflexo)
    const closing = -(P.vx * dx + P.vz * dz) / (dist || 1), soon = dist - Math.max(0, closing) * 0.18;
    const meets = closing > 1.5 && soon < reach && this.reads;
    const wantsHit = this.plan === 'pressure' || this.plan === 'approach' || (this.plan === 'footsie' && dist < 2.3) || (this.plan === 'wait' && dist < 2) || (meets && this.plan !== 'retreat');
    if (wantsHit && !this.tell && !this.combo && (this.atkCd <= 0 || meets) && Math.min(dist, soon) < reach && facing && !me.atk && me.stunT <= 0 && this.blockT <= 0) {
      const breakGuard = P.blocking || this.lean('block') > 0.45;
      const kind = breakGuard && Math.random() < 0.55 ? 'heavy' : 'light';
      this.tell = { kind, el: 0, dur: L.decide * rand(0.5, 1.5), total: 0, pressed: false };
      this.tell.total = this.tell.dur + ATTACKS[kind].windup;
    }
    if (this.combo) this.comboStep(me, foe, I, dist);
    me.tell = this.tell;

    // ---- poderes fora do combo: na hora certa (você exposto, preso, longe com a habilidade de longe...)
    if (!me.atk && !this.combo && facing && me.stunT <= 0 && Math.random() < dt * 2.5) this.maybePower(me, foe, P, I, dist, false);

    // ---- fugir do círculo / da Roda de Ossos
    if (me.danger && this.t >= this.fleeAt) {
      const ax = me.pos.x - me.danger.x, az = me.pos.z - me.danger.z, al = Math.hypot(ax, az);
      if (al < 0.05) { I.mx = this.dir; I.mz = 0; } else {
        const s = Math.sin(me.yaw), c = Math.cos(me.yaw);
        I.mz = (-ax * s - az * c) / al;
        I.mx = (ax * c - az * s) / al;
      }
      if (al < 1.2 && me.charges > 0 && !this.fledDash) { this.fledDash = true; I.dash = true; I.dashX = I.mx; I.dashZ = I.mz; }
    } else this.fledDash = false;
  }

  // tendência que ele aprendeu de você (0..1): 'block' = defende quando ele bate; 'light'/'heavy' = com o que você abre
  lean(k) {
    const h = this.habit;
    if (k === 'block') return h.atks > 2 ? h.blocked / h.atks : 0;
    return h.attacks > 2 ? h[k] / h.attacks : 0;
  }

  react(P, dist, lag) {
    const L = this.L, d = ATTACKS[P.kind];
    if (!d) return;
    const think = L.rt * 0.4 + rand(0, L.rtVar);          // tempo pra decidir depois de ver
    const land = d.windup + (d.hitDelay || 0) - P.at - lag; // quanto falta, de verdade, pro golpe chegar
    if (!d.slot && dist > (d.range || 2.5) + 1.6) return; // longe: nem liga
    const timed = lead => Math.max(think, land - lead + gauss() * L.timing); // apertar ~na hora certa (com erro)
    if (d.counter) { // habilidade: o kit diz a resposta (pular, esquivar, recuar...)
      const [k, max = 99] = d.counter;
      if (dist < max) this.later(k === 'back' ? think : timed(k === 'jump' ? 0.2 : 0.1), k === 'jump' && Math.random() > 0.7 ? 'dodge' : k);
      return;
    }
    switch (P.kind) {
      case 'heavy': {
        const r = Math.random();
        if (r < L.perfect) this.later(timed(0.1), 'dodge');
        else if (dist < 2.5 && r < L.perfect + L.skill * 0.35) this.later(think, 'jab'); // soco rápido interrompe o pesado
        else this.later(think, 'back');
        break;
      }
      case 'lunge': this.later(think, Math.random() < 0.5 ? 'block' : 'dodge'); break;
      case 'sweep': this.later(timed(0.15), Math.random() < 0.6 ? 'jump' : 'lowblock'); break;
    }
  }

  act(k, me, foe, I, dist) {
    const L = this.L;
    if (k === 'block') { if (this.blockT <= 0) I.blockTap = true; this.blockT = Math.max(this.blockT, rand(0.3, 0.55)); } // apertar a defesa = parry na hora
    else if (k === 'parry') { this.blockT = 0; this.later(0.02, 'block'); } // solta e aperta de novo (parry = aperto na hora certa)
    else if (k === 'lowblock') this.blockT = this.crouchT = 0.5;
    else if (k === 'jump') { I.jump = true; this.jumpT = 0.3; }
    else if (k === 'dodge') { // perto da parede, esquiva pro lado de dentro da arena (gente não esquiva pra parede)
      const toCenter = Math.sign(-me.pos.x * Math.cos(me.yaw) + me.pos.z * Math.sin(me.yaw)); // centro fica à direita (+1) ou esquerda (-1)
      I.dodge = true; I.mx = Math.hypot(me.pos.x, me.pos.z) > 8 && toCenter ? toCenter : this.dir; this.dir = -this.dir;
    } else if (k === 'airdash') { if (!me.grounded && me.charges > 0) { I.dash = true; I.dashZ = 1; } } else if (k === 'jab') { if (!me.atk && dist < 2.8) { this.blockT = 0; this.startCombo('light'); } }
    else if (k === 'back') { this.plan = 'retreat'; this.planT = rand(0.35, 0.6); this.blockT = 0; if (dist < 2.2 && me.charges > L.keep) { I.dash = true; I.dashZ = -1; I.dashX = this.dir * 0.5; } }
    else if (k === 'punish') {
      if (me.atk || me.stunT > 0) return;
      this.blockT = 0;
      if (dist > 2.6 && me.charges > 0) { I.dash = true; I.dashZ = 1; this.later(0.08, 'jab'); } // entra com dash
      else if (!this.maybePower(me, foe, null, I, dist, true)) this.startCombo(Math.random() < 0.3 * L.skill ? 'heavy' : 'light');
    }
  }

  startCombo(first) {
    const L = this.L;
    this.combo = { left: 1 + Math.floor(Math.random() * L.combo * (0.7 + 0.3 * this.style.aggro)), next: first, nextT: this.t, waiting: false, atk: null, hp: 0, pressT: 0 };
    this.atkCd = rand(0.3, 0.8) / (L.aggro * this.style.aggro);
  }

  // combo com confirmação: olha se o golpe anterior entrou antes de decidir o próximo
  comboStep(me, foe, I, dist) {
    const L = this.L, c = this.combo;
    if (me.stunT > 0 || dist > 4) { this.combo = null; return; }
    if (c.waiting) {
      if (me.atk && me.atk !== c.atk) { c.atk = me.atk; c.hp = foe.hp; c.waiting = false; }
      else if (this.t - c.pressT > 0.4) { this.combo = null; return; } // não saiu
      else return;
    }
    const a = c.atk;
    if (a && me.atk === a && a.phase !== 'recovery') return; // ainda batendo
    if (a) {
      const landed = foe.hp < c.hp - 0.5, blocked = a.hit && !landed;
      this.habit.atks++;
      if (blocked) {
        this.habit.blocked++;
        const r = Math.random();
        if (r < L.skill * 0.45 && a.kind !== 'heavy') { c.next = 'heavy'; c.left = 1; }       // quebra a guarda
        else if (r < L.skill * 0.6 && me.grabCd <= 0 && L.grab) { c.next = 'grab'; c.left = 1; }
        else { this.combo = null; this.plan = 'retreat'; this.planT = rand(0.3, 0.6); return; } // sai fora
      } else if (!a.hit) {
        if (Math.random() > L.skill * 0.5) { this.combo = null; return; } // errou: para (às vezes insiste)
      } else if (c.left === 1 && Math.random() < L.skill) { // último do combo: fecha com o que tiver
        c.next = this.pickAbility(me, foe, null, dist, { confirm: true }) || (Math.random() < 0.5 ? 'heavy' : 'light');
      }
    }
    if (c.left <= 0) { this.combo = null; return; }
    if (this.t < c.nextT) return;
    const k = c.next || 'light';
    I[k] = true;
    c.left--; c.waiting = true; c.pressT = this.t; c.next = 'light';
    c.nextT = this.t + rand(0.1, 0.2) / (0.6 + 0.4 * L.skill); // ritmo de dedo, não de máquina
  }

  // escolhe a habilidade que faz sentido agora (kit: bot.range, bot.use, bot.weight); null = nenhuma
  pickAbility(me, foe, P, dist, b) {
    const kit = AB.kitOf(me.char);
    let best = null, bs = 0.6;
    b.dist = dist; b.P = P; b.hurt = this.mood < -0.6 || me.hp < T.hp * 0.3;
    for (const slot of AB.SLOTS) {
      const ab = kit.abilities[slot], h = ab.bot || {};
      if (AB.canCast(me, slot, foe)) continue;
      const [lo, hi] = h.range || [0, ab.aimRange || 6];
      if (dist < lo || dist > hi) continue;
      let sc = Math.max(...[].concat(h.use || 'poke').map(t => USE[t]?.(b) || 0));
      sc *= (h.weight ?? 1) * FREQ[slot] * (0.6 + 0.8 * Math.random()) * (0.5 + 0.5 * this.L.skill);
      if (slot === 'ult' && !b.open && !b.confirm) sc *= 0.3; // ULT: guarda pra quando entra
      if (sc > bs) { bs = sc; best = slot; }
    }
    return best;
  }
  useAbility(slot, me, I) { // aperta + segue o que o kit pede
    I[slot] = true;
    if (AB.kitOf(me.char).abilities[slot].bot?.after === 'rush') { this.plan = 'rush'; this.planT = 1.4; this.step = 0; } // prendeu? vai pra cima
  }

  // usa habilidade/giro quando faz sentido: você exposto (errou, tonto, preso), ou a habilidade combina com a distância
  maybePower(me, foe, P, I, dist, punish) {
    const L = this.L;
    if (L.grab && me.grabCd <= 0 && dist < 2.6 && P?.blocking && Math.random() < L.grab) { I.grab = true; return true; }
    const open = punish || !!(P && (P.stunT > 0.2 || P.rootT > 0.3 || (P.phase === 'recovery' && !P.hit)));
    const s = this.pickAbility(me, foe, P, dist, { open });
    if (s) this.useAbility(s, me, I);
    return !!s;
  }

  choosePlan(me, foe, P, dist) {
    const L = this.L, s = this.style, lowMe = me.hp < T.hp * 0.3, lowFoe = foe.hp < T.hp * 0.3;
    const aggr = L.aggro * s.aggro * (1 + 0.35 * this.mood) * (lowFoe ? 1.4 : 1) * (lowMe && !lowFoe ? 0.7 : 1);
    const w = {};
    if (P.rootT > 0.3 || (P.stunT > 0.3 && dist < 10)) w.rush = 3; // você preso/tonto: vai pra cima
    if (dist > 7) Object.assign(w, { approach: 1, rush: (w.rush || 0) + 0.5 * L.mobility * s.mob, circle: 0.25 });
    else if (dist > 3.2) Object.assign(w, { footsie: 0.9 * s.patience, rush: (w.rush || 0) + 0.45 * aggr * L.mobility, circle: 0.4, approach: 0.5 * aggr, bait: 0.3 * L.skill * s.patience });
    else Object.assign(w, { pressure: 1.1 * aggr, wait: 0.55 * s.patience * (1 + this.lean('heavy')), bait: 0.35 * L.skill, retreat: 0.25 / aggr + (this.mood < -0.6 ? 1.2 : 0), circle: 0.25 });
    if (w.retreat && Math.hypot(me.pos.x, me.pos.z) > 9) { w.circle = (w.circle || 0) + w.retreat; w.retreat = 0; } // sem fugir pra parede
    const prev = this.plan;
    this.plan = pick(w);
    this.planT = this.plan === 'pressure' ? rand(0.5, 1.1) : this.plan === 'rush' ? 1.2 : rand(0.7, 1.6);
    if (this.plan !== prev || Math.random() < 0.3) this.dir = Math.random() < 0.5 ? -1 : 1;
    this.step = 0;
    this.footD = rand(3.1, 3.8);
    this.reads = Math.random() < L.skill; // neste plano ele está "lendo" sua entrada?
  }

  move(me, foe, P, I, dist, facing) {
    const L = this.L;
    switch (this.plan) {
      case 'approach': I.mz = 1; I.mx = this.dir * 0.25; if (dist < 3.4 && !this.combo) this.planT = Math.min(this.planT, 0.1); break;
      case 'circle': I.mx = this.dir; I.mz = dist > 4 ? 0.4 : dist < 2.5 ? -0.4 : 0; break;
      case 'footsie': // dança na beirada do alcance: entra e sai
        this.footD += Math.sin(this.t * 2.3) * 0.02;
        I.mz = dist > this.footD + 0.3 ? 1 : dist < this.footD - 0.3 ? -1 : 0;
        I.mx = this.dir * 0.55;
        break;
      case 'pressure': I.mz = dist > 1.7 ? 1 : 0; I.mx = this.dir * 0.35; break;
      case 'wait': // guarda alta perto de você, esperando você errar pra punir
        I.mx = this.dir * 0.4; I.mz = dist > 2.8 ? 0.5 : dist < 1.8 ? -0.5 : 0;
        if (dist < 2.8 && !me.atk && !this.combo && P.atk) I.block = true;
        break;
      case 'bait': // entra no alcance e sai rápido: se você socar o ar, ele pune
        if (this.step === 0) { I.mz = 1; if (dist < 2.7) this.step = 1; }
        else { I.mz = -1; I.mx = this.dir * 0.3; if (dist > 3.6) { this.step = 0; this.planT = Math.min(this.planT, 0.4); } }
        break;
      case 'retreat':
        I.mz = -1; I.mx = this.dir * 0.5;
        if (this.mood < -0.8 && dist < 2 && me.charges > L.keep && this.step === 0) { this.step = 1; I.dash = true; I.dashZ = -1; I.dashX = this.dir * 0.4; }
        break;
      case 'rush': // entra com dash e já solta o soco voador
        I.mz = 1;
        if (this.step === 0 && facing && dist > 3 && me.charges > L.keep) {
          this.step = 1;
          if (this.style.mob > 1.2 && Math.random() < 0.3) { I.jump = true; this.jumpT = 0.2; this.later(0.25, 'airdash'); } // malandro: pula e entra pelo ar
          else { I.dash = true; I.dashZ = 1; I.dashX = (Math.random() - 0.5) * 0.5 * this.style.mob; }
        } else if (this.step <= 1 && dist < 3 && (me.sinceDash < 0.25 || me.sprinting || !me.grounded) && !me.atk) { this.step = 2; this.startCombo('light'); }
        else if (this.step === 0 && dist <= 3) { this.plan = 'pressure'; this.planT = rand(0.5, 1); }
        break;
    }
    // oponente arremessado longe pelo seu golpe: dash atrás e soco voador (perseguição)
    const flying = P.stunT > 0 && (P.y > 0.3 || Math.hypot(P.vx, P.vz) > 6);
    const flyKey = Math.round(foe.hp * 10);
    if (flying && this.chased !== flyKey && dist > 2 && dist < 12 && me.charges > 0 && (!me.atk || me.atk.hit) && this.plan !== 'rush') {
      this.chased = flyKey;
      if (Math.random() < L.skill * 0.9) { this.plan = 'rush'; this.planT = 0.9; this.step = 0; }
    }
    // habilidade que pede distância (Roda de Ossos girando perto): sai de perto
    const pd = ATTACKS[P.kind];
    if (pd?.avoid && P.phase !== 'recovery' && dist < pd.avoid) { I.mz = -1; I.mx = this.dir * 0.5; }
  }
}
