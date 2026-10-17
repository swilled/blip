import { access, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveBrowser } from "./browser.js";
import { startTestPages } from "../tools/test-pages/serve.js";

interface LauncherOptions {
  dryRun: boolean;
  noServe: boolean;
  port: number;
  urls: string[];
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profileDir = path.join(repoRoot, ".chrome-profile", "ext-chrome");
const distDir = path.join(repoRoot, "apps", "extension", "dist");
const manifestPath = path.join(distDir, "manifest.json");

function parseArgs(args: string[]): LauncherOptions {
  const options: LauncherOptions = { dryRun: false, noServe: false, port: 7790, urls: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-serve") {
      options.noServe = true;
    } else if (arg === "--port") {
      const value = args[++index];
      const port = Number(value);
      if (!value || !Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error("--port must be an integer between 1 and 65535");
      }
      options.port = port;
    } else if (arg === "--url") {
      const value = args[++index];
      if (!value) throw new Error("--url requires an absolute HTTP or HTTPS URL");
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new Error(`invalid --url value: ${value}`);
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`--url must use HTTP or HTTPS: ${value}`);
      }
      options.urls.push(url.href);
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: npm run ext:chrome -- [--dry-run] [--no-serve] [--port PORT] [--url URL ...]\n" +
        "Launch a dedicated browser profile with the local test pages.\n",
      );
      process.exit(0);
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return options;
}

function plannedUrls(options: LauncherOptions, pageServerPort = options.port): string[] {
  if (options.urls.length > 0) return options.urls;
  if (options.noServe) return [];
  return [`http://127.0.0.1:${pageServerPort}/`];
}

function printLaunchPlan(
  browser: string,
  urls: string[],
  dryRun: boolean,
  origins?: { primary: string; alternate: string },
): void {
  process.stdout.write(`Browser: ${browser}\n`);
  process.stdout.write(`Profile: ${profileDir}\n`);
  process.stdout.write(`Fixture server: ${dryRun ? "not started (dry-run)" : origins?.primary ?? "not started (--no-serve)"}\n`);
  process.stdout.write("Page URLs:\n");
  if (urls.length === 0) process.stdout.write("  (none)\n");
  for (const url of urls) process.stdout.write(`  ${url}\n`);
  if (origins) {
    process.stdout.write(`Fixture origins: primary=${origins.primary}, alternate=${origins.alternate}\n`);
    process.stdout.write(`Cross-origin frame URL: ${origins.alternate}/frame-inner.html?frame=cross-origin\n`);
  }
  process.stdout.write(`Load unpacked once from: ${distDir}\n`);
  process.stdout.write("After rebuilding, reload the unpacked extension in the browser extensions page.\n");
  process.stdout.write("Verify readiness from the app server log: connection bound role=extension (no /healthz endpoint).\n");
}

async function buildExtensionIfManifestMissing(): Promise<void> {
  try {
    await access(manifestPath);
    return;
  } catch {
    // Build only when this is a fresh checkout or dist was cleaned.
  }

  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, ["run", "ext:build"], {
      cwd: repoRoot,
      stdio: "inherit",
      windowsHide: true,
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`extension build failed (${signal ?? `exit ${code ?? "unknown"}`})`));
    });
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const browser = resolveBrowser();

  if (options.dryRun) {
    const origins = options.noServe
      ? undefined
      : { primary: `http://127.0.0.1:${options.port}`, alternate: `http://localhost:${options.port}` };
    printLaunchPlan(browser, plannedUrls(options), true, origins);
    return;
  }

  await buildExtensionIfManifestMissing();
  const pageServer = options.noServe ? undefined : await startTestPages({ port: options.port });
  const urls = plannedUrls(options, pageServer?.port ?? options.port);
  await mkdir(path.dirname(profileDir), { recursive: true });
  await mkdir(profileDir, { recursive: true });
  printLaunchPlan(browser, urls, false, pageServer?.origins);

  const args = [
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--new-window",
    ...urls,
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(browser, args, { stdio: "ignore", windowsHide: true });
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (signal) process.stdout.write(`Browser exited after ${signal}.\n`);
        else process.stdout.write(`Browser exited with code ${code ?? "unknown"}.\n`);
        resolve();
      });
    });
  } finally {
    await pageServer?.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
