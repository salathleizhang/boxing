# 暴打闫俊杰

基于 Three.js + MediaPipe 的第一人称体感拳击原型。画面中统一显示拳击手套，面前是训练陪练。默认角色用 Three.js 几何体搭建，可换为自己的 GLB。

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

## 场地模型

游戏场地已替换为下载的 `O3745-拳击场地 (1)` 八角笼模型，包含原始围网、地台、立柱、灯架和赛事广告。运行时加载 `public/models/downloaded-arena/arena.glb`，贴图已内嵌，无需访问下载目录。玩家与陪练仍使用现有出拳、防守和命中逻辑。

转换脚本为 `scripts/convert-arena.py`（Python 3.10+；安装 `trimesh==4.12.2 fast-simplification==0.2.0 pillow numpy scipy` 后，传入原始下载目录）。脚本修复原始 Windows 贴图路径，将场地换算为米并以擂台面作为地面，对围网减面。转换统计保存在 `public/models/downloaded-arena/conversion.json`。原始下载文件未修改。

## 选择与替换角色

首页点击「进入擂台」后，选择奶龙、豆包、牛来、峰哥亡命天涯、蔡徐坤或闫俊杰。选中卡片会立即切换右侧 3D 预览，点击「迎战」开始新回合。暂停和结算页均可更换对手；更换会清空当前回合进度。首页海报与赛事标题保留原来的主场风格，对战名牌显示实际选中的角色。

六个角色使用 `hi3d-animation-v1/models/` 提供的 GLB，运行文件位于 `public/models/opponents/`。源 GLB 和 Blender 工程未修改；Downloads 中的旧版不再使用。运行版约 10 万三角面，保留原始贴图、骨骼权重、17 根骨骼和四个动画，并保留高模平滑法线。

`src/game/opponentMotion.ts` 将 `LeftPunch` / `RightPunch` 交替接到陪练反击，与伤害判定共用回合时钟；`Recoil` 在实际命中时播放。防守使用原模型 `Idle` 的护拳姿势（模型没有独立 Guard 片段），护头状态与头部格挡判定共用同一时钟。暂停冻结动作，重开回合清空受击状态。模型加载期间禁用迎战按钮，快速换人会取消旧请求并释放旧模型资源；失败时保留程序化陪练。

角色路径、显示高度和朝向在 `src/game/opponents.ts` 配置。命中区域仍独立于网格，大幅改变体型需同步调整 `src/game/arena.ts`。运行素材来源、面数及 SHA-256 记录在 `public/models/opponents/manifest.json`，构建时校验运行文件。

重新生成时按下面的顺序执行，先生成候选版，验证通过再替换：

```sh
npm run optimize:opponents
BOXING_OPPONENT_MODELS="$PWD/output/models/opponents-v1-100k" npm test
npm run install:opponents
npm run build
```

优化只读取项目中的 `hi3d-animation-v1/`，不会修改源目录；候选文件写入 `output/models/opponents-v1-100k/`。安装前逐一校验源文件和候选文件哈希、10 万三角面预算，并检查绑定矩阵、全部动画轨道和原始贴图与源模型完全一致，骨骼静态变换误差小于 1e-5。通过后整套替换 `public/models/opponents/`，上一套运行文件备份到 `.tmp/opponents-before-100k-*`。

## 拳套模型

第一人称拳套使用用户提供的 `Cartoon Boxing Glove.fbx`。运行时加载转换后的 GLB 与两张贴图：

- `public/models/boxing-glove/glove.glb`：6,152 个三角面，包围盒归一化到 1 单位。
- `public/models/boxing-glove/basecolor.png` / `roughness.png`：FBX 自带贴图缩放到 512px。

模型挂在相机上，按 `GLOVE_SCALE = 0.3` 缩放到约 30cm。源模型拳头朝 +Y、拇指朝 +X；挂载时先绕拳头轴翻转 180°，再前倾约 65°，左拳额外沿 X 轴镜像。前臂已移除，袖口空腔用一个随拳套移动的红色圆头封住，避免第一人称视角下露出空心。模型加载失败时保留原来的程序化拳套。

