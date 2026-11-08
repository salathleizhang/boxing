/**
 * 手势模式的**纯数值层**：MediaPipe 关键点的屏幕摆放、捏合判据与输入平滑。
 * 骨骼姿态由完整 three-mediapipe-rig 驱动。此模块与 three、React、摄像头都无关，
 * （同 `physics.ts` / `grabCommit.ts` 的形状：常量 + 纯函数，组件只负责接线）。
 *
 * ### MediaPipe 给的是什么（`developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker`）
 * 每只手 21 个点，`x`/`y` 是**图像归一化**坐标（0..1，原点左上、y 向下），`z` 是"以手腕为原点
 * 的深度"，**越小越靠近相机**，量纲与 `x` 大致同尺度（都按图像宽度归一）。所以 `z` 不能直接当
 * 世界坐标用，要先乘"画面宽度对应的世界尺寸"。相机坐标 +z 朝观察者；
 * 此处的投影坐标仅用于显示位置与距离；原始三维关键点直接输入库。
 *
 * ### 左右手与自拍镜像
 * 手性取检测分类并保持时序身份；画面位置不决定手性。
 * 自拍镜像只在显示坐标映射时执行，骨骼层另行匹配模型手性。
 *
 * ### 为什么手的位置要"按画面比例"映射
 * 关键点是归一化的：手离相机越近，同样一个 `x` 跨度覆盖的世界尺寸越大。若直接乘一个固定
 * 的世界尺度，手一靠近就会缩成玩具、一远离就撑满屏幕。这里改成**按当前相机在手的平面上的
 * 可见范围**换算（`projectHand` + `perspectiveExtents`）：画面里的手有多大，场景里的手就有多大，
 * 与参考图（手占画面下半部一块）一致。代价是不能靠"手离镜头远近"去推拉物体——那件事本来就
 * 由"手的捏合点 → 相机射线"决定（见 `handGrab.ts`）。
 */

/** 一只手的关键点数（MediaPipe 固定 21） */
export const HAND_LANDMARK_COUNT = 21;

/** 关键点索引。名字用 MediaPipe 的解剖名，别用数字：`landmarks[8]` 谁也看不出是食指指尖 */
export const WRIST = 0;
export const THUMB_CMC = 1;
export const THUMB_MCP = 2;
export const THUMB_IP = 3;
export const THUMB_TIP = 4;
export const INDEX_MCP = 5;
export const INDEX_PIP = 6;
export const INDEX_DIP = 7;
export const INDEX_TIP = 8;
export const MIDDLE_MCP = 9;
export const MIDDLE_PIP = 10;
export const MIDDLE_DIP = 11;
export const MIDDLE_TIP = 12;
export const RING_MCP = 13;
export const RING_PIP = 14;
export const RING_DIP = 15;
export const RING_TIP = 16;
export const PINKY_MCP = 17;
export const PINKY_PIP = 18;
export const PINKY_DIP = 19;
export const PINKY_TIP = 20;

/**
 * 21 个点之间的 21 条连接（与 MediaPipe 的 `HandLandmarker.HAND_CONNECTIONS` 同一张表）。
 * 供摄像头预览绘制连线；模型骨骼映射使用上游 defaultBoneMap。
 */
export const HAND_CONNECTIONS: readonly (readonly [number, number])[] = [
  [WRIST, THUMB_CMC],
  [THUMB_CMC, THUMB_MCP],
  [THUMB_MCP, THUMB_IP],
  [THUMB_IP, THUMB_TIP],
  [WRIST, INDEX_MCP],
  [INDEX_MCP, INDEX_PIP],
  [INDEX_PIP, INDEX_DIP],
  [INDEX_DIP, INDEX_TIP],
  [INDEX_MCP, MIDDLE_MCP],
  [MIDDLE_MCP, MIDDLE_PIP],
  [MIDDLE_PIP, MIDDLE_DIP],
  [MIDDLE_DIP, MIDDLE_TIP],
  [MIDDLE_MCP, RING_MCP],
  [RING_MCP, RING_PIP],
  [RING_PIP, RING_DIP],
  [RING_DIP, RING_TIP],
  [RING_MCP, PINKY_MCP],
  [PINKY_MCP, PINKY_PIP],
  [PINKY_PIP, PINKY_DIP],
  [PINKY_DIP, PINKY_TIP],
  [WRIST, PINKY_MCP],
];

