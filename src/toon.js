import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// 3 tons de luz = visual de desenho
const grad = new THREE.DataTexture(new Uint8Array([95, 180, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter;
grad.needsUpdate = true;

// Luz das tochas sem PointLight: mesma conta do three (gradiente toon, queda com a distância, alcance 9 m),
// mas num uniform só. Fragmento longe de tocha pula a conta; ligar/desligar (w) não recompila nada.
// xyz = posição no mundo, w = força (0 = apagada; a arena pisca isso todo quadro)
export const TORCH = {
  pos: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -99, 0, 0)) },
  color: { value: new THREE.Color(0xff9a3c).multiplyScalar(14) },
};
function torchLight(s) {
  s.uniforms.uTorch = TORCH.pos;
  s.uniforms.uTorchColor = TORCH.color;
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTorchW;').replace('#include <project_vertex>', `#include <project_vertex>
    vec4 torchW = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      torchW = instanceMatrix * torchW;
    #endif
    vTorchW = (modelMatrix * torchW).xyz;`);
  s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uTorch[4]; uniform vec3 uTorchColor; varying vec3 vTorchW;')
    .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
    for (int i = 0; i < 4; i++) {
      vec3 L = uTorch[i].xyz - vTorchW; float d2 = dot(L, L);
      if (uTorch[i].w <= 0.0 || d2 >= 81.0) continue;
      float d = sqrt(d2), fall = pow2(saturate(1.0 - pow4(d / 9.0))) / max(d2, 0.01);
      vec3 Lv = (viewMatrix * vec4(L / d, 0.0)).xyz;
      reflectedLight.directDiffuse += getGradientIrradiance(normal, Lv) * uTorchColor * (uTorch[i].w * fall) * BRDF_Lambert(material.diffuseColor);
    }`);
}

export const toonMat = (color, extra = {}) => {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: grad, ...extra });
  m.onBeforeCompile = torchLight; // mesma função pra todos = mesmo programa (a chave do cache é o texto dela)
  return m;
};

// Contorno preto por "casca invertida": cópia da malha inflada pela normal, renderizando só o verso.
// Funciona também em InstancedMesh (partículas dos efeitos).
const outlineMats = new Map();
export function outlineMat(t) {
  if (!outlineMats.has(t)) {
    outlineMats.set(t, new THREE.ShaderMaterial({
      uniforms: { t: { value: t } },
      vertexShader: `uniform float t; void main(){ vec4 p = vec4(position + normal * t, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p; }`,
      fragmentShader: 'void main(){ gl_FragColor = vec4(0.06, 0.05, 0.09, 1.0); }',
      side: THREE.BackSide,
    }));
  }
  return outlineMats.get(t);
}

// normais suavizadas pra casca não abrir nas emendas da geometria
const smooth = new WeakMap();
export function smoothGeo(g) {
  if (!smooth.has(g)) {
    let s = g.clone();
    s.deleteAttribute('normal');
    s.deleteAttribute('uv');
    s = mergeVertices(s, 1e-4);
    s.computeVertexNormals();
    smooth.set(g, s);
  }
  return smooth.get(g);
}

export function addOutline(mesh, t = 0.03) {
  const o = new THREE.Mesh(smoothGeo(mesh.geometry), outlineMat(t));
  o.raycast = () => {};
  mesh.add(o);
  return mesh;
}

export function part(geo, mat, t = 0.03, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = shadow;
  return addOutline(m, t);
}
