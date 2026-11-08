export interface BodyPoint { x: number; y: number; visibility?: number }
export interface GuardReference { centerX: number; noseY: number; shoulderY: number; width: number }
export interface BodyFrame { reference: GuardReference | null; timestampMs: number; status: 'loading' | 'running' | 'unavailable' }

// Image coordinates match the unmirrored hand detector, independent of display mirroring.
export function bodyReference(points: readonly BodyPoint[]): GuardReference | null {
  const nose = points[0], left = points[11], right = points[12];
  if (![nose, left, right].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && (p.visibility ?? 0) >= .55)) return null;
  const width = Math.abs(left.x - right.x);
  const shoulderY = (left.y + right.y) / 2;
  if (width < .08 || width > .9 || shoulderY <= nose.y) return null;
  return { centerX: (left.x + right.x) / 2, noseY: nose.y, shoulderY, width };
}

export function freshBodyReference(frame: BodyFrame, now: number): GuardReference | null {
  return frame.status === 'running' && now >= frame.timestampMs && now - frame.timestampMs < 450 ? frame.reference : null;
}
