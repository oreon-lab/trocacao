import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SU from 'three/addons/utils/SkeletonUtils.js';
import { T } from './config.js';
import { toonMat, addOutline } from './toon.js';
import { damp, clamp } from './fighter.js';

// Personagens KayKit Adventurers (Kay Lousberg, CC0) com as animações que já vêm no .glb.
export const CHARACTERS = { Barbarian: 'Bárbaro', Knight: 'Cavaleiro', Rogue: 'Ladina', Mage: 'Mago' };
const GLTFS = {};
export async function loadCharacters() {
  const loader = new GLTFLoader();
  // extra_anims.glb: animações feitas no Blender (tools/fp_anims.py) pro mesmo rig — vale pros 4
  const [extra] = await Promise.all([
    loader.loadAsync('assets/kaykit/extra_anims.glb'),
    ...Object.keys(CHARACTERS).map(async n => (GLTFS[n] = await loader.loadAsync(`assets/kaykit/${n}.glb`))),
  ]);
  for (const gl of Object.values(GLTFS)) gl.animations.push(...extra.animations);
}

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

// ---- quais animações do pacote fazem o quê
const CLIP = {
  idle: 'Idle', guard: 'Unarmed_Idle', run: 'Running_A', back: 'Walking_Backwards',
  left: 'Running_Strafe_Left', right: 'Running_Strafe_Right', air: 'Jump_Idle',
  jabL: 'Unarmed_Melee_Attack_Punch_B', jabR: 'Unarmed_Melee_Attack_Punch_A', heavy: 'Uppercut',
  kick: 'Unarmed_Melee_Attack_Kick', block: 'Block_Guard', blockHit: 'Block_Guard', hit: 'Hit_A', hitHeavy: 'Hit_B',
  ko: 'Death_A', cheer: 'Cheer', dodgeF: 'Dodge_Forward', dodgeB: 'Dodge_Backward', dodgeL: 'Dodge_Left', dodgeR: 'Dodge_Right',
};
const BASE = ['idle', 'guard', 'run', 'back', 'left', 'right', 'air'];               // locomoção (soma 1)
const OVER = ['jabL', 'jabR', 'heavy', 'kick', 'block', 'blockHit', 'hit', 'hitHeavy', 'ko', 'cheer', 'dodgeF', 'dodgeB', 'dodgeL', 'dodgeR'];
const LOOPED = new Set(['block', 'cheer']);
// 1ª pessoa: guarda e socos próprios (mãos enquadradas, socos no centro da mira)
const FP_CLIP = { guard: 'FP_Guard', jabL: 'FP_JabL', jabR: 'FP_CrossR', block: 'FP_Block', blockHit: 'FP_Block' };
// em 1ª pessoa só estes golpes/estados mexem nos braços; o resto fica na guarda (vista de dentro fica caótico)
const FP_OVER = new Set(['jabL', 'jabR', 'heavy', 'block', 'blockHit', 'ko']);
// segundo do clipe em que a mão/pé chega no alcance máximo (medido no .glb / no Blender)
const IMPACT = {
  Unarmed_Melee_Attack_Punch_B: 0.33, Unarmed_Melee_Attack_Punch_A: 0.5, Unarmed_Melee_Attack_Kick: 0.37,
  Uppercut: 13 / 30, FP_JabL: 5 / 30, FP_CrossR: 6 / 30,
};
// velocidade (m/s) em que cada ciclo de corrida não escorrega
const NATURAL = { run: 6, back: 2.4, left: 5.5, right: 5.5 };
const UPPER = /spine|chest|arm|wrist|hand|head/;
const HEIGHT = 1.75;

// metade de cima / de baixo de um clipe (pra socar correndo: braços do soco, pernas da corrida)
const splitCache = new Map();
function half(clip, upper) {
  const key = clip.uuid + upper;
  if (!splitCache.has(key)) {
    const c = clip.clone();
    c.tracks = c.tracks.filter(t => UPPER.test(t.name.split('.')[0]) === upper);
    splitCache.set(key, c);
  }
  return splitCache.get(key);
}

