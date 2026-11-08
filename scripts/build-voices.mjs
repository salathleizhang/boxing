import { readFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = join(root, "src/game/voice-clips.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const sourceDir = resolve(root, config.sourceDir ?? ".voice-src");
const outDir = join(root, "public/audio/voice");

await mkdir(outDir, { recursive: true });

let failed = 0;
for (const clip of config.clips) {
  const source = join(sourceDir, clip.source);
  const output = join(outDir, `${clip.file}.mp3`);
  const duration = clip.end - clip.start;
  if (!(duration > 0.15)) {
    console.error(`SKIP ${clip.id}: end must be greater than start`);
    failed++;
    continue;
  }
  const fade = Math.min(0.06, duration * 0.2);
  const fadeOutAt = Math.max(0, duration - fade).toFixed(3);
  const filter = [
    "loudnorm=I=-16:TP=-2:LRA=11",
    // loudnorm's own limiter is approximate and MP3 encoding can overshoot.
    "alimiter=limit=0.7:level=disabled",
    `afade=t=in:st=0:d=${fade.toFixed(3)}`,
    `afade=t=out:st=${fadeOutAt}:d=${fade.toFixed(3)}`,
  ].join(",");
  try {
    await run("ffmpeg", [
      "-y",
      "-ss", clip.start.toFixed(3),
      "-t", duration.toFixed(3),
      "-i", source,
      "-vn",
      "-af", filter,
      "-ac", "1",
      "-ar", "44100",
      "-codec:a", "libmp3lame",
      "-b:a", "96k",
      output,
    ]);
    const { stdout } = await run("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration,size",
      "-of", "default=nw=1",
      output,
    ]);
    const seconds = stdout.match(/duration=([\d.]+)/)?.[1] ?? "?";
    const bytes = stdout.match(/size=(\d+)/)?.[1] ?? "?";
    console.log(
      `OK  ${clip.id.padEnd(18)} ${seconds}s  ${Math.round(Number(bytes) / 1024)}KB  "${clip.text}"`,
    );
  } catch (error) {
    console.error(`FAIL ${clip.id}: ${error.stderr?.trim() || error.message}`);
    failed++;
  }
}

if (failed) {
  console.error(`\n${failed} clip(s) failed`);
  process.exit(1);
}
console.log(`\n${config.clips.length} clip(s) written to public/audio/voice/`);
