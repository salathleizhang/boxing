import { useSyncExternalStore } from "react";
import type { HandLandmark, PhysicalHand, ReportedHandedness, Vec3 } from "./handLandmarks";

/**
 * 手势模式的**跨线程数据交换**：检测循环（普通 rAF，跑在 React 之外）→ 场景里的手（R3F 每帧读）。
 *
 * ### 为什么不是 React state
 * 检测是 30–60 Hz 的连续流，每一帧都 setState 就等于每帧把整棵场景树（分屏时 ×4）重协调一遍，
 * 而且这条流与"场景要不要重画"是两件事。所以照 `liveTransforms.ts` 的形状办：
 * **热路径是命令式读写的普通对象，UI 只订阅它真正需要重渲染的那几个字段**。
 *
 * 三类字段刻意分开：
 * - `snapshot`（status / error / fps / handCount）——**低频**、要被预览小窗渲染，变更时通知订阅方；
 * - `frame`（21 点 × 2 只手）——**每帧都变**，只由 R3F 的 `useFrame` 直接读，不触发任何重渲染；
 * - `pointer`（相机 → 捏合点的世界射线）——渲染线程每帧写，第一人称的抓取在**物理步**里跨帧读
 *   （物理步与渲染帧不是一个节奏，所以它必须是"最近一次算出来的值"，而不是"这一帧的 props"）。
 */

export type HandTrackingStatus = "idle" | "requesting" | "loading" | "running" | "error";

export interface TrackedHand {
  /** 平滑后的归一化关键点（长度 21） */
  landmarks: HandLandmark[];
  /** 原始米制三维关键点，与 landmarks 同一只手；缺失时不驱动骨骼。 */
  worldLandmarks?: HandLandmark[];
  /** 用户现实里那只手（分类 + 时序关联） */
  physical: PhysicalHand;
  /** 这一帧是否算"捏住"（迟滞后的结果，不是瞬时比值） */
  pinching: boolean;
  /** 拇指尖↔食指尖 ÷ 掌长：1 附近是张开，0.2 附近是捏住 */
  pinchRatio: number;
  /** MediaPipe 的手性置信度 */
  confidence: number;
  /** 原始分类与最终身份的来源，用于区分检测和模型选择问题。 */
  reportedHandedness?: ReportedHandedness | null;
  identitySource?: "classification" | "association" | "held";
}

/** 检测循环产出的"这一帧" */
export interface HandTrackingFrame {
  hands: readonly TrackedHand[];
  /** 递增的帧号：R3F 用它判断"有没有新的一帧要画" */
  frameId: number;
  /** 这一帧是什么时候检测出来的（`performance.now()`） */
  timestampMs: number;
  /** 检测耗时（毫秒），预览小窗里显示 */
  detectMs: number;
}

/** 世界空间的一支"手射线"：起点是相机，方向指向手的捏合点 */
export interface HandPointer {
  /** 相机世界位置 */
  origin: Vec3;
  /** 单位方向（相机 → 捏合点） */
  direction: Vec3;
  /** 捏合点（或指尖）的世界位置 */
  tip: Vec3;
  /** 这一帧有没有手 */
  active: boolean;
  /** 捏合（抓取）状态 */
  pinching: boolean;
  /**
   * 这支射线属于哪只手。
   *
   * 存在的唯一理由是**抓取要有主人**：两只手都会捏，而场景里同时只能抓着一样东西。
   * 松手的判据因而不是"没人捏了"，而是"**刚才那只手**不捏了"（`pointer.slot !== holding`）。
   * 没有它时"左手抓着、右手松开"会把东西莫名其妙地掉在地上。
   */
  slot: PhysicalHand | null;
}

/** 低频快照：会被预览小窗渲染，所以只在真的变了的时候才换对象 */
export interface HandTrackingSnapshot {
  status: HandTrackingStatus;
  /** 出错时给用户看的一句话（相机被拒 / 没有相机 / MediaPipe 加载失败），null 表示没出错 */
  error: string | null;
  /** 平滑后的检测帧率（整数，0 表示还没跑起来） */
  fps: number;
  /** 当前检测到的手数 */
  handCount: number;
  /** 检测耗时（毫秒，整数） */
  detectMs: number;
  /** 当前生效的 wasm / 模型来源（诊断用：CDN 还是本地覆盖） */
  source: string | null;
  /**
   * 检测循环的**健康度**。这三个数存在的理由只有一条：用户报"看不到手"时，
   * 必须一眼分清三种完全不同的故障——
   * ① `published` 不涨：检测循环压根没在跑/一直抛错（`detectError` 有最后一条）；
   * ② `published` 在涨但手没出现：问题在渲染（见 HandRig 的"开着就每帧要帧"）；
   * ③ 两者都正常但没手：摄像头里真的没有手（预览小窗里的 2D 关键点能直接看出来）。
   */
  published: number;
  detectErrors: number;
  detectError: string | null;
}

