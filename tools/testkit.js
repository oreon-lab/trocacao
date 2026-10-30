// Kit de testes no navegador (só funciona com ?debug, que expõe window.game).
// Com o painel do navegador escondido o requestAnimationFrame quase não roda, então o kit trava o loop real
// e avança os quadros na mão (determinístico). Uso (javascript_tool / console):
//   const tk = await import('/tools/testkit.js'); await tk.boot();
//   tk.fight('Barbarian', 'Knight'); tk.place(3); tk.step(0.5); tk.snap(); tk.events(); tk.perf();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let g, clk = 0, booted = false;
const log = [], errors = [];

export async function boot({ quiet = true } = {}) {
  for (let i = 0; i < 120 && !(window.game && document.getElementById('loading')?.classList.contains('done')); i++) await sleep(250);
  g = window.game;
  if (!g) throw new Error('window.game não existe: abra a página com ?debug');
  if (booted) return g;
  booted = true;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => (cb.name === 'loop' ? 0 : raf(cb)); // só o loop do jogo para; o resto da página segue
  await sleep(50);
  Object.defineProperty(g.input, 'locked', { get: () => true, configurable: true });
  clk = performance.now() + 100;
  addEventListener('error', e => errors.push(String(e.message)));
  addEventListener('unhandledrejection', e => errors.push('promise: ' + String(e.reason?.message || e.reason)));
  // registra os eventos de gameplay (o main consome e limpa a lista todo quadro)
  const { events } = await import('/src/fighter.js');
  const push = events.push;
  events.push = function (...a) { for (const e of a) log.push({ t: +(clk / 1000).toFixed(3), type: e.type, f: e.f?.name, victim: e.victim?.name, kind: e.kind, dmg: e.dmg }); return push.apply(this, a); };
  if (quiet) { g.settings.warnings = true; }
  return g;
}

// avança o jogo `sec` segundos em quadros de 1/fps (render incluso, igual ao jogo de verdade)
export function step(sec, fps = 60) {
  const n = Math.max(1, Math.round(sec * fps));
  for (let i = 0; i < n; i++) { clk += 1000 / fps; try { g.loop(clk); } catch (e) { errors.push(String(e.stack || e)); throw e; } }
}

// luta nova contra o bot (bot parado por padrão: bot=true deixa ele jogar), já no "LUTE!"
export function fight(me = 'Barbarian', foe = 'Knight', { bot = false, tps = true, diff = 'hard' } = {}) {
  g.settings.char = me; g.settings.tps = g.S.tps = tps; g.settings.diff = diff; g.bot.setLevel(diff);
  g.menu.hide(); g.startMatch(); g.setCharacters(foe);
  if (!bot) { g._botUpdate ??= g.bot.update; g.bot.update = () => {}; } else if (g._botUpdate) g.bot.update = g._botUpdate;
  step(1.5);
  return { state: g.S.state, me: g.player.char, foe: g.enemy.char };
}

// põe os dois frente a frente a `dist` metros (oponente na frente do jogador, ângulo em rad)
export function place(dist = 3, angle = 0) {
  const p = g.player, e = g.enemy;
  p.pos.set(0, 0, 4); p.vel.set(0, 0, 0); g.input.yaw = 0; g.input.pitch = -0.05; p.yaw = 0;
  e.pos.set(-Math.sin(angle) * dist, 0, 4 - Math.cos(angle) * dist); e.vel.set(0, 0, 0); e.yaw = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z) + Math.PI;
  for (const f of [p, e]) Object.assign(f, { atk: null, stunT: 0, blocking: false, hp: f.hp > 0 ? f.hp : 160 });
}

// desenha agora (opcional: câmera em pos olhando pra look) — depois tire o screenshot
export function snap(pos, look) {
  if (pos) { g.camera.position.set(...pos); g.camera.lookAt(...(look || [0, 0.8, 0])); }
  g.renderer.render(g.camera.parent, g.camera);
}

// eventos de gameplay registrados desde a última leitura
export function events(clear = true) { const out = log.slice(); if (clear) log.length = 0; return out; }
export function errs() { return errors.slice(); }

// medição: chamadas de desenho, triângulos e tempo de CPU por quadro (sim + render)
export function perf(frames = 60) {
  const info = g.renderer.info;
  info.autoReset = false; info.reset();
  const t0 = performance.now(); step(frames / 60);
  const ms = (performance.now() - t0) / frames;
  const out = { msPerFrame: +ms.toFixed(2), calls: Math.round(info.render.calls / frames), tris: Math.round(info.render.triangles / frames), geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs.length };
  info.autoReset = true;
  return out;
}
