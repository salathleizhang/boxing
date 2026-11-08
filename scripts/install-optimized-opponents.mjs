// Validate staged models before replacing the complete runtime set.
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {readFile, writeFile, mkdir, mkdtemp, cp, rename, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const staged = process.argv[2] ?? path.join(root, 'output/models/opponents-v1-100k');
const manifest = JSON.parse(await readFile(path.join(staged, 'manifest.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const io = new NodeIO();
function rigSignature(doc) {
  const root = doc.getRoot();
  return JSON.stringify({
    skins: root.listSkins().map(skin => ({
      joints: skin.listJoints().map(joint => ({name:joint.getName(), translation:joint.getTranslation(), rotation:joint.getRotation(), scale:joint.getScale()})),
      bind: Array.from(skin.getInverseBindMatrices().getArray()),
    })),
    animations: root.listAnimations().map(clip => ({name:clip.getName(), channels:clip.listChannels().map(channel => ({
      node:channel.getTargetNode().getName(), path:channel.getTargetPath(), interpolation:channel.getSampler().getInterpolation(),
      input:Array.from(channel.getSampler().getInput().getArray()), output:Array.from(channel.getSampler().getOutput().getArray()),
    }))})),
    textures: root.listTextures().map(texture => hash(texture.getImage())),
  });
}
const expected = ['cxk.glb','doubao.glb','fengge.glb','nailong.glb','niulai.glb','yanjunjie.glb'];
assert.deepEqual(manifest.map(item => item.file).sort(), expected);
for (const item of manifest) {
  assert.ok(item.source.startsWith('hi3d-animation-v1/models/'));
  const source = await readFile(path.join(root,item.source)), bytes = await readFile(path.join(staged,item.file));
  assert.equal(hash(source),item.sourceSha256,`${item.file}: source hash`);
  assert.equal(hash(bytes),item.sha256,`${item.file}: optimized hash`);
  assert.ok(item.after.triangles <= 100000,`${item.file}: triangle budget`);
  const original = await io.readBinary(source), optimized = await io.readBinary(bytes);
  assert.equal(rigSignature(optimized),rigSignature(original),`${item.file}: exact skeleton, clips and textures`);
  console.log(`Verified ${item.file}: ${item.after.triangles} triangles; skeleton, animation tracks and textures unchanged`);
}
const parent = path.join(root,'public/models'), runtime = path.join(parent,'opponents');
const next = await mkdtemp(path.join(parent,'.opponents-next-'));
await mkdir(path.join(root,'.tmp'),{recursive:true});
const backup = path.join(root,'.tmp',`opponents-before-100k-${Date.now()}`);
try {
  for (const item of manifest) await cp(path.join(staged,item.file),path.join(next,item.file));
  await writeFile(path.join(next,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  await rename(runtime,backup);
  try { await rename(next,runtime); }
  catch (error) { await rename(backup,runtime); throw error; }
} catch (error) { await rm(next,{recursive:true,force:true}); throw error; }
console.log('Installed all six optimized models. Previous runtime set:', backup);
