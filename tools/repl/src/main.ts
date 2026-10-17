// Standalone CLI: a typed voice client for an already running server.
//   tsx tools/repl/src/main.ts [--url ws://127.0.0.1:7777/ws] [--origin <origin>]
// The server must be started with --dev (this client sends no Origin header unless --origin is given).
import { parseArgs } from "node:util";
import { DEFAULT_PORT, LOOPBACK_HOST, WS_PATH } from "@blip/protocol";
import { startRepl } from "./repl";

function die(message: string, code: number): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

let values;
try {
  ({ values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      url: { type: "string", default: `ws://${LOOPBACK_HOST}:${DEFAULT_PORT}${WS_PATH}` },
      origin: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  }));
} catch (err) {
  die(`${(err as Error).message}\nusage: main.ts [--url <ws url>] [--origin <origin>]`, 2);
}

const repl = startRepl({
  url: values.url,
  input: process.stdin,
  output: process.stdout,
  ...(values.origin !== undefined ? { origin: values.origin } : {}),
});
try {
  await repl.ready;
} catch (err) {
  die(`could not connect to ${values.url}: ${(err as Error).message}`, 1);
}
process.stdout.write("ready. type an utterance, or /quit\n");
await repl.done;
process.exit(0);
