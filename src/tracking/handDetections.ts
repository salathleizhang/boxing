import {
  physicalHandFor,
  isUsableHand,
  pinchRatio,
  smoothLandmarks,
  updatePinch,
  type HandLandmark,
  type PhysicalHand,
  type ReportedHandedness,
} from "./handLandmarks";
import type { TrackedHand } from "./handTrackingStore";

/** 高置信度的无冲突手性标签决定身份；标签含糊时才关联历史位置。 */

/**
 * 一只手消失后仍然按"还在"对待的时长（毫秒）。
 *
 * 150 ms ≈ 4–5 个检测帧：够盖住偶发的单帧漏检，又短到"真的把手放下"时不会拖尾。
 * 松手/掉落因此不会被一次漏检打断。
 */
export const HAND_HOLD_MS = 150;

/** 可靠的分类不能被屏幕位置覆盖。 */
const HANDEDNESS_CONFIDENCE = 0.8;

/** MediaPipe 一帧的原始读数（图像关键点 / 三维关键点 / 手性分类） */
export interface RawHandDetection {
  /** 21 个关键点（归一化坐标） */
  landmarks: readonly { x: number; y: number; z: number }[];
  /** 米制三维关键点，用于姿态；图像关键点只决定屏幕位置。 */
  worldLandmarks?: readonly HandLandmark[];
  /** 手性分类：可能为空（模型没给） */
  handedness: readonly { categoryName: string; score: number }[];
}

export interface HandDetectionState {
  /** 按物理手维护的平滑历史 */
  smoothed: Map<PhysicalHand, HandLandmark[]>;
  /** 上次原始三维观测，仅用于漏检宽限期；骨骼插值由库执行。 */
  worldObserved: Map<PhysicalHand, HandLandmark[]>;
  /** 未平滑的掌心位置，避免滤波延迟污染身份关联。 */
  centers: Map<PhysicalHand, { x: number; y: number }>;
  /** 按物理手维护的捏合迟滞状态 */
  pinching: Map<PhysicalHand, boolean>;
  /** 上一次看到这只手的时刻（毫秒） */
  lastSeen: Map<PhysicalHand, number>;
}

export function createHandDetectionState(): HandDetectionState {
  return { smoothed: new Map(), worldObserved: new Map(), centers: new Map(), pinching: new Map(), lastSeen: new Map() };
}

const SLOT_ORDER: readonly PhysicalHand[] = ["left", "right"];

/** 取最高分的有效手性分类；分数必须属于选中的标签。 */
function reportedHandedness(categories: RawHandDetection["handedness"]): { label: ReportedHandedness; score: number } | null {
  let best: { label: ReportedHandedness; score: number } | null = null;
  for (const category of categories ?? []) {
    const label = category.categoryName === "Left" || category.categoryName === "Right"
      ? (category.categoryName as ReportedHandedness)
      : null;
    if (!label) continue;
    const score = Number.isFinite(category.score) ? category.score : 0;
    if (!best || score > best.score) best = { label, score };
  }
  return best;
}

/**
 * 一帧原始读数 → 每只手的平滑关键点 + 捏合状态。
 *
 * 关联策略：**按物理手分槽**（左手槽 / 右手槽），而不是按 MediaPipe 给出的顺序。顺序在两手
 * 同时出现时并不稳定，按顺序取会让平滑历史串到另一只手上（见文件头第 2 条）。
 * 高置信度且不重复的标签决定槽位；低置信度与重复标签才使用时序关联。
 */
