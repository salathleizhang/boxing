import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createOpponent, disposeObject, material, shape } from './opponent';
import { createLibraryHands, EDITOR_HAND_ROTATION, type LibraryHandInstance } from '../tracking/libraryHandModel';
import type { HandTrackingStore } from '../tracking/handTrackingStore';
import { createPunchGate, detectPunch, isFist, sweptHit } from './combat';
export interface FightState {phase:'ready'|'playing'|'paused'|'finished';remaining:number;duration:number;hits:number;punches:number;combo:number;bestCombo:number;score:number;health:number;opponentHealth:number;lastHit:string;lastHitAt:number;result:string}
export interface ArenaOptions {store:HandTrackingStore;read:()=>FightState;onChange:()=>void;onSound:(power:number,blocked:boolean)=>void;cameraEnabled:()=>boolean;sensitivity:()=>number;onError:(message:string)=>void}
export function createArena(host:HTMLDivElement,options:ArenaOptions) {
 const renderer=new T.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;host.appendChild(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color('#151d20');scene.fog=new T.FogExp2('#151d20',.045);
 const camera=new T.PerspectiveCamera(58,1,.05,70);camera.position.set(0,1.68,2.25);camera.lookAt(0,1.4,-2);scene.add(camera);
 scene.add(new T.HemisphereLight('#c2d9db','#3a2d21',2));
 const light=new T.SpotLight('#e8f2e9',100,18,.8,.5,1.5);light.position.set(-2,6,2);light.target.position.set(0,0,-1);light.castShadow=true;light.shadow.mapSize.set(2048,2048);scene.add(light,light.target);
 const rim=new T.PointLight('#b9dc92',30,12);rim.position.set(2,3,-4);scene.add(rim);
 const sideLight=new T.PointLight('#f26943',15,8);sideLight.position.set(-3,2,1);scene.add(sideLight);
 const steel=material('#202b2d',.6), floor=material('#484e4b'), rope=material('#b1b4a4',.1);
 shape(scene,new T.BoxGeometry(8,.3,8),steel,[0,-.2,0]);
 shape(scene,new T.PlaneGeometry(7.8,7.8),floor,[0,-.035,0]).rotation.x=-Math.PI/2;
 // Canvas markings are part of the arena, not a screen-space overlay.
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;const ctx=canvas.getContext('2d')!;
 ctx.fillStyle='#464d49';ctx.fillRect(0,0,1024,1024);ctx.strokeStyle='#777f72';ctx.lineWidth=3;ctx.strokeRect(75,75,874,874);ctx.beginPath();ctx.arc(512,512,270,0,Math.PI*2);ctx.stroke();ctx.save();ctx.translate(512,512);ctx.rotate(Math.PI);ctx.fillStyle='#89917d';ctx.font='900 106px Arial';ctx.textAlign='center';ctx.fillText('RINGSIDE',0,25);ctx.font='20px monospace';ctx.fillText('THE WORK STARTS HERE',0,65);ctx.restore();
 const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
 shape(scene,new T.PlaneGeometry(7.75,7.75),new T.MeshStandardMaterial({map:tex,roughness:.95}),[0,-.028,0]).rotation.x=-Math.PI/2;
 for(const x of [-3.65,3.65])for(const z of [-3.65,3.65]){
  shape(scene,new T.CylinderGeometry(.08,.1,1.9,16),steel,[x,.9,z]);
  for(const y of [.55,.95,1.35,1.75])shape(scene,new T.BoxGeometry(.23,.25,.23),material(x<0?'#a94732':'#afbda1'),[x,y,z]);
 }
 function beam(a:T.Vector3,b:T.Vector3,r:number,mat:T.Material){const mesh=shape(scene,new T.CylinderGeometry(r,r,a.distanceTo(b),12),mat,[0,0,0]);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());}
 for(const y of [.55,.95,1.35,1.75]) {
  for(const x of [-3.65,3.65])beam(new T.Vector3(x,y,-3.65),new T.Vector3(x,y,3.65),.025,rope);
  for(const z of [-3.65,3.65])beam(new T.Vector3(-3.65,y,z),new T.Vector3(3.65,y,z),.025,y===1.75?material('#c3563c'):rope);
 }
 // Industrial training hall: repeated windows, wall panels, rafters and strip lights.
 shape(scene,new T.BoxGeometry(26,.15,26),material('#141a1c'),[0,-.55,0]);
 shape(scene,new T.BoxGeometry(26,8,.2),material('#263033'),[0,3.5,-9]);
 for(let x=-12;x<=12;x+=3){
  shape(scene,new T.BoxGeometry(.18,8,.25),steel,[x,3.4,-8.8]);
  shape(scene,new T.BoxGeometry(2.5,1.8,.06),material('#4e6667',.2),[x+1.5,4.4,-8.83]);
  for(const y of [3.8,4.4,5])shape(scene,new T.BoxGeometry(2.5,.035,.09),steel,[x+1.5,y,-8.77]);
 }
 for(const z of [-7,-2,3,8]) {
  shape(scene,new T.BoxGeometry(24,.18,.22),steel,[0,6,z]);
  for(const x of [-3,3]){shape(scene,new T.BoxGeometry(2.3,.04,.24),new T.MeshBasicMaterial({color:'#dbe4d1'}),[x,5.85,z]);}
 }
 // Back wall typography.
 const wallCanvas=document.createElement('canvas');wallCanvas.width=1024;wallCanvas.height=256;const wc=wallCanvas.getContext('2d')!;wc.fillStyle='#c8cbb9';wc.font='900 144px Arial';wc.textAlign='center';wc.fillText('EARN YOUR ROUND.',512,170);const wt=new T.CanvasTexture(wallCanvas);wt.colorSpace=T.SRGBColorSpace;
 shape(scene,new T.PlaneGeometry(8,2),new T.MeshBasicMaterial({map:wt,transparent:true}),[0,2,-8.84]);
 for(const x of [-6,6]){shape(scene,new T.CylinderGeometry(.35,.35,1.6,24),material('#302d29'),[x,1.5,-5]);beam(new T.Vector3(x,2.3,-5),new T.Vector3(x,5.9,-5),.016,steel);}
 const opponent=createOpponent();opponent.root.position.z=-.4;scene.add(opponent.root);void opponent.ready.catch(()=>options.onError('角色模型加载失败，已保留默认陪练。'));
 const playerGloves=[-1,1].map(side=>{const g=new T.Group();const red=material('#d75b3e',.08,.36);shape(g,new T.SphereGeometry(1,24,20),red,[0,0,0],[.14,.16,.20]);shape(g,new T.SphereGeometry(1,16,12),red,[-side*.1,-.055,-.01],[.065,.09,.10]);shape(g,new T.CylinderGeometry(.09,.085,.16,16),material('#151b1e'),[0,-.13,.04]);shape(g,new T.BoxGeometry(.12,.035,.10),material('#d7d6bb'),[0,-.13,.13]);camera.add(g);return g;});
 const punches=[{at:-1000,power:0,hit:false,aimX:0,aimY:0},{at:-1000,power:0,hit:false,aimX:0,aimY:0}];
 const trackedTargets=[new T.Vector3(),new T.Vector3()], previous=[new T.Vector3(),new T.Vector3()];
 const gates=[createPunchGate(),createPunchGate()];let hands:LibraryHandInstance[]|undefined,sourceModel:T.Object3D|undefined,disposed=false;
 void new GLTFLoader().loadAsync('/models/three-mediapipe-rig/hands.glb').then(gltf=>{
   if(disposed){disposeObject(gltf.scene);return;}sourceModel=gltf.scene;hands=createLibraryHands(gltf.scene);
   hands.forEach(h=>{camera.add(h.holder);h.holder.quaternion.copy(EDITOR_HAND_ROTATION);h.holder.scale.setScalar(h.scale*1.35);});
 }).catch(()=>options.onError('手部模型加载失败，请刷新重试。'));
 const sparks=new T.Group();scene.add(sparks);const sparkMat=new T.MeshBasicMaterial({color:'#e3f9b5'});const particles=Array.from({length:14},()=>{const p=shape(sparks,new T.SphereGeometry(.012,5,4),sparkMat,[0,0,0]);p.visible=false;return {mesh:p,velocity:new T.Vector3(),life:0};});
 let recoil=0,shake=0,lastTime=performance.now(),raf=0,uiAt=0,lastFrame=-1,attackClock=0,attackResolved=false,block=false,aim={x:0,y:0};
 function publish(){options.onChange();}
 function hit(side:number,power:number,from:T.Vector3,to:T.Vector3) {
  const s=options.read();if(s.phase!=='playing'||punches[side].hit)return;
  const head=new T.Vector3(opponent.root.position.x,1.78,-.4),body=new T.Vector3(opponent.root.position.x,1.22,-.4);
  const isHead=sweptHit(from,to,head,.36),isBody=sweptHit(from,to,body,.39);
  if(!isHead&&!isBody)return;
  punches[side].hit=true;
  const guarded=isHead && Math.sin(activeTime*1.1)>.83;
  const damage=guarded?1:Math.round(5+power*8);s.opponentHealth=Math.max(0,s.opponentHealth-damage);
  if(!guarded){s.hits++;s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);s.score+=Math.round((isHead?100:65)*(1+power)*(1+Math.min(s.combo,10)*.1));}else{s.combo=0;}
  s.lastHit=guarded?'格挡':isHead?'精准命中':'躯干命中';s.lastHitAt=performance.now();recoil=guarded?.25:power+.35;shake=.025;options.onSound(power,guarded);
  for(const p of particles){p.mesh.position.copy(isHead?head:body);p.velocity.set((Math.random()-.5)*2,Math.random()*1.7,(Math.random()-.5)*2);p.life=.32;p.mesh.visible=true;}
  if(s.opponentHealth<=0){s.phase='finished';s.result='KNOCKOUT';}publish();
 }
 function punch(side:number,power=.7) {
  const s=options.read(),now=performance.now();if(s.phase!=='playing'||now-punches[side].at<350)return;
  Object.assign(punches[side],{at:now,power,hit:false,aimX:aim.x,aimY:aim.y});s.punches++;publish();
 }
 const down=(e:KeyboardEvent)=>{if((e.target as HTMLElement)?.matches('input,select,textarea,[contenteditable=true]'))return;if(e.code==='Space'){e.preventDefault();block=true;}if(e.repeat)return;if(e.code==='KeyJ')punch(0);if(e.code==='KeyK')punch(1);};
 const up=(e:KeyboardEvent)=>{if(e.code==='Space')block=false;};const blur=()=>{block=false;};
 window.addEventListener('keydown',down);window.addEventListener('keyup',up);window.addEventListener('blur',blur);
 const move=(e:PointerEvent)=>{const r=host.getBoundingClientRect();aim={x:(e.clientX-r.left)/r.width*2-1,y:1-(e.clientY-r.top)/r.height*2};};host.addEventListener('pointermove',move);
 const resize=()=>{const {width,height}=host.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(host);resize();
 let activeTime=0;
 function animate(now:number){if(disposed)return;raf=requestAnimationFrame(animate);const dt=Math.min(.05,(now-lastTime)/1000);lastTime=now;const s=options.read(),playing=s.phase==='playing';
  const time=now/1000;if(playing){activeTime+=dt;s.remaining=Math.max(0,s.remaining-dt);if(s.remaining<=0){s.phase='finished';s.result=s.opponentHealth<s.health?'ROUND WON':'ROUND COMPLETE';publish();}attackClock+=dt;}else if(s.phase==='ready'){activeTime=0;attackClock=0;}
  const attackPhase=attackClock%4.2;const attack=playing&&attackClock>2&&attackPhase>3.1?Math.sin((attackPhase-3.1)/1.1*Math.PI):0;
  if(attackPhase<3.1)attackResolved=false;
  let guarding=block;
  const frame=options.store.getFrame(),fresh=options.cameraEnabled()&&options.store.getSnapshot().status==='running'&&now-frame.timestampMs<220;
  if(fresh){const both=frame.hands.filter(h=>h.identitySource!=='held');guarding ||=both.length===2&&both.every(h=>isFist(h.landmarks)&&h.landmarks[0].y<.63);}
  if(playing&&attack>.92&&!attackResolved){attackResolved=true;s.health=Math.max(0,s.health-(guarding?0:9));s.lastHit=guarding?'成功防守':'注意防守';s.lastHitAt=now;if(!guarding){s.combo=0;shake=.10;}options.onSound(.35,true);if(s.health===0){s.phase='finished';s.result='再来一回合';}publish();}
  recoil=T.MathUtils.damp(recoil,0,7,dt);shake=T.MathUtils.damp(shake,0,8,dt);opponent.update(activeTime,playing?dt:0,recoil,attack);
  camera.position.x=Math.sin(time*34)*shake;camera.position.y=1.68+Math.cos(time*27)*shake*.5;camera.rotation.z=Math.sin(time*23)*shake*.15;
  for(let i=0;i<2;i++){
   const side=i===0?-1:1,hand=fresh?frame.hands.find(h=>h.physical===(i===0?'left':'right')):undefined;
   const age=(now-punches[i].at)/1000,extension=playing&&age<.32?Math.sin(age/.32*Math.PI):0;
   const target=trackedTargets[i];target.set(side*.34,guarding?-.02:-.29,-.62);
   const instance=hands?.[i];
   if(hand&&hand.identitySource!=='held'){
    const points=[0,5,9,13,17].map(j=>hand.landmarks[j]);const x=1-points.reduce((a,p)=>a+p.x,0)/5,y=points.reduce((a,p)=>a+p.y,0)/5;
    const palmSize=Math.hypot(hand.landmarks[5].x-hand.landmarks[17].x,hand.landmarks[5].y-hand.landmarks[17].y);
    target.set(T.MathUtils.clamp((x-.5)*2,-.85,.85),T.MathUtils.clamp((.5-y)*1.5,-.55,.45),-.65);
    if(frame.frameId!==lastFrame&&playing){const power=detectPunch(gates[i],palmSize,isFist(hand.landmarks),frame.timestampMs,options.sensitivity());if(power){aim={x:(x-.5)*1.7,y:(.5-y)*1.4};punch(i,Math.max(.4,power));}}
    if(instance&&hand.worldLandmarks){instance.update(hand.worldLandmarks,dt);instance.holder.visible=true;playerGloves[i].visible=false;}else{if(instance)instance.holder.visible=false;playerGloves[i].visible=true;}
   }else {if(instance)instance.holder.visible=false;playerGloves[i].visible=true;}
   if(extension>0){const p=punches[i];target.x=T.MathUtils.lerp(target.x,p.aimX*.75,extension);target.y=T.MathUtils.lerp(target.y,-.04+p.aimY*.65,extension);target.z-=extension*2.15;}
   const glove=playerGloves[i];glove.position.lerp(target,1-Math.exp(-dt*24));glove.rotation.set(-.1,side*.1,side*-.12);
   if(instance)instance.holder.position.copy(glove.position);
   const world=camera.localToWorld(glove.position.clone());if(playing&&extension>.3)hit(i,punches[i].power,previous[i],world);previous[i].copy(world);
   if(playing&&age>.32&&age<.4&&!punches[i].hit){punches[i].hit=true;s.combo=0;s.lastHit='调整准星再出拳';s.lastHitAt=now;publish();}
  }
  lastFrame=frame.frameId;
  for(const p of particles)if(p.life>0){p.life-=dt;p.mesh.position.addScaledVector(p.velocity,dt);p.velocity.y-=3*dt;p.mesh.visible=p.life>0;}
  if(now-uiAt>100){uiAt=now;publish();}
  renderer.render(scene,camera);
 }
 raf=requestAnimationFrame(animate);
 return {punch,block:(value:boolean)=>{block=value;},reset(){punches.forEach(p=>{p.at=-1000;p.hit=false;});gates.forEach(g=>Object.assign(g,createPunchGate()));attackClock=0;activeTime=0;attackResolved=false;recoil=0;},dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);host.removeEventListener('pointermove',move);hands?.forEach(h=>h.dispose());if(sourceModel)disposeObject(sourceModel);opponent.dispose();disposeObject(scene);renderer.dispose();renderer.domElement.remove();}};
}
export type Arena=ReturnType<typeof createArena>;
