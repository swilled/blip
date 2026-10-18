// @vitest-environment node
import process from "node:process";
import { afterAll, describe, expect, it } from "vitest";
import { openFixturePage } from "./harness.js";

const enabled = process.env["BLIP_E2E_BROWSER"] === "1";
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const measuredLatencies: Array<{ event: string; ms: number }> = [];

function expectWithinBound(event: string, reportedAt: number, receivedAt: number): void {
  const latency = receivedAt - reportedAt;
  expect(latency).toBeGreaterThanOrEqual(0);
  expect(latency).toBeLessThanOrEqual(1100);
  measuredLatencies.push({ event, ms: latency });
}

afterAll(() => {
  if (enabled) process.stdout.write(`page-change timing: ${measuredLatencies.map(({ event, ms }) => `${event}=${ms}ms`).join(", ")}\n`);
});

function reportTime(report: Record<string, unknown>): number {
  const value = report["reportedAt"];
  if (typeof value !== "number") throw new Error("fixture report did not contain a numeric event timestamp");
  return value;
}

describe("real browser page-change freshness", () => {
  it.skipIf(!enabled)("refreshes the model after a delayed field reveal within 1100 ms", async () => {
    const fixture = await openFixturePage("/delayed-reveal.html");
    try {
      const report = await fixture.waitForReport("/delayed-reveal.html", "field-revealed");
      const state = await fixture.waitForState(0, (candidate) =>
        candidate.model?.fieldLabels.includes("Follow-up email") === true &&
        candidate.payload.page?.fieldCount === 1,
      );
      expectWithinBound("reveal", reportTime(report), state.receivedAt);
      expect(state.model?.fieldLabels).toContain("Follow-up email");
    } finally {
      await fixture.close();
    }
  }, 60_000);

  it.skipIf(!enabled)("refreshes the model after a delayed validation error within 1100 ms", async () => {
    const fixture = await openFixturePage("/delayed-reveal.html");
    try {
      await fixture.waitForState(0, (candidate) => candidate.model?.url.endsWith("/delayed-reveal.html") === true);
      const before = fixture.stateEvents().length;
      await fixture.evaluateInPage("document.querySelector('#validate-later').click(); true");
      const report = await fixture.waitForReport("/delayed-reveal.html", "delayed-validation-error");
      const state = await fixture.waitForState(before, (candidate) =>
        candidate.model?.pageErrors.includes("Enter a valid email address.") === true,
      );
      expectWithinBound("validation-error", reportTime(report), state.receivedAt);
      expect(state.model?.pageErrors).toContain("Enter a valid email address.");
    } finally {
      await fixture.close();
    }
  }, 60_000);

  it.skipIf(!enabled)("refreshes the model after SPA history navigation within 1100 ms", async () => {
    const fixture = await openFixturePage("/spa.html");
    try {
      await fixture.waitForState(0, (candidate) =>
        candidate.payload.page?.url.endsWith("/spa.html") === true &&
        candidate.model?.fieldLabels.includes("Preferred name") === true,
      );
      const before = fixture.stateEvents().length;
      await fixture.evaluateInPage("document.querySelector('#continue').click(); true");
      const report = await fixture.waitForReport("/spa/step-two", "spa-navigation");
      const state = await fixture.waitForState(before, (candidate) =>
        candidate.payload.page?.url.endsWith("/spa/step-two") === true &&
        candidate.model?.fieldLabels.includes("Contact email") === true,
      );
      expectWithinBound("spa", reportTime(report), state.receivedAt);
      expect(state.model?.url).toMatch(/\/spa\/step-two$/);
    } finally {
      await fixture.close();
    }
  }, 60_000);

  it.skipIf(!enabled)("keeps value-only fills silent on the page.changed channel", async () => {
    const fixture = await openFixturePage("/spa.html");
    try {
      await fixture.waitForState(0, (candidate) => candidate.model?.fieldLabels.includes("Preferred name") === true);
      await delay(650);
      const snapshot = await fixture.requestSnapshot();
      const field = snapshot.elements.find((element) =>
        element.category === "field" && element.labelCandidates.some((candidate) => candidate.text === "Preferred name"),
      );
      expect(field).toBeDefined();
      if (!field) throw new Error("SPA preferred-name field was not captured");

      const previousPageChanges = fixture.pageChangedCount();
      const result = await fixture.requestAct(snapshot, { op: "fill", targetId: field.id, value: "A private value" }, "fill");
      expect(result).toMatchObject({ ok: true, observedValue: "A private value" });
      await delay(700);
      expect(fixture.pageChangedCount()).toBe(previousPageChanges);
    } finally {
      await fixture.close();
    }
  }, 60_000);
});
