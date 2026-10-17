// V7 / T-01-20: frame payloads never reach a log line or an error frame.
import { afterEach, describe, expect, it } from "vitest";
import { startServer, type RunningServer } from "../src/server";
import { LOG_KEYS, log, sanitize, setLogSink } from "../src/log";
import { makeElement, makeSnapshot } from "../../../packages/protocol/test/helpers";
import { bindClient, sleep, type TestClient } from "./helpers";

const NAME = "SENTINEL-NAME-7731";
const CARD = "SENTINEL-CARD-9042";

/** Next error frame, skipping state pushes that presence changes send to the voice client. */
async function nextError(c: TestClient) {
  for (;;) {
    const f = await c.nextMessage();
    if (f.type === "error") return f;
  }
}

let srv: RunningServer | undefined;
const clients: TestClient[] = [];
let restore: ReturnType<typeof setLogSink> | undefined;

afterEach(async () => {
  if (restore) setLogSink(restore);
  restore = undefined;
  for (const c of clients.splice(0)) c.ws.terminate();
  await srv?.close();
  srv = undefined;
});

describe("payload-free logging", () => {
  it("sentinels in snapshot text and in a rejected sensitive value appear in no log line and no error frame", async () => {
    const lines: string[] = [];
    restore = setLogSink((l) => lines.push(l));
    srv = await startServer({ port: 0, dev: true });

    const voice = await bindClient(srv.port, "voice", { origin: undefined });
    const ext = await bindClient(srv.port, "extension", { origin: undefined });
    clients.push(voice, ext);

    // (a) An unsolicited snapshot.result whose ordinary text field carries the first sentinel.
    const snap = makeSnapshot({
      elements: [makeElement({ value: NAME, hasValue: true })],
    });
    ext.send("snapshot.result", { ok: true, snapshot: snap });
    const errA = await ext.nextMessage();
    expect(errA.payload.code).toBe("unexpected-reply");

    // (b) A snapshot whose sensitive element carries the second sentinel: rejected by the schema.
    const bad = makeSnapshot({
      elements: [makeElement({ id: "pw", sensitive: "card-number", value: CARD, hasValue: true })],
    });
    ext.sendUnchecked("snapshot.result", { ok: true, snapshot: bad });
    const errB = await ext.nextMessage();
    expect(errB.payload.code).toBe("invalid-payload");

    // (c) The same values through a role-violation path and a malformed payload carrying the sentinel.
    voice.sendUnchecked("snapshot.result", { ok: true, snapshot: snap });
    const errC = await nextError(voice);
    expect(errC.payload.code).toBe("role-violation");
    voice.sendUnchecked("ptt", { state: NAME });
    const errD = await nextError(voice);
    expect(errD.payload.code).toBe("invalid-payload");

    await sleep(50);
    const everything = [...lines, ...ext.frames.map((f) => JSON.stringify(f)), ...voice.frames.map((f) => JSON.stringify(f))];
    for (const text of everything) {
      expect(text).not.toContain(NAME);
      expect(text).not.toContain(CARD);
    }
    for (const f of [errA, errB, errC, errD]) {
      expect(JSON.stringify(f)).not.toContain("SENTINEL");
    }
    expect(lines.length).toBeGreaterThan(0);
  });

  it("every log line has only the allowed keys", async () => {
    const lines: string[] = [];
    restore = setLogSink((l) => lines.push(l));
    srv = await startServer({ port: 0, dev: true });
    const voice = await bindClient(srv.port, "voice", { origin: undefined });
    clients.push(voice);
    voice.sendRaw("{nope");
    voice.sendUnchecked("totally.unknown", {});
    voice.sendUnchecked("ping", {});
    await voice.nextMessage();
    await voice.nextMessage();
    await voice.nextMessage();
    await sleep(30);

    expect(lines.length).toBeGreaterThan(3);
    const allowed = new Set<string>(LOG_KEYS);
    for (const l of lines) {
      for (const k of Object.keys(JSON.parse(l))) expect(allowed.has(k), `${k} in ${l}`).toBe(true);
    }
  });

  it("sanitize strips control characters and truncates", () => {
    expect(sanitize("a\r\nb\u0000c\u001b[31m")).toBe("abc[31m");
    expect(sanitize("x".repeat(500)).length).toBe(203);
    expect(sanitize("ab cd")).toBe("abcd");
  });

  it("a hostile Origin cannot inject a second log line", async () => {
    const lines: string[] = [];
    restore = setLogSink((l) => lines.push(l));
    log("warn", { msg: "ws origin rejected", origin: 'https://evil\n{"level":"error","msg":"forged"}' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("\n");
    expect(JSON.parse(lines[0]!).level).toBe("warn");
  });
});
