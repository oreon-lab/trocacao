// Lacaio (INVOCADOR). Formato: veja src/abilities/index.js.
export default {
  color: 0xffe14d,
  abilities: {
    a1: {
      name: 'EXÉRCITO DE OSSOS', glyph: '💀', desc: '2 mini-esqueletos saem do chão, correm atrás do oponente e explodem. Um soco quebra.',
      cd: 4, dashCancel: true,
      windup: 0.35, active: 0.05, recovery: 0.24, moveMul: 0.3,
      hits: { hit: { dmg: 6, knock: 7, up: 5, stun: 0.45 } },
      spawns: {
        minion: {
          type: 'summon', hit: 'hit', char: 'Skeleton_Minion', scale: 0.6, count: 2, spacing: 1.4, rise: 0.6, life: 5, speed: 6.5, turn: 4.5, touch: 0.55, cap: 4,
          start(v, o) { v.fx.burst(o.pos.clone().setY(0.2), 0x8a6a50, 8, 3, 0.1); v.fx.groundRing(o.pos, v.col, 1.2, 0.35); v.sfx.boom(0.25 * v.vol); },
        },
      },
      warn: ['#ffe14d', 'QUEBRE OS LACAIOS!'],
      bot: { range: [3, 16], use: ['poke', 'zone'] },
      anim: { clip: 'Spellcast_Summon', impact: 0.5 },
      onActive(c) { c.a.done = true; c.summon('minion', { at: { x: c.f.pos.x, y: 0, z: c.f.pos.z }, yaw: c.f.yaw }); },
      fx: {
        start(v) { v.fx.magicCircle(v.f, v.col, v.ab.windup + 0.3); v.fx.groundRing(v.f.pos, v.col, 1.6, 0.4); v.sfx.chime(v.vol * 0.8); },
        tick(v) { if (v.a.phase === 'windup' && (v.a.fxT = (v.a.fxT || 0) - v.dt) <= 0) { v.a.fxT = 0.02; v.aura(); } },
      },
    },
    // a2 / a3 / ult: TODO (TROCA-TROCA, DESMONTE, HORDA no roster)
  },
};
