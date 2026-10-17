// In-process dev runner behind `npm run dev` (D-21). One process: the server on real loopback
// sockets, the fake extension and the typed REPL. Deliberately NOT `concurrently`: it mangles
// `--brain=fake` on Windows and leaves orphan processes holding the port (research Pitfall 7).
//
//   npm run dev -- --brain=fake
//   npm run dev -- --no-repl            (stay up so the voice UI can attach)
//
// Exit codes: 0 normal, 1 startup failure (port in use), 2 bad flags or --brain=claude.
import { parseArgs } from "node:util";
import { DEFAULT_PORT } from "@blip/protocol";
import { FIXTURE_NAMES, type FixtureName } from "@blip/protocol/fixtures-loader";
import { parseAllowedOrigin } from "../apps/server/src/hub/guard";
import { BrainUnavailableError, CLAUDE_BRAIN_UNAVAILABLE, startServer, type RunningServer } from "../apps/server/src/server";
import { startFakeExtension } from "../tools/fake-extension/src/fake-extension";
import { startRepl } from "../tools/repl/src/repl";

const USAGE = `usage: npm run dev -- [options]
  --brain=fake|claude        default fake (claude arrives in Phase 4 and exits 2)
  --port <n>                 default ${DEFAULT_PORT}; 0 picks a free port
  --fake-delay <ms>          how long a model-routed turn waits, default 1500
  --fixture=booking|broken   page the fake extension serves, default booking
  --no-repl                  skip the typed REPL and stay up for the voice UI (Ctrl+C to stop)
  --allow-origin <origin>    extra loopback http origin allowed to act as voice (repeatable)
  --fake-request-action <id> TEST ONLY: the fake brain requests this action; the server still refuses it
  --help`;

function die(message: string, code: number): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function integerFlag(name: string, raw: string | undefined, fallback: number, max: number): number {
  if (raw === undefined) return fallback;
  if (!/^[0-9]+$/.test(raw) || Number(raw) > max) die(`--${name} must be a whole number between 0 and ${max}, got "${raw}"`, 2);
  return Number(raw);
}

async function main(): Promise<void> {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
      options: {
        brain: { type: "string", default: "fake" },
        port: { type: "string" },
        "fake-delay": { type: "string" },
        fixture: { type: "string", default: "booking" },
        "no-repl": { type: "boolean", default: false },
        "allow-origin": { type: "string", multiple: true },
        "fake-request-action": { type: "string" },
        help: { type: "boolean", default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    die(`${(err as Error).message}\n${USAGE}`, 2);
  }

  if (values.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }
  if (values.brain === "claude") die(CLAUDE_BRAIN_UNAVAILABLE, 2);
  if (values.brain !== "fake") die(`--brain must be fake (claude arrives in Phase 4), got "${values.brain}"`, 2);
  if (!(FIXTURE_NAMES as readonly string[]).includes(values.fixture)) {
    die(`--fixture must be one of ${FIXTURE_NAMES.join(", ")}, got "${values.fixture}"`, 2);
  }
  const fixture = values.fixture as FixtureName;
  const port = integerFlag("port", values.port, DEFAULT_PORT, 65535);
  const fakeDelayMs = integerFlag("fake-delay", values["fake-delay"], 1500, 600000);
  const extraVoiceOrigins: string[] = [];
  for (const o of values["allow-origin"] ?? []) {
    try {
      extraVoiceOrigins.push(parseAllowedOrigin(o));
    } catch (err) {
      die(`--allow-origin ${(err as Error).message}`, 2);
    }
  }

  let server: RunningServer;
  try {
    // The runner always runs the server in dev mode: the fake extension and the REPL connect without an Origin.
    server = await startServer({
      port,
      dev: true,
      brain: "fake",
      fakeDelayMs,
      extraVoiceOrigins,
      ...(values["fake-request-action"] !== undefined ? { fakeRequestActionId: values["fake-request-action"] } : {}),
    });
  } catch (err) {
    if (err instanceof BrainUnavailableError) die(err.message, 2);
    if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
      die(`port ${port} is already in use; stop the other process or pick another with --port <n> (0 picks a free port)`, 1);
    }
    die(`failed to start: ${(err as Error).message}`, 1);
  }
  process.stdout.write(`listening on ${server.url} (brain=fake, dev=true)\n`);

  const extension = startFakeExtension({ url: server.url, fixture });
  try {
    await extension.connected;
  } catch (err) {
    await server.close();
    die(`fake extension failed to attach: ${(err as Error).message}`, 1);
  }
  process.stdout.write(`fake extension attached (${fixture})\n`);

  let closing = false;
  const shutdown = async (code: number): Promise<never> => {
    if (!closing) {
      closing = true;
      extension.close();
      await server.close();
    }
    process.exit(code);
  };
  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  if (values["no-repl"]) {
    process.stdout.write("ready. waiting for a voice client (--no-repl); press Ctrl+C to stop\n");
    return; // the open server keeps the process alive until SIGINT
  }

  const repl = startRepl({
    url: server.url,
    input: process.stdin,
    output: process.stdout,
    controls: { setFixture: (name) => extension.setFixture(name as FixtureName) },
  });
  try {
    await repl.ready;
  } catch (err) {
    await shutdown(1);
    throw err;
  }
  process.stdout.write("ready. type an utterance, or /quit\n");
  await repl.done;
  await shutdown(0);
}

void main();
