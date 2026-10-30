import * as THREE from 'three';
import { toonMat, addOutline } from './toon.js';
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
  }

  add(obj, life, update, dispose) {
    this.scene.add(obj);
    this.list.push({ obj, life, t: 0, update, dispose });
  }

  burst(p, color, n = 10, speed = 6, size = 0.08) {
    n = Math.max(1, Math.round(n * this.density));
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.sphere, basic(color));
      m.position.copy(p);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      const s = size * (0.6 + Math.random() * 0.8);
      this.add(m, 0.3 + Math.random() * 0.25, (dt, k) => {
        m.position.addScaledVector(v, dt);
        v.y -= 14 * dt;
        m.scale.setScalar(s * (1 - k));
      });
    }
  }

  starBurst(p, size, color) {
    const g = new THREE.Group();
    const back = new THREE.Mesh(this.star, this.ink);
    back.scale.setScalar(1.2);
    back.renderOrder = 10;
    const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
    const front = new THREE.Mesh(this.star, mat);
    front.renderOrder = 11;
    g.add(back, front);
    g.position.copy(p);
    const rot = Math.random() * Math.PI;
    this.add(g, 0.22, (dt, k) => {
      g.quaternion.copy(this.camera.quaternion);
      g.rotateZ(rot);
      g.scale.setScalar(size * (k < 0.3 ? (k / 0.3) * 1.2 : 1.2 - (k - 0.3) * 1.6));
    }, () => mat.dispose());
  }

  // onda de choque: anel virado pra câmera que cresce e some
  ring(p, color, size = 2) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.ringGeo ||= new THREE.RingGeometry(0.8, 1, 40), mat);
    m.position.copy(p);
    this.add(m, 0.35, (dt, k) => {
      m.quaternion.copy(this.camera.quaternion);
      m.scale.setScalar(0.2 + size * Math.sqrt(k));
      mat.opacity = 0.9 * (1 - k);
    }, () => mat.dispose());
  }

  ghost(f, color) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false });
    const m = new THREE.Mesh(this.capsule, mat);
    m.position.set(f.pos.x, f.pos.y + f.height / 2, f.pos.z);
    m.scale.set(1, f.height / 1.8, 1);
    this.add(m, 0.22, (dt, k) => { mat.opacity = 0.35 * (1 - k); }, () => mat.dispose());
  }

  dust(p, n = 6) {
    this.burst(new THREE.Vector3(p.x, p.y + 0.1, p.z), 0xffffff, n, 3, 0.12);
  }

  // sprite com halo; cada um tem material próprio pra poder sumir aos poucos
  glow(color, size, opacity = 0.8) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false }));
    s.scale.setScalar(size);
    return s;
  }
  // bolinha brilhante que encolhe e some (rastro da bola, aura do super)
  // grow: cresce em vez de encolher (bola de fogo)
  puff(p, color, size = 0.5, life = 0.3, vel = null, grow = false) {
    if (this.density < 1 && Math.random() > this.density) return;
    const s = this.glow(color, size);
    s.position.copy(p);
    this.add(s, life, (dt, k) => {
      if (vel) s.position.addScaledVector(vel, dt);
      s.scale.setScalar(size * (grow ? 0.5 + 0.7 * Math.sqrt(k) : 1 - k * 0.8));
      s.material.opacity = 0.8 * (1 - k);
    }, () => s.material.dispose());
  }
  // clarão rápido
  flash(p, color, size = 2) {
    const s = this.glow(color, size, 1);
    s.position.copy(p);
    this.add(s, 0.18, (dt, k) => { s.scale.setScalar(size * (0.6 + k * 0.8)); s.material.opacity = 1 - k; }, () => s.material.dispose());
  }
  // onda de choque deitada no chão
  groundRing(p, color, size = 4, life = 0.45) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.ringGeo ||= new THREE.RingGeometry(0.8, 1, 40), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.05, p.z);
    this.add(m, life, (dt, k) => { m.scale.setScalar(0.3 + size * Math.sqrt(k)); mat.opacity = 0.85 * (1 - k); }, () => mat.dispose());
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
      const mat = new THREE.MeshBasicMaterial({ color: c, map: fadeTex, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(this.pillarGeo ||= new THREE.CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0), mat);
      m.position.set(p.x, 0.02, p.z);
      this.add(m, 0.65, (dt, k) => {
        const w = r * (1 - k * 0.7);
        m.scale.set(w, 10 * Math.min(1, k * 6), w);
        mat.opacity = op * (1 - k);
      }, () => mat.dispose());
    }
  }
  // super: círculo mágico girando no chão embaixo do lutador enquanto ele carrega
  magicCircle(f, color, life = 0.8) {
    const mat = new THREE.MeshBasicMaterial({ color, map: circleTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.planeGeo ||= new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
    this.add(m, life, (dt, k) => {
      m.position.set(f.pos.x, 0.04, f.pos.z);
      m.rotation.y += dt * 4;
      const kin = Math.min(1, k / 0.15);
      m.scale.setScalar(3.4 * kin);
      mat.opacity = k > 0.75 ? (1 - k) / 0.25 : kin;
    }, () => mat.dispose());
  }
  // super: faíscas subindo em volta do corpo
  aura(f, color) {
    const a = Math.random() * Math.PI * 2, r = 0.35 + Math.random() * 0.3;
    const p = new THREE.Vector3(f.pos.x + Math.cos(a) * r, f.pos.y + Math.random() * f.height, f.pos.z + Math.sin(a) * r);
    this.puff(p, Math.random() < 0.3 ? 0xffffff : color, 0.3 + Math.random() * 0.35, 0.45, new THREE.Vector3(0, 2.5 + Math.random() * 2.5, 0));
  }

  // ================= habilidades =================
  // mancha deitada no chão (rachadura, queimado, clarão). rot: mesma rotação pra camadas que se sobrepõem
  decal(p, map, size, life, color = 0xffffff, opacity = 1, rot = Math.random() * Math.PI * 2) {
    const mat = new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(this.planeGeo, mat);
    m.position.set(p.x, 0.03, p.z);
    m.rotation.y = rot;
    m.scale.setScalar(size);
    m.renderOrder = 1;
    this.add(m, life, (dt, k) => { mat.opacity = opacity * (k > 0.6 ? (1 - k) / 0.4 : 1); }, () => mat.dispose());
  }
  // parede da onda de choque: faixa baixa que corre pelo chão até o raio do golpe
  wave(p, color, R, life = 0.4, h = 0.7) {
    const mat = new THREE.MeshBasicMaterial({ color, map: fadeTex, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(this.pillarGeo, mat);
    m.position.set(p.x, 0.02, p.z);
    this.add(m, life, (dt, k) => {
      const r = 0.3 + R * (1 - (1 - k) * (1 - k));
      m.scale.set(r, h * (1 - k * 0.6), r);
      mat.opacity = 0.85 * (1 - k);
    }, () => mat.dispose());
  }
  // bola cartoon com contorno que cresce e murcha (poeira, fumaça)
  cloud(p, color, size, vel, life, outline = true) {
    if (this.density < 1 && Math.random() > this.density) return;
    const m = new THREE.Mesh(this.ball, toon(color));
    if (outline) addOutline(m, 0.07);
    m.position.copy(p);
    const v = vel.clone();
    this.add(m, life, (dt, k) => {
      m.position.addScaledVector(v, dt);
      v.multiplyScalar(Math.max(0, 1 - 3.5 * dt));
      m.scale.setScalar(size * (k < 0.25 ? 0.35 + (k / 0.25) * 0.65 : 1 - ((k - 0.25) / 0.75) ** 1.5));
    });
  }
  // pedras low-poly voando, quicando uma vez e sumindo
  rocks(p, n, speed, color = 0x8a6a50, size = 0.2, up = 7) {
    n = Math.round(n * this.density);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.rockGeo, toon(color));
      addOutline(m, 0.12);
      const s = size * (0.5 + Math.random()), sy = s * (0.6 + Math.random() * 0.5);
      m.scale.set(s, sy, s);
      m.position.set(p.x, Math.max(0.15, p.y), p.z);
      const a = Math.random() * Math.PI * 2, sp = speed * (0.5 + Math.random() * 0.7);
      const v = new THREE.Vector3(Math.cos(a) * sp, up * (0.6 + Math.random() * 0.7), Math.sin(a) * sp);
      const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14);
      let bounces = 0;
      this.add(m, 1.1 + Math.random() * 0.4, (dt, k) => {
        v.y -= 22 * dt;
        m.position.addScaledVector(v, dt);
        if (m.position.y < sy * 0.6) {
          m.position.y = sy * 0.6;
          if (bounces++ === 0) { v.y = Math.abs(v.y) * 0.35; v.x *= 0.5; v.z *= 0.5; } else { v.set(0, 0, 0); spin.multiplyScalar(0.8); }
        }
        m.rotation.x += spin.x * dt;
        m.rotation.y += spin.y * dt;
        m.rotation.z += spin.z * dt;
        const g = k > 0.75 ? (1 - k) / 0.25 : 1;
        m.scale.set(s * g, sy * g, s * g);
      });
    }
  }
  // espetos de pedra brotando em anéis, na ordem em que a onda passa
  spikes(p, R, color = 0x8a6a50) {
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    for (const [r, n] of [[R * 0.35, 6], [R * 0.68, 10], [R * 0.95, 14]]) {
      const cnt = Math.max(3, Math.round(n * Math.min(1, this.density + 0.2)));
      for (let i = 0; i < cnt; i++) {
        const a = (i / cnt) * Math.PI * 2 + Math.random() * 0.3;
        const m = new THREE.Mesh(this.spikeGeo, toon(color));
        addOutline(m, 0.08);
        const h = (0.55 + Math.random() * 0.5) * (1.3 - (r / R) * 0.5), w = 0.22 + Math.random() * 0.14;
        m.position.set(p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r);
        const tilt = 0.25 + Math.random() * 0.3; // inclinados pra fora
        m.quaternion.setFromUnitVectors(up, dir.set(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)));
        m.visible = false;
        const delay = r / 14, life = delay + 0.95; // onda a ~14 m/s
        let popped = false;
        this.add(m, life, (dt, k) => {
          const t = k * life - delay;
          if (t < 0) return;
          if (!popped) { popped = true; m.visible = true; this.burst(m.position, 0xe8d9b8, 2, 3, 0.1); }
          const y = t < 0.07 ? (t / 0.07) * 1.2 : t < 0.13 ? 1.2 - ((t - 0.07) / 0.06) * 0.2 : t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.3);
          m.scale.set(w, Math.max(0.001, h * y), w);
        });
      }
    }
  }
  // anel de poeira cartoon saindo pelo chão
  dustRing(p, R, color = 0xe8d9b8, n = 16) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, sp = R * (1.1 + Math.random() * 0.6);
      this.cloud(new THREE.Vector3(p.x + Math.cos(a) * 1.1, 0.12, p.z + Math.sin(a) * 1.1), color, 0.2 + Math.random() * 0.18,
        new THREE.Vector3(Math.cos(a) * sp, 0.3 + Math.random() * 0.6, Math.sin(a) * sp), 0.6 + Math.random() * 0.3);
    }
  }
  // raios de luz saindo do ponto (virados pra câmera)
  rays(p, color, n = 12, len = 2.4, life = 0.35) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, map: fadeTex, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < n; i++) {
      const r = new THREE.Mesh(this.rayGeo, mat);
      r.rotation.z = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      r.scale.set(0.7 + Math.random() * 0.8, 0.5 + Math.random() * 0.7, 1);
      g.add(r);
    }
    g.position.copy(p);
    g.renderOrder = 5;
    this.add(g, life, (dt, k) => {
      g.quaternion.copy(this.camera.quaternion);
      g.rotateZ(k * 0.5);
      g.scale.setScalar(len * (0.3 + 0.7 * Math.sqrt(k)));
      mat.opacity = 0.95 * (1 - k);
    }, () => mat.dispose());
  }
  // cacos de hexágono dourado (escudo quebrando / acertando)
  shards(p, color, n = 10) {
    n = Math.round(n * this.density);
    const mat = (this.shardMats ||= new Map()).get(color) || new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    this.shardMats.set(color, mat);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.hexGeo, mat);
      const s = 0.07 + Math.random() * 0.1;
      m.position.copy(p);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 5);
      const spin = new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(18);
      this.add(m, 0.55 + Math.random() * 0.25, (dt, k) => {
        v.y -= 12 * dt;
        m.position.addScaledVector(v, dt);
        m.rotation.x += spin.x * dt;
        m.rotation.y += spin.y * dt;
        m.scale.setScalar(s * (1 - k));
      });
    }
  }
  crossFlash(p, size = 1.6, color = 0xfff3c0) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: crossTex, color, transparent: true, depthWrite: false }));
    s.position.copy(p);
    s.renderOrder = 6;
    this.add(s, 0.35, (dt, k) => { s.scale.setScalar(size * (0.5 + 0.7 * Math.sqrt(k))); s.material.opacity = 1 - k * k; }, () => s.material.dispose());
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
    this.flash(new THREE.Vector3(p.x, 0.6, p.z), color, 3.4);
    this.burst(new THREE.Vector3(p.x, 0.3, p.z), color, 18, 9, 0.07);
  }

  // ---- Cavaleiro: INVESTIDA SAGRADA (escudo de luz na frente; o main chama shieldUpdate todo frame)
  shield(color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color, map: hexTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const dome = new THREE.Mesh(this.domeGeo, mat);
    const glow = this.glow(color, 2.6, 0);
    glow.position.z = -0.85;
    const cross = new THREE.Sprite(new THREE.SpriteMaterial({ map: crossTex, color: 0xfff6c8, transparent: true, opacity: 0, depthWrite: false }));
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
    for (const m of [g.userData.mat, g.userData.glow.material, g.userData.cross.material]) m.dispose();
  }
  // ---- GIRO DO FURACÃO: funil de vento em volta de quem gira + rastro do corpo + poeira (o main chama tornadoUpdate todo frame)
  tornado(color) {
    const g = new THREE.Group();
    const layers = [];
    // [raio em cima, raio embaixo, altura, velocidade do giro, repetições do risco, opacidade]
    for (const [rt, rb, h, sp, rep, op] of [[3.1, 1.1, 3.4, 1, 3, 1], [2.4, 0.75, 2.7, 1.45, 2, 0.55], [3.6, 2.2, 1.1, 0.8, 4, 0.8]]) {
      const tex = windTex.clone();
      tex.repeat.set(rep, 1);
      tex.needsUpdate = true;
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xeaf6ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 48, 1, true).translate(0, h / 2, 0), mat);
      m.renderOrder = 4;
      g.add(m);
      layers.push({ m, mat, tex, sp, op });
    }
    // faixas do rastro: uma na altura do corpo, uma mais fina em cima, uma na cor do lutador
    const arcs = [[0.3, 2.6, 2.2, 0xffffff, 0.75, 0], [1.2, 2.9, 1.5, 0xffffff, 0.45, 0.45], [0.6, 2.4, 1.2, color, 0.55, -0.25]].map(([r0, r1, len, c, op, dy]) => {
      const mat = new THREE.MeshBasicMaterial({ color: c, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(arcGeo(r0, r1, len), mat);
      m.renderOrder = 5;
      g.add(m);
      return { m, mat, op, dy };
    });
    g.userData = { layers, arcs, t: 0, color };
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
      const p = new THREE.Vector3(f.pos.x - Math.sin(ang) * r, y, f.pos.z - Math.cos(ang) * r);
      const tg = new THREE.Vector3(-Math.cos(ang), 0.8, Math.sin(ang)).multiplyScalar(w * r * 0.5);
      this.puff(p, 0xffffff, 0.35 + Math.random() * 0.3, 0.3, tg);
    }
    if (Math.random() < dt * 9 * this.density) {
      const ang = Math.random() * Math.PI * 2, r = 1.6 + Math.random() * 1.2;
      this.cloud(new THREE.Vector3(f.pos.x - Math.sin(ang) * r, 0.1, f.pos.z - Math.cos(ang) * r), 0xe8d9b8, 0.12 + Math.random() * 0.12,
        new THREE.Vector3(-Math.cos(ang) * 6, 1.5, Math.sin(ang) * 6), 0.45);
    }
  }
  tornadoOff(g) {
    const u = g.userData, mats = [...u.layers.map(l => l.mat), ...u.arcs.map(a => a.mat)], op = mats.map(m => m.opacity);
    this.list.push({ obj: g, life: 0.35, t: 0, update: (dt, k) => {
      mats.forEach((m, i) => (m.opacity = op[i] * (1 - k)));
      g.scale.multiplyScalar(1 + dt * 1.2);
      u.layers.forEach(l => (l.m.rotation.y += dt * 8));
    }, dispose: () => { for (const c of g.children) { c.geometry.dispose(); c.material.map?.dispose(); c.material.dispose(); } } });
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
      const q = new THREE.Vector3(p.x + Math.cos(a) * r, p.y + 0.15 + Math.random() * 1.5, p.z + Math.sin(a) * r);
      this.cloud(q, i % 3 ? 0x2b1840 : 0x4a2a6a, 0.17 + Math.random() * 0.17, new THREE.Vector3(Math.cos(a) * 3, 0.8 + Math.random(), Math.sin(a) * 3), 0.45 + Math.random() * 0.2);
    }
    for (let i = 0; i < 6; i++) {
      const q = new THREE.Vector3(p.x + (Math.random() - 0.5) * 0.8, p.y + Math.random() * 1.6, p.z + (Math.random() - 0.5) * 0.8);
      this.puff(q, color, 0.7, 0.45, new THREE.Vector3(0, 1.5, 0));
    }
    this.burst(new THREE.Vector3(p.x, p.y + 0.9, p.z), color, 10, 5, 0.06);
    this.groundRing(p, color, 1.7, 0.35);
  }
  // vultos e um rastro de sombra entre a saída e a chegada
  shadowTrail(from, to, color, h = 1.8) {
    const n = 6;
    for (let i = 1; i < n; i++) {
      const q = from.clone().lerp(to, i / n);
      const mat = new THREE.MeshBasicMaterial({ color: i % 2 ? 0x2b1840 : color, transparent: true, opacity: 0.5, depthWrite: false });
      const m = new THREE.Mesh(this.capsule, mat);
      m.position.set(q.x, q.y + h / 2, q.z);
      m.scale.set(1, h / 1.8, 1);
      const life = 0.15 + (i / n) * 0.2;
      this.add(m, life, (dt, k) => { mat.opacity = 0.5 * (1 - k); m.scale.x = m.scale.z = 1 - k * 0.5; }, () => mat.dispose());
    }
    for (let i = 0; i < 14; i++) this.puff(from.clone().lerp(to, Math.random()).setY(from.y + 0.3 + Math.random() * 1.3), color, 0.45, 0.35);
  }
  slash(p, color, rot, size = 2.2, life = 0.28) {
    for (const [c, s] of [[color, 1.15], [0xffffff, 0.9]]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: slashTex, color: c, transparent: true, depthWrite: false, depthTest: false, rotation: rot }));
      sp.position.copy(p);
      sp.renderOrder = 7;
      this.add(sp, life, (dt, k) => {
        sp.material.rotation = rot - k * 1.4;
        sp.scale.setScalar(size * s * (0.6 + 0.5 * k));
        sp.material.opacity = 1 - k * k;
      }, () => sp.material.dispose());
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
    const cMat = new THREE.MeshBasicMaterial({ color, map: circleTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const circle = new THREE.Mesh(this.planeGeo, cMat);
    circle.position.set(g.x, 0.04, g.z);
    circle.renderOrder = 2;
    const fMat = new THREE.MeshBasicMaterial({ color: 0xff6a2f, map: glowTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const fill = new THREE.Mesh(this.planeGeo, fMat);
    fill.position.set(g.x, 0.035, g.z);
    this.scene.add(fill);
    const col = new THREE.Color(color), hot = new THREE.Color(0xff5a2a);
    this.add(circle, delay, (dt, k) => {
      circle.rotation.y += dt * (2 + k * 7);
      circle.scale.setScalar(2 * R * Math.min(1, k / 0.12));
      cMat.opacity = Math.min(1, k / 0.12);
      cMat.color.copy(col).lerp(hot, k * k);
      fill.scale.setScalar(2.4 * R * k);
      fMat.opacity = 0.2 + 0.55 * k;
    }, () => { cMat.dispose(); fMat.dispose(); this.scene.remove(fill); });

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
        if (Math.random() < 0.5) this.cloud(rock.position, 0x55504c, 0.35, new THREE.Vector3(0, 0.6, 0), 0.6, false);
      }
    }, () => halos.forEach(h => h.material.dispose()));
  }
  meteorImpact(p) {
    const g = new THREE.Vector3(p.x, 0, p.z), up = new THREE.Vector3(p.x, 0.6, p.z), rot = Math.random() * Math.PI * 2;
    const rnd = () => (Math.random() - 0.5) * 2;
    this.flash(up, 0xffffff, 3.6);
    this.flash(up, 0xffa030, 5.6);
    for (let i = 0; i < 10; i++) { // bola de fogo: camadas que crescem e sobem
      const c = [0xfff2a0, 0xffa030, 0xff5a1a][i % 3];
      this.puff(new THREE.Vector3(p.x + rnd() * 0.8, 0.4 + Math.random(), p.z + rnd() * 0.8), c, 2.2 + Math.random(), 0.55, new THREE.Vector3(rnd() * 3, 2 + Math.random() * 3, rnd() * 3), true);
    }
    for (let i = 0; i < 10; i++) { // fumaça subindo
      this.cloud(new THREE.Vector3(p.x + rnd() * 0.9, 0.5 + Math.random() * 0.8, p.z + rnd() * 0.9), i % 2 ? 0x5a5550 : 0x7a726a, 0.5 + Math.random() * 0.4,
        new THREE.Vector3(rnd() * 3, 2.5 + Math.random() * 2, rnd() * 3), 1.1 + Math.random() * 0.5);
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
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      o.t += dt;
      const k = Math.min(1, o.t / o.life);
      o.update(dt, k);
      if (k >= 1) {
        this.scene.remove(o.obj);
        o.dispose?.();
        this.list.splice(i, 1);
      }
    }
  }
}

// ---------- sons: arquivos CC0 de verdade (assets/sfx, fontes em assets/sfx/CREDITS.txt) ----------
// Cada "grupo" tem variações (punch_l1..6) e cada toque sai com um tom levemente diferente: nenhum soco soa igual.
export const audio = { volume: 0.6 };
const FILES = SFX_FILES;
// grupo = nome sem o número no fim (punch_l3 -> punch_l)
const GROUPS = {};
for (const f of FILES) (GROUPS[f.startsWith('v_') ? f : f.replace(/\d+$/, '')] ||= []).push(f); // falas do locutor (v_round_1...) não se agrupam
let ac, master, bus, crowdG, windG, windSrc;
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
  // torcida de fundo (nível 0..1, segue a empolgação da luta) e vento do giro do furacão
  ambience: (level) => { if (crowdG) crowdG.gain.setTargetAtTime(level, ac.currentTime, 0.4); },
  wind: (level, rate = 1) => {
    if (!windG) return;
    windG.gain.setTargetAtTime(level, ac.currentTime, level > windG.gain.value ? 0.05 : 0.25);
    windSrc.playbackRate.setTargetAtTime(rate, ac.currentTime, 0.1);
  },
};
