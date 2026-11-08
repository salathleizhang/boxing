// Public surface used by the copied ChatSpace adapter. The original declarations
// referenced paths inside ChatSpace's build tree; runtime JS is copied unchanged.
import type { Object3D } from 'three';
export const defaultBoneMap: Record<string,string>;
export declare class EditorHandsTracker {
 constructor(side:'Left'|'Right');
 root:Object3D;
 acceptLandmarks(landmarks:{x:number;y:number;z:number;visibility:number}[]):void;
 bind(rig:Object3D,map:Record<string,string>):{update(delta:number):void};
}
