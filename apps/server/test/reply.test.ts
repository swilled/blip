import { describe, expect, it } from "vitest";
import type { FormModel } from "@blip/protocol";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { buildBaselineFormModel } from "../src/baseline";
import { describeReply, readFormReply, requiredReply } from "../src/reply";

const booking = () => buildBaselineFormModel(loadSnapshot("booking"));
const broken = () => buildBaselineFormModel(loadSnapshot("broken"));

describe("describeReply", () => {
  it("booking", () => {
    expect(describeReply(booking())).toBe("Hotel booking. 9 fields, 6 required, 3 actions.");
  });

  it("broken", () => {
    expect(describeReply(broken())).toBe("Customer survey. 5 fields, 2 required, 2 actions.");
  });

  it("uses singular forms", () => {
    const m: FormModel = { ...booking(), fields: booking().fields.slice(0, 1), actions: booking().actions.slice(0, 1) };
    expect(describeReply(m)).toBe("Hotel booking. 1 field, 1 required, 1 action.");
  });

  it("handles a page with no fields", () => {
    const m: FormModel = { ...booking(), fields: [], actions: booking().actions.slice(0, 2) };
    expect(describeReply(m)).toBe("Hotel booking. No fields, 2 actions.");
  });
});

describe("requiredReply", () => {
  it("booking lists the six required labels", () => {
    expect(requiredReply(booking())).toBe(
      "6 required: Full name, Email address, Check-in date, Room type, Bed preference, Card number.",
    );
  });

  it("hedges low-confidence labels", () => {
    expect(requiredReply(broken())).toBe("2 required: probably q2 email, probably How did you hear about us.");
  });

  it("says so when nothing is required", () => {
    const m: FormModel = { ...booking(), fields: booking().fields.map((f) => ({ ...f, required: false })) };
    expect(requiredReply(m)).toBe("No fields are required.");
  });
});

describe("readFormReply", () => {
  it("booking starts and ends as specified", () => {
    const text = readFormReply(booking());
    expect(text.startsWith("Hotel booking. 9 fields. 1: Full name, required. 2: Email address, required. 3: Phone number.")).toBe(true);
    expect(text.endsWith("9: Card number, required.")).toBe(true);
  });

  it("reads an empty label as unlabeled field and hedges guessed labels", () => {
    const text = readFormReply(broken());
    expect(text).toContain("1: probably Your name.");
    expect(text).toContain("2: probably q2 email, required.");
    expect(text).toContain("3: unlabeled field.");
    expect(text).toContain("5: Age.");
  });
});

describe("no reply carries a field value (T-01-28)", () => {
  it("renders every field by label only, including the sensitive card field", () => {
    const base = booking();
    const m: FormModel = {
      ...base,
      fields: base.fields.map((f) =>
        f.sensitive === "none" ? { ...f, value: "SENTINEL-VALUE-1234", hasValue: true } : { ...f, hasValue: true },
      ),
    };
    for (const text of [describeReply(m), requiredReply(m), readFormReply(m)]) {
      expect(text).not.toContain("SENTINEL");
      expect(text).not.toMatch(/\d{4}/);
    }
    expect(readFormReply(m)).toContain("9: Card number, required.");
  });
});
