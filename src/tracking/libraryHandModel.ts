import { Bone, Box3, BufferGeometry, Group, Mesh, Object3D, Quaternion, SkinnedMesh, Vector3 } from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { EditorHandsTracker, defaultBoneMap } from "../../vendor/three-mediapipe-rig/compiled/editor.js";
import { HAND_EDITOR_VIEW, HAND_REAL_LENGTH, displayedHandFor, type HandLandmark, type PhysicalHand } from "./handLandmarks";

/** The editor observes the hands from the opposite side of the webcam. */
export const EDITOR_HAND_ROTATION = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);

export interface LibraryHandInstance {
  slot: PhysicalHand;
  displayedHand: PhysicalHand;
  holder: Group;
  rig: Object3D;
  bones: Bone[];
  refs: { wrist: Bone; thumbIp: Bone; thumbTip: Bone; indexTip: Bone; indexMcp: Bone; middleMcp: Bone; pinkyMcp: Bone };
  pinchTips: { thumb: { bone: Bone; point: Vector3 }; index: { bone: Bone; point: Vector3 } };
  scale: number;
  tracked: boolean;
  update(landmarks: readonly HandLandmark[], delta: number): void;
  dispose(): void;
}

/**
 * The upstream GLB contains both hands in one skinned primitive. Select each
 * side's triangles without changing vertices, weights, bones or bind matrices.
 */
function isolateHand(mesh: SkinnedMesh, suffix: "L" | "R"): BufferGeometry {
  const source = mesh.geometry;
  const indices = source.getAttribute("skinIndex");
  const weights = source.getAttribute("skinWeight");
  if (!indices || !weights) throw new Error("Upstream hand mesh has no skin weights");
  const selected = mesh.skeleton.bones.map((bone) => bone.name.endsWith(suffix));
  const opposite = mesh.skeleton.bones.map((bone) => bone.name.endsWith(suffix === "L" ? "R" : "L"));
  const sourceIndex = source.getIndex();
  const count = sourceIndex?.count ?? source.getAttribute("position").count;
  const triangles: number[] = [];
  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map((corner) => sourceIndex ? sourceIndex.getX(i + corner) : i + corner);
    let own = 0;
    let other = 0;
    for (const vertex of triangle) for (let component = 0; component < indices.itemSize; component += 1) {
      const joint = indices.getComponent(vertex, component);
      const weight = weights.getComponent(vertex, component);
      if (selected[joint]) own += weight;
      if (opposite[joint]) other += weight;
    }
    if (own > other && own > 0) triangles.push(...triangle);
  }
  const geometry = source.clone();
  geometry.setIndex(triangles);
  geometry.clearGroups();
  return geometry;
}

function disposeTracker(tracker: EditorHandsTracker): void {
  tracker.root.traverse((node: Object3D) => {
    const mesh = node as Mesh;
    if (!mesh.geometry) return;
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material?.dispose();
  });
}

