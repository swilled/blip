import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT, FormModel, LOOPBACK_HOST, WS_PATH } from "@blip/protocol";
import { createMockServer } from "./server";

const root = new URL("../../../", import.meta.url);
const form = FormModel.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL("fixtures/forms/broken-form.model.json", root)), "utf8")),
);
const staticDir = fileURLToPath(new URL("apps/voice/dist", root));

const server = createMockServer({
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  dev: process.env.MOCK_DEV === "1",
  delayMs: Number(process.env.MOCK_DELAY_MS ?? 0),
  form,
  ...(existsSync(staticDir) ? { staticDir } : {}),
});

const port = await server.listen();
console.log(`blip mock server: ws://${LOOPBACK_HOST}:${port}${WS_PATH}`);

// PTT_DELIVERY B: global Right Ctrl + Space hold -> loopback sidecar -> voice window.
// If uiohook cannot load, typed input still works.
try {
  const { startPttHook, stopPttHook } = await import("../../../apps/server/src/voice/ptt-hook");
  const { startPttSidecar } = await import("../../../apps/server/src/voice/ptt-sidecar");
  const sidecar = startPttSidecar({ allowedOrigin: `http://${LOOPBACK_HOST}:${port}` });
  startPttHook((state) => sidecar.broadcast(state));
  const shutdown = (): void => {
    stopPttHook();
    void sidecar.close().then(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
} catch {
  console.log("blip mock server: push-to-talk hook unavailable, typed input only");
}
