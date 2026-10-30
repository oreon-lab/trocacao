// Cavaleiro (GUARDIÃO). Formato: veja src/abilities/index.js.
export default {
  color: 0xffd23f,
  abilities: {
    // a1 / a3 / ult: TODO (ESCUDADA, RETALIAÇÃO, JULGAMENTO DIVINO no roster)
    a2: {
      name: 'INVESTIDA SAGRADA', glyph: '🛡', desc: 'Avança com escudo de luz (segura golpe de frente) e quebra a defesa.',
      cd: 8, aimRange: 13, move: true,
      windup: 0.2, active: 0.5, recovery: 0.4, moveMul: 0.1, speed: 16,
      dmg: 13, range: 1.9, hitR: 0.7, knock: 15, up: 4, stun: 0.7, guardBreak: true, armor: 'front',
      warn: ['#ffd23f', 'PRO LADO!'], counter: ['dodge'],
      bot: { range: [2, 9], use: 'gap' },
      anim: { clip: 'Shield_Charge', impact: 5 / 30, fp: true },
      // esquiva perfeita: no windup perto; na investida, se ele vai chegar dentro da janela
      perfectNear: (att, me, a, dist) => (a.phase === 'active' ? att.inCone(me, a.def.range + a.def.speed * 0.22 + 0.6, 0.5) > 0 : dist < 4),
      onActive(c) { // investida reta: pro oponente se ele tá na frente (ou na mira automática), senão pra frente
        const f = c.f, foe = c.foe, ok = foe && !foe.ko && (c.a.aim || f.inCone(foe, 12, 0.6));
        c.a.dir = ok ? new c.THREE.Vector3(foe.pos.x - f.pos.x, 0, foe.pos.z - f.pos.z).normalize() : f.forward(new c.THREE.Vector3());
      },
      onUpdate(c) {
        const a = c.a;
        if (a.phase !== 'active') return;
        if (!a.hit) c.drive(a.dir.x * this.speed, a.dir.z * this.speed);
        else if (a.drive) { c.endActive(); a.drive = null; c.f.vel.x *= 0.2; c.f.vel.z *= 0.2; } // bateu: para
      },
      fx: {
        start(v) { const p = v.chest(); v.fx.crossFlash(p, 1.5); v.fx.rays(p, v.col, 12, 2.2); v.fx.groundRing(v.f.pos, v.col, 2.2); v.sfx.chime(v.vol); },
        active(v) { v.sfx.dash(v.vol); },
        tick(v) {
          const a = v.a, f = v.f;
          if (a.phase !== 'recovery') v.keep('shield', () => v.fx.shield(v.col), (g, dt) => v.fx.shieldUpdate(g, f, dt), g => v.fx.shieldOff(g, v.col, a.hit));
          if (a.phase === 'active' && !a.hit && (a.fxT = (a.fxT || 0) - v.dt) <= 0) {
            a.fxT = 0.02;
            v.ghost();
            v.fx.puff(new v.THREE.Vector3(f.pos.x + (Math.random() - 0.5) * 0.6, f.pos.y + 0.3 + Math.random() * 1.2, f.pos.z + (Math.random() - 0.5) * 0.6), v.col, 0.5, 0.35);
            if (f.grounded) v.fx.dust(f.pos, 1);
          }
        },
        hit(v, e) { if (e.type === 'hit' || e.type === 'break') { v.fx.holy(e.point, v.col); v.sfx.ding(v.vol); } },
      },
    },
  },
};
