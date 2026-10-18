import { GATED_KINDS, newId } from "@blip/protocol";
import { describe, expect, test } from "vitest";
import { createStubGate } from "./gate-port";

const request = (kind: string, title = "Blah") => ({
  actionId: newId(),
  speakId: newId(),
  kind,
  title,
  digest: "form-digest",
});

describe("createStubGate", () => {
  test("arms every gated kind for 30 seconds", async () => {
    const now = () => 12_345;
    const gate = createStubGate(now);
    const expectedPhrases = [
      "submit form",
      "confirm payment",
      "confirm delete",
      "send it now",
      "leave this site",
    ];

    for (const [index, kind] of GATED_KINDS.entries()) {
      const result = await gate.arm(request(kind));

      expect(result).toEqual({
        ok: true,
        grantId: expect.any(String),
        speakId: expect.any(String),
        phrase: expectedPhrases[index],
        expiresAt: now() + 30_000,
      });
      if (result.ok) expect(result.grantId).not.toBe("");
    }
  });

  test("does not arm ungated or unknown kinds", async () => {
    const gate = createStubGate(() => 0);

    await expect(gate.arm(request("fill"))).resolves.toEqual({
      ok: false,
      reason: "not-gated",
    });
    await expect(gate.arm(request("click-safe"))).resolves.toEqual({
      ok: false,
      reason: "not-gated",
    });
    await expect(gate.arm(request("unknown"))).resolves.toEqual({
      ok: false,
      reason: "not-gated",
    });
  });

  test.each([
    ["Customer survey", "submit survey"],
    ["Hotel booking", "submit booking"],
    ["Blah", "submit form"],
    ["yes please", "submit form"],
    ["Survey booking", "submit booking"],
    ["surveys and bookings", "submit form"],
  ])("chooses a fixed submit phrase for title %j", async (title, phrase) => {
    const result = await createStubGate(() => 1).arm(request("submit", title));

    expect(result).toMatchObject({ ok: true, phrase });
  });

  test("redeem always refuses for arbitrary and minted grant ids", async () => {
    const gate = createStubGate(() => 0);
    const minted = await gate.arm(request("submit"));
    const grantIds = Array.from({ length: 100 }, (_, index) => `grant-${index}`);
    if (minted.ok) grantIds.push(minted.grantId);

    for (const grantId of grantIds) {
      await expect(gate.redeem({ grantId, speakId: "tracked", utteranceId: "u1", phrase: "submit survey" })).resolves.toEqual({
        ok: false,
        reason: "gate-not-connected",
      });
    }
  });

  test("clear is a no-op and does not throw", () => {
    const gate = createStubGate(() => 0);

    expect(() => gate.clear("any-grant", "expired")).not.toThrow();
  });
});
