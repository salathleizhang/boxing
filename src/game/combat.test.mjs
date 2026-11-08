import { test } from "node:test";
import assert from "node:assert/strict";
import { sweptHit, createPunchGate, detectPunch, isFist } from "./combat.ts";
test("fast punches crossing a target between frames hit, lateral misses do not", () => {
  const head = { x: 0, y: 1.8, z: 0 };
  assert.equal(
    sweptHit({ x: 0, y: 1.8, z: 1 }, { x: 0, y: 1.8, z: -1 }, head, 0.3),
    true,
  );
  assert.equal(
    sweptHit({ x: 0.5, y: 1.8, z: 1 }, { x: 0.5, y: 1.8, z: -1 }, head, 0.3),
    false,
  );
  assert.equal(sweptHit(head, head, head, 0.3), true);
});
test("forward motion needs a fist, retraction and a fresh observation after loss", () => {
  const gate = createPunchGate();
  assert.equal(detectPunch(gate, 0.1, true, 1000, 1), 0);
  assert.ok(detectPunch(gate, 0.15, true, 1050, 1) > 0);
  assert.equal(detectPunch(gate, 0.2, true, 1100, 1), 0);
  assert.equal(detectPunch(gate, 0.25, true, 1500, 1), 0); // gap: reacquisition cannot punch
  assert.equal(detectPunch(gate, 0.1, true, 1550, 1), 0); // retract to rearm
  assert.ok(detectPunch(gate, 0.15, true, 1600, 1) > 0);
  assert.equal(detectPunch(gate, 0.18, false, 1650, 1), 0);
});
test("invalid and open hands are never a fist", () => {
  assert.equal(isFist([]), false);
  const open = Array.from({ length: 21 }, () => ({ x: 0, y: 0.1, z: 0 }));
  open[0] = { x: 0, y: 0, z: 0 };
  for (const tip of [8, 12, 16, 20]) open[tip] = { x: 0, y: 0.25, z: 0 };
  assert.equal(isFist(open), false);
  const closed = open.map((p) => ({ ...p }));
  for (const tip of [8, 12, 16, 20]) closed[tip] = { x: 0, y: 0.015, z: 0 };
  assert.equal(isFist(closed), true);
});

test("palm jitter and opening a hand cannot rearm; a real retraction can", () => {
  const g = createPunchGate();
  detectPunch(g, .1, true, 1000, 1);
  assert.ok(detectPunch(g, .15, true, 1050, 1));
  detectPunch(g, .2, true, 1100, 1);
  detectPunch(g, .195, false, 1150, 1);
  detectPunch(g, .19, true, 1350, 1);
  assert.equal(detectPunch(g, .22, true, 1500, 1), 0);
  detectPunch(g, .1, true, 1550, 1);
  assert.ok(detectPunch(g, .15, true, 1600, 1));
});

import { createGuardGate, updateGuard, incomingDamage, punchExtension, isPunching, PUNCH_DURATION } from './combat.ts';
import { bodyReference, freshBodyReference } from '../tracking/bodyReference.ts';
const reference = { centerX: .5, noseY: .3, shoulderY: .55, width: .4 };
const raised = { x: .38, y: .35, closed: true };
test("guard is relative to the head and shoulders, debounced, and drops on missing input", () => {
  const g = createGuardGate();
  assert.equal(updateGuard(g, raised, reference, false, 1000), false);
  assert.equal(updateGuard(g, raised, reference, false, 1100), true);
  assert.equal(updateGuard(g, { ...raised, y: .7 }, reference, false, 1150), false);
  assert.equal(updateGuard(g, raised, reference, false, 1200), false);
  assert.equal(updateGuard(g, raised, reference, false, 1300), true);
  assert.equal(updateGuard(g, null, reference, false, 1310), false);
  assert.equal(updateGuard(g, raised, null, false, 1320), false);
  const shifted = { ...reference, centerX: .75, noseY: .5, shoulderY: .75 };
  assert.equal(updateGuard(g, { x: .63, y: .55, closed: true }, shifted, false, 1400), false);
  assert.equal(updateGuard(g, { x: .63, y: .55, closed: true }, shifted, false, 1500), true);
});
test("punching hand immediately loses guard, returning hand must reestablish it", () => {
  const g = createGuardGate();
  updateGuard(g, raised, reference, false, 1000);
  assert.equal(updateGuard(g, raised, reference, false, 1100), true);
  assert.equal(updateGuard(g, raised, reference, true, 1110), false);
  assert.equal(updateGuard(g, raised, reference, false, 1500), false);
  assert.equal(updateGuard(g, raised, reference, false, 1600), true);
  assert.equal(updateGuard(g, { ...raised, closed: false }, reference, false, 1610), false);
  assert.equal(incomingDamage(true, true), 0);
  assert.equal(incomingDamage(true, false), 4);
  assert.equal(incomingDamage(false, true), 4);
  assert.equal(incomingDamage(false, false), 9);
});
test("body references reject invisible and stale landmarks instead of preserving a phantom guard", () => {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .3, visibility: 1 }));
  points[11] = { x: .3, y: .55, visibility: 1 };
  points[12] = { x: .7, y: .55, visibility: 1 };
  const ref = bodyReference(points);
  assert.ok(ref);
  assert.ok(Math.abs(ref.width - .4) < .00001);
  assert.equal(freshBodyReference({ reference: ref, timestampMs: 1000, status: 'running' }, 1200), ref);
  assert.equal(freshBodyReference({ reference: ref, timestampMs: 1000, status: 'running' }, 1500), null);
  assert.equal(freshBodyReference({ reference: ref, timestampMs: 1000, status: 'unavailable' }, 1200), null);
  points[11].visibility = .1;
  assert.equal(bodyReference(points), null);
  assert.equal(bodyReference([]), null);
});
test("a punch extends quickly, retracts, and ends before the next attack", () => {
  assert.equal(punchExtension(-.1), 0);
  assert.equal(punchExtension(0), 0);
  assert.equal(punchExtension(.12), 1);
  assert.ok(punchExtension(.3) < punchExtension(.16));
  assert.equal(punchExtension(PUNCH_DURATION), 0);
  assert.equal(isPunching(.2), true);
  assert.equal(isPunching(PUNCH_DURATION), false);
});
