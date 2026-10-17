import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { build, context } from "esbuild";
import { EXTENSION_PUBLIC_KEY, DEFAULT_PORT, LOOPBACK_HOST, WS_PATH } from "@blip/protocol";
import { isAllowedSocketUrl } from "./src/background/socket.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, "dist");
const defaultSocketUrl = `ws://${LOOPBACK_HOST}:${DEFAULT_PORT}${WS_PATH}`;

/** Accept only the local `/ws` endpoint used by the extension test harness. */
export function assertAllowedSocketUrl(value: string): string {
  if (!isAllowedSocketUrl(value)) {
    throw new Error("BLIP_WS_URL must be ws://127.0.0.1:<port>/ws");
  }
  return value;
}

export async function buildExtension(options: { socketUrl?: string; watch?: boolean } = {}): Promise<void> {
  const socketUrl = assertAllowedSocketUrl(options.socketUrl ?? process.env["BLIP_WS_URL"] ?? defaultSocketUrl);
  const template = await readFile(path.join(here, "manifest.template.json"), "utf8");
  const manifestText = template.replace("__EXTENSION_PUBLIC_KEY__", EXTENSION_PUBLIC_KEY);
  const manifest = JSON.parse(manifestText) as { key?: string };
  if (manifest.key !== EXTENSION_PUBLIC_KEY) throw new Error("extension manifest key injection failed");

  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "manifest.json"), `${JSON.stringify(JSON.parse(manifestText), null, 2)}\n`);

  const common = {
    bundle: true,
    format: "iife" as const,
    platform: "browser" as const,
    target: "chrome116",
    sourcemap: false,
    define: { __BLIP_WS_URL__: JSON.stringify(socketUrl) },
    logLevel: "info" as const,
  };
  if (options.watch) {
    const watchContext = await context({
      ...common,
      entryPoints: [
        { in: path.join(here, "src/background/index.ts"), out: "background" },
        { in: path.join(here, "src/content/index.ts"), out: "content" },
        { in: path.join(here, "src/content/submit-method-guard-main.ts"), out: "submit-method-guard" },
      ],
      outdir: output,
    });
    await watchContext.watch();
    process.stdout.write(`Watching extension bundles in ${output}\n`);
    return;
  }

  await build({
    ...common,
    entryPoints: [
      { in: path.join(here, "src/background/index.ts"), out: "background" },
      { in: path.join(here, "src/content/index.ts"), out: "content" },
      { in: path.join(here, "src/content/submit-method-guard-main.ts"), out: "submit-method-guard" },
    ],
    outdir: output,
  });
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const watch = process.argv.includes("--watch");
  await buildExtension({ watch });
}
