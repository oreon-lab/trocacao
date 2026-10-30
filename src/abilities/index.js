// ============================================================================================================
// HABILIDADES — registro + runtime. Cada lutador tem 4: a1 (rápida, E), a2 (R), a3 (Z) com recarga, e ult (X, energia cheia).
// Toda habilidade É um golpe do ATTACKS (id '<Char>.<slot>', golpes extras '<Char>.<slot>.<chave>'), então net/bot/rig
// acham tudo por lá. Pra criar/alterar uma habilidade você SÓ mexe em src/abilities/<Char>.js — nada de arquivo compartilhado.
//
// ---- FORMATO DO ARQUIVO DO LUTADOR (src/abilities/<Char>.js) ----------------------------------------------
// export default { color, abilities: { a1, a2, a3, ult }, statuses? }      SEM import: tudo chega por c (gameplay) e v (visual).
// Slot que faltar vira placeholder (a1/a2/a3 = 'EM BREVE' travado; ult = SUPER SOCO genérico).
//
// Campos da habilidade (padrão entre parênteses):
//   identidade  name ('', MAIÚSCULO ≤18), desc (uma linha pro HUD/tutorial/menu), glyph (emoji do HUD), icon (url de svg, opcional)
//   custo       cd (a1 3, a2/a3 8, ult 0) segundos · charges (1) · cost (ult 100, resto 0: energia)
//   quando      aimRange (0) = mira automática até essa distância · needTarget (false) = nega 'far' fora do aimRange
//               air (true) pode no ar · move (false) = é movimento (nega 'root' preso) · canUse(c) -> motivo|null
//   frame data  windup/active/recovery (.2/.1/.3), hitDelay, moveMul (.3) · dashCancel (false) · through (false: atravessa o oponente)
//               armor: 'front' (escudo frontal na windup+active) | 'super' (leva dano sem atordoar) · landedCut (true: acertou = recuperação ×0.6)
//   golpe       dmg, knock, up, stun, guardBreak, low, unblockable, noParry, zone (defende de qualquer lado, sem parry), soft (sem reação),
//               hitstop, meter, status: [['root',1.6], ['poison',4,{dps:2}]], statusOnBlock, pull (m/s pra perto), onVictim(victim, att, res, x)
//               range + hitR -> teste corpo a corpo padrão durante o active (igual soco). Sem range: o acerto vem dos hooks.
//   extras      hits: { chave: {mesmos campos de golpe} } -> c.circle('chave',...)/c.deal('chave',...)
//               spawns: { chave: SpawnDef } (ver world.js: projectile | zone | summon) -> c.projectile/zone/summon('chave', params)
//   aviso       warn: ['#cor', 'TEXTO!'] (aviso na tela de quem vai apanhar) · perfectNear(att, me, a, dist) -> bool (esquiva perfeita)
//   bot         bot: { range: [min,max], use: 'poke'|'punish'|'close'|'gap'|'zone'|'combo'|'buff'|'anti', weight (1), after: 'rush' }
//               counter: ['jump'|'dodge'|'back'|'block'|'lowblock', distMax] (como o bot responde) · avoid: raio que o bot foge
//   animação    anim: { clip: 'Nome' | ['A','B'] (por c.stage), impact (s do clipe no acerto), speed, loop, upper (só tronco),
//               fp (true = vale na 1ª pessoa), hide: a => bool (some o modelo), props: ['2H_Axe'] ou [['Knight','2H_Sword','handslotr']] }
//   hooks (gameplay, só na máquina de quem lança): onStart(c) onUpdate(c,dt) onActive(c) onEnd(c,cut) onHit(c,e)
//   hooks (visual, nas duas máquinas, só leem estado): fx: { start(v), active(v), tick(v,dt), end(v,cut), hit(v,e), noIntro } · onRemote(v,x)
//
// c (gameplay): c.f c.foe c.a c.ab c.T c.THREE · dist() dir() chest() aimPoint(max,lead) · circle(key,centro,r,{maxY}) touch(key,r)
//   melee(key) cone(key,alcance,cos) deal(key,ponto,o) · dash({dir,speed,time,iframes}) drive(vx,vz) stop() leap(p,{time}) teleport(p|'behind')
//   iframes(t) status(id,t,o) (em si mesmo) · projectile/zone/summon(key,params) · stage(n) endActive() refund(slot,s) gain(n) send(x)
// v (visual): v.f v.a v.ab v.col v.isMe v.vol v.fx (src/fx.js) v.sfx v.THREE · chest() head() near(R) pop(txt) flash(a) shake(k) kick()
//   zoom(df) hype(k) hitstop(s) turnToFoe() aura() ghost() keep(chave,criar,atualizar,descartar) ultIntro() prop(char,node,tam)
// Status prontos: root slow poison burn stun silence haste empower vulnerable armor (+ statuses: { chave: {name,icon,color,mods,dot,cap} }
//   do kit, id '<Char>.<chave>'). mods: move dmgOut dmgIn cdRate (multiplicam), root silence (liga), armor (fração de dano que entra).
//
// EXEMPLO COMPLETO (copie e troque):
//   export default {
//     color: 0xff7a2f,
//     abilities: {
//       a1: { name: 'MARRETADA', glyph: '🔨', desc: 'Soco de duas mãos', cd: 3, windup: 0.28, active: 0.1, recovery: 0.32,
//             dmg: 8, range: 2.5, hitR: 0.55, knock: 9, up: 2.5, stun: 0.4, aimRange: 4.5, warn: ['#ffd23f', 'DEFENDA!'],
//             bot: { range: [0, 3], use: 'close' }, anim: { clip: '2H_Melee_Attack_Chop', impact: 0.5 },
//             fx: { hit(v, e) { v.fx.explode(e.point, v.col); v.sfx.boom(v.vol); } } },
//       a3: { name: 'BOLA', glyph: '🔥', cd: 6, windup: 0.2, active: 0.05, recovery: 0.25, aimRange: 18, dashCancel: true,
//             hits: { hit: { dmg: 6, knock: 5, stun: 0.3 } },
//             spawns: { ball: { type: 'projectile', hit: 'hit', speed: 18, range: 18, radius: 0.4,
//                               make: v => v.fx.glow(v.col, 1.2), trail(v, o) { v.fx.puff(o.pos, v.col, 0.5, 0.2); } } },
//             onActive(c) { c.projectile('ball', { from: c.chest(), dir: [c.dir().x, c.dir().z] }); },
//             bot: { range: [3, 16], use: 'poke' }, anim: { clip: 'Spellcast_Shoot' } },
//     },
//   };
// `this` nos hooks é a própria habilidade (this.windup, this.radius...). Nunca guarde c/v nem os vetores temporários deles.
// Aleatório que muda o jogo: só em on* (no dono) e mande o resultado nos params do spawn.
// ============================================================================================================
import * as THREE from 'three';
import { T, ATTACKS, SPECIALS } from '../config.js';
import { events } from '../fighter.js';
import { createWorld } from './world.js';
import { charNode } from '../rig.js';
import { toonMat, addOutline } from '../toon.js';
import Barbarian from './Barbarian.js';
import Knight from './Knight.js';
import Rogue from './Rogue.js';
import Mage from './Mage.js';
import Rogue_Hooded from './Rogue_Hooded.js';
import Skeleton_Warrior from './Skeleton_Warrior.js';
import Skeleton_Mage from './Skeleton_Mage.js';
import Skeleton_Rogue from './Skeleton_Rogue.js';
import Skeleton_Minion from './Skeleton_Minion.js';

