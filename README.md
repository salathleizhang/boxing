# 暴打严俊杰

基于 Three.js + MediaPipe 的第一人称体感拳击原型。画面中统一显示拳击手套和部分前臂，面前是训练陪练。默认角色用 Three.js 几何体搭建，可换为自己的 GLB。

## 本地运行

```sh
npm install
npm run dev
```

打开终端打印的 localhost 地址（默认端口 5173）。摄像头需要 localhost 或 HTTPS；所有 MediaPipe 运行资源均随仓库提供，默认从本地同源加载。首次启用体感时浏览器会询问摄像头权限。视频只在浏览器内处理，不上传。

## 操作

- 点击「开始训练」。默认一回合 2 分钟，可在训练设置中改为 1 / 2 / 3 分钟。
- 键盘：`J` 左拳、`K` 右拳、按住空格防守。鼠标移动准星，瞄准头部或躯干。底部按钮支持触屏试打。
- 体感：点击「开启体感」，面向摄像头，让头部、双肩和双手完整入镜。握拳向镜头快速前伸，明显收回后再出拳。双拳举至脸旁进入完整防守；单手护脸为部分防守，出拳中的手暂时不能格挡。
- 防守：双手格挡可完全挡住当前陪练攻击，单手格挡仍受 4 点伤害，未格挡受 9 点伤害。HUD 显示左右手防守状态和成功格挡次数。头肩暂时识别不到时，体感防守解除并显示入镜提示，键盘 / 触屏防守仍可用。
- 单目摄像头没有绝对深度；当前用手掌尺寸变化估计前伸，握拳判断会受遮挡影响。可调出拳灵敏度。这是原型算法，仍需真人摄像头试打调校。
- 陪练定期反击；格挡、命中、连击、血量、击倒和倒计时结算均已接入。暂停按钮、操作指南、设置和切换后台会暂停回合。

## 替换角色

修改 `src/game/opponent.ts` 中的 `OPPONENT`：

```ts
export const OPPONENT = {
  name: '你的角色名',
  label: '训练陪练 / 01',
  modelUrl: '/models/opponent.glb',
  height: 1.9,
  rotationY: 0,
};
```

将自包含 GLB 放到 `public/models/opponent.glb`。模型自动归一到指定高度并落地，默认播放第一个动画。模型默认面向 +Z（玩家），可调 `rotationY`。命中区域独立于网格，按约 1.9m 的直立角色设置；大幅改变体型时同步调整 `src/game/arena.ts` 中的头部 / 躯干命中区域。GLB 不会自动获得拳击骨骼动作；自定义攻击与受击动画需在 `createOpponent().update()` 内接入自己的动画片段。

## ChatSpace 复用来源

从本机 `/Users/junwei/Documents/GitHub/chat-space` 复制，源仓库未修改：

| 当前路径 | 源路径（相对 chat-space） |
| --- | --- |
| `src/tracking/handAssets.ts` | `app/src/widgets/Viewport/handAssets.ts` |
| `src/tracking/handDetections.ts` | `app/src/widgets/Viewport/handDetections.ts` |
| `src/tracking/handLandmarks.ts` | `app/src/widgets/Viewport/handLandmarks.ts` |
| `src/tracking/handTrackingStore.ts` | `app/src/widgets/Viewport/handTrackingStore.ts` |
| `src/tracking/useHandTracking.ts` | `app/src/widgets/Viewport/useHandTracking.ts` |
| `src/tracking/libraryHandModel.ts` | `app/src/widgets/Viewport/libraryHandModel.ts`（仅调整 vendor 引用路径） |
| `vendor/three-mediapipe-rig/compiled/editor.js` | 同路径，运行时代码原样复制；声明文件改为本工程实际使用的公共类型 |
| `public/mediapipe/0.10.17/` | `app/public/mediapipe/0.10.17/`（手部模型 + SIMD WASM；新增 Pose 模型见下文） |
| `public/models/three-mediapipe-rig/` | `app/public/models/three-mediapipe-rig/`（原版白色手套 + 许可说明） |

MediaPipe JS / WASM 固定为 0.10.17，Three.js 固定为 0.186.1。所有输入模式统一显示程序化拳套，原版手模与骨骼驱动保留为来源资料，不再运行时加载。手部追踪继承 ChatSpace 的同源优先、CDN 失败兜底及 GPU→CPU 委托回退。新增 `useBodyTracking.ts` 在同一路摄像头视频上运行 Pose Landmarker Lite，约 5–10 Hz 更新头肩参照；前臂使用程序化连接，尚未按肘部驱动。Pose 只加载本地模型，失败不影响手部出拳和手动防守。`npm run check:assets` 校验手部 / Pose 模型与 WASM 的 SHA-256。

上游 three-mediapipe-rig 许可与模型来源说明保留在 `vendor/three-mediapipe-rig/LICENSE` 和 `public/models/three-mediapipe-rig/`。此工程复用的是用户指定的本地代码；未给 ChatSpace 自有代码另行添加许可证。

## 验证

```sh
npm test              # 快拳碰撞、收拳门控、防守切换、头肩参照过期等 8 项测试
npm run check:assets  # 模型/WASM 版本与哈希
npm run build         # TypeScript + Vite 生产构建
npm run preview       # 构建产物预览
```

浏览器验收记录见 `QA.md`。

## 赛事 UI

界面使用 Canvas 2D 直接绘制 ImageGen 生成的位图素材：`public/ui/yanjunjie-main-event.png` 为主场海报，`public/ui/ringside-metal-atlas.png` 为四层纹理图集（红色按钮、钢铁名牌、冠军金边面板、计分底板）。完整生成提示词和生成方式记录在 `public/ui/generation.json`。

`src/ui/CanvasHUD.tsx` 负责实时文字、血条、倒计时、设置和结算；透明 HTML 热区仅提供点击、触屏、键盘焦点和辅助技术语义，可见界面全部由 Canvas 渲染。游戏继续使用原有 Three.js / MediaPipe 逻辑。手机端按窄屏重新排布操作区。
