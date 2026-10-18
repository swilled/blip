// @vitest-environment node
import process from "node:process";
import { describe, expect, it } from "vitest";
import type { Message } from "@blip/protocol";
import { openFixturePage } from "./harness.js";

const enabled = process.env["BLIP_E2E_BROWSER"] === "1";
const speakTexts = (frames: readonly Message[]) =>
  frames.filter((frame) => frame.type === "speak").map((frame) => frame.payload.text);
const contains = (value: unknown, candidate: string) => JSON.stringify(value).includes(candidate);

describe("real voice-role read and fill path", () => {
  it.skipIf(!enabled)("proves I1 replies and blocks a card-shaped post-write value at every server boundary", async () => {
    const fixture = await openFixturePage("/vanilla.html");
    const cardNumber = "4111111111111111";
    const passwordSentinel = "pw-sentinel-9f3";

    try {
      const describe = await fixture.voiceClient.sendUtterance("what's here");
      expect(speakTexts(describe).some((text) => text.includes("Hotel booking"))).toBe(true);
      expect(describe.some((frame) => frame.type === "state" && frame.payload.extensionConnected)).toBe(true);

      const textFill = await fixture.voiceClient.sendUtterance("fill Full name with Ada Lovelace");
      expect(speakTexts(textFill)).toContain("Full name is now Ada Lovelace.");

      const select = await fixture.voiceClient.sendUtterance("select deluxe for Room type");
      expect(speakTexts(select)).toContain("Room type is now deluxe.");

      const maxlength = await fixture.voiceClient.sendUtterance("fill Promo code with ABCDEFGHIJK");
      expect(speakTexts(maxlength)).toContain("I couldn't update that field. Please try again.");
      const afterMaxlength = await fixture.requestSnapshot();
      expect(afterMaxlength.elements.find((element) =>
        element.category === "field" && element.labelCandidates.some((candidate) => candidate.text === "Promo code"),
      )?.value).toBe("ABCDEFGH");

      const sensitiveFocus = await fixture.voiceClient.sendUtterance(`fill Card number with ${cardNumber}`);
      expect(speakTexts(sensitiveFocus)).toContain("That is a private field. You can type it now.");
      expect(contains(sensitiveFocus, cardNumber)).toBe(false);
      expect(fixture.actResults().at(-1)).toMatchObject({ ok: true, observedValue: null });
      expect(contains(fixture.actResults().at(-1), cardNumber)).toBe(false);

      const cardWrite = await fixture.voiceClient.sendUtterance(`fill Full name with ${cardNumber}`);
      expect(speakTexts(cardWrite)).toContain("That is a private field. You can type it now.");

      const actResult = fixture.actResults().at(-1);
      expect(actResult).toMatchObject({ ok: false, error: "sensitive-field", observedValue: null });
      const refreshedSnapshot = await fixture.requestSnapshot();
      const refreshedName = refreshedSnapshot.elements.find((element) =>
        element.category === "field" && element.labelCandidates.some((candidate) => candidate.text === "Full name"),
      );
      expect(refreshedName).toMatchObject({ sensitive: "card-number", value: null, hasValue: true });
      expect(fixture.sessionField("Full name")).toMatchObject({ sensitive: "card-number", value: null, hasValue: true });
      expect(fixture.lastSpoken()).toBe("That is a private field. You can type it now.");

      const observedFrames = fixture.voiceClient.frames();
      expect(observedFrames.some((frame) => frame.type === "error")).toBe(false);
      const evidence = {
        actResults: fixture.actResults(),
        snapshot: refreshedSnapshot,
        stateFrames: observedFrames.filter((frame) => frame.type === "state"),
        speakAndErrorFrames: observedFrames.filter((frame) => frame.type === "speak" || frame.type === "error"),
        lastSpoken: fixture.lastSpoken(),
        serverLogs: fixture.serverLogs(),
      };
      expect(contains(evidence, cardNumber)).toBe(false);
      expect(contains(evidence, passwordSentinel)).toBe(false);
      expect(contains(fixture.sessionField("Account password"), passwordSentinel)).toBe(false);
    } finally {
      await fixture.close();
    }
  }, 120_000);
});
