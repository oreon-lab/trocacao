import * as THREE from 'three';

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
  puff(p, color, size = 0.5, life = 0.3, vel = null) {
    if (this.density < 1 && Math.random() > this.density) return;
    const s = this.glow(color, size);
    s.position.copy(p);
    this.add(s, life, (dt, k) => {
      if (vel) s.position.addScaledVector(vel, dt);
      s.scale.setScalar(size * (1 - k * 0.8));
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

// ---------- sons sintetizados (sem arquivos) ----------
let ac, noiseBuf;
export const audio = { volume: 0.6 };
function ctx() {
  if (!ac) {
    ac = new AudioContext();
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}
function env(g, t0, peak, dur) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * audio.volume), t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}
function tone(f0, f1, dur, peak, type = 'sine') {
  const c = ctx(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, peak, dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(dur, peak, type, f0, f1, q = 1) {
  const c = ctx(), t = c.currentTime, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf;
  fl.type = type;
  fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, t);
  fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, peak, dur);
  s.connect(fl).connect(g).connect(c.destination);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

export const sfx = {
  unlock: () => ctx(),
  hit: (heavy, v = 1) => { tone(heavy ? 110 : 170, 40, heavy ? 0.22 : 0.12, 0.7 * v); noise(heavy ? 0.14 : 0.07, 0.6 * v, 'lowpass', heavy ? 2500 : 4000, 300); },
  block: (v = 1) => { tone(900, 400, 0.06, 0.25 * v, 'square'); noise(0.06, 0.3 * v, 'highpass', 3000, 6000); },
  parry: (v = 1) => { tone(1400, 2200, 0.25, 0.3 * v, 'triangle'); tone(2100, 2100, 0.35, 0.15 * v); },
  guardBreak: (v = 1) => { tone(300, 60, 0.3, 0.5 * v, 'sawtooth'); noise(0.2, 0.4 * v, 'lowpass', 3000, 200); },
  swing: (heavy, v = 1) => noise(heavy ? 0.2 : 0.1, 0.18 * v, 'bandpass', heavy ? 500 : 900, heavy ? 2000 : 3000, 2),
  dash: (v = 1) => noise(0.2, 0.3 * v, 'bandpass', 300, 2600, 1.5),
  jump: (v = 1) => tone(260, 520, 0.09, 0.12 * v, 'square'),
  land: (v = 1) => tone(90, 40, 0.12, 0.35 * v),
  slide: (v = 1) => noise(0.4, 0.2 * v, 'lowpass', 1500, 300),
  ko: () => tone(400, 50, 0.9, 0.5, 'sawtooth'),
  bell: () => { tone(880, 870, 1.2, 0.3, 'triangle'); tone(1320, 1310, 0.9, 0.15); },
};
