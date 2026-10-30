// Necromante (CONTROLADOR). Formato: veja src/abilities/index.js.
let BONE = null; // espeto de osso (criado uma vez)
const bone = v => (BONE ||= { geo: new v.THREE.ConeGeometry(0.13, 1, 6).translate(0, 0.5, 0), mat: v.toon(0xf2ead2) });

export default {
  color: 0xb46bff,
  abilities: {
    // a1 / a3 / ult: TODO (ESPINHOS, LÁPIDES, DRENAR ALMA no roster)
    a2: {
      name: 'PRISÃO DE OSSOS', glyph: '⛓', desc: 'Círculo enche no chão: quem ficar dentro quando os ossos sobem fica PRESO.',
      cd: 11, aimRange: 16, dashCancel: true,
      windup: 0.38, active: 0.05, recovery: 0.21, moveMul: 0.4,
      hits: { hit: { dmg: 8, knock: 0, up: 0, stun: 0.25, zone: true, status: [['root', 1.6]], statusOnBlock: true, warn: ['#b46bff', 'PRISÃO! SAIA!'] } },
      spawns: {
        cage: {
          type: 'zone', hit: 'hit', radius: 2.1, delay: 0.6, maxY: 1.6, linger: 1.9,
          make(v, o) { // círculo enchendo (o tempo pra fugir) + 11 espetos inclinados pra dentro (a gaiola)
            const T3 = v.THREE, g = new T3.Group(), R = o.spec.radius, b = bone(v), up = new T3.Vector3(0, 1, 0);
            g.position.set(o.at.x, 0, o.at.z);
            o.ring = new T3.Mesh(new T3.RingGeometry(R - 0.28, R, 48), new T3.MeshBasicMaterial({ color: v.col, transparent: true, depthWrite: false, side: T3.DoubleSide }));
            o.fill = new T3.Mesh(new T3.CircleGeometry(R, 48), new T3.MeshBasicMaterial({ color: v.col, transparent: true, opacity: 0.45, depthWrite: false, side: T3.DoubleSide }));
            for (const m of [o.ring, o.fill]) { m.rotation.x = -Math.PI / 2; m.position.y = 0.05; m.renderOrder = 2; g.add(m); }
            o.fill.scale.setScalar(0.01);
            o.spikes = [];
            for (let i = 0; i < 11; i++) {
              const a = (i / 11) * Math.PI * 2, s = v.outline(new T3.Mesh(b.geo, b.mat), 0.06);
              s.position.set(Math.cos(a) * 1.75, 0, Math.sin(a) * 1.75);
              s.quaternion.setFromUnitVectors(up, new T3.Vector3(-Math.cos(a) * 0.42, 1, -Math.sin(a) * 0.42).normalize());
              s.userData.h = 1.6 + (i % 3) * 0.25;
              s.scale.set(1, 0.001, 1);
              s.visible = false;
              g.add(s);
              o.spikes.push(s);
            }
            return g;
          },
          start(v) { v.sfx.chime(v.vol); },
          update(v, o, dt, k) {
            if (k <= 1) { o.fill.scale.setScalar(Math.max(0.01, k)); o.ring.material.opacity = 0.8 + 0.2 * Math.sin(o.t * 30); return; }
            const st = o.t - o.spec.delay, stay = o.caught ? 1.6 : 0.45;
            for (const s of o.spikes) {
              const y = st < 0.08 ? st / 0.08 * 1.15 : st < 0.14 ? 1.15 - (st - 0.08) / 0.06 * 0.15 : st < stay ? 1 : Math.max(0, 1 - (st - stay) / 0.3);
              s.scale.set(1, Math.max(0.001, s.userData.h * y), 1);
            }
            o.ring.material.opacity = o.fill.material.opacity = Math.max(0, 0.7 * (1 - st / (stay + 0.3)));
          },
          burst(v, o) {
            o.spikes.forEach(s => (s.visible = true));
            v.fx.burst(o.at.clone().setY(0.3), 0xf2ead2, 14, 6, 0.1);
            v.fx.groundRing(o.at, v.col, o.spec.radius * 1.4, 0.4);
            v.sfx.boom(0.55 * v.vol); v.sfx.guardBreak(0.4 * v.vol);
          },
          dispose(o) { for (const m of [o.ring, o.fill]) { m.geometry.dispose(); m.material.dispose(); } },
        },
      },
      warn: ['#b46bff', 'PRISÃO!'],
      bot: { range: [2.5, 14], use: 'zone', after: 'rush' },
      anim: { clip: 'Spellcast_Raise', impact: 0.5 },
      onActive(c) { c.zone('cage', { at: c.aimPoint(16, 0.2) }); },
      fx: {
        start(v) { v.fx.magicCircle(v.f, v.col, v.ab.windup + 0.3); v.fx.groundRing(v.f.pos, v.col, 1.6, 0.4); v.sfx.chime(v.vol * 0.8); },
        tick(v) { if (v.a.phase === 'windup' && (v.a.fxT = (v.a.fxT || 0) - v.dt) <= 0) { v.a.fxT = 0.02; v.aura(); } },
      },
    },
  },
};
