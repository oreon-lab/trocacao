import * as THREE from 'three';
import { toonMat, addOutline, outlineMat, smoothGeo } from './toon.js';
import { T } from './config.js';
import { SFX_FILES } from './sfxlist.js';

// ---------- partículas / estrelas de impacto / rastro do dash ----------
const matCache = new Map();
const basic = color => {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshBasicMaterial({ color }));
  return matCache.get(color);
};

function starGeo(spikes = 9) {
  const s = new THREE.Shape();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2, r = i % 2 ? 0.45 : 1 - (i % 4) * 0.08;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(r, 0);
  }
  return new THREE.ShapeGeometry(s);
}

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// brilho redondo (halo da bola, rastro, aura, clarão)
const glowTex = canvasTex(64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, '#fff');
  gr.addColorStop(0.3, 'rgba(255,255,255,.75)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
});
// coluna de luz: forte embaixo, some em cima
const fadeTex = canvasTex(64, (g, s) => {
  const gr = g.createLinearGradient(0, 0, 0, s);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(1, '#fff');
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
});
// círculo mágico do super: anéis, estrela de 6 pontas e runas
const circleTex = canvasTex(256, (g, s) => {
  g.translate(s / 2, s / 2);
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  ring(122, 7); ring(100, 3); ring(56, 4);
  g.lineWidth = 4;
  for (const off of [0, Math.PI]) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) { const a = off + (i * Math.PI * 2) / 3 - Math.PI / 2; g.lineTo(Math.cos(a) * 100, Math.sin(a) * 100); }
    g.stroke();
  }
  g.lineWidth = 3;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r1 = i % 2 ? 112 : 118;
    g.beginPath();
    g.moveTo(Math.cos(a) * 104, Math.sin(a) * 104);
    g.lineTo(Math.cos(a + 0.08) * r1, Math.sin(a + 0.08) * r1);
    g.stroke();
  }
});

// rachaduras: linhas tortas saindo do centro, com galhos. A mesma forma vira 2 texturas
// (escura = chão quebrado, branca = brilho de lava que se tinge na cor do lutador e some antes)
const crackPaths = (() => {
  const paths = [];
  const walk = (x, y, a, len, w, depth) => {
    const pts = [[x, y]];
    for (let i = 0; i < len; i++) {
      a += (Math.random() - 0.5) * 0.7;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      pts.push([x, y]);
      if (depth < 2 && Math.random() < 0.14) walk(x, y, a + (Math.random() < 0.5 ? 0.8 : -0.8), (len * 0.45) | 0, w * 0.6, depth + 1);
    }
    paths.push({ pts, w });
  };
  for (let i = 0; i < 9; i++) walk(128, 128, (i / 9) * Math.PI * 2 + Math.random() * 0.4, (12 + Math.random() * 3) | 0, 7, 0);
  return paths;
})();
const crackTex = (color, wmul, crater) => canvasTex(256, g => {
  if (crater) {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 46);
    gr.addColorStop(0, 'rgba(43,26,18,.7)');
    gr.addColorStop(1, 'rgba(43,26,18,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }
  g.strokeStyle = color;
  g.lineCap = g.lineJoin = 'round';
  for (const p of crackPaths) {
    g.lineWidth = p.w * wmul;
    g.beginPath();
    p.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
});
const crackDark = crackTex('#2b1a12', 1, true), crackLava = crackTex('#ffffff', 0.45, false);
// escudo sagrado: favo de hexágonos com borda brilhante
const hexTex = canvasTex(256, (g, s) => {
  const r = 18, h = r * Math.sqrt(3);
  g.strokeStyle = 'rgba(255,255,255,.95)';
  g.fillStyle = 'rgba(255,255,255,.16)';
  g.lineWidth = 3;
  for (let col = -1; col < s / (r * 1.5) + 1; col++) {
    for (let row = -1; row < s / h + 1; row++) {
      const cx = col * r * 1.5, cy = row * h + (col % 2 ? h / 2 : 0);
      g.beginPath();
      for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3; g.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9); }
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
  g.lineWidth = 12;
  g.strokeStyle = '#fff';
  g.strokeRect(4, 4, s - 8, s - 8);
});
// cruz de luz (Cavaleiro)
const crossTex = canvasTex(128, (g, s) => {
  g.translate(s / 2, s / 2);
  g.shadowColor = '#fff';
  g.shadowBlur = 16;
  g.fillStyle = '#fff';
  g.fillRect(-8, -44, 16, 88);
  g.fillRect(-32, -20, 64, 16);
});
// meia-lua do corte (Ladina): grossa no meio, fina nas pontas
const slashTex = canvasTex(256, (g, s) => {
  g.translate(s / 2, s / 2);
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(0, 0, 112, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.arc(28, 28, 108, 0, Math.PI * 2);
  g.fill();
});

// vento do furacão: riscos diagonais brancos com transparência (repete na horizontal)
const windTex = (() => {
  const t = canvasTex(256, (g, s) => {
    g.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * s, y = Math.random() * s, len = 40 + Math.random() * 120, w = 3 + Math.random() * 9;
      g.strokeStyle = `rgba(255,255,255,${0.6 + Math.random() * 0.4})`;
      g.lineWidth = w;
      for (const dx of [-s, 0, s]) { // emenda sem costura nas bordas
        g.beginPath();
        g.moveTo(x + dx, y);
        g.lineTo(x + dx + len, y - len * 0.28);
        g.stroke();
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
// faixa em arco no plano do chão (rastro do corpo girando): mais forte na frente, some pra trás
function arcGeo(r0, r1, len, n = 28) {
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const th = -(i / n) * len, a = Math.pow(1 - i / n, 1.6);
    for (const r of [r0, r1]) {
      pos.push(-Math.sin(th) * r, 0, -Math.cos(th) * r);
      col.push(1, 1, 1, a * (r === r0 ? 0.35 : 1));
    }
    if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  return g;
}

const T_SPIN = gr => T.spinW0 + (T.spinW1 - T.spinW0) * Math.min(1, gr.t / T.spinTime); // mesma rampa do giro no fighter

const toonCache = new Map();
const toon = c => { if (!toonCache.has(c)) toonCache.set(c, toonMat(c)); return toonCache.get(c); };
// texturas e materiais prontos pros kits de habilidade usarem
export const TEX = { glow: glowTex, fade: fadeTex, circle: circleTex, hex: hexTex, cross: crossTex, slash: slashTex, wind: windTex, crack: crackDark, crackLava };
export { basic, toon };

// ---------- reaproveitamento (nada de Mesh/material novo por partícula) ----------
// Materiais por tipo: criar + descartar 1 por efeito recompilava o programa e enchia o GC. Cada tipo = 1 programa.
// forceSinglePass: transparente DoubleSide no three desenha 2x e refaz a chave do programa 2x por quadro (~67 µs cada).
// Com cor única por objeto a ordem frente/verso não muda nada na mistura, então 1 passada fica igual.
const MK = {
  flat: () => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }),
  ghost: () => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }),
  tex: () => new THREE.MeshBasicMaterial({ map: fadeTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }),
  decal: () => new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, polygonOffset: true }),
  sprite: () => new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }),
};
const DEF = { // tudo que um efeito muda volta ao padrão quando o material é pego de novo
  flat: { color: 0xffffff, opacity: 1 }, ghost: { color: 0xffffff, opacity: 1 }, tex: { map: fadeTex, color: 0xffffff, opacity: 1 },
  decal: { map: glowTex, color: 0xffffff, opacity: 1, polygonOffsetFactor: -2 }, sprite: { map: glowTex, color: 0xffffff, opacity: 1, rotation: 0, depthTest: true },
};
const POOL = { flat: [], ghost: [], tex: [], decal: [], sprite: [] };
function take(kind, props) {
  const m = POOL[kind].pop() || MK[kind]();
  m.setValues(DEF[kind]);
  m.setValues(props);
  return m;
}
const give = (kind, ...mats) => () => POOL[kind].push(...mats);

