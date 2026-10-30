import * as THREE from 'three';
import { T, ATTACKS } from '../config.js';
import { Rig, charClip } from '../rig.js';

// Tudo que as habilidades soltam na arena (era src/powers.js + o meteoro do main). Quem lançou simula e decide o acerto;
// o outro lado recebe {t:'ab', a, k, p} e cria uma cópia SÓ VISUAL com o mesmo spec (por isso spawns são estáticos no kit
// e params são JSON simples: Vector3 vira {x,y,z}).
//
// SpawnDef (em ab.spawns.chave). Todo tipo aceita: hit ('chave' de ab.hits), make(v,o) -> Object3D (entra e sai da cena sozinho),
// start(v,o) (uma vez, nas 2 máquinas), dispose(o).
//  projectile: speed (20), range (18) | life, radius (.25), gravity, homing (rad/s), pierce, trail(v,o,dt), impact(v,o,'hit'|'wall'|'end')
//              params { from:{x,y,z}, dir:[x,z] | dirs:[[x,z],...], delays:[s,...] }   leque = um acerto só (o 1º que pega)
//  zone:       radius (2), delay (aviso enchendo antes de bater), maxY (2.5: pulou alto escapa), linger (s de visual depois),
//              update(v,o,dt,k) (k 0..1 no aviso, >1 depois), burst(v,o,pegou)        params { at:{x,z} }
//  summon:     char, scale (.6), count (1), spacing (1.4), rise (.6), life (4.5), speed (6.5), turn (4.5), touch (.55), breakable (true),
//              cap (máx. vivos do mesmo spawn), clips { spawn, move }                    params { at:{x,z}, yaw }
export function createWorld(D) {
  const list = [];
  const foeOf = f => (f === D.player ? D.enemy : D.player);
  const v3 = o => new THREE.Vector3(o.x, o.y || 0, o.z);
  const solid = p => (D.arena.solidAt ? D.arena.solidAt(p) : Math.hypot(p.x, p.z) > D.arena.R + 0.2 || D.arena.pillars.some(pl => Math.hypot(p.x - pl.x, p.z - pl.z) < pl.r));
  const inCapsule = (t, p, r) => Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < T.radius + r && p.y > t.pos.y - 0.1 && p.y < t.pos.y + t.height + 0.1;
  const hint = (t, left) => { if (left >= 0 && left < T.perfectWindow) t.incoming = Math.max(t.incoming, left, 0.01); }; // janela da esquiva perfeita
  const _src = new THREE.Vector3();

  function spawn(owner, ab, key, p = {}, visual = false) {
    const spec = ab.spawns?.[key];
    if (!spec) return console.warn('[habilidade] spawn não existe:', ab.id, key), [];
    if (!visual) D.send({ t: 'ab', a: ab.id, k: key, p });
    const v = D.vctx(owner, null, ab), group = { hit: false }, objs = TYPES[spec.type].create(owner, spec, p);
    for (const o of objs) {
      Object.assign(o, { owner, ab, spec, key, kind: `${ab.id}.${spec.hit}`, target: foeOf(owner), visual, t: 0, group });
      o.obj ||= spec.make?.(v, o) || null;
      if (o.obj) { if (o.pos) o.obj.position.copy(o.pos); D.scene.add(o.obj); }
      spec.start?.(v, o);
      list.push(o);
    }
    if (spec.cap) { // limite de vivos: o mais velho desmonta
      const mine = list.filter(o => o.owner === owner && o.spec === spec);
      for (let i = 0; i < mine.length - spec.cap; i++) { mine[i].dead = true; TYPES[spec.type].kill?.(mine[i], v); }
    }
    return objs;
  }

  const TYPES = {
    projectile: {
      create(owner, s, p) {
        const from = v3(p.from || { x: owner.pos.x, y: owner.pos.y + 1.1, z: owner.pos.z }), sp = s.speed || 20;
        return (p.dirs || [p.dir || [-Math.sin(owner.yaw), -Math.cos(owner.yaw)]]).map(([x, z], i) => ({
          pos: from.clone(), vel: new THREE.Vector3(x, 0, z).normalize().multiplyScalar(sp), life: s.life ?? (s.range || 18) / sp, delay: p.delays?.[i] || 0,
        }));
      },
      update(o, dt, v) {
        if ((o.delay -= dt) > 0) { if (o.obj) o.obj.visible = false; return true; }
        const s = o.spec, t = o.target;
        if (o.obj) o.obj.visible = true;
        if (s.homing && !t.ko) { // vira devagar pro alvo
          const want = Math.atan2(t.pos.x - o.pos.x, t.pos.z - o.pos.z), cur = Math.atan2(o.vel.x, o.vel.z), sp = Math.hypot(o.vel.x, o.vel.z);
          const a = cur + Math.max(-s.homing * dt, Math.min(s.homing * dt, Math.atan2(Math.sin(want - cur), Math.cos(want - cur))));
          o.vel.x = Math.sin(a) * sp; o.vel.z = Math.cos(a) * sp;
        }
        o.vel.y -= (s.gravity || 0) * dt;
        o.pos.addScaledVector(o.vel, dt);
        if (o.obj) { o.obj.position.copy(o.pos); o.obj.lookAt(o.pos.x + o.vel.x, o.pos.y + o.vel.y, o.pos.z + o.vel.z); }
        s.trail?.(v, o, dt);
        if (solid(o.pos) || o.pos.y < 0) { s.impact?.(v, o, 'wall'); return false; } // crava no pilar/parede
        const sp = Math.hypot(o.vel.x, o.vel.z) || 1, rx = t.pos.x - o.pos.x, rz = t.pos.z - o.pos.z, along = (rx * o.vel.x + rz * o.vel.z) / sp;
        if (along > 0 && Math.sqrt(Math.max(0, rx * rx + rz * rz - along * along)) < 0.8) hint(t, along / sp);
        if (!t.ko && !t.invuln && inCapsule(t, o.pos, s.radius || 0.25)) {
          if (!o.visual && !o.group.hit) {
            o.group.hit = true;
            D.deal(o.owner, t, o.kind, o.pos, { src: _src.copy(o.pos).addScaledVector(o.vel, -0.05), dir: [o.vel.x / sp, o.vel.z / sp], melee: false, mark: false });
          }
          s.impact?.(v, o, 'hit');
          if (!s.pierce) return false;
        }
        if ((o.life -= dt) <= 0) { s.impact?.(v, o, 'end'); return false; }
        return true;
      },
    },
    zone: {
      create: (owner, s, p) => [{ at: v3(p.at || owner.pos).setY(0), fired: false, caught: false }],
      update(o, dt, v) {
        const s = o.spec, t = o.target, delay = s.delay || 0;
        o.t += dt;
        if (o.fired) { s.update?.(v, o, dt, 1 + (o.t - delay) / (s.linger || 1)); return o.t < delay + (s.linger || 0); }
        const inside = !t.ko && Math.hypot(t.pos.x - o.at.x, t.pos.z - o.at.z) < (s.radius || 2) + T.radius && t.pos.y < (s.maxY ?? 2.5);
        if (inside) { t.danger = o.at; t.dangerKind = o.kind; hint(t, delay - o.t); } else if (t.danger === o.at) t.danger = null; // aviso + o bot foge
        s.update?.(v, o, dt, delay ? Math.min(1, o.t / delay) : 1);
        if (o.t < delay) return true;
        o.fired = true;
        if (t.danger === o.at) t.danger = null;
        o.caught = inside && !t.invuln;
        if (o.caught && !o.visual) D.deal(o.owner, t, o.kind, new THREE.Vector3(t.pos.x, t.pos.y + 1, t.pos.z), { src: o.at, melee: false, mark: false });
        s.burst?.(v, o, o.caught);
        return o.t < delay + (s.linger || 0);
      },
    },
    summon: {
      // Rig KayKit de verdade: sobe do chão, corre atrás do alvo (vira devagar: dá pra driblar), explode ao encostar; um soco quebra
      create(owner, s, p) {
        const yaw = p.yaw ?? owner.yaw, base = v3(p.at || owner.pos), n = s.count || 1, sp = s.spacing ?? 1.4;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), out = [];
        for (let i = 0; i < n; i++) {
          const side = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
          const pos = new THREE.Vector3(base.x + rx * side * sp + fx * 0.6, 0, base.z + rz * side * sp + fz * 0.6);
          const rig = new Rig(s.char, { lite: true });
          rig.root.scale.setScalar(s.scale || 0.6);
          rig.root.position.copy(pos);
          rig.pivot.rotation.y = yaw;
          const mixer = new THREE.AnimationMixer(rig.model), clip = n => charClip(s.char, n);
          const riseClip = clip(s.clips?.spawn || 'Spawn_Ground_Skeletons'), moveClip = clip(s.clips?.move || 'Running_C');
          let rise = null;
          if (riseClip) { rise = mixer.clipAction(riseClip); rise.setLoop(THREE.LoopOnce); rise.clampWhenFinished = true; rise.timeScale = riseClip.duration / (s.rise || 0.6); rise.play(); }
          const run = moveClip ? mixer.clipAction(moveClip) : null;
          if (run) run.timeScale = 1.4;
          out.push({ obj: rig.root, rig, mixer, rise, run, pos, yaw });
        }
        return out;
      },
      kill(o, v, text) {
        if (o.crumbled) return;
        o.crumbled = true;
        v.fx.rocks(o.pos.clone().setY(0.5), 8, 4, 0xf2ead2, 0.13, 6);
        v.fx.burst(o.pos.clone().setY(0.6), v.col, 8, 5, 0.08);
        v.sfx.guardBreak(0.5 * v.vol);
        if (text) v.pop(text, 'small', o.pos.clone().setY(1.4));
      },
      update(o, dt, v) {
        const s = o.spec, t = o.target, kill = TYPES.summon.kill;
        o.t += dt;
        o.mixer.update(dt);
        if (o.dead || o.t > (s.life || 4.5) || o.owner.ko) { kill(o, v); return false; }
        if (o.t < (s.rise || 0.6)) return true;
        if (!o.running && o.run) { o.running = true; o.run.reset().play(); if (o.rise) o.run.crossFadeFrom(o.rise, 0.15, false); }
        const dx = t.pos.x - o.pos.x, dz = t.pos.z - o.pos.z, d = Math.hypot(dx, dz), sp = s.speed || 6.5, tr = (s.turn || 4.5) * dt;
        const want = Math.atan2(-dx, -dz);
        o.yaw += Math.max(-tr, Math.min(tr, Math.atan2(Math.sin(want - o.yaw), Math.cos(want - o.yaw))));
        o.pos.x += -Math.sin(o.yaw) * sp * dt;
        o.pos.z += -Math.cos(o.yaw) * sp * dt;
        const r = Math.hypot(o.pos.x, o.pos.z), lim = D.arena.R - 0.4;
        if (r > lim) { o.pos.x *= lim / r; o.pos.z *= lim / r; }
        o.rig.root.position.copy(o.pos);
        o.rig.pivot.rotation.y = o.yaw;
        const a = t.atk; // o alvo quebra o esqueleto com qualquer golpe corpo a corpo de frente
        if (s.breakable !== false && a && a.phase === 'active' && a.def.range && d < 2.4 && (dx * Math.sin(t.yaw) + dz * Math.cos(t.yaw)) / (d || 1) > 0.2) {
          kill(o, v, 'CRACK!');
          if (!t.remote) t.gain(T.gainMinion);
          return false;
        }
        const touch = T.radius + (s.touch || 0.55);
        if (d < touch && t.pos.y < 1.2 && !t.ko) { // encostou: explode
          const p = new THREE.Vector3(o.pos.x, 0.7, o.pos.z);
          if (!o.visual) D.deal(o.owner, t, o.kind, p, { src: p, melee: false, mark: false });
          v.fx.explode(p, v.col, false);
          kill(o, v);
          return false;
        }
        if (d < 2.5) hint(t, Math.max(0.01, (d - touch) / sp));
        return true;
      },
    },
  };

  function dispose(o) { if (o.obj) D.scene.remove(o.obj); o.spec.dispose?.(o); }
  return {
    spawn,
    remote(owner, m) { const ab = ATTACKS[m.a]; if (!ab?.slot) return; if (m.k) spawn(owner, ab, m.k, m.p, true); else ab.onRemote?.(D.vctx(owner, null, ab), m.x); },
    update(dt) {
      if (dt <= 0) return;
      for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i];
        if (!TYPES[o.spec.type].update(o, dt, D.vctx(o.owner, null, o.ab, dt))) { dispose(o); list.splice(i, 1); }
      }
    },
    clear() { list.forEach(dispose); list.length = 0; D.player.danger = D.enemy.danger = null; },
  };
}
