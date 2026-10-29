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
  hp: 100,
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
  sweep: { windup: 0.04, active: 0.15, recovery: 0.35, dmg: 10, range: 2.2, hitR: 0.55, knock: 4, up: 8.5, stun: 0.7, low: true },
};
