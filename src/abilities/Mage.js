// Mago (ARTILHEIRO). Formato: veja src/abilities/index.js.
export default {
  color: 0x4fc8ff,
  abilities: {
    // a1 / a3 / ult: TODO (BOLA DE FOGO, NOVA CONGELANTE, CHUVA DE METEOROS no roster)
    a2: {
      name: 'METEORO', glyph: '☄', desc: 'Círculo no chão onde o oponente vai estar: um meteoro cai ali. Saia do círculo!',
      cd: 8, aimRange: 22, dashCancel: true,
      windup: 0.4, active: 0.05, recovery: 0.21, moveMul: 0.4,
      hits: { hit: { dmg: 16, knock: 10, up: 7, stun: 0.65, zone: true, warn: ['#ff6a2f', 'SAIA DO CÍRCULO!'] } },
      spawns: {
        meteor: {
          type: 'zone', hit: 'hit', radius: 2.3, delay: 0.95,
          start(v, o) { v.fx.meteor(o.at, o.spec.radius, o.spec.delay, v.col, v.f.pos); v.sfx.whistle(o.spec.delay, v.vol); },
          burst(v, o) { v.fx.meteorImpact(o.at); v.sfx.explosion(v.vol); v.shake(0.9 * v.nearPt(o.at, 14)); v.hype(0.6); },
        },
      },
      warn: ['#4fc8ff', 'METEORO!'],
      bot: { range: [3, 16], use: ['poke', 'zone'] },
      anim: { clip: 'Meteor_Call', impact: 16 / 30, fp: true },
      onActive(c) { c.zone('meteor', { at: c.aimPoint(22, 0.3) }); }, // cai onde o alvo vai estar
      fx: {
        start(v) { v.fx.magicCircle(v.f, v.col, v.ab.windup + 0.3); v.fx.pillar(v.f.pos, v.col); v.sfx.chime(v.vol * 0.8); },
        tick(v) { if (v.a.phase === 'windup' && (v.a.fxT = (v.a.fxT || 0) - v.dt) <= 0) { v.a.fxT = 0.02; v.aura(); } },
      },
    },
  },
};