/** 手掌面片的 5 个外圈点（按绕行顺序：腕 → 食指 → 中指 → 无名 → 小指） */
export const PALM_RIM: readonly number[] = [WRIST, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP];

/** MediaPipe 的原始关键点：图像归一化 x/y + 相对手腕的深度 z */
export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export type HandLandmarks = readonly HandLandmark[];

/** Reject missing/non-finite detector input before it reaches a skinned model. */
export function isUsableHand(landmarks: HandLandmarks | null | undefined): boolean {
  if (!landmarks || landmarks.length !== HAND_LANDMARK_COUNT) return false;
  for (const point of landmarks) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) return false;
  }
  return true;
}

/** 三元组（本模块不 import three，所以自己写一个最小形状） */
export type Vec3 = readonly [number, number, number];

/** MediaPipe 报的手性标签（**假定输入已镜像**） */
export type ReportedHandedness = "Left" | "Right";
/** 用户在现实里用的那只手 */
export type PhysicalHand = "left" | "right";

/**
 * 编辑器显示约定：屏幕位置跟随自拍预览，掌面从相反的一侧观察。
 * 实手心朝摄像头 → 虚拟手背朝观察者；实手背朝摄像头 → 虚拟手心朝观察者。
 * mirror/reverseDepth 用于投影和选择显示手性；骨骼使用库的原始坐标转换，
 * 相反观察方向在外层挂点旋转 180°。真实左右手身份仍用于追踪/抓取。
 */
export const HAND_EDITOR_VIEW = { mirror: true, reverseDepth: true } as const;

/** 水平镜像与反向观察各改变一次手性，两者同时开启时相互抵消。 */
export function displayedHandFor(physical: PhysicalHand, mirror: boolean, reverseDepth = false): PhysicalHand {
  return mirror !== reverseDepth ? (physical === "left" ? "right" : "left") : physical;
}

/* ------------------------------------------------------------------ 手性 */

/**
 * 「MediaPipe 报的手性」→「用户现实里那只手」。
 *
 * 当前 Tasks Vision 的分类作为物理手性使用；旧版检测器可显式传 false 对调。
 * 此处不依据手掌朝向、拇指的二维位置或所在画面半边猜测手性。
 */
export function physicalHandFor(reported: ReportedHandedness, reportedIsPhysical = true): PhysicalHand {
  const asReported: PhysicalHand = reported === "Left" ? "left" : "right";
  if (reportedIsPhysical) return asReported;
  return asReported === "left" ? "right" : "left";
}

/* ------------------------------------------------------------------ 尺度与捏合 */

export function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * 「这只手多大」的尺子：**腕 → 中指 MCP**（掌长）。
 *
 * 用比值而不是绝对距离判捏合，是因为手离镜头远近会让绝对像素距离差好几倍；
 * 掌长是同一只手在同一帧里的稳定参照。用中指 MCP 而不是指尖：指尖会跟着张开/蜷起动，
 * 拿它当分母等于把"手张开"也算进捏合程度里。
 */
export function handScale(landmarks: HandLandmarks): number {
  const wrist = landmarks[WRIST];
  const middle = landmarks[MIDDLE_MCP];
  if (!wrist || !middle) return 0;
  return Math.hypot(wrist.x - middle.x, wrist.y - middle.y, wrist.z - middle.z);
}

/**
 * 捏合程度：拇指尖 ↔ 食指尖的距离 ÷ 掌长。
 * 张开的手约 0.9–1.4，捏住约 0.1–0.25（真实读数量级，见 `handLandmarks.test.ts` 的合成用例）。
 */
export function pinchRatio(landmarks: HandLandmarks): number {
  const scale = handScale(landmarks);
  if (scale <= 1e-6) return Number.POSITIVE_INFINITY;
  const thumb = landmarks[THUMB_TIP];
  const index = landmarks[INDEX_TIP];
  if (!thumb || !index) return Number.POSITIVE_INFINITY;
  return Math.hypot(thumb.x - index.x, thumb.y - index.y, thumb.z - index.z) / scale;
}

