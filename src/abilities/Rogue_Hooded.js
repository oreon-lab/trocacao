// Encapuzada (CAÇADORA). Formato: veja src/abilities/index.js.
export default {
  color: 0x3fe0b0,
  abilities: {
    a1: {
      name: 'LEQUE DE ADAGAS', glyph: '🗡', desc: '3 facas em leque (a 1ª que pegar atordoa). Recarrega rápido.',
      cd: 2.5, aimRange: 18, dashCancel: true,
      windup: 0.24, active: 0.05, recovery: 0.19, moveMul: 0.5, spread: 0.22,
      hits: { hit: { dmg: 6, knock: 3.5, up: 0, stun: 0.32 } },
      spawns: {
        dagger: {
          type: 'projectile', hit: 'hit', speed: 26, range: 18, radius: 0.25,
          make(v) { const g = new v.THREE.Group(); g.add(v.prop('Rogue_Hooded', 'Knife', 0.85)); return g; }, // a faca de verdade do modelo
          trail(v, o, dt) {
            o.obj.children[0].rotation.x -= dt * 26; // girando
            if ((o.trailT = (o.trailT || 0) - dt) <= 0) { o.trailT = 0.02; v.fx.puff(o.pos.clone(), v.col, 0.28, 0.18); }
          },
          impact(v, o, what) {
            if (what === 'wall') { v.fx.burst(o.pos, 0xdddddd, 5, 4, 0.05); v.sfx.block(0.5 * v.vol); }
            if (what === 'hit') v.fx.burst(o.pos, 0xffffff, 6, 5, 0.06);
          },
        },
      },
      warn: ['#3fe0b0', 'ADAGAS! ESQUIVA!'],
      bot: { range: [3, 15], use: 'poke' },
      anim: { clip: 'Throw', impact: 0.3 },
      onActive(c) { // leque na direção do alvo (mira automática) ou da mira
        const f = c.f, aim = c.a.aim, yaw = aim ? Math.atan2(-(aim.pos.x - f.pos.x), -(aim.pos.z - f.pos.z)) : f.yaw, s = this.spread;
        c.a.done = true;
        c.projectile('dagger', { from: { x: f.pos.x, y: f.pos.y + 1.1, z: f.pos.z }, dirs: [-1, 0, 1].map(k => [-Math.sin(yaw + k * s), -Math.cos(yaw + k * s)]), delays: [0.04, 0, 0.04] });
      },
      fx: {
        start(v) { v.fx.burst(v.chest(), v.col, 8, 3); },
        active(v) { v.sfx.swing(false, v.vol); },
        hit(v, e) { if (e.type === 'hit') { v.fx.slash(e.point, v.col, Math.random() * 3, 1.6); v.sfx.slash(v.vol); } },
      },
    },
    // a2 / a3 / ult: TODO (ARMADILHA, PIRUETA, SARAIVADA no roster)
  },
};
