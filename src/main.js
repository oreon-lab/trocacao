import * as THREE from 'three';
import { T, ATTACKS } from './config.js';
import { Fighter, events, damp, clamp, critDef } from './fighter.js';
import { Rig, loadCharacters, CHARACTERS } from './rig.js';
import { createArena } from './arena.js';
import { PlayerInput, keyName, ACTIONS, DEFAULT_BINDS } from './input.js';
import { Bot } from './bot.js';
import { snapshot, Remote } from './net.js';
import { lobby, ERR } from './lobby.js';
import { FX, sfx, audio } from './fx.js';
import { initMenu, DEFAULT_SETTINGS } from './menu.js';
import { createTutorial } from './tutorial.js';
import * as AB from './abilities/index.js';

const $ = id => document.getElementById(id);

// ---------- tela de carregamento (o HTML já está na tela; aqui só a barra, o texto e o sumiço) ----------
const loading = {
  shown: 0.04,
  set(k, text) { this.shown = Math.max(this.shown, k); $('ldFill').style.width = (this.shown * 100).toFixed(1) + '%'; if (text) $('ldStatus').textContent = text; },
  done() { this.set(1, 'LUTE!'); setTimeout(() => $('loading').classList.add('done'), 250); },
};
loading.set(0.12, 'CARREGANDO OS LUTADORES E A ARENA...');
THREE.DefaultLoadingManager.onProgress = (url, n, total) => loading.set(0.12 + 0.73 * (n / total)); // todos os .glb/.gltf e texturas
// deixa o navegador desenhar o texto novo; com a aba em segundo plano não vem quadro, então segue mesmo assim
const paint = () => new Promise(r => { requestAnimationFrame(() => setTimeout(r)); setTimeout(r, 120); });

// ---------- cena ----------
const canvas = $('game');
// Qualidade (Configurações > Vídeo): o que pesa de verdade na GPU. Alta = visual de sempre.
// msaa só muda ao recarregar (é do contexto WebGL); o resto troca na hora em applyQuality.
const QUALITY_GFX = {
  low: { msaa: false, shadowSize: 1024, shadowType: THREE.PCFShadowMap, maxDpr: 1, wallOutline: false, wallShadow: false, torch: false },
  medium: { msaa: true, shadowSize: 1024, shadowType: THREE.PCFShadowMap, maxDpr: 1.5, wallOutline: false, wallShadow: false, torch: true },
  high: { msaa: true, shadowSize: 2048, shadowType: THREE.PCFSoftShadowMap, maxDpr: 2, wallOutline: true, wallShadow: true, torch: true },
};
// 1ª vez (nada salvo): placa de vídeo integrada/software começa mais leve
const GPU_NAME = (() => { try { const gl = document.createElement('canvas').getContext('webgl2'), e = gl.getExtension('WEBGL_debug_renderer_info'), n = e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : ''; gl.getExtension('WEBGL_lose_context')?.loseContext(); return n; } catch { return ''; } })();
const AUTO_Q = /SwiftShader|llvmpipe|softpipe|Basic Render/i.test(GPU_NAME) ? 'low' : /Intel|Mali|Adreno|PowerVR|Radeon\(TM\) Graphics|Vega \d+ Graphics/i.test(GPU_NAME) ? 'medium' : 'high';
const SAVED_Q = (() => { try { return JSON.parse(localStorage.getItem('trocacao') || '{}').quality; } catch {} })();
const qLevel = v => (v === 'med' ? 'medium' : QUALITY_GFX[v] ? v : AUTO_Q); // o menu usa 'med'
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY_GFX[qLevel(SAVED_Q)].msaa, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
let maxDpr = 2;
// escrita no DOM só quando o valor muda (pro HUD, que roda todo quadro): setText(el, 'x'), setStyle(el, 'width', '50%'), setVar(el, '--fill', '0.5')
const domLast = new WeakMap();
const domChanged = (el, k, v) => { let c = domLast.get(el); if (!c) domLast.set(el, (c = {})); if (c[k] === v) return false; c[k] = v; return true; };
const setText = (el, v) => { if (domChanged(el, '#text', v)) el.textContent = v; };
const setStyle = (el, prop, v) => { if (domChanged(el, prop, v)) el.style[prop] = v; };
const setVar = (el, prop, v) => { if (domChanged(el, prop, v)) el.style.setProperty(prop, v); };
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, 1, 0.03, 500);
camera.rotation.order = 'YXZ';
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xffffff, 0x9ab0c8, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(12, 25, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);
// aplica Baixa/Média/Alta ('low' | 'med' | 'medium' | 'high'; outro valor = automático pela placa de vídeo).
// Devolve true se precisa recarregar a página pra valer tudo (antialias).
function applyQuality(level) {
  const q = QUALITY_GFX[qLevel(level)];
  if (sun.shadow.mapSize.x !== q.shadowSize) { sun.shadow.mapSize.setScalar(q.shadowSize); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  if (renderer.shadowMap.type !== q.shadowType) { // o three não percebe a troca de tipo sozinho: recompila os materiais
    renderer.shadowMap.type = q.shadowType;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }
  arena.setQuality(q);
  maxDpr = q.maxDpr;
  return q.msaa !== renderer.getContextAttributes()?.antialias;
}
if (location.search.includes('debug')) window.applyQuality = applyQuality; // teste no console

const arena = createArena(scene);
const player = new Fighter('VOCÊ', 0x3fa7ff);
const enemy = new Fighter('BOT', 0xff5a4f);
await Promise.all([loadCharacters(), arena.ready]); // personagens + modelos do cenário
loading.set(0.88, 'CHAMANDO A TORCIDA...');
await paint();
arena.buildCrowd(renderer, camera); // torcida = fotos dos personagens KayKit (src/crowd.js)
let pRig, eRig;
// 1ª pessoa: cópia do seu personagem presa na câmera (olhos = câmera), só com os braços.
// As animações FP_* (feitas no Blender) já enquadram as mãos, então não precisa de truque.
const fpHolder = new THREE.Group();
camera.add(fpHolder);
let fpRig;
const input = new PlayerInput(canvas);
const bot = new Bot();
const fx = new FX(scene, camera);
// habilidades (src/abilities): projéteis, zonas, lacaios e o "juice" que os kits usam; embrulhos porque S/net/vol vêm mais abaixo
AB.init({
  scene, camera, fx, sfx, arena, player, enemy, noCd: location.search.includes('nocd'),
  send: m => S.online && net.send(m), vol: f => vol(f),
  juice: {
    pop: (p, t, cls, col) => popText(p, t, cls, col), flash: (a, c) => flashScreen(a, c), kick: (p, y, r) => camKick(p, y, r), zoom: df => camZoom(df),
    shake: k => (S.trauma = Math.min(1, S.trauma + k)), hitstop: s => (S.hitstop = Math.max(S.hitstop, s)),
    turnToFoe: () => { S.turn = wrap(Math.atan2(-(enemy.pos.x - player.pos.x), -(enemy.pos.z - player.pos.z)) - input.yaw); S.turnT = 0.12; },
  },
});

// ---------- configurações (salvas no navegador) ----------
const settings = structuredClone(DEFAULT_SETTINGS);
try {
  const saved = JSON.parse(localStorage.getItem('trocacao') || '{}');
  Object.assign(settings, saved, { binds: { ...settings.binds, ...saved.binds } }); // ação nova ganha a tecla padrão
  const b = settings.binds, sb = saved.binds || {}; // esquiva saiu do E pro Q (habilidade foi pro E): troca quem ainda usa o padrão antigo
  if (b.dodge[0] === 'KeyE' && b.q?.[0] === 'KeyQ') [b.dodge[0], b.q[0]] = ['KeyQ', 'KeyE'];
  // 4 habilidades: a antiga do E vira a rápida (a1), a do R (super) vira a a2; ação nova ganha a tecla padrão se estiver livre
  if (sb.q && !sb.a1) b.a1 = b.q;
  if (sb.r && !sb.a2) b.a2 = b.r;
  delete b.q; delete b.r;
  for (const [a] of ACTIONS) if (!sb[a] && !(a === 'a1' && sb.q) && !(a === 'a2' && sb.r))
    b[a] = DEFAULT_BINDS[a].map(c => (c && Object.entries(b).some(([k, v]) => k !== a && v.includes(c)) ? '' : c));
} catch {}
// 1ª vez num PC com placa fraca: já começa em Média/Baixa (mesmos valores do atalho de qualidade do menu)
if (SAVED_Q === undefined && AUTO_Q !== 'high') Object.assign(settings, AUTO_Q === 'low' ? { quality: 'low', shadows: false, particles: 0.5, crowd: false, resScale: 0.75 } : { quality: 'med', particles: 0.8, resScale: 0.9 });
const save = () => { try { localStorage.setItem('trocacao', JSON.stringify(settings)); } catch {} };
const HP = { short: 100, normal: 160, long: 220 };
const VIDEO = new Set([undefined, 'quality', 'resScale', 'autoRes']);
function applySettings(k) {
  Object.assign(input, { sens: settings.sens, invertY: settings.invertY, doubleTap: settings.dbl, binds: settings.binds });
  audio.volume = settings.vol;
  bot.setLevel(settings.diff);
  S.tps = settings.tps;
  sun.castShadow = settings.shadows;
  arena.crowd.visible = settings.crowd;
  fx.density = settings.particles;
  $('fps').classList.toggle('hidden', !settings.showFps);
  buildBar(); // HUD mostra as teclas configuradas
  if (VIDEO.has(k)) { applyQuality(settings.quality); pr = maxPR(); renderer.setPixelRatio(pr); resize(); }
  if (k === 'char' && !S.online) setCharacters();
}
// personagens: o seu + um diferente sorteado pro bot
function setCharacters(foeChar) {
  if (pRig) { scene.remove(pRig.root, eRig.root); fpHolder.remove(fpRig.root); }
  if (!CHARACTERS[settings.char]) settings.char = 'Barbarian';
  const others = Object.keys(CHARACTERS).filter(c => c !== settings.char);
  const botChar = CHARACTERS[foeChar] ? foeChar : others[Math.floor(Math.random() * others.length)];
  pRig = new Rig(settings.char);
  eRig = new Rig(botChar);
  fpRig = new Rig(settings.char, { firstPerson: true });
  scene.add(pRig.root, eRig.root);
  fpHolder.add(fpRig.root);
  player.char = settings.char;
  enemy.char = botChar;
  buildBar();
  $('pName').textContent = CHARACTERS[settings.char].toUpperCase();
  $('eName').textContent = CHARACTERS[botChar].toUpperCase() + (foeChar ? ' (ONLINE)' : ' (BOT)');
}
setCharacters();

// foto de cada lutador pra tela de escolha (renderiza uma vez no começo)
function makeThumbs() {
  const W = 360, H = 480, out = {};
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(0xcdeaff);
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2, 4, 5);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x9ab0c8, 1.6), key);
  const cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 30);
  cam.position.set(0, 1.15, 4.4);
  cam.lookAt(0, 0.92, 0);
  const crop = document.createElement('canvas');
  crop.width = W; crop.height = H;
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  for (const k of Object.keys(CHARACTERS)) {
    const rig = new Rig(k);
    rig.root.rotation.y = Math.PI + 0.45; // de frente, meio de lado
    rig.base.guard.up.setEffectiveWeight(1);
    rig.base.guard.lo.setEffectiveWeight(1);
    rig.mixer.update(0.4);
    sc.add(rig.root);
    renderer.render(sc, cam);
    crop.getContext('2d').drawImage(canvas, 0, 0); // lido na mesma hora que desenhou (não precisa preserveDrawingBuffer)
    out[k] = crop.toDataURL('image/jpeg', 0.85);
    sc.remove(rig.root);
  }
  // foto da arena pro card da tela de mapas (vista do alto, na diagonal)
  const mc = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 300);
  mc.position.set(15, 12, 15);
  mc.lookAt(0, 0, 0);
  renderer.setSize(640, 360, false);
  renderer.render(scene, mc);
  out['map:castelo'] = canvas.toDataURL('image/jpeg', 0.8);
  return out;
}

