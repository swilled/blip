// @vitest-environment node
import process from "node:process";
import { describe, expect, it } from "vitest";
import { openFixturePage } from "./harness.js";

describe("real React fill and privacy boundary", () => {
  const enabled = process.env["BLIP_E2E_BROWSER"] === "1";

  it.skipIf(!enabled)("reads back React state and redacts a card-shaped value from an unclassified field", async () => {
    const fixture = await openFixturePage("/react-form.html");
    const cardNumber = "4111111111111111";

    try {
      let snapshot = await fixture.requestSnapshot();
      const fullName = snapshot.elements.find((element) =>
        element.category === "field" && element.labelCandidates.some((candidate) => candidate.text === "Full name"),
      );
      expect(fullName).toBeDefined();
      if (!fullName) throw new Error("React full name field was not captured");

      const fill = await fixture.requestAct(snapshot, { op: "fill", targetId: fullName.id, value: "Ada Lovelace" }, "fill");
      expect(fill).toMatchObject({ ok: true, observedValue: "Ada Lovelace" });
      snapshot = await fixture.requestSnapshot();
      expect(snapshot.elements.find((element) => element.id === fullName.id)?.value).toBe("Ada Lovelace");

      const cardWrite = await fixture.requestAct(snapshot, { op: "fill", targetId: fullName.id, value: cardNumber }, "fill");
      expect(cardWrite).toMatchObject({ ok: false, error: "sensitive-field", observedValue: null });
      snapshot = await fixture.requestSnapshot();
      const refreshed = snapshot.elements.find((element) => element.id === fullName.id);
      expect(refreshed).toMatchObject({ sensitive: "card-number", value: null, hasValue: true });
      expect(JSON.stringify({ cardWrite, snapshot })).not.toContain(cardNumber);
    } finally {
      await fixture.close();
    }
  }, 60_000);
});
