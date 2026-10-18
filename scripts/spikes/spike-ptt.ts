// Spike D: global Right Ctrl + Space hold via uiohook-napi. Logs only keycodes 29, 57, 3613 (T-01-04).
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { uIOhook } from "uiohook-napi";
import { createPttState } from "../../apps/server/src/voice/ptt-state";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "..", ".planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes");
mkdirSync(dir, { recursive: true });
const file = join(dir, "D.log");
const WATCHED = new Set([29, 57, 3613]); // Left Ctrl, Space, Right Ctrl

function log(line: string): void {
  const l = `${new Date().toISOString()} ${line}`;
  appendFileSync(file, l + "\n");
  console.log(l);
}

const ptt = createPttState({ onChange: (s) => log(`PTT ${s}`) });

uIOhook.on("keydown", (e) => {
  if (!WATCHED.has(e.keycode)) return;
  log(`raw down ${e.keycode}`);
  ptt.handle("down", e.keycode);
});
uIOhook.on("keyup", (e) => {
  if (!WATCHED.has(e.keycode)) return;
  log(`raw up ${e.keycode}`);
  ptt.handle("up", e.keycode);
});

console.log(`Spike D running. Logging to ${file}
Run each order and note it in the log by pausing between runs:
  1. Hold Right Ctrl + Space, release Space first
  2. Hold Right Ctrl + Space, release Right Ctrl first
  3. Hold Left Ctrl + Space (must NOT trigger PTT start)
  4. Focus the spike page text input (http://127.0.0.1:8788), hold Right Ctrl + Space, see whether a space leaks into the input
Expected: exactly one "PTT start" and one "PTT end" per Right Ctrl hold. Ctrl+C to quit.`);

function shutdown(): void {
  ptt.reset();
  uIOhook.stop();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

uIOhook.start();