// ---------- estado do jogo ----------
const S = { online: false, host: false, netT: 0, state: 'menu', stateT: 0, round: 1, wins: [0, 0], timer: 99, timeScale: 1, hitstop: 0, tps: settings.tps, trauma: 0, roll: 0, dip: 0, dipV: 0, fov: 80, ghostT: 0, trail: [T.hp, T.hp], slowT: 0, kp: 0, kpv: 0, ky: 0, kyv: 0, kr: 0, krv: 0, kz: 0, kzv: 0 };
const PLAYING = ['intro', 'fight', 'ko'];
input.onToggleView = () => {
  settings.tps = S.tps = !S.tps;
  save();
};
// scroll do mouse = zoom (campo de visão): pra cima aproxima, pra baixo afasta; fica salvo nas configurações
addEventListener('wheel', e => {
  if (!input.locked || !e.deltaY) return;
  settings.fov = clamp(settings.fov + Math.sign(e.deltaY) * 3, 65, 105);
  save();
}, { passive: true });
// trava de mira (estilo Elden Ring): a câmera puxa pro oponente com mola, o mouse ainda ajusta
input.onLock = () => {
  if (!S.lockOn && !canLock()) return;
  S.lockOn = !S.lockOn;
  sfx.jump(0.6);
};
const canLock = () => S.state === 'fight' && !enemy.ko && !player.ko && player.pos.distanceTo(enemy.pos) < 22;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const _lk = new THREE.Vector3();
function lockOnCamera(dt) {
  if (S.lockOn && !canLock() && S.state !== 'intro') S.lockOn = false;
  if (!S.lockOn || player.grab || player.heldBy) return; // no giro do furacão a câmera fica livre (mira do arremesso)
  // mira no peito do oponente a partir da câmera (em 3ª pessoa ela fica no ombro)
  _lk.set(enemy.pos.x - camera.position.x, enemy.pos.y + enemy.height * 0.6 - camera.position.y, enemy.pos.z - camera.position.z);
  const yawT = Math.atan2(-_lk.x, -_lk.z), pitchT = Math.atan2(_lk.y, Math.hypot(_lk.x, _lk.z)) - (S.tps ? 0.08 : 0);
  // ajuda leve: não puxa perto do centro (zona morta), puxa devagar e com giro máximo -> não vira mira automática
  const k = 1 - Math.exp(-2.6 * settings.lockPull * dt), max = 2.2 * settings.lockPull * dt, dead = 0.1;
  const dy = wrap(yawT - input.yaw), ey = Math.sign(dy) * Math.max(0, Math.abs(dy) - dead);
  input.yaw += clamp(ey * k, -max, max);
  input.pitch += clamp((clamp(pitchT, -0.8, 0.8) - input.pitch) * k * 0.5, -max, max);
}
function updateLockMark() {
  const el = $('lock');
  el.classList.toggle('on', !!S.lockOn);
  if (!S.lockOn) return;
  _v.set(enemy.pos.x, enemy.pos.y + enemy.height * 0.6, enemy.pos.z).project(camera);
  el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-50%)`;
}
const winsNeeded = () => (S.online ? S.need || 2 : settings.rounds); // online: melhor de N da sala (prep)
function makePips() {
  for (const id of ['pWins', 'eWins']) $(id).innerHTML = '<i></i>'.repeat(winsNeeded());
}

// ---------- telas ----------
const menu = initMenu({
  settings, save, onChange: applySettings, characters: CHARACTERS, thumbs: makeThumbs(),
  actions: {
    fight: () => { matchStats = newStats(); startMatch(); lockPointer(); },
    resume: lockPointer,
    restart: () => {
      if (!S.online) { matchStats = newStats(); startMatch(); lockPointer(); } else lobby.rematch(true); // online: voto de revanche (os 2 votam = nova partida)
    },
    quit: () => (S.online ? (lobby.leave(), leaveMatch()) : toHome()),
    ...onlineActions(),
    tutorial: startTutorial,
    skipTutorial: () => { settings.tutorialDone = true; save(); menu.show('home'); },
  },
});
// treino rápido (src/tutorial.js): luta sem tempo contra um boneco que o tutorial comanda
const tutorial = createTutorial({ player, enemy, S, settings, sfx, onFinish: () => { toHome(); document.exitPointerLock(); } });
function startTutorial() {
  S.tutorial = true;
  startMatch();
  Object.assign(S, { state: 'fight', stateT: 0, timer: Infinity });
  banner('TREINO!');
  tutorial.start();
  lockPointer();
}
function toHome() {
  if (S.tutorial) { tutorial.stop(); S.tutorial = false; settings.tutorialDone = true; save(); } // saiu do treino (terminou ou pulou)
  S.state = 'menu';
  clearHazards();
  setCharacters();
  menu.show('home');
}
function showPause() {
  menu.setPause({ online: S.online, tutorial: S.tutorial, round: S.round, score: S.wins, foe: CHARACTERS[enemy.char], char: player.char });
  menu.show('pause');
}
function showOver() {
  menu.setOver({
    won: S.wins[0] > S.wins[1], score: [...S.wins], stats: matchStats, online: S.online,
    me: { char: player.char }, foe: { char: enemy.char, tag: S.online ? 'ONLINE' : 'CPU' },
  });
  menu.show('over');
  matchStats = newStats();
}
// estatísticas da partida pra tela de fim: conta os eventos de luta na hora que entram na fila (sem mexer no handleEvents)
const newStats = () => [0, 1].map(() => ({ dmg: 0, hits: 0, maxCombo: 0, perfect: 0, parry: 0, crits: 0, grabs: 0, abilities: 0 }));
let matchStats = newStats(), sawCast = false;
const pushEvent = events.push;
events.push = function (...list) {
  for (const e of list) {
    const s = matchStats[e.f === player ? 0 : e.f === enemy ? 1 : -1];
    if (!s || S.tutorial) continue;
    if (e.type === 'hit') { s.hits++; s.dmg += e.dmg || 0; s.maxCombo = Math.max(s.maxCombo, e.combo || 1); if (e.crit) s.crits++; }
    else if (e.type === 'parry') matchStats[e.victim === player ? 0 : 1].parry++; // no parry o f é quem bateu
    else if (e.type === 'perfect') s.perfect++;
    else if (e.type === 'grab') s.grabs++;
    else if (e.type === 'cast' && !e.recast) { sawCast = true; s.abilities++; }   // habilidades novas (src/abilities)
    else if (e.type === 'swing' && !sawCast && ATTACKS[e.kind]?.special) s.abilities++;
  }
  return pushEvent.apply(this, list);
};
function lockPointer() {
  sfx.unlock();
  // trava o mouse ANTES da tela cheia: a tela cheia gasta o "clique" e aí o mouse não travava (precisava de 2 cliques)
  const pl = () => { const r = canvas.requestPointerLock({ unadjustedMovement: true }); r?.catch?.(() => canvas.requestPointerLock()?.catch?.(() => {})); };
  pl();
  if (settings.fs && !document.fullscreenElement) enterFullscreen().then(() => { if (!input.locked) pl(); }); // em tela cheia pode travar sem clique
}
// soltou o mouse (Esc / tecla de pausa) no meio da luta = pausa
document.addEventListener('pointerlockchange', () => {
  if (input.locked) menu.hide();
  else if (PLAYING.includes(S.state)) showPause();
});

// ---------- online ----------
// Cada um simula o próprio lutador e manda o estado 30x/s; o oponente é desenhado interpolado.
// Golpe: quem bate detecta o acerto e manda 'hit'; quem apanha resolve (defesa/parry/acerto) e devolve 'res'.
const net = { send: m => lobby.send(m) }; // mensagens de luta vão pelo lobby (src/lobby.js); o servidor só repassa durante a partida
const remote = new Remote();
const netStatus = (t, connected = false) => menu.setOnline?.(t, connected);
// tela do online: a nova do menu.js (sala/lobby) se existir; senão a antiga 'online'
const onlineScreen = () => ['room', 'lobby', 'online'].find(s => (s !== 'room' || lobby.state.room) && document.querySelector(`[data-screen="${s}"]`));
// sai da luta online mas continua no lobby (na sala, ou no hub se saiu dela); msg = motivo (o oponente saiu, a conexão caiu...)
function leaveMatch(msg) {
  if (S.online) {
    S.online = S.host = false;
    enemy.remote = false;
    document.exitPointerLock();
    toHome();
    menu.show(onlineScreen());
  }
  if (msg) { netStatus(msg); menu.toast?.(msg); }
}
// VOLTAR da tela online: fecha a conexão e volta pro início
function goOffline() {
  lobby.disconnect();
  leaveMatch();
  toHome();
}
const NET = {
  round: m => {
    S.round = m.round; S.wins = [m.wins[1], m.wins[0]]; startRound();
    if (menu.current === 'over') showPause(); // host recomeçou: convidado volta pra luta
  },
  end: m => endRound(m.w < 0 ? -1 : 1 - m.w, m.text, true),
  s: m => { remote.push(m); if (m.tm !== undefined && !S.host) S.timer = m.tm; },
  hit: m => { // apanhei: eu resolvo (esquiva perfeita/invencível na MINHA tela vale). Status/puxão/etc. aplicam aqui.
    const def = ATTACKS[m.kind];
    if (!def || player.ko || player.invuln) return;
    const att = m.pos ? { pos: new THREE.Vector3(...m.pos), vel: new THREE.Vector3(), stunT: 0, atk: null } : enemy; // projétil/zona: vem do ponto
    const res = player.receive(att, def, { mul: m.mul, counter: m.counter, crit: m.crit, dir: m.dir, x: m.x, by: enemy });
    const point = new THREE.Vector3(player.pos.x, player.pos.y + player.height * 0.65, player.pos.z), dmg = Math.round(player.lastDmg);
    events.push({ type: res, f: enemy, victim: player, kind: m.kind, point, dmg, combo: player.comboN, counter: m.counter, crit: m.crit });
    net.send({ t: 'res', res, kind: m.kind, p: point.toArray(), combo: player.comboN, crit: m.crit, counter: m.counter, dmg, melee: !m.pos });
  },
  res: m => { // resultado do meu golpe (energia, combo, evento)
    if (m.res === 'parry' && m.melee) { // levei parry: cambaleio (projétil rebatido não me atordoa)
      const nx = player.pos.x - enemy.pos.x, nz = player.pos.z - enemy.pos.z, l = Math.hypot(nx, nz) || 1;
      Object.assign(player, { stunT: 0.7, flashT: 0.12, atk: null });
      player.vel.x = (nx / l) * 8;
      player.vel.z = (nz / l) * 8;
    }
    AB.result(player, enemy, m.kind, m.res, new THREE.Vector3(...m.p), m.dmg, m.combo, m.counter, m.crit);
  },
  ab: m => AB.remote(enemy, m), // habilidade do oponente: cópia só visual do projétil/zona/lacaio (quem acerta é decidido por ele)
};
// ---- lobby (src/lobby.js): salas, partida rápida, pronto e revanche. Os 2 prontos → 'prep' (lutadores, mapa, seed): monto a
// luta e aviso 'loaded'. Os 2 carregaram → 'go': o host (vaga 0) começa o round 1 e segue mandando nos rounds ('round'/'end').
lobby.setNick(settings.nick || '');
lobby.on('welcome', st => { if (settings.nick !== st.nick) { settings.nick = st.nick; save(); } }); // apelido gerado fica salvo
lobby.on('msg', m => NET[m.t]?.(m));
lobby.on('prep', m => {
  const me = m.players[m.you], foe = m.players[1 - m.you];
  Object.assign(S, { online: true, host: m.you === 0, need: (m.bo + 1) / 2, seed: m.seed, map: m.map, state: 'menu' });
  enemy.remote = true;
  T.hp = HP.normal; // online: vida padrão pros dois
  if (CHARACTERS[me.char]) settings.char = me.char;
  setCharacters(foe.char);
  $('eName').textContent = `${foe.nick} · ${CHARACTERS[enemy.char]}`.toUpperCase();
  clearHazards();
  makePips();
  lobby.loaded(); // ponytail: os lutadores já vêm carregados do início; quando houver mapa que carrega, esperar ele aqui
});
lobby.on('go', () => {
  if (S.host) { S.wins = [0, 0]; S.round = 1; startRound(); } // o convidado começa quando chega o 'round' do host
  if (input.locked) menu.hide(); else showPause(); // mouse solto: pausa com VOLTAR (o clique trava o mouse)
});
lobby.on('room', r => {
  if (S.online && (!r || r.st === 'waiting')) leaveMatch(); // a partida acabou no servidor (voltar pra sala, tempo do resultado)
  if (!r || S.online) return;
  // tela antiga 'online' (código + CONECTAR); a nova do menu.js escuta o lobby sozinha
  const foe = r.players[1 - r.you];
  if ($('room')) $('room').value = r.code;
  netStatus(foe ? `${foe.nick} (${CHARACTERS[foe.char] || foe.char}) entrou${foe.ready ? ' e está PRONTO' : ''}! Clique em ENTRAR NA LUTA.` : `Sala ${r.code}: esperando o oponente... manda o código (ou o link ${lobby.inviteLink()}) pro seu amigo.`, !!foe);
});
lobby.on('peerLeft', () => leaveMatch('O oponente saiu.'));
lobby.on('lost', () => leaveMatch(ERR.gone));
lobby.on('error', e => netStatus(e.text));
function onlineActions() { // chamada no initMenu (lá em cima): por isso é function
  const char = () => settings.char;
  return {
    connect: () => { // tela antiga: código vazio = cria sala; com código = entra
      sfx.unlock();
      const code = $('room')?.value.trim().toUpperCase();
      if (code && code === lobby.state.room?.code) return; // já está nessa sala
      lobby.leave();
      if (code) lobby.joinRoom(code, char()); else lobby.createRoom({ char: char() });
      netStatus('Conectando...');
    },
    leaveOnline: () => goOffline(),
    enterFight: () => { lobby.ready(true); lockPointer(); },
    // atalhos pra tela nova (ou ela chama o lobby direto)
    quick: () => { sfx.unlock(); lobby.quickMatch(char()); },
    createRoom: o => lobby.createRoom({ ...o, char: char() }),
    joinRoom: code => lobby.joinRoom(typeof code === 'object' ? code.code : code, char()),
    cancelSearch: () => lobby.cancel(),
    leaveRoom: () => lobby.leave(),
    setReady: (on = true) => { lobby.ready(on); if (on) lockPointer(); },
    refreshRooms: () => lobby.list(true),
    rematch: () => lobby.rematch(true),
    changeChar: k => { if (CHARACTERS[k]) { settings.char = k; save(); lobby.pick(k); } },
  };
}

function startMatch() {
  T.hp = HP[settings.fightLen] || HP.normal;
  setCharacters(); // bot sorteia outro personagem a cada partida
  makePips();
  S.wins = [0, 0];
  S.round = 1;
  startRound();
}
function startRound() {
  const guest = S.online && !S.host; // convidado nasce do outro lado
  player.reset(new THREE.Vector3(0, 0, guest ? -7 : 7), guest ? Math.PI : 0);
  enemy.reset(new THREE.Vector3(0, 0, guest ? 7 : -7), guest ? 0 : Math.PI);
  input.yaw = player.yaw;
  input.pitch = 0;
  bot.reset(Math.PI);
  remote.buf.length = 0;
  clearHazards();
  arena.setRadius(T.arenaRadius);
  Object.assign(S, { closing: false, lockOn: false, state: 'intro', stateT: 0, timer: S.online ? 99 : settings.roundTime || Infinity, timeScale: 1, hitstop: 0, trail: [T.hp, T.hp], slowT: 0 });
  banner(`ROUND ${S.round}`);
  if (!S.tutorial) sfx.bell();
  const last = S.wins[0] === winsNeeded() - 1 && S.wins[1] === winsNeeded() - 1; // quem ganhar leva a luta
  if (!S.tutorial) sfx.voice(last && S.round > 1 ? 'final_round' : `round_${Math.min(S.round, 5)}`, { force: true, delay: 0.45 });
  updatePips();
  if (S.online && S.host) net.send({ t: 'round', round: S.round, wins: S.wins });
}
// online: só o host decide o fim do round (o convidado recebe com force)
function endRound(winner, text, force) {
  if (!force && (S.state !== 'fight' || (S.online && !S.host))) return;
  if (S.online && S.host) net.send({ t: 'end', w: winner, text });
  if (winner >= 0) S.wins[winner]++;
  Object.assign(S, { state: 'ko', stateT: 0 });
  banner(text, 'big');
  sfx.ko();
  const won = winner === 0 ? player : winner === 1 ? enemy : null;
  sfx.voice(winner < 0 ? 'tie' : text === 'TEMPO!' ? 'time' : won.hp >= T.hp ? 'flawless_victory' : 'winner', { force: true, delay: 0.5 });
  updatePips();
}
function updateState(dt) {
  S.stateT += dt;
  if (S.state === 'intro' && S.stateT > 1.3) { S.state = 'fight'; S.stateT = 0; banner('LUTE!'); sfx.voice('fight', { force: true }); }
  if (S.state === 'fight' && S.online && enemy.ko) endRound(0, 'K.O.!');
  // arena fecha com o tempo de luta: ninguém fica parado longe do outro
  if (S.state === 'fight' && !S.tutorial) {
    const u = clamp((S.stateT - T.shrinkStart) / T.shrinkTime, 0, 1);
    if (u > 0 && !S.closing) { S.closing = true; banner('A ARENA ESTÁ FECHANDO!'); sfx.bell(); }
    arena.setRadius(T.arenaRadius + (T.arenaMin - T.arenaRadius) * u * (2 - u), S.stateT); // desacelera no fim
  } // host vê o K.O. do convidado pelo estado dele
  if (S.state === 'fight' && (!S.online || S.host) && (S.timer -= dt) <= 0) {
    S.timer = 0;
    endRound(player.hp === enemy.hp ? -1 : player.hp > enemy.hp ? 0 : 1, 'TEMPO!');
  }
  if (S.state === 'ko') {
    S.timeScale = S.stateT < 1.2 ? 0.3 : 1; // câmera lenta no K.O.
    if (S.stateT > 3.2) {
      if (Math.max(...S.wins) >= winsNeeded()) {
        S.state = 'over';
        sfx.voice(S.wins[0] > S.wins[1] ? 'you_win' : 'you_lose', { force: true });
        document.exitPointerLock();
        showOver();
      } else if (!S.online || S.host) { S.round++; startRound(); } // convidado espera o 'round' do host
    }
  }
}

// tela cheia: F11 ou Alt+Enter entram/saem a qualquer hora (com o keyboard lock o navegador não deixa o Esc
// sair rápido; o Esc fica só pra pausar)
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else enterFullscreen();
}
// keyboard lock só nas teclas usadas no jogo (Ctrl+W não fecha a aba no meio da luta); Alt+Tab, Win etc. continuam livres
function enterFullscreen() {
  const keys = [...new Set(Object.values(settings.binds).flat())].filter(c => c && !c.startsWith('Mouse'));
  return (document.documentElement.requestFullscreen?.() || Promise.reject()).then(() => navigator.keyboard?.lock?.(keys)).catch(() => {});
}
addEventListener('keydown', e => {
  if (e.code === 'F11' || (e.code === 'Enter' && e.altKey)) {
    e.preventDefault();
    if (!e.repeat) toggleFullscreen();
  }
}, true);

// ---------- HUD ----------
const hud = { pFill: $('pFill'), pTrail: $('pTrail'), eFill: $('eFill'), eTrail: $('eTrail'), timer: $('timer'), banner: $('banner'), speed: $('speed'), hurt: $('hurt'), pops: $('pops'), cross: $('cross') };
const dashPips = [];
for (let i = 0; i < T.dashCharges; i++) {
  const d = document.createElement('div');
  d.innerHTML = '<i></i>';
  $('dashes').appendChild(d);
  dashPips.push(d.firstChild);
}
function banner(text, cls = '') {
  hud.banner.textContent = text;
  hud.banner.className = '';
  void hud.banner.offsetWidth; // reinicia a animação CSS
  hud.banner.className = 'show ' + cls;
}
function updatePips() {
  document.querySelectorAll('#pWins i').forEach((el, i) => el.classList.toggle('on', S.wins[0] > i));
  document.querySelectorAll('#eWins i').forEach((el, i) => el.classList.toggle('on', S.wins[1] > i));
}
const pops = [];
function popText(p, text, cls = '', color) {
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  if (color !== undefined) el.style.color = hex(color);
  el.textContent = text;
  hud.pops.appendChild(el);
  pops.push({ el, p: p.clone(), t: 0, dx: (Math.random() - 0.5) * 40 });
}
const _v = new THREE.Vector3();
function updateHUD(dt) {
  S.trail[0] = player.hp < S.trail[0] ? damp(S.trail[0], player.hp, 3, dt) : player.hp;
  S.trail[1] = enemy.hp < S.trail[1] ? damp(S.trail[1], enemy.hp, 3, dt) : enemy.hp;
  const pct = v => (v / T.hp) * 100 + '%';
  hud.pFill.style.width = pct(player.hp);
  hud.pFill.classList.toggle('poison', !!player.st.poison); hud.eFill.classList.toggle('poison', !!enemy.st.poison);
  hud.eFill.style.width = pct(enemy.hp);
  hud.pTrail.style.width = pct(S.trail[0]);
  hud.eTrail.style.width = pct(S.trail[1]);
  // energia e poderes
  $('pMeter').style.width = player.meter + '%';
  $('eMeter').style.width = enemy.meter + '%';
  $('pMeterBox').classList.toggle('full', player.meter >= T.meterMax); // ULT pronta
  $('eMeterBox').classList.toggle('full', enemy.meter >= T.meterMax);
  updateBar();
  updateStatus(player, $('pSts'));
  updateStatus(enemy, $('eSts'));
  $('dashes').classList.toggle('full', player.charges >= T.dashCharges); // cargas do dash só aparecem quando faltam
  hud.timer.textContent = Number.isFinite(S.timer) ? Math.ceil(S.timer) : '∞';
  dashPips.forEach((el, i) => {
    const k = i < player.charges ? 1 : i === player.charges ? player.rechargeT / T.dashRecharge : 0;
    el.style.transform = `scaleY(${k})`;
    el.parentNode.classList.toggle('full', k >= 1);
  });
  const hs = Math.hypot(player.vel.x, player.vel.z);
  const sp = player.dashT > 0 ? 1 : player.sliding ? 0.6 : clamp((hs - 9) / 8, 0, 0.6);
  hud.speed.style.opacity = S.view3 ? sp * 0.5 : sp;
  hud.speed.style.transform = `rotate(${Math.random() * 360}deg) scale(1.3)`;
  hud.hurt.style.opacity = Math.max(0, +hud.hurt.style.opacity - dt * 3);
  hud.cross.classList.toggle('hot', player.reach(enemy, ATTACKS.light) <= 0 && !enemy.ko);
  updateWarning();
  updateLockMark();
  for (let i = pops.length - 1; i >= 0; i--) {
    const o = pops[i];
    o.t += dt;
    _v.copy(o.p).project(camera);
    const vis = _v.z < 1 && o.t < 0.8;
    o.el.style.opacity = vis ? 1 - Math.max(0, o.t - 0.5) / 0.3 : 0;
    o.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth + o.dx * o.t}px, ${(-_v.y * 0.5 + 0.5) * innerHeight - o.t * 90}px) translate(-50%,-50%) scale(${1 + Math.max(0, 0.15 - o.t) * 4})`;
    if (o.t >= 0.8) { o.el.remove(); pops.splice(i, 1); }
  }
}

