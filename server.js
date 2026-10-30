// Servidor único do Trocação: entrega o jogo (arquivos estáticos) e liga os jogadores por WebSocket.
// Sem dependências: `node server.js` (porta 5173, ou PORT=8080 node server.js).
// Salas de 2: /ws?room=CODIGO. O 1º a entrar é o host (manda nos rounds); o servidor só repassa mensagens.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 5173;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain' };

// A hospedagem (Cloudflare na frente) guarda .js por 4h mesmo com no-cache: depois de um deploy o navegador juntava
// index.html novo com módulos velhos e o jogo travava no carregamento. Então o index.html sai com o import map
// apontando cada src/x.js pra src/x.js?v=<hash do conteúdo>: mudou o arquivo, muda o endereço (cache velho nunca é usado).
const hash = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex').slice(0, 10);
function versionedIndex() {
  const src = path.join(ROOT, 'src');
  const map = fs.readdirSync(src).filter(f => f.endsWith('.js')).map(f => `"./src/${f}": "./src/${f}?v=${hash(path.join(src, f))}"`);
  return fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace('{ "imports": {', `{ "imports": {\n  ${map.join(',\n  ')},`)
    .replace('src="src/main.js"', `src="src/main.js?v=${hash(path.join(src, 'main.js'))}"`);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (file === path.join(ROOT, 'index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
    return res.end(versionedIndex());
  }
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end('not found');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---- WebSocket mínimo (RFC 6455): só frames de texto, sem extensões
const rooms = new Map(); // código -> [sock, sock]

function send(sock, obj) {
  if (sock.destroyed) return;
  const data = Buffer.from(JSON.stringify(obj));
  const n = data.length;
  const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 127, 0, 0, 0, 0]), Buffer.from([n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255])]);
  sock.write(Buffer.concat([head, data]));
}

server.on('upgrade', (req, sock) => {
  const url = new URL(req.url, 'http://x');
  const key = req.headers['sec-websocket-key'];
  if (url.pathname !== '/ws' || !key) return sock.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true); // sem atraso de Nagle: cada pacote sai na hora

  const code = (url.searchParams.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'SALA';
  const room = rooms.get(code) || [];
  if (room.length >= 2) { send(sock, { t: 'full' }); return sock.end(); }
  room.push(sock);
  rooms.set(code, room);
  send(sock, { t: 'joined', host: room.length === 1, room: code });
  if (room.length === 2) room.forEach(s => send(s, { t: 'peer' }));

  let buf = Buffer.alloc(0);
  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const op = buf[0] & 15, masked = buf[1] & 128;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const total = off + (masked ? 4 : 0) + len;
      if (buf.length < total) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      const payload = Buffer.from(buf.subarray(total - len, total));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(total);
      if (op === 8) return sock.end();
      if (op === 9) { sock.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); continue; }
      if (op !== 1) continue;
      // repassa pro outro jogador da sala
      const other = room.find(s => s !== sock);
      if (other && !other.destroyed) {
        const n = payload.length;
        const head = n < 126 ? Buffer.from([0x81, n]) : Buffer.from([0x81, 126, n >> 8, n & 255]);
        other.write(Buffer.concat([head, payload]));
      }
    }
  });
  const leave = () => {
    const i = room.indexOf(sock);
    if (i < 0) return;
    room.splice(i, 1);
    room.forEach(s => send(s, { t: 'left' }));
    if (!room.length) rooms.delete(code);
  };
  sock.on('close', leave);
  sock.on('error', leave);
});

server.listen(PORT, () => console.log(`Trocação em http://localhost:${PORT}  (multiplayer: mesma porta, /ws)`));
