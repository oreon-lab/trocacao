// Ossudo (AGARRADOR). Formato: veja src/abilities/index.js.
export default {
  color: 0xf2e6c4,
  abilities: {
    // a1 / a3 / ult: TODO (GANCHO, QUEBRA-COSTELA, COVA RASA no roster)
    a2: {
      name: 'RODA DE OSSOS', glyph: '🌀', desc: 'Gira indo atrás do oponente; o último giro quebra a defesa e arremessa.',
      cd: 11,
      windup: 0.16, active: 1.1, recovery: 0.45, moveMul: 0, radius: 2.3, tick: 0.27, speed: 5.5,
      hits: {
        tick: { dmg: 5, knock: 2.5, up: 0, stun: 0.32, hitstop: 0.05 },
        end: { dmg: 9, knock: 13, up: 6, stun: 0.7, guardBreak: true },
      },
      warn: ['#f2e6c4', 'SAIA DE PERTO!'], counter: ['back'], avoid: 4.5,
      bot: { range: [0, 4], use: ['close', 'punish'] },
      anim: { clip: '2H_Melee_Attack_Spinning', loop: true },
      perfectNear: (att, me, a, dist) => dist < 3.2,
      onActive(c) { c.a.tickT = 0; },
      onUpdate(c, dt) {
        const a = c.a, f = c.f, foe = c.foe;
        if (a.phase !== 'active') return;
        if (foe && !foe.ko) { // gira indo atrás dele
          const dx = foe.pos.x - f.pos.x, dz = foe.pos.z - f.pos.z, d = Math.hypot(dx, dz);
          if (d > 1.1) c.drive(dx / d * this.speed, dz / d * this.speed); else a.drive = null;
        }
        if ((a.tickT -= dt) <= 0) {
          a.tickT += this.tick;
          c.circle(a.t + this.tick > this.active ? 'end' : 'tick', f.pos, this.radius, { maxY: 1.6 });
        }
      },
      fx: {
        start(v) { v.fx.groundRing(v.f.pos, v.col, v.ab.radius, 0.3); v.fx.dust(v.f.pos, 6); v.sfx.swing(true, v.vol); },
        tick(v) { // rastro girando + vush a cada volta
          const a = v.a, f = v.f;
          if (a.phase !== 'active' || (a.fxT = (a.fxT || 0) - v.dt) > 0) return;
          a.fxT = 0.02;
          v.ghost();
          const ang = a.t * 22, r = v.ab.radius * 0.8;
          v.fx.puff(new v.THREE.Vector3(f.pos.x + Math.cos(ang) * r, f.pos.y + 1, f.pos.z + Math.sin(ang) * r), v.col, 0.35, 0.25);
          if (f.grounded) v.fx.dust(f.pos, 1);
          const turn = Math.floor(a.t / v.ab.tick);
          if (turn !== a.turn) { a.turn = turn; v.sfx.swing(true, v.vol); v.fx.slash(v.chest(), v.col, turn * 2.1, v.ab.radius * 1.7, 0.3); }
        },
        hit(v, e) { if (e.kind.endsWith('.end') && e.type !== 'block') { v.fx.explode(e.point, v.col, false); v.fx.rocks(e.point, 6, 4, 0xf2ead2, 0.12, 5); } },
      },
    },
  },
};
