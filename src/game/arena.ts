import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createDownloadedArena } from "./downloadedArena";
import { createOpponent, disposeObject, material, shape } from "./opponent";
import { opponentMotion, ATTACK_START, ATTACK_PERIOD } from "./opponentMotion";
import { getOpponent, type OpponentId } from "./opponents";
import type { HandTrackingStore } from "../tracking/handTrackingStore";
import { createPunchGate, detectPunch, isFist, sweptHit, createGuardGate, updateGuard, incomingDamage, punchExtension, isPunching, PUNCH_DURATION, PUNCH_COOLDOWN } from "./combat";
import type { VoiceEvent } from "./voice";
import { freshBodyReference, type BodyFrame } from "../tracking/bodyReference";
export interface FightState {
  phase: "ready" | "playing" | "paused" | "finished";
  remaining: number;
  duration: number;
  hits: number;
  punches: number;
  combo: number;
  bestCombo: number;
  score: number;
  health: number;
  opponentHealth: number;
  lastHit: string;
  lastHitAt: number;
  result: string;
  guarding: [boolean, boolean];
  blocks: number;
  trackingHint: string;
}
export interface ArenaOptions {
  store: HandTrackingStore;
  body: () => BodyFrame;
  read: () => FightState;
  onChange: () => void;
  onSound: (power: number, blocked: boolean) => void;
  onVoice?: (event: VoiceEvent) => void;
  cameraEnabled: () => boolean;
  sensitivity: () => number;
  onError: (message: string) => void;
}
export function createArena(host: HTMLDivElement, options: ArenaOptions) {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  host.appendChild(renderer.domElement);
  const scene = new T.Scene();
  scene.background = new T.Color("#100b12");
  scene.fog = new T.FogExp2("#100b12", 0.018);
  const camera = new T.PerspectiveCamera(58, 1, 0.05, 70);
  camera.position.set(0, 1.68, 2.25);
  camera.lookAt(0, 1.4, -2);
  scene.add(camera);
  scene.add(new T.HemisphereLight("#c2d9db", "#3a2d21", 2));
  const light = new T.SpotLight("#e8f2e9", 100, 18, 0.8, 0.5, 1.5);
  light.position.set(-2, 6, 2);
  light.target.position.set(0, 0, -1);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  scene.add(light, light.target);
  const rim = new T.PointLight("#e52245", 48, 14);
  rim.position.set(2, 3, -4);
  scene.add(rim);
  const sideLight = new T.PointLight("#f26943", 15, 8);
  sideLight.position.set(-3, 2, 1);
  scene.add(sideLight);
  const venue = createDownloadedArena(options.onError);
  scene.add(venue.root);
  let opponent = createOpponent();
  let preview = false;
  opponent.root.position.z = -0.4;
  scene.add(opponent.root);
  void opponent.ready.catch(() =>
    options.onError("角色模型加载失败，已保留默认陪练。"),
  );
  const playerGloves = [-1, 1].map((side) => {
    const g = new T.Group();
    const red = material("#d75b3e", 0.08, 0.36);
    shape(
      g,
      new T.SphereGeometry(1, 24, 20),
      red,
      [0, 0, 0],
      [0.125, 0.145, 0.155],
    );
    shape(
      g,
      new T.SphereGeometry(1, 16, 12),
      red,
      [-side * 0.09, -0.055, -0.01],
      [0.057, 0.08, 0.085],
    );
    shape(
      g,
      new T.CylinderGeometry(0.09, 0.085, 0.16, 16),
      material("#151b1e"),
      [0, -0.13, 0.04],
    );
    shape(
      g,
      new T.BoxGeometry(0.12, 0.035, 0.1),
      material("#d7d6bb"),
      [0, -0.13, 0.13],
    );
    camera.add(g);
    return g;
  });
  const aimRay = new T.Raycaster(),
    aimPlane = new T.Plane(new T.Vector3(0, 0, 1), 0.65),
    aimPoint = new T.Vector3();
  const punches = [
    { at: -1000, power: 0, hit: false, aimX: 0, aimY: 0 },
    { at: -1000, power: 0, hit: false, aimX: 0, aimY: 0 },
  ];
  const trackedTargets = [new T.Vector3(), new T.Vector3()],
    previous = [new T.Vector3(), new T.Vector3()];
  const gates = [createPunchGate(), createPunchGate()];
  let disposed = false;
  const GLOVE_SCALE = 0.3;
  void (async () => {
    const [gltf, baseColor, roughness] = await Promise.all([
      new GLTFLoader().loadAsync("/models/boxing-glove/glove.glb"),
      new T.TextureLoader().loadAsync("/models/boxing-glove/basecolor.png"),
      new T.TextureLoader().loadAsync("/models/boxing-glove/roughness.png"),
    ]);
    baseColor.colorSpace = T.SRGBColorSpace;
    baseColor.anisotropy = 8;
    roughness.anisotropy = 8;
    gltf.scene.traverse((object) => {
      const mesh = object as T.Mesh;
      if (!mesh.isMesh) return;
      for (const item of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const mat = item as T.MeshStandardMaterial;
        mat.map = baseColor;
        mat.roughnessMap = roughness;
        mat.roughness = 1;
        mat.metalness = 0;
        // The left glove is mirrored, which reverses triangle winding.
        mat.side = T.DoubleSide;
        mat.needsUpdate = true;
      }
    });
    if (disposed) {
      disposeObject(gltf.scene);
      return;
    }
    // Without forearms the cuff shows a hollow bowl. A rounded cap parented to
    // the glove closes it and reads as the padded end of the cuff.
    const cuffGeometry = new T.CapsuleGeometry(0.3, 0.16, 6, 24);
    const cuffMaterial = new T.MeshStandardMaterial({ color: "#b9302c", roughness: 0.8 });
    playerGloves.forEach((group, index) => {
      const side = index === 0 ? -1 : 1;
      for (const child of [...group.children]) group.remove(child);
      const model = gltf.scene.clone(true);
      // The source is a right glove, palm +Z, thumb +X. Roll it 180° about
      // the fist axis so the palm faces down, then mirror the left glove.
      model.scale.set(side * GLOVE_SCALE, GLOVE_SCALE, GLOVE_SCALE);
      model.rotation.set(-Math.PI * 0.36, Math.PI + side * 0.1, side * 0.04);
      const cuffCap = new T.Mesh(cuffGeometry, cuffMaterial);
      cuffCap.position.set(0.02, -0.3, 0.03);
      model.add(cuffCap);
      group.add(model);
    });
  })().catch(() => {
    // Keep the procedural stand-in gloves if the model cannot be loaded.
  });
  const guardGates = [createGuardGate(), createGuardGate()];
  const guardHands: [boolean, boolean] = [false, false];
  const observations: ({ x: number; y: number; closed: boolean; size: number } | null)[] = [null, null];
  let guardImpact = 0;
  const sparks = new T.Group();
  scene.add(sparks);
  const sparkMat = new T.MeshBasicMaterial({ color: "#e3f9b5" });
  const particles = Array.from({ length: 14 }, () => {
    const p = shape(
      sparks,
      new T.SphereGeometry(0.012, 5, 4),
      sparkMat,
      [0, 0, 0],
    );
    p.visible = false;
    return { mesh: p, velocity: new T.Vector3(), life: 0 };
  });
  let recoil = 0,
    shake = 0,
    lastTime = performance.now(),
    raf = 0,
    uiAt = 0,
    lastFrame = -1,
    attackClock = 0,
    attackResolved = false,
    block = false,
    aim = { x: 0, y: 0 };
  function publish() {
    options.onChange();
  }
  function hit(side: number, power: number, from: T.Vector3, to: T.Vector3) {
    const s = options.read();
    if (s.phase !== "playing" || punches[side].hit) return;
    const head = new T.Vector3(opponent.root.position.x, 1.78, -0.4),
      body = new T.Vector3(opponent.root.position.x, 1.22, -0.4);
    const isHead = sweptHit(from, to, head, 0.36),
      isBody = sweptHit(from, to, body, 0.39);
    if (!isHead && !isBody) return;
    punches[side].hit = true;
    const guarded = isHead && opponentMotion(activeTime, true).guarding;
    const damage = guarded ? 1 : Math.round(5 + power * 8);
    s.opponentHealth = Math.max(0, s.opponentHealth - damage);
    if (!guarded) {
      s.hits++;
      s.combo++;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      s.score += Math.round(
        (isHead ? 100 : 65) * (1 + power) * (1 + Math.min(s.combo, 10) * 0.1),
      );
    } else {
      s.combo = 0;
    }
    s.lastHit = guarded ? "格挡" : isHead ? "精准命中" : "躯干命中";
    s.lastHitAt = performance.now();
    recoil = guarded ? 0.25 : power + 0.35;
    if (!guarded) opponent.hit(activeTime);
    shake = 0.025;
    options.onSound(power, guarded);
    options.onVoice?.(guarded ? "block" : "hit");
    for (const p of particles) {
      p.mesh.position.copy(isHead ? head : body);
      p.velocity.set(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.7,
        (Math.random() - 0.5) * 2,
      );
      p.life = 0.32;
      p.mesh.visible = true;
    }
    if (s.opponentHealth <= 0) {
      s.phase = "finished";
      s.result = "KNOCKOUT";
    }
    publish();
  }
  function punch(side: number, power = 0.7, targetAim = aim) {
    const s = options.read(),
      now = activeTime;
    if ((side !== 0 && side !== 1) || s.phase !== "playing" || now - punches[side].at < PUNCH_COOLDOWN) return;
    Object.assign(punches[side], {
      at: now,
      power,
      hit: false,
      aimX: targetAim.x,
      aimY: targetAim.y,
    });
    s.punches++;
    publish();
  }
  const down = (e: KeyboardEvent) => {
    if (
      (e.target as HTMLElement)?.matches(
        "input,select,textarea,[contenteditable=true]",
      )
    )
      return;
    if (e.code === "Space") {
      e.preventDefault();
      block = true;
    }
    if (e.repeat) return;
    if (e.code === "KeyJ") punch(0);
    if (e.code === "KeyK") punch(1);
  };
  const up = (e: KeyboardEvent) => {
    if (e.code === "Space") block = false;
  };
  const blur = () => {
    block = false;
  };
  window.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  window.addEventListener("blur", blur);
  const move = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    aim = {
      x: ((e.clientX - r.left) / r.width) * 2 - 1,
      y: 1 - ((e.clientY - r.top) / r.height) * 2,
    };
    const crosshair =
      host.querySelector<HTMLElement>(".crosshair");
    if (crosshair) {
      crosshair.style.left = `${(aim.x + 1) * 50}%`;
      crosshair.style.top = `${(1 - aim.y) * 50}%`;
    }
  };
  const reticle = document.createElement("canvas");
  reticle.className = "crosshair";
  reticle.width = reticle.height = 24;
  const rc = reticle.getContext("2d")!;
  rc.strokeStyle = "#ffffff99"; rc.lineWidth = 1;
  rc.beginPath(); rc.moveTo(6, 12); rc.lineTo(18, 12); rc.moveTo(12, 6); rc.lineTo(12, 18); rc.stroke();
  host.appendChild(reticle);
  host.addEventListener("pointermove", move);
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.fov = preview ? 70 : camera.aspect < 1 ? 80 : 58;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  let activeTime = 0;
  function animate(now: number) {
    if (disposed) return;
    raf = requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    const s = options.read();
    let playing = s.phase === "playing";
    const time = now / 1000;
    if (playing) {
      activeTime += dt;
      s.remaining = Math.max(0, s.remaining - dt);
      if (s.remaining <= 0) {
        s.phase = "finished";
        playing = false;
        s.result = s.opponentHealth < s.health ? "ROUND WON" : "ROUND COMPLETE";
        publish();
      }
      attackClock += dt;
    } else if (s.phase === "ready") {
      activeTime = 0;
      attackClock = 0;
    }
    const motion = opponentMotion(activeTime, playing || s.phase === "paused");
    const attack = playing ? motion.extension : 0;
    if (attackClock % ATTACK_PERIOD < ATTACK_START) attackResolved = false;
    const frame = options.store.getFrame();
    const fresh = options.cameraEnabled() && options.store.getSnapshot().status === "running"
      && now >= frame.timestampMs && now - frame.timestampMs < 220;
    const body = options.body();
    const reference = options.cameraEnabled() ? freshBodyReference(body, now) : null;
    // Read input and trigger attacks before resolving the opponent, so a punching
    // hand cannot block an incoming hit during the same frame.
    for (let i = 0; i < 2; i++) {
      const hand = fresh ? frame.hands.find(h => h.physical === (i === 0 ? "left" : "right") && h.identitySource !== "held") : undefined;
      let observation: (typeof observations)[number] = null;
      if (hand) {
        const points = [0, 5, 9, 13, 17].map(j => hand.landmarks[j]);
        observation = {
          x: points.reduce((sum, p) => sum + p.x, 0) / 5,
          y: points.reduce((sum, p) => sum + p.y, 0) / 5,
          closed: isFist(hand.landmarks),
          size: Math.hypot(hand.landmarks[5].x - hand.landmarks[17].x, hand.landmarks[5].y - hand.landmarks[17].y),
        };
        if (frame.frameId !== lastFrame && playing) {
          const power = detectPunch(gates[i], observation.size, observation.closed, frame.timestampMs, options.sensitivity());
          if (power) {
            // Aim for the central target at the user's head/shoulder level;
            // absolute webcam framing should not push a jab off the opponent.
            const center = reference?.centerX ?? .5;
            const height = reference ? (reference.noseY + reference.shoulderY) / 2 : .45;
            const punchAim = { x: T.MathUtils.clamp((center - observation.x) * 1.7, -.8, .8), y: T.MathUtils.clamp((height - observation.y) * 1.4, -.65, .65) };
            punch(i, Math.max(.4, power), punchAim);
          }
        }
      } else {
        // Even a brief held detection is not a fresh movement observation.
        gates[i].previousAt = 0;
      }
      if (!playing) { gates[i].previousAt = 0; block = false; }
      observations[i] = observation;
      const attacking = isPunching(activeTime - punches[i].at);
      guardHands[i] = playing && (updateGuard(guardGates[i], observation, reference, attacking, now) || block && !attacking);
      if (!playing) Object.assign(guardGates[i], createGuardGate());
    }
    s.guarding = [guardHands[0], guardHands[1]];
    s.trackingHint = !options.cameraEnabled() ? "" : !fresh || !observations.some(Boolean)
      ? "请让双手完整入镜"
      : !reference ? body.status === 'loading' ? "正在识别头肩位置" : "请让头部和双肩入镜 · 空格也可防守"
      : "握拳前伸出拳 · 双拳举至脸旁防守";
    if (playing && attack > 0.92 && !attackResolved) {
      attackResolved = true;
      const damage = incomingDamage(guardHands[0], guardHands[1]);
      s.health = Math.max(0, s.health - damage);
      s.lastHit = damage === 0 ? "成功防守" : damage === 4 ? "单手格挡 · 仍有伤害" : "注意防守";
      s.lastHitAt = now;
      if (damage === 0) s.blocks++;
      else s.combo = 0;
      guardImpact = damage < 9 ? 1 : 0;
      shake = damage === 0 ? .018 : damage === 4 ? .045 : .1;
      options.onSound(damage === 0 ? .35 : .65, damage < 9);
      options.onVoice?.(damage === 0 ? "guard" : "hurt");
      if (s.health === 0) {
        s.phase = "finished"; playing = false;
        s.result = "再来一回合";
      }
      publish();
    }
    guardImpact = T.MathUtils.damp(guardImpact, 0, 14, dt);
    recoil = T.MathUtils.damp(recoil, 0, 7, dt);
    shake = T.MathUtils.damp(shake, 0, 8, dt);
    opponent.update(s.phase === "ready" ? time : activeTime, s.phase === "ready" || playing ? dt : 0, recoil, attack, motion);
    camera.position.z = preview ? 1.25 : 2.25;
    camera.position.x = Math.sin(time * 34) * shake;
    camera.position.y = (preview ? 1.25 : 1.68) + Math.cos(time * 27) * shake * 0.5;
    camera.rotation.z = Math.sin(time * 23) * shake * 0.15;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const age = activeTime - punches[i].at;
      const extension = playing ? punchExtension(age) : 0;
      const target = trackedTargets[i];
      const guarding = guardHands[i];
      // Keep a raised guard beside the face, above the relaxed stance.
      target.set(side * (camera.aspect < 1 ? .21 : .32), guarding ? .12 : -.29, guarding ? -.75 : -.72);
      const observation = observations[i];
      if (observation && !guarding) {
        const center = reference?.centerX ?? .5;
        const height = reference ? (reference.noseY + reference.shoulderY) / 2 : .45;
        target.x += T.MathUtils.clamp((center - observation.x) * .8 - side * .15, -.18, .18);
        target.y += T.MathUtils.clamp((height - observation.y) * .6, -.13, .2);
      }
      if (guarding) target.z += guardImpact * .055;
      if (extension > 0) {
        const p = punches[i];
        camera.updateMatrixWorld();
        aimRay.setFromCamera(new T.Vector2(p.aimX, p.aimY), camera);
        if (aimRay.ray.intersectPlane(aimPlane, aimPoint)) {
          camera.worldToLocal(aimPoint);
          target.lerp(aimPoint, extension);
        }
      }
      const glove = playerGloves[i];
      glove.position.lerp(target, 1 - Math.exp(-dt * 24));
      glove.rotation.set(-.1 - extension * .2, side * (.1 + extension * .15), side * (guarding ? -.2 : -.12));
      const world = camera.localToWorld(glove.position.clone());
      if (playing && age <= .17 && extension > 0.3) {
        hit(i, punches[i].power, previous[i], world);
      }
      previous[i].copy(world);
      if (playing && punches[i].power > 0 && age >= PUNCH_DURATION && !punches[i].hit) {
        punches[i].hit = true;
        s.combo = 0;
        s.lastHit = "调整准星再出拳";
        s.lastHitAt = now;
        publish();
      }
    }
    lastFrame = frame.frameId;
    for (const p of particles)
      if (p.life > 0) {
        p.life -= dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.velocity.y -= 3 * dt;
        p.mesh.visible = p.life > 0;
      }
    if (now - uiAt > 100) {
      uiAt = now;
      publish();
    }
    if (preview) camera.lookAt(0, 1.1, -.4);
    else camera.rotation.x = -Math.atan2(.28, 4.25);
    playerGloves.forEach(g => { g.visible = !preview; });
    reticle.style.visibility = preview ? "hidden" : "visible";
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(animate);
  return {
    ready: opponent.ready,
    setPreview(value: boolean) { preview = value; resize(); },
    selectOpponent(id: OpponentId) {
      const previousOpponent = opponent;
      opponent = createOpponent(getOpponent(id));
      opponent.root.position.z = -.4;
      scene.add(opponent.root);
      scene.remove(previousOpponent.root);
      previousOpponent.dispose();
      disposeObject(previousOpponent.root);
      return opponent.ready;
    },
    punch,
    block: (value: boolean) => {
      block = value;
    },
    reset() {
      punches.forEach((p) => {
        p.at = -1000;
        p.hit = true;
        p.power = 0;
      });
      gates.forEach((g) => Object.assign(g, createPunchGate()));
      guardGates.forEach(g => Object.assign(g, createGuardGate()));
      guardHands.fill(false);
      block = false;
      guardImpact = 0;
      lastFrame = -1;
      attackClock = 0;
      activeTime = 0;
      opponent.reset();
      attackResolved = false;
      recoil = 0;
      aim = { x: 0, y: 0 };
      const crosshair =
        host.querySelector<HTMLElement>(".crosshair");
      if (crosshair) {
        crosshair.style.left = "50%";
        crosshair.style.top = "50%";
      }
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      host.removeEventListener("pointermove", move);
      venue.dispose();
      opponent.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      reticle.remove();
    },
  };
}
export type Arena = ReturnType<typeof createArena>;