const EMPTY_FRAME: HandTrackingFrame = { hands: [], frameId: 0, timestampMs: 0, detectMs: 0 };

const INITIAL_SNAPSHOT: HandTrackingSnapshot = {
  status: "idle",
  error: null,
  fps: 0,
  handCount: 0,
  detectMs: 0,
  source: null,
  published: 0,
  detectErrors: 0,
  detectError: null,
};

export interface HandTrackingStoreOptions {
  /** fps 的刷新间隔（毫秒）。默认 400：预览小窗上的数字一秒跳两次半，够了 */
  fpsIntervalMs?: number;
}

export interface HandTrackingStore {
  getSnapshot(): HandTrackingSnapshot;
  subscribe(listener: () => void): () => void;
  /** 检测循环每帧调这个（不通知订阅方，只换 frame 引用）。**检测锁上时它不生效** */
  publishFrame(frame: HandTrackingFrame): void;
  /**
   * 诊断注入专用：**绕过检测锁**写一帧。
   *
   * 锁的意义是"挡住检测循环"，而注入自己必须写得进去——否则锁一上，注入的那一帧也进不来
   * （第一版就是这样：锁把两边一起挡了）。产品路径不会调用它。
   */
  publishInjectedFrame(frame: HandTrackingFrame): void;
  /** R3F 每帧读这个（引用稳定，读到的一定是最新一帧） */
  getFrame(): HandTrackingFrame;
  /** 状态/错误变更（低频，会通知订阅方） */
  setStatus(status: HandTrackingStatus, error?: string | null, source?: string | null): void;
  /** 检测循环抛了一次错（单帧失败不该杀循环，但必须能被看见） */
  noteDetectError(error: unknown): void;
  /** 渲染线程写入世界射线（低频变更；物理步会跨帧读它） */
  setPointer(pointer: HandPointer | null): void;
  getPointer(): HandPointer | null;
  /**
   * 注册"把渲染循环叫醒"的函数（R3F 的 `invalidate`）。
   *
   * 画布是 `frameloop="demand"`：检测循环跑在自己的 rAF 里、与渲染帧无关，没有这一句
   * 新的一帧检测结果**不会**被画出来（只有鼠标动一下才会）。寄存器在 Canvas 内部
   * （`HandRig`），而检测循环在外面，所以要走 store 中转。
   */
  setFrameRequester(requester: (() => void) | null): void;
  /** 有新的一帧结果时叫一次（没有注册者时静默） */
  requestFrame(): void;
  /**
   * 锁住检测帧（诊断注入用）。
   *
   * **必须有这一条**：注入是往同一个 store 里塞一帧合成结果，而检测循环正在 30–60 Hz 地
   * 覆盖它——锁上之前实测注入的手只活了 **15 ms**（下一帧检测结果就把它冲掉了；
   * 假摄像头/没有手的环境里那一帧正好是"没有手"）。锁只影响检测帧，状态与错误照常更新。
   */
  setDetectionLock(locked: boolean): void;
  /** 卸载/重开时清空（保留状态由调用方用 setStatus 决定） */
  reset(): void;
}

/**
 * fps 数字的更新节流间隔（毫秒）。
 * 不节流的话预览小窗每检测一帧就重渲染一次（30–60 Hz），而它显示的信息一秒只变两次。
 */
export const HAND_FPS_INTERVAL_MS = 400;

