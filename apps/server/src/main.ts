// CLI entry (D-21). Flag parsing only; everything real lives in startServer().
//   --port <n>            default 7777 (0 = ephemeral)
//   --dev                 allow no-Origin clients and the dev voice origins
//   --brain=fake|agy   default fake; agy uses the signed-in Antigravity CLI subscription
//   --fake-delay <ms>     default 1500: how long a model-routed turn waits (the fake brain "thinking")
//   --fake-request-action <actionId>
//                         TEST ONLY: the fake brain answers model-routed turns with request_action for
//                         this id. The server requires completed read-back, cooldown, and exact phrase;
//                         the fake extension still refuses the final gated click.
//   --allow-origin <o>    repeatable; requires --dev; loopback http origins; grants voice only
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DEFAULT_PORT, WS_PATH, LOOPBACK_HOST } from "@blip/protocol";
import { parseAllowedOrigin } from "./hub/guard";
import type { StaticRoot } from "./hub/static";
import { startServer } from "./server";
import { discoverLocalWhisper } from "./voice/local-whisper";

function die(message: string, code: number): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function parseIntegerFlag(name: string, raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined) return fallback;
  if (!/^[0-9]+$/.test(raw) || Number(raw) > max) {
    die(`--${name} must be a whole number between 0 and ${max}, got "${raw}"`, 2);
  }
  return Number(raw);
}

async function main(): Promise<void> {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        port: { type: "string" },
        dev: { type: "boolean", default: false },
        brain: { type: "string", default: "fake" },
        "fake-delay": { type: "string" },
        "fake-request-action": { type: "string" },
        "allow-origin": { type: "string", multiple: true },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
        die(`${(err as Error).message}\nusage: main.ts [--port <n>] [--dev] [--brain=fake|agy] [--fake-delay <ms>] [--fake-request-action <actionId>] [--allow-origin <origin>]...`, 2);
  }

  const dev = values.dev === true;
  const brain = values.brain;
  if (brain !== "fake" && brain !== "agy") die(`--brain must be fake or agy, got "${brain}"`, 2);

  const port = parseIntegerFlag("port", values.port, DEFAULT_PORT, 65535);
  const fakeDelayMs = parseIntegerFlag("fake-delay", values["fake-delay"], 1500, 600000);

  const allowOrigins = values["allow-origin"] ?? [];
  if (allowOrigins.length > 0 && !dev) {
    die("--allow-origin requires --dev: extra origins are only honored in development mode", 2);
  }
  const extraVoiceOrigins: string[] = [];
  for (const o of allowOrigins) {
    try {
      extraVoiceOrigins.push(parseAllowedOrigin(o));
    } catch (err) {
      die(`--allow-origin ${(err as Error).message}`, 2);
    }
  }

  // Static roots only when their directories exist so server-only setups remain lightweight.
  const staticRoots: StaticRoot[] = [];
  const voicePublic = fileURLToPath(new URL("../../../apps/voice/dist", import.meta.url));
  let voiceBuildId: string | undefined;
  try { voiceBuildId = JSON.parse(await readFile(`${voicePublic}/blip-build.json`, "utf8")).id; }
  catch { process.stderr.write("Voice client is not built. Run npm.cmd run build --workspace @blip/voice, then restart.\n"); }
  const fixtures = fileURLToPath(new URL("../../../fixtures/forms", import.meta.url));
  if (voiceBuildId && existsSync(voicePublic)) staticRoots.push({ urlPrefix: "/voice", dir: voicePublic });
  if (existsSync(fixtures)) staticRoots.push({ urlPrefix: "/fixtures/forms", dir: fixtures });

  let running;
  try {
    const transcribeAudio = await discoverLocalWhisper();
    running = await startServer({
      port,
      dev,
      brain,
      fakeDelayMs,
      extraVoiceOrigins,
      staticRoots,
      voiceBuildId,
      ...(transcribeAudio ? { transcribeAudio } : {}),
      ...(values["fake-request-action"] !== undefined ? { fakeRequestActionId: values["fake-request-action"] } : {}),
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
      die(`port ${port} is already in use; stop the other process or pick another with --port <n>`, 1);
    }
    die(`failed to start: ${(err as Error).message}`, 1);
  }

  process.stdout.write(
    `listening on ws://${LOOPBACK_HOST}:${running.port}${WS_PATH} (brain=${brain}, dev=${dev})\n`,
  );

  process.on("SIGINT", () => {
    void running.close().then(() => process.exit(0));
  });
}

void main();