/** Use the author's model, bone map, tracker, ghost objects and binding update. */
export function createLibraryHands(model: Object3D): LibraryHandInstance[] {
  return (["left", "right"] as const).map((slot) => {
    const displayedHand = displayedHandFor(slot, HAND_EDITOR_VIEW.mirror, HAND_EDITOR_VIEW.reverseDepth);
    const suffix = displayedHand === "left" ? "L" : "R";
    const holder = new Group();
    holder.visible = false;
    const scene = SkeletonUtils.clone(model);
    holder.add(scene);
    const rig = scene.getObjectByName("hands-rig");
    if (!rig) throw new Error("Upstream model has no hands-rig");
    const geometries: BufferGeometry[] = [];
    const meshes: SkinnedMesh[] = [];
    const armMeshes: Mesh[] = [];
    scene.traverse((node) => {
      node.frustumCulled = false;
      const mesh = node as SkinnedMesh;
      if (mesh.isMesh) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (materials.every((material) => material.name === "arms")) {
          armMeshes.push(mesh);
          return;
        }
      }
      if (!mesh.isSkinnedMesh) return;
      mesh.geometry = isolateHand(mesh, suffix);
      geometries.push(mesh.geometry);
      meshes.push(mesh);
    });
    // Remove the author's black forearm primitives from each displayed clone.
    for (const mesh of armMeshes) mesh.removeFromParent();
    holder.updateMatrixWorld(true);
    const bone = (key: keyof typeof defaultBoneMap): Bone => {
      const node = rig.getObjectByName(defaultBoneMap[key]);
      if (!(node instanceof Bone)) throw new Error(`Upstream model is missing ${defaultBoneMap[key]}`);
      return node;
    };
    const refs = {
      wrist: bone(`hand${suffix}`),
      thumbIp: bone(`thumb3${suffix}`),
      thumbTip: bone(`thumb3${suffix}`),
      indexTip: bone(`index3${suffix}`),
      indexMcp: bone(`index1${suffix}`),
      middleMcp: bone(`middle1${suffix}`),
      pinkyMcp: bone(`pinky1${suffix}`),
    };
    const centroid = new Vector3();
    for (const node of [refs.wrist, refs.indexMcp, refs.middleMcp, bone(`ring1${suffix}`), refs.pinkyMcp]) {
      centroid.add(holder.worldToLocal(node.getWorldPosition(new Vector3())));
    }
    scene.position.sub(centroid.divideScalar(5));
    holder.updateMatrixWorld(true);

    // Size only: measure selected glove vertices. This never computes a palm
    // quaternion, finger direction, anatomical angle or calibration offset.
    const bounds = new Box3();
    const vertex = new Vector3();
    for (const mesh of meshes) {
      mesh.skeleton.update();
      const index = mesh.geometry.getIndex()!;
      for (let i = 0; i < index.count; i += 1) {
        mesh.getVertexPosition(index.getX(i), vertex);
        holder.worldToLocal(vertex.applyMatrix4(mesh.matrixWorld));
        bounds.expandByPoint(vertex);
      }
    }
    const size = bounds.getSize(new Vector3());
    const extent = Math.max(size.x, size.y, size.z);
    if (!(extent > 1e-6)) throw new Error("Upstream hand mesh has empty bounds");
    const captureTip = (tipBone: Bone) => {
      let length = 0;
      for (const mesh of meshes) {
        const joint = mesh.skeleton.bones.indexOf(tipBone);
        if (joint < 0) continue;
        const indices = mesh.geometry.getAttribute("skinIndex");
        const weights = mesh.geometry.getAttribute("skinWeight");
        const index = mesh.geometry.getIndex()!;
        for (let i = 0; i < index.count; i += 1) {
          const v = index.getX(i);
          let influence = 0;
          for (let c = 0; c < indices.itemSize; c += 1) if (indices.getComponent(v, c) === joint) influence += weights.getComponent(v, c);
          if (influence < 0.25) continue;
          mesh.getVertexPosition(v, vertex).applyMatrix4(mesh.matrixWorld);
          length = Math.max(length, tipBone.worldToLocal(vertex).y);
        }
      }
      if (!(length > 0)) throw new Error(`Upstream hand has no fingertip geometry for ${tipBone.name}`);
      return { bone: tipBone, point: new Vector3(0, length, 0) };
    };
    const pinchTips = { thumb: captureTip(refs.thumbTip), index: captureTip(refs.indexTip) };
    const bones: Bone[] = [];
    refs.wrist.traverse((node) => { if (node instanceof Bone) bones.push(node); });
    const tracker = new EditorHandsTracker(displayedHand === "left" ? "Left" : "Right");
    const binding = tracker.bind(rig, defaultBoneMap);
    const instance: LibraryHandInstance = {
      slot,
      displayedHand,
      holder,
      rig,
      bones,
      refs,
      pinchTips,
      scale: HAND_REAL_LENGTH / extent,
      tracked: false,
      update(landmarks, delta) {
        if (landmarks.length !== 21 || landmarks.some((p) => ![p.x, p.y, p.z].every(Number.isFinite))) return;
        // Raw MediaPipe coordinates. Upstream Tracker and HandsTracker perform
        // their own landmark transforms and complete palm/finger retargeting.
        tracker.acceptLandmarks(landmarks.map((p) => ({ ...p, visibility: 1 })));
        binding.update(this.tracked ? Math.min(Math.max(delta, 0), 1 / 8) : 1 / 8);
        this.tracked = true;
      },
      dispose() {
        disposeTracker(tracker);
        for (const geometry of geometries) geometry.dispose();
        for (const mesh of meshes) mesh.skeleton.dispose();
      },
    };
    return instance;
  });
}
