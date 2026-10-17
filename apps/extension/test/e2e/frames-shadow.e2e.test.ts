// @vitest-environment node
import process from "node:process";
import { describe, expect, it } from "vitest";
import { FRAME_FALLBACK_ALERT } from "../../src/background/frames.js";
import { openFixturePage } from "./harness.js";

const enabled = process.env["BLIP_E2E_BROWSER"] === "1";

async function fillFrameField(pagePath: string, expectedFrame: "same-origin" | "cross-origin") {
  const fixture = await openFixturePage(pagePath);
  try {
    const snapshot = await fixture.requestSnapshot();
    const frameField = snapshot.elements.find((element) =>
      element.frameId > 0 && element.category === "field" &&
      element.labelCandidates.some((candidate) => candidate.text === "Message for this frame"),
    );
    if (!frameField) {
      expect(expectedFrame).toBe("cross-origin");
      expect(snapshot.alerts.filter((alert) => alert === FRAME_FALLBACK_ALERT)).toHaveLength(1);
      return;
    }

    const value = `Hello from the ${expectedFrame} frame`;
    const result = await fixture.requestAct(snapshot, { op: "fill", targetId: frameField.id, value }, "fill");
    expect(result).toMatchObject({ ok: true, observedValue: value });
    const refreshed = await fixture.requestSnapshot();
    expect(refreshed.elements.find((element) => element.id === frameField.id)?.value).toBe(value);
  } finally {
    await fixture.close();
  }
}

describe("real frame and shadow actions", () => {
  it.skipIf(!enabled)("fills a same-origin iframe field", async () => {
    await fillFrameField("/frame-same.html", "same-origin");
  }, 60_000);

  it.skipIf(!enabled)("fills a cross-origin iframe field or reports the bounded fallback", async () => {
    await fillFrameField("/frame-cross.html", "cross-origin");
  }, 60_000);

  it.skipIf(!enabled)("fills a field in an open shadow root", async () => {
    const fixture = await openFixturePage("/shadow.html");
    try {
      const snapshot = await fixture.requestSnapshot();
      const field = snapshot.elements.find((element) =>
        element.category === "field" && element.labelCandidates.some((candidate) => candidate.text === "Note in open shadow root"),
      );
      expect(field).toBeDefined();
      if (!field) throw new Error("open shadow-root field was not captured");

      const result = await fixture.requestAct(snapshot, { op: "fill", targetId: field.id, value: "Shadow note" }, "fill");
      expect(result).toMatchObject({ ok: true, observedValue: "Shadow note" });
      const refreshed = await fixture.requestSnapshot();
      expect(refreshed.elements.find((element) => element.id === field.id)?.value).toBe("Shadow note");
    } finally {
      await fixture.close();
    }
  }, 60_000);
});
