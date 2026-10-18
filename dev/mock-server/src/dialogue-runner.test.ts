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
  type Snapshot,
} from "@blip/protocol";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { createStubGate } from "../../../apps/server/src/voice/gate-port";
import { createDialogueHandlers, sendSpeakEffect } from "../../../apps/server/src/voice/dialogue-runner";
import type { SpeakEffect } from "@blip/dialogue";
import { Session } from "../../../apps/server/src/session/session";
import type { HandlerContext, Hub } from "../../../apps/server/src/hub/hub";
import { echoText, requiredEmptyText, spellValueText, untrustedInstructionWarningText } from "../../../packages/dialogue/src/templates";
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
    const doneIds = new Set<string>();
    const done = async (speak: Speak): Promise<void> => {
      doneIds.add(speak.payload.speakId);
      const beforeStates = stateCount();
      send(ws, "speak.done", { speakId: speak.payload.speakId, interrupted: false });
      await waitFor(() => stateCount() > beforeStates ? stateCount() : undefined, "speak.done completion state");
    };
    const finishRemainingSpeeches = async (start: number): Promise<void> => {
      let index = start;
      while (index < speaks(frames).length) {
        const candidate = speaks(frames)[index]!;
        index += 1;
        if (!doneIds.has(candidate.payload.speakId)) await done(candidate);
      }
    };

    const read = await utter("read the form");
    expect(read.payload.text).toMatch(/^I guessed /);
    expect(read.payload.text).toContain("Field 1:");
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

    const spelled = await utter(`spell ${firstTextField!.label}`);
    expect(spelled.payload.text).toBe(spellValueText(actResult!.observedValue!));
    expect(spelled.payload.speakId).toMatch(/^b\d+$/);
    const spelledStart = speaks(frames).length - 1;
    await done(spelled);
    expect(frames.filter((frame) => frame.type === "speak").at(spelledStart)?.payload.speakId).toBe(spelled.payload.speakId);

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
      const speechStart = speaks(frames).length;
      const filled = await utter(`${label} is ${value}`);
      await done(filled);
      await finishRemainingSpeeches(speechStart);
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
    expect(phraseAfterStop.payload.category).toBe("readback");
    await done(stopped);
    await done(phraseAfterStop);
    const rearmed = await waitFor(
      () => frames.slice(stoppedStart).findLast((frame): frame is Extract<Message, { type: "confirm.armed" }> => frame.type === "confirm.armed"),
      "confirm.armed after stop cancelled the previous grant",
    );
    const rearmedPrompt = frames.filter((frame): frame is Extract<Message, { type: "speak" }> =>
      frame.type === "speak" && frame.payload.category === "confirm-prompt",
    ).findLast((frame) => frame.payload.text.includes(rearmed.payload.phrase));
    if (rearmedPrompt !== undefined) await done(rearmedPrompt);
    expect(frames.filter((frame) => frame.type === "confirm.cleared").length).toBeGreaterThan(0);
    const clearsBeforeRefusals = frames.filter((frame) => frame.type === "confirm.cleared").length;

    const blockedBeforeYes = frames.filter((frame) => frame.type === "earcon" && frame.payload.name === "blocked").length;
    const yes = await utter("yes");
    expect(yes.payload.text).toBe(`Not submitting. I need you to say '${rearmed.payload.phrase}'.`);
    await waitFor(
      () => frames.filter((frame) => frame.type === "earcon" && frame.payload.name === "blocked").length === blockedBeforeYes + 1
        ? frames.filter((frame) => frame.type === "earcon" && frame.payload.name === "blocked").length
        : undefined,
      "blocked earcon after bare yes",
    );
    expect(frames.filter((frame) => frame.type === "confirm.cleared")).toHaveLength(clearsBeforeRefusals);
    await done(yes);

    const earlyExact = await utter(rearmed.payload.phrase);
    expect(earlyExact.payload.text).toBe(`Not submitting. I need you to say '${rearmed.payload.phrase}'.`);
    await done(earlyExact);

    clock += 1_001;
    const afterWindowStart = frames.length;
    const gateRefusal = await utter(rearmed.payload.phrase);
    expect(gateRefusal.payload.text).toContain("The page refused the action");
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

  it("blocks a short sensitive disclosure before transcript or model routing without a matching field", async () => {
    let clock = 0;
    const sentinel = "private-short-sentinel-38461";
    const { hub, sent } = recordingHub();
    const session = new Session("fake");
    session.model = form;
    session.extensionConnected = true;
    session.stale = false;
    let intentCalls = 0;
    const handlers = createDialogueHandlers({
      gate: createStubGate(() => clock),
      now: () => clock,
      parseIntent: async () => { intentCalls += 1; },
    });
    for (const [index, text] of [
      `the password is ${sentinel}`,
      `fill password is ${sentinel}`,
      `spell the password is ${sentinel}`,
    ].entries()) {
      const ctx = voiceContext(hub, session, message("utterance", {
        utteranceId: `short-sensitive-no-field-${index}`,
        text,
        source: "typed",
      }));
      await handlers.utterance?.(ctx);
    }

    expect(sent.filter((frame) => frame.type === "transcript").map((frame) => frame.payload)).toEqual(
      [0, 1, 2].map((index) => ({
        utteranceId: `short-sensitive-no-field-${index}`,
        heardAs: "[sensitive entry withheld]",
        routedTo: "grammar",
      })),
    );
    expect(JSON.stringify(sent)).not.toContain(sentinel);
    expect(intentCalls).toBe(0);
  });

  it("fails closed for opaque short utterances when no page is available", async () => {
    let clock = 0;
    const sentinel = "opaque-short-sentinel-51608";
    const { hub, sent } = recordingHub();
    const session = new Session("fake");
    let intentCalls = 0;
    const handlers = createDialogueHandlers({
      gate: createStubGate(() => clock),
      now: () => clock,
      parseIntent: async () => { intentCalls += 1; },
    });
    const ctx = voiceContext(hub, session, message("utterance", {
      utteranceId: "opaque-short-no-page",
      text: sentinel,
      source: "typed",
    }));

    await handlers.utterance?.(ctx);

    expect(sent.find((frame) => frame.type === "transcript")?.payload).toEqual({
      utteranceId: "opaque-short-no-page",
      heardAs: "[sensitive entry withheld]",
      routedTo: "grammar",
    });
    expect(JSON.stringify(sent)).not.toContain(sentinel);
    expect(intentCalls).toBe(0);
  });

  it("withholds sensitive dictation from transcript, speech, reducer state, and intent parsing", async () => {
    let clock = 0;
    const sentinel = "secret-sentinel-82641";
    const { hub, sent } = recordingHub();
    const session = new Session("fake");
    const sensitiveForm = FormModel.parse({
      ...form,
      fields: form.fields.map((field) => field.id === "e2"
        ? { ...field, label: "Password", type: "password", sensitive: "password", hasValue: true, value: null }
        : field),
    });
    session.model = sensitiveForm;
    session.extensionConnected = true;
    session.stale = false;
    let intentCalls = 0;
    const handlers = createDialogueHandlers({
      gate: createStubGate(() => clock),
      now: () => clock,
      parseIntent: async () => { intentCalls += 1; },
    });
    const utter = async (text: string): Promise<void> => {
      const ctx = voiceContext(hub, session, message("utterance", {
        utteranceId: `sensitive-${clock++}`,
        text,
        source: "typed",
      }));
      await handlers.utterance?.(ctx);
    };

    await utter(`change password to ${sentinel}${"x".repeat(205)}`);
    await utter(`change password to ${sentinel}`);
    await utter(sentinel);
    await utter("done");

    const transcript = sent.filter((frame) => frame.type === "transcript").map((frame) => frame.payload);
    expect(transcript[0]).toEqual({ utteranceId: "sensitive-0", heardAs: "[sensitive entry withheld]", routedTo: "grammar" });
    expect(transcript[1]).toEqual({ utteranceId: "sensitive-1", heardAs: "[sensitive entry withheld]", routedTo: "grammar" });
    expect(transcript[2]).toEqual({ utteranceId: "sensitive-2", heardAs: "[sensitive entry withheld]", routedTo: "grammar" });
    expect(transcript[3]).toEqual({ utteranceId: "sensitive-3", heardAs: "done", routedTo: "grammar" });
    expect(JSON.stringify(sent)).not.toContain(sentinel);
    expect(session.lastSpoken).not.toContain(sentinel);
    expect(intentCalls).toBe(0);
    expect(sent.some((frame) => frame.type === "speak" && (frame.payload as { text: string }).text.includes("entered, hidden"))).toBe(true);
  });

  it("fails closed and redacts long utterances when a fresh page snapshot is unavailable", async () => {
    let clock = 0;
    const sentinel = "private-sentinel-51927";
    const { hub, sent } = recordingHub();
    const session = new Session("fake");
    session.model = form;
    session.extensionConnected = true;
    session.stale = true;
    let intentCalls = 0;
    const handlers = createDialogueHandlers({
      gate: createStubGate(() => clock),
      now: () => clock,
      parseIntent: async () => { intentCalls += 1; },
    });
    const ctx = voiceContext(hub, session, message("utterance", {
      utteranceId: "stale-sensitive-0",
      text: `change field to ${sentinel}${"x".repeat(205)}`,
      source: "typed",
    }));

    await handlers.utterance?.(ctx);

    const transcript = sent.find((frame) => frame.type === "transcript");
    expect(transcript?.payload).toEqual({
      utteranceId: "stale-sensitive-0",
      heardAs: "[sensitive entry withheld]",
      routedTo: "grammar",
    });
    expect(JSON.stringify(sent)).not.toContain(sentinel);
    expect(intentCalls).toBe(0);
    expect(sent.some((frame) => frame.type === "speak"
      && (frame.payload as { text: string }).text.includes("until the page is available"))).toBe(true);
  });

  it("redacts arbitrary dictation if a sensitive field loses its page context", async () => {
    let clock = 0;
    const sentinel = "stale-sensitive-sentinel-64017";
    const { hub, sent } = recordingHub();
    const session = new Session("fake");
    session.model = FormModel.parse({
      ...form,
      fields: form.fields.map((field) => field.id === "e2"
        ? { ...field, label: "Password", type: "password", sensitive: "password", hasValue: true, value: null }
        : field),
    });
    session.extensionConnected = true;
    session.stale = false;
    let intentCalls = 0;
    const handlers = createDialogueHandlers({
      gate: createStubGate(() => clock),
      now: () => clock,
      parseIntent: async () => { intentCalls += 1; },
    });
    const utter = async (id: string, text: string): Promise<void> => {
      const ctx = voiceContext(hub, session, message("utterance", { utteranceId: id, text, source: "typed" }));
      await handlers.utterance?.(ctx);
    };

    await utter("sensitive-focus-before-stale", "change password");
    session.stale = true;
    await utter("sensitive-focus-after-stale", sentinel);

    expect(sent.filter((frame) => frame.type === "transcript").map((frame) => frame.payload)).toEqual([
      { utteranceId: "sensitive-focus-before-stale", heardAs: "[sensitive entry withheld]", routedTo: "grammar" },
      { utteranceId: "sensitive-focus-after-stale", heardAs: "[sensitive entry withheld]", routedTo: "grammar" },
    ]);
    expect(JSON.stringify(sent)).not.toContain(sentinel);
    expect(intentCalls).toBe(0);
  });

  it("normalizes punctuation variants of sensitive terms before model routing", async () => {
    let clock = 0;
    const sentinel = "private-sentinel-91357";
    const { hub, sent } = recordingHub();
    const session = new Session("fake");
    session.model = form;
    session.extensionConnected = true;
    session.stale = false;
    let intentCalls = 0;
    const handlers = createDialogueHandlers({
      gate: createStubGate(() => clock),
      now: () => clock,
      parseIntent: async () => { intentCalls += 1; },
    });
    const ctx = voiceContext(hub, session, message("utterance", {
      utteranceId: "punctuated-sensitive-0",
      text: `here is my one-time code ${sentinel}${"x".repeat(205)}`,
      source: "typed",
    }));

    await handlers.utterance?.(ctx);

    const transcript = sent.find((frame) => frame.type === "transcript");
    expect(transcript?.payload).toEqual({
      utteranceId: "punctuated-sensitive-0",
      heardAs: "[sensitive entry withheld]",
      routedTo: "grammar",
    });
    expect(JSON.stringify(sent)).not.toContain(sentinel);
    expect(intentCalls).toBe(0);
  });

  it("fills the exact email profile match locally and echoes the page observation", async () => {
    let clock = 2_000;
    const requests: ActRequest[] = [];
    const real = await startReal({ port: 0, fakeDelayMs: 0, now: () => clock, onActRequest: (request) => requests.push(request) });
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
    const before = frames.filter((frame) => frame.type === "state").length;
    send(ws, "utterance", { utteranceId: "profile-fill", text: "fill from my profile", source: "typed" });
    const speak = await nextSpeak(frames, 0);
    await waitFor(() => frames.filter((frame) => frame.type === "state").length >= before + 2 ? true : undefined, "profile fill completion");

    const email = form.fields.find((field) => field.autocomplete === "email");
    expect(email).toBeDefined();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.action).toEqual({ op: "fill", targetId: email!.id, value: "rowan@example.com" });
    const observed = real.extension!.sent()
      .filter((frame) => frame.type === "act.result")
      .map((frame) => frame.payload as { actId?: string; observedValue?: string | null })
      .find((result) => result.actId === requests[0]!.actId)?.observedValue;
    expect(typeof observed).toBe("string");
    expect(speak.payload.text).toBe(echoText(email!, observed!, false));
    expect(frames.some((frame) => frame.type === "transcript" && frame.payload.routedTo === "grammar")).toBe(true);
    await waitFor(() => speaks(frames).find((frame) => frame.payload.text.startsWith("Filled ")), "profile summary");

    const undoStart = speaks(frames).length;
    const undoStates = frames.filter((frame) => frame.type === "state").length;
    send(ws, "utterance", { utteranceId: "profile-undo", text: "undo", source: "typed" });
    const undone = await waitFor(
      () => speaks(frames).slice(undoStart).find((frame) => frame.payload.text.startsWith("Undid changes to ")),
      "profile undo summary",
    );
    await waitFor(() => frames.filter((frame) => frame.type === "state").length > undoStates ? true : undefined, "undo completion state");
    expect(requests).toHaveLength(2);
    expect(requests[1]?.action).toEqual({ op: "fill", targetId: email!.id, value: "" });
    expect(real.extension!.elements().find((element) => element.id === email!.id)?.value).toBe("");

    const secondUndoStart = speaks(frames).length;
    send(ws, "utterance", { utteranceId: "profile-undo-again", text: "undo", source: "typed" });
    const noUndo = await nextSpeak(frames, secondUndoStart);
    expect(noUndo.payload.text).toBe("There's nothing left to undo.");
    expect(requests).toHaveLength(2);
  }, 15_000);

  it("leaves a profile value edited on the page untouched during undo", async () => {
    let clock = 3_000;
    let snapshot: Snapshot = loadSnapshot("broken");
    const acts: ActRequest[] = [];
    const sent: Sent[] = [];
    const session = new Session("fake");
    session.extensionConnected = true;
    const hub = {
      send(role: string, type: string, payload: unknown) { sent.push({ role, type, payload }); return true; },
      async request(_role: string, type: string, payload: unknown) {
        if (type === "snapshot.request") return { payload: { ok: true, snapshot: structuredClone(snapshot) } };
        if (type === "act.request") {
          const request = payload as ActRequest;
          acts.push(request);
          const element = snapshot.elements.find((item) => item.id === request.action.targetId);
          if (request.action.op === "fill" && element) {
            element.value = request.action.value;
            element.hasValue = request.action.value !== "";
            snapshot = { ...snapshot, version: snapshot.version + 1 };
            return { payload: { actId: request.actId, ok: true, observedValue: element.value } };
          }
        }
        throw new Error(`unexpected request: ${type}`);
      },
      pushState() { return true; },
      close() {},
    } as unknown as Hub;
    const handlers = createDialogueHandlers({ gate: createStubGate(() => clock), now: () => clock });
    const utter = (id: string, text: string) => handlers.utterance?.(voiceContext(hub, session, message("utterance", {
      utteranceId: id, text, source: "typed",
    })));
    await utter("profile-fill-edit", "fill from my profile");
    expect(sent.some((frame) => frame.type === "speak" && (frame.payload as { text: string }).text.startsWith("Filled "))).toBe(true);
    expect(acts).toHaveLength(1);
    const emailTarget = acts[0]!.action.targetId;
    const element = snapshot.elements.find((item) => item.id === emailTarget);
    expect(element).toBeDefined();

    element!.value = "edited-by-user@example.test";
    element!.hasValue = true;
    snapshot = { ...snapshot, version: snapshot.version + 1 };
    const pageChange = voiceContext(hub, session, message("page.changed", {
      tabId: snapshot.tabId, url: snapshot.url, reason: "mutation", structuralHash: snapshot.structuralHash,
    }));
    pageChange.role = "extension";
    await handlers["page.changed"]?.(pageChange);

    await utter("profile-undo-edit", "undo");
    const summary = sent.filter((frame) => frame.type === "speak")
      .map((frame) => (frame.payload as { text: string }).text)
      .find((text) => text.includes("unchanged because the page values changed"));
    expect(summary).toContain("couldn't undo any fields");
    expect(acts).toHaveLength(1);
    expect(element!.value).toBe("edited-by-user@example.test");
  }, 15_000);

  it("projects the approved GATE-07 bit and warns before page responses on entry and changed snapshots", async () => {
    let clock = 9_000;
    let snapshot: Snapshot = {
      ...loadSnapshot("gate-07"),
      title: "Submit survey",
      untrustedInstructionDetected: true,
    };
    const sent: Sent[] = [];
    let gateArms = 0;
    const session = new Session("fake");
    session.extensionConnected = true;
    const hub = {
      send(role: string, type: string, payload: unknown) { sent.push({ role, type, payload }); return true; },
      async request(_role: string, type: string) {
        if (type !== "snapshot.request") throw new Error(`unexpected request: ${type}`);
        const response = message("snapshot.result", { ok: true, snapshot });
        if (response.type !== "snapshot.result") throw new Error("snapshot result frame was not built");
        return { payload: response.payload };
      },
      pushState() { return true; },
      close() {},
    } as unknown as Hub;
    const handlers = createDialogueHandlers({
      now: () => clock,
      gate: {
        async arm() { gateArms += 1; return { ok: false, reason: "not-gated" }; },
        async clear() {},
        async redeem() { throw new Error("unexpected redeem"); },
      },
    });
    const utter = async (id: string, text: string) => handlers.utterance?.(voiceContext(hub, session, message("utterance", {
      utteranceId: id, text, source: "typed",
    })));

    await utter("injection-entry", "what's here");
    expect(session.statePayload().page?.untrustedInstructionDetected).toBe(true);
    let spoken = sent.filter((frame) => frame.type === "speak").map((frame) => (frame.payload as { text: string }).text);
    expect(spoken[0]).toBe(untrustedInstructionWarningText());
    expect(spoken[1]).toContain("Submit survey");
    expect(gateArms).toBe(0);

    const speakCount = spoken.length;
    snapshot = { ...snapshot, version: snapshot.version + 1 };
    const changed = voiceContext(hub, session, message("page.changed", {
      tabId: snapshot.tabId, url: snapshot.url, reason: "mutation", structuralHash: snapshot.structuralHash,
    }));
    changed.role = "extension";
    await handlers["page.changed"]?.(changed);
    spoken = sent.filter((frame) => frame.type === "speak").map((frame) => (frame.payload as { text: string }).text);
    expect(spoken.slice(speakCount)[0]).toBe(untrustedInstructionWarningText());
    expect(gateArms).toBe(0);
    expect(sent.some((frame) => frame.type === "confirm.armed")).toBe(false);
    expect(clock).toBe(9_000);
  });

  it("passes only value-free form metadata to the intent parser", async () => {
    let clock = 0;
    const { hub, sent } = recordingHub();
    const sentinel = "private-page-value-sentinel";
    const session = new Session("fake");
    session.extensionConnected = true;
    session.model = FormModel.parse({
      ...fixtureJson,
      fields: FormModel.parse(fixtureJson).fields.map((field) => field.id === "e2"
        ? { ...field, hasValue: true, value: sentinel }
        : field),
    });
    session.stale = false;
    let intentInput: string | undefined;
    let intentContext: HandlerContext | undefined;
    const handlers = createDialogueHandlers({
      gate: createStubGate(() => clock),
      now: () => clock,
      parseIntent: async (input, context) => { intentInput = input; intentContext = context; },
    });
    const ctx = voiceContext(hub, session, message("utterance", {
      utteranceId: "intent-projection", text: "an unmatched request", source: "typed",
    }));
    await handlers.utterance?.(ctx);
    expect(intentInput).toBe("an unmatched request");
    expect(intentContext?.session.model?.fields.find((field) => field.id === "e2")?.hasValue).toBe(true);
    expect(JSON.stringify(sent)).not.toContain(sentinel);
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
          return { ok: true, grantId: "grant-1", speakId: "speak-1", phrase: "submit survey", expiresAt: clock + 30_000 };
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