/**
 * 捏合的**迟滞**阈值（开/关不是一个数）。
 *
 * 单阈值的问题是：手指停在阈值附近时，抖一下就会"抓住—放开—抓住"，物体会被反复建/拆关节。
 * 所以用两个：低于 `PINCH_START_RATIO` 才算捏住，高于 `PINCH_END_RATIO` 才算松开，
 * 中间那段保持上一次的状态（`updatePinch`）。
 */
export const PINCH_START_RATIO = 0.34;
export const PINCH_END_RATIO = 0.5;

/** 推进一次捏合判据（迟滞状态机）。返回这一帧是否算"捏住" */
export function updatePinch(pinching: boolean, ratio: number): boolean {
  if (!Number.isFinite(ratio)) return false;
  if (pinching) return ratio <= PINCH_END_RATIO;
  return ratio <= PINCH_START_RATIO;
}

/* ------------------------------------------------------------------ 平滑 */

/**
 * 关键点的指数平滑系数。
 *
 * 0.55 的取法：MediaPipe 逐帧的关键点有肉眼可见的抖（尤其是指尖的 z），不平滑时场景里的手
 * 会一直微微发抖、抓着的物体也跟着抖；系数再小（更平滑）手指的快速动作会明显拖后腿。
 * 平滑**在归一化坐标里做**（与相机无关），所以换窗格/换布局不会污染滤波器的历史值。
 */
export const HAND_SMOOTHING_ALPHA = 0.55;

/**
 * 指数平滑：`next * α + previous * (1 − α)`。
 *
 * 点数不匹配（第一帧、检测器偶尔只给一半的点）时**原样返回 `next` 的副本**，
 * 不做"能平滑几个算几个"——半新半旧的点拼出来的手会有一根手指跳到错误位置。
 */
export function smoothLandmarks(
  previous: HandLandmarks | null,
  next: HandLandmarks,
  alpha = HAND_SMOOTHING_ALPHA,
): HandLandmark[] {
  const a = Math.min(1, Math.max(0, alpha));
  if (!previous || previous.length !== next.length) return next.map((p) => ({ ...p }));
  return next.map((point, index) => {
    const before = previous[index]!;
    return {
      x: before.x + (point.x - before.x) * a,
      y: before.y + (point.y - before.y) * a,
      z: before.z + (point.z - before.z) * a,
    };
  });
}

/* ------------------------------------------------------------------ 画面 ↔ 世界 */

/**
 * 手所在平面上**可见范围**的世界尺寸（米）。
 *
 * 透视：`height = 2 · d · tan(fov/2)`（three 的 `fov` 是**垂直**视场角）、`width = height · aspect`。
 * 正视：可见范围与距离无关，直接是 `top − bottom` 与它乘 aspect。
 *
 * 这是"归一化关键点 → 世界偏移"的换算尺子：用当前相机的真实视场，画面边缘就等于手的可达边缘。
 */
export interface ViewExtents {
  width: number;
  height: number;
}

export function perspectiveExtents(fovDeg: number, aspect: number, distance: number): ViewExtents {
  const height = 2 * distance * Math.tan((Math.max(1, fovDeg) * Math.PI) / 360);
  return { height, width: height * Math.max(0.01, aspect) };
}

export function orthographicExtents(top: number, bottom: number, aspect: number): ViewExtents {
  const height = Math.abs(top - bottom);
  return { height, width: height * Math.max(0.01, aspect) };
}

/** 手锚点在**镜像后的归一化画面**里的静止位置（x 向右、y 向下，与图像坐标同向） */
export type ScreenAnchor = readonly [number, number];

/**
 * 位移增益：手掌在画面里挪多少，手在世界里就挪多少（1 = 严格 1:1）。
 *
 * 不取 1 以上的理由是"手的可达范围会超出画面"；不取 1 以下（阻尼）是因为那会让"手往右伸"
 * 与"屏幕上的手往右走"对不上，用户第一下就会觉得是坏的。
 */
export const HAND_TRANSLATION_GAIN = 1;

