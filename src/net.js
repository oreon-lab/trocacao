import { T, ATTACKS } from './config.js';
import { packStatus, unpackStatus } from './abilities/index.js';

// Conexão com a sala no servidor (mesmo host que entrega o jogo).
export class Net {
  constructor(room, on) {
    this.on = on;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(room)}`);
    this.ws.onmessage = e => { const m = JSON.parse(e.data); on[m.t]?.(m); };
    this.ws.onclose = () => on.close?.();
    this.ws.onerror = () => on.close?.();
  }
  send(o) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  close() { this.on = {}; this.ws.close(); }
}

const r2 = x => Math.round(x * 100) / 100;

// estado do meu lutador que o outro precisa pra desenhar/animar
export function snapshot(f, extra) {
  const a = f.atk;
  return {
    t: 's', ...extra,
    p: [r2(f.pos.x), r2(f.pos.y), r2(f.pos.z)], v: [r2(f.vel.x), r2(f.vel.y), r2(f.vel.z)],
    y: r2(f.yaw), pi: r2(f.pitch), h: r2(f.height), wp: r2(f.walkPhase),
    b: (f.grounded ? 1 : 0) | (f.blocking ? 2 : 0) | (f.sliding ? 4 : 0) | (f.crouching ? 8 : 0) | (f.ko ? 16 : 0),
    d: r2(f.dashT), dl: [r2(f.dashLocal.x), r2(f.dashLocal.z)], st: r2(f.stunT), fl: r2(f.flashT), hp: r2(f.hp), hd: f.hand, m: Math.round(f.meter), iv: r2(f.invulnT), sts: packStatus(f), // sts: status ativos {id:[tempo,cargas]}
    a: a ? { id: a.id, k: a.kind, ph: a.phase, t: r2(a.t), hd: a.hand, s: a.stage || undefined } : null,
  };
}

const lerp = (a, b, k) => a + (b - a) * k;
const lerpAng = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// Buffer do oponente: desenha ~100ms no passado interpolando entre dois estados recebidos (fica liso
// mesmo com a rede oscilando); se faltar pacote, extrapola um pouco pela velocidade.
export class Remote {
  constructor() { this.buf = []; }
  push(s) {
    s.at = performance.now();
    this.buf.push(s);
    if (this.buf.length > 30) this.buf.shift();
  }
  apply(f, delay = 100) {
    const b = this.buf;
    if (!b.length) return;
    const t = performance.now() - delay;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].at > t) i--;
    const A = b[Math.max(0, i - 1)], B = b[i];
    let k = B.at === A.at ? 1 : (t - A.at) / (B.at - A.at);
    let ex = 0;
    if (k > 1) { ex = Math.min((k - 1) * (B.at - A.at), 120) / 1000; k = 1; } // extrapola no máx. 120ms
    else k = Math.max(0, k);
    f.pos.set(lerp(A.p[0], B.p[0], k) + B.v[0] * ex, Math.max(0, lerp(A.p[1], B.p[1], k) + B.v[1] * ex), lerp(A.p[2], B.p[2], k) + B.v[2] * ex);
    f.vel.set(B.v[0], B.v[1], B.v[2]);
    f.yaw = f.input.yaw = lerpAng(A.y, B.y, k);
    f.pitch = f.input.pitch = lerp(A.pi, B.pi, k);
    f.height = lerp(A.h, B.h, k);
    f.walkPhase = lerp(A.wp, B.wp, k);
    // estado discreto vem do pacote mais novo já "alcançado"
    const S = k > 0.5 ? B : A;
    f.grounded = !!(S.b & 1); f.blocking = !!(S.b & 2); f.sliding = !!(S.b & 4); f.crouching = !!(S.b & 8); f.ko = !!(S.b & 16);
    f.dashT = S.d; f.dashLocal = { x: S.dl[0], z: S.dl[1] }; f.stunT = S.st; f.flashT = S.fl; f.hp = S.hp; f.hand = S.hd; f.meter = S.m || 0; f.invulnT = S.iv || 0;
    f.dashT0 = T.dashTime; f.dashIF = T.dashIFrames; // invencível no começo do dash (igual ao lado de lá)
    unpackStatus(f, S.sts);
    if (S.a) {
      if (!f.atk || f.atk.id !== S.a.id) f.atk = { id: S.a.id, kind: S.a.k, def: ATTACKS[S.a.k], hand: S.a.hd, hit: false };
      f.atk.phase = S.a.ph;
      f.atk.stage = S.a.s || 0;
      f.atk.t = S.a.t;
    } else f.atk = null;
    f.queued = null;
    f.tell = null;
  }
  get lastExtra() { return this.buf[this.buf.length - 1]; }
}
