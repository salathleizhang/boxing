// Convert the user-provided Cartoon Boxing Glove FBX into a compact GLB.
// Usage: node scripts/convert-glove.mjs <input.fbx> <output.glb>
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// Browser shims for headless parsing/export. Textures stay external, so only
// geometry, UVs and material factors go into the GLB.
globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.document ??= {
  createElementNS: () => ({
    style: {},
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    remove() {},
  }),
};
globalThis.URL.createObjectURL ??= () => 'blob:shim';
globalThis.URL.revokeObjectURL ??= () => {};
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      const b64 = Buffer.from(buf).toString('base64');
      this.result = `data:${blob.type};base64,${b64}`;
      this.onloadend?.();
    });
  }
};

THREE.TextureLoader.prototype.load = function (url) {
  const tex = new THREE.Texture();
  tex.name = String(url);
  return tex;
};

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('usage: node scripts/convert-glove.mjs <input.fbx> <output.glb>');
  process.exit(1);
}

const buffer = readFileSync(input);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
const root = new FBXLoader().parse(arrayBuffer, '');
root.updateMatrixWorld(true);

const meshes = [];
root.traverse((o) => {
  if (o.isMesh) meshes.push(o);
});
if (meshes.length !== 1) throw new Error(`expected 1 mesh, found ${meshes.length}`);

const source = meshes[0];
const geometry = source.geometry.clone().applyMatrix4(source.matrixWorld);
geometry.computeBoundingBox();
const box = geometry.boundingBox;
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());

// Center the mesh on its bounding box and normalize the longest side to 1.
// The game scales the result to a real glove size.
geometry.translate(-center.x, -center.y, -center.z);
const scale = 1 / Math.max(size.x, size.y, size.z);
geometry.scale(scale, scale, scale);
geometry.computeBoundingBox();
geometry.computeBoundingSphere();

const material = new THREE.MeshStandardMaterial({
  name: 'BoxingGlove',
  color: 0xffffff,
  roughness: 0.52,
  metalness: 0.0,
});
const mesh = new THREE.Mesh(geometry, material);
mesh.name = 'BoxingGlove';

const glb = await new GLTFExporter().parseAsync(mesh, {
  binary: true,
  onlyVisible: true,
});
writeFileSync(output, Buffer.from(glb));

const outBox = geometry.boundingBox;
console.log(
  `wrote ${output} (${(glb.byteLength / 1024).toFixed(0)} KB), normalized bbox`,
  outBox.min.toArray().map((v) => +v.toFixed(3)),
  outBox.max.toArray().map((v) => +v.toFixed(3)),
  `source tris=${(geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3}`,
);
