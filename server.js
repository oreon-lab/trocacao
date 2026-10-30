// Servidor único do Trocação: entrega o jogo (arquivos estáticos) e liga os jogadores por WebSocket.
// Sem dependências: `node server.js` (porta 5173, ou PORT=8080 node server.js).
// Online: 1 WebSocket por jogador em /ws (cliente e protocolo em src/lobby.js). O servidor cuida do lobby (lista de salas
// ao vivo, partida rápida, criar/entrar por código, pronto, revanche) e repassa as mensagens de luta entre os 2 da sala.
// O host (vaga 0 = quem criou a sala) manda nos rounds: 'round'/'end' só passam se vierem dele.
// ponytail: tudo em memória num processo só; reiniciar fecha as salas (o cliente recebe 'lost'). Várias instâncias = estado compartilhado (Redis), só se precisar.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const E = process.env, num = (k, d) => (E[k] ? +E[k] : d);
const PORT = num('PORT', 5173);
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

// A hospedagem (Cloudflare na frente) guarda .js por 4h mesmo com no-cache: depois de um deploy o navegador juntava
// index.html novo com módulos velhos e o jogo travava no carregamento. Então o index.html sai com o import map
// apontando cada src/x.js pra src/x.js?v=<hash do conteúdo>: mudou o arquivo, muda o endereço (cache velho nunca é usado).
const hash = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 10);
function versionedIndex() {
  const src = path.join(ROOT, 'src');
  const map = fs.readdirSync(src, { recursive: true }).map(f => f.split(path.sep).join("/")).filter(f => f.endsWith(".js")).map(f => `"./src/${f}": "./src/${f}?v=${hash(path.join(src, f))}"`);
  return fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace('{ "imports": {', `{ "imports": {\n  ${map.join(',\n  ')},`)
    .replace('src="src/main.js"', `src="src/main.js?v=${hash(path.join(src, 'main.js'))}"`);
}

