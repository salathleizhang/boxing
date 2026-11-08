import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { disposeObject } from "./opponent";

/** The downloaded cage is converted to metres with its deck at y=0. */
export function createDownloadedArena(onError: (message: string) => void) {
  const root = new T.Group();
  root.name = "Downloaded boxing venue";
  // A neutral deck also makes the fight usable if the asset cannot be fetched.
  const deck = new T.Mesh(
    new T.CylinderGeometry(3.95, 3.95, 0.12, 8),
    new T.MeshStandardMaterial({ color: "#262b30", roughness: 0.85 }),
  );
  deck.position.y = -0.065;
  deck.rotation.y = Math.PI / 8;
  deck.receiveShadow = true;
  root.add(deck);
  let disposed = false;
  const ready = new GLTFLoader()
    .loadAsync("/models/downloaded-arena/arena.glb")
    .then(({ scene }) => {
      if (disposed) {
        disposeObject(scene);
        return;
      }
      scene.traverse((object) => {
        if (!(object instanceof T.Mesh)) return;
        // Thousands of fine cage wires should not enter the shadow pass.
        object.castShadow = object.name.startsWith("Stage_Column");
        object.receiveShadow = object.name.startsWith("Floor");
        for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
          if (mat instanceof T.MeshStandardMaterial && mat.map) {
            mat.map.anisotropy = 4;
            // Source posters were ambient maps; retain their readability.
            mat.emissive.set("#ffffff");
            mat.emissiveMap = mat.map;
            mat.emissiveIntensity = 0.18;
          }
        }
      });
      root.add(scene);
      root.remove(deck);
      disposeObject(deck);
    })
    .catch((error: unknown) => {
      if (disposed) return;
      console.error("Downloaded arena failed to load", error);
      onError("下载的场地模型加载失败，请刷新重试。当前可在简易地台继续训练。");
    });
  return {
    root,
    ready,
    dispose() {
      disposed = true;
      // The owning arena disposes all attached meshes with the rest of its scene.
    },
  };
}
