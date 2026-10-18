// Personal launcher behind `npm start`: runs Blip against the user's own browser profile.
// Same server setup as the demo (dialogue runner, grant-bound gate, global push-to-talk), but no
// dedicated profiles and no test pages. The extension is loaded once, by hand, into the user's
// normal Edge or Chrome profile; the voice window opens as an app window in that same profile.
//
//   npm start                 AGY brain (the signed-in Antigravity CLI)
//   npm start -- --brain=fake offline fake brain
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT, LOOPBACK_HOST, WS_PATH } from "@blip/protocol";
import { buildExtension } from "../apps/extension/build.js";
import { startServer, type RunningServer } from "../apps/server/src/server.js";
import { discoverLocalWhisper } from "../apps/server/src/voice/local-whisper";
import { startPttWire } from "../dev/mock-server/src/ptt-wire.js";
import { resolveBrowser } from "./browser.js";
import { buildVoiceClientForDemo, demoRepairCachePath, demoVoiceStaticRoot, readVoiceBuildId } from "./demo.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionDist = path.join(repoRoot, "apps", "extension", "dist");
const EXTENSION_HINT_MS = 15_000;

function parseBrain(args: string[]): "agy" | "fake" {
  const flag = args.find((arg) => arg.startsWith("--brain="));
  const brain = flag === undefined ? "agy" : flag.slice("--brain=".length);
  if (brain !== "agy" && brain !== "fake") throw new Error("--brain must be agy or fake");
  return brain;
}

async function ensureExtensionBuild(): Promise<void> {
  const socketUrl = `ws://${LOOPBACK_HOST}:${DEFAULT_PORT}${WS_PATH}`;
  try {
    if ((await readFile(path.join(extensionDist, "background.js"), "utf8")).includes(socketUrl)) return;
  } catch {
    // A fresh checkout has no extension build yet.
  }
  await buildExtension({ socketUrl });
}

async function main(): Promise<number> {
  const brain = parseBrain(process.argv.slice(2));
  try {
    const running = await fetch(`http://127.0.0.1:${DEFAULT_PORT}/healthz`, { signal: AbortSignal.timeout(500) });
    if (running.ok) {
      process.stderr.write("Blip is already running. Close its terminal (or the demo) before starting again.\n");
      return 1;
    }
  } catch {
    // Nothing is listening: continue.
  }

  await ensureExtensionBuild();
  await buildVoiceClientForDemo();
  const voiceBuildId = await readVoiceBuildId();
  const transcribeAudio = await discoverLocalWhisper();

  let server: RunningServer | undefined;
  let stopPtt: (() => Promise<void>) | undefined;
  const cleanup = async (): Promise<void> => {
    await stopPtt?.();
    await server?.close();
  };

  try {
    server = await startServer({
      port: DEFAULT_PORT,
      dev: true,
      brain,
      dialogueRunner: true,
      repairCacheDirectory: demoRepairCachePath(),
      staticRoots: [demoVoiceStaticRoot()],
      voiceBuildId,
      ...(transcribeAudio ? { transcribeAudio } : {}),
    });
    stopPtt = await startPttWire(server.port);

    const voiceUrl = `http://127.0.0.1:${server.port}/voice/`;
    const browser = resolveBrowser();
    // No --user-data-dir: the app window opens in the user's normal, last-used profile.
    const voice = spawn(browser, ["--window-size=420,760", `--app=${voiceUrl}`], { stdio: "ignore", detached: true, windowsHide: true });
    voice.unref();

    process.stdout.write(`Blip is running (brain=${brain}).\n`);
    process.stdout.write(`Voice window: ${voiceUrl}\n`);
    process.stdout.write("Talk: hold Right Ctrl + Space anywhere, or use Hold to talk in the Blip window.\n");

    let extensionAnnounced = false;
    const startedAt = Date.now();
    const watch = setInterval(() => {
      const connected = server!.session.extensionConnected;
      if (connected && !extensionAnnounced) {
        extensionAnnounced = true;
        process.stdout.write("Browser extension connected. Blip can see and act on your current tab.\n");
      } else if (!connected && extensionAnnounced) {
        extensionAnnounced = false;
        process.stdout.write("Browser extension disconnected. It reconnects on its own within about 30 seconds.\n");
      } else if (!connected && Date.now() - startedAt > EXTENSION_HINT_MS && Date.now() - startedAt < EXTENSION_HINT_MS + 1_000) {
        process.stdout.write(
          `The Blip extension has not connected yet. One-time setup: open edge://extensions, turn on Developer mode, ` +
          `choose "Load unpacked" and select ${extensionDist}\n`,
        );
      }
    }, 1_000);

    process.stdout.write("Press Ctrl+C to stop Blip.\n");
    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
    clearInterval(watch);
    return 0;
  } finally {
    await cleanup();
  }
}

void main()
  .then((code) => { process.exitCode = code; })
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
