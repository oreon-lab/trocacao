// Todos os números de "feel" do jogo ficam aqui. Ajuste à vontade.
export const T = {
  // corpo / hitbox (cápsula)
  radius: 0.42,
  standHeight: 1.8,
  crouchHeight: 1.15,
  slideHeight: 0.95,
  eyeRatio: 0.9,

  // movimento
  gravity: 30,
  fallMul: 1.45,        // cai mais rápido do que sobe (pulo mais "arcade")
  walkSpeed: 7.5,
  crouchSpeed: 3.6,
  blockSpeedMul: 0.5,
  groundAccel: 85,
  groundDecel: 60,
  overspeedDecel: 22,   // perde o excesso de velocidade do dash aos poucos (momentum)
  airAccel: 24,
  jumpVel: 10,
  jumpCut: 0.5,         // soltar espaço cedo = pulo mais baixo
  coyote: 0.1,
  jumpBuffer: 0.12,

  // dash
  dashSpeed: 26,
  dashTime: 0.15,
  dashExitSpeed: 10,
  dashCharges: 3,
  dashRecharge: 0.85,
  dashIFrames: 0.1,     // invencível no início do dash
  dashCooldown: 0.1,
  doubleTap: 0.22,

  // slide
  slideMinSpeed: 7,
  slideBoost: 3,
  slideDecel: 6,
  slideMaxTime: 0.9,

  // combate
  hp: 160,              // luta mais longa (era 100)
  // esquiva no E: na hora certa vira esquiva perfeita (câmera lenta, invencível, contra-ataque)
  perfectWindow: 0.22,  // segundos antes do golpe chegar em que o E conta como perfeito
  perfectIFrames: 0.5,
  counterTime: 1.5,     // tempo pra aproveitar o contra-ataque
  counterMul: 1.5,
  // energia (0-100) e poderes
  meterMax: 100,
  costQ: 35,            // Q: habilidade do lutador
  costR: 100,           // R: super soco
  parryWindow: 0.15,
  assistCone: 0.85,     // cos do ângulo da mira assistida (~32°)
  assistRange: 1.4,     // alcance extra em que a mira assistida "puxa" o soco
  comboDecay: 0.2,      // cada hit seguido atordoa 20% menos (sem stunlock infinito)
  comboMax: 4,          // 4º hit seguido arremessa e zera o combo
  arenaRadius: 16,
};

// windup -> active -> recovery (segundos)
export const ATTACKS = {
  light: { windup: 0.09, active: 0.09, recovery: 0.16, dmg: 6, range: 2.3, hitR: 0.42, knock: 3.5, up: 0, stun: 0.34 },
  heavy: { windup: 0.34, active: 0.1, recovery: 0.38, dmg: 16, range: 2.6, hitR: 0.45, knock: 11, up: 3, stun: 0.55, guardBreak: true, moveMul: 0.4 },
  lunge: { windup: 0.03, active: 0.12, recovery: 0.28, dmg: 11, range: 2.6, hitR: 0.45, knock: 9, up: 1.5, stun: 0.4 },
  super: { windup: 0.45, active: 0.18, recovery: 0.5, dmg: 26, range: 2.7, hitR: 0.6, knock: 16, up: 7, stun: 0.9, guardBreak: true, moveMul: 0.2 },
  // habilidades (Q) — special: sem o passinho automático; cada uma tem o próprio movimento no fighter
  slam: { windup: 0.5, active: 0.06, recovery: 0.5, dmg: 17, radius: 4.6, knock: 10, up: 7, stun: 0.7, aoe: true, low: true, special: true, moveMul: 0.25 },
  charge: { windup: 0.2, active: 0.5, recovery: 0.4, dmg: 14, range: 1.9, hitR: 0.7, knock: 15, up: 4, stun: 0.7, guardBreak: true, armor: true, special: true, speed: 16, moveMul: 0.1 },
  blink: { windup: 0.16, active: 0.36, hitDelay: 0.16, recovery: 0.35, dmg: 15, range: 2.3, hitR: 0.55, knock: 8, up: 2, stun: 0.6, guardBreak: true, special: true, moveMul: 0.3 },
  meteor: { windup: 0.4, active: 0.05, recovery: 0.35, ranged: true, special: true, moveMul: 0.4 },
  meteorHit: { dmg: 18, radius: 2.3, delay: 0.95, knock: 10, up: 7, stun: 0.65 },
  sweep: { windup: 0.04, active: 0.15, recovery: 0.35, dmg: 10, range: 2.2, hitR: 0.55, knock: 4, up: 8.5, stun: 0.7, low: true },
};

// habilidade própria de cada lutador (Q) e a cor do tema dele (efeitos da habilidade e do super)
export const SPECIALS = {
  Barbarian: { kind: 'slam', name: 'TERREMOTO', color: 0xff7a2f },
  Knight: { kind: 'charge', name: 'INVESTIDA SAGRADA', color: 0xffd23f },
  Rogue: { kind: 'blink', name: 'PASSO SOMBRIO', color: 0xa05cff },
  Mage: { kind: 'meteor', name: 'METEORO', color: 0x4fc8ff },
};
