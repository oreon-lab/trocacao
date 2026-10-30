// Teste do lobby online (server.js + src/lobby.js) com jogadores simulados. Sobe o PRÓPRIO servidor na porta 5199
// (nunca mexe no da 5173), roda os cenários e derruba. Uso: node tools/lobby_test.mjs   (sai 0 = tudo certo)
import { spawn } from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
import { createLobby } from '../src/lobby.js';

const PORT = 5199, URL_ = `ws://localhost:${PORT}/ws`;
const srv = spawn(process.execPath, ['server.js'], {
  cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, PORT, PING_MS: 300, DEAD_MS: 1000, AUTO_MS: 600, PER_IP: 30, MAX_CLIENTS: 30 },
});
await new Promise(r => srv.stdout.once('data', r));
setTimeout(() => { console.error('FALHOU: travou (40s)'); srv.kill(); process.exit(1); }, 40000).unref();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const done = [];
const ok = name => { done.push(name); console.log('  ok', name); };
// próximo evento `ev` do lobby L que passa no filtro (ou falha em `ms`)
const next = (L, ev, pred = () => true, ms = 2500) => new Promise((res, rej) => {
  const t = setTimeout(() => { off(); rej(new Error(`timeout esperando ${ev}`)); }, ms);
  const off = L.on(ev, x => { if (pred(x)) { clearTimeout(t); off(); res(x); } });
});
const player = async nick => { const L = createLobby({ url: URL_ }); const w = next(L, 'welcome'); L.connect(nick); await w; return L; };
const rawWs = () => new Promise((res, rej) => { const w = new WebSocket(URL_); w.onopen = () => res(w); w.onerror = rej; });
const closed = w => new Promise(r => (w.onclose = e => r(e.code)));

