// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { executeAct } from "../src/content/act.js";
import { captureFrameSnapshot } from "../src/content/snapshot.js";
import { withSubmitEventsBlocked } from "../src/content/submit-guard.js";

describe("withSubmitEventsBlocked", () => {
  it("blocks requestSubmit fired by a select change handler and restores submit after cleanup", async () => {
    document.body.innerHTML = '<form><label for="choice">Plan</label><select id="choice" name="choice"><option value="a">A</option><option value="b">B</option></select></form>';
    const form = document.querySelector("form")!;
    const select = document.querySelector("select")!;
    let submitCount = 0;
    let documentCaptureCount = 0;
    document.addEventListener("submit", () => { documentCaptureCount += 1; }, true);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCount += 1;
    });
    select.addEventListener("change", () => form.requestSubmit());
    const frame = captureFrameSnapshot({ document, topOrigin: "https://forms.example", timeBudgetMs: 1000 });
    const field = frame.elements[0]!;

    await expect(executeAct({
      actId: "select-act",
      tabId: 1,
      snapshotVersion: 1,
      action: { op: "select", targetId: field.id, optionValue: "b" },
      expectedKind: "select",
    }, { document })).resolves.toMatchObject({ ok: true, observedValue: "b" });
    expect(submitCount).toBe(0);
    expect(documentCaptureCount).toBe(0);

    form.requestSubmit();
    expect(submitCount).toBe(1);
    expect(documentCaptureCount).toBe(1);
  });

  it("keeps the capture listener until the last overlapping act scope exits", async () => {
    document.body.innerHTML = "<form></form>";
    const form = document.querySelector("form")!;
    let submitCount = 0;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCount += 1;
    });

    let releaseFirst!: () => void;
    const firstWait = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = withSubmitEventsBlocked(document, async () => firstWait);
    await withSubmitEventsBlocked(document, () => undefined);
    form.requestSubmit();
    expect(submitCount).toBe(0);

    releaseFirst();
    await first;
    form.requestSubmit();
    expect(submitCount).toBe(1);
  });

  it("removes the guard after an act throws", async () => {
    document.body.innerHTML = "<form></form>";
    const form = document.querySelector("form")!;
    let submitCount = 0;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitCount += 1;
    });

    await expect(withSubmitEventsBlocked(document, () => { throw new Error("act failed"); })).rejects.toThrow("act failed");
    form.requestSubmit();
    expect(submitCount).toBe(1);
  });
});