export const SLOTS = ['a1', 'a2', 'a3', 'ult'];
export const KITS = { Barbarian, Knight, Rogue, Mage, Rogue_Hooded, Skeleton_Warrior, Skeleton_Mage, Skeleton_Rogue, Skeleton_Minion };
const BASE = { windup: 0.2, active: 0.1, recovery: 0.3, moveMul: 0.3, cd: 8, charges: 1, cost: 0, aimRange: 0, needTarget: false, air: true, dashCancel: false, landedCut: true };
const PER_SLOT = { a1: { cd: 3, meter: 2 }, a2: { meter: 2 }, a3: { meter: 2 }, ult: { cost: 100, cd: 0, meter: 0 } };
const hd = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ULT padrão enquanto o lutador não tem a dele: o super soco antigo (voa até o oponente)
const SUPER = {
  name: 'SUPER SOCO', glyph: '💥', desc: 'Voa até o oponente com um soco que quebra a defesa (barra cheia).',
  windup: 0.45, active: 0.18, recovery: 0.5, dmg: 26, range: 2.7, hitR: 0.6, knock: 16, up: 7, stun: 0.9, guardBreak: true, moveMul: 0.2,
  aimRange: 6.5, needTarget: true, warn: ['#b06bff', 'ULT! ESQUIVA!'], counter: ['dodge'], bot: { use: ['punish', 'combo'] },
  anim: { clip: 'Uppercut', impact: 13 / 30, fp: true },
  onActive(c) { // avança voando até o oponente (mira automática)
    const f = c.f, foe = c.foe, dd = foe && !foe.ko ? (c.a.aim ? hd(f, foe) : f.inCone(foe, 7, 0.6)) : 0, d = c.dir();
    const v = dd ? clamp((dd - 1.2) * 6, 4, 26) : 10;
    f.vel.x = d.x * v; f.vel.z = d.z * v;
  },
  fx: {
    tick(v) { if (v.a.phase !== 'recovery' && (v.a.fxT = (v.a.fxT || 0) - v.dt) <= 0) { v.a.fxT = 0.02; v.aura(); if (v.a.phase === 'active') v.ghost(); } },
    hit(v, e) { v.fx.explode(e.point, v.col, true); v.fx.groundRing(e.victim.pos, v.col, 6, 0.6); v.flash(0.5, '#fff'); },
  },
};
const placeholder = slot => (slot === 'ult' ? { ...SUPER } : { name: 'EM BREVE', glyph: '🔒', desc: 'Habilidade nova chegando.', locked: true });