try {
  // 1) conexão: apelido limpo; versão velha = erro + 4000
  const A = await player('Ana<script>'), B = await player('Bia');
  assert.equal(A.state.nick, 'Anascript');
  assert.equal(A.state.status, 'hub');
  { const w = await rawWs(); const c = closed(w); w.send(JSON.stringify({ t: 'hello', v: 1 })); assert.equal(await c, 4000); }
  ok('hello/welcome, nick sanitizado, versão velha fecha com 4000');

  // 2) lista ao vivo: sala pública aparece, privada não
  const C = await player('Caio');
  C.list(true);
  await next(C, 'rooms');
  B.createRoom({ name: 'Sala da Bia', map: 'random', bo: 3, char: 'Knight' });
  const bRoom = await next(B, 'room');
  assert.equal(bRoom.you, 0);
  assert.match(bRoom.code, /^[A-HJ-NP-Z2-9]{4}$/);
  const lst = await next(C, 'rooms', s => s.rooms.some(r => r.code === bRoom.code), 1500);
  const e = lst.rooms.find(r => r.code === bRoom.code);
  assert.deepEqual([e.name, e.host, e.n, e.st, e.char], ['Sala da Bia', 'Bia', 1, 'w', 'Knight']);
  assert.ok(e.at > 0);
  const D = await player('Davi');
  D.createRoom({ name: 'Secreta', pub: false });
  const dRoom = await next(D, 'room');
  await sleep(1200);
  assert.ok(!C.state.rooms.some(r => r.code === dRoom.code), 'sala privada não pode aparecer');
  ok('lista ao vivo (pública aparece em <=1.5s, privada não)');

  // 3) entrar por código; cheia; não existe
  A.joinRoom(bRoom.code.toLowerCase(), 'Mage');
  const [ra] = await Promise.all([next(A, 'room'), next(B, 'room', r => r.players[1])]);
  assert.equal(ra.you, 1);
  assert.equal(ra.players[0].nick, 'Bia');
  await next(C, 'rooms', s => s.rooms.find(r => r.code === bRoom.code)?.st === 'f', 1500);
  C.joinRoom(bRoom.code); assert.equal((await next(C, 'error')).code, 'full');
  C.joinRoom('ZZZZ'); assert.equal((await next(C, 'error')).code, 'notfound');
  ok('entrar por código (minúsculas ok), cheia, não encontrada');

  // 4) pick inválido; pronto → prep igual pros 2 → loaded → go
  A.pick('Dragao'); assert.equal((await next(A, 'error')).code, 'bad');
  A.pick('Rogue'); await next(B, 'room', r => r.players[1].char === 'Rogue');
  A.ready(); await next(B, 'room', r => r.players[1].ready);
  const preps = Promise.all([next(A, 'prep'), next(B, 'prep')]);
  B.ready();
  const [pa, pb] = await preps;
  assert.equal(pa.seed, pb.seed); assert.equal(pa.map, pb.map); assert.notEqual(pa.map, 'random');
  assert.deepEqual([pa.you, pb.you], [1, 0]);
  assert.deepEqual(pa.players.map(p => p.char), ['Knight', 'Rogue']);
  assert.equal(A.state.status, 'match');
  const gos = Promise.all([next(A, 'go'), next(B, 'go')]);
  A.loaded(); B.loaded();
  const [ga] = await gos;
  assert.ok(ga.at > A.serverNow() - 50, 'go.at no relógio do servidor');
  ok('pronto → prep (mesma seed/mapa/lutadores) → loaded → go');

  // 5) repasse: snapshot passa; controle forjado não
  const snap = { t: 's', p: [1, 0, 2], hp: 150 };
  A.send(snap); assert.deepEqual(await next(B, 'msg'), snap);
  A.send({ t: 'round', round: 9, wins: [0, 2] }); // convidado não manda nos rounds
  A.send({ t: 'welcome', nick: 'hacker' });
  A.send({ t: 'hit', k: 'light' });
  assert.equal((await next(B, 'msg')).t, 'hit', 'round/welcome do convidado não podem passar');
  B.send({ t: 'round', round: 1, wins: [0, 0] }); assert.equal((await next(A, 'msg')).t, 'round');
  ok('repasse de luta; round/welcome forjados barrados');

  // 6) host conta 2 rounds (melhor de 3) → over; revanche dos 2 → novo prep com seed nova
  const overs = Promise.all([next(A, 'over'), next(B, 'over')]);
  B.send({ t: 'end', w: 1 }); B.send({ t: 'end', w: 1 });
  const [oa] = await overs;
  assert.deepEqual([oa.w, oa.wins], [1, [0, 2]]);
  A.rematch(); await next(B, 'room', r => r.st === 'over' && r.players[1].rematch);
  const re = Promise.all([next(A, 'prep'), next(B, 'prep')]);
  B.rematch();
  const [r2a] = await re;
  assert.notEqual(r2a.seed, pa.seed);
  ok('fim da partida pelo host + revanche');

  // 7) sair no meio da luta = W.O.; quem fica vira host e a sala volta a esperar
  A.loaded(); B.loaded(); await next(B, 'go');
  const left = next(B, 'peerLeft'), wo = next(B, 'over'), back = next(B, 'room', r => r.st === 'waiting');
  A.leave();
  assert.equal((await left).slot, 1);
  assert.deepEqual([(await wo).why, (await wo).w], ['wo', 0]);
  assert.deepEqual([(await back).you, (await back).players[1]], [0, null]);
  assert.equal(A.state.status, 'hub');
  ok('sair no meio = W.O., sala sobrevive');

  // 8) partida rápida: o 2º pareia com quem procura (não com a sala pública mais antiga) e começa sozinha
  B.leave(); // sem salas públicas abertas
  await next(C, 'rooms', s => !s.rooms.some(r => r.code === bRoom.code), 1500);
  const Q1 = await player('Quim'), Q2 = await player('Quel');
  Q1.quickMatch('Barbarian');
  await next(Q1, 'room');
  assert.equal(Q1.state.status, 'searching');
  await next(C, 'rooms', s => s.searching === 1, 1500);
  Q2.quickMatch('Knight');
  const q2r = await next(Q2, 'room');
  assert.equal(q2r.code, Q1.state.room.code);
  assert.ok(q2r.auto > 0);
  await Promise.all([next(Q1, 'prep', undefined, 1500), next(Q2, 'prep', undefined, 1500)]);
  ok('partida rápida pareia na hora e começa sozinha');

  // 9) cancelar a procura some com a sala da lista; sem ninguém procurando, entra na sala pública mais antiga
  const Q3 = await player('Rui');
  B.createRoom({ name: 'Velha' }); const old = await next(B, 'room');
  Q3.quickMatch();
  const q3 = await next(Q3, 'room');
  assert.equal(q3.code, old.code, 'sem ninguém procurando: sala pública aberta mais antiga');
  Q3.leave();
  B.leave();
  await next(C, 'rooms', s => !s.rooms.some(r => r.code === old.code), 1500);
  Q3.quickMatch(); const q3b = await next(Q3, 'room');
  Q3.cancel();
  await next(C, 'rooms', s => !s.rooms.some(r => r.code === q3b.code), 1500);
  ok('cancelar/sair limpa a sala da lista');

  // 10) conexão morta (não responde ping) cai em DEAD+PING e libera a vaga
  const sock = net.connect(PORT, 'localhost').resume(); // lê (e descarta) os pings, mas nunca responde
  sock.write('GET /ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n');
  const t0 = Date.now();
  await new Promise(r => sock.on('close', r));
  assert.ok(Date.now() - t0 < 2500);
  // e o oponente que cai sem avisar (fecha o socket) libera a sala na hora
  const Z = await player('Zeca'); Z.createRoom({ name: 'Cai' }); const zr = await next(Z, 'room');
  Z.disconnect();
  await next(C, 'rooms', s => !s.rooms.some(r => r.code === zr.code), 1500);
  ok('batimento derruba conexão morta; desconectar limpa a sala');

  // 11) flood: rajada de 500 → corta em ~120 e depois derruba (1008); frame gigante = 1009
  {
    const F = await rawWs(), cF = closed(F);
    F.send(JSON.stringify({ t: 'hello', v: 2 }));
    await sleep(100);
    for (let i = 0; i < 500; i++) F.send(JSON.stringify({ t: 'ping', c: i }));
    assert.equal(await cF, 1008);
    const G = await rawWs(), cG = closed(G);
    G.send(JSON.stringify({ t: 'hello', v: 2 }));
    G.send(JSON.stringify({ t: 'x', pad: 'a'.repeat(5000) }));
    assert.equal(await cG, 1009);
    const H = await player('Hugo');
    let floods = 0; H.on('error', x => x.code === 'flood' && floods++);
    for (let i = 0; i < 12; i++) H.createRoom({ name: 'spam' + i }), H.leave();
    await sleep(300);
    assert.ok(floods > 0, 'comandos de lobby limitados');
  }
  ok('limite de taxa (1008), tamanho (1009) e de comandos (flood)');

  // 12) HTTP: URL quebrada não derruba; .git escondido; ETag → 304
  const base = `http://localhost:${PORT}`;
  assert.equal((await fetch(base + '/%')).status, 400);
  assert.equal((await fetch(base + '/.git/config')).status, 404);
  const r1 = await fetch(base + '/src/lobby.js'), tag = r1.headers.get('etag');
  assert.equal((await fetch(base + '/src/lobby.js', { headers: { 'If-None-Match': tag } })).status, 304);
  assert.equal((await fetch(base + '/')).status, 200);
  ok('HTTP: /% = 400 sem cair, /.git = 404, ETag 304');

  console.log(`\nLOBBY OK (${done.length} cenários)`);
  process.exitCode = 0;
} catch (e) {
  console.error('\nFALHOU:', e);
  process.exitCode = 1;
} finally {
  srv.kill();
  setTimeout(() => process.exit(), 100);
}
