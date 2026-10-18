// Automated Spike D: injects Right Ctrl + Space with uiohook-napi into a Chrome window this script owns,
// and checks (1) the global hook sees the keys, (2) the PTT state machine emits start/end once per hold,
// (3) Left Ctrl + Space does not trigger it, (4) key repeat does not re-trigger, (5) whether a space leaks into the field.
// Safety: keys are only injected while the foreground window title contains "BlipSpikeD"; otherwise the run is skipped.
// Run: npx tsx scripts/spikes/auto-d-ptt.ts
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { uIOhook, UiohookKey } from "uiohook-napi";
import { createPttState } from "../../apps/server/src/voice/ptt-state";

const here = dirname(fileURLToPath(import.meta.url));
const spikesDir = join(here, "..", "..", ".planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes");
mkdirSync(spikesDir, { recursive: true });
const log = (line: string) => {
  console.log(`[D-auto] ${line}`);
  appendFileSync(join(spikesDir, "D-auto.log"), `${new Date().toISOString()} ${line}\n`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const chrome = [
  join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
  join(process.env.ProgramFiles ?? "", "Google/Chrome/Application/chrome.exe"),
].find((p) => existsSync(p));
if (!chrome) {
  console.log("SKIPPED: Chrome not found");
  process.exit(2);
}

const PORT = 9334;
const profile = mkdtempSync(join(tmpdir(), "blip-spike-d-"));
const html = "data:text/html,<title>BlipSpikeD</title><input id=i autofocus style='font-size:30px;width:90%'>";
const child = spawn(
  chrome,
  [`--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*", `--app=${html}`, "--no-first-run", "--no-default-browser-check", "--window-size=500,200", "--window-position=200,200"],
  { stdio: "ignore" },
);

const foregroundTitle = (): string => {
  const ps = `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);' -Name F -Namespace B; $sb = New-Object System.Text.StringBuilder 256; [void][B.F]::GetWindowText([B.F]::GetForegroundWindow(), $sb, 256); $sb.ToString()`;
  return execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim();
};

class Cdp {
  private id = 0;
  private pending = new Map<number, (v: any) => void>();
  constructor(private ws: WebSocket) {
    ws.on("message", (d) => {
      const m = JSON.parse(String(d));
      if (m.id && this.pending.has(m.id)) {
        this.pending.get(m.id)!(m);
        this.pending.delete(m.id);
      }
    });
  }
  static async open(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise((r, j) => {
      ws.once("open", r);
      ws.once("error", j);
    });
    return new Cdp(ws);
  }
  send(method: string, params: object = {}): Promise<any> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((r) => this.pending.set(id, r));
  }
  async eval(expression: string): Promise<any> {
    const r = await this.send("Runtime.evaluate", { expression, returnByValue: true });
    return r.result?.result?.value;
  }
  close() {
    this.ws.close();
  }
}

// PTT events seen through the real hook -> state machine
const events: string[] = [];
const rawSeen = new Set<number>();
const WATCHED = new Set<number>([UiohookKey.Ctrl, UiohookKey.CtrlRight, UiohookKey.Space]);
const ptt = createPttState({ onChange: (s) => events.push(s) });
uIOhook.on("keydown", (e) => {
  if (!WATCHED.has(e.keycode)) return;
  rawSeen.add(e.keycode);
  ptt.handle("down", e.keycode);
});
uIOhook.on("keyup", (e) => {
  if (!WATCHED.has(e.keycode)) return;
  ptt.handle("up", e.keycode);
});

let exitCode = 1;
try {
  let cdp: Cdp | null = null;
  for (let i = 0; i < 40 && !cdp; i++) {
    try {
      const ts = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()) as Array<{ url: string; webSocketDebuggerUrl: string }>;
      const t = ts.find((x) => x.url.startsWith("data:")) ?? ts[0];
      if (t) cdp = await Cdp.open(t.webSocketDebuggerUrl);
    } catch {
      await sleep(250);
    }
  }
  if (!cdp) throw new Error("could not attach to the test window");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.bringToFront");

  let foreground = false;
  for (let i = 0; i < 20; i++) {
    if (foregroundTitle().includes("BlipSpikeD")) {
      foreground = true;
      break;
    }
    await sleep(300);
  }
  if (!foreground) {
    log("SKIPPED: the test window never became the foreground window, so no keys were injected (safety rule).");
    exitCode = 2;
  } else {
    await cdp.eval("document.getElementById('i').focus(); document.getElementById('i').value=''");
    uIOhook.start();
    await sleep(800);

    const tap = (keys: number[], order: number[], holdMs = 150) => {
      for (const k of keys) uIOhook.keyToggle(k, "down");
      return sleep(holdMs).then(() => {
        for (const k of order) uIOhook.keyToggle(k, "up");
      });
    };
    const scenario = async (name: string, fn: () => Promise<void>, expectStarts: number) => {
      events.length = 0;
      rawSeen.clear();
      await cdp!.eval("document.getElementById('i').value=''");
      await fn();
      await sleep(400);
      const starts = events.filter((e) => e === "start").length;
      const ends = events.filter((e) => e === "end").length;
      const value = (await cdp!.eval("document.getElementById('i').value")) as string;
      const ok = starts === expectStarts && ends === expectStarts;
      log(`${name}: starts=${starts} ends=${ends} (expected ${expectStarts}) inputChars=${JSON.stringify(value.length)} spaceLeaked=${value.includes(" ")} hookSawKeycodes=[${[...rawSeen].join(",")}] -> ${ok ? "OK" : "UNEXPECTED"}`);
      return ok;
    };

    const results: boolean[] = [];
    results.push(await scenario("1 RightCtrl+Space, release Space first", () => tap([UiohookKey.CtrlRight, UiohookKey.Space], [UiohookKey.Space, UiohookKey.CtrlRight]), 1));
    results.push(await scenario("2 RightCtrl+Space, release RightCtrl first", () => tap([UiohookKey.CtrlRight, UiohookKey.Space], [UiohookKey.CtrlRight, UiohookKey.Space]), 1));
    results.push(await scenario("3 LeftCtrl+Space must NOT start", () => tap([UiohookKey.Ctrl, UiohookKey.Space], [UiohookKey.Space, UiohookKey.Ctrl]), 0));
    results.push(
      await scenario(
        "4 key repeat while held gives one start",
        async () => {
          uIOhook.keyToggle(UiohookKey.CtrlRight, "down");
          for (let i = 0; i < 6; i++) {
            uIOhook.keyToggle(UiohookKey.Space, "down");
            await sleep(40);
          }
          uIOhook.keyToggle(UiohookKey.Space, "up");
          uIOhook.keyToggle(UiohookKey.CtrlRight, "up");
        },
        1,
      ),
    );
    log(results.every(Boolean) ? "RESULT D: PASS (hook delivers keys, state machine behaves)" : "RESULT D: CHECK (see UNEXPECTED rows above; the hook may ignore injected keys)");
    exitCode = results.every(Boolean) ? 0 : 1;
  }
  cdp.close();
} catch (e) {
  log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  try {
    uIOhook.stop();
  } catch {
    /* not started */
  }
  try {
    execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    /* gone */
  }
  await sleep(800);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(exitCode);
