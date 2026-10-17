// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActRequest, ActionKind } from "@blip/protocol";
import { executeAct } from "../src/content/act.js";
import { getHighlightOverlay, openOverlayForContentTest } from "../src/content/overlay.js";
import { captureFrameSnapshot } from "../src/content/snapshot.js";

beforeEach(() => {
  document.documentElement.replaceChildren(document.createElement("head"), document.createElement("body"));
});

afterEach(() => {
  getHighlightOverlay(document).dispose();
  vi.restoreAllMocks();
});

function setRect(element: Element, left: number, top: number, width: number, height: number): void {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect);
}

function makeRequest(targetId: string, action: ActRequest["action"], expectedKind: ActionKind): ActRequest {
  return {
    actId: `act-${action.op}`,
    tabId: 1,
    snapshotVersion: 1,
    action: { ...action, targetId } as ActRequest["action"],
    expectedKind,
  };
}

describe("production acts update the page highlight", () => {
  it("moves the real closed-shadow overlay after fill, focus, select and check", async () => {
    document.body.innerHTML = `
      <label for="fill">Name</label><input id="fill" name="name">
      <label for="focus">Focus</label><input id="focus" name="focus">
      <label for="select">Room</label><select id="select" name="room"><option value="a">A</option><option value="b">B</option></select>
      <label><input id="check" name="agree" type="checkbox">Agree</label>
    `;
    setRect(document.querySelector("#fill")!, 10, 20, 80, 24);
    setRect(document.querySelector("#focus")!, 110, 120, 90, 25);
    setRect(document.querySelector("#select")!, 210, 220, 100, 26);
    setRect(document.querySelector("#check")!, 310, 320, 18, 18);
    const elements = captureFrameSnapshot({ document, topOrigin: "https://forms.example", timeBudgetMs: 1000 }).elements;
    const byName = (name: string) => elements.find((element) => element.name === name)!;

    const overlay = getHighlightOverlay(document);
    const checkPosition = (left: string, top: string, width: string, height: string): void => {
      const bridge = openOverlayForContentTest(document);
      if (!bridge) throw new Error("content overlay test bridge was not available");
      expect(bridge.box.style.getPropertyValue("left")).toBe(left);
      expect(bridge.box.style.getPropertyValue("top")).toBe(top);
      expect(bridge.box.style.getPropertyValue("width")).toBe(width);
      expect(bridge.box.style.getPropertyValue("height")).toBe(height);
    };

    const fill = byName("name");
    const fillResult = await executeAct(makeRequest(fill.id, { op: "fill", targetId: fill.id, value: "Ada" }, "fill"));
    expect(fillResult, JSON.stringify(fillResult)).toMatchObject({ ok: true });
    checkPosition("10px", "20px", "80px", "24px");

    const focus = byName("focus");
    await expect(executeAct(makeRequest(focus.id, { op: "focus", targetId: focus.id }, "fill"))).resolves.toMatchObject({ ok: true });
    checkPosition("110px", "120px", "90px", "25px");

    const select = byName("room");
    await expect(executeAct(makeRequest(select.id, { op: "select", targetId: select.id, optionValue: "b" }, "select"))).resolves.toMatchObject({ ok: true });
    checkPosition("210px", "220px", "100px", "26px");

    const check = byName("agree");
    await expect(executeAct(makeRequest(check.id, { op: "check", targetId: check.id, checked: true }, "check"))).resolves.toMatchObject({ ok: true });
    checkPosition("310px", "320px", "18px", "18px");

    const bridge = openOverlayForContentTest(document)!;
    expect(bridge.host.shadowRoot).toBeNull();
    expect(bridge.host.textContent).toBe("");
    expect(bridge.root.textContent).toBe("");
    expect(bridge.host.getAttribute("id")).toBeNull();
    expect(bridge.host.getAttribute("data-blip-id")).toBeNull();
    expect(bridge.host.textContent).not.toMatch(/Ada|Name|Room|Agree|4111/);

    overlay.highlight(null);
    expect(bridge.box.style.getPropertyValue("visibility")).toBe("hidden");
  });
});