/**
 * 画面边缘留白（归一化比例）：手最多贴到离画面边缘这么近。
 *
 * **不是"绕锚点的半径"**——第一版写成"锚点 ± 0.22"，于是右手（锚点 0.67）只能走到
 * x ∈ [0.45, 0.89]、y ∈ [0.44, 0.88]：**屏幕上半部与左半边都够不到**。真机验证时一眼看出来：
 * 轨道机位俯视场景，模型都在画面中上部，手的射线怎么摆都指不到它们（标定出来的斜率只有
 * −0.72 而不是 −1，那就是钳制在吃位移）。现在的口径是"钳到画面内"——归一化坐标本来就与
 * 画面一一对应，手举到画面边缘时 3D 手就在画面边缘，本来就该如此。
 */
export const HAND_SCREEN_MARGIN = 0.04;

export interface HandProjectionOptions {
  /** 是否水平镜像（自拍视角）。产品默认 true：手往右挪，屏幕上的手也往右挪 */
  mirror: boolean;
  /** 从与摄像头相反的一侧观察手。只翻相对掌心的深度，屏幕位置保持不变。 */
  reverseDepth?: boolean;
  extents: ViewExtents;
  /** 该手在画面里的静止位置（镜像后、归一化） */
  anchor: ScreenAnchor;
  gain?: number;
  /** 画面边缘留白（默认 `HAND_SCREEN_MARGIN`） */
  screenMargin?: number;
}

export interface HandProjection {
  /**
   * 手掌中心相对**该手锚点**的偏移（米，相机空间：+x 右 / +y 上 / **+z 朝相机**）。
   * 手锚点在世界里的位置由调用方给（相机前方固定距离 + 一把左右偏移）。
   */
  palmOffset: Vec3;
  /** 21 个投影点相对手掌中心的位置，用于估计图像占位；不驱动骨骼旋转 */
  joints: Vec3[];
  /** 手掌中心（镜像后）在归一化画面里的位置，供预览叠字/调试读数用 */
  palmScreen: { x: number; y: number };
}

/**
 * 把 21 个图像关键点投影到相机空间，用于屏幕摆放与距离估计。
 *
 * 三步，缺一不可：
 * 1. `x` 镜像（`mirror`）、`y` 翻正（图像 y 向下 → 世界 y 向上）、`z` 翻号并乘画面宽度
 *    （MediaPipe 的 z 越小越近）；
 * 2. 取**手掌中心**（腕 + 四个 MCP 的均值）当原点：关节坐标全部相对它，于是"手在画面里平移"
 *    与"手指怎么动"被干净地拆成两个量；
 * 3. 平移单独算——按画面比例换算成世界偏移，乘增益、再钳到锚点附近。
 *
 * 手掌中心取 5 个点的均值而不是腕关节：腕在画面里会被小臂/袖子带动，均值更稳。
 */