// ---- registro (roda uma vez no import; só mexe no ATTACKS/SPECIALS do config, que não importa nada)
for (const [char, kit] of Object.entries(KITS)) {
  kit.char = char;
  kit.abilities ||= {};
  for (const slot of SLOTS) {
    const ab = (kit.abilities[slot] = Object.assign({}, BASE, PER_SLOT[slot], kit.abilities[slot] || placeholder(slot), { slot, char, kit, id: `${char}.${slot}`, special: true, ult: slot === 'ult' }));
    ATTACKS[ab.id] = ab;
    for (const k in ab.hits || {}) ATTACKS[`${ab.id}.${k}`] = Object.assign(ab.hits[k], { special: true, ult: ab.ult, ab, meter: ab.hits[k].meter ?? ab.meter, warn: ab.hits[k].warn ?? ab.warn });
  }
  for (const k in kit.statuses || {}) STATUS[`${char}.${k}`] = kit.statuses[k];
  const sig = ['a2', 'a1', 'a3'].map(s => kit.abilities[s]).find(a => !a.locked) || kit.abilities.ult;
  SPECIALS[char] = { name: sig.name, color: kit.color, kind: sig.id }; // menu/check.html antigos ainda leem isso
}
export const kitOf = char => KITS[char] || KITS.Barbarian;
export const colorOf = char => kitOf(char).color ?? 0xb06bff;
export const abOf = kind => { const d = ATTACKS[kind]; return d?.slot ? d : d?.ab || null; };

// ---- dependências (main chama uma vez): { scene, camera, fx, sfx, arena, player, enemy, send, vol, juice, noCd }
let D = null, world = null;
export function init(deps) { D = { ...deps, charNode, toonMat, addOutline }; world = createWorld({ ...D, deal, vctx }); }
export const update = sim => world.update(sim); // projéteis, zonas e lacaios
export function clear() { world.clear(); for (const f of [D.player, D.enemy]) { for (const k in f._keep || {}) f._keep[k].dispose?.(f._keep[k].o); f._keep = null; f._stSeen = null; } }
export const remote = (owner, m) => world.remote(owner, m); // NET 'ab'

