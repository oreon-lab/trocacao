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
  dashHitRefund: 0.45,  // acertar golpe adianta a recarga do dash (fração de uma carga)
  dashBlockRecharge: 0.4, // defendendo, o dash recarrega mais devagar
  dashChaseCone: 0.6,   // dash pra frente com o oponente arremessado na frente = vai atrás dele
  // pulo duplo + corrida
  doubleJumpVel: 9,
  sprintSpeed: 11.5,    // segurar frente depois de um dash no chão = corrida
  // ricochete: bater na borda/pilar rápido
  bounceSpeed: 9,       // velocidade contra a parede pra quicar
  wallSplatStun: 0.35,  // arremessado que bate na parede fica atordoado mais tempo
  // GIRO DO FURACÃO (G): agarra pelas mãos quem estiver colado na frente, gira e arremessa pra onde mira
  grabCooldown: 10,     // segundos até poder agarrar de novo (depois de pegar)
  grabWhiffCd: 2,       // errou o agarrão: espera isso (e não gasta energia)
  spinTime: 1.15,       // duração máxima do giro (solta antes se a mira cruzar)
  spinMin: 0.85,        // gira pelo menos isso
  spinW0: 9,            // velocidade do giro no começo (rad/s)
  spinW1: 21,           // ...e no fim (acelera)
  spinRadius: 2.15,     // pés de quem é girado até o centro de quem gira
  spinHeight: 1.22,     // altura do corpo deitado no ar (de barriga pra baixo, mãos um pouco abaixo)
  grabArmStretch: 1.1,  // braço de borracha: os dois esticam um pouco os braços (cabeção chibi não deixa as mãos se encontrarem)...
  heldArmStretch: 1.15,
  maxArmStretch: 1.7,   // ...e no jogo cada braço ainda mira/estica até as mãos se encontrarem no meio (Rig.linkHands)
  throwSpeed: 27,
  throwUp: 2.5,
  throwGravity: 0.3,    // voa quase reto até a parede
  throwDmg: 10,
  throwWallDmg: 14,     // dano extra se bater na parede/pilar
  cineDist: 3.9,        // câmera do giro: distância, altura e inclinação (olha de cima)
  cineHeight: 2.75,
  cinePitch: -0.5,
  // arena fecha com o tempo
  shrinkStart: 25,      // segundos de luta até começar a fechar
  shrinkTime: 40,       // segundos fechando
  arenaMin: 10.5,       // raio final (pilares ficam em ~8.8)

  // slide
  slideMinSpeed: 7,
  slideBoost: 3,
  slideDecel: 6,
  slideMaxTime: 0.9,

  // combate
  hp: 160,              // luta mais longa (era 100)
  // esquiva no Q: na hora certa vira esquiva perfeita (câmera lenta, invencível, contra-ataque)
  perfectWindow: 0.22,  // segundos antes do golpe chegar em que o Q conta como perfeito
  perfectIFrames: 0.5,
  counterTime: 1.5,     // tempo pra aproveitar o contra-ataque
  counterMul: 1.5,
  // crítico: soco com dash/corrida (soco voador) às vezes bate muito forte e joga longe
  critChance: 0.3,
  critMul: 1.8,
  critKnock: 2.2,
  // energia (0-100) e poderes
  meterMax: 100,
  costQ: 35,            // E: habilidade do lutador (a ação continua chamada 'q' no código)
  costR: 100,           // R: super soco
  costG: 70,            // G: giro do furacão (gasta muita energia; só sai se pegar)
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
  heavy: { windup: 0.34, active: 0.1, recovery: 0.38, dmg: 16, range: 2.6, hitR: 0.45, knock: 15, up: 4.5, stun: 0.55, guardBreak: true, moveMul: 0.4 },
  lunge: { windup: 0.03, active: 0.12, recovery: 0.28, dmg: 11, range: 2.6, hitR: 0.45, knock: 9, up: 1.5, stun: 0.4 },
  super: { windup: 0.45, active: 0.18, recovery: 0.5, dmg: 26, range: 2.7, hitR: 0.6, knock: 16, up: 7, stun: 0.9, guardBreak: true, moveMul: 0.2 },
  // habilidades (E) — special: sem o passinho automático; cada uma tem o próprio movimento no fighter
  slam: { windup: 0.5, active: 0.06, recovery: 0.5, dmg: 17, radius: 4.6, knock: 10, up: 7, stun: 0.7, aoe: true, low: true, special: true, moveMul: 0.25 },
  charge: { windup: 0.2, active: 0.5, recovery: 0.4, dmg: 14, range: 1.9, hitR: 0.7, knock: 15, up: 4, stun: 0.7, guardBreak: true, armor: true, special: true, speed: 16, moveMul: 0.1 },
  blink: { windup: 0.16, active: 0.36, hitDelay: 0.16, recovery: 0.35, dmg: 15, range: 2.3, hitR: 0.55, knock: 8, up: 2, stun: 0.6, guardBreak: true, special: true, moveMul: 0.3 },
  meteor: { windup: 0.4, active: 0.05, recovery: 0.35, ranged: true, special: true, moveMul: 0.4 },
  meteorHit: { dmg: 18, radius: 2.3, delay: 0.95, knock: 10, up: 7, stun: 0.65 },
  grab: { windup: 0.05, active: 0.14, recovery: 0.35, dmg: 0, range: 2.1, hitR: 0.6, knock: 0, up: 0, stun: 0 },
  sweep: { windup: 0.04, active: 0.15, recovery: 0.35, dmg: 10, range: 2.2, hitR: 0.55, knock: 4, up: 8.5, stun: 0.7, low: true },
};

// habilidade própria de cada lutador (E) e a cor do tema dele (efeitos da habilidade e do super)
export const SPECIALS = {
  Barbarian: { kind: 'slam', name: 'TERREMOTO', color: 0xff7a2f },
  Knight: { kind: 'charge', name: 'INVESTIDA SAGRADA', color: 0xffd23f },
  Rogue: { kind: 'blink', name: 'PASSO SOMBRIO', color: 0xa05cff },
  Mage: { kind: 'meteor', name: 'METEORO', color: 0x4fc8ff },
};
