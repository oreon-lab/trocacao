import * as THREE from 'three';
import { T, ATTACKS } from './config.js';
import { Fighter, events, damp, clamp, segSeg } from './fighter.js';
import { Rig, loadCharacters, CHARACTERS } from './rig.js';
import { createArena } from './arena.js';
import { PlayerInput } from './input.js';
import { Bot } from './bot.js';
import { Net, snapshot, Remote } from './net.js';
import { FX, sfx, audio } from './fx.js';

const $ = id => document.getElementById(id);

// ---------- cena ----------
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

const arena = createArena(scene);
const player = new Fighter('VOCÊ', 0x3fa7ff);
const enemy = new Fighter('BOT', 0xff5a4f);
await loadCharacters();
let pRig, eRig;
// 1ª pessoa: cópia do seu personagem presa na câmera (olhos = câmera), só com os braços.
// As animações FP_* (feitas no Blender) já enquadram as mãos, então não precisa de truque.
const fpHolder = new THREE.Group();
camera.add(fpHolder);
let fpRig;
const input = new PlayerInput(canvas);
const bot = new Bot();
const fx = new FX(scene, camera);

// ---------- configurações (salvas no navegador) ----------
const settings = { sens: 1, fov: 80, diff: 'normal', dbl: true, fs: true, vol: 0.6, tps: true, char: 'Barbarian' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('trocacao') || '{}')); } catch {}
const save = () => { try { localStorage.setItem('trocacao', JSON.stringify(settings)); } catch {} };
function applySettings() {
  input.sens = settings.sens;
  input.doubleTap = settings.dbl;
  audio.volume = settings.vol;
  bot.setLevel(settings.diff);
  $('sens').value = settings.sens; $('sensV').textContent = (+settings.sens).toFixed(2);
  $('fov').value = settings.fov; $('fovV').textContent = settings.fov;
  $('vol').value = settings.vol;
  $('dbl').checked = settings.dbl;
  $('fs').checked = settings.fs;
  $('tps').checked = settings.tps;
  document.querySelectorAll('[data-d]').forEach(b => b.classList.toggle('on', b.dataset.d === settings.diff));
  document.querySelectorAll('[data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === settings.char));
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
  $('pName').textContent = CHARACTERS[settings.char].toUpperCase();
  $('eName').textContent = CHARACTERS[botChar].toUpperCase() + (foeChar ? ' (ONLINE)' : ' (BOT)');
}
const charBox = $('chars');
for (const [k, label] of Object.entries(CHARACTERS)) {
  const b = document.createElement('button');
  b.dataset.c = k;
  b.textContent = label;
  b.onclick = () => { if (S.online) return; settings.char = k; applySettings(); save(); setCharacters(); };
  charBox.appendChild(b);
}
$('sens').oninput = e => { settings.sens = +e.target.value; applySettings(); save(); };
$('fov').oninput = e => { settings.fov = +e.target.value; applySettings(); save(); };
$('vol').oninput = e => { settings.vol = +e.target.value; applySettings(); save(); };
$('dbl').onchange = e => { settings.dbl = e.target.checked; applySettings(); save(); };
$('fs').onchange = e => { settings.fs = e.target.checked; save(); };
$('tps').onchange = e => { settings.tps = S.tps = e.target.checked; save(); };
document.querySelectorAll('[data-d]').forEach(b => (b.onclick = () => { settings.diff = b.dataset.d; applySettings(); save(); }));
applySettings();
setCharacters();

// ---------- estado do jogo ----------
const S = { online: false, host: false, netT: 0, state: 'menu', stateT: 0, round: 1, wins: [0, 0], timer: 99, timeScale: 1, hitstop: 0, tps: settings.tps, trauma: 0, roll: 0, dip: 0, dipV: 0, fov: 80, ghostT: 0, trail: [T.hp, T.hp], slowT: 0, kp: 0, kpv: 0, ky: 0, kyv: 0, kr: 0, krv: 0, kz: 0, kzv: 0 };
const PLAYING = ['intro', 'fight', 'ko'];
input.onToggleView = () => {
  settings.tps = S.tps = !S.tps;
  $('tps').checked = S.tps;
  save();
};

// ---------- online ----------
// Cada um simula o próprio lutador e manda o estado 30x/s; o oponente é desenhado interpolado.
// Golpe: quem bate detecta o acerto e manda 'hit'; quem apanha resolve (defesa/parry/acerto) e devolve 'res'.
let net = null;
const remote = new Remote();
const netStatus = t => ($('netStatus').textContent = t);
function goOffline(msg) {
  net?.close();
  net = null;
  S.online = S.host = false;
  enemy.remote = false;
  S.state = 'menu';
  setCharacters();
  document.exitPointerLock();
  showMenu();
  netStatus(msg || '');
}
enemy.onRemoteHit = (kind, point, mul) => net?.send({ t: 'hit', kind, mul });
const NET = {
  joined: m => { S.host = m.host; netStatus(m.host ? `Sala ${m.room}: esperando o oponente... manda o código pro seu amigo.` : `Entrando na sala ${m.room}...`); },
  full: () => goOffline('Essa sala já tem 2 jogadores.'),
  peer: () => net.send({ t: 'hello', char: settings.char }),
  hello: m => {
    S.online = true;
    enemy.remote = true;
    setCharacters(m.char);
    netStatus('Oponente conectado! Clique em ENTRAR NA LUTA.');
    if (S.host) { S.wins = [0, 0]; S.round = 1; startRound(); }
    showMenu();
  },
  round: m => { S.round = m.round; S.wins = [m.wins[1], m.wins[0]]; startRound(); },
  end: m => endRound(m.w < 0 ? -1 : 1 - m.w, m.text, true),
  s: m => { remote.push(m); if (m.tm !== undefined && !S.host) S.timer = m.tm; },
  hit: m => { // apanhei: eu resolvo (esquiva perfeita/invencível na MINHA tela vale)
    let def = ATTACKS[m.kind];
    if (!def || player.ko || player.invuln) return;
    if (m.mul > 1) def = { ...def, dmg: def.dmg * m.mul, knock: def.knock * 1.3 };
    const att = m.pos ? { pos: new THREE.Vector3(...m.pos), vel: new THREE.Vector3(), stunT: 0, atk: null } : enemy;
    const res = player.receive(att, def);
    const point = new THREE.Vector3(player.pos.x, player.pos.y + player.height * 0.65, player.pos.z);
    events.push({ type: res, f: enemy, victim: player, kind: m.kind, point, dmg: Math.round(def.dmg), combo: player.comboN, counter: m.mul > 1 });
    net.send({ t: 'res', res, kind: m.kind, p: point.toArray(), combo: player.comboN });
  },
  res: m => { // resultado do meu golpe
    const def = ATTACKS[m.kind];
    if (m.res === 'parry') {
      let nx = player.pos.x - enemy.pos.x, nz = player.pos.z - enemy.pos.z;
      const l = Math.hypot(nx, nz) || 1;
      Object.assign(player, { stunT: 0.7, atk: null });
      player.vel.x = (nx / l) * 8;
      player.vel.z = (nz / l) * 8;
    }
    player.gain(m.res === 'hit' ? 7 : m.res === 'break' ? 6 : m.res === 'block' ? 2 : 0);
    events.push({ type: m.res, f: player, victim: enemy, kind: m.kind, point: new THREE.Vector3(...m.p), dmg: def.dmg, combo: m.combo });
  },
  fire: m => spawnProj(enemy, m), // bola do oponente (só visual; quem acerta é decidido por ele)
  left: () => goOffline('O oponente saiu.'),
  close: () => S.online || net ? goOffline('Conexão perdida.') : null,
};
$('online').onclick = () => {
  sfx.unlock();
  const code = ($('room').value.trim() || Math.random().toString(36).slice(2, 6)).toUpperCase();
  $('room').value = code;
  net?.close();
  netStatus('Conectando...');
  net = new Net(code, NET);
};

function startMatch() {
  setCharacters(); // bot sorteia outro personagem a cada partida
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
  while (projs.length) removeProj(0, false);
  Object.assign(S, { state: 'intro', stateT: 0, timer: 99, timeScale: 1, hitstop: 0, trail: [T.hp, T.hp], slowT: 0 });
  banner(`ROUND ${S.round}`);
  sfx.bell();
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
  updatePips();
}
function updateState(dt) {
  S.stateT += dt;
  if (S.state === 'intro' && S.stateT > 1.3) { S.state = 'fight'; S.stateT = 0; banner('LUTE!'); }
  if (S.state === 'fight' && S.online && enemy.ko) endRound(0, 'K.O.!'); // host vê o K.O. do convidado pelo estado dele
  if (S.state === 'fight' && (!S.online || S.host) && (S.timer -= dt) <= 0) {
    S.timer = 0;
    endRound(player.hp === enemy.hp ? -1 : player.hp > enemy.hp ? 0 : 1, 'TEMPO!');
  }
  if (S.state === 'ko') {
    S.timeScale = S.stateT < 1.2 ? 0.3 : 1; // câmera lenta no K.O.
    if (S.stateT > 3.2) {
      if (Math.max(...S.wins) >= 2) {
        S.state = 'over';
        document.exitPointerLock();
        showMenu();
      } else if (!S.online || S.host) { S.round++; startRound(); } // convidado espera o 'round' do host
    }
  }
}

// ---------- menu / pointer lock ----------
function showMenu() {
  const playing = PLAYING.includes(S.state);
  $('menuTitle').textContent = S.state === 'over' ? (S.wins[0] > S.wins[1] ? 'VOCÊ VENCEU!' : 'VOCÊ PERDEU!') : playing ? (S.online ? 'ONLINE' : 'PAUSADO') : 'TROCAÇÃO';
  $('play').textContent = playing ? (S.online ? 'VOLTAR PRA LUTA' : 'CONTINUAR') : S.state === 'over' ? (S.online && !S.host ? 'ESPERANDO O HOST' : 'JOGAR DE NOVO') : S.online ? 'ENTRAR NA LUTA' : 'JOGAR';
  $('menu').classList.remove('hidden');
}
document.addEventListener('pointerlockchange', () => (input.locked ? $('menu').classList.add('hidden') : showMenu()));
$('play').onclick = () => {
  sfx.unlock();
  if (S.online) {
    // online não pausa: só trava o mouse de novo. O host recomeça a partida no fim.
    if (S.host && S.state === 'over') { S.wins = [0, 0]; S.round = 1; startRound(); }
  } else if (!PLAYING.includes(S.state)) startMatch();
  if (settings.fs && !document.fullscreenElement) {
    // tela cheia + keyboard lock deixa usar Ctrl sem o navegador roubar (Ctrl+W etc.)
    document.documentElement.requestFullscreen?.().then(() => navigator.keyboard?.lock?.()).catch(() => {});
  }
  const r = canvas.requestPointerLock({ unadjustedMovement: true });
  r?.catch?.(() => canvas.requestPointerLock()?.catch?.(() => {}));
};

// tela cheia: F11 ou Alt+Enter entram/saem a qualquer hora (com o keyboard lock o navegador não deixa o Esc
// sair rápido; o Esc fica só pra pausar)
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().then(() => navigator.keyboard?.lock?.()).catch(() => {});
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
function popText(p, text, cls = '') {
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
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
  hud.eFill.style.width = pct(enemy.hp);
  hud.pTrail.style.width = pct(S.trail[0]);
  hud.eTrail.style.width = pct(S.trail[1]);
  // energia e poderes
  $('pMeter').style.width = player.meter + '%';
  $('eMeter').style.width = enemy.meter + '%';
  $('pMeterBox').classList.toggle('full', player.meter >= T.costR);
  $('eMeterBox').classList.toggle('full', enemy.meter >= T.costR);
  $('skQ').classList.toggle('ready', player.meter >= T.costQ);
  $('skR').classList.toggle('ready', player.meter >= T.costR);
  // aviso do E: aparece quando um golpe vem; verde = agora é esquiva perfeita
  const th = threat(), now = S.state === 'fight' && player.perfectWindow(enemy);
  $('dodgeKey').classList.toggle('show', now || (!!th && th.k > 0.3) || player.incoming > 0);
  $('dodgeKey').classList.toggle('now', now);
  hud.timer.textContent = Math.ceil(S.timer);
  dashPips.forEach((el, i) => {
    const k = i < player.charges ? 1 : i === player.charges ? player.rechargeT / T.dashRecharge : 0;
    el.style.transform = `scaleY(${k})`;
    el.parentNode.classList.toggle('full', k >= 1);
  });
  const hs = Math.hypot(player.vel.x, player.vel.z);
  const sp = player.dashT > 0 ? 1 : player.sliding ? 0.6 : clamp((hs - 9) / 8, 0, 0.6);
  hud.speed.style.opacity = S.tps ? sp * 0.5 : sp;
  hud.speed.style.transform = `rotate(${Math.random() * 360}deg) scale(1.3)`;
  hud.hurt.style.opacity = Math.max(0, +hud.hurt.style.opacity - dt * 3);
  hud.cross.classList.toggle('hot', player.reach(enemy, ATTACKS.light) <= 0 && !enemy.ko);
  updateWarning();
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

// ---------- aviso de ataque do oponente ----------
// k = 0..1 até o golpe chegar. Funciona com o bot (tell) e com qualquer oponente (windup).
const WARN = {
  light: ['#ffd23f', 'DEFENDA!'], lunge: ['#ffd23f', 'INVESTIDA!'],
  heavy: ['#ff4b3e', 'DESVIE!'], sweep: ['#b06bff', 'PULE!'],
  super: ['#b06bff', 'SUPER! ESQUIVA!'], cast: ['#7fd8ff', 'ENERGIA!'],
};
function threat() {
  const e = enemy, p = player;
  if (S.state !== 'fight' || e.ko || p.ko) return null;
  const dx = p.pos.x - e.pos.x, dz = p.pos.z - e.pos.z, d = Math.hypot(dx, dz);
  if (p.incoming > 0) return { kind: 'cast', k: 1 };
  if (e.tell) return { kind: e.tell.kind, k: Math.min(1, e.tell.el / e.tell.total) };
  if (e.atk?.phase === 'windup') return { kind: e.atk.kind, k: e.atk.t / e.atk.def.windup };
  if (e.sliding && d < 6) return { kind: 'sweep', k: clamp(1 - (d - 2) / 4, 0, 1) };
  const toward = (e.vel.x * dx + e.vel.z * dz) / (d || 1);
  if (e.dashT > 0 && d < 9 && toward > 10) return { kind: 'lunge', k: clamp(1 - (d - 2.5) / 6, 0, 1) };
  return null;
}
const _cam = new THREE.Vector3();
function updateWarning() {
  const th = threat();
  const ring = $('warnRing'), lbl = $('warnText'), mark = $('mark');
  ring.style.opacity = lbl.style.opacity = th ? 1 : 0;
  if (th) {
    const [color, text] = WARN[th.kind] || WARN.light;
    ring.style.borderColor = color;
    ring.style.transform = `translate(-50%,-50%) scale(${2.6 - 1.6 * th.k})`;
    lbl.style.color = color;
    lbl.textContent = text;
    mark.style.setProperty('--c', color);
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
function camKick(pitch, yaw, roll) { S.kpv += pitch * 16; S.kyv += yaw * 16; S.krv += roll * 16; }
function camZoom(df) { S.kzv += df * 14; }
function springs(dt) {
  for (const k of ['kp', 'ky', 'kr', 'kz']) {
    S[k + 'v'] += (-S[k] * 230 - S[k + 'v'] * 17) * dt;
    S[k] += S[k + 'v'] * dt;
  }
}

// ---------- bolas de energia (Q) ----------
// Quem joga simula a bola e decide se acertou (online, manda 'hit' com kind 'proj').
// Defesa reduz o dano, E na hora certa esquiva perfeito, e PARRY rebate a bola de volta.
const projs = [];
const projGeo = new THREE.SphereGeometry(0.22, 16, 12), glowGeo = new THREE.SphereGeometry(0.42, 16, 12);
const _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
function spawnProj(owner, net0) {
  const target = owner === player ? enemy : player;
  let pos, dir;
  if (net0) { pos = new THREE.Vector3(...net0.p); dir = new THREE.Vector3(...net0.d); }
  else {
    dir = owner.lookDir(new THREE.Vector3());
    const d = owner.inCone(target, 22, 0.85); // mira assistida leve
    if (d) dir.set(target.pos.x - owner.pos.x, target.pos.y + target.height * 0.55 - owner.eyeY + 0.2, target.pos.z - owner.pos.z).normalize();
    pos = new THREE.Vector3(owner.pos.x, owner.eyeY - 0.2, owner.pos.z).addScaledVector(dir, 0.7);
    if (S.online && owner === player) net.send({ t: 'fire', p: pos.toArray(), d: dir.toArray() });
  }
  const color = owner === player ? 0x7fd8ff : 0xff7a5c;
  const mesh = new THREE.Mesh(projGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
  mesh.add(glow);
  mesh.position.copy(pos);
  scene.add(mesh);
  projs.push({ owner, mesh, glow, color, vel: dir.multiplyScalar(T.projSpeed), life: 1.6, visual: !!net0, trailT: 0 });
}
function removeProj(i, burst = true) {
  const p = projs[i];
  if (burst) { fx.burst(p.mesh.position, p.color, 12, 6); fx.ring(p.mesh.position, p.color, 1.2); }
  scene.remove(p.mesh);
  p.mesh.material.dispose();
  p.glow.material.dispose();
  projs.splice(i, 1);
}
function updateProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i], m = p.mesh;
    m.position.addScaledVector(p.vel, dt);
    p.glow.scale.setScalar(1 + Math.sin(performance.now() * 0.03) * 0.15);
    if ((p.trailT -= dt) <= 0) { p.trailT = 0.03; fx.burst(m.position, p.color, 1, 1, 0.1); }
    const target = p.owner === player ? enemy : player;
    const pos = m.position;
    if ((p.life -= dt) <= 0 || pos.y < 0 || Math.hypot(pos.x, pos.z) > arena.R || arena.pillars.some(q => Math.hypot(pos.x - q.x, pos.z - q.z) < q.r + 0.2)) { removeProj(i); continue; }
    if (target.ko) continue;
    // distância até a cápsula do alvo
    _pa.set(target.pos.x, target.pos.y + T.radius, target.pos.z);
    _pb.set(target.pos.x, target.pos.y + target.height - T.radius, target.pos.z);
    const dist = segSeg(pos, pos, _pa, _pb, _v) - T.radius - ATTACKS.proj.hitR;
    if (dist / T.projSpeed < T.perfectWindow) target.incoming = 0.05; // janela da esquiva perfeita
    if (dist > 0 || target.invuln) continue;
    if (p.visual) { removeProj(i); continue; } // bola do oponente online: quem decide é ele
    if (target.remote) { net.send({ t: 'hit', kind: 'proj', pos: pos.toArray() }); removeProj(i); continue; }
    const res = target.receive({ pos: pos.clone(), vel: new THREE.Vector3(), stunT: 0, atk: null }, ATTACKS.proj);
    events.push({ type: res, f: p.owner, victim: target, kind: 'proj', point: pos.clone(), dmg: ATTACKS.proj.dmg });
    if (res === 'parry') { // rebate!
      p.owner = target;
      p.vel.negate().multiplyScalar(1.25);
      p.color = target === player ? 0x7fd8ff : 0xff7a5c;
      p.glow.material.color.set(p.color);
      p.life = 1.6;
      continue;
    }
    p.owner.gain(res === 'hit' ? 7 : 2);
    removeProj(i);
  }
}

// ---------- eventos de gameplay -> juice ----------
function vol(f) { return f === player ? 1 : clamp(1 - player.pos.distanceTo(f.pos) / 35, 0.2, 1); }
function handleEvents() {
  for (const e of events) {
    const v = vol(e.f), mine = e.victim === player;
    switch (e.type) {
      case 'hit': {
        const heavy = e.kind !== 'light', sup = e.kind === 'super';
        S.hitstop = Math.max(S.hitstop, sup ? 0.2 : heavy ? 0.11 : 0.055);
        fx.burst(e.point, sup ? 0xb06bff : heavy ? 0xffd23f : 0xffffff, sup ? 30 : heavy ? 16 : 9, sup ? 14 : heavy ? 9 : 6);
        fx.starBurst(e.point, sup ? 1.4 : heavy ? 0.85 : 0.5, sup ? 0xb06bff : heavy ? 0xffd23f : 0xffffff);
        if (sup) fx.ring(e.point, 0xb06bff, 4);
        sfx.hit(heavy, mine ? 1 : 0.85);
        popText(e.point, e.dmg, heavy ? 'big' : '');
        if (e.counter) popText(e.point.clone().setY(e.point.y + 0.7), 'CONTRA-ATAQUE!', 'big cyan');
        if (e.combo >= 2) popText(e.point.clone().setY(e.point.y + 0.5), `${e.combo} HITS!`, 'small combo');
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
        if (e.f === player) { if (!S.online) S.slowT = 0.55; camZoom(6); }
        break;
      case 'superStart':
        sfx.guardBreak(v);
        fx.ring(e.f.pos.clone().setY(0.2), 0xb06bff, 3);
        fx.burst(e.f.pos.clone().setY(1), 0xb06bff, 18, 5);
        popText(e.f.pos.clone().setY(e.f.pos.y + 2.2), 'SUPER!', 'big orange');
        S.trauma = Math.min(1, S.trauma + 0.25);
        arena.hype(0.5);
        break;
      case 'fire': spawnProj(e.f); sfx.dash(v); break;
      case 'noMeter': if (e.f === player) { const el = $('skills'); el.querySelectorAll('div').forEach(d => { d.classList.remove('deny'); void d.offsetWidth; d.classList.add('deny'); }); } break;
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
      case 'swing': sfx.swing(e.kind !== 'light', v); break;
      case 'jump': sfx.jump(v); break;
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

// empurra um lutador do outro (exceto durante dash: dá pra atravessar = cross-up)
function separate(a, b) {
  if (a.dashT > 0 || b.dashT > 0 || Math.abs(a.pos.y - b.pos.y) > 1.3) return;
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), min = T.radius * 2;
  if (d >= min || d < 1e-5) return;
  const k = (min - d) / 2 / d;
  const ka = S.online ? 2 : 1, kb = S.online ? 0 : 1; // online: o oponente vem da rede, só eu me afasto
  a.pos.x -= dx * k * ka; a.pos.z -= dz * k * ka;
  b.pos.x += dx * k * kb; b.pos.z += dz * k * kb;
}

// ---------- câmera ----------
const _dir = new THREE.Vector3(), _aim = new THREE.Vector3(), _chest = new THREE.Vector3();
const viewDir = out => { const cp = Math.cos(input.pitch); return out.set(-Math.sin(input.yaw) * cp, Math.sin(input.pitch), -Math.cos(input.yaw) * cp); };

// 3ª pessoa: a câmera fica por cima do ombro, então o soco precisa sair do personagem em direção ao ponto
// que a CRUZ está mirando (senão passa ~0.8m ao lado). Ajuda leve: se a cruz passa a até 1m do peito do
// oponente, mira no peito. Mais longe que isso, mira no ponto da cruz mesmo (sem vantagem extra).
function tpsAim() {
  viewDir(_dir);
  _chest.set(enemy.pos.x, enemy.pos.y + enemy.height * 0.6, enemy.pos.z);
  const t = _aim.subVectors(_chest, camera.position).dot(_dir);
  const miss = t > 0 ? _aim.addScaledVector(_dir, -t).length() : Infinity; // distância da cruz até o peito do oponente
  _aim.copy(camera.position).addScaledVector(_dir, t > 0 && miss < 1.0 ? t : (S.camDist || 3.6) + 8);
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
  const fovT = settings.fov + Math.max(0, hs - T.walkSpeed) * 0.9 + (f.dashT > 0 ? 8 : 0) + (f.sliding ? 6 : 0);
  S.fov = damp(S.fov, fovT, 8, dt);
  springs(dt);
  camera.fov = S.fov + S.kz;
  camera.updateProjectionMatrix();

  const walk = f.grounded && !f.sliding ? Math.min(1, hs / T.walkSpeed) : 0;
  const bob = Math.abs(Math.sin(f.walkPhase)) * 0.045 * walk;
  // tremida "orgânica": várias senoides em frequências que não se repetem (parece ruído), mais rotação que posição
  S.trauma = Math.max(0, S.trauma - dt * 1.5);
  const sh = S.trauma * S.trauma, t = now * 0.001;
  const n = (a, b, c) => Math.sin(t * a) * 0.5 + Math.sin(t * b + 1.7) * 0.3 + Math.sin(t * c + 4.1) * 0.2;
  const shX = n(23, 41, 67) * 0.045 * sh + S.ky, shY = n(29, 37, 71) * 0.04 * sh + S.kp, shR = n(17, 31, 53) * 0.05 * sh + S.kr;

  camera.position.set(f.pos.x, eyeY + S.dip + bob * (S.tps ? 0.3 : 1), f.pos.z);
  if (S.tps) {
    // por cima do ombro: personagem no terço esquerdo, centro livre pro oponente e pra cruz.
    // Recua até 3.2m, mas encurta se bater na borda ou num pilar.
    viewDir(_dir);
    const ex = camera.position.x + c * 1.0, ez = camera.position.z - s * 1.0, ey = camera.position.y + 0.35;
    const blocked = (x, z) => Math.hypot(x, z) > arena.R - 0.4 || arena.pillars.some(p => Math.hypot(x - p.x, z - p.z) < p.r + 0.3);
    let d = 3.2;
    while (d > 0.8 && blocked(ex - _dir.x * d, ez - _dir.z * d)) d -= 0.1;
    S.camDist = S.camDist ? Math.min(d, damp(S.camDist, d, 6, dt)) : d; // aproxima na hora, afasta suave
    camera.position.set(ex - _dir.x * S.camDist, Math.max(0.35, ey - _dir.y * S.camDist), ez - _dir.z * S.camDist);
  }
  camera.rotation.set(input.pitch + shY, input.yaw + shX, S.roll + shR);
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
if (location.search.includes('debug')) window.game = { S, player, enemy, camera, fpHolder, get fpRig() { return fpRig; }, get pRig() { return pRig; }, get eRig() { return eRig; }, input, THREE, tpsAim, updateCamera };

// resolução adaptativa: se o frame passa de ~20ms por um tempo, baixa a resolução interna; se sobra, sobe
const MAX_PR = Math.min(devicePixelRatio, 2);
let pr = MAX_PR, frameAvg = 16, resT = 0;
function adaptRes(dt) {
  frameAvg += (dt * 1000 - frameAvg) * 0.05;
  if ((resT += dt) < 2) return;
  const want = frameAvg > 20 ? pr - 0.25 : frameAvg < 13 ? pr + 0.25 : pr;
  const next = clamp(want, 0.6, MAX_PR);
  if (next !== pr) { pr = next; renderer.setPixelRatio(pr); resize(); }
  resT = 0;
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const playing = PLAYING.includes(S.state);
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
    if (S.tps) tpsAim();
    if (S.online) remote.apply(enemy); // oponente: estado da rede, interpolado
    else if (sim > 0) bot.update(sim, enemy, player, enemy.input, active);
    if (sim > 0) {
      const n = Math.ceil(sim / (1 / 120)), h = sim / n; // substeps de física a 120Hz
      for (let i = 0; i < n; i++) {
        player.update(h, enemy, arena);
        if (!S.online) enemy.update(h, player, arena);
        separate(player, enemy);
      }
      updateProjs(sim);
    }
    if (S.online && (S.netT -= dt) <= 0) {
      S.netT = 1 / 30;
      net.send(snapshot(player, S.host ? { tm: Math.round(S.timer * 10) / 10 } : {}));
    }
    handleEvents();
    if ((S.ghostT -= sim) <= 0) {
      S.ghostT = 0.025;
      if (player.dashT > 0 && S.tps) fx.ghost(player, player.color);
      if (enemy.dashT > 0) fx.ghost(enemy, enemy.color);
    }
    animDt = sim;
  } else if (!playing) animDt = dt;

  // a mira responde mesmo no hitstop (3ª pessoa: mira no ponto da cruz; 1ª pessoa: igual à câmera)
  if (S.tps && playing) tpsAim();
  else { player.input.yaw = input.yaw; player.input.pitch = input.pitch; }
  if (!player.ko) { player.yaw = player.input.yaw; player.pitch = player.input.pitch; } // caído não gira
  pRig.visible = S.tps || !playing;
  fpRig.visible = !S.tps && playing;
  pRig.update(player, animDt, enemy);
  eRig.update(enemy, animDt, player);
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
  adaptRes(dt);
  updateHUD(dt);
  document.body.classList.toggle('ingame', playing);
  renderer.render(scene, camera);
}
requestAnimationFrame(loop);