// ---------- barra de habilidades + status ----------
// tecla curta pro HUD (Mouse Lateral 1 não cabe no quadrinho)
function keyCap(a) {
  const c = settings.binds[a]?.find(Boolean), SHORT = { Mouse0: 'M1', Mouse1: 'M3', Mouse2: 'M2', Mouse3: 'M4', Mouse4: 'M5', ShiftLeft: '⇧', ShiftRight: '⇧', Space: '␣', ControlLeft: 'Ctrl' };
  return c ? SHORT[c] || keyName(c) : '—';
}
// monta os quadrinhos (E R Z | X | G) do seu lutador; roda de novo ao trocar lutador ou teclas
function buildBar() {
  const bar = $('abBar'), kit = AB.kitOf(settings.char), col = '#' + kit.color.toString(16).padStart(6, '0'), list = [...AB.SLOTS, 'grab'];
  bar.innerHTML = list.map(s => {
    const ab = kit.abilities[s] || { name: 'GIRO', glyph: '🌪' }, ico = ab.icon ? `<img class="ico" src="${ab.icon}" alt="">` : `<i class="ico">${ab.glyph || '✦'}</i>`;
    return `<div class="sk ${s === 'ult' || s === 'grab' ? 'sk--' + s : ''}" id="sk-${s}" style="--c:${s === 'grab' ? '#7fd8ff' : col}">${ico}<kbd>${keyCap(s)}</kbd><span class="num"></span><em class="nm">${ab.name}</em></div>`;
  }).join('');
  bar._s = list.map(s => ({ s, el: $('sk-' + s), num: $('sk-' + s).querySelector('.num'), was: 0 }));
}
// todo quadro: varredura da recarga, segundos, longe/sem energia/preso, ULT enchendo; pisca quando volta (a2/a3/ult)
function updateBar() {
  const bar = $('abBar');
  if (!bar._s) return;
  const H = AB.hud(player, enemy), d = Math.hypot(enemy.pos.x - player.pos.x, enemy.pos.z - player.pos.z);
  for (const x of bar._s) {
    const h = x.s === 'grab'
      ? { cd: player.grabCd, cdMax: T.grabCooldown, why: S.online ? 'online' : player.grabCd > 0 ? 'cd' : null, far: d > T.grabRange }
      : H[AB.SLOTS.indexOf(x.s)];
    const cool = h.cd > 0, k = cool && h.cdMax ? Math.min(1, h.cd / h.cdMax) : 0, el = x.el;
    setVar(el, '--cd', k.toFixed(2));
    setText(x.num, cool ? (h.cd < 1 ? h.cd.toFixed(1) : String(Math.ceil(h.cd))) : x.s === 'ult' && player.meter < T.meterMax ? Math.floor(player.meter) + '%' : '');
    el.classList.toggle('cool', cool);
    el.classList.toggle('far', !!h.far && !cool);
    el.classList.toggle('no', !!h.why && !['cd', 'far'].includes(h.why) && !h.locked);
    el.classList.toggle('locked', !!h.locked);
    el.classList.toggle('active', !!h.active);
    if (x.s === 'ult') { setVar(el, '--e', (player.meter / T.meterMax).toFixed(2)); el.classList.toggle('full', player.meter >= T.meterMax); }
    const ready = x.s === 'ult' ? player.meter >= T.meterMax : !cool;
    if (ready && !x.was && x.s !== 'a1' && S.state === 'fight') { el.classList.remove('sk--pop'); void el.offsetWidth; el.classList.add('sk--pop'); if (x.s === 'ult') sfx.voice('prepare_yourself'); }
    x.was = ready;
  }
}
// chips de status embaixo da vida (PRESO, VENENO x2...): monta quando a lista muda; a barrinha = tempo que falta
function updateStatus(f, el) {
  const ids = Object.keys(f.st), key = ids.map(id => id + f.st[id].n).join();
  if (el._key !== key) {
    el._key = key;
    el.innerHTML = ids.map(id => { const d = AB.STATUS[id] || {}; return `<i style="--c:#${(d.color ?? 0xffffff).toString(16).padStart(6, '0')}"><b>${d.icon || '•'}</b>${d.name || id}${f.st[id].n > 1 ? ' x' + f.st[id].n : ''}</i>`; }).join('');
    el._t0 = {};
  }
  ids.forEach((id, i) => {
    const s = f.st[id], t0 = (el._t0[id] = Math.max(el._t0[id] || 0, s.t)), c = el.children[i];
    if (!c) return;
    setVar(c, '--k', (s.t / t0).toFixed(2));
    c.classList.toggle('end', s.t < 0.5);
  });
}

