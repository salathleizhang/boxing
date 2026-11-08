import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createOpponentMotion, opponentMotion} from './opponentMotion.ts';
const idle = {elapsed:-1,side:0,extension:0,guarding:false};

test('opponent guard and impact share one clock; alternate left and right punches',()=>{
  assert.equal(opponentMotion(1.4,true).guarding,true);
  for (const [time,side] of [[3.65,0],[7.85,1]]) {
    const state=opponentMotion(time,true);
    assert.equal(state.side,side); assert.equal(state.guarding,false);
    assert.ok(Math.abs(state.extension-1)<1e-8);
  }
  assert.equal(opponentMotion(3.65,false).elapsed,-1);
});
for (const id of ['nailong','doubao','niulai','fengge','cxk','yanjunjie']) {
  test(`${id}: lightweight skin retains both punches, recoil, guard and reset`,async()=>{
    const base = process.env.BOXING_OPPONENT_MODELS;
    const bytes=await readFile(base ? `${base}/${id}.glb` : new URL(`../../public/models/opponents/${id}.glb`,import.meta.url));
    const loader=new GLTFLoader();
    // No GPU or image decoder is needed for actual skeleton / animation evaluation.
    loader.register(parser=>{parser.loadTexture=async()=>new T.Texture();return {name:'headless-textures'};});
    const gltf=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const model=gltf.scene, rig=createOpponentMotion(model,gltf.animations);
    const bone=n=>model.getObjectByName(n);
    const position=n=>{model.updateMatrixWorld(true);return bone(n).getWorldPosition(new T.Vector3());};
    const mesh=model.getObjectByProperty('isSkinnedMesh',true);
    assert.equal(mesh.skeleton.bones.length,17);
    assert.ok(mesh.geometry.index.count/3<=160000,'triangle budget');
    assert.deepEqual(gltf.animations.map(a=>a.name).sort(),['Idle','LeftPunch','Recoil','RightPunch']);
    const weights=mesh.geometry.getAttribute('skinWeight');
    for(let i=0;i<weights.count;i++) {
      const sum=weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i);
      assert.ok(Math.abs(sum-1)<1e-4,'normalized skin weights');
    }
    rig.update(0,0,idle);
    const left=position('HandL'),right=position('HandR');
    rig.update(3.65,.05,opponentMotion(3.65,true));
    assert.ok(position('HandL').z>left.z+.10,'left fist extends toward player');
    assert.ok(position('HandR').distanceTo(right)<.03,'right hand stays home');
    rig.update(7.85,.05,opponentMotion(7.85,true));
    assert.ok(position('HandR').z>right.z+.10,'right fist extends toward player');
    rig.update(10,.05,idle); const normalHead=bone('Head').quaternion.clone();
    rig.hit(10);rig.update(10.2,.05,idle);
    assert.ok(bone('Head').quaternion.angleTo(normalHead)>.001,'hit plays Recoil');
    rig.reset();rig.update(0,0,idle);
    assert.ok(position('HandL').distanceTo(left)<1e-5,'reset clears previous attack/recoil');
    const lengths=['L','R'].map(side=>[position(`UpperArm${side}`).distanceTo(position(`Forearm${side}`)),position(`Forearm${side}`).distanceTo(position(`Hand${side}`))]);
    rig.update(1.4,1,opponentMotion(1.4,true));
    assert.ok(position('HandL').distanceTo(left)<1e-5,'guard holds authored defensive pose');
    for(const [i,side] of ['L','R'].entries()) {
      assert.ok(Math.abs(position(`UpperArm${side}`).distanceTo(position(`Forearm${side}`))-lengths[i][0])<1e-5);
      assert.ok(Math.abs(position(`Forearm${side}`).distanceTo(position(`Hand${side}`))-lengths[i][1])<1e-5);
    }
    const frozen=position('HandL');rig.update(1.4,0,opponentMotion(1.4,true));
    assert.ok(position('HandL').distanceTo(frozen)<1e-5,'paused time keeps pose');
    rig.dispose();mesh.geometry.dispose();
  });
}