源文件在 `assets/boxing-glove/`，重新生成 GLB：

```sh
node scripts/convert-glove.mjs "assets/boxing-glove/Cartoon Boxing Glove.fbx" public/models/boxing-glove/glove.glb
```

重新生成后同步更新 `scripts/check-assets.mjs` 中的哈希。原压缩包未附作者或许可证信息，公开发布前需确认这份模型的授权。

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

MediaPipe JS / WASM 固定为 0.10.17，Three.js 固定为 0.186.1。所有输入模式统一显示同一套拳套模型（见上文「拳套模型」），原版手模与骨骼驱动保留为来源资料，不再运行时加载。手部追踪继承 ChatSpace 的同源优先、CDN 失败兜底及 GPU→CPU 委托回退。新增 `useBodyTracking.ts` 在同一路摄像头视频上运行 Pose Landmarker Lite，约 5–10 Hz 更新头肩参照；画面中不再绘制前臂。Pose 只加载本地模型，失败不影响手部出拳和手动防守。`npm run check:assets` 校验手部 / Pose 模型与 WASM 的 SHA-256。

上游 three-mediapipe-rig 许可与模型来源说明保留在 `vendor/three-mediapipe-rig/LICENSE` 和 `public/models/three-mediapipe-rig/`。此工程复用的是用户指定的本地代码；未给 ChatSpace 自有代码另行添加许可证。

## 人声音效

拳击音效是程序化合成的，人声切片单独管理：

- `src/game/voice-clips.json`：每个切片的源文件、起止秒数、台词和触发事件。
- `.voice-src/`：源视频抽出的 WAV（已被 `.gitignore` 忽略，约 157MB）。
- `npm run build:voices`：按配置剪切、统一响度到 -16 LUFS、限幅和淡入淡出，输出 `public/audio/voice/*.mp3`。
- 触发事件：`intro` 开局、`hit` 命中、`hurt` 掉血、`block` 被格挡、`guard` 成功防守、`ko` 击倒、`win` 回合结束。同一事件有冷却时间，不会因连续出拳叠音。
- 试听：开发或预览服务下打开 `/audio/voice/preview.html`。

## 背景音乐

回合 BGM 为 `public/audio/music/kof97-bgm.m4a`（拳皇 KOF '97 主题，复制自 `kof-ai/public/assets/music/menu.m4a`），在回合开始时循环播放，随「音效与音乐」开关启停；暂停、切出页面或返回主场时停止或暂停。

要调整某一刀的位置，改 JSON 里的 `start` / `end` 后重新运行 `npm run build:voices`。这些人声来自各自视频的二创片段，仅适合本地原型；公开发布前请替换为有授权的素材。

## 验证

```sh
npm test              # 快拳碰撞、收拳门控、防守切换、头肩参照过期等 8 项测试
npm run check:assets  # 模型/WASM 版本与哈希
npm run build         # TypeScript + Vite 生产构建
npm run preview       # 构建产物预览
```

浏览器验收记录见 `QA.md`。

## 赛事 UI

界面使用 Canvas 2D 直接绘制 ImageGen 生成的位图素材：`public/ui/yanjunjie-main-event-wide.png` 为约 2.8:1 的宽屏主场海报，窄屏采用 `public/ui/yanjunjie-main-event-portrait-v2.png`，`public/ui/ringside-metal-atlas.png` 为四层纹理图集（红色按钮、钢铁名牌、冠军金边面板、计分底板）。完整生成提示词和生成方式记录在 `public/ui/generation.json`。

`src/ui/CanvasHUD.tsx` 负责实时文字、血条、倒计时、设置和结算；透明 HTML 热区仅提供点击、触屏、键盘焦点和辅助技术语义，可见界面全部由 Canvas 渲染。游戏继续使用原有 Three.js / MediaPipe 逻辑。手机端按窄屏重新排布操作区。
