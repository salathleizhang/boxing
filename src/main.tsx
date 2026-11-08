import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createArena, type Arena, type FightState } from "./game/arena";
import { FightAudio } from "./game/audio";
import { CanvasHUD } from "./ui/CanvasHUD";
import {
  createHandTrackingStore,
  useHandTrackingSnapshot,
} from "./tracking/handTrackingStore";
import { useHandTracking } from "./tracking/useHandTracking";
import { useBodyTracking } from "./tracking/useBodyTracking";
import type { BodyFrame } from "./tracking/bodyReference";
import "./style.css";
import { DEFAULT_OPPONENT, getOpponent, type OpponentId } from "./game/opponents";
const initial = (duration = 120): FightState => ({
  phase: "ready",
  remaining: duration,
  duration,
  hits: 0,
  punches: 0,
  combo: 0,
  bestCombo: 0,
  score: 0,
  health: 100,
  opponentHealth: 100,
  lastHit: "",
  lastHitAt: 0,
  result: "",
  guarding: [false, false],
  blocks: 0,
  trackingHint: "",
});
function App() {
  const host = useRef<HTMLDivElement>(null),
    video = useRef<HTMLVideoElement>(null),
    arena = useRef<Arena | null>(null),
    fight = useRef(initial()),
    audio = useRef<FightAudio | null>(null),
    modelVersion = useRef(0),
    body = useRef<BodyFrame>({ reference: null, timestampMs: 0, status: 'unavailable' }),
    store = useRef(createHandTrackingStore()).current;
  const [, render] = useState(0),
    [modelLoading, setModelLoading] = useState(true),
    [choosing, setChoosing] = useState(false),
    [opponentId, setOpponentId] = useState<OpponentId>(DEFAULT_OPPONENT),
    [cameraOn, setCameraOn] = useState(false),
    [settings, setSettings] = useState(false),
    [help, setHelp] = useState(false),
    [duration, setDuration] = useState(120),
    [sensitivity, setSensitivity] = useState(1),
    [sound, setSound] = useState(true),
    [error, setError] = useState("");
  const controls = useRef({ cameraOn, sensitivity });
  controls.current = { cameraOn, sensitivity };
  const snapshot = useHandTrackingSnapshot(store);
  useHandTracking({ enabled: cameraOn, store, videoRef: video });
  useBodyTracking(cameraOn && snapshot.status === 'running', video, body);
  useEffect(() => {
    if (!host.current) return;
    audio.current = new FightAudio();
    try {
      arena.current = createArena(host.current, {
        store,
        body: () => body.current,
        read: () => fight.current,
        onChange: () => render((x) => x + 1),
        onSound: (p, b) => audio.current?.hit(p, b),
        onVoice: (event) => audio.current?.voice(event),
        cameraEnabled: () => controls.current.cameraOn,
        sensitivity: () => controls.current.sensitivity,
        onError: setError,
      });
      const version = ++modelVersion.current;
      void arena.current.ready.finally(() => {
        if (version === modelVersion.current) setModelLoading(false);
      }).catch(() => {});
    } catch {
      setError("3D 场景启动失败，请使用支持 WebGL 2 的浏览器并开启硬件加速。");
    }
    return () => {
      modelVersion.current++;
      arena.current?.dispose();
      audio.current?.dispose();
    };
  }, [store]);
  useEffect(() => {
    audio.current?.setEnabled(sound);
  }, [sound]);
  useEffect(() => {
    // Start decoding voice clips on the first gesture so the round intro is ready.
    const warm = () => {
      audio.current?.unlock();
      window.removeEventListener("pointerdown", warm);
      window.removeEventListener("keydown", warm);
    };
    window.addEventListener("pointerdown", warm);
    window.addEventListener("keydown", warm);
    return () => {
      window.removeEventListener("pointerdown", warm);
      window.removeEventListener("keydown", warm);
    };
  }, []);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && fight.current.phase === "playing") {
        fight.current.phase = "paused";
        audio.current?.pauseMusic();
        render((x) => x + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (!settings && !help) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettings(false);
        setHelp(false);
      }
      if (event.key === "Tab") {
        const nodes = document.querySelectorAll<HTMLElement>(
          ".hotspots button:not(:disabled)",
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [settings, help]);
  const s = fight.current;
  function selectOpponent(id: OpponentId) {
    if ((id === opponentId && !error) || !arena.current) return;
    const version = ++modelVersion.current;
    setModelLoading(true); setError('');
    setOpponentId(id);
    void arena.current.selectOpponent(id).catch(() => {
      if (version === modelVersion.current) setError('角色模型加载失败，已保留卡通陪练，可重新选择角色重试。');
    }).finally(() => {
      if (version === modelVersion.current) setModelLoading(false);
    });
  }
  function chooseOpponent() {
    audio.current?.stopMusic();
    fight.current = initial(duration);
    arena.current?.reset();
    arena.current?.setPreview(true);
    setChoosing(true);
  }
  function start() {
    if (!arena.current || modelLoading) return;
    setChoosing(false);
    arena.current.setPreview(false);
    audio.current?.unlock();
    audio.current?.startMusic();
    audio.current?.bell();
    fight.current = { ...initial(duration), phase: "playing" };
    arena.current.reset();
    render((x) => x + 1);
  }
  function pause() {
    if (s.phase === "playing") {
      s.phase = "paused";
      audio.current?.pauseMusic();
    } else if (s.phase === "paused") {
      s.phase = "playing";
      audio.current?.resumeMusic();
    }
    render((x) => x + 1);
  }
  function openHelp() {
    if (s.phase === "playing") {
      s.phase = "paused";
      audio.current?.pauseMusic();
    }
    setHelp(true);
  }
  function openSettings() {
    if (s.phase === "playing") {
      s.phase = "paused";
      audio.current?.pauseMusic();
      render((x) => x + 1);
    }
    setSettings(true);
  }
  function toggleCamera() {
    if (cameraOn) {
      setCameraOn(false);
      store.setStatus("idle");
    } else {
      store.reset();
      setCameraOn(true);
    }
  }
  const trackingText =
    snapshot.status === "requesting"
      ? "等待摄像头授权"
      : snapshot.status === "loading"
        ? "正在载入手部模型"
        : snapshot.status === "error"
          ? "摄像头未就绪"
          : snapshot.status === "running"
            ? `${snapshot.handCount} / 2 双手识别 · ${snapshot.fps} FPS`
            : "摄像头未开启";
  const cameraError = snapshot.error?.includes("permission")
    ? "摄像头权限被拒绝，请在浏览器设置中允许后重试。"
    : snapshot.error?.includes("No camera")
      ? "没有找到摄像头，可以先使用键盘练习。"
      : snapshot.error?.includes("in use")
        ? "摄像头被其他应用占用。"
        : snapshot.error
          ? "手部追踪启动失败，请关闭后重试。"
          : "";
  return (
    <main className="app">
      <div ref={host} className={`scene ${choosing ? "selecting" : ""}`} aria-label="第一人称拳击场景" />
      <CanvasHUD modelLoading={modelLoading} choosing={choosing} opponent={getOpponent(opponentId)} selectOpponent={selectOpponent} chooseOpponent={chooseOpponent} fight={s} cameraOn={cameraOn} trackingText={trackingText}
        error={error || (cameraOn ? cameraError : "")}
        settings={settings} help={help} duration={duration} sensitivity={sensitivity} sound={sound}
        start={start} pause={pause} openHelp={openHelp} openSettings={openSettings}
        toggleCamera={toggleCamera} close={() => { setSettings(false); setHelp(false); }}
        home={() => { audio.current?.stopMusic(); setChoosing(false); arena.current?.setPreview(false); fight.current = initial(duration); arena.current?.reset(); render(x => x + 1); }}
        setDuration={setDuration} setSensitivity={setSensitivity} setSound={setSound}
        punch={side => arena.current?.punch(side)} block={v => arena.current?.block(v)} />
      <div className={`camera-preview ${cameraOn ? "enabled" : ""}`} style={{ visibility: settings || help || choosing ? "hidden" : "visible" }}>
        <video ref={video} muted playsInline autoPlay />
        {cameraOn && <><span>{s.trackingHint || trackingText}</span><button onClick={toggleCamera} aria-label="关闭摄像头">×</button></>}
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
