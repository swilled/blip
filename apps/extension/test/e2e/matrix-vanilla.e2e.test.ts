// @vitest-environment node
import process from "node:process";
import { describe, expect, it } from "vitest";
import type { Snapshot as SnapshotData } from "@blip/protocol";
import type { TestPageReport } from "../../../../tools/test-pages/serve.js";
import { openFixturePage } from "./harness.js";

const enabled = process.env["BLIP_E2E_BROWSER"] === "1";
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function field(snapshot: SnapshotData, label: string) {
  const result = snapshot.elements.find((element) => element.category === "field" &&
    element.labelCandidates.some((candidate) => candidate.text === label));
  if (!result || result.category !== "field") throw new Error(`missing field: ${label}`);
  return result;
}

function action(snapshot: SnapshotData, label: string) {
  const result = snapshot.elements.find((element) => element.category === "action" && element.text === label);
  if (!result || result.category !== "action") throw new Error(`missing action: ${label}`);
  return result;
}

async function waitForPageEvent(
  reports: (pagePath: string) => Promise<TestPageReport[]>,
  pagePath: string,
  predicate: (detail: Record<string, unknown>) => boolean,
): Promise<TestPageReport> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const match = (await reports(pagePath)).find((record) => {
      if (record.type !== "page-event" || !record.detail || typeof record.detail !== "object") return false;
      return predicate(record.detail as Record<string, unknown>);
    });
    if (match) return match;
    await delay(25);
  }
  throw new Error("timed out waiting for the page-side event report");
}

describe("vanilla page evidence matrix", () => {
  it.skipIf(!enabled)("checks accessible fields, privacy, readonly refusal, writes, fail-closed clicks and cap semantics", async () => {
    const fixture = await openFixturePage("/vanilla.html");
    const pagePath = "/vanilla.html";
    try {
      let snapshot = await fixture.requestSnapshot();
      expect(snapshot.url).toBe(`${fixture.pages.origins.primary}/vanilla.html`);
      expect(snapshot.title).toBe("Vanilla form");
      expect(snapshot.headings).toContainEqual({ level: 1, text: "Hotel booking" });
      expect(field(snapshot, "Full name")).toMatchObject({ role: "textbox", value: "Taylor Example", hasValue: true, required: false });
      expect(field(snapshot, "Email address")).toMatchObject({ role: "textbox", required: true, requiredSource: "attr" });
      expect(field(snapshot, "Phone number").labelCandidates.some((candidate) => candidate.text === "Phone number")).toBe(true);

      const card = field(snapshot, "Card number");
      const password = field(snapshot, "Account password");
      expect(card).toMatchObject({ sensitive: "card-number", value: null, hasValue: true });
      expect(password).toMatchObject({ sensitive: "password", value: null, hasValue: true });
      expect(snapshot.elements.some((element) => element.category === "field" && element.name === "csrfToken")).toBe(false);
      expect(JSON.stringify(snapshot)).not.toContain("4111111111111111");
      expect(JSON.stringify(snapshot)).not.toContain("pw-sentinel-9f3");
      expect(JSON.stringify(snapshot)).not.toContain("csrf-sentinel-7c1");

      const readOnly = field(snapshot, "Reference code");
      expect(readOnly).toMatchObject({ disabled: true, value: "READONLY-42" });
      const refused = await fixture.requestAct(snapshot, { op: "fill", targetId: readOnly.id, value: "changed" }, "fill");
      expect(refused).toMatchObject({ ok: false, error: "disabled" });
      snapshot = await fixture.requestSnapshot();
      expect(field(snapshot, "Reference code")).toMatchObject({ disabled: true, value: "READONLY-42" });

      const gateTargets = [
        ["Book room", "submit"],
        ["Pay now", "pay"],
        ["Delete account", "delete"],
        ["Send application", "send"],
        ["Privacy policy", "navigate-cross-domain"],
        ["Show details", "submit"],
      ] as const;
      for (const [label, kind] of gateTargets) {
        const gated = action(snapshot, label);
        expect(gated.kind).toBe(kind);
        const before = await fixture.reports(pagePath);
        const result = await fixture.requestAct(snapshot, { op: "click", targetId: gated.id }, kind);
        expect(result).toMatchObject({ ok: false, error: "gate-required" });
        await delay(75);
        const after = await fixture.reports(pagePath);
        expect(after.filter((record) => record.type === "page-event")).toHaveLength(before.filter((record) => record.type === "page-event").length);
      }
      expect((await fixture.reports(pagePath)).some((record) => record.type === "vanilla-submit" || record.type === "custom-action")).toBe(false);

      snapshot = await fixture.requestSnapshot();
      let fullName = field(snapshot, "Full name");
      const textResult = await fixture.requestAct(snapshot, { op: "fill", targetId: fullName.id, value: "Grace Hopper" }, "fill");
      expect(textResult).toMatchObject({ ok: true, observedValue: "Grace Hopper" });
      await waitForPageEvent(fixture.reports, pagePath, (detail) =>
        detail.event === "input" && (detail.target as Record<string, unknown> | undefined)?.id === "full-name",
      );
      snapshot = await fixture.requestSnapshot();

      const room = field(snapshot, "Room type");
      const selectResult = await fixture.requestAct(snapshot, { op: "select", targetId: room.id, optionValue: "deluxe" }, "select");
      expect(selectResult).toMatchObject({ ok: true, observedValue: "deluxe" });
      await waitForPageEvent(fixture.reports, pagePath, (detail) =>
        detail.event === "change" && (detail.target as Record<string, unknown> | undefined)?.id === "room-type",
      );
      snapshot = await fixture.requestSnapshot();

      const bed = field(snapshot, "Bed preference");
      const radioResult = await fixture.requestAct(snapshot, { op: "select", targetId: bed.id, optionValue: "king" }, "select");
      expect(radioResult).toMatchObject({ ok: true, observedValue: "king" });
      await waitForPageEvent(fixture.reports, pagePath, (detail) =>
        detail.event === "change" && (detail.target as Record<string, unknown> | undefined)?.name === "bed",
      );
      snapshot = await fixture.requestSnapshot();

      const breakfast = field(snapshot, "Breakfast included");
      const checkboxResult = await fixture.requestAct(snapshot, { op: "check", targetId: breakfast.id, checked: true }, "check");
      expect(checkboxResult).toMatchObject({ ok: true, observedValue: "true" });
      await waitForPageEvent(fixture.reports, pagePath, (detail) =>
        detail.event === "change" && (detail.target as Record<string, unknown> | undefined)?.name === "breakfast",
      );
    } finally {
      await fixture.close();
    }
  }, 120_000);

  it.skipIf(!enabled)("marks the large page truncated only when the 250-element wire cap removes fields", async () => {
    const fixture = await openFixturePage("/large.html");
    try {
      const snapshot = await fixture.requestSnapshot();
      expect(snapshot.elements.length).toBeLessThanOrEqual(250);
      expect(snapshot.elements).toHaveLength(250);
      expect(snapshot.truncated).toBe(true);
      expect(snapshot.elements.every((element) => element.category === "field")).toBe(true);
      expect(snapshot.elements.some((element) => element.category === "field" && element.labelCandidates.some((candidate) => candidate.text === "Field 250"))).toBe(true);
      expect(snapshot.elements.some((element) => element.category === "field" && element.labelCandidates.some((candidate) => candidate.text === "Field 251"))).toBe(false);
      // The wire contract has an element cap; model-prompt token trimming belongs to Phase 4.
    } finally {
      await fixture.close();
    }
  }, 60_000);
});
