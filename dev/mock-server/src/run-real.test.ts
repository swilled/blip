import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { buildFrame, FormModel, parseFrame, type Message } from "@blip/protocol";
import { startTestPages } from "../../../tools/test-pages/serve";
import { initialState, reduce } from "@blip/dialogue";
import fixtureJson from "../../../fixtures/forms/broken-form.model.json" with { type: "json" };
import { buildManagedRunnerArgs, DEMO_EXTENSION_ID, installManagedShutdownHandlers, startReal } from "./run-real";

const form = FormModel.parse(fixtureJson);
const closers: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const c of closers.splice(0)) await c();
});

describe("run-real", () => {
  it("restarts direct entry-point launches with a verifiable process token and repository root", () => {
    expect(buildManagedRunnerArgs(
      ["--browser-extension", "--fixture=broken", "--demo-root", "C:\\repo"],
      "C:\\repo",
      "demo-run-token-123456",
    )).toEqual([
      "--browser-extension",
      "--fixture=broken",
      "--demo-run-id=demo-run-token-123456",
      "--demo-root=C:\\repo",
    ]);
  });

  it("routes early IPC and OS shutdown requests to the managed runner cleanup handler", () => {
    const events = new EventEmitter();
    const shutdown = vi.fn();
    installManagedShutdownHandlers(events, shutdown);

    events.emit("message", { type: "shutdown", signal: "SIGTERM" });
    events.emit("message", { type: "unrelated" });
    events.emit("SIGINT");

    expect(shutdown).toHaveBeenCalledTimes(2);
  });

  it("uses the pinned local Chrome extension origin without connecting the in-memory fixture", async () => {
    const real = await startReal({ port: 0, browserExtension: true, fakeDelayMs: 0 });
    closers.push(() => real.close());

    expect(real.extension).toBeUndefined();
    expect(real.server.config.extensionId).toBe(DEMO_EXTENSION_ID);
    expect(real.server.hub.send("extension", "highlight", { targetId: null })).toBe(false);
  });

  it("pins the extension origin to the public key in the local bridge manifest", () => {
    const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8")) as { key: string };
    const digest = createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest().subarray(0, 16);
    const id = Array.from(digest, (byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join("");
    expect(id).toBe(DEMO_EXTENSION_ID);
  });

  it("5: real server + fake extension reply like the reducer and serve the static root", async () => {
    const dir = mkdtempSync(join(tmpdir(), "blip-static-"));
    writeFileSync(join(dir, "index.html"), "<title>Blip</title>temp-index");
    const real = await startReal({ port: 0, fixture: "broken", fakeDelayMs: 0, staticDir: dir });
    closers.push(() => real.close());
    const port = real.server.port;

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: `http://127.0.0.1:${port}` });
    closers.push(() => ws.terminate());
    const frames: Message[] = [];
    ws.on("message", (d) => {
      const r = parseFrame(d.toString());
      if (r.ok) frames.push(r.message);
    });
    await new Promise<void>((res, rej) => {
      ws.once("open", () => res());
      ws.once("error", rej);
    });
    ws.send(JSON.stringify(buildFrame("hello", { role: "voice", clientVersion: "test", protocolVersion: 1 })));
    ws.send(JSON.stringify(buildFrame("utterance", { utteranceId: "u1", text: "what's here", source: "typed" })));

    const waitSpeak = async () => {
      for (let i = 0; i < 400; i++) {
        const f = frames.find((m) => m.type === "speak");
        if (f && f.type === "speak") return f;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error("no speak frame");
    };
    const speak = await waitSpeak();
    const expected = reduce(initialState(), { type: "utterance", utterance: { utteranceId: "u1", text: "what's here", source: "typed" } }, { form, now: 0 })
      .effects[0] as { text: string };
    expect(speak.payload.text).toBe(expected.text);

    ws.send(JSON.stringify(buildFrame("speak.done", { speakId: speak.payload.speakId, interrupted: false })));
    await new Promise((r) => setTimeout(r, 150));
    expect(frames.find((m) => m.type === "error")).toBeUndefined();

    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(await res.text()).toContain("temp-index");

    const formPage = await fetch(`http://127.0.0.1:${port}/fixtures/forms/broken.html`);
    expect(formPage.status).toBe(200);
    expect(await formPage.text()).toContain("Customer survey");

    const offlinePage = await fetch(`http://127.0.0.1:${port}/fixtures/forms/offline/public-form.html`);
    expect(offlinePage.status).toBe(200);
    const offlineHtml = await offlinePage.text();
    expect(offlineHtml).toContain("OFFLINE DEMO COPY");
    expect(offlineHtml).toContain("Employment type");
    expect(offlineHtml).toContain("Department");
    expect(offlineHtml).toContain("Leave type");
    expect(offlineHtml).toContain("Leave date");
    expect(offlineHtml).toContain("Return date");
    expect(offlineHtml).toContain('type="button"');
    expect(offlineHtml).not.toMatch(/<form\b/i);
    expect(offlineHtml).not.toMatch(/<script\b[^>]*\bsrc=/i);
    expect(offlineHtml).not.toMatch(/<link\b[^>]*\bhref=/i);
    expect(offlineHtml).not.toContain("forms.cloud.microsoft");

    const manifestResponse = await fetch(`http://127.0.0.1:${port}/fixtures/forms/offline/manifest.json`);
    expect(manifestResponse.status).toBe(200);
    const manifest = await manifestResponse.json() as { sites: Array<{ id: string; offlineRoute: string }> };
    expect(manifest.sites.map((site) => site.id)).toEqual([
      "team-leave-request",
      "broken-survey",
      "injection-defense",
    ]);
    for (const route of manifest.sites.map((site) => site.offlineRoute).filter((route) => route.startsWith("/fixtures/forms/"))) {
      expect((await fetch(`http://127.0.0.1:${port}${route}`)).status).toBe(200);
    }

    const corePages = await startTestPages({ port: 0, build: false });
    closers.push(() => corePages.close());
    const injectionPage = await fetch(`${corePages.origins.primary}/injection.html`);
    expect(injectionPage.status).toBe(200);
    expect(await injectionPage.text()).toContain("Blip");
  });
});
