import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import {
  buildFrame,
  FormModel,
  parseFrame,
  type ActRequest,
  type Message,
  type MessageType,
  type PayloadOf,
} from "@blip/protocol";
import { createStubGate } from "../../../apps/server/src/voice/gate-port";
import { createDialogueHandlers, sendSpeakEffect } from "../../../apps/server/src/voice/dialogue-runner";
import type { SpeakEffect } from "@blip/dialogue";
import { Session } from "../../../apps/server/src/session/session";
import type { HandlerContext, Hub } from "../../../apps/server/src/hub/hub";
import { echoText, requiredEmptyText } from "../../../packages/dialogue/src/templates";
import fixtureJson from "../../../fixtures/forms/broken-form.model.json" with { type: "json" };
import { startReal } from "./run-real";

type Speak = Extract<Message, { type: "speak" }>;
type Sent = { role: string; type: string; payload: unknown };

const form = FormModel.parse(fixtureJson);
const closers: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(read: () => T | undefined, label: string): Promise<T> {
  for (let i = 0; i < 500; i++) {
    const value = read();
    if (value !== undefined) return value;
    await delay(10);
  }
  throw new Error(`timed out waiting for ${label}`);
}

function speaks(frames: Message[]): Speak[] {
  return frames.filter((frame): frame is Speak => frame.type === "speak");
}

function nextSpeak(frames: Message[], start: number): Promise<Speak> {
  return waitFor(() => speaks(frames).slice(start)[0], "speak frame");
}

function send<T extends MessageType>(ws: WebSocket, type: T, payload: PayloadOf<T>): void {
  ws.send(JSON.stringify(buildFrame(type, payload)));
}

function message<T extends MessageType>(type: T, payload: PayloadOf<T>): Message {
  const parsed = parseFrame(JSON.stringify(buildFrame(type, payload)));
  if (!parsed.ok) throw new Error(`could not build ${type} test frame`);
  return parsed.message;
}

function recordingHub(): { hub: Hub; sent: Sent[] } {
  const sent: Sent[] = [];
  const hub = {
    send(role: string, type: string, payload: unknown) {
      sent.push({ role, type, payload });
      return true;
    },
    async request() {
      throw new Error("unexpected hub request");
    },
    pushState() {
      return true;
    },
    close() {},
  } as unknown as Hub;
  return { hub, sent };
}

function voiceContext(hub: Hub, session: Session, msg: Message): HandlerContext {
  return { role: "voice", hub, session, message: msg };
}

