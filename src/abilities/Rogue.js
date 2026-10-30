// Ladina (ASSASSINA). Formato: veja src/abilities/index.js.
export default {
  color: 0xa05cff,
  abilities: {
    // a1 / a3 / ult: TODO (BOTE, BOMBA DE FUMAÇA, MIL CORTES no roster)
    a2: {
      name: 'PASSO SOMBRIO', glyph: '🌑', desc: 'Some na fumaça e aparece nas costas do oponente com uma facada.',
      cd: 9, aimRange: 12, move: true,
      windup: 0.16, active: 0.36, hitDelay: 0.16, recovery: 0.35,
      dmg: 14, range: 2.3, hitR: 0.55, knock: 8, up: 2, stun: 0.6, guardBreak: true,
      warn: ['#a05cff', 'ATRÁS DE VOCÊ!'], counter: ['dodge'],
      bot: { range: [3, 11], use: ['gap', 'punish'] },
      anim: { clip: 'Dualwield_Melee_Attack_Stab', impact: 18 / 30, hide: a => a.phase === 'windup' && a.t > 0.05 },
      perfectNear: (att, me, a, dist) => dist < 13,
      onStart(c) { c.iframes(this.windup + 0.04); }, // some na fumaça
      onActive(c) { c.teleport('behind'); },
      fx: {
        start(v) { v.a.from = v.f.pos.clone(); v.fx.smoke(v.f.pos, v.col); v.sfx.poof(v.vol); },
        active(v) {
          v.fx.smoke(v.f.pos, v.col);
          if (v.a.from) v.fx.shadowTrail(v.a.from, v.f.pos, v.col, v.f.height);
          v.sfx.poof(v.vol);
          v.turnToFoe(); // a câmera de quem usou gira rápido pro oponente
        },
        hit(v, e) { if (e.type === 'hit' || e.type === 'break') { v.fx.backstab(e.point, v.col); v.sfx.slash(v.vol); } },
      },
    },
  },
};
