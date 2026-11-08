// Rebuild lightweight runtime GLBs from the untouched HI3D files.
import {NodeIO} from '@gltf-transform/core';
import {simplify, weld, prune} from '@gltf-transform/functions';
import {BufferGeometry, BufferAttribute} from 'three';
import {MeshoptSimplifier} from 'meshoptimizer';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const source = process.argv[2] ?? fileURLToPath(new URL('../hi3d-animation-v1/', import.meta.url));
const sourceManifest = JSON.parse(await readFile(path.join(source, 'hi3d-manifest.json'), 'utf8'));
const output = process.argv[3] ?? fileURLToPath(new URL('../output/models/opponents-v1-100k/', import.meta.url));
const targetTriangles = 100000;
await mkdir(output, {recursive: true});
const io = new NodeIO(), manifest = [];
const hash = data => createHash('sha256').update(data).digest('hex');
const stats = doc => {
  const prims = doc.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives());
  return {triangles: prims.reduce((n,p)=>n+p.getIndices().getCount()/3,0), vertices: prims.reduce((n,p)=>n+p.getAttribute('POSITION').getCount(),0)};
};
for (const character of sourceManifest.characters) {
  const name = character.id, filename = character.model;
  const sourceBytes = await readFile(path.join(source,filename));
  const doc = await io.readBinary(sourceBytes), before = stats(doc);
  const ratio = Math.min(1, targetTriangles / before.triangles);
  // Preserve the original smooth shading before topology is reduced. Recomputing
  // normals on an irregular simplified mesh adds visible dents to faces/gloves.
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    if (prim.getAttribute('NORMAL')) continue;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(prim.getAttribute('POSITION').getArray(), 3));
    geometry.setIndex(new BufferAttribute(prim.getIndices().getArray(), 1));
    geometry.computeVertexNormals();
    prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(geometry.getAttribute('normal').array).setBuffer(prim.getAttribute('POSITION').getBuffer()));
    geometry.dispose();
  }
  // Compaction retains UVs and the original skin weights of surviving vertices.
  // Keep skeleton leaves, inverse bind matrices, original textures and all animation tracks.
  await doc.transform(weld(), simplify({simplifier: MeshoptSimplifier, ratio, error: .001}), prune({keepLeaves: true}));
  const bytes = await io.writeBinary(doc), after = stats(doc);
  await writeFile(path.join(output,`${name}.glb`), bytes);
  const item = {file:`${name}.glb`, source:`hi3d-animation-v1/${filename}`, sourceBytes:sourceBytes.length, sourceSha256:hash(sourceBytes), bytes:bytes.length, sha256:hash(bytes), before, after, joints:doc.getRoot().listSkins()[0].listJoints().length, animations:doc.getRoot().listAnimations().map(a=>a.getName()), simplify:{targetTriangles,ratio,error:.001}};
  manifest.push(item); console.log(`${name}: ${before.triangles} → ${after.triangles} triangles, ${(bytes.length/1048576).toFixed(2)} MiB`);
}
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
