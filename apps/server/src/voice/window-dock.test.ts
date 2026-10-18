import { describe, expect, it } from "vitest";
import { GAP, PANEL_WIDTH, STRIP, dockLayout, easeOutCubic, parseDockEdge, tweenRect, zoneAt } from "./window-dock";

const work = { x: 0, y: 0, w: 1920, h: 1040 };
const frame = { w: 0, h: 32 };

describe("dockLayout", () => {
  it("docks right: sidebar on the right edge, browser fills the rest", () => {
    const { blip, browser } = dockLayout("right", work, frame);
    expect(blip).toEqual({ x: 1920 - PANEL_WIDTH - GAP, y: GAP, w: PANEL_WIDTH, h: 1040 - GAP * 2 });
    expect(browser).toEqual({ x: 0, y: 0, w: 1920 - PANEL_WIDTH - GAP * 2, h: 1040 });
    expect(browser.x + browser.w + GAP).toBe(blip.x);
  });

  it("docks left: mirror of right", () => {
    const { blip, browser } = dockLayout("left", work, frame);
    expect(blip.x).toBe(GAP);
    expect(browser.x).toBe(PANEL_WIDTH + GAP * 2);
    expect(browser.x + browser.w).toBe(1920);
  });

  it("docks top: a centered strip with the frame added, browser full size", () => {
    const { blip, browser } = dockLayout("top", { x: 100, y: 0, w: 1920, h: 1040 }, frame);
    expect(blip.w).toBe(STRIP.w);
    expect(blip.h).toBe(STRIP.h + 32);
    expect(blip.x).toBe(100 + (1920 - STRIP.w) / 2);
    expect(browser).toEqual({ x: 100, y: 0, w: 1920, h: 1040 });
  });
});

describe("zoneAt", () => {
  it("maps the outer columns to left/right and the top band to the strip", () => {
    expect(zoneAt({ x: 50, y: 500 }, work)).toBe("left");
    expect(zoneAt({ x: 1900, y: 20 }, work)).toBe("right");
    expect(zoneAt({ x: 960, y: 40 }, work)).toBe("top");
    expect(zoneAt({ x: 960, y: 600 }, work)).toBeNull();
  });

  it("works on a second monitor's work area", () => {
    expect(zoneAt({ x: 1930, y: 500 }, { x: 1920, y: 0, w: 1920, h: 1040 })).toBe("left");
  });
});

describe("tween", () => {
  it("eases out and clamps", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  it("interpolates every side of the rect", () => {
    const from = { x: 0, y: 0, w: 100, h: 100 };
    const to = { x: 200, y: 100, w: 300, h: 50 };
    expect(tweenRect(from, to, 0)).toEqual(from);
    expect(tweenRect(from, to, 1)).toEqual(to);
  });
});

it("parseDockEdge accepts only the three edges", () => {
  expect(parseDockEdge("left")).toBe("left");
  expect(parseDockEdge("bottom")).toBeNull();
  expect(parseDockEdge(1)).toBeNull();
});
