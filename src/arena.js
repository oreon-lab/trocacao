import * as THREE from 'three';
import { T } from './config.js';
import { toonMat, part } from './toon.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

  // arquibancada em degraus em volta da arena
  const steps = [[R + 2.4, 0], [R + 2.4, 0.7], [R + 3.6, 0.7], [R + 3.6, 1.4], [R + 4.8, 1.4], [R + 4.8, 2.1], [R + 6.2, 2.1], [R + 6.2, 0]];
  const stands = part(new THREE.LatheGeometry(steps.map(([r, y]) => new THREE.Vector2(r, y)), 96), toonMat(0x8d7bd6), 0.05);
  scene.add(stands);

  // torcida: um InstancedMesh só (~400 bonecos, 1 draw call), cada um com cor e ritmo próprios
  const fanGeo = mergeGeometries([new THREE.CapsuleGeometry(0.22, 0.35, 3, 8).translate(0, 0.42, 0), new THREE.SphereGeometry(0.2, 10, 8).translate(0, 0.95, 0)]);
  const fanCols = [0xff5a4f, 0x3fa7ff, 0xffd23f, 0x5dd36b, 0xff8ad8, 0xffffff, 0xb06bff, 0xff9a3c];
  const fans = [];
  [[R + 3.0, 0.7], [R + 4.2, 1.4], [R + 5.5, 2.1]].forEach(([r, y]) => {
    const n = Math.floor((2 * Math.PI * r) / 0.95);
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.18) continue; // buracos na torcida
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.02;
      fans.push({ x: Math.cos(a) * (r + (Math.random() - 0.5) * 0.2), y, z: Math.sin(a) * r, a, ph: Math.random() * 6.28, sp: 6 + Math.random() * 5, s: 0.85 + Math.random() * 0.35 });
    }
  });
  const crowd = new THREE.InstancedMesh(fanGeo, toonMat(0xffffff), fans.length);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
  fans.forEach((f, i) => crowd.setColorAt(i, _c.set(fanCols[i % fanCols.length])));
  crowd.castShadow = false;
  scene.add(crowd);
  let hype = 0.15;

  // postes de luz com bandeirinhas entre eles
  const POSTS = 10, postR = R + 1.6, lampMat = toonMat(0xfff3b0, { emissive: 0xffd76a, emissiveIntensity: 0.9 });
  const flagGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.22, 0, 0), new THREE.Vector3(0.22, 0, 0), new THREE.Vector3(0, -0.45, 0)]);
  flagGeo.computeVertexNormals();
  const flagSpots = [];
  for (let i = 0; i < POSTS; i++) {
    const a = (i / POSTS) * Math.PI * 2 + 0.31, x = Math.cos(a) * postR, z = Math.sin(a) * postR;
    const post = part(new THREE.CapsuleGeometry(0.12, 4.6, 3, 8), toonMat(0x4a4058), 0.04);
    post.position.set(x, 2.3, z);
    scene.add(post);
    const lamp = part(new THREE.SphereGeometry(0.42, 14, 10), lampMat, 0.04, false);
    lamp.position.set(x, 4.9, z);
    scene.add(lamp);
    const a2 = ((i + 1) / POSTS) * Math.PI * 2 + 0.31;
    for (let k = 1; k < 14; k++) { // bandeirinhas penduradas numa curva entre um poste e o próximo
      const t = k / 14, aa = a + (a2 - a) * t;
      flagSpots.push({ x: Math.cos(aa) * postR, y: 4.4 - Math.sin(t * Math.PI) * 0.9, z: Math.sin(aa) * postR, a: aa });
    }
  }
  const flags = new THREE.InstancedMesh(flagGeo, toonMat(0xffffff, { side: THREE.DoubleSide }), flagSpots.length);
  flagSpots.forEach((f, i) => {
    _q.setFromAxisAngle(_up, -f.a + Math.PI / 2);
    flags.setMatrixAt(i, _m.compose(_p.set(f.x, f.y, f.z), _q, _s.set(1, 1, 1)));
    flags.setColorAt(i, _c.set(fanCols[i % fanCols.length]));
  });
  scene.add(flags);

  // decoração estática (árvores, nuvens, montanhas): monta tudo e depois FUNDE por material
  // -> de ~400 objetos pra ~8 draw calls
  const deco = new THREE.Group();
  const trunkMat = toonMat(0x9b6a43), leafMat = toonMat(0x4cc45e), cloudMat = toonMat(0xffffff, { emissive: 0x334455 });
  const rockMat = toonMat(0x7d8fb3), snowMat = toonMat(0xf4f8ff);
  const trunkGeo = new THREE.CapsuleGeometry(0.35, 2, 4, 10), leafGeo = new THREE.SphereGeometry(1, 16, 12);
  for (let i = 0; i < 36; i++) {
    const a = Math.random() * Math.PI * 2, d = R + 10 + Math.random() * 45;
    const tree = new THREE.Group();
    tree.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    const trunk = part(trunkGeo, trunkMat, 0.06);
    trunk.position.y = 1.2;
    tree.add(trunk);
    for (let j = 0; j < 3; j++) {
      const leaf = part(leafGeo, leafMat, 0.06);
      leaf.scale.setScalar(1.3 + Math.random() * 0.8);
      leaf.position.set((Math.random() - 0.5) * 1.6, 3 + j * 0.9 + Math.random() * 0.4, (Math.random() - 0.5) * 1.6);
      tree.add(leaf);
    }
    tree.scale.setScalar(0.8 + Math.random() * 0.8);
    deco.add(tree);
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
    deco.add(cloud);
  }
  const mtnGeo = new THREE.ConeGeometry(1, 1, 7, 1), capGeo = new THREE.ConeGeometry(1, 1, 7, 1);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.2, d = 170 + Math.random() * 50, h = 35 + Math.random() * 40, w = 30 + Math.random() * 25;
    const mtn = part(mtnGeo, rockMat, 0.8, false);
    mtn.scale.set(w, h, w);
    mtn.position.set(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d);
    const cap = new THREE.Mesh(capGeo, snowMat);
    cap.scale.set(w * 0.36, h * 0.36, w * 0.36);
    cap.position.set(mtn.position.x, h - 2 - h * 0.18 + 0.3, mtn.position.z);
    deco.add(mtn, cap);
  }
  scene.add(mergeStatic(deco));

  return {
    R,
    sky,
    pillars,
    hype(n) { hype = Math.min(1.5, hype + n); }, // torcida vibra com golpe forte
    // torcida pulando (só atualiza as matrizes; continua 1 draw call)
    update(t, dt) {
      hype = Math.max(0.15, hype - dt * 0.35);
      fans.forEach((f, i) => {
        const jump = Math.max(0, Math.sin(t * f.sp + f.ph)) * (0.04 + 0.22 * hype);
        _q.setFromAxisAngle(_up, -f.a - Math.PI / 2);
        crowd.setMatrixAt(i, _m.compose(_p.set(f.x, f.y + jump, f.z), _q, _s.setScalar(f.s)));
      });
      crowd.instanceMatrix.needsUpdate = true;
    },
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

// funde todas as malhas de um grupo por material (geometria já na posição final) -> poucas draw calls
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const byMat = new Map();
  group.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const list = byMat.get(o.material) || [];
    list.push(g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]));
    byMat.set(o.material, list);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = !mat.isShaderMaterial;
    m.receiveShadow = !mat.isShaderMaterial;
    out.add(m);
  }
  return out;
}