export function interpretDetections(
  detections: readonly RawHandDetection[],
  state: HandDetectionState,
  now: number,
): TrackedHand[] {
  const bySlot = new Map<PhysicalHand, TrackedHand>();

  // 先过期再关联；远早于宽限期的旧位置不能抢走新出现的手。
  for (const slot of SLOT_ORDER) {
    if (now - (state.lastSeen.get(slot) ?? -Infinity) <= HAND_HOLD_MS) continue;
    state.smoothed.delete(slot);
    state.worldObserved.delete(slot);
    state.centers.delete(slot);
    state.pinching.delete(slot);
    state.lastSeen.delete(slot);
  }
  const candidates = detections.filter((detection) => isUsableHand(detection.landmarks)).slice(0, 2).map((detection) => {
    const points = [0, 5, 9, 13, 17].map((index) => detection.landmarks[index]!);
    const category = reportedHandedness(detection.handedness);
    return {
      detection,
      reported: category?.label ?? null,
      score: category?.score ?? 0,
      center: { x: points.reduce((sum, p) => sum + p.x, 0) / 5, y: points.reduce((sum, p) => sum + p.y, 0) / 5 },
    };
  });
  const authoritative = candidates.map((candidate) => candidate.reported !== null
    && candidate.score >= HANDEDNESS_CONFIDENCE
    && candidates.filter((other) => other.reported === candidate.reported).length === 1);
  // 分类明确时禁止分到另一只手；位置只消解低置信度/重复标签。
  const cost = (index: number, slot: PhysicalHand) => {
    const candidate = candidates[index]!;
    if (authoritative[index]) return physicalHandFor(candidate.reported!) === slot ? 0 : Infinity;
    const labelCost = candidate.reported && physicalHandFor(candidate.reported) !== slot
      ? 0.7 * candidate.score : 0;
    const previous = state.centers.get(slot);
    const continuityCost = previous
      ? Math.min(1, Math.hypot(previous.x - candidate.center.x, previous.y - candidate.center.y) / 0.35)
      : (state.centers.size > 0 ? 0.85 : 0);
    return labelCost + continuityCost;
  };
  // 两只手整体匹配，而非逐项占槽；检测数组反序、重复标签都不会互相挤掉历史。
  const assignments: PhysicalHand[][] = candidates.length === 0 ? [] : candidates.length === 2
    ? [["left", "right"], ["right", "left"]]
    : [["left"], ["right"]];
  assignments.sort((a, b) => a.reduce((sum, slot, i) => sum + cost(i, slot), 0)
    - b.reduce((sum, slot, i) => sum + cost(i, slot), 0));
  candidates.forEach(({ detection, score, center }, index) => {
    const slot = assignments[0]![index]!;
    state.centers.set(slot, center);
    const previous = state.smoothed.get(slot) ?? null;
    const smoothed = smoothLandmarks(previous, detection.landmarks);
    state.smoothed.set(slot, smoothed);
    state.lastSeen.set(slot, now);

    const ratio = pinchRatio(smoothed);
    const pinching = updatePinch(state.pinching.get(slot) ?? false, ratio);
    state.pinching.set(slot, pinching);

    const worldLandmarks = isUsableHand(detection.worldLandmarks)
      ? detection.worldLandmarks!.map((point) => ({ ...point }))
      : undefined;
    if (worldLandmarks) state.worldObserved.set(slot, worldLandmarks);
    else state.worldObserved.delete(slot);
    bySlot.set(slot, {
      landmarks: smoothed, worldLandmarks, physical: slot, pinching, pinchRatio: ratio, confidence: score,
      reportedHandedness: candidates[index]!.reported,
      identitySource: authoritative[index] ? "classification" : "association",
    });
  });

  /*
    宽限期：这一帧没检测到、但上一次看到还在 HAND_HOLD_MS 内 → 沿用上一帧的关键点。
    **不改捏合状态**（那是迟滞状态机的事），所以"抓着东西的手漏一帧"不会掉东西。
  */
  for (const slot of SLOT_ORDER) {
    if (bySlot.has(slot)) continue;
    const seenAt = state.lastSeen.get(slot);
    const held = state.smoothed.get(slot);
    if (seenAt === undefined || !held) continue;
    if (now - seenAt > HAND_HOLD_MS) {
      // 真的离开了：清掉历史，避免下次出现时从陈旧的位置慢慢滑过来
      state.smoothed.delete(slot);
      state.worldObserved.delete(slot);
      state.centers.delete(slot);
      state.pinching.delete(slot);
      state.lastSeen.delete(slot);
      continue;
    }
    bySlot.set(slot, {
      landmarks: held,
      worldLandmarks: state.worldObserved.get(slot),
      physical: slot,
      pinching: state.pinching.get(slot) ?? false,
      pinchRatio: pinchRatio(held),
      confidence: 0,
      identitySource: "held",
    });
  }

  return SLOT_ORDER.flatMap((slot) => {
    const hand = bySlot.get(slot);
    return hand ? [hand] : [];
  });
}
