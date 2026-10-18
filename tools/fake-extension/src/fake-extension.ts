// A stand-in for the Chrome extension (D-22): connects as role extension, serves a fixture snapshot
// and applies fill/select/check to an in-memory copy, reading values back from that copy.
//
// It FAILS CLOSED (T-01-27): there is no submit path. A click on any gated or kindless element
// returns gate-required and mutates nothing, whatever the request's `gate` field says, because no
// grant logic exists in Phase 1. A stub that executed a gated click would hide a real gate bug.
import { WebSocket } from "ws";
import {
  buildFrame,
  isGatedKind,
  PING_INTERVAL_MS,
  parseFrame,
  type ActRequest,
  type ActResult,
  type ActionKind,
  type Message,
  type MessageType,
  type PageChangedPayload,
  type PayloadOf,
  type RawElement,
  type Snapshot,
} from "@blip/protocol";
import { FIXTURE_NAMES, loadSnapshot, type FixtureName } from "@blip/protocol/fixtures-loader";

export type FakeExtensionOptions = {
  /** ws://127.0.0.1:<port>/ws */
  url: string;
  fixture?: FixtureName;
  /** Sent as the Origin header; omitted by default (works against a server started with dev true). */
  origin?: string;
  /** Keepalive interval, default PING_INTERVAL_MS (D-06). */
  pingMs?: number;
  tabId?: number;
  /** Test hook: element ids that report disabled. */
  disabledIds?: string[];
};

export type FakeExtension = {
  /** Resolves once the server's welcome arrives; rejects if the connection fails first. */
  connected: Promise<void>;
  fixtureName(): FixtureName;
  /** Swap the fixture: bumps the version, resets values and emits page.changed (navigation). */
  setFixture(name: FixtureName): void;
  /** Change one live field value without changing the structural version, then notify the server. */
  setValue(fieldId: string, value: string): void;
  emitPageChanged(reason: PageChangedPayload["reason"]): void;
  /** A copy of the in-memory elements. */
  elements(): RawElement[];
  /** The version the extension currently reports in snapshots. */
  version(): number;
  /** Every valid frame received from the server, in order. */
  received(): Message[];
  /** Every frame this extension sent (type and payload), in order. */
  sent(): Array<{ type: string; payload: unknown }>;
  close(): void;
};

function ok(actId: string, extra: Partial<ActResult> = {}): ActResult {
  return { actId, ok: true, ...extra };
}

function fail(actId: string, error: NonNullable<ActResult["error"]>, extra: Partial<ActResult> = {}): ActResult {
  return { actId, ok: false, error, ...extra };
}

