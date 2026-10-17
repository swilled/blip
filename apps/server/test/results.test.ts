import { describe, expect, it } from "vitest";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { buildBaselineFormModel } from "../src/baseline";
import { interpretResult } from "../src/results/interpret";

function interpretFixture(name: Parameters<typeof loadSnapshot>[0]) {
  const snapshot = loadSnapshot(name);
  return { snapshot, result: interpretResult(snapshot, buildBaselineFormModel(snapshot)) };
}

describe("interpretResult", () => {
  it("confirms only from bounded page evidence and extracts a number from that evidence", () => {
    const { result } = interpretFixture("result-ok");

    expect(result).toEqual({
      status: "confirmed",
      confirmationNumber: "BK-48213",
      fieldErrors: [],
      pageErrors: [],
    });
  });

  it("does not treat a title-only confirmation as evidence", () => {
    const snapshot = loadSnapshot("result-ok");
    snapshot.headings = [];
    snapshot.alerts = [];

    expect(interpretResult(snapshot, buildBaselineFormModel(snapshot))).toEqual({
      status: "unverified",
      confirmationNumber: null,
      fieldErrors: [],
      pageErrors: [],
    });
  });

  it("does not treat navigation alone as evidence", () => {
    const snapshot = loadSnapshot("booking");
    snapshot.url = "http://127.0.0.1:7777/fixtures/forms/booking-done.html";
    snapshot.headings = [];
    snapshot.alerts = [];

    expect(interpretResult(snapshot, buildBaselineFormModel(snapshot)).status).toBe("unverified");
  });

  it("does not combine a fresh page with a model from a different snapshot", () => {
    const snapshot = loadSnapshot("result-errors");
    const model = buildBaselineFormModel(snapshot);
    snapshot.version += 1;

    expect(interpretResult(snapshot, model)).toEqual({
      status: "unverified",
      confirmationNumber: null,
      fieldErrors: [],
      pageErrors: [],
    });
  });

  it("reports every labeled field error in document order and page errors separately", () => {
    const { result } = interpretFixture("result-errors");

    expect(result).toEqual({
      status: "errors",
      confirmationNumber: null,
      fieldErrors: [
        { label: "Email address", message: "Enter a valid email address." },
        { label: "Check-in date", message: "Check-in date is required." },
      ],
      pageErrors: ["Please fix 2 errors before continuing."],
    });
  });

  it("does not borrow a number from a different alert than the confirmation evidence", () => {
    const snapshot = loadSnapshot("result-ok");
    snapshot.headings = [{ level: 1, text: "Booking confirmed" }];
    snapshot.alerts = ["Reference code BK-99999"];

    expect(interpretResult(snapshot, buildBaselineFormModel(snapshot))).toMatchObject({
      status: "confirmed",
      confirmationNumber: null,
      pageErrors: ["Reference code BK-99999"],
    });
  });

  it("redacts current field values and long sensitive numbers from reported errors", () => {
    const snapshot = loadSnapshot("result-errors");
    const model = buildBaselineFormModel(snapshot);
    const email = model.fields.find((field) => field.label === "Email address")!;
    email.error = `Invalid value ${email.value}; card 4111 1111 1111 1111 was rejected.`;
    model.pageErrors = ["The submitted profile Ann Lee could not be verified."];

    const result = interpretResult(snapshot, model);
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("ann@");
    expect(serialized).not.toContain("4111");
    expect(serialized).not.toContain("Ann Lee");
    expect(result.fieldErrors[0]?.label).toBe("Email address");
  });
});
