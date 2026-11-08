import clipsJson from "./voice-clips.json";

// Voice lines only react to combat: your punch landing, or you taking a hit.
export type VoiceEvent = "hit" | "hurt" | "block" | "guard";

export interface VoiceClip {
  id: string;
  file: string;
  text: string;
  events: VoiceEvent[];
  gain: number;
  rate: number;
}

interface RawClip {
  id: string;
  file: string;
  text: string;
  events: string[];
  gain?: number;
  rate?: number;
}

export const VOICE_CLIPS: VoiceClip[] = (clipsJson.clips as RawClip[]).map(
  (clip) => ({
    id: clip.id,
    file: clip.file.endsWith(".mp3") ? clip.file : `${clip.file}.mp3`,
    text: clip.text,
    events: clip.events as VoiceEvent[],
    gain: clip.gain ?? 1,
    rate: clip.rate ?? 1,
  }),
);

// Minimum spacing per event so a flurry of punches does not stack voice lines.
const COOLDOWN_MS: Record<VoiceEvent, number> = {
  hit: 900,
  hurt: 1200,
  block: 900,
  guard: 900,
};

export class VoiceBank {
  private buffers = new Map<string, AudioBuffer>();
  private readyUntil: Partial<Record<VoiceEvent, number>> = {};
  private lastId = "";
  private loading?: Promise<void>;

  constructor(
    private readonly ctx: AudioContext,
    private readonly base = "/audio/voice/",
  ) {}

  preload(): Promise<void> {
    this.loading ??= Promise.all(
      VOICE_CLIPS.map(async (clip) => {
        try {
          const response = await fetch(this.base + clip.file);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const buffer = await this.ctx.decodeAudioData(
            await response.arrayBuffer(),
          );
          this.buffers.set(clip.id, buffer);
        } catch (error) {
          console.warn("Voice clip failed to load:", clip.file, error);
        }
      }),
    ).then(() => undefined);
    return this.loading;
  }

  play(event: VoiceEvent) {
    const now = this.ctx.currentTime;
    if ((this.readyUntil[event] ?? 0) > now) return;
    const pool = VOICE_CLIPS.filter(
      (clip) => clip.events.includes(event) && this.buffers.has(clip.id),
    );
    if (!pool.length) return;
    // Avoid playing the same line twice in a row when alternatives exist.
    const fresh = pool.filter((clip) => clip.id !== this.lastId);
    const candidates = fresh.length ? fresh : pool;
    const clip = candidates[Math.floor(Math.random() * candidates.length)];
    const buffer = this.buffers.get(clip.id);
    if (!buffer) return;

    const source = this.ctx.createBufferSource(),
      gain = this.ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = clip.rate;
    gain.gain.value = clip.gain;
    source.connect(gain).connect(this.ctx.destination);
    source.start(now);

    this.lastId = clip.id;
    this.readyUntil[event] =
      now + Math.max(COOLDOWN_MS[event] / 1000, buffer.duration * 0.6);
  }

  dispose() {
    this.buffers.clear();
  }
}
