import { describe, expect, it, vi } from "vitest";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { newId, type Message } from "@blip/protocol";
import { phraseForKind } from "@blip/policy/confirmation";
import type { IntentBrain } from "../src/brain/fake-brain";
import type { Hub } from "../src/hub/hub";
import { buildBaselineFormModel } from "../src/baseline";
import { interpretResult } from "../src/results/interpret";
import { executeGatedAction, handleGatedSpeakDone } from "../src/act/gated";
import type { Refresher } from "../src/session/refresh";
import { Session } from "../src/session/session";
import { handleUtterance } from "../src/turn";

function interpretFixture(name: Parameters<typeof loadSnapshot>[0]) {
  const snapshot = loadSnapshot(name);
  return { snapshot, result: interpretResult(snapshot, buildBaselineFormModel(snapshot)) };
}

describe("interpretResult", () => {
  it("confirms only from bounded page evidence and extracts a number from that evidence", () => {
    const { result } = interpretFixture("result-ok");

    expect(result).toEqual({
      status: "confirmed",
      confirmationNumber: "BK-48213",
      fieldErrors: [],
      pageErrors: [],
    });
  });

  it("does not treat a title-only confirmation as evidence", () => {
    const snapshot = loadSnapshot("result-ok");
    snapshot.headings = [];
    snapshot.alerts = [];

    expect(interpretResult(snapshot, buildBaselineFormModel(snapshot))).toEqual({
      status: "unverified",
      confirmationNumber: null,
      fieldErrors: [],
      pageErrors: [],
    });
  });

  it("does not treat navigation alone as evidence", () => {
    const snapshot = loadSnapshot("booking");
    snapshot.url = "http://127.0.0.1:7777/fixtures/forms/booking-done.html";
    snapshot.headings = [];
    snapshot.alerts = [];

    expect(interpretResult(snapshot, buildBaselineFormModel(snapshot)).status).toBe("unverified");
  });

  it("does not combine a fresh page with a model from a different snapshot", () => {
    const snapshot = loadSnapshot("result-errors");
    const model = buildBaselineFormModel(snapshot);
    snapshot.version += 1;

    expect(interpretResult(snapshot, model)).toEqual({
      status: "unverified",
      confirmationNumber: null,
      fieldErrors: [],
      pageErrors: [],
    });
  });

  it("reports every labeled field error in document order and page errors separately", () => {
    const { result } = interpretFixture("result-errors");

    expect(result).toEqual({
      status: "errors",
      confirmationNumber: null,
      fieldErrors: [
        { label: "Email address", message: "Enter a valid email address." },
        { label: "Check-in date", message: "Check-in date is required." },
      ],
      pageErrors: ["Please fix 2 errors before continuing."],
    });
  });

  it("does not borrow a number from a different alert than the confirmation evidence", () => {
    const snapshot = loadSnapshot("result-ok");
    snapshot.headings = [{ level: 1, text: "Booking confirmed" }];
    snapshot.alerts = ["Reference code BK-99999"];

    expect(interpretResult(snapshot, buildBaselineFormModel(snapshot))).toMatchObject({
      status: "confirmed",
      confirmationNumber: null,
      pageErrors: ["Reference code BK-99999"],
    });
  });

  it("redacts current field values and long sensitive numbers from reported errors", () => {
    const snapshot = loadSnapshot("result-errors");
    const model = buildBaselineFormModel(snapshot);
    const email = model.fields.find((field) => field.label === "Email address")!;
    email.error = `Invalid value ${email.value}; card 4111 1111 1111 1111 was rejected.`;
    model.pageErrors = ["The submitted profile Ann Lee with CVV: 123 and Password: hunter2 could not be verified."];

    const result = interpretResult(snapshot, model);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("ann@");
    expect(serialized).not.toContain("4111");
    expect(serialized).not.toContain("Ann Lee");
    expect(serialized).not.toContain("123");
    expect(serialized).not.toContain("hunter2");
    expect(result.fieldErrors[0]?.label).toBe("Email address");
  });
});

describe("what went wrong", () => {
  async function requestCurrentErrors(initialName: Parameters<typeof loadSnapshot>[0], freshSnapshot: ReturnType<typeof loadSnapshot>) {
    const session = new Session("fake");
    session.extensionConnected = true;
    session.applySnapshot(loadSnapshot(initialName));
    const messages: Array<{ type: string; payload: any }> = [];
    const hub = {
      send: vi.fn((_role: string, type: string, payload: any) => {
        messages.push({ type, payload });
        return true;
      }),
      pushState: vi.fn(),
    } as unknown as Hub;
    const refresher = {
      request: vi.fn(async () => {
        session.applySnapshot(freshSnapshot);
        return { ok: true, applied: true } as const;
      }),
    } as unknown as Refresher;

    await handleUtterance({
      message: { type: "utterance", payload: { utteranceId: newId(), text: "What went wrong?" } } as Message,
      hub,
      session,
      freshnessMs: 2_000,
      refresher,
      brain: { parseIntent: vi.fn() } as unknown as IntentBrain,
    });

    return { messages, refresher };
  }

  it("forces a fresh read and speaks current labeled and page errors separately", async () => {
    const fresh = loadSnapshot("result-errors");
    fresh.version += 1;
    fresh.capturedAt += 1;
    const { messages, refresher } = await requestCurrentErrors("booking", fresh);
    const speech = messages.find((message) => message.type === "speak")?.payload.text as string;

    expect(refresher.request).toHaveBeenCalledWith("user");
    expect(speech).toContain("Email address: Enter a valid email address.");
    expect(speech).toContain("Check-in date: Check-in date is required.");
    expect(speech).toContain("Page errors: Please fix 2 errors before continuing.");
    expect(speech.indexOf("Email address")).toBeLessThan(speech.indexOf("Check-in date"));
  });

  it("does not repeat stale errors when a fresh snapshot has none", async () => {
    const previous = loadSnapshot("result-errors");
    const fresh = loadSnapshot("booking");
    fresh.version = previous.version + 1;
    fresh.capturedAt = previous.capturedAt + 1;
    const { messages, refresher } = await requestCurrentErrors("result-errors", fresh);
    const speech = messages.find((message) => message.type === "speak")?.payload.text as string;

    expect(refresher.request).toHaveBeenCalledWith("user");
    expect(speech).toBe("There are no errors currently detected.");
    expect(speech).not.toContain("Email address");
    expect(speech).not.toContain("Check-in date");
  });
});