// ---------- aviso de ataque do oponente ----------
// k = 0..1 até o golpe chegar. Funciona com o bot (tell) e com qualquer oponente (windup). Habilidade usa o warn do kit.
// Só avisa o que está no alcance; soco rápido não (é mais rápido que o reflexo: aviso vira ruído).
const WARN = {
  lunge: ['#ffd23f', 'INVESTIDA!'], heavy: ['#ff4b3e', 'DESVIE!'], sweep: ['#b06bff', 'PULE OU AGACHE!'],
  grab: ['#ffffff', 'AGARRÃO! SAIA!'], zone: ['#ff6a2f', 'SAIA DO CÍRCULO!'],
};
function threat() {
  const e = enemy, p = player;
  if (S.state !== 'fight' || e.ko || p.ko || p.heldBy || e.grab) return null; // preso no giro: não tem o que desviar
  const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z, d = Math.hypot(dx, dz);
  const near = def => !!def && d < (def.slot ? def.aimRange || def.radius || def.range || 3 : def.radius ?? def.range ?? 2.5) + 2.5;
  if (p.danger) return { kind: p.dangerKind, k: p.incoming > 0 ? 1 : 0.6, zone: true };
  if (e.tell && e.tell.kind !== 'light' && near(ATTACKS[e.tell.kind])) return { kind: e.tell.kind, k: Math.min(1, e.tell.el / e.tell.total) };
  const a = e.atk;
  if (a?.phase === 'windup' && a.kind !== 'light' && near(a.def)) return { kind: a.kind, k: a.t / a.def.windup };
  if (e.sliding && d < 6) return { kind: 'sweep', k: clamp(1 - (d - 2) / 4, 0, 1) };
  const toward = (e.vel.x * dx + e.vel.z * dz) / (d || 1);
  if (e.dashT > 0 && d < 9 && toward > 10 && !a?.def.through) return { kind: 'lunge', k: clamp(1 - (d - 2.5) / 6, 0, 1) };
  return null;
}
const _cam = new THREE.Vector3();
function updateWarning() {
  // um aviso só: anel fechando + tecla certa + o que fazer; verde "AGORA!" = janela da esquiva perfeita aberta
  const th = settings.warnings ? threat() : null, left = S.state === 'fight' && settings.dodgeHint ? player.perfectLeft(enemy) : -1, now = left >= 0;
  const W = $('threat'), mark = $('mark');
  W.classList.toggle('show', !!th || now);
  W.classList.toggle('now', now);
  W.classList.toggle('zone', !!th?.zone && !now);
  if (th || now) {
    const [color, text] = th ? WARN[th.kind] || ATTACKS[th.kind]?.warn || (th.zone ? WARN.zone : WARN.heavy) : ['#5dff7a', ''];
    setVar(W, '--c', color);
    setText(W.children[2], now ? 'AGORA!' : text);
    setText(W.children[1], now ? keyCap('dodge') : th.zone ? '' : /PULE/.test(text) ? keyCap('jump') : keyCap('dodge'));
    setVar(W, '--s', (now ? 1 + 1.7 * Math.min(1, left / T.perfectWindow) : 2.6 - 1.6 * th.k).toFixed(2));
    if (th) mark.style.setProperty('--c', color);
  }
  // "!" em cima da cabeça do oponente; fora da tela vira seta na borda
  _cam.set(enemy.pos.x, enemy.pos.y + enemy.height + 0.45, enemy.pos.z);
  camera.worldToLocal(_cam);
  const visible = !enemy.ko && PLAYING.includes(S.state);
  let x, y, off = false;
  if (_cam.z < 0) {
    _v.set(enemy.pos.x, enemy.pos.y + enemy.height + 0.45, enemy.pos.z).project(camera);
    x = _v.x; y = _v.y;
    off = Math.abs(x) > 0.92 || Math.abs(y) > 0.88;
  } else off = true;
  if (off) {
    const a = Math.atan2(_cam.y, _cam.x) || 0, r = 0.85;
    x = Math.cos(a) * r; y = Math.sin(a) * r;
    mark.querySelector('b').style.transform = `rotate(${-a}rad)`;
  }
  mark.classList.toggle('off', off);
  mark.classList.toggle('hot', !!th);
  mark.style.opacity = visible && (th || off) ? 1 : 0;
  mark.style.transform = `translate(${(x * 0.5 + 0.5) * innerWidth}px, ${(-y * 0.5 + 0.5) * innerHeight}px) translate(-50%,-50%) scale(${th ? 1 + Math.sin(performance.now() * 0.03) * 0.08 : 0.7})`;
}

