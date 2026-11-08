import * as T from 'three';

export const ATTACK_START = 3.1;
export const ATTACK_DURATION = 1.1;
export const ATTACK_PERIOD = 4.2;
/** One clock drives the visible punch, its impact and the opponent's guard. */
export function opponentMotion(time: number, playing: boolean) {
  const cycle = Math.floor(time / ATTACK_PERIOD), phase = time % ATTACK_PERIOD;
  const elapsed = playing && phase >= ATTACK_START ? phase - ATTACK_START : -1;
  return {
    elapsed,
    side: (cycle % 2) as 0 | 1,
    extension: elapsed < 0 ? 0 : Math.sin(elapsed / ATTACK_DURATION * Math.PI),
    guarding: playing && elapsed < 0 && Math.sin(time * 1.1) > .83,
  };
}
export type OpponentMotion = ReturnType<typeof opponentMotion>;

export function createOpponentMotion(model: T.Object3D, clips: T.AnimationClip[]) {
  const mixer = new T.AnimationMixer(model);
  const actions = new Map(clips.map(clip => {
    const action = mixer.clipAction(clip).play();
    action.paused = true;
    action.setEffectiveWeight(0);
    return [clip.name, action] as const;
  }));
  let recoilAt = -Infinity, lastTime = 0;
  return {
    hit(time: number) { recoilAt = time; },
    reset() { recoilAt = -Infinity; },
    update(time: number, _delta: number, motion: OpponentMotion) {
      if (time < lastTime) recoilAt = -Infinity;
      lastTime = time;
      for (const action of actions.values()) action.setEffectiveWeight(0);
      const idle = actions.get('Idle');
      if (idle) {
        // Idle is the supplied boxing guard: hold its first pose when blocking.
        idle.time = motion.guarding ? 0 : time % idle.getClip().duration;
        idle.setEffectiveWeight(1);
      }
      const punch = actions.get(motion.side === 0 ? 'LeftPunch' : 'RightPunch');
      if (motion.elapsed >= 0 && punch) {
        // Authored extension peaks at 0.5s; game impact peaks halfway through the attack window.
        punch.time = motion.elapsed / ATTACK_DURATION;
        punch.setEffectiveWeight(1); idle?.setEffectiveWeight(0);
      }
      const recoil = actions.get('Recoil'), age = time - recoilAt;
      if (recoil && age >= 0 && age < .53) {
        const weight = Math.min(1, (.53 - age) / .12);
        for (const action of actions.values()) action.setEffectiveWeight(action.getEffectiveWeight() * (1 - weight));
        recoil.time = age; recoil.setEffectiveWeight(weight);
      }
      mixer.update(0);
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); },
  };
}
