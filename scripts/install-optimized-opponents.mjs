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
  return {
    skins: root.listSkins().map(skin => ({
      joints: skin.listJoints().map(joint => ({name:joint.getName(), translation:joint.getTranslation(), rotation:joint.getRotation(), scale:joint.getScale()})),
      bind: Array.from(skin.getInverseBindMatrices().getArray()),
    })),
    animations: root.listAnimations().map(clip => ({name:clip.getName(), channels:clip.listChannels().map(channel => ({
      node:channel.getTargetNode().getName(), path:channel.getTargetPath(), interpolation:channel.getSampler().getInterpolation(),
      input:Array.from(channel.getSampler().getInput().getArray()), output:Array.from(channel.getSampler().getOutput().getArray()),
    }))})),
    textures: root.listTextures().map(texture => hash(texture.getImage())),
  };
}
function verifyRig(actual, expected, label) {
  // Export may omit almost-identity static transforms (e.g. scale 1.0000027).
  // Animation curves and texture payloads must remain byte-for-byte equivalent.
  assert.equal(hash(JSON.stringify(actual.animations)), hash(JSON.stringify(expected.animations)), label + ': animation curves');
  assert.deepEqual(actual.textures, expected.textures, label + ': texture payloads');
  assert.equal(actual.skins.length, expected.skins.length, label + ': skin count');
  for (let i = 0; i < actual.skins.length; i++) {
    const a = actual.skins[i], b = expected.skins[i];
    assert.deepEqual(a.bind, b.bind, label + ': inverse bind matrices');
    assert.deepEqual(a.joints.map(j=>j.name), b.joints.map(j=>j.name), label + ': joints');
    for (let j = 0; j < a.joints.length; j++) for (const key of ['translation','rotation','scale']) {
      assert.ok(a.joints[j][key].every((v,k)=>Math.abs(v-b.joints[j][key][k])<1e-5), `${label}: ${a.joints[j].name} ${key}`);
    }
  }
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
  verifyRig(rigSignature(optimized),rigSignature(original),item.file);
  console.log(`Verified ${item.file}: ${item.after.triangles} triangles; rig verified; animation tracks and textures unchanged`);
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