// ---------- câmera: trancos e zoom com mola ----------
function camKick(pitch, yaw, roll) { const k = 16 * settings.shake; S.kpv += pitch * k; S.kyv += yaw * k; S.krv += roll * k; }
function camZoom(df) { S.kzv += df * 14; }
function springs(dt) {
  for (const k of ['kp', 'ky', 'kr', 'kz']) {
    S[k + 'v'] += (-S[k] * 230 - S[k + 'v'] * 17) * dt;
    S[k] += S[k + 'v'] * dt;
  }
}

// projéteis, zonas e lacaios das habilidades somem (fim de round, voltar pro menu)
function clearHazards() { AB.clear(); }

// ---------- efeitos das habilidades ----------
// Cada kit (src/abilities/<char>.js) desenha os seus em fx.start/active/tick/hit, lidos do estado: valem igual pro oponente online.
const theme = f => AB.colorOf(f.char);
const hex = c => '#' + c.toString(16).padStart(6, '0');
function flashScreen(a, color = '#fff') {
  const el = $('flash');
  el.style.background = color;
  el.animate([{ opacity: a }, { opacity: 0 }], { duration: 350, easing: 'ease-out' });
}
function watchAttacks(sim) {
  AB.watch(sim); // começo/active/rastro/fim de cada habilidade + visual dos status
  for (const f of [player, enemy]) {
    if (f.grab && !f.tornado) f.tornado = fx.tornado(theme(f));
    if (f.tornado) {
      if (f.grab) {
        fx.tornadoUpdate(f.tornado, f, sim);
        const half = Math.floor(f.grab.turns * 2); // "vush" a cada meia volta
        if (half !== f.whoosh) { f.whoosh = half; sfx.swing(true, vol(f) * (0.6 + 0.4 * Math.min(1, f.grab.t / T.spinTime))); }
      } else { fx.tornadoOff(f.tornado); f.tornado = null; }
    }
    if (sim > 0 && f.thrown && !f.grounded && (f.trailT = (f.trailT || 0) - sim) <= 0) {
      f.trailT = 0.018;
      fx.puff(new THREE.Vector3(f.pos.x, f.pos.y + 0.2, f.pos.z), 0xffffff, 0.9, 0.3);
      fx.puff(new THREE.Vector3(f.pos.x, f.pos.y + 0.2, f.pos.z), theme(f.thrown), 0.5, 0.25);
    }
  }
  document.body.classList.toggle('charging', !!player.atk?.def.ult && player.atk.phase === 'windup');
}

