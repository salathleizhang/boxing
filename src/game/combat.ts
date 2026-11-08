export type V3 = { x: number; y: number; z: number };
export function sweptHit(a: V3, b: V3, center: V3, radius: number): boolean {
  const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z;
  const length=dx*dx+dy*dy+dz*dz;
  const t=length>0 ? Math.max(0,Math.min(1,((center.x-a.x)*dx+(center.y-a.y)*dy+(center.z-a.z)*dz)/length)) : 0;
  return Math.hypot(a.x+t*dx-center.x,a.y+t*dy-center.y,a.z+t*dz-center.z)<=radius;
}
export interface PunchGate { lastAt: number; armed: boolean; previousSize: number; previousAt: number }
export function createPunchGate(): PunchGate { return {lastAt:-Infinity,armed:true,previousSize:0,previousAt:0}; }
// A webcam has no absolute depth. Palm expansion is a relative forward-motion cue.
// Require a closed fist and a fresh forward movement, then wait for retraction.
export function detectPunch(g: PunchGate, size: number, closed: boolean, now: number, sensitivity: number): number {
  if (g.previousAt===0 || now-g.previousAt>250) { g.previousAt=now; g.previousSize=size; return 0; }
  const growth=(size-g.previousSize)/Math.max(0.008,(now-g.previousAt)/1000);
  if (growth < -0.035 || !closed) g.armed=true;
  const power=closed && g.armed && now-g.lastAt>350 && growth>0.32/sensitivity ? Math.min(1,growth/1.7) : 0;
  if(power) {g.lastAt=now;g.armed=false;}
  g.previousSize=size;g.previousAt=now;
  return power;
}
export function isFist(p: readonly V3[]): boolean {
  if(p.length!==21)return false;
  const d=(a:number,b:number)=>Math.hypot(p[a].x-p[b].x,p[a].y-p[b].y,p[a].z-p[b].z);
  const palm=d(0,9); if(palm<0.015)return false;
  return [[8,5],[12,9],[16,13],[20,17]].filter(([tip,mcp])=>d(tip,0)<d(mcp,0)*1.35).length>=3;
}
