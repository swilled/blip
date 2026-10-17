import { describe, expect, it } from "vitest";
import { buildFrame, canSend, parseFrame, Snapshot } from "../src/index";
import { FIXTURE_NAMES, loadSnapshot } from "../src/fixtures-loader";

describe.each(FIXTURE_NAMES)("fixture %s", (name) => {
  const snap = loadSnapshot(name);

  it("parses against the Snapshot schema", () => {
    expect(Snapshot.safeParse(snap).success).toBe(true);
  });

  it("has unique element ids of the form e<N>", () => {
    const ids = snap.elements.map((e) => e.id);
    for (const id of ids) expect(id).toMatch(/^e\d+$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("required equals (requiredSource is not none) for every element", () => {
    for (const e of snap.elements) expect(e.required).toBe(e.requiredSource !== "none");
  });

  it("carries no value on a sensitive element", () => {
    for (const e of snap.elements) {
      if (e.sensitive !== "none") expect(e.value).toBeNull();
    }
  });

  it("rides inside a snapshot.result frame accepted from the extension role", () => {
    const frame = buildFrame("snapshot.result", { ok: true, snapshot: snap });
    const r = parseFrame(JSON.stringify(frame));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.message.type).toBe("snapshot.result");
    expect(canSend("extension", "snapshot.result")).toBe(true);
  });
});

describe("booking fixture composition", () => {
  const snap = loadSnapshot("booking");
  it("has 12 elements: 9 fields (6 required) and 3 actions", () => {
    expect(snap.elements).toHaveLength(12);
    expect(snap.elements.filter((e) => e.category === "field")).toHaveLength(9);
    expect(snap.elements.filter((e) => e.category === "action")).toHaveLength(3);
    expect(snap.elements.filter((e) => e.required)).toHaveLength(6);
  });
});

describe("fixture composition (counts are part of the contract)", () => {
  const counts = (name: (typeof FIXTURE_NAMES)[number]) => {
    const els = loadSnapshot(name).elements;
    return {
      total: els.length,
      fields: els.filter((e) => e.category === "field").length,
      visibleFields: els.filter((e) => e.category === "field" && e.visible).length,
      actions: els.filter((e) => e.category === "action").length,
      required: els.filter((e) => e.category === "field" && e.visible && e.required).length,
    };
  };

  it("broken: 8 elements, 5 visible fields (2 required), 2 actions", () => {
    expect(counts("broken")).toEqual({ total: 8, fields: 6, visibleFields: 5, actions: 2, required: 2 });
  });

  it("result-ok: 0 fields, 1 action", () => {
    expect(counts("result-ok")).toMatchObject({ fields: 0, actions: 1 });
  });

  it("result-errors: the booking form re-rendered at version 2 with the same 12 elements", () => {
    const booking = loadSnapshot("booking");
    const errors = loadSnapshot("result-errors");
    expect(errors.version).toBe(2);
    expect(errors.elements.map((e) => e.id)).toEqual(booking.elements.map((e) => e.id));
    expect(errors.alerts).toEqual(["Please fix 2 errors before continuing."]);
  });

  it("covers every fixture name", () => {
    expect([...FIXTURE_NAMES]).toEqual(["booking", "broken", "result-ok", "result-errors"]);
  });
});