// habilidade/giro que não saiu: balança só o quadrinho dele e diz o motivo em cima dele
const DENY = { meter: 'FALTA ENERGIA', far: 'CHEGUE MAIS PERTO', root: 'PRESO!', silence: 'SILENCIADO!', air: 'SÓ NO CHÃO', locked: 'EM BREVE', online: 'SÓ CONTRA O BOT' };
function denyPower(p, why) {
  const box = $('sk-' + p);
  if (!box) return;
  box.classList.remove('deny'); void box.offsetWidth; box.classList.add('deny');
  box.querySelector('.msg')?.remove();
  const msg = document.createElement('i');
  msg.className = 'msg';
  const cd = p === 'grab' ? player.grabCd : player.slots?.[p]?.cd || 0;
  msg.textContent = why === 'cd' ? `RECARGA ${cd < 1 ? cd.toFixed(1) : Math.ceil(cd)}s` : why === 'meter' ? `FALTA ENERGIA ${Math.floor(player.meter)}/${T.meterMax}` : DENY[why] || why;
  box.appendChild(msg);
  setTimeout(() => msg.remove(), 1100);
  sfx.deny();
}

// ---------- eventos de gameplay -> juice ----------
const clock = () => performance.now() / 1000;
function vol(f) { return f === player ? 1 : clamp(1 - player.pos.distanceTo(f.pos) / 35, 0.2, 1); }
function handleEvents() {
  for (const e of events) {
    if (S.tutorial) tutorial.onEvent(e);
    AB.onEvent(e); // visual do acerto de cada habilidade (kit fx.hit) + onHit de quem lançou
    const v = vol(e.f), mine = e.victim === player;
    switch (e.type) {
      case 'hit': {
        const d = ATTACKS[e.kind], heavy = e.kind !== 'light', sup = !!d?.ult, col = theme(e.f), hot = !!d?.special;
        S.hitstop = Math.max(S.hitstop, d?.hitstop ?? (sup ? 0.2 : hot ? 0.14 : heavy ? 0.11 : 0.055)); // multi-hit: hitstop curto no kit
        if (!d?.quiet) {
          fx.burst(e.point, hot ? col : heavy ? 0xffd23f : 0xffffff, sup ? 30 : heavy ? 16 : 9, sup ? 14 : heavy ? 9 : 6);
          fx.starBurst(e.point, sup ? 1.4 : heavy ? 0.85 : 0.5, hot ? col : heavy ? 0xffd23f : 0xffffff);
        }
        sfx.hit(heavy, mine ? 1 : 0.85);
        // quem apanha geme (sempre no pesado, às vezes no rápido); o K.O. tem grito de dor
        if (e.victim.ko) sfx.pain(e.victim.char.startsWith('Rogue'), vol(e.victim));
        else if ((heavy || e.combo >= 3 ? 0.75 : 0.25) > Math.random() && clock() - (e.victim.gruntT || 0) > 0.35) { e.victim.gruntT = clock(); sfx.grunt(e.victim.char.startsWith('Rogue'), vol(e.victim)); }
        if (settings.dmgNumbers) popText(e.point, e.dmg, heavy ? 'big' : '');
        if (e.crit) {
          popText(e.point.clone().setY(e.point.y + 0.9), 'CRÍTICO!', 'big orange');
          S.hitstop = Math.max(S.hitstop, 0.16);
          fx.explode(e.point, 0xff8a3d, false);
          flashScreen(mine ? 0.45 : 0.25, '#ffb070');
          S.trauma = Math.min(1, S.trauma + 0.4);
          arena.hype(0.8);
        }
        if (e.counter) popText(e.point.clone().setY(e.point.y + 0.7), 'CONTRA-ATAQUE!', 'big cyan');
        if (e.combo >= 2) popText(e.point.clone().setY(e.point.y + 0.5), `${e.combo} HITS!`, 'small combo');
        if (e.f === player && (e.combo >= T.comboMax || sup)) sfx.voice(sup ? 'excellent' : 'combo');
        S.trauma = Math.min(1, S.trauma + (mine ? (sup ? 1 : heavy ? 0.75 : 0.4) : sup ? 0.6 : heavy ? 0.3 : 0.12));
        // tranco de câmera: quem apanha é jogado pra trás/lado; quem bate sente o impacto + zoom
        if (mine) { camKick(0.05 * (heavy ? 2 : 1), (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.08); hud.hurt.style.opacity = heavy ? 0.8 : 0.45; }
        else if (e.f === player) { camKick(-0.015 * (heavy ? 2 : 1), 0, (Math.random() - 0.5) * 0.03); camZoom(heavy ? -7 : -3); }
        arena.hype(sup ? 1 : heavy ? 0.6 : 0.3);
        break;
      }
      case 'perfect':
        sfx.parry(v);
        fx.ring(e.f.pos.clone().setY(1), 0x5dff7a, 2.5);
        popText(e.f.pos.clone().setY(e.f.pos.y + 2), e.f === player ? 'ESQUIVA PERFEITA!' : 'ESQUIVOU!', 'big cyan');
        if (e.f === player) sfx.voice('perfect');
        if (e.f === player) { if (!S.online) S.slowT = 0.55; camZoom(6); }
        break;
      case 'armor': // armadura aguentou: dano reduzido, sem atordoar
        sfx.block(v); fx.burst(e.point, 0xffd9a0, 10, 6);
        popText(e.point, 'AGUENTOU!', 'big orange');
        if (settings.dmgNumbers && e.dmg) popText(e.point.clone().setY(e.point.y + 0.6), e.dmg, '');
        S.hitstop = Math.max(S.hitstop, 0.06);
        break;
      case 'status': if (settings.dmgNumbers && e.dmg) popText(e.point, e.dmg, 'small'); break; // tick sem reação (zona/aura)
      case 'resist': popText(e.f.pos.clone().setY(e.f.pos.y + 2.4), 'RESISTIU!', 'big cyan'); break; // status repetido demais
      case 'shield': { // golpe bateu no escudo sagrado
        const col = theme(e.victim);
        sfx.ding(v);
        fx.flash(e.point, col, 1.6);
        fx.shards(e.point, col, 8);
        fx.rays(e.point, col, 8, 1.4, 0.25);
        popText(e.point, 'ESCUDO!', 'big', col);
        S.hitstop = Math.max(S.hitstop, 0.06);
        break;
      }
      case 'deny': if (e.f === player) denyPower(e.power, e.why); break;
      case 'block':
        sfx.block(v);
        fx.burst(e.point, 0x7fd8ff, 6, 4);
        popText(e.point, 'DEFESA', 'small');
        S.trauma = Math.min(1, S.trauma + 0.1);
        break;
      case 'parry':
        sfx.parry();
        S.hitstop = 0.16;
        fx.starBurst(e.point, 1, 0x7fffe8);
        popText(e.point, 'PARRY!', 'big cyan');
        if (e.victim === player) sfx.voice('denied');
        S.trauma = Math.min(1, S.trauma + 0.3);
        if (e.victim === player) camZoom(5);
        arena.hype(0.6);
        break;
      case 'break':
        sfx.guardBreak(v);
        S.hitstop = 0.12;
        fx.starBurst(e.point, 0.9, 0xff8a3d);
        popText(e.point, 'QUEBROU!', 'big orange');
        S.trauma = Math.min(1, S.trauma + (mine ? 0.6 : 0.25));
        if (mine) hud.hurt.style.opacity = 0.6;
        break;
      case 'dash': sfx.dash(v); fx.dust(e.f.pos, 4); break;
      case 'chase': popText(e.f.pos.clone().setY(e.f.pos.y + 2), 'PERSEGUIÇÃO!', 'small combo'); if (e.f === player) camZoom(-5); break;
      case 'bounce': // ricochete na parede durante o dash
        sfx.block(v); fx.burst(e.point, 0x7fd8ff, 10, 6); fx.ring(e.point, 0x7fd8ff, 1.6);
        popText(e.point, 'RICOCHETE!', 'small cyan');
        S.trauma = Math.min(1, S.trauma + (e.f === player ? 0.25 : 0.08));
        break;
      case 'splat': // arremessado bateu na parede
        sfx.wall(v); fx.starBurst(e.point, 0.9, 0xff8a3d); fx.dust(e.f.pos, 8);
        popText(e.point, e.big ? 'NA PAREDE!!' : 'PAREDE!', 'big orange');
        S.hitstop = Math.max(S.hitstop, e.big ? 0.16 : 0.08);
        if (e.big) { // arremesso do furacão: impacto bem maior
          fx.explode(e.point, 0xffd23f, true);
          fx.rays(e.point, 0xffffff, 16, 3, 0.35);
          fx.rocks(e.point, 10, 7);
          sfx.boom(v);
          sfx.applause(0.6);
          if (!mine) sfx.voice('impressive'); // você arremessou o oponente na parede
          flashScreen(mine ? 0.5 : 0.3, '#fff');
          if (settings.dmgNumbers) popText(e.point.clone().setY(e.point.y + 0.7), e.dmg, 'big');
          S.trauma = Math.min(1, S.trauma + 0.5);
          arena.hype(1);
        }
        S.trauma = Math.min(1, S.trauma + (mine ? 0.6 : 0.3));
        arena.hype(0.5);
        break;
      case 'grab': // agarrou: congela um instante, flash e o nome do golpe
        S.hitstop = Math.max(S.hitstop, 0.09);
        sfx.block(v); sfx.chime(v * 0.7);
        fx.flash(e.point, 0xffffff, 2.2);
        fx.ring(e.point, theme(e.f), 2.2);
        popText(e.f.pos.clone().setY(e.f.pos.y + 2.4), 'GIRO DO FURACÃO!', 'big', theme(e.f));
        S.trauma = Math.min(1, S.trauma + 0.2);
        if (e.f === player || mine) camZoom(-6);
        arena.hype(0.7);
        break;
      case 'throw': { // soltou: vush forte, anel de vento na direção do arremesso
        const col = theme(e.f);
        sfx.dash(v); sfx.swing(true, v);
        fx.rays(e.from, 0xffffff, 14, 2.6, 0.3);
        fx.ring(e.from, col, 3);
        fx.burst(e.from, 0xffffff, 14, 10);
        if (settings.dmgNumbers) popText(e.point.clone().setY(e.point.y + 0.6), e.dmg, 'big');
        popText(e.f.pos.clone().setY(e.f.pos.y + 2.2), 'ARREMESSO!', 'big orange');
        S.hitstop = Math.max(S.hitstop, 0.06);
        S.trauma = Math.min(1, S.trauma + (mine ? 0.5 : 0.3));
        if (mine) { hud.hurt.style.opacity = 0.6; camKick(0.08, 0, (Math.random() - 0.5) * 0.1); }
        arena.hype(0.8);
        break;
      }
      case 'under': popText(e.point, 'POR BAIXO!', 'small cyan'); sfx.slide(v); break;
      case 'swing':
        sfx.swing(e.kind !== 'light', v);
        if (ATTACKS[e.kind]?.ult || ((e.kind === 'heavy' || ATTACKS[e.kind]?.special) && Math.random() < 0.5)) sfx.shout(e.f.char.startsWith('Rogue'), v); // grito no golpe forte
        break;
      case 'jump': sfx.jump(v); if (e.double) { fx.ring(e.f.pos.clone(), 0xffffff, 1.2); fx.dust(e.f.pos, 3); } break;
      case 'slide': sfx.slide(v); break;
      case 'land':
        if (e.v > 6) { sfx.land(v * Math.min(1, e.v / 14)); fx.dust(e.f.pos, 5); }
        if (e.f === player) S.dipV -= player.landImpact * 3;
        e.f.landImpact = 0;
        break;
    }
    if (e.victim?.ko && S.state === 'fight') endRound(e.victim === player ? 1 : 0, 'K.O.!');
  }
  events.length = 0;
}

// empurra um lutador do outro (exceto durante dash ou habilidade que atravessa: cross-up)
function separate(a, b) {
  if (a.dashT > 0 || b.dashT > 0 || a.atk?.def.through || b.atk?.def.through || Math.abs(a.pos.y - b.pos.y) > 1.3) return;
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = T.radius * 2;
  if (d >= min || d < 1e-5) return;
  const k = (min - d) / 2 / d;
  const ka = S.online ? 2 : 1, kb = S.online ? 0 : 1; // online: o oponente vem da rede, só eu me afasto
  a.pos.x -= dx * k * ka; a.pos.z -= dz * k * ka;
  b.pos.x += dx * k * kb; b.pos.z += dz * k * kb;
}

// ---------- câmera ----------
const _dir = new THREE.Vector3(), _aim = new THREE.Vector3(), _chest = new THREE.Vector3();
// camPitch: pra onde a câmera (e a cruz) olha; em 3ª pessoa de perto ela inclina um pouco pra baixo
const camPitch = () => input.pitch - (S.view3 ? 0.14 * (S.camNear || 0) : 0);
const viewDir = out => { const p = camPitch(), cp = Math.cos(p); return out.set(-Math.sin(input.yaw) * cp, Math.sin(p), -Math.cos(input.yaw) * cp); };

// 3ª pessoa: a câmera fica por cima do ombro, então o soco precisa sair do personagem em direção ao ponto
// que a CRUZ está mirando (senão passa ~0.8m ao lado). Ajuda leve: se a cruz passa a até 1m do peito do
// oponente, mira no peito. Mais longe que isso, mira no ponto da cruz mesmo (sem vantagem extra).
function tpsAim() {
  if (player.grab) { player.input.yaw = input.yaw; player.input.pitch = input.pitch; return; } // girando: solta pra onde a câmera olha
  viewDir(_dir);
  _chest.set(enemy.pos.x, enemy.pos.y + enemy.height * 0.6, enemy.pos.z);
  const t = _aim.subVectors(_chest, camera.position).dot(_dir);
  const miss = t > 0 ? _aim.addScaledVector(_dir, -t).length() : Infinity; // distância da cruz até o peito do oponente
  // corpo a corpo: oponente perto e mais ou menos na frente da câmera = o golpe vai nele (não precisa da cruz exata)
  const ex = enemy.pos.x - player.pos.x, ez = enemy.pos.z - player.pos.z;
  const melee = !enemy.ko && Math.hypot(ex, ez) < T.tpsMagnetRange && Math.abs(wrap(Math.atan2(-ex, -ez) - input.yaw)) < T.tpsMagnetAngle;
  if (melee) _aim.copy(_chest);
  else _aim.copy(camera.position).addScaledVector(_dir, t > 0 && miss < 1.6 ? t : (S.camDist || 3.6) + 8);
  const dx = _aim.x - player.pos.x, dz = _aim.z - player.pos.z;
  player.input.yaw = Math.atan2(-dx, -dz);
  player.input.pitch = clamp(Math.atan2(_aim.y - player.eyeY, Math.hypot(dx, dz)), -1.45, 1.45);
}

function updateCamera(dt, now) {
  const f = player;
  S.dipV += (-S.dip * 180 - S.dipV * 18) * dt; // mola do impacto ao aterrissar
  S.dip += S.dipV * dt;
  const s = Math.sin(input.yaw), c = Math.cos(input.yaw); // a câmera segue o mouse; o personagem mira no ponto da cruz
  const vr = f.vel.x * c - f.vel.z * s, hs = Math.hypot(f.vel.x, f.vel.z);
  let rollT = -vr * 0.0035 + (f.dashT > 0 ? -f.dashLocal.x * 0.06 : 0) + (f.sliding ? 0.05 : 0);
  let eyeY = f.eyeY;
  if (f.ko) { rollT = 0.5; eyeY = 0.4; }
  S.roll = damp(S.roll, rollT, 10, dt);
  const fovT = settings.fov + (f.grab || f.heldBy ? 0 : Math.max(0, hs - T.walkSpeed) * 0.9) + (f.dashT > 0 ? 8 : 0) + (f.sliding ? 6 : 0) + (f.grab ? 8 : 0);
  S.fov = damp(S.fov, fovT, 8, dt);
  springs(dt);
  camera.fov = S.fov + S.kz;
  camera.updateProjectionMatrix();

  const walk = f.grounded && !f.sliding ? Math.min(1, hs / T.walkSpeed) : 0;
  const bob = Math.abs(Math.sin(f.walkPhase)) * 0.045 * walk;
  // tremida "orgânica": várias senoides em frequências que não se repetem (parece ruído), mais rotação que posição
  S.trauma = Math.max(0, S.trauma - dt * 1.5);
  const sh = S.trauma * S.trauma * settings.shake, t = now * 0.001;
  const n = (a, b, c) => Math.sin(t * a) * 0.5 + Math.sin(t * b + 1.7) * 0.3 + Math.sin(t * c + 4.1) * 0.2;
  const shX = n(23, 41, 67) * 0.045 * sh + S.ky, shY = n(29, 37, 71) * 0.04 * sh + S.kp, shR = n(17, 31, 53) * 0.05 * sh + S.kr;

  // girado: a câmera fica em quem gira (senão roda junto e enjoa)
  const anchor = f.heldBy || f, cine = !!(f.grab || f.heldBy);
  if (f.heldBy) eyeY = 1.7;
  camera.position.set(anchor.pos.x, eyeY + S.dip + bob * (S.view3 ? 0.3 : 1), anchor.pos.z);
  if (S.view3) {
    // por cima do ombro: personagem no terço esquerdo, centro livre pro oponente e pra cruz.
    // Recua até 3.2m, mas encurta se bater na borda ou num pilar.
    viewDir(_dir);
    // luta de perto: câmera mais longe, mais alta e olhando um pouco de cima (o oponente não some atrás de você)
    const near = !enemy.ko && PLAYING.includes(S.state) ? clamp(1 - (Math.hypot(enemy.pos.x - f.pos.x, enemy.pos.z - f.pos.z) - 3) / 7, 0, 1) : 0;
    S.camNear = damp(S.camNear || 0, near, 3, dt);
    const side = 1.0 + 0.3 * S.camNear;
    const ex = camera.position.x + c * side, ez = camera.position.z - s * side, ey = camera.position.y + 0.35 + 0.65 * S.camNear;
    const blocked = (x, z) => Math.hypot(x, z) > arena.R - 0.4 || arena.pillars.some(p => Math.hypot(x - p.x, z - p.z) < p.r + 0.3);
    let d = f.thrown && !f.grounded ? 4.2 : 3.2 + 0.7 * S.camNear;
    while (d > 0.8 && blocked(ex - _dir.x * d, ez - _dir.z * d)) d -= 0.1;
    S.camDist = S.camDist ? Math.min(d, damp(S.camDist, d, 6, dt)) : d; // aproxima na hora, afasta suave
    camera.position.set(ex - _dir.x * S.camDist, Math.max(0.35, ey - _dir.y * S.camDist), ez - _dir.z * S.camDist);
  }
  // giro do furacão: câmera sobe e olha de cima pro furacão inteiro; o mouse continua girando (= pra onde vai arremessar)
  S.cineK = damp(S.cineK || 0, cine ? 1 : 0, cine ? 5 : 3, dt);
  let pitch = camPitch();
  if (S.cineK > 0.001) {
    const k = S.cineK;
    _aim.set(anchor.pos.x + s * T.cineDist, T.cineHeight, anchor.pos.z + c * T.cineDist);
    camera.position.lerp(_aim, k);
    pitch += (T.cinePitch - pitch) * k;
  }
  camera.rotation.set(pitch + shY, input.yaw + shX, S.roll + shR);
}

// ---------- loop ----------
addEventListener('resize', resize);
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
resize();
player.reset(new THREE.Vector3(0, 0, 7), 0);
enemy.reset(new THREE.Vector3(0, 0, -7), Math.PI);

// ?debug no endereço expõe o estado pra testes no console
if (location.search.includes('debug')) window.game = { tutorial, renderer, S, arena, bot, startMatch, menu, settings, fx, ab: AB, setCharacters, player, enemy, camera, fpHolder, get fpRig() { return fpRig; }, get pRig() { return pRig; }, get eRig() { return eRig; }, input, THREE, tpsAim, updateCamera, loop: t => loop(t) };

// resolução adaptativa: se o frame passa de ~20ms por um tempo, baixa a resolução interna; se sobra, sobe
const maxPR = () => Math.min(devicePixelRatio, maxDpr) * settings.resScale;
// Mede o intervalo do monitor (menor quadro de cada janela de 2 s ≈ vsync: 16,7 ms a 60 Hz, 6,9 ms a 144 Hz).
// Antes subia só com quadro < 13 ms, o que nunca acontece a 60 Hz: uma travada baixava a resolução pra sempre.
let pr = 1, frameAvg = 16, resT = 0, minDt = 1, good = 0;
function adaptRes(dt) {
  if (!settings.autoRes || dt <= 0) return;
  frameAvg += (dt * 1000 - frameAvg) * 0.05;
  minDt = Math.min(minDt, dt);
  if ((resT += dt) < 2) return;
  const v = minDt * 1000;
  minDt = 1; resT = 0;
  good = frameAvg < v * 1.15 ? good + 1 : 0; // 3 janelas boas seguidas pra subir (não fica oscilando)
  const want = frameAvg > v * 1.4 ? pr - 0.25 : good >= 3 ? pr + 0.25 : pr;
  const next = clamp(want, 0.5, maxPR());
  if (next !== pr) { pr = next; good = 0; renderer.setPixelRatio(pr); resize(); }
}

let last = performance.now(), fpsN = 0, fpsT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (settings.showFps && (fpsN++, (fpsT += (now - last) / 1000) >= 0.5)) { $('fps').textContent = Math.round(fpsN / fpsT) + ' FPS'; fpsN = fpsT = 0; }
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  const playing = PLAYING.includes(S.state);
  S.view3 = S.tps || !!(player.grab || player.heldBy || (player.thrown && !player.grounded)); // giro do furacão: 3ª pessoa
  const running = playing && (input.locked || S.online); // online não pausa
  let animDt = 0;

  if (running) {
    updateState(dt);
    const active = S.state !== 'intro';
    if (S.slowT > 0) S.slowT -= dt; // câmera lenta da esquiva perfeita
    document.body.classList.toggle('slowmo', S.slowT > 0);
    let sim = dt * S.timeScale * (S.slowT > 0 ? 0.3 : 1);
    if (S.hitstop > 0) { S.hitstop -= dt; sim = 0; } // congela no impacto
    input.fill(player.input, active && input.locked);
    if (S.view3) tpsAim();
    if (S.online) remote.apply(enemy); // oponente: estado da rede, interpolado
    else if (S.tutorial) tutorial.update(sim); // treino: o tutorial comanda o boneco
    else if (sim > 0) bot.update(sim, enemy, player, enemy.input, active);
    if (sim > 0) {
      const n = Math.ceil(sim / (1 / 120)), h = sim / n; // substeps de física a 120Hz
      for (let i = 0; i < n; i++) {
        // offline alterna quem anda primeiro (senão o jogador sempre ganha a troca de golpes no mesmo instante)
        if (S.online || !(i & 1)) { player.update(h, enemy, arena); if (!S.online) enemy.update(h, player, arena); }
        else { enemy.update(h, player, arena); player.update(h, enemy, arena); }
        separate(player, enemy);
      }
      AB.update(sim); // projéteis, zonas e lacaios das habilidades
      watchAttacks(sim);
    }
    if (S.online && (S.netT -= dt) <= 0) {
      S.netT = 1 / 30;
      net.send(snapshot(player, S.host ? { tm: Math.round(S.timer * 10) / 10 } : {}));
    }
    handleEvents();
    if ((S.ghostT -= sim) <= 0) {
      S.ghostT = 0.025;
      if (player.dashT > 0 && S.view3) fx.ghost(player, player.color);
      if (enemy.dashT > 0) fx.ghost(enemy, enemy.color);
    }
    animDt = sim;
  } else if (!playing) animDt = dt;

  if (running) lockOnCamera(dt); // pausado não puxa
  if (running && S.turnT > 0) { const st = Math.min(dt, S.turnT); input.yaw += (S.turn * st) / 0.12; S.turnT -= st; } // giro do Passo Sombrio
  // a mira responde mesmo no hitstop (3ª pessoa: mira no ponto da cruz; 1ª pessoa: igual à câmera)
  if (S.view3 && playing) tpsAim();
  else { player.input.yaw = input.yaw; player.input.pitch = input.pitch; }
  if (!player.ko) { player.yaw = player.input.yaw; player.pitch = player.input.pitch; } // caído não gira
  pRig.visible = S.view3 || !playing;
  fpRig.visible = !S.view3 && playing;
  pRig.update(player, animDt, enemy);
  eRig.update(enemy, animDt, player);
  if (player.grab) pRig.linkHands(eRig); // giro do furacão: mãos dadas
  if (enemy.grab) eRig.linkHands(pRig);
  if (fpRig.root.visible) {
    fpRig.update(player, animDt, enemy);
    // braços "atrasam" um pouco atrás do mouse (sway), presos na câmera
    S.swayX = damp(S.swayX || 0, clamp(-(input.dx / Math.max(dt, 1e-3)) * 0.00001, -0.04, 0.04), 10, dt);
    S.swayY = damp(S.swayY || 0, clamp((input.dy / Math.max(dt, 1e-3)) * 0.00001, -0.04, 0.04), 10, dt);
    fpRig.root.position.set(S.swayX, -fpRig.eyeY + S.swayY, 0);
  }
  input.dx = input.dy = 0;
  fx.update(animDt);

  if (playing) updateCamera(dt, now);
  else {
    const a = now * 0.00012;
    camera.position.set(Math.sin(a) * 15, 5, Math.cos(a) * 15);
    camera.lookAt(0, 1.2, 0);
    camera.fov = 60;
    camera.updateProjectionMatrix();
  }
  arena.sky.position.copy(camera.position);
  arena.update(now * 0.001, dt);
  // som de fundo: a torcida segue a empolgação da luta; vento enquanto alguém gira o furacão
  const spin = player.grab ? player : enemy.grab ? enemy : null;
  sfx.ambience(playing ? 0.22 : 0.08, playing ? 0.42 * clamp((arena.hypeLevel - 0.2) / 0.8, 0, 1) : 0);
  sfx.wind(spin ? 0.9 * vol(spin) * Math.min(1, spin.grab.t / 0.25) : 0, spin ? 0.8 + 0.7 * Math.min(1, spin.grab.t / T.spinTime) : 1);
  adaptRes(dt);
  updateHUD(dt);
  document.body.classList.toggle('ingame', playing);
  renderer.render(scene, camera);
}
applySettings();
loading.set(0.95, 'AFIANDO OS GOLPES...');
await paint();
renderer.compile(scene, camera); // compila os shaders agora (senão o 1º quadro trava)
requestAnimationFrame(loop);
loading.done();
if (!settings.tutorialDone) menu.show('welcome'); // primeira vez: oferece o treino antes do menu
// link de convite (?sala=CODE): entra direto na sala
const sala = new URLSearchParams(location.search).get('sala');
if (sala) {
  const q = new URLSearchParams(location.search);
  q.delete('sala');
  history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : ''));
  lobby.joinRoom(sala, settings.char);
  menu.show(onlineScreen());
}
if (window.game) window.game.lobby = lobby;
