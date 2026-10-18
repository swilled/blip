// @vitest-environment node
import process from "node:process";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "@blip/protocol";
import type { TestPageReport } from "../../../../tools/test-pages/serve.js";
import { openFixturePage } from "./harness.js";

const enabled = process.env["BLIP_E2E_BROWSER"] === "1";
const PAGE_PATH = "/demo-form.html";
const REQUEST_ACTION_PHRASE = "please submit the synthetic survey";
const CONFIRMATION_PHRASE = "submit survey";
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await delay(25);
  }
  throw new Error("timed out waiting for the expected voice UI state");
}

async function sendFromVoiceUi(fixture: Awaited<ReturnType<typeof openFixturePage>>, text: string) {
  const encoded = JSON.stringify(text);
  const submitted = await fixture.evaluateInVoiceUi(`(() => {
    const input = document.querySelector('#utterance');
    const form = document.querySelector('#utterance-form');
    if (!(input instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) return false;
    input.value = ${encoded};
    const event = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(event);
    return event.defaultPrevented;
  })()`);
  expect(submitted).toBe(true);
}

async function waitForVoiceUiReply(fixture: Awaited<ReturnType<typeof openFixturePage>>, text: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const reply = await fixture.evaluateInVoiceUi("document.querySelector('#reply')?.textContent ?? ''");
    if (typeof reply === "string" && reply.includes(text)) {
      await waitFor(
        () => fixture.evaluateInVoiceUi(`(() => {
          const send = document.querySelector('#send');
          return send instanceof HTMLButtonElement && !send.disabled &&
            document.querySelector('#utterance-form')?.getAttribute('aria-busy') === 'false';
        })()`),
        (ready) => ready === true,
      );
      return reply;
    }
    await delay(25);
  }
  throw new Error(`voice UI did not show the expected reply containing ${text}`);
}

function field(snapshot: Snapshot, label: string) {
  const element = snapshot.elements.find((candidate) => candidate.category === "field" &&
    candidate.labelCandidates.some((labelCandidate) => labelCandidate.text === label));
  if (!element || element.category !== "field") throw new Error(`synthetic survey field ${label} was not captured`);
  return element;
}

async function waitForReport(fixture: Awaited<ReturnType<typeof openFixturePage>>, type: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const reports = await fixture.reports(PAGE_PATH);
    const match = reports.find((report: TestPageReport) => report.type === type);
    if (match) return match;
    await delay(25);
  }
  throw new Error(`synthetic survey did not record ${type}`);
}

describe("local synthetic survey demo", () => {
  it.skipIf(!enabled)("fills fictional values and submits only after tracked read-back and exact phrase", async () => {
    const fixture = await openFixturePage(PAGE_PATH, {
      fakeRequestActionId: "f0e3",
      fakeRequestActionPhrase: REQUEST_ACTION_PHRASE,
      voiceUi: true,
      autoCompleteSpeech: false,
    });
    try {
      await fixture.evaluateInVoiceUi(`(() => {
        window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
        Object.defineProperty(window, 'speechSynthesis', {
          configurable: true,
          value: {
            cancel() {},
            resume() {},
            speak(item) { queueMicrotask(() => item.onend?.()); },
          },
        });
        document.querySelector('#enable-audio')?.click();
        return true;
      })()`);
      await waitForReport(fixture, "page-ready");
      const initial = await fixture.requestSnapshot();
      expect(initial.url).toBe(`${fixture.pages.origins.primary}${PAGE_PATH}`);
      const name = field(initial, "Name");
      const email = field(initial, "Email");
      const submit = initial.elements.find((element) => element.category === "action" && element.text === "Submit survey");
      expect(name).toMatchObject({ value: "", hasValue: false, required: true });
      expect(email).toMatchObject({ value: "", hasValue: false, required: true });
      expect(submit).toMatchObject({ id: "f0e3", category: "action", kind: "submit" });

      await sendFromVoiceUi(fixture, "fill Name with Ada Demo");
      await waitForVoiceUiReply(fixture, "Name is now Ada Demo.");
      await sendFromVoiceUi(fixture, "fill Email with ada@example.invalid");
      await waitForVoiceUiReply(fixture, "Email is now ada@example.invalid.");
      expect(fixture.sessionField("Name")).toMatchObject({ value: "Ada Demo", hasValue: true });
      expect(fixture.sessionField("Email")).toMatchObject({ value: "ada@example.invalid", hasValue: true });

      const actsBeforeGate = fixture.actResults().length;
      await sendFromVoiceUi(fixture, REQUEST_ACTION_PHRASE);
      const readbackText = await waitForVoiceUiReply(fixture, "Current form read-back");
      expect(readbackText).toContain("Name: Ada Demo.");
      expect(readbackText).toContain("Email: ada@example.invalid.");
      expect(readbackText).toContain("To continue, say: submit survey.");
      expect(fixture.actResults()).toHaveLength(actsBeforeGate);
      expect((await fixture.reports(PAGE_PATH)).some((report) => report.type === "demo-survey-submit")).toBe(false);

      const armed = await waitFor(() => fixture.evaluateInVoiceUi("document.querySelector('#confirmation')?.hidden === false"), Boolean);
      expect(armed).toBe(true);
      await sendFromVoiceUi(fixture, CONFIRMATION_PHRASE);
      await waitForReport(fixture, "demo-survey-submit");
      const submitReply = await waitFor(
        () => fixture.evaluateInVoiceUi("document.querySelector('#reply')?.textContent ?? ''"),
        (value) => typeof value === "string" && /page confirms|local submit observed/i.test(value),
      );
      expect(submitReply).toMatch(/page confirms|local submit observed/i);
      expect(fixture.actResults().at(-1)).toMatchObject({ ok: true, liveKind: "submit" });
      expect((await fixture.reports("/submit-sink.html")).some((report) => report.type === "submit-sink-reached")).toBe(false);
      expect(fixture.serverLogs().every((line) =>
        !line.includes("Ada Demo") && !line.includes("ada@example.invalid"),
      )).toBe(true);
    } finally {
      await fixture.close();
    }
  }, 120_000);
});