const _m4 = new THREE.Matrix4(), _c = new THREE.Color(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _Z = new THREE.Vector3(0, 0, 1), _UP = new THREE.Vector3(0, 1, 0);
// Partículas instanciadas: todas do mesmo tipo = 1 desenho (+1 do contorno), estado em registros reaproveitados.
// fn(o, dt, k) anda com a partícula (k = 0..1 da vida); o.on = false esconde sem matar.
class Pool {
  constructor(parent, geo, mat, outline = 0, max = 512) {
    const mk = (g, m) => {
      const im = new THREE.InstancedMesh(g, m, max);
      im.count = 0;
      im.visible = false;
      im.frustumCulled = false; // a esfera de recorte do InstancedMesh não acompanha as partículas
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      parent.add(im);
      return im;
    };
    this.mesh = mk(geo, mat);
    this.mesh.setColorAt(0, _c.setRGB(1, 1, 1)); // cria instanceColor já (o programa compila no carregamento)
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    if (outline) { this.line = mk(smoothGeo(geo), outlineMat(outline)); this.line.instanceMatrix = this.mesh.instanceMatrix; }
    this.max = max;
    this.items = [];
    this.free = [];
  }
  spawn(color, life, fn) {
    if (this.items.length >= this.max) return null;
    const o = this.free.pop() || { p: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(), v: new THREE.Vector3(), w: new THREE.Vector3(), c: new THREE.Color() };
    o.p.set(0, 0, 0); o.q.identity(); o.e.set(0, 0, 0); o.s.set(1, 1, 1); o.c.set(color);
    o.t = 0; o.life = life; o.fn = fn; o.on = true; o.b = 0;
    this.items.push(o);
    return o;
  }
  update(dt) {
    const it = this.items, m = this.mesh;
    for (let i = it.length - 1; i >= 0; i--) {
      const o = it[i];
      o.t += dt;
      const k = Math.min(1, o.t / o.life);
      o.fn(o, dt, k);
      if (k >= 1) { it[i] = it[it.length - 1]; it.pop(); this.free.push(o); }
    }
    let n = 0;
    for (const o of it) if (o.on) { m.setMatrixAt(n, _m4.compose(o.p, o.q, o.s)); m.setColorAt(n, o.c); n++; }
    m.count = n;
    m.visible = n > 0;
    if (n) m.instanceMatrix.needsUpdate = m.instanceColor.needsUpdate = true;
    if (this.line) { this.line.count = n; this.line.visible = n > 0; }
  }
}
// brilhos redondos virados pra câmera (puff/flash), todos num desenho; cada um com cor, tamanho e opacidade
class Glows {
  constructor(parent, max = 1024) {
    const g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
    this.pos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage); // xyz + tamanho
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage); // rgb linear + alfa
    g.setAttribute('iPos', this.pos);
    g.setAttribute('iCol', this.col);
    g.instanceCount = 0;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { map: { value: glowTex } },
      transparent: true, depthWrite: false,
      vertexShader: `attribute vec4 iPos, iCol; varying vec2 vUv; varying vec4 vCol;
        void main() { vUv = uv; vCol = iCol; vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0); mv.xy += position.xy * iPos.w; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec4 vCol;
        void main() {
          gl_FragColor = texture2D(map, vUv) * vCol;
          #include <colorspace_fragment>
        }`,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    parent.add(this.mesh);
    this.max = max;
    this.items = [];
    this.free = [];
  }
  spawn(p, color, size, life, fn) {
    if (this.items.length >= this.max) return null;
    const o = this.free.pop() || { p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color() };
    o.p.copy(p); o.v.set(0, 0, 0); o.c.set(color);
    o.s0 = o.size = size; o.a = 0; o.t = 0; o.life = life; o.fn = fn; o.grow = false;
    this.items.push(o);
    return o;
  }
  update(dt) {
    const it = this.items, P = this.pos.array, C = this.col.array;
    for (let i = it.length - 1; i >= 0; i--) {
      const o = it[i];
      o.t += dt;
      const k = Math.min(1, o.t / o.life);
      o.fn(o, dt, k);
      if (k >= 1) { it[i] = it[it.length - 1]; it.pop(); this.free.push(o); }
    }
    for (let i = 0; i < it.length; i++) {
      const o = it[i], j = i * 4;
      P[j] = o.p.x; P[j + 1] = o.p.y; P[j + 2] = o.p.z; P[j + 3] = o.size;
      C[j] = o.c.r; C[j + 1] = o.c.g; C[j + 2] = o.c.b; C[j + 3] = o.a;
    }
    this.mesh.geometry.instanceCount = it.length;
    this.mesh.visible = it.length > 0;
    if (it.length) this.pos.needsUpdate = this.col.needsUpdate = true;
  }
}
// movimento de cada tipo de partícula (funções fixas: nada de closure nova por partícula)
const BIT = (o, dt, k) => { o.p.addScaledVector(o.v, dt); o.v.y -= 14 * dt; o.s.setScalar(o.size * (1 - k)); };
const CLOUD = (o, dt, k) => {
  o.p.addScaledVector(o.v, dt);
  o.v.multiplyScalar(Math.max(0, 1 - 3.5 * dt));
  o.s.setScalar(o.size * (k < 0.25 ? 0.35 + (k / 0.25) * 0.65 : 1 - ((k - 0.25) / 0.75) ** 1.5));
};
const ROCK = (o, dt, k) => {
  o.v.y -= 22 * dt;
  o.p.addScaledVector(o.v, dt);
  if (o.p.y < o.sy * 0.6) {
    o.p.y = o.sy * 0.6;
    if (o.b++ === 0) { o.v.y = Math.abs(o.v.y) * 0.35; o.v.x *= 0.5; o.v.z *= 0.5; } else { o.v.set(0, 0, 0); o.w.multiplyScalar(0.8); }
  }
  o.e.x += o.w.x * dt; o.e.y += o.w.y * dt; o.e.z += o.w.z * dt;
  o.q.setFromEuler(o.e);
  const g = k > 0.75 ? (1 - k) / 0.25 : 1;
  o.s.set(o.size * g, o.sy * g, o.size * g);
};
const SPIKE = (o, dt, k) => {
  const t = k * o.life - o.delay;
  if (t < 0) return;
  if (!o.on) { o.on = true; o.fx.burst(o.p, 0xe8d9b8, 2, 3, 0.1); }
  const y = t < 0.07 ? (t / 0.07) * 1.2 : t < 0.13 ? 1.2 - ((t - 0.07) / 0.06) * 0.2 : t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.3);
  o.s.set(o.size, Math.max(0.001, o.sy * y), o.size);
};
const SHARD = (o, dt, k) => {
  o.v.y -= 12 * dt;
  o.p.addScaledVector(o.v, dt);
  o.e.x += o.w.x * dt; o.e.y += o.w.y * dt;
  o.q.setFromEuler(o.e);
  o.s.setScalar(o.size * (1 - k));
};
const PUFF = (o, dt, k) => { o.p.addScaledVector(o.v, dt); o.size = o.s0 * (o.grow ? 0.5 + 0.7 * Math.sqrt(k) : 1 - k * 0.8); o.a = 0.8 * (1 - k); };
const FLASH = (o, dt, k) => { o.size = o.s0 * (0.6 + k * 0.8); o.a = 1 - k; };

