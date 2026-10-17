// @vitest-environment node
import process from "node:process";
import { describe, expect, it } from "vitest";
import type { TestPageReport } from "../../../../tools/test-pages/serve.js";
import { openFixturePage } from "./harness.js";

function isSubmitEvent(record: TestPageReport): boolean {
  if (record.type !== "page-event" || !record.detail || typeof record.detail !== "object") return false;
  return (record.detail as { event?: unknown }).event === "submit";
}

describe("real select auto-submit barrier", () => {
  const enabled = process.env["BLIP_E2E_BROWSER"] === "1";

  it.skipIf(!enabled)("blocks direct submit and requestSubmit during a real select act and while idle", async () => {
    const fixture = await openFixturePage("/select-autosubmit.html");
    const pagePath = "/select-autosubmit.html";
    try {
      const snapshot = await fixture.requestSnapshot();
      const room = snapshot.elements.find((element) =>
        element.category === "field" && element.labelCandidates.some((candidate) => candidate.text === "Room type"),
      );
      expect(room).toBeDefined();
      if (!room) throw new Error("auto-submit select was not captured");

      const result = await fixture.requestAct(snapshot, { op: "select", targetId: room.id, optionValue: "deluxe" }, "select");
      expect(result).toMatchObject({ ok: true, observedValue: "deluxe" });
      const directSubmitAttempt = await fixture.waitForReport(pagePath, "direct-submit-attempt");
      expect(directSubmitAttempt.detail).toEqual({});
      await new Promise((resolve) => setTimeout(resolve, 300));

      const duringActReports = await fixture.reports(pagePath);
      expect(duringActReports.some(isSubmitEvent)).toBe(false);
      expect(duringActReports.some((record) => record.type === "select-autosubmit")).toBe(false);
      expect(await fixture.evaluateInPage("window.location.pathname")).toBe(pagePath);

      // The persistent document-start event barrier remains default-deny after the act returns.
      await fixture.evaluateInPage("document.querySelector('#select-form')?.requestSubmit(); 'attempted'");
      await new Promise((resolve) => setTimeout(resolve, 300));
      const afterActReports = await fixture.reports(pagePath);
      expect(afterActReports.some(isSubmitEvent)).toBe(false);
      expect(afterActReports.some((record) => record.type === "select-autosubmit")).toBe(false);
      expect(await fixture.evaluateInPage("window.location.pathname")).toBe(pagePath);
    } finally {
      await fixture.close();
    }
  }, 60_000);
});