describe("gated post-action result", () => {
  async function dispatchWithResult(resultSnapshot: ReturnType<typeof loadSnapshot>, failPostActRefresh = false) {
    const initial = loadSnapshot("booking");
    const fakeTime = { now: 10_000 };
    const session = new Session("fake", () => fakeTime.now);
    session.extensionConnected = true;
    session.applySnapshot(initial);
    const action = session.model!.actions.find((candidate) => candidate.kind === "submit")!;
    const outgoing: Array<{ type: string; payload: any }> = [];
    const order: string[] = [];
    const scheduled: Array<() => void> = [];
    const hub = {
      send: vi.fn((_role: string, type: string, payload: any) => {
        order.push(`send:${type}`);
        outgoing.push({ type, payload });
        return true;
      }),
      request: vi.fn(async (_role: string, type: string, payload: any) => {
        order.push(`request:${type}`);
        return { payload: { actId: payload.actId, ok: true, liveKind: action.kind } };
      }),
      pushState: vi.fn(),
    } as unknown as Hub;
    const refresher = {
      request: vi.fn(async (reason: string) => {
        order.push(`refresh:${reason}`);
        if (reason === "post-act" && failPostActRefresh) return { ok: false, kind: "read-failed" } as const;
        if (reason === "post-act") session.applySnapshot(resultSnapshot, { updateDialogue: false });
        return { ok: true, applied: true, snapshot: reason === "post-act" ? resultSnapshot : initial } as const;
      }),
    } as unknown as Refresher;
    const schedule = (callback: () => void) => scheduled.push(callback);
    const ctx = { hub, session, refresher, clock: () => fakeTime.now, schedule };

    await executeGatedAction(ctx, { type: "request_action", actionId: action.id });
    handleGatedSpeakDone(ctx, { speakId: session.pendingGatedAction!.speakId, interrupted: false });
    fakeTime.now += 1_000;
    scheduled.shift()!();
    await executeGatedAction(ctx, { type: "confirmation", text: phraseForKind(action.kind)! });

    return { outgoing, order, refresher, session };
  }

  it("requires a post-act snapshot and speaks unverified when dispatch succeeds without evidence", async () => {
    const noEvidence = loadSnapshot("result-ok");
    noEvidence.headings = [];
    noEvidence.alerts = [];
    const { outgoing, order, refresher } = await dispatchWithResult(noEvidence);
    const lastSpeech = outgoing.filter((message) => message.type === "speak").at(-1)?.payload.text as string;

    expect(refresher.request).toHaveBeenCalledWith("post-act");
    expect(order.indexOf("request:act.request")).toBeLessThan(order.indexOf("refresh:post-act"));
    expect(order.indexOf("refresh:post-act")).toBeLessThan(order.lastIndexOf("send:speak"));
    expect(lastSpeech).toBe("I couldn't verify the page outcome.");
  });

  it("speaks unverified without a cause when the post-act snapshot cannot be read", async () => {
    const { outgoing, refresher } = await dispatchWithResult(loadSnapshot("result-ok"), true);
    const lastSpeech = outgoing.filter((message) => message.type === "speak").at(-1)?.payload.text as string;

    expect(refresher.request).toHaveBeenCalledWith("post-act");
    expect(lastSpeech).toBe("I couldn't verify the page outcome.");
  });

  it("speaks a confirmation and its number only when present in fresh page evidence", async () => {
    const { outgoing } = await dispatchWithResult(loadSnapshot("result-ok"));
    const lastSpeech = outgoing.filter((message) => message.type === "speak").at(-1)?.payload.text as string;

    expect(lastSpeech).toBe("The page confirms the action. Confirmation number BK-48213.");
  });

  it("speaks every fresh labeled field error and page error separately after dispatch", async () => {
    const { outgoing } = await dispatchWithResult(loadSnapshot("result-errors"));
    const lastSpeech = outgoing.filter((message) => message.type === "speak").at(-1)?.payload.text as string;

    expect(lastSpeech).toContain("Email address: Enter a valid email address.");
    expect(lastSpeech).toContain("Check-in date: Check-in date is required.");
    expect(lastSpeech).toContain("Page errors: Please fix 2 errors before continuing.");
    expect(lastSpeech.indexOf("Email address")).toBeLessThan(lastSpeech.indexOf("Check-in date"));
  });
});