export function createHandTrackingStore(options: HandTrackingStoreOptions = {}): HandTrackingStore {
  const fpsIntervalMs = options.fpsIntervalMs ?? HAND_FPS_INTERVAL_MS;
  let snapshot: HandTrackingSnapshot = INITIAL_SNAPSHOT;
  let frame: HandTrackingFrame = EMPTY_FRAME;
  let pointer: HandPointer | null = null;
  let frameRequester: (() => void) | null = null;
  let detectionLocked = false;
  let frameCount = 0;
  let detectErrors = 0;
  let detectError: string | null = null;
  const listeners = new Set<() => void>();

  // 最近一次换 fps 数字的时刻：数字与"手数"分开节流，后者要立刻反映（用户摘手就得马上看到）
  let lastFpsAt = 0;
  let fpsSmoothed = 0;

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  const replace = (next: Partial<HandTrackingSnapshot>) => {
    const merged = { ...snapshot, ...next };
    if (
      merged.status === snapshot.status
      && merged.error === snapshot.error
      && merged.fps === snapshot.fps
      && merged.handCount === snapshot.handCount
      && merged.detectMs === snapshot.detectMs
      && merged.source === snapshot.source
      && merged.published === snapshot.published
      && merged.detectErrors === snapshot.detectErrors
      && merged.detectError === snapshot.detectError
    ) {
      return;
    }
    snapshot = merged;
    notify();
  };

  const applyFrame = (next: HandTrackingFrame) => {
    frame = next;
    frameCount += 1;
    const now = next.timestampMs;
    if (next.detectMs > 0) {
      // 指数平滑：瞬时帧率（1/detectMs）在单帧波动下会跳得很厉害
      const instant = 1000 / Math.max(1, next.detectMs);
      fpsSmoothed = fpsSmoothed > 0 ? fpsSmoothed * 0.7 + instant * 0.3 : instant;
    }
    const due = now - lastFpsAt >= fpsIntervalMs;
    if (due) lastFpsAt = now;
    /*
      只有 `handCount` 与（节流后的）`fps`/`detectMs` 进快照：检测耗时几乎每帧都在变，
      把它无条件写进去就等于每检测一帧都通知订阅方一次（预览小窗 30–60 Hz 重渲染），
      而它显示的东西一秒只该变两次。
    */
    /*
      `published` 与 fps/detectMs 一起**节流**：它每帧都在涨，无条件写进快照就等于每检测一帧
      都通知订阅方一次（预览小窗 30–60 Hz 重渲染），而它显示的东西一秒变两次半就够读。
      `handCount` 不节流：用户摘手/抬手要立刻反映。
    */
    replace({
      handCount: next.hands.length,
      ...(due ? { fps: Math.round(fpsSmoothed), detectMs: Math.round(next.detectMs), published: frameCount } : {}),
    });
    // 画布是 demand 模式：新的一帧结果必须显式换一帧，否则只有鼠标动了画面才刷新
    frameRequester?.();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publishFrame: (next) => {
      if (detectionLocked) return;
      applyFrame(next);
    },
    publishInjectedFrame: (next) => {
      applyFrame(next);
    },
    getFrame: () => frame,
    setStatus: (status, error = null, source) => {
      // 换状态时把"上一轮的读数"清干净：否则停在 running 时的手数/帧率会留在面板上
      replace({
        status,
        error,
        source: source === undefined ? snapshot.source : source,
        ...(status === "running" ? {} : { fps: 0, handCount: 0, detectMs: 0 }),
      });
      if (status !== "running") {
        frame = EMPTY_FRAME;
        fpsSmoothed = 0;
        lastFpsAt = 0;
      }
    },
    noteDetectError: (error) => {
      detectErrors += 1;
      detectError = error instanceof Error ? error.message : String(error ?? "unknown");
      replace({ detectErrors, detectError: detectError.slice(0, 120) });
    },
    setPointer: (next) => {
      pointer = next;
    },
    getPointer: () => pointer,
    setFrameRequester: (requester) => {
      frameRequester = requester;
    },
    requestFrame: () => {
      frameRequester?.();
    },
    setDetectionLock: (locked) => {
      detectionLocked = locked;
    },
    reset: () => {
      snapshot = INITIAL_SNAPSHOT;
      frame = EMPTY_FRAME;
      pointer = null;
      fpsSmoothed = 0;
      lastFpsAt = 0;
      detectionLocked = false;
      frameCount = 0;
      detectErrors = 0;
      detectError = null;
      notify();
    },
  };
}

/** 订阅低频快照（预览小窗 / chrome 徽章用）。热路径（每帧的手）走 `getFrame()`，不经过这里 */
export function useHandTrackingSnapshot(store: HandTrackingStore): HandTrackingSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/**
 * 状态 → 给用户看的一句话。纯函数，单测钉住（这些文案会出现在预览小窗里）。
 */
export function handStatusLabel(snapshot: HandTrackingSnapshot): string {
  switch (snapshot.status) {
    case "idle":
      return "Hand tracking off";
    case "requesting":
      return "Waiting for camera…";
    case "loading":
      return "Loading hand model…";
    case "running":
      return snapshot.handCount > 0 ? "Tracking" : "Show your hands";
    case "error":
      return snapshot.error ?? "Hand tracking failed";
  }
}

/** 状态 → 徽章/面板的颜色档（running 且看得见手 = 亮，其余 = 暗） */
export function handStatusTone(snapshot: HandTrackingSnapshot): "live" | "busy" | "error" {
  if (snapshot.status === "error") return "error";
  if (snapshot.status === "running" && snapshot.handCount > 0) return "live";
  return "busy";
}