describe("real voice dialogue runner", () => {
  it("reads, fills from observed page values, gates submission, and never sends a click", async () => {
    let clock = 100_000;
    const actRequests: ActRequest[] = [];
    const real = await startReal({
      port: 0,
      fakeDelayMs: 0,
      now: () => clock,
      onActRequest: (request) => actRequests.push(request),
    });
    closers.push(() => real.close());

    const ws = new WebSocket(`ws://127.0.0.1:${real.server.port}/ws`, {
      origin: `http://127.0.0.1:${real.server.port}`,
    });
    closers.push(() => ws.terminate());
    const frames: Message[] = [];
    ws.on("message", (data) => {
      const parsed = parseFrame(data.toString());
      if (parsed.ok) frames.push(parsed.message);
    });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    send(ws, "hello", { role: "voice", clientVersion: "test", protocolVersion: 1 });

    const stateCount = (): number => frames.filter((frame) => frame.type === "state").length;

    const utter = async (text: string): Promise<Speak> => {
      const start = speaks(frames).length;
      const beforeStates = stateCount();
      send(ws, "utterance", { utteranceId: `u-${start}-${text.length}`, text, source: "typed" });
      const speak = await nextSpeak(frames, start);
      await waitFor(() => stateCount() >= beforeStates + 2 ? stateCount() : undefined, "utterance completion state");
      return speak;
    };
    const done = async (speak: Speak): Promise<void> => {
      const beforeStates = stateCount();
      send(ws, "speak.done", { speakId: speak.payload.speakId, interrupted: false });
      await waitFor(() => stateCount() > beforeStates ? stateCount() : undefined, "speak.done completion state");
    };

    const read = await utter("read the form");
    expect(read.payload.text).toMatch(/^Field 1:/);
    await done(read);

    const textTypes = new Set(["text", "email", "tel", "url", "number", "date", "time", "textarea", "unknown"]);
    const firstTextField = form.fields.find((field) =>
      !field.disabled && field.label.trim() !== "" && textTypes.has(field.type),
    );
    expect(firstTextField).toBeDefined();
    const firstValue = "Rowan Example";
    const echoStart = speaks(frames).length;
    const echo = await utter(`${firstTextField!.label} is ${firstValue}`);
    expect(actRequests).toHaveLength(1);
    expect(actRequests[0]?.action.op).toBe("fill");
    const firstAct = actRequests[0]!;
    const actResult = real.extension!.sent()
      .filter((frame) => frame.type === "act.result")
      .map((frame) => frame.payload as { actId?: string; observedValue?: string | null })
      .find((result) => result.actId === firstAct.actId);
    expect(actResult?.observedValue).toBeDefined();
    expect(echo.payload.text).toBe(echoText(firstTextField!, actResult!.observedValue!, false));
    expect(speaks(frames).length).toBe(echoStart + 1);
    await done(echo);

    const missingText = requiredEmptyText(form);
    const missing = await utter("submit");
    expect(missing.payload.text).toBe(missingText);
    await delay(300);
    expect(frames.some((frame) => frame.type === "confirm.armed")).toBe(false);
    await done(missing);

    const requiredFields = form.fields.filter((field) => field.required && !field.disabled);
    for (const field of requiredFields) {
      const value = field.type === "select" || field.type === "radio-group"
        ? field.options?.find((option) => option.value !== "")?.label ?? "friend"
        : field.autocomplete === "email" || field.type === "email"
          ? "rowan@example.test"
          : field.autocomplete === "tel" || field.type === "tel"
            ? "2125550100"
            : "A clear answer";
      const fieldNumber = form.fields.filter((candidate) => !candidate.disabled).sort((a, b) => a.order - b.order).findIndex((candidate) => candidate.id === field.id) + 1;
      const label = field.label.trim() || `field ${fieldNumber}`;
      const filled = await utter(`${label} is ${value}`);
      await done(filled);
    }

    const readback = await utter("submit");
    expect(readback.payload.category).toBe("readback");
    await delay(80);
    expect(frames.some((frame) => frame.type === "confirm.armed")).toBe(false);
    const blockedEarconsBeforeArm = frames.filter((frame) => frame.type === "earcon" && frame.payload.name === "blocked").length;
    const readbackDoneStart = frames.length;
    await done(readback);
    const armed = await waitFor(
      () => frames.slice(readbackDoneStart).find((frame): frame is Extract<Message, { type: "confirm.armed" }> => frame.type === "confirm.armed"),
      "confirm.armed",
    );
    expect(["submit form", "submit survey"]).toContain(armed.payload.phrase);
    await waitFor(
      () => frames.find((frame) => frame.type === "earcon" && frame.payload.name === "blocked" && frame),
      "blocked earcon",
    );
    expect(frames.filter((frame) => frame.type === "earcon" && frame.payload.name === "blocked")).toHaveLength(blockedEarconsBeforeArm + 1);

    const promptStart = speaks(frames).length;
    const prompt = await waitFor(() => speaks(frames).find((frame) =>
      speaks(frames).indexOf(frame) >= promptStart - 1 && frame.payload.category === "confirm-prompt",
    ), "confirm prompt");
    expect(prompt.payload.text).toContain(armed.payload.phrase);
    await done(prompt);

    const clearsBeforeRefusals = frames.filter((frame) => frame.type === "confirm.cleared").length;
    const phraseBeforeWindow = await utter(armed.payload.phrase);
    expect(phraseBeforeWindow.payload.text).toBe(`Not submitting. I need you to say '${armed.payload.phrase}'.`);
    await done(phraseBeforeWindow);

    clock += 1_001;
    const stoppedStart = speaks(frames).length;
    const statesBeforeStop = stateCount();
    send(ws, "control", { cmd: "stop" });
    await waitFor(() => stateCount() > statesBeforeStop ? stateCount() : undefined, "control stop completion state");
    const stopped = await nextSpeak(frames, stoppedStart);
    expect(stopped.payload.text).toBe("Stopped.");
    const phraseAfterStop = await utter(armed.payload.phrase);
    expect(phraseAfterStop.payload.text).toBe(`Not submitting. I need you to say '${armed.payload.phrase}'.`);
    await done(stopped);
    await done(phraseAfterStop);

    const blockedBeforeYes = frames.filter((frame) => frame.type === "earcon" && frame.payload.name === "blocked").length;
    const yes = await utter("yes");
    expect(yes.payload.text).toBe(`Not submitting. I need you to say '${armed.payload.phrase}'.`);
    await waitFor(
      () => frames.filter((frame) => frame.type === "earcon" && frame.payload.name === "blocked").length === blockedBeforeYes + 1
        ? frames.filter((frame) => frame.type === "earcon" && frame.payload.name === "blocked").length
        : undefined,
      "blocked earcon after bare yes",
    );
    expect(frames.filter((frame) => frame.type === "confirm.cleared")).toHaveLength(clearsBeforeRefusals);
    await done(yes);

    const earlyExact = await utter(armed.payload.phrase);
    expect(earlyExact.payload.text).toBe(`Not submitting. I need you to say '${armed.payload.phrase}'.`);
    await done(earlyExact);

    clock += 1_001;
    const afterWindowStart = frames.length;
    const gateRefusal = await utter(armed.payload.phrase);
    expect(gateRefusal.payload.text).toContain("safety gate is not connected");
    await waitFor(
      () => frames.slice(afterWindowStart).find((frame): frame is Extract<Message, { type: "confirm.cleared" }> => frame.type === "confirm.cleared"),
      "confirm.cleared after gate refusal",
    );

    expect(actRequests.every((request) => ["fill", "select", "focus"].includes(request.action.op))).toBe(true);
    expect(actRequests.some((request) => "gate" in request)).toBe(false);
    expect(actRequests.some((request) => (request.action as { op: string }).op === "click")).toBe(false);
  });

  it("rejects untracked speech and ignores non-voice utterance handler calls", async () => {
    let clock = 0;
    const { hub, sent } = recordingHub();
    expect(() => sendSpeakEffect(hub, {
      kind: "speak",
      text: "untracked",
      category: "answer",
      interruptible: true,
    } as SpeakEffect)).toThrow(/tracked speakId/);
    expect(sent).toHaveLength(0);

    const session = new Session("fake");
    const handlers = createDialogueHandlers({ gate: createStubGate(() => clock), now: () => clock });
    const context: HandlerContext = {
      role: "extension",
      message: message("utterance", { utteranceId: "wrong-role", text: "read the form", source: "typed" }),
      hub,
      session,
    };
    await handlers.utterance?.(context);
    expect(sent).toHaveLength(0);
    expect(session.busy).toBe(false);
  });

  it("turns a rejecting GatePort redeem into a spoken refusal instead of staying executing", async () => {
    let clock = 5_000;
    const { hub, sent } = recordingHub();
    const session = new Session("fake");
    session.extensionConnected = true;
    const filledForm = FormModel.parse(fixtureJson);
    for (const field of filledForm.fields) {
      if (!field.required) continue;
      field.hasValue = true;
      field.value = field.type === "select" ? "friend" : "rowan@example.test";
    }
    session.model = filledForm;
    session.stale = false;
    const handlers = createDialogueHandlers({
      now: () => clock,
      gate: {
        async arm() {
          return { ok: true, grantId: "grant-1", phrase: "submit survey", expiresAt: clock + 30_000 };
        },
        async clear() {},
        async redeem() {
          throw new Error("gate unavailable");
        },
      },
    });
    const utter = async (text: string): Promise<void> => {
      const ctx = voiceContext(hub, session, message("utterance", {
        utteranceId: `u-${text.length}-${clock}`,
        text,
        source: "typed",
      }));
      await handlers.utterance?.(ctx);
    };
    const speakDone = async (speakId: string): Promise<void> => {
      const ctx = voiceContext(hub, session, message("speak.done", { speakId, interrupted: false }));
      await handlers["speak.done"]?.(ctx);
    };

    await utter("submit");
    const readback = sent.findLast((frame) => frame.type === "speak")?.payload as { speakId: string; category: string };
    expect(readback.category).toBe("readback");
    await speakDone(readback.speakId);
    expect(sent.some((frame) => frame.type === "confirm.armed")).toBe(true);
    const prompt = sent.findLast((frame) => frame.type === "speak")?.payload as { speakId: string };
    await speakDone(prompt.speakId);

    clock += 1_001;
    await utter("submit survey");
    const speakPayloads = sent.filter((frame) => frame.type === "speak").map((frame) => frame.payload as { text: string });
    expect(speakPayloads.some((payload) => payload.text === "That didn't go through. Nothing was submitted.")).toBe(true);
    expect(sent.some((frame) => frame.type === "confirm.cleared" && (frame.payload as { reason: string }).reason === "cancelled")).toBe(true);
  });
});
