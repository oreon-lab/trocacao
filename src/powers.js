import * as THREE from 'three';
import { T, ATTACKS } from './config.js';
import { Rig, charNode, charClip } from './rig.js';
import { toonMat, addOutline } from './toon.js';

// Coisas que as habilidades soltam na arena: adagas (Encapuzada), Prisão de Ossos (Necromante) e os mini-esqueletos
// (Lacaio); mais o visual de quem está preso ou envenenado. Quem lançou decide o acerto (online: manda 'hit' pro outro
// resolver, igual ao meteoro); a cópia de quem recebe pelo online é só visual.
export function createPowers({ scene, fx, sfx, player, enemy, events, send, pop, theme, vol, arena }) {
  const list = [];
  const foeOf = f => (f === player ? enemy : player);
  const UP = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();

  function strike(owner, target, kind, point) {
    if (target.ko || target.invuln) return false;
    if (target.remote) { send({ t: 'hit', kind, pos: point.toArray() }); return true; }
    const def = ATTACKS[kind];
    const res = target.receive({ pos: point.clone(), vel: new THREE.Vector3(), stunT: 0, atk: null }, def);
    events.push({ type: res, f: owner, victim: target, kind, point: point.clone(), dmg: def.dmg });
    owner.gain(res === 'hit' ? 6 : 2);
    return true;
  }

  // ---- peças (feitas uma vez, depois de carregar os personagens)
  let knife = null, boneGeo = null, boneMat = null;
  function parts() {
    if (knife) return;
    const n = charNode('Rogue_Hooded', 'Knife'); // a faca de verdade do modelo
    const g = n.geometry.clone(), box = new THREE.Box3().setFromBufferAttribute(g.attributes.position), s = box.getSize(tmp);
    if (s.y >= s.x && s.y >= s.z) g.rotateX(Math.PI / 2); // lâmina deitada no eixo Z (vai girando pra frente)
    g.center();
    g.scale(...Array(3).fill(0.85 / Math.max(s.x, s.y, s.z)));
    knife = { geo: g, mat: toonMat(0xffffff, { map: n.material.map }) };
    boneGeo = new THREE.ConeGeometry(0.13, 1, 6).translate(0, 0.5, 0);
    boneMat = toonMat(0xf2ead2);
  }

  // ===== LEQUE DE ADAGAS: 3 facas em leque, girando, na direção do alvo (mira automática) ou da mira
  function daggers(owner, m) {
    const H = ATTACKS.daggerHit, target = foeOf(owner);
    const from = m?.p ? new THREE.Vector3(...m.p) : new THREE.Vector3(owner.pos.x, owner.pos.y + 1.1, owner.pos.z);
    let dirs = m?.d;
    if (!dirs) {
      const aim = owner.atk?.aim;
      const yaw = aim ? Math.atan2(-(aim.pos.x - owner.pos.x), -(aim.pos.z - owner.pos.z)) : owner.yaw;
      dirs = [-1, 0, 1].map(k => [-Math.sin(yaw + k * H.spread), -Math.cos(yaw + k * H.spread)]);
      send({ t: 'fire', k: 'daggers', p: from.toArray(), d: dirs });
    }
    dirs.forEach(([dx, dz], i) => {
      const g = new THREE.Group(), mesh = new THREE.Mesh(knife.geo, knife.mat);
      addOutline(mesh, 0.012);
      g.add(mesh);
      g.position.copy(from);
      g.lookAt(from.x + dx, from.y, from.z + dz);
      scene.add(g);
      list.push({ type: 'dagger', owner, target, g, mesh, vel: new THREE.Vector3(dx, 0, dz).multiplyScalar(H.speed), life: H.range / H.speed, visual: !!m, trailT: 0, delay: i === 1 ? 0 : 0.04 });
    });
    sfx.swing(false, vol(owner));
  }
  function updateDagger(o, dt) {
    if ((o.delay -= dt) > 0) return true;
    o.life -= dt;
    o.g.position.addScaledVector(o.vel, dt);
    o.mesh.rotation.x -= dt * 26; // girando
    if ((o.trailT -= dt) <= 0) { o.trailT = 0.02; fx.puff(o.g.position.clone(), theme(o.owner), 0.28, 0.18); }
    const p = o.g.position, t = o.target;
    // pilar ou parede: crava e cai
    const hitWall = Math.hypot(p.x, p.z) > arena.R + 0.2 || arena.pillars.some(pl => Math.hypot(p.x - pl.x, p.z - pl.z) < pl.r);
    if (hitWall) { fx.burst(p, 0xdddddd, 5, 4, 0.05); sfx.block(0.5 * vol(o.owner)); return false; }
    // janela da esquiva perfeita: quanto falta pra chegar
    const rel = tmp.set(t.pos.x - p.x, 0, t.pos.z - p.z), along = rel.dot(o.vel) / ATTACKS.daggerHit.speed;
    if (along > 0) {
      const side = Math.sqrt(Math.max(0, rel.lengthSq() - along * along)), left = along / ATTACKS.daggerHit.speed;
      if (side < 0.8 && left < T.perfectWindow) t.incoming = Math.max(t.incoming, left);
    }
    // acertou a cápsula do alvo
    if (Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < T.radius + 0.25 && p.y > t.pos.y - 0.1 && p.y < t.pos.y + t.height + 0.1 && !t.invuln && !t.ko) {
      if (!o.visual) strike(o.owner, t, 'daggerHit', p);
      fx.burst(p, 0xffffff, 6, 5, 0.06);
      return false;
    }
    return o.life > 0;
  }

  // ===== PRISÃO DE OSSOS: círculo enche (tempo pra fugir); espetos de osso sobem; quem estava dentro fica preso
  function cage(owner, m) {
    const H = ATTACKS.cageHit, target = foeOf(owner);
    let c;
    if (m?.p) c = new THREE.Vector3(...m.p);
    else {
      const aim = owner.atk?.aim;
      c = aim ? new THREE.Vector3(aim.pos.x + aim.vel.x * 0.2, 0, aim.pos.z + aim.vel.z * 0.2) : owner.forward(new THREE.Vector3()).multiplyScalar(8).add(owner.pos).setY(0);
      const r = Math.hypot(c.x, c.z), lim = arena.R - 1;
      if (r > lim) c.multiplyScalar(lim / r);
      send({ t: 'fire', k: 'cage', p: c.toArray() });
    }
    const col = theme(owner);
    const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide });
    const fillMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(H.radius - 0.28, H.radius, 48), ringMat);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(H.radius, 48), fillMat);
    for (const o of [ring, fill]) { o.rotation.x = -Math.PI / 2; o.position.set(c.x, 0.05, c.z); o.renderOrder = 2; scene.add(o); }
    fill.scale.setScalar(0.01);
    // espetos: inclinados pra dentro, formando a gaiola
    const spikes = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2, s = new THREE.Mesh(boneGeo, boneMat);
      addOutline(s, 0.06);
      s.position.set(c.x + Math.cos(a) * 1.75, 0, c.z + Math.sin(a) * 1.75);
      s.quaternion.setFromUnitVectors(UP, tmp.set(-Math.cos(a) * 0.42, 1, -Math.sin(a) * 0.42).normalize());
      s.userData.h = 1.6 + (i % 3) * 0.25;
      s.scale.set(1, 0.001, 1);
      s.visible = false;
      scene.add(s);
      spikes.push(s);
    }
    list.push({ type: 'cage', owner, target, c, ring, fill, spikes, t: 0, sprung: false, visual: !!m });
    sfx.chime(vol(owner));
  }
  function updateCage(o, dt) {
    const H = ATTACKS.cageHit, t = o.target;
    o.t += dt;
    const inside = Math.hypot(t.pos.x - o.c.x, t.pos.z - o.c.z) < H.radius + T.radius && t.pos.y < 1.6;
    if (!o.sprung) {
      const k = o.t / H.delay;
      o.fill.scale.setScalar(Math.max(0.01, k)); // círculo enchendo = o tempo que você tem pra sair
      o.ring.material.opacity = 0.8 + 0.2 * Math.sin(o.t * 30);
      if (inside) t.danger = o.c; else if (t.danger === o.c) t.danger = null; // aviso na tela + o bot foge
      if (inside && H.delay - o.t < T.perfectWindow) t.incoming = Math.max(t.incoming, H.delay - o.t);
      if (o.t >= H.delay) {
        o.sprung = true;
        o.caught = inside && !t.invuln && !t.ko;
        if (o.caught && !o.visual) strike(o.owner, t, 'cageHit', new THREE.Vector3(t.pos.x, t.pos.y + 1, t.pos.z));
        o.spikes.forEach(s => (s.visible = true));
        fx.burst(o.c.clone().setY(0.3), 0xf2ead2, 14, 6, 0.1);
        fx.groundRing(o.c, theme(o.owner), H.radius * 1.4, 0.4);
        sfx.boom(0.55 * vol(o.owner)); sfx.guardBreak(0.4 * vol(o.owner));
        if (t.danger === o.c) t.danger = null;
      }
      return true;
    }
    const st = o.t - H.delay, stay = o.caught ? H.root : 0.45;
    o.spikes.forEach((s, i) => {
      const y = st < 0.08 ? st / 0.08 * 1.15 : st < 0.14 ? 1.15 - (st - 0.08) / 0.06 * 0.15 : st < stay ? 1 : Math.max(0, 1 - (st - stay) / 0.3);
      s.scale.set(1, Math.max(0.001, s.userData.h * y), 1);
    });
    o.ring.material.opacity = o.fill.material.opacity = Math.max(0, 0.7 * (1 - st / (stay + 0.3)));
    if (st > stay + 0.3) { [o.ring, o.fill, ...o.spikes].forEach(x => scene.remove(x)); o.ring.material.dispose(); o.fill.material.dispose(); return false; }
    return true;
  }

  // ===== EXÉRCITO DE OSSOS: 2 mini-Lacaios saem do chão e correm atrás do oponente; explodem ao encostar
  function summon(owner, m) {
    const H = ATTACKS.minionHit, target = foeOf(owner);
    const yaw = m?.y ?? owner.yaw, base = m?.p ? new THREE.Vector3(...m.p) : owner.pos.clone();
    if (!m) send({ t: 'fire', k: 'summon', p: base.toArray(), y: yaw });
    const fx_ = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (const side of [-1, 1]) {
      const rig = new Rig('Skeleton_Minion');
      rig.root.scale.setScalar(0.6);
      const pos = new THREE.Vector3(base.x + rx * side * 1.4 + fx_ * 0.6, 0, base.z + rz * side * 1.4 + fz * 0.6);
      rig.root.position.copy(pos);
      rig.pivot.rotation.y = yaw;
      const mixer = new THREE.AnimationMixer(rig.model);
      const rise = mixer.clipAction(charClip('Skeleton_Minion', 'Spawn_Ground_Skeletons'));
      rise.setLoop(THREE.LoopOnce); rise.clampWhenFinished = true;
      rise.timeScale = (rise.getClip().duration) / H.rise;
      rise.play();
      const run = mixer.clipAction(charClip('Skeleton_Minion', 'Running_C'));
      run.timeScale = 1.4;
      scene.add(rig.root);
      fx.burst(pos.clone().setY(0.2), 0x8a6a50, 8, 3, 0.1);
      fx.groundRing(pos, theme(owner), 1.2, 0.35);
      list.push({ type: 'minion', owner, target, rig, mixer, run, pos, yaw, t: 0, visual: !!m });
    }
    sfx.boom(0.35 * vol(owner));
  }
  function crumble(o, text) {
    fx.rocks(o.pos.clone().setY(0.5), 8, 4, 0xf2ead2, 0.13, 6);
    fx.burst(o.pos.clone().setY(0.6), theme(o.owner), 8, 5, 0.08);
    sfx.guardBreak(0.5 * vol(o.owner));
    if (text) pop(o.pos.clone().setY(1.4), text);
    scene.remove(o.rig.root);
  }
  function updateMinion(o, dt) {
    const H = ATTACKS.minionHit, t = o.target;
    o.t += dt;
    o.mixer.update(dt);
    if (o.t > H.life || o.owner.ko) { crumble(o); return false; }
    if (o.t < H.rise) return true;
    if (!o.running) { o.running = true; o.run.reset().play(); o.run.crossFadeFrom(o.mixer.existingAction(charClip('Skeleton_Minion', 'Spawn_Ground_Skeletons')), 0.15, false); }
    // corre atrás do alvo (vira devagar: dá pra driblar)
    const dx = t.pos.x - o.pos.x, dz = t.pos.z - o.pos.z, d = Math.hypot(dx, dz);
    const want = Math.atan2(-dx, -dz), dy = Math.atan2(Math.sin(want - o.yaw), Math.cos(want - o.yaw));
    o.yaw += Math.max(-4.5 * dt, Math.min(4.5 * dt, dy));
    o.pos.x += -Math.sin(o.yaw) * H.speed * dt;
    o.pos.z += -Math.cos(o.yaw) * H.speed * dt;
    const r = Math.hypot(o.pos.x, o.pos.z), lim = arena.R - 0.4;
    if (r > lim) { o.pos.x *= lim / r; o.pos.z *= lim / r; }
    o.rig.root.position.copy(o.pos);
    o.rig.pivot.rotation.y = o.yaw;
    // o alvo pode quebrar o esqueleto com um golpe
    const a = t.atk;
    if (a && a.phase === 'active' && !a.def.ranged && d < 2.4 && (dx * Math.sin(t.yaw) + dz * Math.cos(t.yaw)) / (d || 1) > 0.2) {
      crumble(o, 'CRACK!');
      if (!t.remote) t.gain(4);
      return false;
    }
    // encostou: explode em ossos
    if (d < T.radius + 0.55 && t.pos.y < 1.2 && !t.ko) {
      if (!o.visual) strike(o.owner, t, 'minionHit', new THREE.Vector3(o.pos.x, 0.7, o.pos.z));
      fx.explode(new THREE.Vector3(o.pos.x, 0.7, o.pos.z), theme(o.owner), false);
      crumble(o);
      return false;
    }
    if (d < 2.5 && 0.12 > (d - T.radius - 0.55) / H.speed) t.incoming = Math.max(t.incoming, Math.max(0.01, (d - T.radius - 0.55) / H.speed));
    return true;
  }

  // ===== visual contínuo: preso (anel roxo no pé) e envenenado (bolhas verdes subindo)
  const roots = new Map();
  let bubbleT = 0;
  function statusFx(dt) {
    bubbleT -= dt;
    for (const f of [player, enemy]) {
      let r = roots.get(f);
      if (f.rootT > 0) {
        if (!r) {
          r = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 28), new THREE.MeshBasicMaterial({ color: 0xb46bff }));
          r.rotation.x = Math.PI / 2;
          scene.add(r);
          roots.set(f, r);
        }
        r.position.set(f.pos.x, 0.12 + Math.sin(performance.now() * 0.012) * 0.04, f.pos.z);
      } else if (r) { scene.remove(r); roots.delete(f); }
      if (f.poisonT > 0 && bubbleT <= 0) {
        const p = new THREE.Vector3(f.pos.x + (Math.random() - 0.5) * 0.6, f.pos.y + 0.3 + Math.random() * f.height * 0.8, f.pos.z + (Math.random() - 0.5) * 0.6);
        fx.puff(p, 0x7dff4a, 0.22 + Math.random() * 0.15, 0.6, new THREE.Vector3(0, 1.2, 0), true);
      }
    }
    if (bubbleT <= 0) bubbleT = 0.07;
  }

  const CAST = { daggers, cage, summon };
  return {
    // habilidade de longe que acabou de sair (evento 'fire') ou que chegou pelo online (m)
    cast(kind, owner, m) { parts(); CAST[kind]?.(owner, m); },
    has: kind => !!CAST[kind],
    update(dt) {
      if (dt > 0) for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i];
        const alive = o.type === 'dagger' ? updateDagger(o, dt) : o.type === 'cage' ? updateCage(o, dt) : updateMinion(o, dt);
        if (!alive) { if (o.type === 'dagger') scene.remove(o.g); list.splice(i, 1); }
      }
      statusFx(dt);
    },
    clear() {
      for (const o of list) {
        if (o.type === 'dagger') scene.remove(o.g);
        else if (o.type === 'cage') [o.ring, o.fill, ...o.spikes].forEach(x => scene.remove(x));
        else scene.remove(o.rig.root);
      }
      list.length = 0;
      for (const r of roots.values()) scene.remove(r);
      roots.clear();
    },
  };
}
