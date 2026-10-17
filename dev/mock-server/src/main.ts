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
