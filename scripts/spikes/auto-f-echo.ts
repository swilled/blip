// Automated Spike F (echo): does the open microphone hear Blip's own speech?
// Plays a known phrase through speechSynthesis while webkitSpeechRecognition listens, then logs only the word
// overlap with the phrase (never the recognized text, which can include ambient room speech).
// Run: npx tsx scripts/spikes/auto-f-echo.ts   (audible; uses the real mic and speakers; needs network)
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const here = dirname(fileURLToPath(import.meta.url));
const spikesDir = join(here, "..", "..", ".planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes");
mkdirSync(spikesDir, { recursive: true });
const log = (line: string) => {
  console.log(`[F-auto] ${line}`);
  appendFileSync(join(spikesDir, "F-auto.log"), `${new Date().toISOString()} ${line}\n`);
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

const PORT = 9335;
const profile = mkdtempSync(join(tmpdir(), "blip-spike-f-"));
const procs: ChildProcess[] = [];
const PHRASE = "please say submit survey to confirm the booking now";

const script = `new Promise((resolve) => {
  const phrase = ${JSON.stringify(PHRASE)};
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  const out = { gotResult: false, matchedWords: 0, phraseWords: phrase.split(' ').length, error: null, speakEnded: false };
  const rec = new R(); rec.lang = 'en-US'; rec.interimResults = false; rec.continuous = true;
  let heard = '';
  rec.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) heard += ' ' + e.results[i][0].transcript.toLowerCase(); out.gotResult = true; };
  rec.onerror = (e) => { out.error = e.error; };
  const finish = () => {
    const words = new Set(heard.split(/[^a-z]+/).filter(Boolean));
    out.matchedWords = phrase.split(' ').filter(w => words.has(w)).length;
    out.heardChars = heard.length;
    try { rec.abort(); } catch {}
    resolve(out);
  };
  rec.onend = () => {};
  try { rec.start(); } catch (e) { out.error = String(e); return resolve(out); }
  setTimeout(() => {
    const u = new SpeechSynthesisUtterance(phrase);
    u.onend = () => { out.speakEnded = true; setTimeout(finish, 3500); };
    u.onerror = () => { setTimeout(finish, 500); };
    speechSynthesis.speak(u);
  }, 1500);
  setTimeout(finish, 25000);
})`;

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
    return r.result?.result?.value ?? r.result?.exceptionDetails;
  }
  close() {
    this.ws.close();
  }
}

try {
  procs.push(spawn("npx", ["tsx", "scripts/spikes/spike-server.ts"], { stdio: "ignore", shell: true, cwd: join(here, "..", "..") }));
  for (let i = 0; i < 40; i++) {
    try {
      await fetch("http://127.0.0.1:8788/");
      break;
    } catch {
      await sleep(250);
    }
  }
  procs.push(
    spawn(chrome, [`--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*", "--use-fake-ui-for-media-stream", "--app=http://127.0.0.1:8788/", "--no-first-run", "--no-default-browser-check", "--window-size=420,500", "--window-position=40,40"], { stdio: "ignore" }),
  );
  let cdp: Cdp | null = null;
  for (let i = 0; i < 40 && !cdp; i++) {
    try {
      const ts = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()) as Array<{ url: string; webSocketDebuggerUrl: string }>;
      const t = ts.find((x) => x.url.startsWith("http://127.0.0.1:8788"));
      if (t) cdp = await Cdp.open(t.webSocketDebuggerUrl);
    } catch {
      await sleep(250);
    }
  }
  if (!cdp) throw new Error("could not attach to the test window");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.bringToFront");
  await sleep(1000);
  const r = await cdp.eval(script);
  log(`result=${JSON.stringify(r)}`);
  if (r && typeof r === "object" && "matchedWords" in r) {
    const x = r as { matchedWords: number; phraseWords: number; error: string | null; gotResult: boolean };
    log(
      x.matchedWords >= 3
        ? `RESULT F: ECHO HEARD (${x.matchedWords}/${x.phraseWords} words of Blip's own phrase were recognized). Open mic during speech WOULD pick up Blip on these speakers.`
        : `RESULT F: echo not detected (${x.matchedWords}/${x.phraseWords} words matched; gotResult=${x.gotResult}, error=${x.error}). Inconclusive if volume was low or recognition returned nothing.`,
    );
  }
  cdp.close();
} catch (e) {
  log(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
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
