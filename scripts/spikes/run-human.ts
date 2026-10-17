// One-command guided spike session for the person at the machine.
//   npx tsx scripts/spikes/run-human.ts
// Starts the spike log server, opens the Blip window (pinned on top), shows live Right Ctrl + Space events,
// and prints the checklist. Results are written to .planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes/*.log
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { uIOhook } from "uiohook-napi";
import { createPttState } from "../../apps/server/src/voice/ptt-state";
import { pinTopmost } from "../../apps/server/src/voice/pin-topmost";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const chrome = [
  join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
  join(process.env.ProgramFiles ?? "", "Google/Chrome/Application/chrome.exe"),
].find((p) => existsSync(p));
if (!chrome) {
  console.log("Chrome was not found. Install Chrome and run this again.");
  process.exit(1);
}

const procs: ChildProcess[] = [];
function cleanup(): void {
  try {
    uIOhook.stop();
  } catch {
    /* not started */
  }
  for (const p of procs) {
    try {
      execFileSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      /* gone */
    }
  }
}
process.on("SIGINT", () => {
  console.log("\nStopping. Tell Claude: done.");
  cleanup();
  process.exit(0);
});

// 1) log server
procs.push(spawn(process.execPath, ["--import", "tsx", "scripts/spikes/spike-server.ts"], { stdio: "ignore", cwd: root }));
for (let i = 0; i < 40; i++) {
  try {
    await fetch("http://127.0.0.1:8788/");
    break;
  } catch {
    await sleep(250);
  }
}

// 2) Blip window (persistent profile so the mic permission is remembered)
procs.push(
  spawn(
    chrome,
    [`--user-data-dir=${join(root, ".chrome-profile")}`, "--app=http://127.0.0.1:8788/", "--no-first-run", "--no-default-browser-check", "--window-size=460,820", "--window-position=40,40"],
    { stdio: "ignore" },
  ),
);

// 3) pin on top (Spike E)
const pin = await pinTopmost("Blip", { timeoutMs: 15000 });
const pinNote = pin.ok ? `pinned on top: window "${pin.title}"` : `could not pin (${pin.error ?? "unknown"})`;
appendFileSync(join(root, ".planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes/E.log"), `${new Date().toISOString()} pinTopmost("Blip") exact -> ${JSON.stringify(pin)}
`);

// 4) live push-to-talk hook (Spike D)
const WATCHED = new Set<number>([29, 57, 3613]);
const ptt = createPttState({
  onChange: (s) => console.log(s === "start" ? "  >> HOLD DETECTED: push-to-talk START" : "  >> push-to-talk END"),
});
uIOhook.on("keydown", (e) => WATCHED.has(e.keycode) && ptt.handle("down", e.keycode));
uIOhook.on("keyup", (e) => WATCHED.has(e.keycode) && ptt.handle("up", e.keycode));
uIOhook.start();

console.log(`
==================== BLIP SPIKE SESSION ====================
The "Blip" window is open (${pinNote}). Allow the microphone if Chrome asks.
Test with the same speakers and mic you will use for the demo.

IN THE BLIP WINDOW  (click Start spike first)
  A  "Hold to listen" -> say "what is here" while the button is held.
       Do it 3 times: (1) window focused, (2) click on another window first,
       (3) cover the Blip window with a maximized window.
  B  "Speak 20 words"  -> you should hear Blip speak and see an "ended" line.
  F  "Barge-in test (mic open during speech)", then speak over it.
     Then "Barge-in test (mic gated...)".  Does Blip hear ITSELF? (note yes/no)
  C2 "Run live region test" (only matters if NVDA is running; skip otherwise).

IN THIS TERMINAL
  D  Hold Right Ctrl + Space and release. You should see HOLD DETECTED / END.
     Try releasing Space first, then Right Ctrl first. Try Left Ctrl + Space
     (must show nothing). Click into a text field first and watch whether a
     space gets typed while you hold.
  E  The Blip window should stay above other windows (try maximizing Chrome).

Press Ctrl+C when finished, then tell Claude "done". Results are saved for you.
============================================================
`);

await new Promise(() => {});