// contorno de malha com esqueleto: infla pela normal antes do skinning
function skinOutline(t) {
  const m = new THREE.MeshBasicMaterial({ color: 0x0f0d17, side: THREE.BackSide });
  m.onBeforeCompile = s => {
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normal * ${t};`);
  };
  return m;
}
const OUTLINE = skinOutline(0.022), OUTLINE_FP = skinOutline(0.006); // 1ª pessoa: braços colados na câmera

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _axis = new THREE.Vector3();
// gira um osso em torno de um eixo do MUNDO (independe dos eixos locais do rig)
function rotateWorld(bone, axis, angle) {
  bone.parent.getWorldQuaternion(_q2);
  _q.setFromAxisAngle(axis, angle);
  bone.quaternion.premultiply(_q2.clone().invert().multiply(_q).multiply(_q2));
}

export class Rig {
  // firstPerson: cópia presa na câmera mostrando só os braços (olhos do boneco = câmera)
  constructor(name, { firstPerson = false } = {}) {
    const gl = GLTFS[name];
    this.name = name;
    this.fp = firstPerson;
    this.root = new THREE.Group();
    this.pivot = new THREE.Group(); // yaw visual, inclinação e squash
    this.root.add(this.pivot);
    const model = SU.clone(gl.scene);
    model.rotation.y = Math.PI; // o modelo olha pra +Z; o jogo usa -Z como frente
    this.pivot.add(model);

    // tira as armas, aplica toon + contorno
    const mats = new Map(), skinned = [], body = [];
    this.mats = [];
    model.traverse(o => {
      if (!o.isMesh) return;
      if (o.isSkinnedMesh) body.push(o); // corpo inteiro (mesmo escondido) define a escala
      if (/handslot/.test(o.parent?.name || '') || (this.fp && !/Arm/.test(o.name))) { o.visible = false; return; }
      if (!mats.has(o.material)) {
        const m = toonMat(0xffffff, { map: o.material.map });
        mats.set(o.material, m);
        this.mats.push(m);
      }
      o.material = mats.get(o.material);
      o.castShadow = !this.fp;
      o.frustumCulled = false;
      if (o.isSkinnedMesh) skinned.push(o);
    });
    for (const o of skinned) {
      const ol = new THREE.SkinnedMesh(o.geometry, this.fp ? OUTLINE_FP : OUTLINE);
      ol.bind(o.skeleton, o.bindMatrix);
      ol.frustumCulled = false;
      o.add(ol);
    }
    const props = [];
    model.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && o.visible && !o.material.isMeshBasicMaterial) props.push(o); });
    for (const o of props) addOutline(o, 0.02); // chapéu, capa, etc.

    // escala pela altura do corpo (sem chapéu/capacete)
    model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const o of body) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); }
    this.scale = HEIGHT / (box.max.y - box.min.y);
    model.scale.setScalar(this.scale);
    this.model = model;
    this.bone = n => model.getObjectByName(n);
    this.chest = this.bone('chest');
    this.head = this.bone('head');
    model.updateMatrixWorld(true);
    this.eyeY = this.head.getWorldPosition(new THREE.Vector3()).y + 0.12; // altura dos olhos

    // animações: base dividida em cima/baixo; golpes inteiros + só a parte de cima
    this.mixer = new THREE.AnimationMixer(model);
    this.clipName = k => (this.fp && FP_CLIP[k]) || CLIP[k];
    const clip = k => gl.animations.find(c => c.name === this.clipName(k));
    const act = (c, once) => {
      // dois estados com o mesmo clipe (ex.: block/blockHit) precisam de ações separadas, senão os pesos se apagam
      const a = this.mixer.clipAction(this.mixer.existingAction(c) ? c.clone() : c);
      if (once) { a.setLoop(THREE.LoopOnce); a.clampWhenFinished = true; }
      a.play();
      a.setEffectiveWeight(0);
      return a;
    };
    this.base = Object.fromEntries(BASE.map(k => [k, { up: act(half(clip(k), true)), lo: act(half(clip(k), false)) }]));
    this.over = Object.fromEntries(OVER.map(k => [k, { full: act(clip(k), !LOOPED.has(k)), up: act(half(clip(k), true), !LOOPED.has(k)), dur: clip(k).duration }]));
    this.bw = Object.fromEntries(BASE.map(k => [k, k === 'idle' ? 1 : 0]));
    this.ow = Object.fromEntries(OVER.map(k => [k, 0]));
    this.ou = Object.fromEntries(OVER.map(k => [k, 0]));

    // brilho na mão quando o golpe está sendo armado (aviso pro outro jogador)
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0, depthWrite: false });
    this.glows = ['handslotl', 'handslotr'].map(n => {
      const g = new THREE.Mesh(new THREE.SphereGeometry(0.2 / this.scale, 16, 12), this.glowMat);
      this.bone(n).add(g);
      return g;
    });

    Object.assign(this, { vyaw: 0, combatT: 0, cur: null, curId: null, lastFlash: 0, lastHp: T.hp, hitN: 0, dashN: 0, prevDashT: 0, blockHitT: 0, hitKey: 'hit', lean: 0, sq: 1 });
  }

  set visible(v) { this.root.visible = v; }

  // dispara um golpe/reação do começo, acelerado pra bater junto com o jogo
  start(key, a) {
    const o = this.over[key];
    let rate = 1, t0 = 0;
    const hit = IMPACT[this.clipName(key)];
    if (a && hit !== undefined) {
      const w = a.def.windup + 0.02;
      rate = key === 'heavy' ? hit / (w + 0.03) : a.kind === 'lunge' ? 2.2 : 1.8;
      t0 = Math.max(0, hit - w * rate);
    } else if (key.startsWith('dodge')) rate = 1.6;
    else if (key.startsWith('hit') || key === 'blockHit') rate = 1.4;
    for (const x of [o.full, o.up]) { x.reset(); x.time = t0; x.timeScale = rate; }
  }

  update(f, dt, foe) {
    const a = f.atk, hs = Math.hypot(f.vel.x, f.vel.z);
    const engaged = !!(a || f.blocking || f.tell || f.stunT > 0 || f.queued);
    this.combatT = engaged ? 1.4 : Math.max(0, this.combatT - dt);
    let combat;
    if (this.fp) {
      // 1ª pessoa: a câmera já posiciona/gira; braços sempre em guarda (senão somem da tela)
      this.vyaw = f.yaw;
      combat = !f.ko;
    } else {
      // começo de round (teletransporte): olha pra onde o lutador olha
      if (!this.lastPos || f.pos.distanceTo(this.lastPos) > 3) this.vyaw = f.yaw;
      (this.lastPos ||= new THREE.Vector3()).copy(f.pos);
      this.root.position.copy(f.pos);
      // modo combate (guarda, encara o alvo) x relaxado (anda pra onde vai)
      combat = this.combatT > 0 && !f.ko;
      let face = this.vyaw;
      if (combat || f.ko || f.dashT > 0) face = f.yaw; // esquivas são relativas à frente
      else if (hs > 0.6) face = Math.atan2(-f.vel.x, -f.vel.z);
      this.vyaw += wrap(face - this.vyaw) * (1 - Math.exp(-(a ? 30 : 12) * dt));
      this.pivot.rotation.y = this.vyaw;
    }
    if (dt <= 0) return;

    // ---- eventos detectados pelo estado: apanhou, defendeu um golpe, deu dash
    if (f.flashT > this.lastFlash + 0.05) { this.hitN++; this.hitKey = f.stunT > 0.45 ? 'hitHeavy' : 'hit'; }
    if (f.blocking && f.hp < this.lastHp) this.blockHitT = 0.3;
    if (f.dashT > this.prevDashT + 0.01) this.dashN++;
    this.lastFlash = f.flashT;
    this.lastHp = f.hp;
    this.prevDashT = f.dashT;
    this.blockHitT -= dt;

    // ---- base: locomoção
    const B = Object.fromEntries(BASE.map(k => [k, 0]));
    if (this.fp) B.guard = 1; // 1ª pessoa: braços sempre na guarda própria, mesmo andando/pulando
    else if (!f.grounded && !f.ko) B.air = 1;
    else {
      const move = clamp(hs / 3, 0, 1);
      if (combat) {
        const s = Math.sin(this.vyaw), c = Math.cos(this.vyaw);
        const lf = -f.vel.x * s - f.vel.z * c, lr = f.vel.x * c - f.vel.z * s;
        const w = { run: Math.max(0, lf), back: Math.max(0, -lf), left: Math.max(0, -lr), right: Math.max(0, lr) };
        const sum = w.run + w.back + w.left + w.right || 1;
        B.guard = 1 - move;
        for (const k in w) B[k] = (move * w[k]) / sum;
      } else {
        B.idle = 1 - move;
        B.run = move;
      }
    }
    for (const k in NATURAL) for (const x of ['up', 'lo']) this.base[k][x].timeScale = clamp(hs / NATURAL[k], 0.5, 2.2);

    // ---- camada de cima: golpe, defesa, esquiva, reação, KO, comemoração
    let key = null, id = null, upper = 0;
    if (f.ko) key = 'ko';
    else if (foe?.ko) key = 'cheer';
    else if (f.stunT > 0) { key = this.hitKey; id = this.hitN; }
    else if (a) {
      key = a.kind === 'heavy' || a.kind === 'super' ? 'heavy' : a.kind === 'sweep' ? 'kick' : a.kind === 'lunge' || a.kind === 'cast' || a.hand === 1 ? 'jabR' : 'jabL';
      id = a;
      upper = f.grounded && hs > 2.5 && a.kind === 'light' ? 1 : 0;
    } else if (f.dashT > 0) {
      const d = f.dashLocal;
      key = Math.abs(d.x) > Math.abs(d.z) ? (d.x < 0 ? 'dodgeL' : 'dodgeR') : d.z < 0 ? 'dodgeB' : 'dodgeF';
      id = this.dashN;
    } else if (f.blocking) { key = this.blockHitT > 0 ? 'blockHit' : 'block'; upper = hs > 1 ? 1 : 0; }
    if (this.fp && key && !FP_OVER.has(key)) key = null;
    if (key && (key !== this.cur || id !== this.curId)) this.start(key, a);
    this.cur = key;
    this.curId = id;

    // ---- pesos suaves (entra rápido, sai um pouco mais devagar)
    let O = 0;
    for (const k of OVER) {
      this.ow[k] = damp(this.ow[k], k === key ? 1 : 0, k === key ? 25 : 12, dt);
      if (k === key) this.ou[k] = damp(this.ou[k], upper, 20, dt);
      O += this.ow[k];
    }
    const ns = O > 1 ? 1 / O : 1;
    let F = 0, U = 0;
    for (const k of OVER) { this.ow[k] *= ns; F += this.ow[k] * (1 - this.ou[k]); U += this.ow[k] * this.ou[k]; }
    let bs = 0;
    for (const k of BASE) bs += (this.bw[k] = damp(this.bw[k], B[k], 10, dt));
    for (const k of BASE) {
      const w = this.bw[k] / (bs || 1);
      this.base[k].lo.setEffectiveWeight(w * (1 - F));
      this.base[k].up.setEffectiveWeight(w * Math.max(0, 1 - F - U));
    }
    for (const k of OVER) {
      this.over[k].full.setEffectiveWeight(this.ow[k] * (1 - this.ou[k]));
      this.over[k].up.setEffectiveWeight(this.ow[k] * this.ou[k]);
    }
    this.mixer.update(dt);

    // ---- ajustes por cima da animação
    // olhar pra cima/baixo junto com a mira (em combate; na 1ª pessoa a câmera já faz isso)
    if (combat && !f.ko && !this.fp) {
      this.model.updateMatrixWorld(true);
      _axis.set(Math.cos(this.vyaw), 0, -Math.sin(this.vyaw));
      rotateWorld(this.chest, _axis, f.pitch * 0.3);
      rotateWorld(this.head, _axis, f.pitch * 0.3);
    }
    // agachar/slide: o personagem é cartoon, então ele "amassa" + inclina
    const cr = f.sliding ? 1 : clamp((T.standHeight - f.height) / (T.standHeight - T.crouchHeight), 0, 1);
    this.sq = damp(this.sq, 1 - 0.3 * cr, 18, dt);
    this.lean = damp(this.lean, f.sliding ? 0.45 : 0, 14, dt);
    if (!this.fp) {
      this.pivot.scale.set(1 / Math.sqrt(this.sq), this.sq, 1 / Math.sqrt(this.sq));
      this.pivot.rotation.x = this.lean;
    }

    // flash ao apanhar; brilho na mão que vai bater
    const fl = f.flashT > 0 ? 0.6 : 0;
    for (const m of this.mats) m.emissive.setRGB(fl, fl, fl);
    const tell = !a && f.tell ? f.tell : null;
    const tk = a ? a.kind : tell?.kind;
    const hand = a ? a.hand : tk === 'light' ? f.hand ^ 1 : 1;
    const charging = !!tell || (a && a.phase === 'windup' && a.kind !== 'sweep');
    this.glowMat.color.set(tk === 'super' ? 0xb06bff : tk === 'heavy' ? 0xff4b3e : tk === 'cast' ? 0x7fd8ff : 0xffd23f);
    this.glowMat.opacity = damp(this.glowMat.opacity, charging ? 0.5 + 0.25 * Math.sin(performance.now() * 0.04) : 0, 30, dt);
    this.glows.forEach((g, i) => (g.visible = this.glowMat.opacity > 0.02 && i === hand));
  }
}
