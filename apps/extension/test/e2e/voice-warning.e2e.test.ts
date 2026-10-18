// @vitest-environment node
import process from "node:process";
import { describe, expect, it } from "vitest";
// @ts-expect-error The browser-served voice core is plain JavaScript and has no declaration file.
import { INJECTION_WARNING } from "../../../voice/public/voice-core.js";
import { openFixturePage, type BrowserFixtureSession } from "./harness.js";

const enabled = process.env["BLIP_E2E_BROWSER"] === "1";
const REQUEST_ACTION_PHRASE = "please try the synthetic payment";
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitFor<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await delay(25);
  }
  throw new Error("timed out waiting for the first-party voice UI state");
}

async function sendFromUi(fixture: BrowserFixtureSession, text: string): Promise<void> {
  const encoded = JSON.stringify(text);
  const result = await fixture.evaluateInVoiceUi(`(() => {
    const input = document.querySelector('#utterance');
    const form = document.querySelector('#utterance-form');
    if (!(input instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) return false;
    input.value = ${encoded};
    const event = new Event('submit', { bubbles: true, cancelable: true });
    const submitted = form.dispatchEvent(event);
    return { prevented: event.defaultPrevented };
  })()`);
  expect(result).toMatchObject({ prevented: true });
}

describe("first-party voice window warning and tracked speech", () => {
  it.skipIf(!enabled)("speaks the fixed warning before accepting input and completes gated read-back by speakId", async () => {
    if (!process.env["BLIP_BROWSER"]) {
      throw new Error("Set BLIP_BROWSER to a validated browser executable before opting into the voice UI E2E.");
    }

    const fixture = await openFixturePage("/injection.html", {
      withExtension: true,
      voiceUi: true,
      disableRepairModel: true,
      fakeRequestActionId: "f0e1",
      fakeRequestActionPhrase: REQUEST_ACTION_PHRASE,
      autoCompleteSpeech: false,
    });
    try {
      expect(fixture.voiceUiUrl()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/voice\/$/);
      await waitFor(async () => fixture.voiceUiConnected(), Boolean);
      // The socket reaches the server just before the first welcome frame can be rendered.
      // Wait for the UI's own ready marker so the test cannot race its event listener setup.
      await waitFor(
        () => fixture.evaluateInVoiceUi("document.querySelector('#connection')?.dataset.connected === 'true'"),
        (value) => value === true,
      );

      // The production UI still uses SpeechSynthesis. A deterministic browser shim lets this E2E
      // verify its end events and WebSocket ordering without depending on an audio device.
      await fixture.evaluateInVoiceUi(`(() => {
        window.__blipSpoken = [];
        window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
        Object.defineProperty(window, 'speechSynthesis', {
          configurable: true,
          value: {
            cancel() {},
            speak(item) {
              window.__blipSpoken.push(item.text);
              queueMicrotask(() => item.onend?.());
            },
          },
        });
        return true;
      })()`);
      const warningVisible = () => fixture.evaluateInVoiceUi("document.querySelector('#warning')?.hidden === false");
      const warning = await waitFor(warningVisible, (value) => value === true).catch(async () => {
        const ui = await fixture.evaluateInVoiceUi(`({
          visible: document.querySelector('#warning')?.hidden === false,
          status: document.querySelector('#warning-status')?.textContent,
          inputDisabled: document.querySelector('#utterance')?.disabled,
          connection: document.querySelector('#connection')?.dataset.connected,
        })`);
        const states = fixture.stateEvents().map((entry) => entry.payload.page?.untrustedInstructionDetected ?? null);
        throw new Error(`voice warning did not render: ${JSON.stringify({ ui, sessionWarning: fixture.model() !== null, states })}`);
      });
      expect(warning).toBe(true);

      const utterancesBeforeAttempt = fixture.inboundVoiceUtteranceCount();
      await sendFromUi(fixture, "submit survey");
      await delay(100);
      expect(fixture.inboundVoiceUtteranceCount()).toBe(utterancesBeforeAttempt);
      await fixture.evaluateInVoiceUi("document.querySelector('#enable-audio')?.click(); true");

      const speechState = () => fixture.evaluateInVoiceUi(`({
        status: document.querySelector('#warning-status')?.textContent,
        enabled: document.querySelector('#utterance')?.disabled === false,
        warningVisible: document.querySelector('#warning')?.hidden === false,
        spokenCount: Array.isArray(window.__blipSpoken) ? window.__blipSpoken.length : -1,
        audioButtonDisabled: document.querySelector('#enable-audio')?.disabled,
        connected: document.querySelector('#connection')?.dataset.connected,
      })`);
      await waitFor(
        speechState,
        (value) => typeof value === "object" && value !== null &&
          "status" in value && value.status === "Warning heard. Commands are enabled." &&
          "enabled" in value && value.enabled === true &&
          "spokenCount" in value && typeof value.spokenCount === "number" && value.spokenCount > 0,
        3_000,
      ).catch(async () => {
        const warningEvents = fixture.stateEvents().map((entry) => entry.payload.page === null
          ? null
          : entry.payload.page.untrustedInstructionDetected ?? "omitted");
        throw new Error(`voice warning did not complete: ${JSON.stringify({ ui: await speechState(), warningEvents })}`);
      });

      const utterancesBeforeRequest = fixture.inboundVoiceUtteranceCount();
      await sendFromUi(fixture, REQUEST_ACTION_PHRASE);
      await waitFor(
        async () => fixture.inboundVoiceUtteranceCount(),
        (value) => value > utterancesBeforeRequest,
        3_000,
      ).catch(async () => {
        const details = await fixture.evaluateInVoiceUi(`({
          inputDisabled: document.querySelector('#utterance')?.disabled,
          warningStatus: document.querySelector('#warning-status')?.textContent,
          warningVisible: document.querySelector('#warning')?.hidden === false,
          inputLength: document.querySelector('#utterance')?.value?.length ?? -1,
          heardLength: document.querySelector('#heard')?.textContent?.length ?? 0,
          spokenCount: Array.isArray(window.__blipSpoken) ? window.__blipSpoken.length : -1,
        })`);
        const inboundTypes = fixture.serverLogs().flatMap((line) => {
          try {
            const entry = JSON.parse(line) as { msg?: string; role?: string; type?: string };
            return entry.msg === "frame in" ? [`${entry.role}:${entry.type}`] : [];
          } catch { return []; }
        });
        throw new Error(`voice UI refused the synthetic command: ${JSON.stringify({ details, before: utterancesBeforeRequest, after: fixture.inboundVoiceUtteranceCount(), inboundTypes })}`);
      });
      await waitFor(
        () => fixture.evaluateInVoiceUi("document.querySelector('#confirmation')?.hidden === false"),
        (value) => value === true,
      ).catch(async () => {
        const details = await fixture.evaluateInVoiceUi(`({
          inputDisabled: document.querySelector('#utterance')?.disabled,
          warningPendingStatus: document.querySelector('#warning-status')?.textContent,
          confirmationVisible: document.querySelector('#confirmation')?.hidden === false,
          replyLength: document.querySelector('#reply')?.textContent?.length ?? 0,
        })`);
        throw new Error(`synthetic action did not reach read-back: ${JSON.stringify({ details, utterances: fixture.inboundVoiceUtteranceCount() })}`);
      });

      // Deliberately use a non-matching phrase after read-back; the UI never gets to dispatch a grant.
      await sendFromUi(fixture, "yes");
      await waitFor(
        () => fixture.evaluateInVoiceUi("document.querySelector('#reply')?.textContent ?? ''"),
        (value) => typeof value === "string" && /confirmation|submit phrase/i.test(value),
      );
      expect(fixture.serverLogs().some((line) => line.includes('"msg":"gated action refused"'))).toBe(true);
      expect(fixture.actResults()).toEqual([]);
      const pageReports = await fixture.reports("/injection.html");
      expect(pageReports.some((report) => report.type === "injection-submit")).toBe(false);
      const played = await fixture.evaluateInVoiceUi("window.__blipSpoken");
      expect(Array.isArray(played)).toBe(true);
      expect((played as string[])[0]).toBe(INJECTION_WARNING);
      expect(fixture.inboundVoiceUtteranceCount()).toBeGreaterThan(utterancesBeforeAttempt + 1);
    } finally {
      await fixture.close();
    }
  }, 180_000);
});
