import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const hashes = {
  "public/models/downloaded-arena/arena.glb":
    "03e7fab51ba2dcd1684f30369ab232b8e6331bc42cf17fdd9b67ced38037d642",
  "public/mediapipe/0.10.17/pose_landmarker_lite.task":
    "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
  "public/mediapipe/0.10.17/hand_landmarker.task":
    "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
  "public/mediapipe/0.10.17/wasm/vision_wasm_internal.js":
    "33a4125f825b343d2d9773951a73692f40bee368c9b591af8ff652fd501af90b",
  "public/mediapipe/0.10.17/wasm/vision_wasm_internal.wasm":
    "c88cf472dd5cab0a3954b071e5f442102ded3701dcccc987a7a02ee8f54aae85",
  "public/models/boxing-glove/glove.glb":
    "5f4bdec5afb73d0d1e7d38d9d04481429ff1b682f06cbd95c354495282f2a1d4",
  "public/models/boxing-glove/basecolor.png":
    "9fbd1e09dff9127a9f0c37f89642aafe64120f8e25ea4d799ecb228e29128dbf",
  "public/models/boxing-glove/roughness.png":
    "db12073ce83a55448bc63770aa6573834ace9f3278b795ef4b9675774de5dbe5",
};
for (const [path, expected] of Object.entries(hashes)) {
  const actual = createHash("sha256")
    .update(await readFile(new URL("../" + path, import.meta.url)))
    .digest("hex");
  if (actual !== expected) throw new Error(`Asset hash mismatch: ${path}`);
  console.log(`OK ${path}`);
}
const pkg = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
if (pkg.dependencies["@mediapipe/tasks-vision"] !== "0.10.17")
  throw new Error("MediaPipe JS and WASM versions must match");

const opponents = JSON.parse(await readFile(new URL('../public/models/opponents/manifest.json', import.meta.url), 'utf8'));
for (const item of opponents) {
  if (!item.source.startsWith('hi3d-animation-v1/')) throw new Error('Unexpected opponent source');
  const bytes = await readFile(new URL('../public/models/opponents/' + item.file, import.meta.url));
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new Error('Opponent hash mismatch: ' + item.file);
  console.log('OK public/models/opponents/' + item.file);
}
