# MediaPipe 运行资源

JS / WASM 使用 `@mediapipe/tasks-vision` 0.10.17；手部模型和 SIMD WASM 继承自 ChatSpace，详见项目 README。

新增 `0.10.17/pose_landmarker_lite.task` 为 Google 官方 Pose Landmarker Lite float16 version 1 的原始文件：

- 下载来源：<https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task>
- 官方说明：<https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker>
- SHA-256：`59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`

Pose 与 Hand 共用本地 WASM 版本和已授权的视频流。所有推理在浏览器中进行，视频不上传。资源哈希由 `scripts/check-assets.mjs` 在构建时校验。
