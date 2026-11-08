import { useEffect } from 'react';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { HAND_WASM_LOCAL, HAND_ASSET_BASE } from './handAssets';
import { bodyReference, type BodyFrame } from './bodyReference';

// Shares the existing video stream. No second camera request and no per-frame React updates.
export function useBodyTracking(enabled: boolean, videoRef: { readonly current: HTMLVideoElement | null }, frame: { current: BodyFrame }) {
  useEffect(() => {
    if (!enabled) { frame.current = { reference: null, timestampMs: 0, status: 'unavailable' }; return; }
    let cancelled = false, raf = 0, task: PoseLandmarker | undefined;
    let lastAt = -Infinity, lastVideoTime = -1, interval = 100;
    frame.current = { reference: null, timestampMs: 0, status: 'loading' };
    const loop = () => {
      if (cancelled) return;
      raf = requestAnimationFrame(loop);
      const video = videoRef.current, now = performance.now();
      if (!task || !video || video.readyState < 2 || !video.videoWidth || now - lastAt < interval || video.currentTime === lastVideoTime) return;
      lastAt = now; lastVideoTime = video.currentTime;
      try {
        const result = task.detectForVideo(video, now);
        const reference = bodyReference(result.landmarks[0] ?? []);
        const previous = frame.current.reference;
        if (reference && previous && now - frame.current.timestampMs < 450) {
          for (const key of ['centerX', 'noseY', 'shoulderY', 'width'] as const) reference[key] = previous[key] * .55 + reference[key] * .45;
        }
        frame.current = { reference, timestampMs: now, status: 'running' };
        interval = performance.now() - now > 40 ? 200 : 100;
      } catch {
        frame.current = { reference: null, timestampMs: now, status: 'unavailable' };
        interval = 500;
      }
    };
    void (async () => {
      try {
        const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
        const files = await FilesetResolver.forVisionTasks(HAND_WASM_LOCAL);
        if (cancelled) return;
        const options = { runningMode: 'VIDEO' as const, numPoses: 1, outputSegmentationMasks: false };
        try {
          task = await PoseLandmarker.createFromOptions(files, { ...options, baseOptions: { modelAssetPath: `${HAND_ASSET_BASE}/pose_landmarker_lite.task`, delegate: 'GPU' } });
        } catch {
          if (cancelled) return;
          task = await PoseLandmarker.createFromOptions(files, { ...options, baseOptions: { modelAssetPath: `${HAND_ASSET_BASE}/pose_landmarker_lite.task`, delegate: 'CPU' } });
        }
        if (cancelled) { task.close(); return; }
        raf = requestAnimationFrame(loop);
      } catch {
        if (!cancelled) frame.current = { reference: null, timestampMs: 0, status: 'unavailable' };
      }
    })();
    return () => {
      cancelled = true; cancelAnimationFrame(raf); task?.close();
      frame.current = { reference: null, timestampMs: 0, status: 'unavailable' };
    };
  }, [enabled, videoRef, frame]);
}
