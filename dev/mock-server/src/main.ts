import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT, FormModel, LOOPBACK_HOST, WS_PATH } from "@blip/protocol";
import { createMockServer } from "./server";
import { startPttWire } from "./ptt-wire";

const root = new URL("../../../", import.meta.url);
const form = FormModel.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL("fixtures/forms/broken-form.model.json", root)), "utf8")),
);
const staticDir = fileURLToPath(new URL("apps/voice/dist", root));

async function start(): Promise<{ port: number; close(): Promise<void> }> {
  const server = createMockServer({
    port: Number(process.env.PORT ?? DEFAULT_PORT),
    dev: process.env.MOCK_DEV === "1",
    delayMs: Number(process.env.MOCK_DELAY_MS ?? 0),
    form,
    ...(existsSync(staticDir) ? { staticDir } : {}),
  });
  const port = await server.listen();
  console.log(`blip mock server: ws://${LOOPBACK_HOST}:${port}${WS_PATH}`);
  const stopPtt = await startPttWire(port);
  return {
    port,
    async close() {
      await stopPtt();
      await server.close();
    },
  };
}

/** Lets another module (dev.ts) run the mock in-process. */
export const started = start();

const entry = process.argv[1]?.replace(/\\/g, "/");
if (entry?.endsWith("/dev/mock-server/src/main.ts")) {
  const s = await started;
  const shutdown = (): void => void s.close().then(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
