// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Snapshot } from "@blip/protocol";
import { captureFrameSnapshot } from "../src/content/snapshot.js";

const rect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 80,
  bottom: 20,
  width: 80,
  height: 20,
  toJSON: () => ({}),
};

beforeEach(() => {
  document.body.replaceChildren();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
});

describe("captureFrameSnapshot", () => {
  it("produces a frozen-schema-compatible frame snapshot and redacts value-shaped card data", () => {
    document.title = "Booking";
    document.body.innerHTML = `
      <h1>Book a room</h1><div role="alert">Choose a room</div>
      <label for="reference">Reference</label><input id="reference" name="reference" value="4111 1111 1111 1111">
    `;

    const frame = captureFrameSnapshot({ document, topOrigin: "https://forms.example", frameId: 0, timeBudgetMs: 1000 });
    const cardLikeField = frame.elements.find((element) => element.name === "reference");
    const fullSnapshot = Snapshot.safeParse({
      snapshotId: "test-frame",
      version: 1,
      tabId: 1,
      ...frame,
      capturedAt: Date.now(),
    });

    expect(fullSnapshot.success).toBe(true);
    expect(frame).toMatchObject({ title: "Booking", origin: "https://forms.example", headings: [{ level: 1, text: "Book a room" }], alerts: ["Choose a room"], truncated: false });
    expect(cardLikeField).toMatchObject({ sensitive: "card-number", value: null, hasValue: true });
  });

  it("sets truncated only when the 250-element wire list is cut, keeping fields before actions", () => {
    document.body.innerHTML = `<button type="button">Close</button>${Array.from({ length: 249 }, (_, index) => `<input name="field${index}">`).join("")}<button type="button">Dismiss</button>`;

    const frame = captureFrameSnapshot({ document, topOrigin: "https://forms.example", timeBudgetMs: 1000 });

    expect(frame.elements).toHaveLength(250);
    expect(frame.truncated).toBe(true);
    expect(frame.elements.slice(0, 249).every((element) => element.category === "field")).toBe(true);
    expect(frame.elements[0]?.name).toBe("field0");
    expect(frame.elements[248]?.name).toBe("field248");
    expect(frame.elements[249]).toMatchObject({ category: "action", text: "Close" });
  });

  it("caps headings, alerts and options without marking the element list truncated", () => {
    document.body.innerHTML = `${Array.from({ length: 41 }, (_, index) => `<h2>Heading ${index}</h2>`).join("")}${Array.from({ length: 21 }, (_, index) => `<div role="alert">Alert ${index}</div>`).join("")}<label for="large">Choice</label><select id="large" name="large">${Array.from({ length: 201 }, (_, index) => `<option value="${index}" ${index === 200 ? "selected" : ""}>Option ${index}</option>`).join("")}</select>`;

    const frame = captureFrameSnapshot({ document, topOrigin: "https://forms.example" });
    const select = frame.elements.find((element) => element.name === "large");

    expect(frame.headings).toHaveLength(40);
    expect(frame.alerts).toHaveLength(20);
    expect(select?.options).toHaveLength(200);
    expect(select?.options?.at(-1)).toMatchObject({ value: "200", selected: true });
    expect(frame.truncated).toBe(false);
  });

  it("does not set truncated when the walk time budget expires before reaching the wire cap", () => {
    document.body.innerHTML = `<input name="first"><input name="second">`;
    const frame = captureFrameSnapshot({ document, topOrigin: "https://forms.example", timeBudgetMs: -1 });

    expect(frame.elements).toHaveLength(0);
    expect(frame.truncated).toBe(false);
  });
});
