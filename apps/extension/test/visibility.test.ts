// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createIdRegistry } from "../src/content/ids.js";
import { fingerprintOf } from "../src/content/fingerprint.js";
import { boundedText } from "../src/content/text.js";
import { isDisabled, isVisible } from "../src/content/visibility.js";

function setRect(element: Element, rect: Partial<DOMRect> & Pick<DOMRect, "left" | "top" | "width" | "height">) {
  const fullRect = {
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
    ...rect,
  };
  Object.defineProperty(element, "getBoundingClientRect", { value: () => fullRect });
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("private element identity", () => {
  it("resolves ids only from its private table, ignoring page-stamped decoys", () => {
    document.body.innerHTML = '<button data-blip-id="e77">page decoy</button><input data-blip-id="e88">';
    const [decoy, target] = Array.from(document.body.children);
    const registry = createIdRegistry();

    expect(registry.resolve("e77")).toBeNull();
    const id = registry.idFor(target!, fingerprintOf({
      tag: "input", inputType: "text", name: "givenName", role: "textbox",
      labelCandidates: [{ text: "First name", source: "label", confidence: 1 }],
      visible: true, disabled: false,
    }));

    expect(target?.getAttribute("data-blip-id")).toBe(id);
    expect(registry.resolve("e88")).toBeNull();
    expect(registry.resolve(id)).toBe(target);
    expect(decoy?.getAttribute("data-blip-id")).toBe("e77");
  });

  it("reuses an id when a framework replaces a disconnected equivalent node", () => {
    const registry = createIdRegistry();
    const fingerprint = fingerprintOf({
      tag: "input", inputType: "text", name: "givenName", role: "textbox",
      labelCandidates: [{ text: "First name", source: "label", confidence: 1 }],
      visible: true, disabled: false,
    });
    const original = document.createElement("input");
    document.body.append(original);
    const id = registry.idFor(original, fingerprint);
    original.remove();

    const replacement = document.createElement("input");
    document.body.append(replacement);
    expect(registry.idFor(replacement, fingerprint)).toBe(id);
    expect(registry.resolve(id)).toBe(replacement);
  });
});

describe("bounded text", () => {
  it("normalizes whitespace and respects both code-point and UTF-16 caps", () => {
    expect(boundedText("  A\t😀    B  ", 3, 4)).toBe("A 😀");
    expect(boundedText("x😀y", 20, 2)).toBe("x");
  });
});

describe("rendered visibility", () => {
  it("keeps rendered below-fold controls visible without viewport intersection", () => {
    const input = document.createElement("input");
    document.body.append(input);
    setRect(input, { left: 12, top: 1400, width: 120, height: 24 });
    expect(isVisible(input)).toBe(true);
  });

  it("hides descendants of hidden or display-none ancestors", () => {
    const hidden = document.createElement("section");
    hidden.hidden = true;
    const first = document.createElement("input");
    hidden.append(first);
    document.body.append(hidden);

    const displayNone = document.createElement("section");
    displayNone.style.display = "none";
    const second = document.createElement("input");
    displayNone.append(second);
    document.body.append(displayNone);

    expect(isVisible(first)).toBe(false);
    expect(isVisible(second)).toBe(false);
  });

  it("hides zero-size controls and off-page honeypots", () => {
    const zero = document.createElement("input");
    document.body.append(zero);
    setRect(zero, { left: 10, top: 10, width: 0, height: 0 });

    const honeypot = document.createElement("input");
    document.body.append(honeypot);
    setRect(honeypot, { left: -9999, top: 10, width: 100, height: 20 });

    expect(isVisible(zero)).toBe(false);
    expect(isVisible(honeypot)).toBe(false);
  });
});

describe("shared disabled predicate", () => {
  it("recognizes disabled controls, disabled fieldsets and aria-disabled ancestors", () => {
    document.body.innerHTML = `
      <input id="native" disabled>
      <fieldset disabled><input id="fieldset"></fieldset>
      <div aria-disabled="true"><button id="aria">Save</button></div>
      <fieldset disabled><legend><input id="legend-exception"></legend></fieldset>
    `;
    const get = (id: string) => document.getElementById(id)!;

    expect(isDisabled(get("native"))).toBe(true);
    expect(isDisabled(get("fieldset"))).toBe(true);
    expect(isDisabled(get("aria"))).toBe(true);
    expect(isDisabled(get("legend-exception"))).toBe(false);
  });

  it("treats readonly inputs and textareas as disabled, but not selects", () => {
    document.body.innerHTML = '<input id="input" readonly><textarea id="textarea" readonly></textarea><select id="select"></select>';
    expect(isDisabled(document.getElementById("input")!)).toBe(true);
    expect(isDisabled(document.getElementById("textarea")!)).toBe(true);
    expect(isDisabled(document.getElementById("select")!)).toBe(false);
  });
});
