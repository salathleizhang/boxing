import type { GuardReference } from '../tracking/bodyReference.ts';
export type V3 = { x: number; y: number; z: number };
export const PUNCH_DURATION = .38;
export const PUNCH_COOLDOWN = .42;

export function punchExtension(age: number): number {
  if (age < 0 || age >= PUNCH_DURATION) return 0;
  // Fast extension, deliberate return to the guard position.
  const peak = .12;
  return age < peak ? Math.sin(age / peak * Math.PI / 2) : Math.cos((age - peak) / (PUNCH_DURATION - peak) * Math.PI / 2);
}
export function isPunching(age: number): boolean { return age >= 0 && age < PUNCH_DURATION; }
export interface GuardGate { active: boolean; since: number | null }
export function createGuardGate(): GuardGate { return { active: false, since: null }; }
export function updateGuard(g: GuardGate, hand: { x: number; y: number; closed: boolean } | null, reference: GuardReference | null, punching: boolean, now: number): boolean {
  const margin = g.active ? .08 : 0;
  const valid = !punching && hand?.closed && reference
    && Math.abs(hand.x - reference.centerX) < reference.width * (.68 + margin)
    && hand.y > reference.noseY - reference.width * (.45 + margin)
    && hand.y < reference.shoulderY + reference.width * (.03 + margin);
  if (!valid) { g.active = false; g.since = null; return false; }
  g.since ??= now;
  g.active ||= now - g.since >= 90;
  return g.active;
}
// A single returning hand offers partial protection; both hands form a full guard.
export function incomingDamage(left: boolean, right: boolean): number { return left && right ? 0 : left || right ? 4 : 9; }
export function sweptHit(a: V3, b: V3, center: V3, radius: number): boolean {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dz = b.z - a.z;
  const length = dx * dx + dy * dy + dz * dz;
  const t =
    length > 0
      ? Math.max(
          0,
          Math.min(
            1,
            ((center.x - a.x) * dx +
              (center.y - a.y) * dy +
              (center.z - a.z) * dz) /
              length,
          ),
        )
      : 0;
  return (
    Math.hypot(
      a.x + t * dx - center.x,
      a.y + t * dy - center.y,
      a.z + t * dz - center.z,
    ) <= radius
  );
}
export interface PunchGate {
  lastAt: number;
  armed: boolean;
  previousSize: number;
  previousAt: number;
  peakSize: number;
}
export function createPunchGate(): PunchGate {
  return { lastAt: -Infinity, armed: true, previousSize: 0, previousAt: 0, peakSize: 0 };
}
// A webcam has no absolute depth. Palm expansion is a relative forward-motion cue.
// Require a closed fist and a fresh forward movement, then wait for retraction.
export function detectPunch(
  g: PunchGate,
  size: number,
  closed: boolean,
  now: number,
  sensitivity: number,
): number {
  if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(now)) return 0;
  if (g.previousAt === 0 || now <= g.previousAt || now - g.previousAt > 250) {
    g.previousAt = now;
    g.previousSize = size;
    return 0;
  }
  const growth =
    (size - g.previousSize) / Math.max(0.008, (now - g.previousAt) / 1000);
  g.peakSize = Math.max(g.peakSize, size);
  // Opening the hand or one jittery frame cannot rearm a punch.
  if (!g.armed && size < g.peakSize * .82) g.armed = true;
  const power =
    closed && g.armed && now - g.lastAt > PUNCH_COOLDOWN * 1000 && growth > 0.32 / Math.max(.5, Math.min(2, sensitivity))
      ? Math.min(1, growth / 1.7)
      : 0;
  if (power) {
    g.lastAt = now;
    g.armed = false;
    g.peakSize = size;
  }
  g.previousSize = size;
  g.previousAt = now;
  return power;
}
export function isFist(p: readonly V3[]): boolean {
  if (p.length !== 21 || p.some(v => !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z))) return false;
  const d = (a: number, b: number) =>
    Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y, p[a].z - p[b].z);
  const palm = d(0, 9);
  if (palm < 0.015) return false;
  return (
    [
      [8, 5],
      [12, 9],
      [16, 13],
      [20, 17],
    ].filter(([tip, mcp]) => d(tip, 0) < d(mcp, 0) * 1.35).length >= 3
  );
}
