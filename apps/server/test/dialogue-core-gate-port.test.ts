import { describe, expect, it, vi } from "vitest";
import { FormModel, buildFrame, parseFrame, type ActRequest, type Message, type MessageType, type PayloadOf } from "@blip/protocol";
import { formDigest } from "@blip/dialogue";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { createGatePort } from "../src/act/gate-port";
import type { GatedContext } from "../src/act/gated";
import type { HandlerContext, Hub } from "../src/hub/hub";
import { Session } from "../src/session/session";
import { createCoreDialogueGatePort } from "../src/voice/core-gate-port";
import { createDialogueHandlers } from "../src/voice/dialogue-runner";
import fixtureJson from "../../../fixtures/forms/broken-form.model.json" with { type: "json" };
import { createStt, type RecognitionLike } from "../../voice/src/stt";

type Sent = { role: string; type: string; payload: any };

function makeRig() {
  let clock = 10_000;
  const snapshot = loadSnapshot("broken");
  const form = FormModel.parse({
    ...fixtureJson,
    fields: FormModel.parse(fixtureJson).fields.map((field) => field.required
      ? { ...field, hasValue: true, value: field.type === "select" ? "friend" : "synthetic answer" }
      : field),
  });
  const session = new Session("fake", () => clock);
  session.extensionConnected = true;
  session.model = form;
  session.tabId = snapshot.tabId;
  session.stale = false;
  const sent: Sent[] = [];
  const requests: Array<{ role: string; type: string; payload: unknown }> = [];
  const hub = {
    send(role: string, type: string, payload: unknown) {
      sent.push({ role, type, payload });
      return true;
    },
    async request(role: string, type: string, payload: any) {
      requests.push({ role, type, payload });
      if (type === "act.request") {
        const request = payload as ActRequest;
        return { payload: { actId: request.actId, ok: true, liveKind: "submit" } };
      }
      throw new Error(`unexpected hub request ${type}`);
    },
    pushState() { return true; },
    close() {},
  } as unknown as Hub;
  const refresher = {
    request: vi.fn(async () => ({ ok: true, applied: true, snapshot } as const)),
  };
  const gatedContext: GatedContext = {
    hub,
    gatePort: createGatePort(hub, session.grants),
    session,
    refresher,
    clock: () => clock,
    schedule: () => undefined,
  };
  const gate = createCoreDialogueGatePort(gatedContext);
  const handlers = createDialogueHandlers({ gate, now: () => clock, refresher });

  function message<T extends MessageType>(type: T, payload: PayloadOf<T>): Message {
    const result = parseFrame(JSON.stringify(buildFrame(type, payload)));
    if (!result.ok) throw new Error(`could not create ${type} frame`);
    return result.message;
  }

  async function handle(role: "voice" | "extension", type: MessageType, payload: any): Promise<void> {
    const context: HandlerContext = { role, message: message(type as any, payload) as any, hub, session };
    await handlers[type]?.(context);
  }

  function frames(type: string): Sent[] {
    return sent.filter((frame) => frame.type === type);
  }

  return {
    get clock() { return clock; },
    set clock(value: number) { clock = value; },
    snapshot,
    session,
    sent,
    requests,
    refresher,
    gate,
    handlers,
    message,
    handle,
    frames,
  };
}

async function arm(rig: ReturnType<typeof makeRig>) {
  await rig.handle("voice", "utterance", { utteranceId: "u-submit", text: "submit survey", source: "typed" });
  const readback = rig.frames("speak").findLast((frame) => frame.payload.category === "readback")!;
  await rig.handle("voice", "speak.done", { speakId: readback.payload.speakId, interrupted: false });
  const armed = rig.frames("confirm.armed").at(-1)!;
  return { readback, armed };
}

