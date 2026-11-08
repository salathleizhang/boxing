import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
// Replace url with a local, self-contained GLB. Gameplay hit zones stay independent of the visual rig.
export const OPPONENT = {
  name: "严俊杰",
  label: "训练陪练 / 01",
  modelUrl: "" as string,
  height: 1.9,
  rotationY: 0,
};
export function material(color: string, metalness = 0, roughness = 0.7) {
  return new T.MeshStandardMaterial({ color, metalness, roughness });
}
export function shape(
  parent: T.Object3D,
  geometry: T.BufferGeometry,
  mat: T.Material,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
) {
  const m = new T.Mesh(geometry, mat);
  m.position.set(...position);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function createOpponent() {
  const root = new T.Group(),
    visual = new T.Group();
  root.add(visual);
  const skin = material("#acb6a6", 0.28, 0.4),
    dark = material("#191f22", 0.2, 0.6),
    trim = material("#cde7a5", 0.2, 0.45),
    glove = material("#cf4b2e", 0.05, 0.38);
  const sphere = new T.SphereGeometry(1, 24, 20),
    capsule = new T.CapsuleGeometry(1, 1, 6, 16);
  shape(visual, sphere, skin, [0, 1.27, 0], [0.32, 0.38, 0.18]);
  shape(visual, sphere, dark, [0, 0.95, 0], [0.24, 0.2, 0.17]);
  shape(visual, new T.CylinderGeometry(0.25, 0.26, 0.3, 24), dark, [0, 0.8, 0]);
  shape(
    visual,
    new T.CylinderGeometry(0.253, 0.253, 0.055, 24),
    trim,
    [0, 0.945, 0],
  );
  const head = new T.Group();
  head.position.set(0, 1.8, 0);
  visual.add(head);
  shape(head, sphere, skin, [0, 0, 0], [0.19, 0.245, 0.18]);
  shape(head, new T.BoxGeometry(0.31, 0.075, 0.035), dark, [0, 0.015, 0.165]);
  shape(head, new T.BoxGeometry(0.19, 0.012, 0.04), trim, [0, 0.02, 0.185]);
  shape(head, sphere, dark, [0, 0.2, 0], [0.16, 0.06, 0.15]);
  for (const side of [-1, 1]) {
    shape(visual, capsule, dark, [side * 0.16, 0.46, 0], [0.105, 0.24, 0.11]);
    shape(
      visual,
      capsule,
      skin,
      [side * 0.16, 0.235, 0.025],
      [0.072, 0.13, 0.075],
    );
    shape(visual, sphere, dark, [side * 0.16, 0.075, 0.1], [0.12, 0.065, 0.22]);
    shape(visual, sphere, dark, [side * 0.32, 1.5, 0], [0.13, 0.13, 0.13]);
  }
  const arms = [-1, 1].map((side) => {
    const arm = new T.Group();
    arm.position.set(side * 0.33, 1.45, 0);
    visual.add(arm);
    shape(
      arm,
      capsule,
      skin,
      [side * 0.055, -0.16, 0.06],
      [0.085, 0.16, 0.085],
    );
    shape(arm, sphere, dark, [side * 0.09, -0.32, 0.1], [0.09, 0.09, 0.09]);
    const forearm = shape(
      arm,
      capsule,
      skin,
      [side * 0.06, -0.18, 0.24],
      [0.08, 0.15, 0.08],
    );
    forearm.rotation.x = 1.1;
    shape(arm, sphere, glove, [side * 0.035, 0.015, 0.39], [0.135, 0.16, 0.17]);
    shape(arm, new T.CylinderGeometry(0.095, 0.09, 0.09, 16), dark, [
      side * 0.035,
      -0.115,
      0.35,
    ]);
    return arm;
  });
  let disposed = false,
    mixer: T.AnimationMixer | undefined,
    imported: T.Object3D | undefined;
  const ready = OPPONENT.modelUrl
    ? new GLTFLoader()
        .loadAsync(OPPONENT.modelUrl)
        .then((gltf) => {
          if (disposed) {
            disposeObject(gltf.scene);
            return;
          }
          const box = new T.Box3().setFromObject(gltf.scene),
            size = box.getSize(new T.Vector3()),
            center = box.getCenter(new T.Vector3());
          const scale = OPPONENT.height / Math.max(0.01, size.y);
          imported = gltf.scene;
          imported.scale.setScalar(scale);
          imported.position.set(
            -center.x * scale,
            -box.min.y * scale,
            -center.z * scale,
          );
          imported.rotation.y = OPPONENT.rotationY;
          visual.visible = false;
          root.add(imported);
          if (gltf.animations[0]) {
            mixer = new T.AnimationMixer(imported);
            mixer.clipAction(gltf.animations[0]).play();
          }
        })
        .catch((error) => {
          console.error("Opponent GLB failed", error);
          throw error;
        })
    : Promise.resolve();
  return {
    root,
    head,
    arms,
    ready,
    update(time: number, delta: number, recoil: number, attack: number) {
      root.position.x = Math.sin(time * 1.3) * 0.16 + recoil * 0.13;
      root.position.y = Math.sin(time * 3) * 0.018;
      root.rotation.z = -recoil * 0.12;
      root.rotation.y = Math.sin(time * 0.8) * 0.07;
      arms.forEach((a, i) => {
        a.rotation.x =
          -0.12 +
          Math.sin(time * 2 + i) * 0.08 -
          (i === Math.floor(time / 3) % 2 ? attack * 1.2 : 0);
        a.rotation.z = i === 0 ? -0.12 : 0.12;
      });
      mixer?.update(delta);
    },
    dispose() {
      disposed = true;
      mixer?.stopAllAction();
    },
  };
}
export function disposeObject(root: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(),
    materials = new Set<T.Material>(),
    textures = new Set<T.Texture>();
  root.traverse((o) => {
    const m = o as T.Mesh;
    if (m.isMesh) {
      geometries.add(m.geometry);
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        materials.add(mat);
        for (const v of Object.values(mat))
          if (v instanceof T.Texture) textures.add(v);
      }
      if ((m as T.SkinnedMesh).isSkinnedMesh)
        (m as T.SkinnedMesh).skeleton.dispose();
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