const starMats = new Map(); // estrela do impacto: não some aos poucos, então 1 material por cor basta
const starMat = c => { if (!starMats.has(c)) starMats.set(c, new THREE.MeshBasicMaterial({ color: c, depthTest: false })); return starMats.get(c); };

export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.list = [];
    this.density = 1; // Configurações > Vídeo > Partículas
    this.sphere = new THREE.SphereGeometry(1, 8, 6);
    this.star = starGeo();
    this.capsule = new THREE.CapsuleGeometry(0.35, 1.1, 4, 10);
    this.ink = new THREE.MeshBasicMaterial({ color: 0x111111, depthTest: false });
    // geometrias compartilhadas pelos efeitos
    this.ball = new THREE.SphereGeometry(1, 12, 9);
    this.rockGeo = new THREE.IcosahedronGeometry(1, 0);
    this.spikeGeo = new THREE.ConeGeometry(1, 1, 5).translate(0, 0.5, 0);
    this.hexGeo = new THREE.CircleGeometry(1, 6);
    this.rayGeo = new THREE.PlaneGeometry(0.14, 1).translate(0, 0.5, 0);
    this.planeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0);
    this.ringGeo = new THREE.RingGeometry(0.8, 1, 40);
    // pedaço de esfera virado pra frente (-Z) = escudo curvo
    this.domeGeo = new THREE.SphereGeometry(1, 28, 14, Math.PI * 1.5 - 1.05, 2.1, Math.PI / 2 - 0.85, 1.7);
    // Tudo que fica guardado pra reaproveitar mora aqui (invisível, mas na cena: o renderer.compile do carregamento
    // compila os programas de todos os efeitos de uma vez, e eles nunca são descartados = sem travada no 1º uso)
    this.keep = new THREE.Group();
    this.keep.visible = false;
    scene.add(this.keep);
    const fxRoot = new THREE.Group(); // partículas instanciadas (cada uma só desenha quando tem alguma viva)
    scene.add(fxRoot);
    this.bits = new Pool(fxRoot, this.sphere, new THREE.MeshBasicMaterial(), 0, 1024);
    this.clouds = new Pool(fxRoot, this.ball, toonMat(0xffffff), 0.07, 384);
    this.smokes = new Pool(fxRoot, this.ball, toonMat(0xffffff), 0, 256);
    this.rocksP = new Pool(fxRoot, this.rockGeo, toonMat(0xffffff), 0.12, 192);
    this.spikesP = new Pool(fxRoot, this.spikeGeo, toonMat(0xffffff), 0.08, 192);
    this.shardsP = new Pool(fxRoot, this.hexGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), 0, 192);
    this.glows = new Glows(fxRoot);
    this.pools = [this.bits, this.clouds, this.smokes, this.rocksP, this.spikesP, this.shardsP, this.glows];
    this.meshes = []; // Mesh reaproveitados (anéis, vultos, decalques...)
    this.fans = []; // leques de raios (1 desenho cada)
    this.stars = [];
    this.tornadoes = [];
    // donos permanentes dos programas de cada tipo de material
    for (const [k, geo] of [['flat', this.ringGeo], ['ghost', this.capsule], ['tex', this.pillarGeo], ['decal', this.planeGeo]]) this.keep.add(new THREE.Mesh(geo, MK[k]()));
    this.keep.add(new THREE.Sprite(MK.sprite()));
    this.fans.push(this.makeFan());
    this.stars.push(this.makeStar());
    this.tornadoes.push(this.makeTornado());
    this.keep.add(this.fans[0], this.stars[0], this.tornadoes[0]);
  }

  add(obj, life, update, dispose) {
    this.scene.add(obj);
    this.list.push({ obj, life, t: 0, update, dispose });
  }
  // Mesh reaproveitado: volta pra pilha quando o efeito acaba (em update)
  mesh(geo, mat) {
    const m = this.meshes.pop() || new THREE.Mesh();
    m.geometry = geo;
    m.material = mat;
    m.position.set(0, 0, 0);
    m.quaternion.identity();
    m.scale.set(1, 1, 1);
    m.renderOrder = 0;
    m.visible = true;
    m.userData.fxPool = true;
    return m;
  }

  burst(p, color, n = 10, speed = 6, size = 0.08) {
    n = Math.max(1, Math.round(n * this.density));
    for (let i = 0; i < n; i++) {
      const o = this.bits.spawn(color, 0.3 + Math.random() * 0.25, BIT);
      if (!o) return;
      o.p.copy(p);
      o.v.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      o.size = size * (0.6 + Math.random() * 0.8);
      o.s.setScalar(o.size);
    }
  }

  makeStar() {
    const g = new THREE.Group();
    const back = new THREE.Mesh(this.star, this.ink);
    back.scale.setScalar(1.2);
    back.renderOrder = 10;
    const front = new THREE.Mesh(this.star, starMat(0xffffff));
    front.renderOrder = 11;
    g.add(back, front);
    return g;
  }
  starBurst(p, size, color) {
    const g = this.stars.pop() || this.makeStar();
    g.children[1].material = starMat(color);
    g.position.copy(p);
    g.scale.setScalar(0.001);
    const rot = Math.random() * Math.PI;
    this.add(g, 0.22, (dt, k) => {
      g.quaternion.copy(this.camera.quaternion);
      g.rotateZ(rot);
      g.scale.setScalar(size * (k < 0.3 ? (k / 0.3) * 1.2 : 1.2 - (k - 0.3) * 1.6));
    }, () => { this.stars.push(g); this.keep.add(g); });
  }

  // onda de choque: anel virado pra câmera que cresce e some
  ring(p, color, size = 2) {
    const mat = take('flat', { color, opacity: 0.9 });
    const m = this.mesh(this.ringGeo, mat);
    m.position.copy(p);
    this.add(m, 0.35, (dt, k) => {
      m.quaternion.copy(this.camera.quaternion);
      m.scale.setScalar(0.2 + size * Math.sqrt(k));
      mat.opacity = 0.9 * (1 - k);
    }, give('flat', mat));
  }

  ghost(f, color) {
    const mat = take('ghost', { color, opacity: 0.35 });
    const m = this.mesh(this.capsule, mat);
    m.position.set(f.pos.x, f.pos.y + f.height / 2, f.pos.z);
    m.scale.set(1, f.height / 1.8, 1);
    this.add(m, 0.22, (dt, k) => { mat.opacity = 0.35 * (1 - k); }, give('ghost', mat));
  }

  dust(p, n = 6) {
    this.burst(_v.set(p.x, p.y + 0.1, p.z), 0xffffff, n, 3, 0.12);
  }

  // sprite com halo pra coisas presas em outro objeto (halo do meteoro, brilho do escudo). Devolver: POOL.sprite.push(s.material)
  glow(color, size, opacity = 0.8) {
    const s = new THREE.Sprite(take('sprite', { color, opacity }));
    s.scale.setScalar(size);
    return s;
  }
  // bolinha brilhante que encolhe e some (rastro da bola, aura do super)
  // grow: cresce em vez de encolher (bola de fogo)
  puff(p, color, size = 0.5, life = 0.3, vel = null, grow = false) {
    if (this.density < 1 && Math.random() > this.density) return;
    const o = this.glows.spawn(p, color, size, life, PUFF);
    if (!o) return;
    if (vel) o.v.copy(vel);
    o.grow = grow;
    PUFF(o, 0, 0);
  }
  // clarão rápido
  flash(p, color, size = 2) {
    const o = this.glows.spawn(p, color, size, 0.18, FLASH);
    if (o) FLASH(o, 0, 0);
  }
  // onda de choque deitada no chão
  groundRing(p, color, size = 4, life = 0.45) {
    const mat = take('flat', { color, opacity: 0.85 });
    const m = this.mesh(this.ringGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.05, p.z);
    m.scale.setScalar(0.3);
    this.add(m, life, (dt, k) => { m.scale.setScalar(0.3 + size * Math.sqrt(k)); mat.opacity = 0.85 * (1 - k); }, give('flat', mat));
  }
  // explosão da bola de energia / impacto do super
  explode(p, color, big = false) {
    const s = big ? 1.8 : 1;
    this.flash(p, 0xffffff, 1.4 * s);
    this.flash(p, color, 2.6 * s);
    this.ring(p, color, 1.6 * s);
    this.burst(p, color, big ? 26 : 14, 7 * s, 0.09);
    this.burst(p, 0xffffff, big ? 10 : 5, 9 * s, 0.05);
    if (p.y < 1.6) this.groundRing(p, color, 2.5 * s);
  }
  // super: coluna de luz subindo do lutador (de fora colorida, de dentro branca)
  pillar(p, color) {
    for (const [c, r, op] of [[color, 1, 0.65], [0xffffff, 0.45, 0.9]]) {
      const mat = take('tex', { color: c, opacity: op });
      const m = this.mesh(this.pillarGeo, mat);
      m.position.set(p.x, 0.02, p.z);
      m.scale.set(r, 1e-3, r);
      this.add(m, 0.65, (dt, k) => {
        const w = r * (1 - k * 0.7);
        m.scale.set(w, Math.max(1e-3, 10 * Math.min(1, k * 6)), w);
        mat.opacity = op * (1 - k);
      }, give('tex', mat));
    }
  }
  // super: círculo mágico girando no chão embaixo do lutador enquanto ele carrega
  magicCircle(f, color, life = 0.8) {
    const mat = take('tex', { color, map: circleTex, opacity: 0 });
    const m = this.mesh(this.planeGeo, mat);
    m.position.set(f.pos.x, 0.04, f.pos.z);
    m.scale.setScalar(1e-3);
    this.add(m, life, (dt, k) => {
      m.position.set(f.pos.x, 0.04, f.pos.z);
      m.rotation.y += dt * 4;
      const kin = Math.min(1, k / 0.15);
      m.scale.setScalar(Math.max(1e-3, 3.4 * kin));
      mat.opacity = k > 0.75 ? (1 - k) / 0.25 : kin;
    }, give('tex', mat));
  }
  // super: faíscas subindo em volta do corpo
  aura(f, color) {
    const a = Math.random() * Math.PI * 2, r = 0.35 + Math.random() * 0.3;
    _v.set(f.pos.x + Math.cos(a) * r, f.pos.y + Math.random() * f.height, f.pos.z + Math.sin(a) * r);
    this.puff(_v, Math.random() < 0.3 ? 0xffffff : color, 0.3 + Math.random() * 0.35, 0.45, _s.set(0, 2.5 + Math.random() * 2.5, 0));
  }

  // ================= habilidades =================
  // mancha deitada no chão (rachadura, queimado, clarão). rot: mesma rotação pra camadas que se sobrepõem
  decal(p, map, size, life, color = 0xffffff, opacity = 1, rot = Math.random() * Math.PI * 2) {
    const mat = take('decal', { map, color, opacity });
    const m = this.mesh(this.planeGeo, mat);
    m.position.set(p.x, 0.03, p.z);
    m.rotation.y = rot;
    m.scale.setScalar(size);
    m.renderOrder = 1;
    this.add(m, life, (dt, k) => { mat.opacity = opacity * (k > 0.6 ? (1 - k) / 0.4 : 1); }, give('decal', mat));
  }
  // parede da onda de choque: faixa baixa que corre pelo chão até o raio do golpe
  wave(p, color, R, life = 0.4, h = 0.7) {
    const mat = take('tex', { color, opacity: 0.85 });
    const m = this.mesh(this.pillarGeo, mat);
    m.position.set(p.x, 0.02, p.z);
    m.scale.set(0.3, h, 0.3);
    this.add(m, life, (dt, k) => {
      const r = 0.3 + R * (1 - (1 - k) * (1 - k));
      m.scale.set(r, h * (1 - k * 0.6), r);
      mat.opacity = 0.85 * (1 - k);
    }, give('tex', mat));
  }
  // bola cartoon com contorno que cresce e murcha (poeira, fumaça)
  cloud(p, color, size, vel, life, outline = true) {
    if (this.density < 1 && Math.random() > this.density) return;
    const o = (outline ? this.clouds : this.smokes).spawn(color, life, CLOUD);
    if (!o) return;
    o.p.copy(p);
    o.v.copy(vel);
    o.size = size;
    o.s.setScalar(size * 0.35);
  }
  // pedras low-poly voando, quicando uma vez e sumindo
  rocks(p, n, speed, color = 0x8a6a50, size = 0.2, up = 7) {
    n = Math.round(n * this.density);
    for (let i = 0; i < n; i++) {
      const o = this.rocksP.spawn(color, 1.1 + Math.random() * 0.4, ROCK);
      if (!o) return;
      o.size = size * (0.5 + Math.random());
      o.sy = o.size * (0.6 + Math.random() * 0.5);
      o.s.set(o.size, o.sy, o.size);
      o.p.set(p.x, Math.max(0.15, p.y), p.z);
      const a = Math.random() * Math.PI * 2, sp = speed * (0.5 + Math.random() * 0.7);
      o.v.set(Math.cos(a) * sp, up * (0.6 + Math.random() * 0.7), Math.sin(a) * sp);
      o.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14);
    }
  }
  // espetos de pedra brotando em anéis, na ordem em que a onda passa
  spikes(p, R, color = 0x8a6a50) {
    for (const [r, n] of [[R * 0.35, 6], [R * 0.68, 10], [R * 0.95, 14]]) {
      const cnt = Math.max(3, Math.round(n * Math.min(1, this.density + 0.2)));
      for (let i = 0; i < cnt; i++) {
        const a = (i / cnt) * Math.PI * 2 + Math.random() * 0.3;
        const delay = r / 14; // onda a ~14 m/s
        const o = this.spikesP.spawn(color, delay + 0.95, SPIKE);
        if (!o) return;
        o.sy = (0.55 + Math.random() * 0.5) * (1.3 - (r / R) * 0.5);
        o.size = 0.22 + Math.random() * 0.14;
        o.p.set(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r);
        const tilt = 0.25 + Math.random() * 0.3; // inclinados pra fora
        o.q.setFromUnitVectors(_UP, _v.set(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)));
        o.on = false;
        o.delay = delay;
        o.fx = this;
      }
    }
  }
  // anel de poeira cartoon saindo pelo chão
  dustRing(p, R, color = 0xe8d9b8, n = 16) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, sp = R * (1.1 + Math.random() * 0.6);
      this.cloud(_v.set(p.x + Math.cos(a) * 1.1, 0.12, p.z + Math.sin(a) * 1.1), color, 0.2 + Math.random() * 0.18,
        _s.set(Math.cos(a) * sp, 0.3 + Math.random() * 0.6, Math.sin(a) * sp), 0.6 + Math.random() * 0.3);
    }
  }
  // raios de luz saindo do ponto (virados pra câmera): leque instanciado, 1 desenho
  makeFan() {
    const m = new THREE.InstancedMesh(this.rayGeo, MK.tex(), 16);
    m.frustumCulled = false;
    m.renderOrder = 5;
    return m;
  }
  rays(p, color, n = 12, len = 2.4, life = 0.35) {
    const g = this.fans.pop() || this.makeFan(), mat = g.material;
    mat.setValues({ color, opacity: 0.95 });
    n = Math.min(n, 16);
    for (let i = 0; i < n; i++) {
      _q.setFromAxisAngle(_Z, (i / n) * Math.PI * 2 + Math.random() * 0.3);
      g.setMatrixAt(i, _m4.compose(_v.set(0, 0, 0), _q, _s.set(0.7 + Math.random() * 0.8, 0.5 + Math.random() * 0.7, 1)));
    }
    g.count = n;
    g.instanceMatrix.needsUpdate = true;
    g.position.copy(p);
    g.scale.setScalar(0.001);
    this.add(g, life, (dt, k) => {
      g.quaternion.copy(this.camera.quaternion);
      g.rotateZ(k * 0.5);
      g.scale.setScalar(len * (0.3 + 0.7 * Math.sqrt(k)));
      mat.opacity = 0.95 * (1 - k);
    }, () => { this.fans.push(g); this.keep.add(g); });
  }
  // cacos de hexágono dourado (escudo quebrando / acertando)
  shards(p, color, n = 10) {
    n = Math.round(n * this.density);
    for (let i = 0; i < n; i++) {
      const o = this.shardsP.spawn(color, 0.55 + Math.random() * 0.25, SHARD);
      if (!o) return;
      o.size = 0.07 + Math.random() * 0.1;
      o.s.setScalar(o.size);
      o.p.copy(p);
      o.v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 5);
      o.w.set(Math.random(), Math.random(), Math.random()).multiplyScalar(18);
    }
  }
  crossFlash(p, size = 1.6, color = 0xfff3c0) {
    const mat = take('sprite', { map: crossTex, color }), s = new THREE.Sprite(mat);
    s.position.copy(p);
    s.scale.setScalar(size * 0.5);
    s.renderOrder = 6;
    this.add(s, 0.35, (dt, k) => { s.scale.setScalar(size * (0.5 + 0.7 * Math.sqrt(k))); mat.opacity = 1 - k * k; }, give('sprite', mat));
  }

  // ---- Bárbaro: TERREMOTO
  slam(p, color, R) {
    const g = new THREE.Vector3(p.x, 0, p.z), rot = Math.random() * Math.PI * 2;
    this.decal(g, crackDark, R * 1.15, 2.4, 0xffffff, 0.9, rot);
    this.decal(g, crackLava, R * 1.15, 1.0, color, 1, rot);
    this.decal(g, glowTex, R * 1.3, 0.35, color, 0.9);
    this.wave(g, color, R, 0.42, 0.9);
    this.wave(g, 0xffffff, R * 0.65, 0.3, 0.45);
    this.groundRing(g, color, R, 0.45);
    this.spikes(g, R);
    this.rocks(g, 12, 6, 0x8a6a50, 0.2, 8);
    this.dustRing(g, R);
    this.flash(g.setY(0.6), color, 3.4);
    this.burst(g.setY(0.3), color, 18, 9, 0.07);
  }

  // ---- Cavaleiro: INVESTIDA SAGRADA (escudo de luz na frente; o main chama shieldUpdate todo frame)
  shield(color) {
    const g = new THREE.Group();
    const mat = take('tex', { color, map: hexTex, opacity: 0 });
    const dome = new THREE.Mesh(this.domeGeo, mat);
    const glow = this.glow(color, 2.6, 0);
    glow.position.z = -0.85;
    const cross = new THREE.Sprite(take('sprite', { map: crossTex, color: 0xfff6c8, opacity: 0 }));
    cross.scale.setScalar(0.75);
    cross.position.set(0, 0.05, -1.03);
    g.add(dome, glow, cross);
    g.userData = { mat, glow, cross, t: 0 };
    this.scene.add(g);
    return g;
  }
  shieldUpdate(g, f, dt) {
    const u = g.userData;
    u.t += dt;
    const k = Math.min(1, u.t / 0.12);
    g.position.set(f.pos.x, f.pos.y + f.height * 0.5, f.pos.z);
    g.rotation.y = f.yaw;
    g.scale.setScalar(0.6 + 0.4 * k + Math.sin(u.t * 30) * 0.03);
    u.mat.opacity = 0.6 * k + Math.sin(u.t * 22) * 0.06;
    u.glow.material.opacity = 0.45 * k;
    u.cross.material.opacity = k;
  }
  shieldOff(g, color, big) {
    const p = new THREE.Vector3(0, 0, -1).applyQuaternion(g.quaternion).add(g.position);
    this.shards(p, color, big ? 16 : 9);
    this.flash(p, color, 1.8);
    this.scene.remove(g);
    POOL.tex.push(g.userData.mat);
    POOL.sprite.push(g.userData.glow.material, g.userData.cross.material);
  }
  // ---- GIRO DO FURACÃO: funil de vento em volta de quem gira + rastro do corpo + poeira (o main chama tornadoUpdate todo frame)
  // o funil é montado 1x e reaproveitado (antes: 6 geometrias, 3 texturas e 6 materiais novos a cada giro)
  makeTornado() {
    const g = new THREE.Group();
    const layers = [];
    // [raio em cima, raio embaixo, altura, velocidade do giro, repetições do risco, opacidade]
    for (const [rt, rb, h, sp, rep, op] of [[3.1, 1.1, 3.4, 1, 3, 1], [2.4, 0.75, 2.7, 1.45, 2, 0.55], [3.6, 2.2, 1.1, 0.8, 4, 0.8]]) {
      const tex = windTex.clone();
      tex.repeat.set(rep, 1);
      tex.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xeaf6ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 48, 1, true).translate(0, h / 2, 0), mat);
      m.renderOrder = 4;
      g.add(m);
      layers.push({ m, mat, tex, sp, op });
    }
    // faixas do rastro: uma na altura do corpo, uma mais fina em cima, uma na cor do lutador
    const arcs = [[0.3, 2.6, 2.2, 0.75, 0], [1.2, 2.9, 1.5, 0.45, 0.45], [0.6, 2.4, 1.2, 0.55, -0.25]].map(([r0, r1, len, op, dy]) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
      const m = new THREE.Mesh(arcGeo(r0, r1, len), mat);
      m.renderOrder = 5;
      g.add(m);
      return { m, mat, op, dy };
    });
    g.userData = { layers, arcs, all: [...layers, ...arcs], op: [], t: 0 };
    return g;
  }
  tornado(color) {
    const g = this.tornadoes.pop() || this.makeTornado(), u = g.userData;
    u.t = 0;
    u.arcs[2].mat.color.set(color);
    for (const l of u.all) l.mat.opacity = 0;
    g.scale.set(1, 1, 1);
    this.scene.add(g);
    return g;
  }
  tornadoUpdate(g, f, dt) {
    const u = g.userData, gr = f.grab;
    if (!gr || dt <= 0) return;
    u.t += dt;
    const k = Math.min(1, u.t / 0.2), w = T_SPIN(gr), sp = w / T.spinW1;
    g.position.set(f.pos.x, 0.02, f.pos.z);
    g.scale.set(0.75 + 0.25 * k, 0.6 + 0.4 * k, 0.75 + 0.25 * k);
    for (const l of u.layers) {
      l.m.rotation.y += w * l.sp * 0.55 * dt;
      l.tex.offset.y -= dt * 0.9 * l.sp;
      l.mat.opacity = l.op * k * (0.55 + 0.45 * sp);
    }
    for (const a of u.arcs) {
      a.m.rotation.y = gr.ang;
      a.m.position.y = gr.victim.pos.y + a.dy;
      a.mat.opacity = a.op * k * (0.4 + 0.6 * sp);
    }
    // poeira e vento espiralando
    if (Math.random() < dt * 40 * this.density) {
      const ang = Math.random() * Math.PI * 2, r = 1.2 + Math.random() * 1.8, y = Math.random() * 2.6;
      _s.set(-Math.cos(ang), 0.8, Math.sin(ang)).multiplyScalar(w * r * 0.5);
      this.puff(_v.set(f.pos.x - Math.sin(ang) * r, y, f.pos.z - Math.cos(ang) * r), 0xffffff, 0.35 + Math.random() * 0.3, 0.3, _s);
    }
    if (Math.random() < dt * 9 * this.density) {
      const ang = Math.random() * Math.PI * 2, r = 1.6 + Math.random() * 1.2;
      this.cloud(_v.set(f.pos.x - Math.sin(ang) * r, 0.1, f.pos.z - Math.cos(ang) * r), 0xe8d9b8, 0.12 + Math.random() * 0.12,
        _s.set(-Math.cos(ang) * 6, 1.5, Math.sin(ang) * 6), 0.45);
    }
  }
  tornadoOff(g) {
    const u = g.userData;
    u.all.forEach((l, i) => (u.op[i] = l.mat.opacity));
    this.list.push({ obj: g, life: 0.35, t: 0, update: (dt, k) => {
      u.all.forEach((l, i) => (l.mat.opacity = u.op[i] * (1 - k)));
      g.scale.multiplyScalar(1 + dt * 1.2);
      for (const l of u.layers) l.m.rotation.y += dt * 8;
    }, dispose: () => { this.tornadoes.push(g); this.keep.add(g); } });
  }
  holy(p, color) {
    this.rays(p, color, 14, 2.8);
    this.rays(p, 0xffffff, 8, 1.6, 0.25);
    this.crossFlash(p, 2);
    this.shards(p, color, 12);
    this.ring(p, color, 2.2);
  }

  // ---- Ladina: PASSO SOMBRIO
  smoke(p, color) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.3;
      _v.set(p.x + Math.cos(a) * r, p.y + 0.15 + Math.random() * 1.5, p.z + Math.sin(a) * r);
      this.cloud(_v, i % 3 ? 0x2b1840 : 0x4a2a6a, 0.17 + Math.random() * 0.17, _s.set(Math.cos(a) * 3, 0.8 + Math.random(), Math.sin(a) * 3), 0.45 + Math.random() * 0.2);
    }
    _s.set(0, 1.5, 0);
    for (let i = 0; i < 6; i++) this.puff(_v.set(p.x + (Math.random() - 0.5) * 0.8, p.y + Math.random() * 1.6, p.z + (Math.random() - 0.5) * 0.8), color, 0.7, 0.45, _s);
    this.burst(_v.set(p.x, p.y + 0.9, p.z), color, 10, 5, 0.06);
    this.groundRing(p, color, 1.7, 0.35);
  }
  // vultos e um rastro de sombra entre a saída e a chegada
  shadowTrail(from, to, color, h = 1.8) {
    const n = 6;
    for (let i = 1; i < n; i++) {
      _v.copy(from).lerp(to, i / n);
      const mat = take('ghost', { color: i % 2 ? 0x2b1840 : color, opacity: 0.5 });
      const m = this.mesh(this.capsule, mat);
      m.position.set(_v.x, _v.y + h / 2, _v.z);
      m.scale.set(1, h / 1.8, 1);
      const life = 0.15 + (i / n) * 0.2;
      this.add(m, life, (dt, k) => { mat.opacity = 0.5 * (1 - k); m.scale.x = m.scale.z = 1 - k * 0.5; }, give('ghost', mat));
    }
    for (let i = 0; i < 14; i++) this.puff(_v.copy(from).lerp(to, Math.random()).setY(from.y + 0.3 + Math.random() * 1.3), color, 0.45, 0.35);
  }
  slash(p, color, rot, size = 2.2, life = 0.28) {
    for (const [c, s] of [[color, 1.15], [0xffffff, 0.9]]) {
      const mat = take('sprite', { map: slashTex, color: c, depthTest: false, rotation: rot }), sp = new THREE.Sprite(mat);
      sp.position.copy(p);
      sp.scale.setScalar(size * s * 0.6);
      sp.renderOrder = 7;
      this.add(sp, life, (dt, k) => {
        mat.rotation = rot - k * 1.4;
        sp.scale.setScalar(size * s * (0.6 + 0.5 * k));
        mat.opacity = 1 - k * k;
      }, give('sprite', mat));
    }
  }
  backstab(p, color) {
    this.slash(p, color, 0.5);
    this.slash(p, color, 0.5 + Math.PI / 2, 1.5);
    this.flash(p, color, 2);
    this.burst(p, 0x2b1840, 12, 6, 0.08);
    this.burst(p, color, 8, 7, 0.05);
  }

  // ---- Mago: METEORO. Círculo de runas no alvo (azul -> laranja perto de cair; o disco enche até a hora)
  // e uma pedra em chamas caindo do céu na diagonal. O impacto em si é meteorImpact (o main chama).
  meteor(target, R, delay, color, from) {
    const g = new THREE.Vector3(target.x, 0, target.z);
    const cMat = take('decal', { color, map: circleTex, opacity: 0, polygonOffsetFactor: -3 });
    const circle = this.mesh(this.planeGeo, cMat);
    circle.position.set(g.x, 0.04, g.z);
    circle.scale.setScalar(1e-3);
    circle.renderOrder = 2;
    const fMat = take('decal', { color: 0xff6a2f, map: glowTex, opacity: 0 });
    const fill = this.mesh(this.planeGeo, fMat);
    fill.position.set(g.x, 0.035, g.z);
    fill.scale.setScalar(1e-3);
    this.scene.add(fill);
    const col = new THREE.Color(color), hot = new THREE.Color(0xff5a2a);
    this.add(circle, delay, (dt, k) => {
      circle.rotation.y += dt * (2 + k * 7);
      circle.scale.setScalar(Math.max(1e-3, 2 * R * Math.min(1, k / 0.12)));
      cMat.opacity = Math.min(1, k / 0.12);
      cMat.color.copy(col).lerp(hot, k * k);
      fill.scale.setScalar(Math.max(1e-3, 2.4 * R * k));
      fMat.opacity = 0.2 + 0.55 * k;
    }, () => { POOL.decal.push(cMat, fMat); fill.removeFromParent(); this.meshes.push(fill); });

    const rock = new THREE.Group();
    const core = new THREE.Mesh(this.rockGeo, toon(0x4a2418));
    addOutline(core, 0.1);
    core.scale.setScalar(0.5);
    const halos = [[0xff4a1a, 3.4, 0.5], [0xffa030, 2.3, 0.8], [0xfff2a0, 1.3, 0.95]].map(([c, s, o]) => this.glow(c, s, o));
    rock.add(...halos, core);
    rock.visible = false;
    // cai do lado de quem lançou (quem é o alvo, olhando pro Mago, vê ele vindo)
    const side = from ? new THREE.Vector3(from.x - g.x, 0, from.z - g.z).normalize() : new THREE.Vector3(-0.8, 0, 0.6);
    const start = new THREE.Vector3(g.x + side.x * 7, 16, g.z + side.z * 7);
    const up = new THREE.Vector3(0, 0.6, 0);
    let trailT = 0;
    this.add(rock, delay, (dt, k) => {
      const u = (k - 0.35) / 0.65;
      if (u <= 0) return;
      rock.visible = true;
      rock.position.lerpVectors(start, g, u * u);
      core.rotation.x += dt * 8;
      core.rotation.z += dt * 5;
      halos[2].scale.setScalar(1.3 + Math.sin(k * 90) * 0.15);
      if ((trailT -= dt) <= 0) {
        trailT = 0.016;
        this.puff(rock.position, Math.random() < 0.5 ? 0xffa030 : 0xff5a1a, 1.5, 0.35, null, true);
        if (Math.random() < 0.5) this.cloud(rock.position, 0x55504c, 0.35, up, 0.6, false);
      }
    }, () => POOL.sprite.push(...halos.map(h => h.material)));
  }
  meteorImpact(p) {
    const g = new THREE.Vector3(p.x, 0, p.z), up = new THREE.Vector3(p.x, 0.6, p.z), rot = Math.random() * Math.PI * 2;
    const rnd = () => (Math.random() - 0.5) * 2;
    this.flash(up, 0xffffff, 3.6);
    this.flash(up, 0xffa030, 5.6);
    for (let i = 0; i < 10; i++) { // bola de fogo: camadas que crescem e sobem
      const c = [0xfff2a0, 0xffa030, 0xff5a1a][i % 3];
      this.puff(_v.set(p.x + rnd() * 0.8, 0.4 + Math.random(), p.z + rnd() * 0.8), c, 2.2 + Math.random(), 0.55, _s.set(rnd() * 3, 2 + Math.random() * 3, rnd() * 3), true);
    }
    for (let i = 0; i < 10; i++) { // fumaça subindo
      this.cloud(_v.set(p.x + rnd() * 0.9, 0.5 + Math.random() * 0.8, p.z + rnd() * 0.9), i % 2 ? 0x5a5550 : 0x7a726a, 0.5 + Math.random() * 0.4,
        _s.set(rnd() * 3, 2.5 + Math.random() * 2, rnd() * 3), 1.1 + Math.random() * 0.5);
    }
    this.decal(g, crackDark, 5, 3, 0xffffff, 0.85, rot);
    this.decal(g, crackLava, 5, 1.4, 0xff6a2f, 1, rot);
    this.decal(g, glowTex, 6.5, 0.6, 0xff8a3a, 0.9);
    this.wave(g, 0xff7a2f, 3.6, 0.45, 1.1);
    this.groundRing(g, 0xffa030, 4.6, 0.5);
    this.rocks(g, 8, 5, 0x4a2418, 0.16, 7);
    this.burst(up, 0xffa030, 24, 10, 0.07);
    this.ring(up, 0xffe08a, 2.6);
  }

  update(dt) {
    if (dt <= 0) return;
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const o = L[i];
      o.t += dt;
      const k = Math.min(1, o.t / o.life);
      o.update(dt, k);
      if (k >= 1) {
        o.obj.removeFromParent();
        o.dispose?.();
        if (o.obj.userData.fxPool) this.meshes.push(o.obj);
        L[i] = L[L.length - 1]; // troca com o último (a ordem não importa): sem splice
        L.pop();
      }
    }
    for (const p of this.pools) p.update(dt);
  }
}