const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return res.writeHead(400).end(); } // "/%" derrubava o processo
  if (rel.split(/[\\/]/).some(s => s.startsWith('.'))) return res.writeHead(404).end('not found'); // .git, .claude, ..
  let file = path.join(ROOT, rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return res.writeHead(403).end();
  fs.stat(file, (e, st) => {
    if (!e && st.isDirectory()) { file = path.join(file, 'index.html'); try { st = fs.statSync(file); } catch (x) { e = x; } }
    if (file === path.join(ROOT, 'index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
      return res.end(versionedIndex());
    }
    if (e || !st.isFile()) return res.writeHead(404).end('not found');
    // ETag fraco: o navegador revalida e recebe 304 em vez de baixar de novo ~40 MB de modelos a cada visita
    const tag = `W/"${st.size}-${Math.round(st.mtimeMs)}"`;
    if (req.headers['if-none-match'] === tag) return res.writeHead(304, { ETag: tag }).end();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', ETag: tag });
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
});

// ================= lobby + salas (WebSocket mínimo, RFC 6455: só frames de texto) =================
const NET_VERSION = 2; // igual ao de src/lobby.js: versão diferente = "aperte Ctrl+F5"
const LIM = {
  MSG: 4096, RATE: 60, BURST: 120, CMD_RATE: 2, CMD_BURST: 6,          // bytes por mensagem; msgs/s por conexão; comandos de lobby/s
  CLIENTS: num('MAX_CLIENTS', 500), PER_IP: num('PER_IP', 8), ROOMS: num('MAX_ROOMS', 200), LIST: 50,
  PING: num('PING_MS', 10000), DEAD: num('DEAD_MS', 25000),             // ping do servidor / silêncio que conta como caiu
  AUTO: num('AUTO_MS', 10000), LOAD: num('LOAD_MS', 30000), OVER: num('OVER_MS', 60000), LEAD: 600, // partida rápida começa sozinha / carregar / tela de resultado
};
// ponytail: lutadores e mapas lidos dos fontes do jogo no start (rig.js importa three, não roda no Node). Mudou a lista = reiniciar o servidor.
const readIds = (f, re) => { try { return [...fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(re)].map(m => m[1]); } catch { return []; } };
const CHARS = new Set(readIds('src/rig.js', /CHARACTERS = \{([^}]*)\}/g).join().match(/\w+(?=:)/g) ?? ['Barbarian']);
const MAPS = readIds('src/maps.js', /\bid:\s*'([\w-]+)'/g);
if (!MAPS.length) MAPS.push('castelo');
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I: fácil de ditar
const clients = new Map(); // id -> cliente
const rooms = new Map();   // código -> sala
let ids = 0, dirty = false; // dirty = a lista de salas mudou
const now = () => performance.now();

const frame = (d, op = 0x81) => Buffer.concat([d.length < 126 ? Buffer.from([op, d.length]) : Buffer.from([op, 126, d.length >> 8, d.length & 255]), d]);
const alive = c => c && !c.closing && !c.sock.destroyed; // fechando = não escreve mais nada (escrever depois do end derruba com 1006)
const send = (c, o) => { if (alive(c)) c.sock.write(frame(Buffer.from(JSON.stringify(o)))); };
const err = (c, code) => send(c, { t: 'err', code });
const bcast = (r, o) => r.seats.forEach(s => send(s?.c, o));
const kill = (c, code) => { if (!alive(c)) return; c.closing = true; c.sock.end(Buffer.from([0x88, 2, code >> 8, code & 255])); setTimeout(() => c.sock.destroy(), 1000); };
const take = (b, rate, burst) => { const t = now(); b.n = Math.min(burst, b.n + ((t - b.t) * rate) / 1000); b.t = t; if (b.n < 1) return false; b.n--; return true; };
const clean = (s, max) => String(s ?? '').normalize('NFC').replace(/[^\p{L}\p{N} _.!?-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanNick = s => { const n = clean(s, 16); return n.length >= 2 ? n : 'Lutador' + crypto.randomInt(1000, 10000); };
const need = r => (r.bo + 1) / 2;
const strike = c => { if (++c.strikes > 50) kill(c, 1008); }; // o sweeper tira 25 a cada PING

server.on('upgrade', (req, sock) => {
  sock.on('error', () => {}); // ECONNRESET antes de qualquer outro listener derrubava o processo
  const key = req.headers['sec-websocket-key'];
  if (new URL(req.url, 'http://x').pathname !== '/ws' || !key) return sock.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true); // sem atraso de Nagle: cada pacote sai na hora
  const ip = (E.TRUST_PROXY && (req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())) || sock.remoteAddress;
  const t = now(), c = { id: ++ids, sock, ip, seen: t, buf: Buffer.alloc(0), b: { n: LIM.BURST, t }, cb: { n: LIM.CMD_BURST, t }, strikes: 0, rtt: 0, room: null, slot: -1, sub: false, hello: false };
  let perIp = 0;
  for (const x of clients.values()) if (x.ip === ip) perIp++;
  if (clients.size >= LIM.CLIENTS || perIp >= LIM.PER_IP) { err(c, 'limit'); return kill(c, 1013); }
  clients.set(c.id, c);
  sock.on('data', d => onData(c, d));
  sock.on('close', () => onClose(c));
});

function onData(c, chunk) {
  if (!alive(c)) return;
  c.buf = c.buf.length ? Buffer.concat([c.buf, chunk]) : chunk;
  while (c.buf.length >= 2) {
    const b0 = c.buf[0], b1 = c.buf[1], op = b0 & 15;
    let len = b1 & 127, off = 2;
    if (!(b1 & 128) || !(b0 & 128)) return kill(c, 1002); // cliente sempre mascara; fragmentos não são aceitos
    if (len === 127) return kill(c, 1009);
    if (len === 126) { if (c.buf.length < 4) return; len = c.buf.readUInt16BE(2); off = 4; }
    if (len > LIM.MSG) return kill(c, 1009);               // teto de tamanho: ninguém enche a memória do servidor
    const total = off + 4 + len;
    if (c.buf.length < total) return;
    const mask = c.buf.subarray(off, off + 4), data = Buffer.from(c.buf.subarray(off + 4, total));
    for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
    c.buf = c.buf.subarray(total);
    c.seen = now(); // qualquer frame (inclusive o pong automático do navegador) = vivo
    if (op === 8) return kill(c, 1000);
    if (op === 9) { if (len < 126) c.sock.write(frame(data, 0x8a)); continue; }
    if (op === 1) onText(c, data);
    if (!alive(c)) return;
  }
}

// Comandos que o servidor trata; o resto (s, hit, res, fire, round, end, ...) é luta e vai pro oponente.
const H = { ping, nick, list, quick, cancel, create, join, set, pick, ready, loaded, rematch, back, leave };
const CMD = new Set(['nick', 'list', 'quick', 'create', 'join', 'set', 'pick', 'ready', 'rematch']); // limitados a 2/s
const SERVER_ONLY = new Set(['hello', 'welcome', 'pong', 'rooms', 'room', 'prep', 'go', 'over', 'peer', 'err', 'hub', 'joined', 'left', 'full']);
const HOST_ONLY = new Set(['round', 'end']);

function onText(c, data) {
  let m;
  try { m = JSON.parse(data); } catch { return strike(c); }
  if (!m || typeof m.t !== 'string' || !/^\w{1,16}$/.test(m.t)) return strike(c);
  if (!take(c.b, LIM.RATE, LIM.BURST)) return strike(c);              // passou de 60/s: descarta
  if (!c.hello) return m.t === 'hello' ? hello(c, m) : kill(c, 1008);
  if (H[m.t]) {
    if (CMD.has(m.t) && !take(c.cb, LIM.CMD_RATE, LIM.CMD_BURST)) return err(c, 'flood');
    return H[m.t](c, m);
  }
  if (SERVER_ONLY.has(m.t)) return strike(c);                          // ninguém finge ser o servidor
  relay(c, m, data);
}

function relay(c, m, data) {
  const r = c.room;
  if (!r || (r.status !== 'playing' && r.status !== 'over')) return;   // nada passa fora da luta
  if (HOST_ONLY.has(m.t) && c.slot !== 0) return strike(c);
  const p = r.seats[1 - c.slot]?.c;
  if (alive(p)) {
    const q = p.sock.writableLength;
    if (q > 1 << 20) p.sock.destroy();                                  // oponente travado: derruba
    else if (m.t !== 's' || q < 64 << 10) p.sock.write(frame(data));   // snapshot velho não serve pra nada
  }
  if (m.t === 'end' && r.status === 'playing') scored(r, m.w);
}

// ---------- lobby ----------
function hello(c, m) {
  if (m.v !== NET_VERSION) { err(c, 'version'); return kill(c, 4000); }
  c.hello = true;
  c.nick = cleanNick(m.nick);
  send(c, { t: 'welcome', id: c.id, nick: c.nick, s: Math.round(now()) });
}
function ping(c, m) { c.rtt = Math.min(5000, Math.max(0, m.r | 0)); send(c, { t: 'pong', c: +m.c || 0, s: Math.round(now()) }); }
function nick(c, m) {
  c.nick = cleanNick(m.nick);
  send(c, { t: 'welcome', id: c.id, nick: c.nick, s: Math.round(now()) });
  if (c.room) { c.room.seats[c.slot].nick = c.nick; sendRoom(c.room); dirty = true; }
}
function list(c, m) { c.sub = m.on !== false; if (c.sub && !c.room) send(c, listMsg()); }

function makeRoom(o) {
  let code;
  do code = Array.from({ length: 4 }, () => ABC[crypto.randomInt(32)]).join(''); while (rooms.has(code));
  const r = { code, born: now(), at: Date.now(), status: 'waiting', seats: [null, null], wins: [0, 0], tm: null, autoT: null, autoAt: 0, ...o };
  rooms.set(code, r);
  dirty = true;
  return r;
}
const pickMap = m => (m === 'random' || MAPS.includes(m) ? m : 'random');
function create(c, m) {
  if (c.room) return err(c, 'inroom');
  if (rooms.size >= LIM.ROOMS) return err(c, 'limit');
  const name = clean(m.name, 24);
  seat(c, makeRoom({ name: name.length >= 3 ? name : `Sala de ${c.nick}`, pub: m.pub !== false, qm: false, map: pickMap(m.map), bo: [1, 3, 5].includes(m.bo) ? m.bo : 3 }), 0, m.char);
}
function join(c, m) {
  if (c.room) return err(c, 'inroom');
  const r = rooms.get(String(m.code ?? '').toUpperCase().trim());
  if (!r) return err(c, 'notfound');
  if (r.status !== 'waiting') return err(c, 'started');
  const i = r.seats.indexOf(null);
  if (i < 0) return err(c, 'full');
  seat(c, r, i, m.char);
}
// PARTIDA RÁPIDA: (1) alguém procurando = a sala de partida rápida dele; (2) a sala pública aberta mais antiga; (3) cria uma e espera.
// O Node trata uma mensagem por vez, então 2 buscas ao mesmo tempo sempre se encontram.
function quick(c, m) {
  if (c.room) return err(c, 'inroom');
  let best = null;
  for (const r of rooms.values())
    if (r.pub && r.status === 'waiting' && r.seats.includes(null) && r.seats.some(Boolean) && (!best || r.qm > best.qm || (r.qm === best.qm && r.born < best.born))) best = r;
  if (best) return seat(c, best, best.seats.indexOf(null), m.char);
  if (rooms.size >= LIM.ROOMS) return err(c, 'limit');
  seat(c, makeRoom({ name: `Partida rápida · ${c.nick}`, pub: true, qm: true, map: 'random', bo: 3 }), 0, m.char);
}
function cancel(c) { if (c.room?.status === 'waiting') leave(c); }
function seat(c, r, i, ch) {
  r.seats[i] = { c, nick: c.nick, char: CHARS.has(ch) ? ch : [...CHARS][0], ready: false, loaded: false, rematch: false };
  c.room = r;
  c.slot = i;
  if (r.qm && r.seats.every(Boolean)) { r.autoAt = now() + LIM.AUTO; r.autoT = setTimeout(() => begin(r), LIM.AUTO); } // partida rápida começa sozinha
  sendRoom(r);
  dirty = true;
}
function set(c, m) {
  const r = c.room;
  if (!r || c.slot !== 0 || r.status !== 'waiting') return err(c, 'bad');
  const name = clean(m.name, 24);
  if (name.length >= 3) r.name = name;
  if (typeof m.pub === 'boolean') r.pub = m.pub;
  if (m.map !== undefined) r.map = pickMap(m.map);
  if ([1, 3, 5].includes(m.bo)) r.bo = m.bo;
  r.seats.forEach(s => s && (s.ready = false));
  sendRoom(r);
  dirty = true;
}
function pick(c, m) {
  const r = c.room, s = r?.seats[c.slot];
  if (r?.status !== 'waiting' || s.ready || !CHARS.has(m.char)) return err(c, 'bad');
  s.char = m.char;
  sendRoom(r);
}
function ready(c, m) {
  const r = c.room;
  if (r?.status !== 'waiting') return;
  r.seats[c.slot].ready = m.on !== false;
  sendRoom(r);
  if (r.seats.every(s => s?.ready)) begin(r);
}
// os 2 prontos / partida rápida no tempo / os 2 votaram revanche: manda 'prep' (mapa já sorteado, seed, lutadores) e espera os 2 'loaded'
function begin(r) {
  if (!r.seats.every(Boolean)) return;
  clearTimeout(r.autoT); clearTimeout(r.tm);
  r.autoAt = 0;
  r.status = 'loading';
  r.seed = crypto.randomInt(2 ** 31);
  r.mapNow = r.map === 'random' ? MAPS[r.seed % MAPS.length] : r.map;
  r.wins = [0, 0];
  r.seats.forEach((s, i) => {
    Object.assign(s, { ready: false, loaded: false, rematch: false });
    send(s.c, { t: 'prep', map: r.mapNow, seed: r.seed, bo: r.bo, you: i, players: r.seats.map(x => ({ nick: x.nick, char: x.char })) });
  });
  r.tm = setTimeout(() => backToRoom(r, 'loadfail'), LIM.LOAD);
  sendRoom(r);
  dirty = true;
}
function loaded(c) {
  const r = c.room;
  if (r?.status !== 'loading') return;
  r.seats[c.slot].loaded = true;
  if (!r.seats.every(s => s?.loaded)) return;
  clearTimeout(r.tm);
  r.status = 'playing';
  bcast(r, { t: 'go', at: Math.round(now() + LIM.LEAD) });
  sendRoom(r);
  dirty = true;
}
// o host contou um round ('end' repassado): w = vaga vencedora (-1 empate). Chegou na meta = fim da partida.
function scored(r, w) {
  if (w === 0 || w === 1) r.wins[w]++;
  if (Math.max(...r.wins) >= need(r)) matchOver(r, r.wins[0] > r.wins[1] ? 0 : 1, 'ko');
}
function matchOver(r, w, why) {
  clearTimeout(r.tm);
  r.status = 'over';
  bcast(r, { t: 'over', w, why, wins: r.wins });
  r.tm = setTimeout(() => backToRoom(r), LIM.OVER);
  sendRoom(r);
  dirty = true;
}
function rematch(c, m) {
  const r = c.room;
  if (r?.status !== 'over') return;
  r.seats[c.slot].rematch = m.on !== false;
  sendRoom(r);
  if (r.seats.every(s => s?.rematch)) begin(r); // mesmos lutadores e mapa, seed nova
}
function back(c) { if (c.room?.status === 'over') backToRoom(c.room); }
function backToRoom(r, why) {
  clearTimeout(r.tm); clearTimeout(r.autoT);
  r.autoAt = 0;
  r.status = 'waiting';
  r.seats.forEach(s => s && Object.assign(s, { ready: false, loaded: false, rematch: false }));
  if (why) bcast(r, { t: 'err', code: why });
  sendRoom(r);
  dirty = true;
}
function leave(c) {
  const r = c.room;
  if (!r) return;
  const i = c.slot;
  c.room = null;
  c.slot = -1;
  removeSeat(r, i);
  send(c, { t: 'hub' }); // confirma a saída: o que chegou antes disso era da sala
  if (c.sub) send(c, listMsg());
}
function onClose(c) {
  if (c.gone) return;
  c.gone = true;
  clients.delete(c.id);
  if (c.room) removeSeat(c.room, c.slot);
  dirty = true; // contagem de online
}
// saiu ou caiu: no meio da luta o outro ganha por W.O.; quem fica vira o host (vaga 0) e a sala volta a esperar
function removeSeat(r, i) {
  if (!r.seats[i]) return;
  const other = r.seats[1 - i];
  if (other) {
    send(other.c, { t: 'peer', ev: 'left', slot: i });
    if (r.status === 'loading' || r.status === 'playing') { r.wins[1 - i] = need(r); send(other.c, { t: 'over', w: 1 - i, why: 'wo', wins: r.wins }); }
  }
  r.seats[i] = null;
  if (!r.seats[0] && r.seats[1]) { r.seats = [r.seats[1], null]; r.seats[0].c.slot = 0; }
  if (!r.seats.some(Boolean)) { clearTimeout(r.tm); clearTimeout(r.autoT); rooms.delete(r.code); dirty = true; }
  else backToRoom(r);
}

const roomMsg = (r, you) => ({
  t: 'room', code: r.code, name: r.name, pub: r.pub, qm: r.qm, map: r.map, bo: r.bo, st: r.status, you,
  auto: r.autoAt ? Math.max(0, Math.round(r.autoAt - now())) : 0,
  players: r.seats.map(s => s && { nick: s.nick, char: s.char, ready: s.ready, ping: s.c.rtt, rematch: s.rematch }),
});
const sendRoom = r => r.seats.forEach((s, i) => send(s?.c, roomMsg(r, i)));

// ---------- lista de salas ao vivo (no máx. 1/s, só quando mudou, só pra quem está no lobby sem sala) ----------
const entry = r => ({
  code: r.code, name: r.name, host: r.seats[0]?.nick ?? '', char: r.seats[0]?.char ?? '', map: r.map, bo: r.bo, n: r.seats.filter(Boolean).length,
  st: r.status !== 'waiting' ? 'p' : r.seats.every(Boolean) ? 'f' : 'w', ping: r.seats[0]?.c.rtt ?? 0, at: r.at,
});
function listMsg() {
  const pub = [...rooms.values()].filter(r => r.pub);
  const list = pub.sort((a, b) => (a.status !== 'waiting') - (b.status !== 'waiting') || a.born - b.born).slice(0, LIM.LIST).map(entry);
  return { t: 'rooms', online: clients.size, searching: pub.filter(r => r.qm && r.status === 'waiting' && r.seats.includes(null)).length, list };
}
setInterval(() => {
  if (!dirty) return;
  dirty = false;
  const f = frame(Buffer.from(JSON.stringify(listMsg())));
  for (const c of clients.values()) if (c.sub && !c.room && alive(c)) c.sock.write(f);
}, 1000);

// ---------- batimento: ping do servidor (o navegador responde sozinho, mesmo com a aba em segundo plano) ----------
const PING_FRAME = Buffer.from([0x89, 0]);
setInterval(() => {
  const t = now();
  for (const c of clients.values()) {
    if (t - c.seen > LIM.DEAD) { c.sock.destroy(); continue; } // 'close' → onClose → libera a vaga
    if (alive(c)) c.sock.write(PING_FRAME);
    c.strikes = Math.max(0, c.strikes - 25);
  }
}, LIM.PING);

server.listen(PORT, () => console.log(`Trocação em http://localhost:${PORT}  (multiplayer: mesma porta, /ws)`));
