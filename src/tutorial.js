import { keyName } from './input.js';
import { kitOf, SLOTS, resetSlots } from './abilities/index.js';

// TREINO RÁPIDO: na primeira vez o jogo já entra na arena contra um boneco de treino.
// Cada passo mostra a(s) tecla(s) grande(s) na tela e avança sozinho quando você faz o movimento.
// Na esquiva o boneco ataca, o tempo fica lento e a tecla acende verde = hora de apertar.
export function createTutorial({ player, enemy, S, settings, sfx, onFinish }) {
  const $ = id => document.getElementById(id);
  const keys = a => settings.binds[a].filter(Boolean).slice(0, 1).map(keyName);
  const move = () => ['forward', 'left', 'back', 'right'].map(a => keyName(settings.binds[a][0]));
  const mine = e => e.f === player;
  const fill = () => { player.meter = 100; player.grabCd = 0; resetSlots(player); }; // treino: energia cheia e sem recarga
  // dummy: o que o boneco faz no passo (null = fica parado olhando pra você)
  const STEPS = [
    { keys: move, text: 'ANDE', sub: 'ande pela arena', need: 5, walk: true },
    { keys: () => keys('light'), text: 'SOCO RÁPIDO', sub: 'chegue perto e acerte o boneco', need: 3, ok: e => e.type === 'hit' && mine(e) && (e.kind === 'light' || e.kind === 'lunge') },
    { keys: () => keys('heavy'), text: 'SOCO PESADO', sub: 'mais lento, mas quebra a defesa', need: 1, ok: e => (e.type === 'hit' || e.type === 'break') && mine(e) && e.kind === 'heavy' },
    { keys: () => keys('dash'), text: 'DASH', sub: 'vai pra onde você está andando', need: 2, ok: e => e.type === 'dash' && mine(e) },
    { keys: () => keys('jump'), text: 'PULO DUPLO', sub: 'pule e aperte de novo no ar', need: 1, ok: e => e.type === 'jump' && mine(e) && e.double },
    { keys: () => keys('block'), text: 'DEFENDA', sub: 'segure quando ele atacar', need: 2, dummy: 'light', ok: e => (e.type === 'block' || e.type === 'parry') && e.victim === player },
    { keys: () => keys('dodge'), text: 'ESQUIVA PERFEITA', sub: 'ele vai atacar: aperte quando a tecla ficar VERDE', need: 1, dummy: 'heavy', dodge: true, ok: e => e.type === 'perfect' && mine(e) },
    // (aqui entram as habilidades do lutador: E, R, Z e a ULT no X — montadas no start())
    { keys: () => keys('grab'), text: 'GIRO DO FURACÃO', sub: 'colado nele: agarra, gira e arremessa pra onde você mira', need: 1, setup: fill, ok: e => e.type === 'grab' && mine(e) },
  ];
  const BASE = STEPS.slice(), AT = BASE.findIndex(s => s.text === 'GIRO DO FURACÃO');
  // um passo por habilidade do seu lutador (as travadas 'EM BREVE' ficam de fora)
  const abilitySteps = () => SLOTS.map(slot => [slot, kitOf(player.char).abilities[slot]]).filter(([, ab]) => !ab.locked).map(([slot, ab]) => ({
    keys: () => keys(slot), text: ab.name, sub: (slot === 'ult' ? 'ULTIMATE (barra de energia cheia): ' : '') + (ab.desc || ''), need: 1, setup: fill,
    ok: e => e.type === 'cast' && mine(e) && e.slot === slot,
  }));
  let i = -1, n = 0, walked = 0, atkT = 0, doneT = 0, on = false;

  function show() {
    const st = STEPS[i];
    $('tutStep').textContent = `TREINO ${i + 1}/${STEPS.length}`;
    $('tutKeys').innerHTML = st.keys().map(k => `<kbd>${k}</kbd>`).join('');
    $('tutText').textContent = st.text;
    $('tutSub').textContent = typeof st.sub === 'function' ? st.sub() : st.sub;
    $('tutCount').textContent = st.need > 1 && !st.walk ? `${n} / ${st.need}` : '';
    $('tut').classList.remove('ok', 'now');
  }
  function next() {
    i++;
    n = walked = 0;
    atkT = 1.2;
    if (i >= STEPS.length) return finish();
    STEPS[i].setup?.();
    show();
  }
  function hit() { // fez o movimento
    n++;
    sfx.ding(0.7);
    const el = $('tut');
    el.classList.remove('ok'); void el.offsetWidth; el.classList.add('ok');
    if (n >= STEPS[i].need) { $('tutCount').textContent = 'BOA!'; doneT = 0.7; }
    else $('tutCount').textContent = `${n} / ${STEPS[i].need}`;
  }
  function finish() {
    on = false;
    S.timeScale = 1;
    $('tutStep').textContent = 'TREINO COMPLETO';
    $('tutKeys').innerHTML = '';
    $('tutText').textContent = 'PRONTO PRA PANCADARIA!';
    $('tutSub').textContent = 'agora é pra valer';
    $('tutCount').textContent = '';
    sfx.voice('excellent', { force: true });
    setTimeout(() => { $('tut').classList.add('hidden'); onFinish(); }, 2200);
  }

  return {
    get active() { return on; },
    start() { STEPS.splice(0, STEPS.length, ...BASE.slice(0, AT), ...abilitySteps(), ...BASE.slice(AT)); on = true; i = -1; $('tut').classList.remove('hidden'); next(); },
    goto(k) { i = k - 1; next(); }, // testes (?debug): pula pro passo k
    stop() { on = false; S.timeScale = 1; $('tut').classList.add('hidden'); },
    onEvent(e) { if (on && doneT <= 0 && STEPS[i]?.ok?.(e)) hit(); },
    // roda todo quadro antes da física: comanda o boneco, mantém as vidas cheias, câmera lenta na esquiva
    update(dt) {
      if (!on) return;
      const st = STEPS[i], I = enemy.input;
      if (doneT > 0 && (doneT -= dt) <= 0) next();
      player.hp = Math.max(player.hp, 60);
      enemy.hp = Math.max(enemy.hp, 60);
      if (st.setup && i >= 0) fill(); // treino: energia sempre cheia, sem recarga
      if (st.walk && player.grounded && doneT <= 0) {
        walked += Math.hypot(player.vel.x, player.vel.z) * dt;
        if (walked >= st.need) { n = st.need - 1; hit(); }
      }
      const dx = player.pos.x - enemy.pos.x, dz = player.pos.z - enemy.pos.z, d = Math.hypot(dx, dz);
      Object.assign(I, { mx: 0, mz: 0, block: false, crouch: false, jumpHeld: false, yaw: Math.atan2(-dx, -dz), pitch: 0 });
      if (player.heldBy || enemy.heldBy) return;
      // boneco volta pra perto se foi longe; nos passos de defesa/esquiva ele chega e ataca
      if (d > (st.dummy ? 2.3 : 4.5) && !enemy.atk && enemy.stunT <= 0) I.mz = 1;
      if (st.dummy && doneT <= 0 && !enemy.atk && enemy.stunT <= 0 && d < 3 && (atkT -= dt) <= 0) { I[st.dummy] = true; atkT = st.dodge ? 2.2 : 1.5; }
      const win = st.dodge && doneT <= 0 && player.perfectWindow(enemy);
      S.timeScale = win ? 0.18 : 1; // câmera lenta: dá tempo de ver a tecla verde
      $('tut').classList.toggle('now', !!win);
    },
  };
}
