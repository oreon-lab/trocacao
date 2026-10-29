import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// 3 tons de luz = visual de desenho
const grad = new THREE.DataTexture(new Uint8Array([95, 180, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter;
grad.needsUpdate = true;

export const toonMat = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: grad, ...extra });

// Contorno preto por "casca invertida": cópia da malha inflada pela normal, renderizando só o verso.
const outlineMats = new Map();
function outlineMat(t) {
  if (!outlineMats.has(t)) {
    outlineMats.set(t, new THREE.ShaderMaterial({
      uniforms: { t: { value: t } },
      vertexShader: 'uniform float t; void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * t, 1.0); }',
      fragmentShader: 'void main(){ gl_FragColor = vec4(0.06, 0.05, 0.09, 1.0); }',
      side: THREE.BackSide,
    }));
  }
  return outlineMats.get(t);
}

// normais suavizadas pra casca não abrir nas emendas da geometria
const smooth = new WeakMap();
function smoothGeo(g) {
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
