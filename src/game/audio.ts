import { VoiceBank, type VoiceEvent } from "./voice";

// KOF '97 background loop, copied from kof-ai/public/assets/music/menu.m4a.
const BGM_URL = "/audio/music/kof97-bgm.m4a";

export class FightAudio {
  private context?: AudioContext;
  private voices?: VoiceBank;
  private bgm?: HTMLAudioElement;
  private wantBgm = false;
  enabled = true;
  unlock() {
    this.context ??= new AudioContext();
    this.voices ??= new VoiceBank(this.context);
    void this.voices.preload();
    void this.context.resume();
  }
  startMusic() {
    this.wantBgm = true;
    if (!this.enabled) return;
    this.bgm ??= this.createBgm();
    void this.bgm.play().catch(() => {});
  }
  stopMusic() {
    this.wantBgm = false;
    this.bgm?.pause();
    if (this.bgm) this.bgm.currentTime = 0;
  }
  pauseMusic() {
    this.bgm?.pause();
  }
  resumeMusic() {
    if (this.wantBgm && this.enabled) void this.bgm?.play().catch(() => {});
  }
  setEnabled(value: boolean) {
    this.enabled = value;
    if (value) this.resumeMusic();
    else this.bgm?.pause();
  }
  private createBgm() {
    const bgm = new Audio(BGM_URL);
    bgm.loop = true;
    bgm.preload = "auto";
    bgm.volume = 0.32;
    return bgm;
  }
  voice(event: VoiceEvent) {
    if (!this.enabled) return;
    this.voices?.play(event);
  }
  hit(power: number, blocked = false) {
    if (!this.enabled || !this.context) return;
    const ctx = this.context,
      t = ctx.currentTime;
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(blocked ? 180 : 100, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.12);
    g.gain.setValueAtTime(0.1 + power * 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.17);
  }
  bell() {
    if (!this.enabled || !this.context) return;
    const ctx = this.context;
    for (const f of [660, 1040]) {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.07, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 1);
    }
  }
  dispose() {
    this.stopMusic();
    this.bgm = undefined;
    this.voices?.dispose();
    void this.context?.close();
  }
}
