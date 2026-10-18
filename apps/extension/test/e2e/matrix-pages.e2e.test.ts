// @vitest-environment node
import process from "node:process";
import { describe, expect, it } from "vitest";
import type { Snapshot as SnapshotData } from "@blip/protocol";
import type { TestPageReport } from "../../../../tools/test-pages/serve.js";
import { openFixturePage } from "./harness.js";

const enabled = process.env["BLIP_E2E_BROWSER"] === "1";
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : undefined;
}

function field(snapshot: SnapshotData, label: string) {
  const result = snapshot.elements.find((element) => element.category === "field" &&
    element.labelCandidates.some((candidate) => candidate.text === label));
  if (!result || result.category !== "field") throw new Error(`missing field: ${label}`);
  return result;
}

async function waitForReportDetail(
  fixture: Awaited<ReturnType<typeof openFixturePage>>,
  pagePath: string,
  type: string,
  predicate: (detail: JsonObject) => boolean,
): Promise<JsonObject> {
  const deadline = Date.now() + 6_000;
  while (Date.now() < deadline) {
    const match = (await fixture.reports(pagePath)).find((record) => {
      const detail = object(record.detail);
      return record.type === type && detail !== undefined && predicate(detail);
    });
    const detail = match ? object(match.detail) : undefined;
    if (detail) return detail;
    await delay(25);
  }
  throw new Error(`timed out waiting for ${type} page report`);
}

function stateValue(detail: JsonObject, section: string, key: string): unknown {
  return object(detail[section])?.[key];
}

function pageEvents(records: TestPageReport[]): JsonObject[] {
  return records.flatMap((record) => {
    if (record.type !== "page-event") return [];
    const detail = object(record.detail);
    return detail ? [detail] : [];
  });
}

describe("React and native form evidence matrix", () => {
  it.skipIf(!enabled)("observes controlled React values and blur validation through page reports", async () => {
    const fixture = await openFixturePage("/react-form.html");
    const pagePath = "/react-form.html";
    try {
      let snapshot = await fixture.requestSnapshot();
      const name = field(snapshot, "Full name");
      const nameResult = await fixture.requestAct(snapshot, { op: "fill", targetId: name.id, value: "Ada Lovelace" }, "fill");
      expect(nameResult).toMatchObject({ ok: true, observedValue: "Ada Lovelace" });
      const nameState = await waitForReportDetail(fixture, pagePath, "react-state", (detail) =>
        stateValue(detail, "values", "fullName") === "Ada Lovelace" && stateValue(detail, "touched", "fullName") === true,
      );
      expect(stateValue(nameState, "errors", "fullName")).toBe("");

      snapshot = await fixture.requestSnapshot();
      const email = field(snapshot, "Email address");
      const emailResult = await fixture.requestAct(snapshot, { op: "fill", targetId: email.id, value: "not-an-email" }, "fill");
      expect(emailResult).toMatchObject({ ok: true, observedValue: "not-an-email" });
      const validationState = await waitForReportDetail(fixture, pagePath, "react-state", (detail) =>
        stateValue(detail, "values", "email") === "not-an-email" && stateValue(detail, "touched", "email") === true,
      );
      expect(stateValue(validationState, "errors", "email")).toBe("Enter a valid email address.");
      snapshot = await fixture.requestSnapshot();
      expect(field(snapshot, "Email address").errorText).toBe("Enter a valid email address.");

      snapshot = await fixture.requestSnapshot();
      const room = field(snapshot, "Room type");
      expect(await fixture.requestAct(snapshot, { op: "select", targetId: room.id, optionValue: "suite" }, "select"))
        .toMatchObject({ ok: true, observedValue: "suite" });
      const roomState = await waitForReportDetail(fixture, pagePath, "react-state", (detail) => stateValue(detail, "values", "room") === "suite");
      expect(stateValue(roomState, "values", "room")).toBe("suite");

      snapshot = await fixture.requestSnapshot();
      const bed = field(snapshot, "Bed preference");
      expect(await fixture.requestAct(snapshot, { op: "select", targetId: bed.id, optionValue: "twin" }, "select"))
        .toMatchObject({ ok: true, observedValue: "twin" });
      const bedState = await waitForReportDetail(fixture, pagePath, "react-state", (detail) => stateValue(detail, "values", "bed") === "twin");
      expect(stateValue(bedState, "values", "bed")).toBe("twin");

      snapshot = await fixture.requestSnapshot();
      const breakfast = field(snapshot, "Breakfast included");
      expect(await fixture.requestAct(snapshot, { op: "check", targetId: breakfast.id, checked: true }, "check"))
        .toMatchObject({ ok: true, observedValue: "true" });
      const checkboxState = await waitForReportDetail(fixture, pagePath, "react-state", (detail) => stateValue(detail, "values", "breakfast") === true);
      expect(stateValue(checkboxState, "values", "breakfast")).toBe(true);
    } finally {
      await fixture.close();
    }
  }, 90_000);

  it.skipIf(!enabled)("fills without Enter or submit events on an implicit-submit form", async () => {
    const fixture = await openFixturePage("/enter-submit.html");
    const pagePath = "/enter-submit.html";
    try {
      const snapshot = await fixture.requestSnapshot();
      const query = field(snapshot, "Search query");
      expect(await fixture.requestAct(snapshot, { op: "fill", targetId: query.id, value: "quiet fill" }, "fill"))
        .toMatchObject({ ok: true, observedValue: "quiet fill" });
      await delay(250);
      const events = pageEvents(await fixture.reports(pagePath));
      expect(events.filter((detail) => ["keydown", "keypress", "keyup"].includes(String(detail.event)))).toHaveLength(0);
      expect(events.some((detail) => detail.event === "submit")).toBe(false);
      expect((await fixture.reports(pagePath)).some((record) => record.type === "enter-form-submit")).toBe(false);
    } finally {
      await fixture.close();
    }
  }, 60_000);

  it.skipIf(!enabled)("blocks select auto-submit without page-visible submit or key events during the act", async () => {
    const fixture = await openFixturePage("/select-autosubmit.html");
    const pagePath = "/select-autosubmit.html";
    try {
      const snapshot = await fixture.requestSnapshot();
      const room = field(snapshot, "Room type");
      expect(await fixture.requestAct(snapshot, { op: "select", targetId: room.id, optionValue: "deluxe" }, "select"))
        .toMatchObject({ ok: true, observedValue: "deluxe" });
      await delay(250);
      const events = pageEvents(await fixture.reports(pagePath));
      expect(events.filter((detail) => ["keydown", "keypress", "keyup"].includes(String(detail.event)))).toHaveLength(0);
      expect(events.some((detail) => detail.event === "submit")).toBe(false);
      expect((await fixture.reports(pagePath)).some((record) => record.type === "select-autosubmit")).toBe(false);
    } finally {
      await fixture.close();
    }
  }, 60_000);
});