// ============================== STATUS ==============================
// Ficam em f.st; quem APANHA aplica e roda (online: na máquina dele); o snapshot leva pro outro lado (HUD/visual).
// Mesmo status não empilha (renova pro maior tempo), exceto 'max' (cargas, ex.: veneno até 3). cap = duração máxima.
// dr: retorno decrescente (2ª vez em 4s = metade, 3ª = imune "RESISTIU!"). dot = dano/s (não mata: para em 1 de vida).
export const STATUS = {
  stun: { name: 'ATORDOADO', icon: '💫', color: 0xffd23f, cap: 1.0, dr: true, add: (f, t) => { f.stunT = Math.max(f.stunT, t); f.atk = null; } },
  root: { name: 'PRESO', icon: '⛓', color: 0xb46bff, mods: { root: 1 }, cap: 1.6, dr: true },
  slow: { name: 'LENTO', icon: '🐌', color: 0x7fd8ff, mods: { move: 0.55 }, cap: 2.5 },
  poison: { name: 'VENENO', icon: '☠', color: 0x7dff4a, dot: 2.5, max: 3, cap: 6 },
  burn: { name: 'FOGO', icon: '🔥', color: 0xff7a2f, dot: 3, cap: 4 },
  silence: { name: 'SILÊNCIO', icon: '🤐', color: 0xb0b0b0, mods: { silence: 1 }, cap: 1.5 },
  haste: { name: 'RÁPIDO', icon: '💨', color: 0x7fffe8, mods: { move: 1.3 } },
  empower: { name: 'FORTE', icon: '💪', color: 0xff4b3e, mods: { dmgOut: 1.25 } },
  vulnerable: { name: 'FRÁGIL', icon: '💔', color: 0xff8a3d, mods: { dmgIn: 1.25 } },
  armor: { name: 'ARMADURA', icon: '🛡', color: 0xffd9a0, mods: { armor: 0.5 } },
};
const MUL = new Set(['move', 'dmgOut', 'dmgIn', 'cdRate']);
const BLANK = { move: 1, dmgOut: 1, dmgIn: 1, cdRate: 1, root: 0, silence: 0, armor: 0 };
export function recompute(f) {
  const m = Object.assign((f.m ||= {}), BLANK);
  for (const id in f.st) for (const [k, x] of Object.entries(STATUS[id]?.mods || {})) m[k] = MUL.has(k) ? m[k] * x : x;
  return m;
}
export function addStatus(f, id, t, o = {}) {
  const d = STATUS[id];
  if (!d || f.ko) return;
  t = Math.min(t, d.cap ?? 99);
  if (d.dr) {
    const r = f.dr[id], n = r ? r.n + 1 : 1;
    f.dr[id] = { n, t: 4 };
    t *= n === 1 ? 1 : n === 2 ? 0.5 : 0;
    if (t <= 0) { events.push({ type: 'resist', f, id }); return; }
  }
  const s = f.st[id];
  if (!s) f.st[id] = { t, n: 1, dps: o.dps ?? d.dot ?? 0, by: o.by || null };
  else { s.t = Math.max(s.t, t); if (d.max) s.n = Math.min(d.max, s.n + 1); s.dps = Math.max(s.dps, o.dps || 0); }
  d.add?.(f, t);
  recompute(f);
}
function tickStatus(f, dt) {
  for (const id in f.dr) if ((f.dr[id].t -= dt) <= 0) delete f.dr[id];
  let ch = false;
  for (const id in f.st) {
    const s = f.st[id];
    if (s.dps && !f.ko) f.hp = Math.max(Math.min(f.hp, 1), f.hp - s.dps * s.n * dt); // veneno/fogo não mata
    if ((s.t -= dt) <= 0) { delete f.st[id]; ch = true; }
  }
  if (ch) recompute(f);
}
export const packStatus = f => { let o; for (const id in f.st) (o ||= {})[id] = [Math.round(f.st[id].t * 10) / 10, f.st[id].n]; return o; };
export function unpackStatus(f, o) {
  for (const id in f.st) if (!o?.[id]) delete f.st[id];
  for (const id in o || {}) { const s = (f.st[id] ||= { dps: 0 }); s.t = o[id][0]; s.n = o[id][1]; }
  recompute(f);
}

// ============================== RECARGA / CAST ==============================
function slots(f) {
  if (f.slots?.char !== f.char) { f.slots = { char: f.char }; for (const s of SLOTS) f.slots[s] = { cd: 0, n: kitOf(f.char).abilities[s].charges }; }
  return f.slots;
}
export const resetSlots = f => { f.slots = null; };
export function tick(f, dt) { // fighter.update, todo substep: recargas + status
  const S = slots(f), kit = kitOf(f.char);
  for (const slot of SLOTS) {
    const s = S[slot], ab = kit.abilities[slot];
    if (s.n < ab.charges && (s.cd -= dt * f.m.cdRate) <= 0) { s.n++; s.cd = s.n < ab.charges ? ab.cd : 0; }
  }
  tickStatus(f, dt);
}
// motivo de não poder usar agora (null = pode): locked silence cd meter root air far (+ o que canUse devolver)
export function canCast(f, slot, foe) {
  const ab = kitOf(f.char).abilities[slot], s = slots(f)[slot];
  if (ab.locked) return 'locked';
  if (f.m.silence) return 'silence';
  if (!D?.noCd) { if (s.n <= 0) return 'cd'; if (f.meter < ab.cost) return 'meter'; }
  if (ab.move && f.m.root) return 'root';
  if (!ab.air && !f.grounded) return 'air';
  if (ab.needTarget && (!foe || foe.ko || hd(f, foe) > ab.aimRange)) return 'far';
  return ab.canUse?.(ctx(f, foe, null, ab)) || null;
}
export function cast(f, slot, foe) { // null = saiu; senão o motivo (vira evento 'deny')
  const why = canCast(f, slot, foe);
  if (why) return why;
  const ab = kitOf(f.char).abilities[slot], s = slots(f)[slot];
  if (!D?.noCd) { s.n--; s.cd ||= ab.cd; f.meter -= ab.cost; }
  Object.assign(f, { blocking: false, queued: null, sprinting: false });
  const a = (f.atk = { id: (f.atkN = (f.atkN || 0) + 1), kind: ab.id, def: ab, t: 0, phase: 'windup', hit: false, hand: 1, stage: 0 });
  if (foe && !foe.ko && ab.aimRange && hd(f, foe) <= ab.aimRange) a.aim = foe; // mira automática
  ab.onStart?.(ctx(f, foe, a));
  events.push({ type: 'cast', f, slot, kind: ab.id });
  return null;
}
// atk trocou/sumiu desde a última olhada -> onEnd (pega corte por golpe, dash, KO, parry). Interrompido no windup devolve metade da recarga.
export function ended(f, foe) {
  const p = f._ab;
  if (p === f.atk) return;
  f._ab = f.atk?.def.slot ? f.atk : null;
  if (!p) return;
  const cut = p.phase !== 'done';
  if (cut && p.phase === 'windup' && !D?.noCd) slots(f)[p.def.slot].cd *= 0.5;
  p.def.onEnd?.(ctx(f, foe, p), cut);
}

