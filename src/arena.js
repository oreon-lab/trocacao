import * as THREE from 'three';
import { T } from './config.js';
import { toonMat, part } from './toon.js';

export function createArena(scene) {
  const R = T.arenaRadius;

  // céu degradê
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x3d9cff) }, bot: { value: new THREE.Color(0xd9f4ff) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bot, top, clamp(vP.y * 1.6 + 0.1, 0.0, 1.0)), 1.0); \n#include <colorspace_fragment>\n }',
    }),
  );
  scene.add(sky);

  const grass = new THREE.Mesh(new THREE.CircleGeometry(300, 48), toonMat(0x7ad36b));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  // chão xadrez (cada casa = 2m)
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    g.fillStyle = (i + j) % 2 ? '#ffe2a8' : '#f6cc82';
    g.fillRect(i * 64, j * 64, 64, 64);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.setScalar((2 * R + 2) / 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 1, 64), toonMat(0xffffff, { map: tex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  floor.receiveShadow = true;
  scene.add(floor);

  for (const [inner, outer] of [[R * 0.22, R * 0.22 + 0.2], [R - 0.6, R - 0.4]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64), toonMat(0xff6b4a));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.receiveShadow = true;
    scene.add(ring);
  }

  // borda de almofadas
  [[0.35, 0xff5a8a], [0.95, 0xffd23f]].forEach(([y, color]) => {
    const t = part(new THREE.TorusGeometry(R + 0.35, 0.33, 12, 96), toonMat(color), 0.05);
    t.rotation.x = Math.PI / 2;
    t.position.y = y;
    scene.add(t);
  });

  // pilares (cobertura)
  const pillars = [];
  const pillarMat = toonMat(0x9b86ff);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, x = Math.cos(a) * R * 0.55, z = Math.sin(a) * R * 0.55;
    const p = part(new THREE.CapsuleGeometry(0.85, 3.4, 6, 20), pillarMat, 0.05);
    p.position.set(x, 1.7, z);
    scene.add(p);
    pillars.push({ x, z, r: 0.85 });
  }

  // decoração: árvores e nuvens
  const trunkMat = toonMat(0x9b6a43), leafMat = toonMat(0x4cc45e), cloudMat = toonMat(0xffffff, { emissive: 0x334455 });
  const trunkGeo = new THREE.CapsuleGeometry(0.35, 2, 4, 10), leafGeo = new THREE.SphereGeometry(1, 16, 12);
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2, d = R + 7 + Math.random() * 45;
    const tree = new THREE.Group();
    tree.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    const trunk = part(trunkGeo, trunkMat, 0.06);
    trunk.position.y = 1.2;
    tree.add(trunk);
    for (let j = 0; j < 3; j++) {
      const leaf = part(leafGeo, leafMat, 0.06);
      const s = 1.3 + Math.random() * 0.8;
      leaf.scale.setScalar(s);
      leaf.position.set((Math.random() - 0.5) * 1.6, 3 + j * 0.9 + Math.random() * 0.4, (Math.random() - 0.5) * 1.6);
      tree.add(leaf);
    }
    tree.scale.setScalar(0.8 + Math.random() * 0.8);
    scene.add(tree);
  }
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 100;
    const cloud = new THREE.Group();
    cloud.position.set(Math.cos(a) * d, 30 + Math.random() * 30, Math.sin(a) * d);
    for (let j = 0; j < 4; j++) {
      const puff = part(leafGeo, cloudMat, 0.05, false);
      puff.scale.setScalar(4 + Math.random() * 3);
      puff.position.set((j - 1.5) * 5, Math.random() * 2, (Math.random() - 0.5) * 4);
      cloud.add(puff);
    }
    scene.add(cloud);
  }

  return {
    R,
    sky,
    pillars,
    collide(f) {
      const d = Math.hypot(f.pos.x, f.pos.z), lim = R - T.radius;
      if (d > lim) push(f, f.pos.x / d, f.pos.z / d, d - lim);
      for (const p of pillars) {
        const dx = f.pos.x - p.x, dz = f.pos.z - p.z, dd = Math.hypot(dx, dz), min = p.r + T.radius;
        if (dd < min && dd > 1e-5) push(f, -dx / dd, -dz / dd, min - dd);
      }
    },
  };
}

// empurra o lutador pra dentro e tira a velocidade que vai contra a parede (n aponta pra parede)
function push(f, nx, nz, depth) {
  f.pos.x -= nx * depth;
  f.pos.z -= nz * depth;
  const vn = f.vel.x * nx + f.vel.z * nz;
  if (vn > 0) { f.vel.x -= vn * nx; f.vel.z -= vn * nz; }
}
