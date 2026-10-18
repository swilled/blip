// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildExtension } from "../../build.js";
import { EXTENSION_ID, Snapshot } from "@blip/protocol";
import { resolveBrowser } from "../../../../scripts/browser.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const distDir = path.join(repoRoot, "apps", "extension", "dist");
const profileRoot = path.join(repoRoot, ".chrome-profile");
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function stopOwnedBrowser(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  // This is the dedicated child launched below; never discover or terminate other browser processes.
  child.kill();
  await Promise.race([exited, delay(5_000)]);
}

describe("real frame snapshot pipeline", () => {
  const enabled = process.env["BLIP_E2E_BROWSER"] === "1";

  it.skipIf(!enabled)("captures a cross-origin form and feeds the unchanged baseline builder", async () => {
    const { startServer } = await import("../../../server/src/server.js");
    const { startTestPages } = await import("../../../../tools/test-pages/serve.js");
    const running = await startServer({ port: 0, dev: false });
    const pages = await startTestPages({ port: 0, build: false });
    const browser = resolveBrowser();
    const profileDir = path.join(profileRoot, `snapshot-${process.pid}-${Date.now()}`);
    let child: ChildProcess | undefined;
    let spawnError: Error | undefined;

    try {
      expect(running.config.extensionId).toBe(EXTENSION_ID);
      await mkdir(profileRoot, { recursive: true });
      await mkdir(profileDir, { recursive: true });
      await buildExtension({ socketUrl: running.url });
      child = spawn(browser, [
        "--headless=new",
        `--user-data-dir=${profileDir}`,
        "--no-first-run",
        "--no-default-browser-check",
        `--disable-extensions-except=${distDir}`,
        `--load-extension=${distDir}`,
        "--disable-features=DisableLoadExtensionCommandLineSwitch",
        `${pages.origins.primary}/frame-cross.html`,
      ], { stdio: "ignore", windowsHide: true });
      child.on("error", (error) => { spawnError = error; });

      const deadline = Date.now() + 30_000;
      while (!running.session.extensionConnected && Date.now() < deadline) {
        if (spawnError) throw new Error(`could not start browser ${browser}: ${spawnError.message}`);
        if (child.exitCode !== null) throw new Error(`browser exited before extension connected (code ${child.exitCode})`);
        await delay(100);
      }
      if (!running.session.extensionConnected) throw new Error("timed out waiting for the extension connection");

      const reply = await running.hub.request("extension", "snapshot.request", { reason: "user" }, {
        expect: "snapshot.result",
        timeoutMs: 10_000,
      });
      expect(reply.type).toBe("snapshot.result");
      expect(reply.payload.ok).toBe(true);
      if (!reply.payload.ok) throw new Error(reply.payload.error.message);
      expect(Snapshot.safeParse(reply.payload.snapshot).success).toBe(true);
      expect(reply.payload.snapshot.url).toBe(`${pages.origins.primary}/frame-cross.html`);
      expect(reply.payload.snapshot.elements.some((element) => element.frameId > 0 && /^f\d+e\d+$/.test(element.id))).toBe(true);

      const { buildBaselineFormModel } = await import("../../../server/src/baseline/build.js");
      const model = buildBaselineFormModel(reply.payload.snapshot);
      expect(model.fields.map((field) => field.label)).toContain("Message for this frame");
    } finally {
      try {
        if (child) await stopOwnedBrowser(child);
        await pages.close();
        await running.close();
      } finally {
        await rm(profileDir, { recursive: true, force: true });
      }
    }
  }, 45_000);
});
