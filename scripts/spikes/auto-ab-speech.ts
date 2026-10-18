// Automated Spikes A and B (best effort, no human): drives a real Chrome app window over CDP.
//  - Generates a speech wav with Windows SAPI and feeds it to Chrome as a fake microphone.
//  - A: webkitSpeechRecognition in the app window when (1) focused, (2) another window has focus, (3) fully covered.
//  - B: speechSynthesis voices and whether onend fires (short audible phrase).
// Run: npx tsx scripts/spikes/auto-ab-speech.ts      (needs network for Chrome's cloud speech recognition)
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const here = dirname(fileURLToPath(import.meta.url));
const spikesDir = join(here, "..", "..", ".planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes");
mkdirSync(spikesDir, { recursive: true });
const log = (name: string, line: string) => {
  const l = `${new Date().toISOString()} ${line}`;
  console.log(`[${name}] ${line}`);
  appendFileSync(join(spikesDir, `${name}.log`), l + "\n");
};

const chrome = [
  join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
  join(process.env.ProgramFiles ?? "", "Google/Chrome/Application/chrome.exe"),
].find((p) => existsSync(p));
if (!chrome) {
  console.log("SKIPPED: Chrome not found");
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), "blip-spike-ab-"));
const wav = join(profile, "phrase.wav");
// 1) speech wav from SAPI (16-bit 16 kHz mono PCM)
execFileSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono); $s.SetOutputToWaveFile('${wav}', $fmt); $s.Speak('what is here. read the form. submit survey.'); $s.Dispose()`,
  ],
  { stdio: "ignore" },
);

const PORT = 9333;
const procs: ChildProcess[] = [];
const launch = (args: string[]) => {
  const p = spawn(chrome, args, { stdio: "ignore" });
  procs.push(p);
  return p;
};
const baseArgs = [
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${PORT}`,
  "--remote-allow-origins=*",
  "--no-first-run",
  "--no-default-browser-check",
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  `--use-file-for-fake-audio-capture=${wav}`,
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function targets(): Promise<Array<{ id: string; title: string; url: string; webSocketDebuggerUrl: string }>> {
  for (let i = 0; i < 40; i++) {
    try {
      return (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()) as never;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("DevTools endpoint did not come up");
}

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
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.text + " " + (r.result.exceptionDetails.exception?.description ?? "") };
    return r.result?.result?.value;
  }
  close() {
    this.ws.close();
  }
}

const sttScript = `new Promise((resolve) => {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) return resolve({ error: "no SpeechRecognition" });
  const rec = new R(); rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
  const out = { visibility: document.visibilityState, hasFocus: document.hasFocus(), gotResult: false, transcriptChars: 0, error: null, ended: false };
  const t = setTimeout(() => { try { rec.abort(); } catch {} resolve({ ...out, error: out.error || "timeout 12s" }); }, 12000);
  rec.onresult = (e) => { out.transcriptChars = e.results[0][0].transcript.length; out.gotResult = true; };
  rec.onerror = (e) => { out.error = e.error; };
  rec.onend = () => { clearTimeout(t); out.ended = true; resolve(out); };
  try { rec.start(); } catch (e) { clearTimeout(t); resolve({ ...out, error: String(e) }); }
})`;

const ttsScript = `new Promise((resolve) => {
  const out = { voices: speechSynthesis.getVoices().map(v => v.name + (v.localService ? " (local)" : " (network)")), startedMs: null, endedMs: null, error: null };
  const go = () => {
    const u = new SpeechSynthesisUtterance("Blip speech test.");
    const t0 = performance.now();
    u.onstart = () => { out.startedMs = Math.round(performance.now() - t0); };
    u.onend = () => { out.endedMs = Math.round(performance.now() - t0); clearTimeout(to); resolve(out); };
    u.onerror = (e) => { out.error = e.error; clearTimeout(to); resolve(out); };
    const to = setTimeout(() => { out.error = out.error || "onend never fired within 8s"; resolve(out); }, 8000);
    speechSynthesis.speak(u);
  };
  if (speechSynthesis.getVoices().length) go(); else speechSynthesis.onvoiceschanged = () => { out.voices = speechSynthesis.getVoices().map(v => v.name + (v.localService ? " (local)" : " (network)")); go(); };
})`;

try {
  // Spike page is served by scripts/spikes/spike-server.ts; reuse it as a secure 127.0.0.1 origin.
  const server = spawn(process.execPath, ["--import", "tsx", "scripts/spikes/spike-server.ts"], { stdio: "ignore", cwd: join(here, "..", "..") });
  procs.push(server);
  for (let i = 0; i < 40; i++) {
    try {
      await fetch("http://127.0.0.1:8788/");
      break;
    } catch {
      await sleep(250);
    }
  }

  launch([...baseArgs, "--app=http://127.0.0.1:8788/", "--window-size=420,600", "--window-position=40,40"]);
  const ts = await targets();
  const page = ts.find((t) => t.url.startsWith("http://127.0.0.1:8788")) ?? ts[0]!;
  const cdp = await Cdp.open(page.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");
  await sleep(1000);

  // B: speech synthesis
  const tts = await cdp.eval(ttsScript);
  log("B-auto", `speechSynthesis -> ${JSON.stringify(tts)}`);

  // A case 1: window focused
  await cdp.send("Page.bringToFront");
  await sleep(500);
  const a1 = await cdp.eval(sttScript);
  log("A-auto", `case1 focused -> ${JSON.stringify(a1)}`);

  // A case 2: another window has focus, app window still visible
  launch([`--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*", "--app=data:text/html,<title>other</title>other", "--window-size=300,200", "--window-position=900,600"]);
  await sleep(2000);
  const a2 = await cdp.eval(sttScript);
  log("A-auto", `case2 other-window-focused -> ${JSON.stringify(a2)}`);

  // A case 3: fully covered by a maximized window
  launch([`--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*", "--app=data:text/html,<title>cover</title>cover", "--start-maximized"]);
  await sleep(2500);
  const a3 = await cdp.eval(sttScript);
  log("A-auto", `case3 fully-covered -> ${JSON.stringify(a3)}`);
  cdp.close();
} catch (e) {
  console.log("ERROR:", e instanceof Error ? e.message : e);
} finally {
  for (const p of procs) {
    try {
      execFileSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      /* gone */
    }
  }
  await sleep(1000);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(0);
