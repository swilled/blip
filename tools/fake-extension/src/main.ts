// Standalone CLI: attach the fake extension to an already running server.
//   tsx tools/fake-extension/src/main.ts [--url ws://127.0.0.1:7777/ws] [--fixture=booking|broken|result-ok|result-errors]
// The server must be started with --dev (this client sends no Origin header unless --origin is given).
import { parseArgs } from "node:util";
import { DEFAULT_PORT, LOOPBACK_HOST, WS_PATH } from "@blip/protocol";
import { FIXTURE_NAMES, type FixtureName } from "@blip/protocol/fixtures-loader";
import { startFakeExtension } from "./fake-extension";

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
      fixture: { type: "string", default: "booking" },
      origin: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  }));
} catch (err) {
  die(`${(err as Error).message}\nusage: main.ts [--url <ws url>] [--fixture=${FIXTURE_NAMES.join("|")}] [--origin <origin>]`, 2);
}

if (!(FIXTURE_NAMES as readonly string[]).includes(values.fixture)) {
  die(`--fixture must be one of ${FIXTURE_NAMES.join(", ")}, got "${values.fixture}"`, 2);
}
const fixture = values.fixture as FixtureName;

const ext = startFakeExtension({
  url: values.url,
  fixture,
  ...(values.origin !== undefined ? { origin: values.origin } : {}),
});
try {
  await ext.connected;
} catch (err) {
  die(`could not connect to ${values.url}: ${(err as Error).message}`, 1);
}
process.stdout.write(`fake extension attached (${fixture})\n`);
process.on("SIGINT", () => {
  ext.close();
  process.exit(0);
});