// ---------- sons: arquivos CC0 de verdade (assets/sfx, fontes em assets/sfx/CREDITS.txt) ----------
// Cada "grupo" tem variações (punch_l1..6) e cada toque sai com um tom levemente diferente: nenhum soco soa igual.
export const audio = { volume: 0.6 };
const FILES = SFX_FILES;
// grupo = nome sem o número no fim (punch_l3 -> punch_l)
const GROUPS = {};
for (const f of FILES) (GROUPS[f.startsWith('v_') ? f : f.replace(/\d+$/, '')] ||= []).push(f); // falas do locutor (v_round_1...) não se agrupam
let ac, master, bus, crowdG, hypeG, windG, windSrc;
const bufs = {}, lastPick = {};
function ctx() {
  if (!ac) {
    ac = new AudioContext();
    const comp = ac.createDynamicsCompressor(); // segura o pico quando vários sons batem juntos
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ac.createGain();
    master.connect(comp).connect(ac.destination);
    bus = { sfx: ac.createGain(), voice: ac.createGain(), amb: ac.createGain() };
    for (const b of Object.values(bus)) b.connect(master);
    for (const f of FILES) {
      fetch(`assets/sfx/${f}.ogg`).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b)).then(d => {
        bufs[f] = d;
        if (f === 'crowd') crowdG = loop(d, 'amb');
        if (f === 'crowd_hype') hypeG = loop(d, 'amb');
        if (f === 'wind') [windG, windSrc] = [loop(d, 'amb'), lastLoop];
      }).catch(() => {});
    }
  }
  if (ac.state === 'suspended') ac.resume();
  master.gain.value = audio.volume;
  return ac;
}
let lastLoop;
function loop(buffer, b) {
  const s = ac.createBufferSource(), g = ac.createGain();
  s.buffer = buffer;
  s.loop = true;
  g.gain.value = 0;
  s.connect(g).connect(bus[b]);
  s.start();
  lastLoop = s;
  return g;
}
// toca uma variação do grupo (sem repetir a mesma duas vezes seguidas)
function play(group, v = 1, o = {}) {
  const c = ctx(), list = GROUPS[group];
  if (!list || v <= 0.001) return null;
  let i = (Math.random() * list.length) | 0;
  if (list.length > 1 && i === lastPick[group]) i = (i + 1) % list.length;
  lastPick[group] = i;
  const buf = bufs[list[i]];
  if (!buf) return null;
  const s = c.createBufferSource(), g = c.createGain();
  s.buffer = buf;
  s.playbackRate.value = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * (o.rv ?? 0.06));
  g.gain.value = v;
  s.connect(g).connect(bus[o.bus || 'sfx']);
  s.start(c.currentTime + (o.delay || 0));
  return { s, g, t: c.currentTime };
}
// locutor: uma fala por vez (as do round sempre passam); a torcida abaixa um pouco enquanto ele fala
let voiceT = 0, voiceSrc = null;
function voice(name, { force = false, delay = 0, v = 1 } = {}) {
  const c = ctx(), now = c.currentTime;
  if (!force && now < voiceT) return;
  if (force && voiceSrc) try { voiceSrc.stop(); } catch {}
  const p = play('v_' + name, v, { bus: 'voice', rv: 0, delay });
  if (!p) return;
  voiceSrc = p.s;
  voiceT = now + delay + p.s.buffer.duration + 1.2;
  bus.amb.gain.cancelScheduledValues(now);
  bus.amb.gain.setTargetAtTime(0.45, now + delay, 0.05);
  bus.amb.gain.setTargetAtTime(1, now + delay + p.s.buffer.duration, 0.4);
}

