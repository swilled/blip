// Real Chrome AudioWorklet -> local CPU model -> finalized voice frame. Synthetic microphone only.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { startServer } from "../apps/server/src/server";
import { discoverLocalWhisper } from "../apps/server/src/voice/local-whisper";
import { encodeWav } from "../apps/voice/src/recorded-stt";
import { syntheticSpeech } from "./check-local-stt";
import { resolveBrowser } from "./browser";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = await mkdtemp(path.join(root, ".local-stt/browser-check-"));
const pcm = await syntheticSpeech("read the form");
const samples = new Float32Array(pcm.length / 2 + 16000);
for (let n = 0; n < pcm.length / 2; n++) samples[n + 4000] = pcm.readInt16LE(n * 2) / 32768;
const fixture = path.join(profile, "synthetic.wav");
await writeFile(fixture, encodeWav([samples], 16000));
const transcribeAudio = await discoverLocalWhisper();
if (!transcribeAudio) throw new Error("Install local STT first.");
const received: Array<{ source: string; text: string }> = [];
const server = await startServer({ port: 0, transcribeAudio, dialogueRunner: true,
  staticRoots: [{ urlPrefix: "/voice", dir: path.join(root, "apps/voice/dist") }],
  handlersFactory: () => ({ utterance: ({ message }) => { if (message.type === "utterance") received.push(message.payload); } }),
});
const origin = `http://127.0.0.1:${server.port}`;
const browser = spawn(resolveBrowser(), ["--headless=new", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", "--no-first-run", "--no-default-browser-check", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${fixture}%noloop`, `${origin}/voice/`], { windowsHide: true, stdio: "ignore" });
let ws: WebSocket | undefined;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
try {
  let port: number | undefined;
  for (let n = 0; n < 80 && !port; n++) {
    try { port = Number((await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0]); } catch { await sleep(100); }
  }
  if (!port) throw new Error("Test Chrome did not start.");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json() as Array<{ url: string; webSocketDebuggerUrl: string }>;
  const tab = targets.find(t => t.url === `${origin}/voice/`);
  if (!tab) throw new Error("Test voice tab is missing.");
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => { ws!.once("open", resolve); ws!.once("error", reject); });
  let next = 0;
  const waiting = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  ws.on("message", data => {
    const result = JSON.parse(String(data)), item = waiting.get(result.id);
    if (!item) return; clearTimeout(item.timer); waiting.delete(result.id);
    result.error ? item.reject(new Error(result.error.message)) : item.resolve(result.result);
  });
  const send = (method: string, params: object = {}): Promise<any> => new Promise((resolve, reject) => {
    const id = ++next;
    waiting.set(id, { resolve, reject, timer: setTimeout(() => { waiting.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 5000) });
    ws!.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression: string) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? "Browser evaluation failed.");
    return result.result?.value;
  };
  for (let n = 0; n < 60; n++) {
    if (server.session.voiceConnected && await evaluate("Boolean(document.getElementById('start-gate'))")) break;
    await sleep(100);
  }
  await evaluate("window.SpeechRecognition = window.webkitSpeechRecognition = class { constructor() { throw Error('Chrome speech must not be used'); } }");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  if (!await evaluate("!document.getElementById('start-gate')")) throw new Error("Start gate did not open.");
  await evaluate("document.getElementById('hold-to-talk').focus()");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  let listening = false;
  for (let n = 0; n < 60; n++) {
    if (await evaluate("document.getElementById('status').dataset.state === 'listening'")) { listening = true; break; }
    await sleep(100);
  }
  if (!listening) throw new Error(`Microphone not ready: ${await evaluate("document.getElementById('status-hint').textContent")}`);
  await sleep(3500);
  if (received.length) throw new Error("Transcribed before release.");
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  for (let n = 0; n < 100 && received.length === 0; n++) await sleep(100);
  if (received.length !== 1 || received[0].source !== "voice" || !/read the form/i.test(received[0].text) || "sttConfidence" in received[0]) {
    throw new Error(`No complete finalized command: ${JSON.stringify(received)}; ${await evaluate("document.getElementById('status-hint').textContent")}`);
  }
  console.log(JSON.stringify({ syntheticMicrophone: true, realAudioWorklet: true, chromeSpeechDisabled: true, nativeWhisper: true, finalizedAfterRelease: received[0], passed: true }));
  await send("Browser.close").catch(() => {});
} finally {
  ws?.close(); browser.kill(); await server.close();
  // This unique test profile is the only recursive target; validate its absolute workspace boundary.
  if (profile.startsWith(path.join(root, ".local-stt/browser-check-"))) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
}
