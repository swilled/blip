// Voice-window launcher (D-01): a Chrome --app popup on the right edge, pinned on top when the spike allowed it.
// Voice's dev helper only; core's scripts/start.ts (PROT-03) is the product launcher.
import { spawn as nodeSpawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT, LOOPBACK_HOST } from "@blip/protocol";

/** Spike decisions: LAYOUT pinned-popup, PIN_METHOD koffi-SetWindowPos with an EXACT title match. */
export const LAYOUT: Layout = "pinned";
/** Must equal the <title> of apps/voice/index.html exactly (pinTopmost matches the whole title). */
export const WINDOW_TITLE = "Blip";
export const WINDOW_WIDTH = 420;
export const WINDOW_HEIGHT = 720;

export type Layout = "pinned" | "docked";

const repoRoot = new URL("../../../", import.meta.url);

export function buildChromeArgs(opts: { port?: number; screenWidth?: number } = {}): string[] {
  const port = opts.port ?? DEFAULT_PORT;
  const profile = fileURLToPath(new URL(".chrome-profile", repoRoot)).replace(/[\\/]$/, "");
  const args = [
    `--user-data-dir=${profile}`,
    `--app=http://${LOOPBACK_HOST}:${port}/`,
    `--window-size=${WINDOW_WIDTH},${WINDOW_HEIGHT}`,
    "--no-first-run",
    "--no-default-browser-check",
  ];
  if (opts.screenWidth !== undefined) {
    args.push(`--window-position=${Math.max(0, opts.screenWidth - WINDOW_WIDTH)},0`);
  }
  return args;
}

export function resolveChromePath(
  env: Record<string, string | undefined> = process.env,
  exists: (p: string) => boolean = existsSync,
): string {
  if (env.CHROME_PATH) return env.CHROME_PATH;
  const candidates = [
    env.PROGRAMFILES && `${env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,
    env["PROGRAMFILES(X86)"] && `${env["PROGRAMFILES(X86)"]}/Google/Chrome/Application/chrome.exe`,
    env.LOCALAPPDATA && `${env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  ].filter((c): c is string => typeof c === "string");
  for (const c of candidates) if (exists(c)) return c;
  throw new Error("chrome.exe not found; set CHROME_PATH to its full path");
}

async function primaryScreenWidth(): Promise<number | undefined> {
  try {
    const { default: koffi } = await import("koffi");
    const getMetrics = koffi.load("user32.dll").func("int __stdcall GetSystemMetrics(int index)");
    const w = getMetrics(0) as number; // SM_CXSCREEN
    return w > 0 ? w : undefined;
  } catch {
    return undefined;
  }
}

export interface LaunchOptions {
  port?: number;
  layout?: Layout;
  spawn?: (cmd: string, args: string[], opts: Record<string, unknown>) => { unref(): void };
  pin?: (title: string) => Promise<{ ok: boolean; error?: string }>;
  chromePath?: string;
  screenWidth?: number;
  log?: (line: string) => void;
}

export async function launchVoiceWindow(opts: LaunchOptions = {}): Promise<void> {
  const log = opts.log ?? ((l: string) => console.log(l));
  const layout = opts.layout ?? LAYOUT;
  const chrome = opts.chromePath ?? resolveChromePath();
  const screenWidth = opts.screenWidth ?? (await primaryScreenWidth());
  const args = buildChromeArgs({ ...(opts.port !== undefined ? { port: opts.port } : {}), ...(screenWidth !== undefined ? { screenWidth } : {}) });
  const spawn = opts.spawn ?? ((c, a, o) => nodeSpawn(c, a, o as never));
  // Args array, no shell: nothing here is ever interpreted by a shell (T-01-16).
  const child = spawn(chrome, args, { detached: true, stdio: "ignore" });
  child.unref();
  log(`blip window: opened ${args.find((a) => a.startsWith("--app="))?.slice(6)}`);
  if (layout !== "pinned") {
    log("blip window: docked (not pinned)");
    return;
  }
  const pin = opts.pin ?? (async (t: string) => (await import("../../../apps/server/src/voice/pin-topmost")).pinTopmost(t));
  const r = await pin(WINDOW_TITLE);
  log(r.ok ? "blip window: pinned on top" : `blip window: not pinned (${r.error ?? "SetWindowPos failed"}); leaving it docked`);
}

const entry = process.argv[1]?.replace(/\\/g, "/");
if (entry?.endsWith("/launch-window.ts")) {
  await launchVoiceWindow({ port: Number(process.env.PORT ?? DEFAULT_PORT) });
}