export const sfx = {
  play, // play(grupo, volume, { rate, rv, delay, bus }) pra qualquer grupo de sons
  unlock: () => ctx(),
  voice,
  // soco = "tum" + estalo curto por cima; pesado ganha baque grave de corpo
  hit: (heavy, v = 1) => {
    if (heavy) { play('punch_h', v); play('body_h', 0.5 * v, { rate: 0.9 }); play('crack', 0.28 * v, { rate: 0.9 }); }
    else { play('punch_l', 0.95 * v); play('crack', 0.32 * v, { rate: 1.1 }); }
  },
  block: (v = 1) => { play('block', 0.85 * v); play('body_m', 0.4 * v); },
  parry: (v = 1) => { play('clang', v, { rate: 1.1 }); play('ding', 0.5 * v, { rate: 1.1 }); },
  guardBreak: (v = 1) => { play('plate', v); play('break', 0.7 * v); play('punch_h', 0.7 * v); },
  swing: (heavy, v = 1) => play(heavy ? 'swing_h' : 'swing_l', 0.6 * v, { rv: 0.1 }),
  dash: (v = 1) => play('whoosh', 0.55 * v, { rate: 1.15, rv: 0.08 }),
  jump: (v = 1) => { play('cloth', 0.4 * v, { rv: 0.1 }); play('step', 0.35 * v, { rate: 1.1 }); },
  land: (v = 1) => { play('step', 0.8 * v, { rate: 0.9 }); if (v > 0.5) play('body_m', 0.5 * v); },
  // vozes dos lutadores (female = Ladina): gemido ao apanhar, grito no golpe forte, dor no K.O.
  grunt: (female, v = 1) => play(female ? 'grunt_f' : 'grunt_m', 0.7 * v, { rv: 0.06 }),
  shout: (female, v = 1) => play(female ? 'grunt_f' : 'shout_m', 0.6 * v, { rv: 0.06, rate: female ? 1.12 : 1 }),
  pain: (female, v = 1) => play(female ? 'pain_f' : 'pain_m', 0.85 * v, { rv: 0.03 }),
  slide: (v = 1) => play('gravel', 0.65 * v, { rate: 1.1 }),
  ko: () => { play('punch_h', 1); play('sub', 0.8); play('gong', 0.7); play('applause', 0.8, { rv: 0 }); },
  applause: (v = 1) => play('applause', v, { rv: 0 }),
  deny: () => play('deny', 0.45, { rv: 0.03 }), // poder não saiu (sem energia, recarga, longe)
  // habilidades
  boom: (v = 1) => { play('sub', v); play('cannon', 0.6 * v); play('debris', 0.6 * v); },
  chime: (v = 1) => { play('magic', 0.55 * v, { rate: 1.2 }); play('shimmer', 0.3 * v); },
  ding: (v = 1) => { play('ding', 0.8 * v); play('shimmer', 0.35 * v, { rate: 1.2 }); },
  poof: (v = 1) => { play('magic', 0.5 * v, { rate: 1.8 }); play('swing_h', 0.5 * v, { rate: 0.7 }); },
  // meteoro caindo: o ronco desce de tom e cresce até a hora do impacto
  whistle: (dur, v = 1) => {
    const p = play('rumble', 0.0001, { rv: 0 });
    if (!p) return;
    p.s.playbackRate.setValueAtTime(1.7, p.t);
    p.s.playbackRate.linearRampToValueAtTime(0.55, p.t + dur);
    p.g.gain.setValueAtTime(0.0001, p.t);
    p.g.gain.exponentialRampToValueAtTime(0.5 * v, p.t + dur * 0.9);
    p.g.gain.exponentialRampToValueAtTime(0.0001, p.t + dur + 0.08);
    p.s.stop(p.t + dur + 0.1);
  },
  explosion: (v = 1) => { play('explosion', v); play('explosion_far', 0.8 * v); },
  slash: (v = 1) => play('slash', 0.8 * v),
  wall: (v = 1) => { play('punch_h', v, { rate: 0.85 }); play('plate', 0.7 * v, { rate: 0.8 }); play('debris', 0.6 * v); play('sub', 0.5 * v); },
  bell: () => { play('bell', 0.8, { rv: 0 }); play('bell', 0.6, { rv: 0, delay: 0.32 }); }, // "ding ding" do boxe
  // torcida de fundo: base (conversa e ânimo leve) + torcida gritando que sobe com a empolgação da luta
  ambience: (base, hype) => {
    if (crowdG) crowdG.gain.setTargetAtTime(base, ac.currentTime, 0.4);
    if (hypeG) hypeG.gain.setTargetAtTime(hype, ac.currentTime, hype > hypeG.gain.value ? 0.25 : 0.9); // sobe rápido, baixa devagar
  },
  wind: (level, rate = 1) => {
    if (!windG) return;
    windG.gain.setTargetAtTime(level, ac.currentTime, level > windG.gain.value ? 0.05 : 0.25);
    windSrc.playbackRate.setTargetAtTime(rate, ac.currentTime, 0.1);
  },
};