export function startFakeExtension(options: FakeExtensionOptions): FakeExtension {
  const tabId = options.tabId ?? 1;
  const disabledIds = new Set(options.disabledIds ?? []);
  let fixture: FixtureName = options.fixture ?? "booking";
  let snapshot: Snapshot = load(fixture, undefined);

  function load(name: FixtureName, previousVersion: number | undefined): Snapshot {
    const base = loadSnapshot(name);
    const version = previousVersion === undefined ? base.version : Math.max(previousVersion + 1, base.version);
    return {
      ...base,
      tabId,
      version,
      snapshotId: `${name}-${version}`,
      elements: base.elements.map((e) => (disabledIds.has(e.id) ? { ...e, disabled: true } : e)),
    };
  }

  const receivedFrames: Message[] = [];
  const sentFrames: Array<{ type: string; payload: unknown }> = [];

  const ws = new WebSocket(options.url, options.origin !== undefined ? { origin: options.origin } : {});

  function send<T extends MessageType>(type: T, payload: PayloadOf<T>, replyTo?: string): void {
    const frame = buildFrame(type, payload, replyTo !== undefined ? { replyTo } : {});
    sentFrames.push({ type, payload: frame.payload });
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
  }

  function emitPageChanged(reason: PageChangedPayload["reason"]): void {
    send("page.changed", { tabId, url: snapshot.url, reason, structuralHash: snapshot.structuralHash });
  }

  // ---- acts -----------------------------------------------------------------------------------

  function find(id: string): RawElement | undefined {
    return snapshot.elements.find((e) => e.id === id);
  }

  function handleAct(req: ActRequest): ActResult {
    const { actId, action } = req;
    const el = find(action.targetId);
    if (el === undefined) return fail(actId, "target-not-found");
    if (el.disabled) return fail(actId, "disabled");
    const writes = action.op === "fill" || action.op === "select" || action.op === "check";
    if (writes && el.sensitive !== "none") return fail(actId, "sensitive-field", { observedValue: null });
    if (req.snapshotVersion !== snapshot.version) {
      return fail(actId, "stale-snapshot", { newSnapshotVersion: snapshot.version });
    }
    const live: ActionKind | undefined = el.kind;
    const liveExtra: Partial<ActResult> = live !== undefined ? { liveKind: live } : {};

    if (action.op === "click") {
      // Fail closed: anything gated, kindless or unrecognized is refused with no mutation (D-11).
      if (live === undefined || isGatedKind(live)) {
        if (live !== undefined && req.expectedKind !== live) return fail(actId, "kind-mismatch", liveExtra);
        return fail(actId, "gate-required", liveExtra);
      }
      if (req.expectedKind !== live) return fail(actId, "kind-mismatch", liveExtra);
      return ok(actId, { liveKind: live });
    }

    if (req.expectedKind !== live) return fail(actId, "kind-mismatch", liveExtra);

    switch (action.op) {
      case "fill": {
        el.value = action.value;
        el.hasValue = action.value !== "";
        return ok(actId, { observedValue: el.value, ...liveExtra });
      }
      case "select": {
        const options = el.options;
        if (options === undefined || !options.some((o) => o.value === action.optionValue)) {
          return fail(actId, "exception", { detail: "no such option" });
        }
        for (const o of options) o.selected = o.value === action.optionValue;
        el.value = action.optionValue;
        el.hasValue = action.optionValue !== "";
        return ok(actId, { observedValue: el.value, ...liveExtra });
      }
      case "check": {
        el.checked = action.checked;
        el.hasValue = action.checked;
        return ok(actId, { observedValue: String(el.checked), ...liveExtra });
      }
      case "focus":
      case "scroll-into-view":
        // No mutation; focus on a sensitive field is how the user is handed the keyboard. Nothing is read back.
        return ok(actId, { observedValue: el.sensitive !== "none" ? null : (el.value ?? null), ...liveExtra });
    }
  }

  // ---- connection -----------------------------------------------------------------------------

  let pingTimer: NodeJS.Timeout | undefined;

  const connected = new Promise<void>((resolve, reject) => {
    let welcomed = false;
    ws.once("error", (err) => {
      if (!welcomed) reject(err);
    });
    ws.on("close", () => {
      clearInterval(pingTimer);
      if (!welcomed) reject(new Error("closed before welcome"));
    });
    ws.on("open", () => {
      send("hello", { role: "extension", clientVersion: "fake-extension", protocolVersion: 1 });
    });
    ws.on("message", (data) => {
      // D-18: every inbound frame goes through parseFrame; anything invalid is dropped.
      const parsed = parseFrame(Array.isArray(data) ? Buffer.concat(data) : (data as Buffer));
      if (!parsed.ok) return;
      const message = parsed.message;
      receivedFrames.push(message);
      switch (message.type) {
        case "welcome":
          if (!welcomed) {
            welcomed = true;
            pingTimer = setInterval(() => send("ping", {}), options.pingMs ?? PING_INTERVAL_MS);
            pingTimer.unref();
            resolve();
          }
          break;
        case "snapshot.request":
          send("snapshot.result", { ok: true, snapshot }, message.id);
          break;
        case "act.request":
          send("act.result", handleAct(message.payload), message.id);
          break;
        default:
          break;
      }
    });
  });
  connected.catch(() => {});

  return {
    connected,
    fixtureName: () => fixture,
    setFixture(name) {
      if (!FIXTURE_NAMES.includes(name)) throw new Error(`unknown fixture "${name}"`);
      fixture = name;
      snapshot = load(name, snapshot.version);
      emitPageChanged("navigation");
    },
    setValue(fieldId, value) {
      const field = snapshot.elements.find((element) => element.id === fieldId && element.category === "field");
      if (!field) throw new Error(`unknown field "${fieldId}"`);
      field.value = field.sensitive === "none" ? value : null;
      field.hasValue = value !== "";
      snapshot = { ...snapshot, capturedAt: Date.now() };
      emitPageChanged("mutation");
    },
    emitPageChanged,
    elements: () => structuredClone(snapshot.elements),
    version: () => snapshot.version,
    received: () => [...receivedFrames],
    sent: () => [...sentFrames],
    close() {
      clearInterval(pingTimer);
      ws.terminate();
    },
  };
}
