import { describe, expect, it } from "vitest";
import {
  createOutputModeController,
  shouldSpeakLocalAcknowledgement,
  statusAriaLive,
} from "./output-mode";

function createController() {
  const events: string[] = [];
  const controller = createOutputModeController({
    cancelCurrentSpeech: () => events.push("cancel"),
    sendSettings: (mode) => events.push(`settings:${mode}`),
    onModeChange: (mode) => events.push(`selected:${mode}`),
  });
  return { controller, events };
}

describe("session output mode", () => {
  it("starts in agent voice and a new controller starts a fresh session", () => {
    const first = createController();
    first.controller.select("screen-reader");
    const nextSession = createController();

    expect(first.controller.getMode()).toBe("screen-reader");
    expect(nextSession.controller.getMode()).toBe("agent-voice");
  });

  it("cancels the old speech before selecting and sending a new route", () => {
    const { controller, events } = createController();

    controller.select("screen-reader");
    controller.select("screen-reader");

    expect(events).toEqual([
      "cancel",
      "selected:screen-reader",
      "settings:screen-reader",
    ]);
  });

  it("returns to agent voice on server fallback without sending a second setting", () => {
    const { controller, events } = createController();

    controller.select("screen-reader");
    controller.fallBackToAgentVoice();
    controller.fallBackToAgentVoice();

    expect(controller.getMode()).toBe("agent-voice");
    expect(events).toEqual([
      "cancel",
      "selected:screen-reader",
      "settings:screen-reader",
      "selected:agent-voice",
    ]);
  });

  it("mutes the global status live region in screen-reader mode and restores it for Blip voice", () => {
    expect(statusAriaLive("screen-reader")).toBe("off");
    expect(statusAriaLive("agent-voice")).toBe("polite");
  });

  it("keeps local rate acknowledgements off browser TTS in screen-reader mode", () => {
    expect(shouldSpeakLocalAcknowledgement("screen-reader")).toBe(false);
    expect(shouldSpeakLocalAcknowledgement("agent-voice")).toBe(true);
  });
});
