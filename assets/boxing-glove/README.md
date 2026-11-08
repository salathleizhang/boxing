# Cartoon Boxing Glove（源文件）

- `Cartoon Boxing Glove.fbx`：2026-11-08 由用户提供（`fbx.zip`）。原压缩包内没有作者、来源或许可证说明，授权状态待确认。
- 运行时资产由 `scripts/convert-glove.mjs` 生成：
  - `public/models/boxing-glove/glove.glb`
- 原贴图 `BoxingGlove_BaseColor.png` / `BoxingGlove_Roughtness.png` 已缩放到 512px，保存为：
  - `public/models/boxing-glove/basecolor.png`
  - `public/models/boxing-glove/roughness.png`

重新生成：

```sh
node scripts/convert-glove.mjs "assets/boxing-glove/Cartoon Boxing Glove.fbx" public/models/boxing-glove/glove.glb
```

生成后更新 `scripts/check-assets.mjs` 里的哈希。
