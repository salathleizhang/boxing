/**
 * 手势模式的**资产来源表**（wasm 与手部模型从哪来）。纯常量 + 纯函数，不碰 three / React / 摄像头。
 *
 * ### 为什么默认走同源
 * jsDelivr 上的 wasm 是 gzip 传输（9.5 MB → 2.9 MB），但 Google bucket 上那个模型
 * **既不压缩、又只缓存 1 小时**（实测 `cache-control: public, max-age=3600`，7.82 MB 每次
 * 过期都要重下）。所以"模型下载很久"这件事的主因在模型，而且它取决于第三方是否可达——
 * 国内网络/企业网下 jsDelivr 与 `storage.googleapis.com` 都可能连不上。
 *
 * 现在：**wasm 与模型都随产物同源发出**，`immutable` 长缓存（见 `vercel.json`），
 * 第二次打开就是 0 字节；第三方只在同源加载失败时兜底。
 *
 * ### 两边怎么对齐（这是唯一一处写路径的地方）
 * - 运行时：`useHandTracking.ts` / `handDebug.ts` 读这里的常量；
 * - 构建脚本：`app/scripts/sync-hand-assets.ts` 也读这里，把 wasm 从 `node_modules` 复制进
 *   `app/public/mediapipe/<版本>/wasm/`，并校验下面的 sha256 钉子。
 *
 * 所以**改版本号只有一处**（`HAND_ASSET_VERSION`），脚本会在依赖与它不一致时直接报错。
 */

/**
 * 资产版本：必须与 `app/package.json` 的 `@mediapipe/tasks-vision` **同版本**
 * （wasm 与 js 的接口在 0.10.x 里改过，错配是静默的运行时错误，类型上不会暴露）。
 * `app/scripts/sync-hand-assets.ts` 会对比安装到的包版本，不一致就拒绝构建。
 */
export const HAND_ASSET_VERSION = "0.10.17";

/** 同源资产目录。/mediapipe/<版本>/... 里的版本号是"可以放心 immutable"的前提 */
export const HAND_ASSET_BASE = `/mediapipe/${HAND_ASSET_VERSION}`;
/** wasm 目录（构建脚本往这里复制，见 app/public/mediapipe/README.md） */
export const HAND_WASM_LOCAL = `${HAND_ASSET_BASE}/wasm`;
/** 手部关键点模型（float16，7.82 MB；**提交进仓库**，见 app/public/mediapipe/README.md） */
export const HAND_MODEL_LOCAL = `${HAND_ASSET_BASE}/hand_landmarker.task`;

/**
 * 只随包发 **SIMD 那一套**。npm 包里另有一套 `vision_wasm_nosimd_internal.*`（9.38 MB），
 * 但本应用是 WebGPU-only（无可用 adapter/device 时走重试面板），能跑到这里的浏览器必然支持
 * wasm SIMD，所以那 9.4 MB 是死重量。**代价**：真正不支持 SIMD 的环境下同源加载会 404，
 * 由下面的 CDN 兜底接住（CDN 目录里两套都在）。
 */
export const HAND_WASM_FILES = ["vision_wasm_internal.js", "vision_wasm_internal.wasm"] as const;

/**
 * 内容钉子（sha256）。不是"可选的自检"：`node_modules` 里的 wasm 与提交进仓库的模型
 * 一旦被人换过（升级依赖只改了一半、模型下到不完整、CDN 被投毒），症状都是运行时
 * 无意义的 `RuntimeError` 或"检测不出手"，所以这里让它**在构建时就炸**。
 *
 * 用 `Record<文件名, 哈希>` 而不是两个自由变量：以后要随包发第二个 wasm 变体时，
 * 类型会强制补上它的钉子，不会出现"复制了但没校验"的漏网文件。
 */
export const HAND_WASM_SHA256: Readonly<Record<(typeof HAND_WASM_FILES)[number], string>> = {
  "vision_wasm_internal.js": "33a4125f825b343d2d9773951a73692f40bee368c9b591af8ff652fd501af90b",
  "vision_wasm_internal.wasm": "c88cf472dd5cab0a3954b071e5f442102ded3701dcccc987a7a02ee8f54aae85",
};
/** `hand_landmarker.task`（float16 / version 1）的 sha256 */
export const HAND_MODEL_SHA256 = "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1";

/** 第三方兜底地址（同源加载失败时才用；`?handWasm=` / `?handModel=` 也可以显式指到它们） */
export const HAND_WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${HAND_ASSET_VERSION}/wasm`;
export const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/** 一份"wasm 目录 + 模型 URL"的取值 */
export interface HandTrackingSource {
  wasmBase: string;
  modelUrl: string;
}

/** 同源来源（默认） */
export const HAND_LOCAL_SOURCE: HandTrackingSource = {
  wasmBase: HAND_WASM_LOCAL,
  modelUrl: HAND_MODEL_LOCAL,
};

/** 第三方来源（兜底） */
export const HAND_CDN_SOURCE: HandTrackingSource = {
  wasmBase: HAND_WASM_CDN,
  modelUrl: HAND_MODEL_URL,
};

/**
 * 这一份来源是不是"同源默认值"（用来判断要不要接兜底）。
 *
 * 比**两个字段的值**而不是对象身份：调用方那一份来自 `resolveHandTrackingSource()`，
 * 每次都是新对象，比身份永远是 false，兜底就永远不生效。
 * 两个字段都要比：只覆盖 wasm 或只覆盖模型同样属于"用户自己指定了来源"。
 */
export function isLocalHandSource(source: HandTrackingSource): boolean {
  return source.wasmBase === HAND_WASM_LOCAL && source.modelUrl === HAND_MODEL_LOCAL;
}
