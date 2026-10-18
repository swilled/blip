// @vitest-environment node
import process from "node:process";
import { describe, expect, it } from "vitest";
import type { Message } from "@blip/protocol";
import { openFixturePage } from "./harness.js";

const enabled = process.env["BLIP_E2E_BROWSER"] === "1";

function speakTexts(messages: readonly Message[]): string[] {
  return messages
    .filter((message): message is Extract<Message, { type: "speak" }> => message.type === "speak")
    .map((message) => message.payload.text);
}

describe("real-browser selected-link navigation", () => {
  it.skipIf(!enabled)("opens a selected same-origin GET without firing the page click handler", async () => {
    const fixture = await openFixturePage("/browser-control.html");
    const label = "Open the local booking form";
    const destination = new URL("/vanilla.html?source=selected-link", fixture.pages.origins.primary).href;

    try {
      await fixture.voiceClient.sendUtterance("what's here");
      await fixture.evaluateInPage(`(() => {
        const anchor = document.createElement("a");
        anchor.id = "e2e-safe-get-link";
        anchor.href = ${JSON.stringify(destination)};
        anchor.textContent = ${JSON.stringify(label)};
        anchor.addEventListener("click", (event) => {
          event.preventDefault();
          document.documentElement.dataset.pageClickHandlerRan = "true";
        });
        document.querySelector("nav")?.append(anchor);
        return anchor.isConnected;
      })()`);

      const listed = await fixture.voiceClient.sendUtterance("list links");
      expect(speakTexts(listed).join("\n")).toContain(label);

      const opened = await fixture.voiceClient.sendUtterance(`open link ${label}`);
      expect(speakTexts(opened)).toContain("Opened the selected visible link.");
      expect(opened.some((message) => message.type === "speak" && message.payload.category === "confirm-prompt")).toBe(false);

      await fixture.waitForReport("/vanilla.html", "page-ready");
      expect(fixture.pageChangedCount()).toBeGreaterThan(0);
    } finally {
      await fixture.close();
    }
  }, 60_000);
});