// ============================== DANO ==============================
// Corpo, projétil, zona, lacaio: tudo passa aqui. Online quem apanha resolve (manda 'hit', volta 'res' -> result()).
const FAKE = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), stunT: 0, flashT: 0, atk: null };
export function deal(owner, victim, kind, point, o = {}) {
  const def = ATTACKS[kind];
  if (!def || !victim || victim.ko || victim.invuln) return null;
  let mul = (owner.m?.dmgOut || 1) * (o.mul || 1), counter = false;
  if (o.melee !== false && owner.counterT > 0) { mul *= T.counterMul; counter = true; owner.counterT = 0; } // contra-ataque da esquiva perfeita
  const a = owner.atk;
  if (a && o.mark !== false && (a.kind === kind || def.ab === a.def)) a.hit = true;
  if (victim.remote) { D.send({ t: 'hit', kind, mul, counter, crit: o.crit, pos: o.src && [o.src.x, o.src.y, o.src.z], dir: o.dir, x: o.x }); return 'sent'; }
  const att = o.src ? (FAKE.pos.copy(o.src), FAKE) : owner;
  const res = victim.receive(att, def, { mul, counter, crit: o.crit, dir: o.dir, x: o.x, by: owner });
  result(owner, victim, kind, res, point, victim.lastDmg, victim.comboN, counter, o.crit);
  return res;
}
// resultado de um golpe meu (local ou vindo do 'res' do online): energia, recarga do dash, evento
export function result(owner, victim, kind, res, point, dmg, combo, counter, crit) {
  const def = ATTACKS[kind] || {}, a = owner.atk, mine = a && (a.kind === kind || def.ab === a.def);
  owner.gain(res === 'hit' || res === 'break' ? def.meter ?? T.gainPunch : res === 'block' ? 1 : 0);
  if (mine && (res === 'hit' || res === 'break')) a.landed = true;
  if (res === 'hit' && owner.charges < T.dashCharges) owner.rechargeT += T.dashRecharge * T.dashHitRefund;
  events.push({ type: res, f: owner, victim, kind, point: point.clone(), dmg: Math.round(dmg ?? def.dmg ?? 0), combo, counter, crit });
}

