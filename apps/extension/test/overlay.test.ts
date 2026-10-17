// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getHighlightOverlay, openOverlayForContentTest } from "../src/content/overlay.js";
import { walkDocument } from "../src/content/walk.js";

beforeEach(() => {
  document.documentElement.replaceChildren(document.createElement("head"), document.createElement("body"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function boxForTest(): HTMLElement {
  const bridge = openOverlayForContentTest(document);
  if (!bridge) throw new Error("overlay test bridge was not available");
  return bridge.box;
}

describe("closed-shadow highlight overlay", () => {
  it("creates one isolated, text-free, inert host and writes styles through CSSOM", () => {
    const styleAttributeWrite = vi.spyOn(Element.prototype, "setAttribute");
    const overlay = getHighlightOverlay(document);
    const bridge = openOverlayForContentTest(document);

    expect(bridge).toBeDefined();
    expect(document.querySelectorAll("[aria-hidden='true']")).toHaveLength(1);
    expect(bridge!.host.shadowRoot).toBeNull();
    expect(bridge!.root.mode).toBe("closed");
    expect(bridge!.root.textContent).toBe("");
    expect(bridge!.host.getAttribute("aria-hidden")).toBe("true");
    expect(bridge!.host.inert).toBe(true);
    expect(bridge!.host.tabIndex).toBe(-1);
    expect(bridge!.host.style.getPropertyValue("pointer-events")).toBe("none");
    expect(bridge!.host.style.getPropertyValue("z-index")).toBe("2147483647");
    expect(bridge!.box.style.getPropertyValue("border")).toContain("3px");
    expect(bridge!.box.textContent).toBe("");
    expect(getHighlightOverlay(document)).toBe(overlay);
    expect(styleAttributeWrite.mock.calls.some(([, name]) => name.toLowerCase() === "style")).toBe(false);
  });

  it("does not add overlay elements to the content walker output", () => {
    document.body.innerHTML = '<label for="name">Name</label><input id="name">';
    const before = walkDocument(document);

    getHighlightOverlay(document);

    expect(walkDocument(document)).toEqual(before);
  });

  it("moves on scroll and resize, and targetId null clears the box and removes listeners", () => {
    const target = document.createElement("input");
    document.body.append(target);
    let rect = { left: 12, top: 20, width: 80, height: 24, right: 92, bottom: 44 };
    vi.spyOn(target, "getBoundingClientRect").mockImplementation(() => ({ ...rect, x: rect.left, y: rect.top, toJSON: () => ({}) } as DOMRect));
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const overlay = getHighlightOverlay(document);

    overlay.highlight(target);
    expect(boxForTest().style.getPropertyValue("left")).toBe("12px");
    expect(boxForTest().style.getPropertyValue("top")).toBe("20px");
    expect(boxForTest().style.getPropertyValue("width")).toBe("80px");
    expect(boxForTest().style.getPropertyValue("height")).toBe("24px");

    rect = { left: 30, top: 42, width: 96, height: 28, right: 126, bottom: 70 };
    window.dispatchEvent(new Event("scroll"));
    expect(boxForTest().style.getPropertyValue("left")).toBe("30px");
    window.dispatchEvent(new Event("resize"));
    expect(boxForTest().style.getPropertyValue("top")).toBe("42px");

    overlay.highlight(null);
    expect(boxForTest().style.getPropertyValue("visibility")).toBe("hidden");
    expect(add).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("hides when the active target disconnects and dispose removes the host", async () => {
    const target = document.createElement("input");
    document.body.append(target);
    const overlay = getHighlightOverlay(document);
    overlay.highlight(target);

    target.remove();
    await Promise.resolve();

    expect(boxForTest().style.getPropertyValue("visibility")).toBe("hidden");
    overlay.dispose();
    expect(openOverlayForContentTest(document)).toBeUndefined();
    expect(document.querySelector("[aria-hidden='true']")).toBeNull();
  });
});
