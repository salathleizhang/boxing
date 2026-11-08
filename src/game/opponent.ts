import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createOpponentMotion, type OpponentMotion } from "./opponentMotion";
import { getOpponent, DEFAULT_OPPONENT, type OpponentProfile } from "./opponents";
export const OPPONENT = getOpponent(DEFAULT_OPPONENT);
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
export function createOpponent(profile: OpponentProfile = OPPONENT) {
  const root = new T.Group(), visual = new T.Group();
  root.add(visual);
  const dragon = profile.look === 'dragon', bull = profile.look === 'bull';
  const skin = material(profile.skin, 0, .68), dark = material(profile.outfit, .05, .8),
    trim = material(profile.accent, .15, .48), glove = material(profile.gloves, .05, .35),
    hair = material(profile.hair, 0, .9), white = material('#fff8e7'), ink = material('#211d21');
  const sphere = new T.SphereGeometry(1, 24, 18), capsule = new T.CapsuleGeometry(1, 1, 6, 12);
  const ellipsoid = (parent: T.Object3D, mat: T.Material, pos: [number, number, number], scale: [number, number, number]) => shape(parent, sphere, mat, pos, scale);
  ellipsoid(visual, dragon ? skin : dark, [0, 1.25, 0], dragon ? [.42, .49, .29] : [.32, .36, .2]);
  if (dragon) {
    ellipsoid(visual, trim, [0, 1.2, .245], [.28, .32, .07]);
    const tail = ellipsoid(visual, skin, [.23, .82, -.3], [.16, .14, .42]); tail.rotation.y = -.55;
    for (let i = 0; i < 3; i++) shape(visual, new T.ConeGeometry(.07, .16, 4), dark, [0, 1.05 + i * .2, -.28]);
  } else {
    ellipsoid(visual, dark, [0, .93, 0], [.26, .19, .19]);
    shape(visual, new T.CylinderGeometry(.26, .27, .28, 24), dark, [0, .81, 0]);
    shape(visual, new T.CylinderGeometry(.267, .267, .055, 24), trim, [0, .95, 0]);
    ellipsoid(visual, skin, [0, 1.57, 0], [.105, .15, .1]);
    // Contrasting piping and the idol's signature light suspenders.
    for (const side of [-1, 1]) {
      shape(visual, new T.BoxGeometry(profile.look === 'idol' ? .045 : .018, .43, .022), trim, [side * .18, 1.28, .183]);
    }
  }
  const head = new T.Group(); head.position.set(0, 1.78, 0); visual.add(head);
  ellipsoid(head, skin, [0, 0, 0], dragon ? [.32, .28, .245] : bull ? [.25, .255, .21] : [.205, .245, .19]);
  for (const side of [-1, 1]) {
    if (!dragon) ellipsoid(head, skin, [side * .205, -.005, 0], [.047, .075, .045]);
    const eyeX = side * (dragon ? .115 : .077), eyeZ = dragon ? .218 : .173;
    ellipsoid(head, white, [eyeX, .035, eyeZ], [dragon ? .078 : .05, dragon ? .1 : .043, .032]);
    ellipsoid(head, ink, [eyeX, .029, eyeZ + .026], [.021, dragon ? .043 : .025, .015]);
    ellipsoid(head, white, [eyeX - .006, .04, eyeZ + .04], [.007, .009, .004]);
    if (!dragon) {
      const brow = ellipsoid(head, hair, [eyeX, .103, eyeZ], [.065, .016, .018]); brow.rotation.z = -side * .12;
    }
  }
  ellipsoid(head, skin, [0, -.037, dragon ? .25 : .195], dragon ? [.19, .1, .095] : [.037, .055, .043]);
  ellipsoid(head, ink, [0, -.123, dragon ? .23 : .164], [dragon ? .07 : .057, .012, .015]);
  if (dragon) {
    for (const side of [-1, 1]) {
      ellipsoid(head, dark, [side * .08, -.025, .337], [.012, .01, .007]);
      shape(head, new T.ConeGeometry(.065, .17, 16), trim, [side * .19, .25, -.03]);
    }
  } else if (bull) {
    ellipsoid(head, trim, [0, -.07, .19], [.17, .105, .085]);
    for (const side of [-1, 1]) {
      const horn = shape(head, new T.ConeGeometry(.07, .26, 16), white, [side * .24, .22, 0]); horn.rotation.z = -side * .6;
      ellipsoid(head, hair, [side * .23, .105, -.01], [.11, .06, .07]);
      ellipsoid(head, ink, [side * .07, -.06, .269], [.021, .015, .009]);
    }
    ellipsoid(head, hair, [0, .205, 0], [.16, .09, .17]);
  } else {
    ellipsoid(head, hair, [0, .17, -.025], [.212, .12, .193]);
    if (profile.look === 'bob') {
      for (const side of [-1, 1]) ellipsoid(head, hair, [side * .18, .02, -.07], [.075, .23, .16]);
      for (let i = -2; i <= 2; i++) ellipsoid(head, hair, [i * .068, .15, .15], [.05, .075, .05]);
    } else if (profile.look === 'idol') {
      for (const side of [-1, 1]) {
        const lock = ellipsoid(head, hair, [side * .09, .135, .145], [.09, .14, .065]); lock.rotation.z = side * .4;
      }
    } else if (profile.look === 'traveler') {
      for (const side of [-1, 1]) ellipsoid(head, ink, [side * .085, .04, .205], [.081, .055, .025]);
      shape(head, new T.BoxGeometry(.07, .013, .02), ink, [0, .05, .21]);
      ellipsoid(head, hair, [0, -.145, .09], [.135, .06, .095]);
      ellipsoid(head, dark, [0, .25, -.015], [.23, .07, .2]);
      ellipsoid(head, dark, [0, .205, .17], [.24, .025, .18]);
    } else {
      shape(head, new T.BoxGeometry(.37, .04, .075), trim, [0, .14, .12]);
    }
  }
  for (const side of [-1, 1]) {
    ellipsoid(visual, dark, [side * .16, .5, 0], [.115, .27, .13]);
    ellipsoid(visual, skin, [side * .16, .23, .025], [.085, .17, .085]);
    ellipsoid(visual, dragon ? skin : dark, [side * .16, .075, .1], [.13, .075, .22]);
  }
  const arms = [-1, 1].map(side => {
    const arm = new T.Group(); arm.position.set(side * (dragon ? .36 : .31), 1.45, 0); visual.add(arm);
    ellipsoid(arm, dragon ? skin : dark, [side * .025, -.1, .01], [.125, .18, .12]);
    const forearm = shape(arm, capsule, skin, [side * .06, -.18, .24], [.085, .14, .085]); forearm.rotation.x = 1.1;
    ellipsoid(arm, glove, [side * .035, .015, .39], [.14, .16, .17]);
    ellipsoid(arm, glove, [-side * .065, -.04, .4], [.065, .09, .1]);
    shape(arm, new T.CylinderGeometry(.1, .095, .08, 16), trim, [side * .035, -.115, .35]);
    return arm;
  });
  let disposed = false,
    motion: ReturnType<typeof createOpponentMotion> | undefined,
    imported: T.Object3D | undefined;
  const request = new AbortController();
  let pendingHit = -Infinity;
  const ready = profile.modelUrl
    ? fetch(profile.modelUrl, { signal: request.signal })
        .then(response => {
          if (!response.ok) throw new Error(`Opponent HTTP ${response.status}`);
          return response.arrayBuffer();
        })
        .then(buffer => new GLTFLoader().parseAsync(buffer, '/models/opponents/'))
        .then((gltf) => {
          if (disposed) {
            disposeObject(gltf.scene);
            return;
          }
          imported = gltf.scene;
          // Evaluate the authored guard/idle pose before fitting the skinned mesh.
          motion = createOpponentMotion(imported, gltf.animations);
          motion.update(0, 0, { elapsed: -1, side: 0, extension: 0, guarding: false });
          imported.updateMatrixWorld(true);
          const box = new T.Box3().setFromObject(imported), size = box.getSize(new T.Vector3());
          const center = box.getCenter(new T.Vector3());
          const scale = (profile.height ?? 2) / Math.max(.01, size.y);
          const fitted = new T.Group();
          fitted.rotation.y = profile.rotationY ?? 0;
          imported.scale.setScalar(scale);
          imported.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
          imported.traverse(object => {
            const mesh = object as T.Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true; mesh.receiveShadow = true;
              // Skin bounds vary with punches and IK; avoid stale bind-pose culling.
              mesh.frustumCulled = false;
            }
          });
          fitted.add(imported); root.add(fitted); visual.visible = false;
          if (Number.isFinite(pendingHit)) motion.hit(pendingHit);
        })
        .catch((error) => {
          if (disposed || error.name === "AbortError") return;
          console.error("Opponent GLB failed", error);
          throw error;
        })
    : Promise.resolve();
  return {
    root,
    head,
    arms,
    ready,
    hit(time: number) { pendingHit = time; motion?.hit(time); },
    reset() { pendingHit = -Infinity; motion?.reset(); },
    update(time: number, delta: number, recoil: number, attack: number, state: OpponentMotion) {
      root.position.x = Math.sin(time * 1.3) * 0.16 + recoil * 0.13;
      root.position.y = Math.sin(time * 3) * 0.018;
      root.rotation.z = -recoil * 0.12;
      head.rotation.x = -recoil * .16;
      head.rotation.z = recoil * .1;
      root.rotation.y = Math.sin(time * 0.8) * 0.07;
      arms.forEach((a, i) => {
        a.rotation.x =
          -0.12 +
          Math.sin(time * 2 + i) * 0.08 -
          (i === Math.floor(time / 3) % 2 ? attack * 1.2 : 0);
        a.rotation.z = i === 0 ? -0.12 : 0.12;
      });
      motion?.update(time, delta, state);
    },
    dispose() {
      disposed = true;
      request.abort();
      motion?.dispose();
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
  textures.forEach(t => {
    t.dispose();
    // GLTFLoader uses ImageBitmap where supported; release decoded 8K images on switch.
    const image = t.image as { close?: () => void } | undefined;
    image?.close?.();
  });
}