// ============================== CONTEXTO DE GAMEPLAY (c) ==============================
const _v = Array.from({ length: 8 }, () => new THREE.Vector3()), CTX = new Map();
export function ctx(f, foe, a, ab = a && abOf(a.kind)) {
  let c = CTX.get(f);
  if (!c) CTX.set(f, (c = Object.create(API)));
  c.f = f; c.foe = foe; c.a = a; c.ab = c.def = ab; c.T = T; c.THREE = THREE; c.arena = D?.arena;
  return c;
}
const API = {
  tmp(i) { return _v[i]; },
  kind(key) { return key ? `${this.ab.id}.${key}` : this.ab.id; },
  dist() { return this.foe && !this.foe.ko ? hd(this.f, this.foe) : Infinity; },
  chest(out = _v[0]) { const f = this.f; return out.set(f.pos.x, f.pos.y + f.height * 0.6, f.pos.z); },
  // pro alvo (mira automática) ou pra onde olha
  dir(out = _v[1]) { const f = this.f, t = this.a?.aim; return t && !t.ko ? out.set(t.pos.x - f.pos.x, 0, t.pos.z - f.pos.z).normalize() : f.forward(out); },
  // ponto no chão: onde o alvo vai estar (lead s) se está na mira, senão à frente; dentro da arena
  aimPoint(max = this.ab.aimRange || 12, lead = 0.25, out = _v[2]) {
    const f = this.f, t = this.foe;
    if (t && !t.ko && (this.a?.aim === t || f.inCone(t, max, 0.5))) out.set(t.pos.x + t.vel.x * lead, 0, t.pos.z + t.vel.z * lead);
    else f.forward(out).multiplyScalar(Math.min(9, max)).add(f.pos).setY(0);
    const r = Math.hypot(out.x, out.z), lim = (D?.arena.R || 16) - 1;
    if (r > lim) out.multiplyScalar(lim / r);
    return out;
  },
  // ---- formas de acerto (devolvem true se mandou o golpe)
  circle(key, center, r, { maxY = Infinity, minY = -Infinity } = {}) {
    const t = this.foe;
    if (!t || t.ko || hd({ pos: center }, t) > r + T.radius) return false;
    const dy = t.pos.y - center.y;
    if (dy > maxY || dy < minY) return false;
    return !!this.deal(key, _v[3].set(t.pos.x, t.pos.y + t.height * 0.45, t.pos.z));
  },
  touch(key, r = 1.3) {
    const t = this.foe;
    return !!t && !t.ko && hd(this.f, t) < r && Math.abs(t.pos.y - this.f.pos.y) < 1.4 && !!this.deal(key, _v[3].set(t.pos.x, t.pos.y + t.height * 0.55, t.pos.z));
  },
  cone(key, range, cos = 0.5) { const t = this.foe; return !!t && this.f.inCone(t, range + T.radius, cos) > 0 && !!this.deal(key, _v[3].set(t.pos.x, t.pos.y + t.height * 0.55, t.pos.z)); },
  melee(key) { // segmento de soco com range/hitR do golpe (slide passa por baixo de golpe alto)
    const t = this.foe, def = ATTACKS[this.kind(key)];
    if (!t || t.ko || this.f.reach(t, def) > 0 || (t.sliding && !def.low)) return false;
    return !!this.deal(key, _v[3].set(t.pos.x, t.pos.y + t.height * 0.6, t.pos.z));
  },
  deal(key, point, o) { return deal(this.f, this.foe, this.kind(key), point || this.chest(_v[3]), o); },
  // ---- movimento de quem lança
  dash({ dir = this.dir(), speed = T.dashSpeed, time = T.dashTime, iframes = 0 } = {}) {
    const f = this.f;
    f.dashDir.copy(dir).setY(0).normalize();
    Object.assign(f, { dashT: time, dashT0: time, dashV: speed, dashIF: iframes, bounced: true, sinceDash: 0 });
  },
  drive(vx, vz) { (this.a.drive ||= { x: 0, z: 0 }); this.a.drive.x = vx; this.a.drive.z = vz; }, // a habilidade manda na velocidade horizontal
  stop() { if (this.a) this.a.drive = null; this.f.vel.x = this.f.vel.z = 0; },
  leap(p, { time = 0.6 } = {}) { const f = this.f; this.drive((p.x - f.pos.x) / time, (p.z - f.pos.z) / time); f.vel.y = time * T.gravity / (1 + 1 / Math.sqrt(T.fallMul)); f.grounded = false; f.jumpCutDone = true; },
  teleport(p, { face = true } = {}) { // 'behind' = 1.5 m atrás do alvo (se perto), senão 6 m à frente
    const f = this.f, foe = this.foe, A = D.arena;
    if (p === 'behind') {
      if (foe && !foe.ko && hd(f, foe) < (this.ab.aimRange || 12)) { const b = foe.forward(_v[4]); p = _v[3].set(foe.pos.x - b.x * 1.5, foe.pos.y, foe.pos.z - b.z * 1.5); }
      else p = f.forward(_v[3]).multiplyScalar(6).add(f.pos);
    }
    f.pos.copy(p);
    const r = Math.hypot(f.pos.x, f.pos.z), lim = A.R - T.radius - 0.2;
    if (r > lim) { f.pos.x *= lim / r; f.pos.z *= lim / r; }
    A.collide(f);
    f.vel.set(0, 0, 0);
    if (face && foe && !foe.ko) f.yaw = f.input.yaw = Math.atan2(-(foe.pos.x - f.pos.x), -(foe.pos.z - f.pos.z));
  },
  iframes(t) { this.f.invulnT = Math.max(this.f.invulnT, t); },
  status(id, t, o) { addStatus(this.f, id, t, o); }, // SÓ em si mesmo; no oponente o status vai pelo golpe (def.status)
  projectile(key, p = {}) { return world.spawn(this.f, this.ab, key, p); },
  zone(key, p = {}) { return world.spawn(this.f, this.ab, key, p); },
  summon(key, p = {}) { return world.spawn(this.f, this.ab, key, p); },
  send(x) { D.send({ t: 'ab', a: this.ab.id, x }); },
  stage(n) { this.a.stage = n; },
  endActive() { if (this.a.phase === 'active') this.a.t = this.ab.active; },
  refund(slot, s) { const st = slots(this.f)[slot]; st.cd = Math.max(0, st.cd - s); },
  gain(n) { this.f.gain(n); },
};

