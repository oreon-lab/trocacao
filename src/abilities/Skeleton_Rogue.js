// Sombra (ENVENENADORA). Formato: veja src/abilities/index.js.
export default {
  color: 0x7dff4a,
  abilities: {
    // a1 / a3 / ult: TODO (CORTE TÓXICO, VÉU DAS SOMBRAS, PICADA FATAL no roster)
    a2: {
      name: 'LÂMINA VENENOSA', glyph: '🐍', desc: 'Atravessa o oponente como um raio e envenena (o veneno não mata).',
      cd: 8, aimRange: 9, move: true, through: true,
      windup: 0.14, active: 0.3, recovery: 0.4, moveMul: 0,
      dmg: 7, knock: 4, up: 0, stun: 0.4, status: [['poison', 4, { dps: 2.2 }]],
      warn: ['#7dff4a', 'VENENO! ESQUIVA!'], counter: ['dodge'],
      bot: { range: [1.5, 8], use: ['gap', 'punish'] },
      anim: { clip: 'Dualwield_Melee_Attack_Slice', impact: 0.4 },
      perfectNear: (att, me, a, dist) => (a.phase === 'windup' ? dist < 9 : dist < 2.5),
      onActive(c) { c.dash({ dir: c.dir(), speed: 26, time: this.active, iframes: 0.15 }); }, // avança como um raio (invencível no começo)
      onUpdate(c) { if (c.a.phase === 'active' && !c.a.hit) c.touch(null, 1.3); },
      fx: {
        start(v) { v.fx.groundRing(v.f.pos, v.col, 1.3, 0.25); v.fx.puff(v.chest(), v.col, 0.8, 0.3); v.sfx.poof(v.vol); },
        active(v) { v.fx.smoke(v.f.pos, v.col); v.sfx.dash(v.vol); v.sfx.swing(true, v.vol); },
        tick(v) { if (v.a.phase === 'active' && (v.a.fxT = (v.a.fxT || 0) - v.dt) <= 0) { v.a.fxT = 0.02; v.ghost(); v.fx.puff(v.chest(), v.col, 0.4, 0.3); } },
        hit(v, e) { if (e.type === 'hit') { v.fx.slash(e.point, v.col, Math.random() * 3, 2.6); v.sfx.slash(v.vol); } },
      },
    },
  },
};
