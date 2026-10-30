import * as THREE from 'three';
import { Rig, charClip, CHARACTERS } from './rig.js';

// TORCIDA: os personagens KayKit de verdade (mesmo toon + contorno dos lutadores), sem pesar.
// No carregamento cada personagem é fotografado em vários quadros da comemoração e da espera, numa textura só
// ("impostores"). Na arquibancada cada torcedor é um cartaz virado pra câmera que troca de quadro = anima.
// ~400 torcedores = 800 triângulos (o modelo 3D inteiro seria ~4.700 cada).
const CELL = { w: 168, h: 252 };
const CHEER = 8, IDLE = 4, FRAMES = CHEER + IDLE;
const FRAME_H = 2.25; // metros de personagem que cabem na foto (braços pra cima)

function bake(renderer) {
  const names = Object.keys(CHARACTERS);
  // sem MSAA (o shader corta no alfa e lê por mipmap: não muda nada, e eram ~146 MB de buffers presos)
  const rt = new THREE.WebGLRenderTarget(CELL.w * FRAMES, CELL.h * names.length);
  rt.texture.generateMipmaps = false; // mipmaps 1x no fim (antes refazia a cadeia inteira a cada uma das 108 fotos)
  rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9ab0c8, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-3, 6, -8); // de frente e de cima, como o sol vê a arquibancada
  scene.add(key);
  const w = FRAME_H * CELL.w / CELL.h;
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, FRAME_H, 0, 0.1, 30);
  cam.position.set(0, 0, -8); // personagem olha pra -Z: a câmera fica na frente dele
  cam.lookAt(0, 0, 0);
  const clear = renderer.getClearColor(new THREE.Color()), clearA = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  rt.scissorTest = true;
  names.forEach((name, row) => {
    const rig = new Rig(name);
    scene.add(rig.root);
    const mixer = new THREE.AnimationMixer(rig.model);
    const shots = [['Cheer', CHEER], ['Idle', IDLE]];
    let col = 0;
    for (const [clipName, n] of shots) {
      const clip = charClip(name, clipName), act = mixer.clipAction(clip);
      mixer.stopAllAction();
      act.play();
      for (let k = 0; k < n; k++) {
        act.time = (k / n) * clip.duration;
        mixer.update(0);
        rig.root.updateMatrixWorld(true);
        rt.viewport.set(col * CELL.w, row * CELL.h, CELL.w, CELL.h);
        rt.scissor.copy(rt.viewport);
        renderer.setRenderTarget(rt); // o three só aplica viewport/scissor do alvo ao ativá-lo
        renderer.render(scene, cam);
        col++;
      }
    }
    scene.remove(rig.root);
    // libera o boneco da foto (texturas dos ossos, materiais, ações)
    mixer.stopAllAction(); mixer.uncacheRoot(rig.model);
    if (rig.dispose) rig.dispose();
    else {
      rig.model.traverse(o => o.isSkinnedMesh && o.skeleton.dispose());
      for (const m of rig.mats || []) m.dispose();
      for (const g of rig.glows || []) g.geometry.dispose();
      rig.mixer?.stopAllAction(); rig.mixer?.uncacheRoot(rig.model);
    }
  });
  // gera os mipmaps: um render vazio de 1 pixel (canto vazio da 1ª foto) faz o three montar a cadeia
  rt.texture.generateMipmaps = true;
  rt.viewport.set(0, 0, 1, 1);
  rt.scissor.set(0, 0, 1, 1);
  renderer.setRenderTarget(rt);
  renderer.render(new THREE.Scene(), cam);
  rt.scissorTest = false;
  renderer.setRenderTarget(null);
  renderer.setClearColor(clear, clearA);
  return { texture: rt.texture, rows: names.length, size: new THREE.Vector2(w, FRAME_H) };
}

const TINTS = [[1, 1, 1], [1, 1, 1], [1, 0.93, 0.84], [0.88, 0.93, 1], [0.86, 0.86, 0.86], [1, 0.87, 0.87], [0.88, 1, 0.9], [1, 0.96, 0.8]];

// fans: [{ x, y, z, s, ph }] (posições nos degraus). camera: a do jogo (os cartazes viram pra ela).
export function buildCrowd(renderer, camera, fans) {
  const atlas = bake(renderer), n = fans.length;
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const info = new Float32Array(n * 4), tint = new Float32Array(n * 3);
  const uniforms = {
    map: { value: atlas.texture }, uCam: { value: camera.position }, uTime: { value: 0 }, uHype: { value: 0.15 },
    uSize: { value: atlas.size }, uGrid: { value: new THREE.Vector4(FRAMES, atlas.rows, CHEER, IDLE) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform vec3 uCam; uniform float uTime, uHype; uniform vec2 uSize; uniform vec4 uGrid;
      attribute vec4 aInfo; // personagem, fase, ritmo, comemorando?
      attribute vec3 aTint;
      varying vec2 vUv; varying vec3 vTint;
      void main() {
        vec3 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float s = length(instanceMatrix[0].xyz);
        vec3 d = uCam - base; d.y = 0.0; d = normalize(d);
        vec3 right = vec3(d.z, 0.0, -d.x);
        bool cheer = aInfo.w > 0.5;
        float t = uTime * aInfo.z * (cheer ? 0.55 + 0.9 * uHype : 0.35) + aInfo.y;
        float nf = cheer ? uGrid.z : uGrid.w;
        float f = floor(mod(t * nf, nf)) + (cheer ? 0.0 : uGrid.z);
        float jump = cheer ? max(0.0, sin(t * 6.2832)) * (0.03 + 0.2 * uHype) : 0.0;
        vec3 p = base + right * (position.x * uSize.x * s) + vec3(0.0, position.y * uSize.y * s + jump, 0.0);
        vUv = vec2((f + uv.x) / uGrid.x, (aInfo.x + uv.y) / uGrid.y);
        vTint = aTint;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D map; varying vec2 vUv; varying vec3 vTint;
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.45) discard;
        gl_FragColor = vec4(c.rgb * vTint, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const m = new THREE.Matrix4();
  fans.forEach((f, i) => {
    mesh.setMatrixAt(i, m.makeScale(f.s, f.s, f.s).setPosition(f.x, f.y, f.z));
    const r = (f.ph * 997) % 1;
    info.set([Math.floor(r * atlas.rows), f.ph, 0.8 + ((f.ph * 31) % 1) * 0.6, r * 7 % 1 < 0.65 ? 1 : 0], i * 4);
    tint.set(TINTS[Math.floor(((f.ph * 53) % 1) * TINTS.length)], i * 3);
  });
  geo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  mesh.frustumCulled = false; // o cartaz se move no shader; a esfera de recorte do plano não vale
  return { mesh, uniforms };
}