// ============================== VISUAL (v): roda nas DUAS máquinas, só lê estado ==============================
const VC = new Map(), PROPS = new Map();
export function vctx(f, a, ab, dt = 0) {
  let v = VC.get(f);
  if (!v) VC.set(f, (v = Object.create(VAPI)));
  Object.assign(v, { f, a, ab, def: ab, dt, col: colorOf(f.char), isMe: f === D.player, vol: D.vol(f), fx: D.fx, sfx: D.sfx, THREE, T, scene: D.scene });
  return v;
}
const VAPI = {
  chest(out = _v[5]) { const f = this.f; return out.set(f.pos.x, f.pos.y + f.height * 0.6, f.pos.z); },
  head(out = _v[6]) { const f = this.f; return out.set(f.pos.x, f.pos.y + 2.3, f.pos.z); },
  near(R) { return clamp(1 - D.player.pos.distanceTo(this.f.pos) / R, 0, 1); },
  nearPt(p, R) { return clamp(1 - D.player.pos.distanceTo(p) / R, 0, 1); },
  pop(text, cls = 'big', p = this.head()) { D.juice.pop(p.clone(), text, cls, this.col); },
  flash(a, color = '#fff') { D.juice.flash(this.isMe ? a : a * 0.6, color); },
  shake(k) { D.juice.shake(k); },
  kick(p, y = 0, r = 0) { D.juice.kick(p, y, r); },
  zoom(df) { if (this.isMe) D.juice.zoom(df); },
  hype(k) { D.arena.hype(k); },
  hitstop(s) { D.juice.hitstop(s); },
  turnToFoe() { if (this.isMe) D.juice.turnToFoe(); },
  aura() { D.fx.aura(this.f, this.col); },
  ghost() { D.fx.ghost(this.f, this.col); },
  toon(color, o) { return D.toonMat(color, o); },       // material cartoon do jogo
  outline(mesh, t = 0.02) { D.addOutline(mesh, t); return mesh; },
  // malha de uma peça do KayKit (faca, espada...), cacheada; devolve um Mesh novo com contorno
  prop(char, node, size = 0.8) {
    const k = char + node + size;
    if (!PROPS.has(k)) {
      const n = D.charNode(char, node), g = n.geometry.clone(), box = new THREE.Box3().setFromBufferAttribute(g.attributes.position), s = box.getSize(new THREE.Vector3());
      if (s.y >= s.x && s.y >= s.z) g.rotateX(Math.PI / 2); // deitada no eixo Z (aponta pra frente)
      g.center();
      g.scale(...Array(3).fill(size / Math.max(s.x, s.y, s.z)));
      PROPS.set(k, { g, m: D.toonMat(0xffffff, { map: n.material.map }) });
    }
    const p = PROPS.get(k), m = new THREE.Mesh(p.g, p.m);
    D.addOutline(m, 0.012);
    return m;
  },
  // objeto que vive enquanto o tick continuar chamando keep (ex.: escudo do Cavaleiro)
  keep(key, create, update, dispose) {
    const K = (this.f._keep ||= {}), k = (K[key] ||= { o: create(), dispose });
    k.seen = true;
    update?.(k.o, this.dt);
    return k.o;
  },
  ultIntro() { // começo de ULT: círculo, coluna de luz, flash, nome
    const f = this.f, col = this.col;
    D.fx.magicCircle(f, col, (this.ab.windup || 0.4) + 0.3);
    D.fx.pillar(f.pos, col);
    D.fx.groundRing(f.pos, col, 3.5);
    D.fx.burst(this.chest(), col, 18, 5);
    this.flash(0.35, '#' + col.toString(16).padStart(6, '0'));
    D.sfx.guardBreak(this.vol);
    this.pop(this.ab.name + '!');
    this.shake(0.25);
    this.hype(0.5);
  },
};
const _rootGeo = new THREE.TorusGeometry(0.62, 0.07, 6, 28);
export function watch(sim) { // main.loop depois da física: começo/active/fim de cada habilidade + status
  for (const f of [D.player, D.enemy]) {
    const a = f.atk;
    if (a !== f._va) {
      const p = f._va, pab = p && abOf(p.kind);
      f._va = a; f._vph = 'windup';
      if (pab?.fx?.end) pab.fx.end(vctx(f, p, pab, sim), p.phase !== 'done');
      const ab = a && abOf(a.kind);
      if (ab) {
        const v = vctx(f, a, ab, sim);
        if (ab.ult && !ab.fx?.noIntro) v.ultIntro(); else if (ab.slot !== 'a1') v.pop(ab.name + '!');
        ab.fx?.start?.(v);
      }
    }
    const ab = a && abOf(a.kind);
    if (ab && a.phase !== f._vph) { f._vph = a.phase; if (a.phase === 'active') ab.fx?.active?.(vctx(f, a, ab, sim)); }
    if (sim > 0) {
      if (ab) ab.fx?.tick?.(vctx(f, a, ab, sim), sim);
      for (const k in f._keep || {}) { const e = f._keep[k]; if (!e.seen) { e.dispose?.(e.o); delete f._keep[k]; } else e.seen = false; }
      statusFx(f, sim);
    }
  }
}
// visual dos status: anel roxo no pé (preso), bolhas (veneno/fogo), gelo (lento) + nome quando aparece
function statusFx(f, dt) {
  const seen = (f._stSeen ||= {});
  for (const id in f.st) {
    const d = STATUS[id];
    if (!seen[id] && d?.name) D.juice.pop(new THREE.Vector3(f.pos.x, f.pos.y + 2.5, f.pos.z), d.name + '!', 'big', d.color);
    seen[id] = true;
  }
  for (const id in seen) if (!f.st[id]) delete seen[id];
  const v = vctx(f, f.atk, null, dt);
  const ring = f.st.root ? v.keep('st.root', () => { const m = new THREE.Mesh(_rootGeo, new THREE.MeshBasicMaterial({ color: STATUS.root.color })); m.rotation.x = Math.PI / 2; D.scene.add(m); return m; }, null, m => { D.scene.remove(m); m.material.dispose(); }) : null;
  if (ring) ring.position.set(f.pos.x, 0.12 + Math.sin(performance.now() * 0.012) * 0.04, f.pos.z);
  if ((f._bubT = (f._bubT || 0) - dt) > 0) return;
  f._bubT = 0.07;
  const rnd = () => (Math.random() - 0.5) * 0.6, p = () => new THREE.Vector3(f.pos.x + rnd(), f.pos.y + 0.3 + Math.random() * f.height * 0.8, f.pos.z + rnd());
  if (f.st.poison) D.fx.puff(p(), STATUS.poison.color, 0.22 + Math.random() * 0.15, 0.6, new THREE.Vector3(0, 1.2, 0), true);
  if (f.st.burn) D.fx.puff(p(), STATUS.burn.color, 0.3, 0.4, new THREE.Vector3(0, 2, 0), true);
  if (f.st.slow) D.fx.puff(new THREE.Vector3(f.pos.x + rnd(), 0.2, f.pos.z + rnd()), STATUS.slow.color, 0.35, 0.5);
  for (const id in f.st) STATUS[id]?.fx?.(v, dt, f.st[id]); // status de kit
}
export function onEvent(e) { // main.handleEvents, pra cada evento: visual do acerto (2 máquinas) + onHit (só quem lançou)
  const ab = e.kind && abOf(e.kind);
  if (!ab || !['hit', 'block', 'break', 'parry', 'shield', 'status', 'armor'].includes(e.type)) return;
  ab.fx?.hit?.(vctx(e.f, e.f.atk, ab), e);
  if (!e.f.remote) ab.onHit?.(ctx(e.f, e.victim, e.f.atk, ab), e);
}

// ============================== HUD ==============================
// 4 entradas reaproveitadas: { slot, ab, why, cd, cdMax, n, max, cost, meter, active, locked, far }
const HUD = SLOTS.map(slot => ({ slot }));
export function hud(f, foe) {
  const kit = kitOf(f.char), S = slots(f), d = foe && !foe.ko ? hd(f, foe) : Infinity;
  for (const h of HUD) {
    const ab = kit.abilities[h.slot], s = S[h.slot];
    Object.assign(h, { ab, why: canCast(f, h.slot, foe), far: ab.needTarget && d > ab.aimRange, cd: s.n > 0 ? 0 : s.cd, cdMax: ab.cd, n: s.n, max: ab.charges,
      cost: ab.cost, meter: f.meter, active: f.atk?.def === ab, locked: !!ab.locked });
  }
  return HUD;
}
