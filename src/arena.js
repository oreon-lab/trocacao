import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { T } from './config.js';
import { toonMat, addOutline, TORCH } from './toon.js';
import { events } from './fighter.js';
import { buildCrowd } from './crowd.js';

// ARENA DO CASTELO: coliseu de pedra numa vila medieval.
// Modelos: KayKit Dungeon Remastered + Medieval Hexagon (Kay Lousberg, CC0) — baixados por tools/get_env.py.
// A luta continua num círculo de raio T.arenaRadius com 4 pilares; o resto é visual (fica fora do círculo).
const DS = 0.75;          // pacote Dungeon -> metros do jogo (mureta na cintura do lutador)
const STAND = 2.6;        // da borda até o primeiro degrau da arquibancada
const TIER = { n: 4, depth: 1.3, rise: 0.75 };
const GATE = 0.14;        // meia abertura (rad) dos portões na arquibancada, em z+ (seu lado) e z- (do oponente)
const WALL_N = 44;        // peças do muro de fora (índice 0 e 22 = portões)
const UP = new THREE.Vector3(0, 1, 0);

// aleatório com semente: o cenário sai igual toda vez
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const nearGate = a => Math.min(Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))), Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))));

export function createArena(scene) {
  const R = T.arenaRadius;
  const S0 = R + STAND, STOP = S0 + TIER.n * TIER.depth, H = TIER.n * TIER.rise, RW = STOP + 0.7;
  scene.fog = new THREE.Fog(0xd6eeff, 120, 340); // longe fica azulado (montanhas)

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
  sky.renderOrder = 2; // por último: só pinta o fundo que sobrou (o depth test descarta o resto)
  scene.add(sky);

  // grama só fora do muro (dentro a base cobre tudo); chão desenhado depois do piso = o piso tampa e a GPU pula
  const grass = new THREE.Mesh(new THREE.RingGeometry(RW + 0.9, 300, 48, 1), toonMat(0x7fcf62));
  grass.renderOrder = 1;
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.12;
  grass.receiveShadow = true;
  scene.add(grass);
  // base embaixo do piso (tampa frestas entre os ladrilhos)
  const base = new THREE.Mesh(new THREE.CircleGeometry(RW + 1, 64), toonMat(0x6f6356));
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.1;
  base.receiveShadow = true;
  base.renderOrder = 1;
  scene.add(base);

  // faixas pintadas da arena (centro e borda), por cima do piso
  for (const [inner, outer, color] of [[R * 0.22, R * 0.22 + 0.22, 0xd8452f], [R - 0.62, R - 0.4, 0xd8452f], [R * 0.22 - 0.4, R * 0.22 - 0.3, 0xf4e7c8]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96), toonMat(color));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    ring.receiveShadow = true;
    scene.add(ring);
  }

  // pilares (cobertura): a colisão é um círculo; o visual é coluna de pedra com tocha
  const pillars = [];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    pillars.push({ x: Math.cos(a) * R * 0.55, z: Math.sin(a) * R * 0.55, r: 0.85, a });
  }

  // arquibancada de pedra em degraus, com abertura nos dois portões (degrau claro, espelho escuro)
  const seatGeos = [], riserGeos = [];
  for (const [p0, p1] of [[GATE, Math.PI - GATE], [Math.PI + GATE, 2 * Math.PI - GATE]]) {
    for (let i = 0; i < TIER.n; i++) {
      const r0 = S0 + i * TIER.depth, r1 = r0 + TIER.depth, y0 = i * TIER.rise, y1 = y0 + TIER.rise;
      riserGeos.push(new THREE.LatheGeometry([new THREE.Vector2(r0, y0), new THREE.Vector2(r0, y1)], 72, p0, p1 - p0));
      seatGeos.push(new THREE.LatheGeometry([new THREE.Vector2(r0, y1), new THREE.Vector2(r1, y1)], 72, p0, p1 - p0));
    }
    riserGeos.push(new THREE.LatheGeometry([new THREE.Vector2(STOP, H), new THREE.Vector2(STOP, 0)], 72, p0, p1 - p0));
  }
  // laterais dos portões (fecham a ponta dos degraus)
  for (const phi of [GATE, Math.PI - GATE, Math.PI + GATE, 2 * Math.PI - GATE]) {
    const sh = new THREE.Shape([new THREE.Vector2(S0, 0)]);
    for (let i = 0; i < TIER.n; i++) { sh.lineTo(S0 + i * TIER.depth, (i + 1) * TIER.rise); sh.lineTo(S0 + (i + 1) * TIER.depth, (i + 1) * TIER.rise); }
    sh.lineTo(STOP, 0);
    const g = new THREE.ShapeGeometry(sh);
    g.rotateY(-Math.PI / 2).rotateY(phi); // o perfil (r, y) vira um plano radial no ângulo do portão
    riserGeos.push(g);
  }
  const standMat = [toonMat(0xc9bba2, { side: THREE.DoubleSide }), toonMat(0x7d7486, { side: THREE.DoubleSide })];
  for (const [geos, mat] of [[seatGeos, standMat[0]], [riserGeos, standMat[1]]]) {
    const m = new THREE.Mesh(mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g)), mat);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }

  // torcida: lugares nos degraus (menos nos portões); os torcedores (personagens KayKit) entram com buildCrowd
  const fans = [], rf = rng(7);
  for (let i = 0; i < TIER.n; i++) {
    const r = S0 + i * TIER.depth + 0.62, y = (i + 1) * TIER.rise, n = Math.floor((2 * Math.PI * r) / 1.05);
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + (rf() - 0.5) * 0.02;
      if (rf() < 0.12 || nearGate(a) < GATE + 0.04) continue;
      fans.push({ x: Math.cos(a) * (r + (rf() - 0.5) * 0.15), y, z: Math.sin(a) * r, ph: rf() * 6.28, s: 0.74 + rf() * 0.16 });
    }
  }
  const crowd = new THREE.Group();
  scene.add(crowd);
  let crowdU = null;
  const _p = new THREE.Vector3();
  let hype = 0.15;

  // parede de energia que fecha a arena com o tempo (só aparece quando o raio diminui)
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 96, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff2a4a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true }), // 1 passada (cor única: igual)
  );
  wall.visible = false;
  wall.renderOrder = 3;
  scene.add(wall);

  // chamas das tochas (brilho piscando, 1 desenho pra todas) + luz quente nos pilares (TORCH em toon.js, sem PointLight)
  const flames = [], torchLights = [], flameU = { value: 0 };
  let torchOn = true;
  const flameTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 40, 2, 32, 34, 30);
    gr.addColorStop(0, 'rgba(255,250,210,1)'); gr.addColorStop(0.35, 'rgba(255,170,60,.9)'); gr.addColorStop(1, 'rgba(255,80,20,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  function flame(x, y, z, size, light) {
    const ph = Math.random() * 10;
    flames.push(x, y, z, size, ph);
    if (light && torchLights.length < TORCH.pos.value.length) torchLights.push({ v: TORCH.pos.value[torchLights.length].set(x, y, z, 0), ph });
  }
  // cartaz virado pra câmera por instância, tremida no shader (antes: 1 Sprite + material por tocha)
  function buildFlames() {
    const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
    const ib = new THREE.InstancedInterleavedBuffer(new Float32Array(flames), 5); // x y z tamanho fase
    geo.setAttribute('iPos', new THREE.InterleavedBufferAttribute(ib, 4, 0));
    geo.setAttribute('iPh', new THREE.InterleavedBufferAttribute(ib, 1, 4));
    geo.instanceCount = flames.length / 5;
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { map: { value: flameTex }, uTime: flameU },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uTime; attribute vec4 iPos; attribute float iPh; varying vec2 vUv;
        void main() {
          vUv = uv;
          float k = 1.0 + sin(uTime * 17.0 + iPh) * 0.08 + sin(uTime * 29.0 + iPh * 2.0) * 0.06;
          vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
          mv.xy += position.xy * vec2(iPos.w * k, iPos.w * k * 1.25);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D map; varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(map, vUv);
          #include <colorspace_fragment>
        }`,
    }));
    m.frustumCulled = false;
    scene.add(m);
  }

  // ---- modelos (carregam em paralelo; o jogo espera arena.ready junto com os personagens)
  const ready = (async () => {
    const loader = new GLTFLoader(), D = {}, X = {};
    const D_NAMES = ['floor_tile_large', 'floor_tile_small', 'floor_tile_small_broken_A', 'floor_tile_small_weeds_A', 'floor_dirt_large', 'barrier_column',
      'pillar', 'torch_mounted', 'wall', 'wall_archedwindow_open', 'wall_pillar', 'wall_doorway', 'barrel_large', 'barrel_small_stack', 'crates_stacked',
      'keg', 'sword_shield', 'box_stacked', 'banner_patternA_blue', 'banner_patternA_red', 'banner_patternB_yellow', 'banner_patternC_green',
      'banner_shield_blue', 'banner_shield_red', 'banner_triple_white', 'banner_thin_blue', 'banner_thin_red'];
    const X_NAMES = ['building_castle_red', 'building_tower_A_blue', 'building_tower_A_red', 'building_church_yellow', 'building_windmill_yellow',
      'building_home_A_green', 'building_home_B_red', 'building_tavern_blue', 'building_market_green', 'building_well_blue',
      'mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees', 'hills_A_trees', 'hills_B_trees', 'hills_C_trees',
      'trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium', 'tree_single_A', 'tree_single_B', 'rock_single_C', 'rock_single_E',
      'cloud_big', 'cloud_small', 'flag_red', 'flag_blue'];
    // cada .glb do pacote traz a MESMA imagem embutida: fica 1 textura por nome e as cópias são liberadas na hora
    const TEX = {};
    const dedupe = sc => (sc.traverse(o => {
      const t = o.material?.map;
      if (!t?.name) return;
      const keep = (TEX[t.name] ||= t);
      if (keep !== t) { t.source.data?.close?.(); o.material.map = keep; }
    }), sc);
    await Promise.all([
      ...D_NAMES.map(async n => { D[n] = dedupe((await loader.loadAsync(`assets/env/dungeon/${n}.glb`)).scene); }),
      ...X_NAMES.map(async n => { X[n] = dedupe((await loader.loadAsync(`assets/env/hex/${n}.gltf`)).scene); }),
    ]);
    // ring = perto da luta (contorno + sombra sempre); walls = muro/torres/estandartes (contorno e sombra só na qualidade alta)
    const lists = { floor: [], ring: [], walls: [], far: [] };
    const put = (list, src, x, y, z, ry = 0, s = 1, sy = s) => lists[list].push({ src, m: new THREE.Matrix4().compose(_p.set(x, y, z).clone(), new THREE.Quaternion().setFromAxisAngle(UP, ry), new THREE.Vector3(s, sy, s)) });
    const rnd = rng(42), pick = arr => arr[(rnd() * arr.length) | 0];
    const ringRot = a => -a - Math.PI / 2; // peça deitada na tangente do círculo, frente pro centro

    // piso de pedra (ladrilhos de 3 m) até debaixo da arquibancada; uns quadrados quebrados/com mato
    const TILE = 4 * DS, topY = -0.15 * DS;
    for (let gx = -8; gx <= 8; gx++) for (let gz = -8; gz <= 8; gz++) {
      const x = (gx + 0.5) * TILE - TILE / 2, z = (gz + 0.5) * TILE - TILE / 2;
      // ladrilho que fica todo debaixo da arquibancada não aparece (só perto dos portões ele aparece na fresta)
      if (Math.hypot(Math.abs(x) - TILE / 2, Math.abs(z) - TILE / 2) > S0 + (Math.abs(x) < 4 ? 1 : 0.2)) continue;
      if (rnd() < 0.18) { // 4 ladrilhos pequenos
        for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put('floor', D[pick(['floor_tile_small', 'floor_tile_small', 'floor_tile_small_broken_A', 'floor_tile_small_weeds_A'])], x + ox * TILE / 4, topY, z + oz * TILE / 4, ((rnd() * 4) | 0) * Math.PI / 2, DS);
      } else put('floor', D.floor_tile_large, x, topY, z, ((rnd() * 4) | 0) * Math.PI / 2, DS);
    }
    // corredor dos portões (ladrilhos até o muro)
    for (const sz of [1, -1]) for (let d = S0 + TILE / 2; d < RW + 1; d += TILE) put('floor', D.floor_tile_large, 0, topY, sz * d, 0, DS);

    // mureta de pedra em volta do círculo de luta
    const RB = R + 0.62, NB = Math.ceil((2 * Math.PI * RB) / (4 * DS));
    const chord = 2 * RB * Math.sin(Math.PI / NB);
    for (let i = 0; i < NB; i++) {
      const a = (i / NB) * Math.PI * 2;
      lists.ring.push({ src: D.barrier_column, m: new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * RB, 0, Math.sin(a) * RB), new THREE.Quaternion().setFromAxisAngle(UP, ringRot(a)), new THREE.Vector3(chord / 4, DS, DS)) });
    }

    // tochas e estandartes encostam na face de verdade de pilares/muro: um raio sai do lado de dentro e acha a parede
    const mountGroup = new THREE.Group(), ray = new THREE.Raycaster();
    const mountable = e => { const o = e.src.clone(); o.matrixAutoUpdate = false; o.matrix.copy(e.m); mountGroup.add(o); };
    const mountAt = (x, y, z, dx, dz) => {
      mountGroup.updateMatrixWorld(true);
      ray.set(new THREE.Vector3(x, y, z), new THREE.Vector3(dx, 0, dz).normalize());
      ray.far = 8;
      const h = ray.intersectObject(mountGroup, true)[0];
      if (!h) return null;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld).setY(0).normalize();
      return { x: h.point.x, z: h.point.z, n, ry: Math.atan2(n.x, n.z) }; // ry: frente da peça (+Z) = pra fora da parede
    };
    const torch = (list, x, y, z, dx, dz, s, light) => {
      const m = mountAt(x, y, z, dx, dz);
      if (!m) return;
      put(list, D.torch_mounted, m.x, y, m.z, m.ry, s);
      flame(m.x + m.n.x * 0.47 * s, y + 0.78 * s, m.z + m.n.z * 0.47 * s, 0.55 + 0.3 * s, light);
    };

    // pilares de pedra com tocha virada pro centro
    for (const p of pillars) {
      put('ring', D.pillar, p.x, 0, p.z, -p.a, 1.15);
      mountable(lists.ring[lists.ring.length - 1]);
    }
    for (const p of pillars) {
      const ix = -Math.cos(p.a), iz = -Math.sin(p.a); // pro centro
      torch('ring', p.x + ix * 3, 2.2, p.z + iz * 3, -ix, -iz, 1.1, true);
    }

    // muro de fora com janelas em arco, pilastras, portões, estandartes e tochas
    const wc = 2 * RW * Math.sin(Math.PI / WALL_N), wsx = wc / 4, wsy = 1.35;
    const kinds = ['wall_pillar', 'wall', 'wall_archedwindow_open', 'wall'];
    for (let i = 0; i < WALL_N; i++) {
      const a = Math.PI / 2 + (i / WALL_N) * Math.PI * 2, x = Math.cos(a) * RW, z = Math.sin(a) * RW;
      const gate = i === 0 || i === WALL_N / 2;
      lists.walls.push({ src: D[gate ? 'wall_doorway' : kinds[i % 4]], m: new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(UP, ringRot(a)), new THREE.Vector3(wsx, wsy, wsx)) });
      mountable(lists.walls[lists.walls.length - 1]);
    }
    for (let i = 0; i < WALL_N; i++) {
      const a = Math.PI / 2 + (i / WALL_N) * Math.PI * 2, x = Math.cos(a) * RW, z = Math.sin(a) * RW;
      const gate = i === 0 || i === WALL_N / 2;
      const ix = -Math.cos(a), iz = -Math.sin(a), side = Math.sin(a); // >0 = seu lado (azul), <0 = lado do oponente (vermelho)
      if (!gate && i % 4 === 3) { // estandarte na parede lisa, pendurado abaixo do topo
        const team = side > 0.35 ? 'blue' : side < -0.35 ? 'red' : null;
        const name = i === 3 || i === WALL_N - 1 || Math.abs(i - WALL_N / 2) <= 3 ? `banner_shield_${side > 0 ? 'blue' : 'red'}`
          : team ? `banner_patternA_${team}` : pick(['banner_patternB_yellow', 'banner_patternC_green', 'banner_triple_white']);
        const m = mountAt(x + ix * 4, 4.2, z + iz * 4, -ix, -iz);
        if (m) put('walls', D[name], m.x, 2.67, m.z, m.ry, 0.72);
      }
      if (!gate && i % 4 === 0) torch('walls', x + ix * 4, 4.0, z + iz * 4, -ix, -iz, 1, false); // na frente da pilastra
      if (gate) for (const sx of [-1, 1]) { // tochas dos dois lados do portão
        const ox = Math.sin(a) * sx * 1.25, oz = -Math.cos(a) * sx * 1.25;
        torch('walls', x + ix * 3 + ox, 2.3, z + iz * 3 + oz, -ix, -iz, 1, false);
      }
    }
    // 4 torres nas diagonais do muro (azuis do seu lado, vermelhas do outro), com bandeira
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + k * Math.PI / 2, x = Math.cos(a) * (RW + 1.2), z = Math.sin(a) * (RW + 1.2);
      put('walls', X[z > 0 ? 'building_tower_A_blue' : 'building_tower_A_red'], x, -0.2, z, -a, 4.4);
    }
    // caixotes, barris e armas no corredor entre a mureta e a arquibancada
    const props = ['barrel_large', 'barrel_small_stack', 'crates_stacked', 'keg', 'sword_shield', 'box_stacked'];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2 + rnd() * 0.15;
      if (nearGate(a) < 0.3) continue;
      const wallHung = props[i % props.length] === 'sword_shield', name = props[i % props.length], r = wallHung ? S0 - 0.03 : R + 1.75;
      put('ring', D[name], Math.cos(a) * r, wallHung ? 0.42 : 0, Math.sin(a) * r, wallHung ? ringRot(a) : rnd() * 6.28, name === 'box_stacked' ? 0.42 : 0.55);
    }

    // ---- lá fora: vila, castelo, morros, montanhas e nuvens (bem grandes: de dentro só aparece o que passa do muro)
    put('far', X.building_castle_red, 0, -1, -104, 0, 17); // castelo atrás do portão do oponente (aparece por cima do muro)
    const town = [['building_church_yellow', 96, -58, 11], ['building_windmill_yellow', -92, -66, 13], ['building_tavern_blue', -82, 52, 10],
      ['building_market_green', 74, 70, 10], ['building_windmill_yellow', 58, 108, 11], ['building_home_A_green', 62, -86, 11],
      ['building_home_B_red', -60, -96, 11], ['building_home_A_green', -108, 18, 10], ['building_home_B_red', 112, 14, 10],
      ['building_well_blue', 40, 62, 8], ['building_tower_A_blue', -40, 118, 9], ['building_tower_A_red', 44, -122, 9]];
    for (const [n, x, z, s] of town) put('far', X[n], x, -0.5, z, Math.atan2(-x, -z) + (rnd() - 0.5) * 0.6, s);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rnd() * 0.25, r = 125 + rnd() * 45;
      put('far', X[pick(['hills_A_trees', 'hills_B_trees', 'hills_C_trees'])], Math.cos(a) * r, -1, Math.sin(a) * r, rnd() * 6.28, 14 + rnd() * 7);
    }
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2 + rnd() * 0.3, r = 245 + rnd() * 30;
      put('far', X[pick(['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees'])], Math.cos(a) * r, -2, Math.sin(a) * r, rnd() * 6.28, 26 + rnd() * 12);
    }
    for (let i = 0; i < 34; i++) {
      const a = rnd() * Math.PI * 2, r = 34 + rnd() * 60;
      if (nearGate(a) < 0.12 && r < 60) continue; // deixa a frente dos portões livre
      put('far', X[pick(['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium', 'tree_single_A', 'tree_single_B', 'rock_single_C', 'rock_single_E'])], Math.cos(a) * r, -0.3, Math.sin(a) * r, rnd() * 6.28, 6 + rnd() * 4);
    }
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2, r = 90 + rnd() * 120;
      put('far', X[rnd() < 0.5 ? 'cloud_big' : 'cloud_small'], Math.cos(a) * r, 45 + rnd() * 35, Math.sin(a) * r, rnd() * 6.28, 7 + rnd() * 6);
    }

    // o longe vai em 8 fatias: o que fica atrás da câmera sai no recorte (~metade dos triângulos).
    // Piso e muro não: da câmera da luta quase tudo aparece, fatiar só somaria desenhos.
    scene.add(bake(lists.floor, { cast: false }));
    scene.add(bake(lists.ring, { outline: 0.03 }));
    walls = bake(lists.walls, { outline: 0.03 });
    scene.add(walls);
    scene.add(bake(lists.far, { cast: false, receive: false, sectors: 8 }));
    buildFlames();
    applyQuality();
  })();
  let walls = null, quality = {};
  function applyQuality() {
    if (!walls) return;
    for (const m of walls.children) { m.castShadow = quality.wallShadow !== false; for (const o of m.children) o.visible = quality.wallOutline !== false; }
    torchOn = quality.torch !== false;
  }

  const api = {
    R,
    sky,
    pillars,
    crowd,
    ready,
    buildCrowd(renderer, camera) { const c = buildCrowd(renderer, camera, fans); crowd.add(c.mesh); crowdU = c.uniforms; },
    hype(n) { hype = Math.min(1.5, hype + n); }, // torcida vibra com golpe forte
    get hypeLevel() { return hype; },
    // qualidade (main.js applyQuality): { wallOutline, wallShadow, torch } — false desliga
    setQuality(q) { quality = q; applyQuality(); },
    update(t, dt) {
      hype = Math.max(0.15, hype - dt * 0.35);
      flameU.value = t; // fogo tremendo: no shader
      for (const l of torchLights) l.v.w = torchOn ? 1 + Math.sin(t * 17 + l.ph) * 0.08 + Math.sin(t * 29 + l.ph * 2) * 0.06 : 0;
      // torcida: anima no shader (troca de quadro + pulinho), aqui só passa o tempo e a empolgação
      if (crowdU) { crowdU.uTime.value = t; crowdU.uHype.value = Math.min(1, hype); }
    },
    setRadius(r, t = 0) {
      api.R = r;
      wall.visible = r < R - 0.05;
      wall.scale.set(r, 1.5 + Math.sin(t * 6) * 0.1, r);
      wall.position.y = wall.scale.y / 2;
      wall.material.opacity = 0.62 + Math.sin(t * 9) * 0.1;
    },
    collide(f) {
      const d = Math.hypot(f.pos.x, f.pos.z), lim = api.R - T.radius;
      if (d > lim) push(f, f.pos.x / d, f.pos.z / d, d - lim);
      for (const p of pillars) {
        const dx = f.pos.x - p.x, dz = f.pos.z - p.z, dd = Math.hypot(dx, dz), min = p.r + T.radius;
        if (dd < min && dd > 1e-5) push(f, -dx / dd, -dz / dd, min - dd);
      }
    },
  };
  return api;
}

// empurra o lutador pra dentro e tira a velocidade que vai contra a parede (n aponta pra parede)
// Bateu rápido: no dash, ricocheteia (ganha o dash de novo na direção refletida); arremessado, quica e fica tonto.
function push(f, nx, nz, depth) {
  f.pos.x -= nx * depth;
  f.pos.z -= nz * depth;
  const vn = f.vel.x * nx + f.vel.z * nz;
  if (vn <= 0) return;
  if (vn > T.bounceSpeed && !f.bounced && !f.remote && (f.dashT > 0 || f.stunT > 0)) {
    f.bounced = true;
    const point = f.pos.clone().addScaledVector(new THREE.Vector3(nx, 0, nz), T.radius).setY(f.pos.y + 1);
    if (f.dashT > 0) {
      const dn = f.dashDir.x * nx + f.dashDir.z * nz;
      f.dashDir.x -= 2 * dn * nx; f.dashDir.z -= 2 * dn * nz;
      f.dashT = T.dashTime;
      f.vel.x -= 2 * vn * nx; f.vel.z -= 2 * vn * nz;
      events.push({ type: 'bounce', f, point });
    } else {
      f.vel.x -= 1.6 * vn * nx; f.vel.z -= 1.6 * vn * nz; // volta com 60% da velocidade
      f.vel.y = Math.max(f.vel.y, 4);
      f.grounded = false;
      f.stunT += T.wallSplatStun;
      const by = f.thrown; // veio do giro do furacão: dano extra
      if (by) { f.hp -= T.throwWallDmg; f.flashT = 0.12; by.gain(8); f.thrown = null; f.checkKO(); }
      events.push({ type: 'splat', f, victim: f, point, big: !!by, dmg: by ? T.throwWallDmg : 0 });
    }
    return;
  }
  f.vel.x -= vn * nx; f.vel.z -= vn * nz;
}

// Junta os modelos posicionados numa malha por textura (todo pacote KayKit usa um atlas só) -> poucas draw calls.
// sectors: corta em fatias pelo ângulo (+ o miolo) pra o recorte de câmera tirar o que está atrás.
// Material toon (mesmo visual dos personagens), 1 por atlas pra arena toda; contorno preto só no que fica perto.
const MATS = new Map();
function bake(list, { outline = 0, cast = true, receive = true, sectors = 0 } = {}) {
  const groups = new Map(), _w = new THREE.Matrix4();
  for (const { src, m } of list) {
    const x = m.elements[12], z = m.elements[14];
    const sec = !sectors ? 0 : Math.hypot(x, z) < 8 ? sectors : Math.floor(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * sectors) % sectors;
    src.updateMatrixWorld(true);
    src.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(_w.multiplyMatrices(m, o.matrixWorld));
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]); // indexado: ~metade dos vértices de antes (toNonIndexed)
      const mk = o.material.map?.name || o.material.map?.uuid || '#' + o.material.color.getHexString(), key = mk + '|' + sec;
      if (!groups.has(key)) groups.set(key, { mk, mat: o.material, geos: [] });
      groups.get(key).geos.push(g);
    });
  }
  const out = new THREE.Group();
  for (const { mk, mat, geos } of groups.values()) {
    if (!MATS.has(mk)) MATS.set(mk, toonMat(mat.map ? 0xffffff : mat.color, { map: mat.map || null }));
    const mesh = new THREE.Mesh(mergeGeometries(geos), MATS.get(mk));
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    if (outline) addOutline(mesh, outline);
    out.add(mesh);
  }
  return out;
}