export function projectHand(landmarks: HandLandmarks, options: HandProjectionOptions): HandProjection {
  const { mirror, extents, anchor } = options;
  const gain = options.gain ?? HAND_TRANSLATION_GAIN;
  const margin = options.screenMargin ?? HAND_SCREEN_MARGIN;

  /** 镜像后的归一化坐标（x 向右、y 向下），仍未平移 */
  const toScreen = (p: HandLandmark) => ({ x: mirror ? 1 - p.x : p.x, y: p.y });
  /** 归一化画面点 → 相机空间（未含深度），+y 向上 */
  const toCamera = (p: { x: number; y: number }) => ({
    x: (p.x - 0.5) * extents.width,
    y: (0.5 - p.y) * extents.height,
  });

  const mapped: Vec3[] = landmarks.map((p) => {
    const screen = toScreen(p);
    const camera = toCamera(screen);
    // MediaPipe 的 z 与 x 同尺度（都按图像宽度归一），所以深度也用 width 换算
    return [camera.x, camera.y, (options.reverseDepth ? p.z : -p.z) * extents.width];
  });

  const sum: [number, number, number] = [0, 0, 0];
  let counted = 0;
  for (const index of PALM_RIM) {
    const point = mapped[index];
    if (!point) continue;
    sum[0] += point[0];
    sum[1] += point[1];
    sum[2] += point[2];
    counted += 1;
  }
  const center: Vec3 = counted > 0 ? [sum[0] / counted, sum[1] / counted, sum[2] / counted] : [0, 0, 0];
  const joints: Vec3[] = mapped.map((point) => [point[0] - center[0], point[1] - center[1], point[2] - center[2]]);

  // 手掌中心在**镜像后**的归一化画面里的位置（未平移、未钳制）
  const screenSum = { x: 0, y: 0 };
  let screenCount = 0;
  for (const index of PALM_RIM) {
    const landmark = landmarks[index];
    if (!landmark) continue;
    const screen = toScreen(landmark);
    screenSum.x += screen.x;
    screenSum.y += screen.y;
    screenCount += 1;
  }
  const palmScreen = screenCount > 0 ? { x: screenSum.x / screenCount, y: screenSum.y / screenCount } : { x: 0.5, y: 0.5 };

  // 钳到画面内（而不是"绕锚点的半径"）：归一化坐标本来与画面一一对应
  const clampedScreen = {
    x: Math.min(1 - margin, Math.max(margin, palmScreen.x)),
    y: Math.min(1 - margin, Math.max(margin, palmScreen.y)),
  };
  const base = toCamera({ x: anchor[0], y: anchor[1] });
  const moved = toCamera(clampedScreen);
  const palmOffset: Vec3 = [
    (moved.x - base.x) * gain,
    (moved.y - base.y) * gain,
    // 深度上不给整只手的位移：z 只有厘米级，放进来只会让手前后抖
    0,
  ];

  return { palmOffset, joints, palmScreen };
}

/**
 * 相机前方的**手锚点**（相机空间，米）：左右各一只，位置与参考图一致
 * （手在画面下半部、从两侧伸进来）。
 *
 * 这里的 `x` 会被 `projectHand` 的归一化换算再叠加上去，所以锚点用的是
 * **归一化画面位置**而不是世界米数——换窗格尺寸/换 fov 时手的构图不动。
 */
export const HAND_ANCHORS: Record<PhysicalHand, ScreenAnchor> = {
  // y 向下：0.5 是画面中心，> 0.5 偏下
  left: [0.33, 0.66],
  right: [0.67, 0.66],
};

/**
 * 手锚点在相机空间的**基准深度**（米）：只用来算"画面里 1 个归一化单位等于多少米"，
 * 真正的手放在哪由 `handDepthForSight()` 按"看起来多大"反推（见下）。
 */
export const HAND_DEPTH = 0.62;

/**
 * 虚拟手的**真实长度**（米，腕 → 中指指尖）。成人约 0.19–0.20。
 *
 * 这是"手在场景里多大"的唯一来源：**恒定**。早先按"画面里手多大"等比缩放，
 * 用户把手凑近摄像头（画面里手占了大半屏）时虚拟手就被放大成几十厘米的巨手，
 * 指头被拉得又细又长、看着像畸形（用户报的"越来越扭曲"）。
 */
export const HAND_REAL_LENGTH = 0.2;

/** 手离相机的允许范围（米）：再近会糊脸、再远像贴纸 */
export const HAND_MIN_DEPTH = 0.26;
export const HAND_MAX_DEPTH = 1.4;

/**
 * 「手在画面里占多高」→「它应当离相机多远」。
 *
 * 物理上很简单：**看起来大 = 离得近**。手的世界尺寸恒定（`HAND_REAL_LENGTH`），
 * 如果它在画面里占 `fraction` 的高度，那它就在
 * `d = L / (2 · fraction · tan(fov/2))` 处——于是画面上的大小自动与视频一致，
 * 而虚拟手永远是真人手那么大。
 */
export function handDepthForSight(fraction: number, fovDeg: number): number {
  const tanHalf = Math.tan((Math.max(1, fovDeg) * Math.PI) / 360);
  if (!(fraction > 1e-3) || !(tanHalf > 0)) return HAND_DEPTH;
  const depth = HAND_REAL_LENGTH / (2 * fraction * tanHalf);
  return Math.min(HAND_MAX_DEPTH, Math.max(HAND_MIN_DEPTH, depth));
}
