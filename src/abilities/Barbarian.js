// Bárbaro (BRUTAMONTES). Sem imports: o jogo entrega tudo por c (gameplay) e v (visual). Formato: veja src/abilities/index.js.
export default {
  color: 0xff7a2f,
  abilities: {
    // a1 / a3 / ult: TODO (MARRETADA, SALTO BRUTO, FÚRIA BÁRBARA no roster). Slot vazio = placeholder.
    a2: {
      name: 'TERREMOTO', glyph: '🌋', desc: 'Pula e soca o chão: a onda derruba quem estiver perto. Pule pra escapar!',
      cd: 9, aimRange: 5.7, needTarget: true, air: false,
      windup: 0.5, active: 0.06, recovery: 0.5, moveMul: 0.25,
      radius: 4.2, low: true, zone: true, dmg: 16, knock: 10, up: 7, stun: 0.7,
      warn: ['#ff7a2f', 'PULE!'], counter: ['jump', 5.5],
      bot: { range: [0, 4], use: ['close', 'punish'] },
      anim: { clip: 'Ground_Slam', impact: 13 / 30 },
      perfectNear: (att, me, a, dist) => dist < 4.7,
      onUpdate(c) { // pulinho roteirizado: sobe devagar, desce rápido e bate no chão bem no fim do windup
        const a = c.a, W = this.windup;
        if (a.phase !== 'windup') return;
        const u = a.t / W, H = 1.3;
        c.f.vel.y = u < 0.7 ? (H * Math.PI / 2 / (0.7 * W)) * Math.cos((Math.PI / 2) * (u / 0.7)) : (-H * Math.PI / 2 / (0.3 * W)) * Math.sin((Math.PI / 2) * Math.min(1, (u - 0.7) / 0.3));
      },
      onActive(c) { c.a.done = true; c.circle(null, c.f.pos, this.radius, { maxY: 0.5 }); }, // quem pulou escapa
      fx: {
        start(v) { v.fx.groundRing(v.f.pos, v.col, 1.4, 0.3); v.fx.dust(v.f.pos, 6); v.sfx.jump(v.vol); },
        active(v) {
          v.fx.slam(v.f.pos, v.col, v.ab.radius);
          v.sfx.boom(v.vol);
          const near = v.near(12);
          v.shake(v.isMe ? 0.6 : 0.9 * near);
          if (v.isMe || near > 0.3) v.kick(0.04, 0, (Math.random() - 0.5) * 0.06);
          v.hype(0.8);
        },
        tick(v) { if (v.a.phase === 'windup' && (v.a.fxT = (v.a.fxT || 0) - v.dt) <= 0) { v.a.fxT = 0.02; v.aura(); } },
      },
    },
  },
};
