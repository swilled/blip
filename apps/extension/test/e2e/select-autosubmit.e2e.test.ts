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

  it.skipIf(!enabled)("blocks onchange requestSubmit during act and permits an ordinary submit after cleanup", async () => {
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
      await new Promise((resolve) => setTimeout(resolve, 300));

      const duringActReports = await fixture.reports(pagePath);
      expect(duringActReports.some(isSubmitEvent)).toBe(false);
      expect(duringActReports.some((record) => record.type === "select-autosubmit")).toBe(false);

      // The isolated fixture debugger performs a normal page submit after the act scope has ended.
      await fixture.evaluateInPage("document.querySelector('#select-form')?.requestSubmit(); 'submitted'");
      const deadline = Date.now() + 5_000;
      let afterCleanupReports = await fixture.reports(pagePath);
      while (!afterCleanupReports.some((record) => record.type === "select-autosubmit") && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        afterCleanupReports = await fixture.reports(pagePath);
      }
      expect(afterCleanupReports.some(isSubmitEvent)).toBe(true);
      expect(afterCleanupReports.some((record) => record.type === "select-autosubmit")).toBe(true);
    } finally {
      await fixture.close();
    }
  }, 60_000);
});