describe("dialogue reducer to core GatePort integration", () => {
  async function finishSpeech(rig: ReturnType<typeof makeRig>) {
    for (const frame of rig.frames("speak")) {
      await rig.handle("voice", "speak.done", { speakId: frame.payload.speakId, interrupted: false });
    }
    rig.clock += 1000;
  }
  async function spoken(rig: ReturnType<typeof makeRig>, text: string) {
    await rig.handle("voice", "ptt", { state: "start" });
    await rig.handle("voice", "ptt", { state: "end" });
    await rig.handle("voice", "utterance", { utteranceId: `u-${rig.clock}-${text}`, text, source: "voice" });
  }
  function clicks(rig: ReturnType<typeof makeRig>) {
    return rig.requests.filter(r => r.type === "act.request" && (r.payload as ActRequest).action.op === "click");
  }
  it("carries recovered final recognition through speech failure, fresh readback and exact confirmation", async () => {
    const rig = makeRig();
    const recognizers: RecognitionLike[] = [];
    const timers = new Map<object, { run: () => void; ms: number }>();
    const deliveries: Promise<void>[] = [];
    const stt = createStt({
      now: () => rig.clock, canListen: () => true,
      setTimer(run, ms) { const id = {}; timers.set(id, { run, ms }); return id; },
      clearTimer(id) { timers.delete(id as object); },
      makeRecognition() {
        const rec: RecognitionLike = { lang: "", continuous: false, interimResults: false, maxAlternatives: 0,
          onresult: null, onerror: null, onend: null, start() { this.onstart?.(); }, stop() {}, abort() {} };
        recognizers.push(rec); return rec;
      },
      onInterim() {}, onError(error) { throw new Error(error.message); },
      onFinal(final) { deliveries.push(rig.handle("voice", "utterance", { utteranceId: `recognized-${rig.clock}`, source: "voice", text: final.text })); },
    });
    const result = (text: string) => ({ results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: text, confidence: 0.95 } } } });
    async function recoverAndFinish() {
      await rig.handle("voice", "ptt", { state: "start" });
      stt.press();
      for (let n = 0; n < 2; n++) {
        recognizers.at(-1)!.onend!();
        const restart = [...timers].find(([, timer]) => timer.ms === 1000)!;
        timers.delete(restart[0]); rig.clock += 1000; restart[1].run();
      }
      expect(deliveries).toHaveLength(0);
      const native = recognizers.at(-1)!;
      native.onresult!(result("submit survey"));
      expect(deliveries).toHaveLength(0);
      await rig.handle("voice", "ptt", { state: "end" });
      stt.release(); native.onend!(); await Promise.all(deliveries.splice(0));
    }
    await arm(rig);
    await finishSpeech(rig);
    await rig.handle("voice", "settings", { outputMode: "agent-voice", rate: 1.59 });
    const failed = rig.frames("speak").at(-1)!;
    await rig.handle("voice", "speak.done", { speakId: failed.payload.speakId, interrupted: true });
    expect(rig.session.pendingGatedAction).toBeNull();
    await finishSpeech(rig);
    await recoverAndFinish(); // New finalized command starts a new readback, never submits.
    expect(clicks(rig)).toHaveLength(0);
    await finishSpeech(rig); // Readback arms a fresh tracked confirmation prompt.
    await finishSpeech(rig); // Complete that prompt and the guard.
    await rig.handle("voice", "speak.done", { speakId: "unknown-old-output", interrupted: false });
    await recoverAndFinish();
    expect(clicks(rig)).toHaveLength(1);
    expect(timers.size).toBe(0);
  });
  it("rejects spoken near phrases then accepts a fresh exact hold", async () => {
    const rig = makeRig();
    await arm(rig);
    for (const phrase of ["yes", "submit form"]) {
      await finishSpeech(rig);
      await spoken(rig, phrase);
      expect(clicks(rig)).toHaveLength(0);
    }
    await finishSpeech(rig);
    await spoken(rig, "submit survey");
    expect(clicks(rig)).toHaveLength(1);
  });
  it("invalidates capture when tracked rate speech starts, then allows fresh recovery", async () => {
    const rig = makeRig();
    await arm(rig);
    await finishSpeech(rig);
    await rig.handle("voice", "ptt", { state: "start" });
    await rig.handle("voice", "settings", { outputMode: "agent-voice", rate: 1.26 });
    await finishSpeech(rig);
    await rig.handle("voice", "ptt", { state: "end" });
    await rig.handle("voice", "utterance", { utteranceId: "stale-rate", text: "submit survey", source: "voice" });
    expect(clicks(rig)).toHaveLength(0);
    await finishSpeech(rig);
    await spoken(rig, "submit survey");
    expect(clicks(rig)).toHaveLength(1);
  });
  it.each(["cooldown", "output failure", "connection replacement", "page edit"])("rejects capture after %s", async (reason) => {
    const rig = makeRig();
    await arm(rig);
    await finishSpeech(rig);
    if (reason === "cooldown") rig.clock -= 500;
    await rig.handle("voice", "ptt", { state: "start" });
    if (reason === "output failure") {
      await rig.handle("voice", "settings", { outputMode: "agent-voice", rate: 0.79 });
      const ack = rig.frames("speak").at(-1)!;
      await rig.handle("voice", "speak.done", { speakId: ack.payload.speakId, interrupted: true });
      expect(rig.session.pendingGatedAction).toBeNull();
    }
    if (reason === "connection replacement") rig.session.voiceConnected = true;
    if (reason === "page edit") await rig.handle("extension", "page.changed", {
      tabId: rig.snapshot.tabId, url: rig.snapshot.url, reason: "mutation", structuralHash: rig.snapshot.structuralHash,
    });
    rig.clock += 1000;
    await rig.handle("voice", "ptt", { state: "end" });
    await rig.handle("voice", "utterance", { utteranceId: `invalid-${reason}`, text: "submit survey", source: "voice" });
    expect(clicks(rig)).toHaveLength(0);
  });
  it("preserves a quiet armed grant through a real PTT capture and submits once", async () => {
    const rig = makeRig();
    await arm(rig);
    const prompt = rig.frames("speak").findLast(f => f.payload.category === "confirm-prompt")!;
    await rig.handle("voice", "speak.done", { speakId: prompt.payload.speakId, interrupted: false });
    rig.clock += 1000;
    const grantId = rig.session.pendingGatedAction?.grantId;
    await rig.handle("voice", "ptt", { state: "start" });
    await rig.handle("voice", "ptt", { state: "end" });
    expect(rig.session.pendingGatedAction?.grantId).toBe(grantId);
    await rig.handle("voice", "utterance", { utteranceId: "spoken-exact", text: "submit survey", source: "voice" });
    expect(rig.requests.filter(r => r.type === "act.request" && (r.payload as ActRequest).action.op === "click")).toHaveLength(1);
    await rig.handle("voice", "utterance", { utteranceId: "spoken-replay", text: "submit survey", source: "voice" });
    expect(rig.requests.filter(r => r.type === "act.request" && (r.payload as ActRequest).action.op === "click")).toHaveLength(1);
  });
  it("does not arm from a client completion when the selected output has no completion signal", async () => {
    const rig = makeRig();
    rig.session.outputMode = "screen-reader";

    await rig.handle("voice", "utterance", { utteranceId: "u-submit", text: "submit survey", source: "typed" });
    const readback = rig.frames("speak").findLast((frame) => frame.payload.category === "readback")!;
    expect(readback.payload.speakId).toBeDefined();

    await rig.handle("voice", "speak.done", { speakId: readback.payload.speakId, interrupted: false });

    expect(rig.frames("confirm.armed")).toHaveLength(0);
    expect(rig.session.pendingGatedAction).toBeNull();
    expect(rig.session.speechCompletion(readback.payload.speakId)).toBeNull();
  });

  it("clears the one-use grant after a UI confirmation arrives before the prompt cooldown", async () => {
    const rig = makeRig();
    const { armed } = await arm(rig);

    await rig.handle("voice", "confirm.redeem", {
      grantId: armed.payload.grantId,
      speakId: armed.payload.speakId,
      utteranceId: "u-too-early",
      phrase: armed.payload.phrase,
      source: "voice",
    });

    expect(rig.session.pendingGatedAction).toBeNull();
    expect(rig.requests.filter((request) => request.type === "act.request" &&
      (request.payload as ActRequest).action.op === "click")).toHaveLength(0);
    expect(rig.frames("confirm.cleared")).toContainEqual(expect.objectContaining({
      payload: { grantId: armed.payload.grantId, reason: "cancelled" },
    }));
  });

  it("requires a tracked uninterrupted read-back and redeems the exact survey phrase once through core", async () => {
    const rig = makeRig();
    const action = rig.session.model!.actions.find((item) => item.kind === "submit")!;

    rig.session.trackSpeech("server-answer", "answer");
    rig.session.completeSpeech("server-answer", false, rig.clock);
    await expect(rig.gate.arm({
      actionId: action.id,
      kind: "submit",
      title: rig.session.model!.title,
      digest: formDigest(rig.session.model!),
      speakId: "server-answer",
    })).resolves.toMatchObject({ ok: false, reason: "untracked-readback" });

    const { readback, armed } = await arm(rig);
    expect(armed.payload).toMatchObject({ phrase: "submit survey", speakId: readback.payload.speakId, kind: "submit" });
    expect(rig.session.pendingGatedAction?.speakId).toBe(readback.payload.speakId);

    const prompt = rig.frames("speak").findLast((frame) => frame.payload.category === "confirm-prompt")!;
    await rig.handle("voice", "speak.done", { speakId: prompt.payload.speakId, interrupted: false });
    rig.clock += 1_000;
    await rig.handle("voice", "utterance", { utteranceId: "u-exact", text: "submit survey", source: "typed" });

    const clickRequests = rig.requests.filter((request) => {
      if (request.role !== "extension" || request.type !== "act.request") return false;
      return (request.payload as ActRequest).action.op === "click";
    });
    expect(clickRequests).toHaveLength(1);
    expect(clickRequests[0]?.payload).toMatchObject({
      action: { op: "click", targetId: action.id },
      expectedKind: "submit",
      gate: { grantId: armed.payload.grantId, kind: "submit" },
    });
    expect(rig.frames("confirm.cleared")).toContainEqual(expect.objectContaining({
      role: "voice",
      type: "confirm.cleared",
      payload: { grantId: armed.payload.grantId, reason: "executed" },
    }));

    await rig.gate.redeem({
      grantId: armed.payload.grantId,
      speakId: readback.payload.speakId,
      utteranceId: "u-replay",
      phrase: "submit survey",
      source: "voice",
    });
    expect(rig.requests.filter((request) => request.type === "act.request" &&
      (request.payload as ActRequest).action.op === "click")).toHaveLength(1);
  });

  it.each([
    ["cancel", "utterance", "cancel", "cancelled"],
    ["repeat", "utterance", "repeat", "cancelled"],
    ["stop", "control", "stop", "cancelled"],
    ["page change", "page.changed", "", "page-changed"],
    ["push-to-talk", "ptt", "", "cancelled"],
  ] as const)("invalidates the core grant on %s", async (_label, type, value, reason) => {
    const rig = makeRig();
    const { armed: armedFrame } = await arm(rig);
    if (type === "page.changed") {
      await rig.handle("extension", "page.changed", {
        tabId: rig.snapshot.tabId,
        url: rig.snapshot.url,
        reason: "navigation",
        structuralHash: rig.snapshot.structuralHash,
      });
    } else if (type === "ptt") {
      await rig.handle("voice", "ptt", { state: "start" });
    } else if (type === "control") {
      await rig.handle("voice", "control", { cmd: value });
    } else {
      await rig.handle("voice", "utterance", { utteranceId: `u-${value}`, text: value, source: "typed" });
    }

    expect(rig.session.pendingGatedAction).toBeNull();
    expect(rig.frames("confirm.cleared").some((frame) =>
      frame.payload.grantId === armedFrame.payload.grantId && frame.payload.reason === reason,
    )).toBe(true);
    expect(rig.requests.filter((request) => request.type === "act.request" &&
      (request.payload as ActRequest).action.op === "click")).toHaveLength(0);
  });
});
