import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const hashes = {
  "public/mediapipe/0.10.17/pose_landmarker_lite.task":
    "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a",
  "public/mediapipe/0.10.17/hand_landmarker.task":
    "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1",
  "public/mediapipe/0.10.17/wasm/vision_wasm_internal.js":
    "33a4125f825b343d2d9773951a73692f40bee368c9b591af8ff652fd501af90b",
  "public/mediapipe/0.10.17/wasm/vision_wasm_internal.wasm":
    "c88cf472dd5cab0a3954b071e5f442102ded3701dcccc987a7a02ee8f54aae85",
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
