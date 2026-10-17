// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StructuralChange } from "../src/content/observer.js";
import { getHighlightOverlay } from "../src/content/overlay.js";
import { observeStructuralChanges } from "../src/content/observer.js";

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.replaceChildren(document.createElement("head"), document.createElement("body"));
});

afterEach(() => {
  getHighlightOverlay(document).dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function flushMutationTurn(ms = 0): Promise<void> {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(ms);
  await Promise.resolve();
}

describe("structural page mutation observer", () => {
  it("keeps value-only input and checked changes silent", async () => {
    document.body.innerHTML = '<label for="name">Name</label><input id="name"><label><input id="check" type="checkbox">Agree</label>';
    const changes: StructuralChange[] = [];
    const stop = observeStructuralChanges(document, (change) => changes.push(change));

    document.querySelector<HTMLInputElement>("#name")!.value = "private value";
    document.querySelector<HTMLInputElement>("#check")!.checked = true;
    document.querySelector<HTMLInputElement>("#name")!.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector<HTMLInputElement>("#check")!.dispatchEvent(new Event("change", { bubbles: true }));
    await flushMutationTurn(1000);

    expect(changes).toEqual([]);
    stop();
  });

  it("emits for reveal, disabled/required flips, errors, alerts, and added or removed controls", async () => {
    document.body.innerHTML = `
      <input id="revealed" hidden>
      <input id="locked" disabled>
      <input id="required">
      <div id="errors"></div>
      <div id="alerts"></div>
      <input id="removed">
    `;
    const changes: StructuralChange[] = [];
    const stop = observeStructuralChanges(document, (change) => changes.push(change));
    const changeCount = async (): Promise<void> => flushMutationTurn(0);

    document.querySelector<HTMLInputElement>("#revealed")!.hidden = false;
    await changeCount();
    document.querySelector<HTMLInputElement>("#locked")!.disabled = false;
    await changeCount();
    document.querySelector<HTMLInputElement>("#required")!.required = true;
    await changeCount();
    document.querySelector("#errors")!.innerHTML = '<span id="error" role="alert">Required</span>';
    await changeCount();
    document.querySelector("#alerts")!.innerHTML = '<div role="status">Saved</div>';
    await changeCount();
    document.querySelector("#removed")!.remove();
    await changeCount();
    document.querySelector("#required")!.remove();
    await changeCount();

    expect(changes).toHaveLength(7);
    expect(changes.every((change) => /^[0-9a-f]{8}$/.test(change.structuralHash) && /^[0-9a-f]{8}$/.test(change.changeSignature))).toBe(true);
    expect(JSON.stringify(changes)).not.toContain("Required");
    expect(JSON.stringify(changes)).not.toContain("private value");
    stop();
  });

  it("observes open shadow roots and ignores overlay and private-id noise", async () => {
    const host = document.createElement("x-panel");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = '<label>Inside<input id="shadow-field"></label>';
    document.body.append(host);

    const overlay = getHighlightOverlay(document);
    const changes: StructuralChange[] = [];
    const stop = observeStructuralChanges(document, (change) => changes.push(change));
    const baseline = changes.length;
    root.querySelector("input")!.setAttribute("required", "");
    await flushMutationTurn(0);
    expect(changes).toHaveLength(baseline + 1);

    const field = document.querySelector("x-panel")!.shadowRoot!.querySelector("input")!;
    field.setAttribute("data-blip-id", "e999");
    openOverlayForMutationTest(overlay).host.setAttribute("class", "decorative-change");
    await flushMutationTurn(1000);
    expect(changes).toHaveLength(baseline + 1);
    expect(document.querySelectorAll("input")).toHaveLength(0);
    stop();
  });

  it("coalesces a thousand-mutation burst and spaces later passes by at least 500 ms", async () => {
    document.body.innerHTML = '<input id="required">';
    const changes: Array<{ change: StructuralChange; at: number }> = [];
    const start = Date.now();
    const stop = observeStructuralChanges(document, (change) => changes.push({ change, at: Date.now() }));
    const required = document.querySelector<HTMLInputElement>("#required")!;

    for (let index = 0; index < 1000; index += 1) required.toggleAttribute("required", index % 2 === 1);
    await flushMutationTurn(0);
    await flushMutationTurn(499);
    expect(changes).toHaveLength(1);

    document.body.append(document.createElement("textarea"));
    await flushMutationTurn(0);
    expect(changes).toHaveLength(1);
    await flushMutationTurn(1);
    expect(changes).toHaveLength(2);
    expect(changes[1]!.at - changes[0]!.at).toBeGreaterThanOrEqual(500);
    expect(changes[0]!.at - start).toBeLessThanOrEqual(500);

    stop();
    document.body.append(document.createElement("input"));
    await flushMutationTurn(1000);
    expect(changes).toHaveLength(2);
  });
});

function openOverlayForMutationTest(overlay: ReturnType<typeof getHighlightOverlay>) {
  const host = document.querySelector("[aria-hidden='true']") as HTMLElement | null;
  if (!host) throw new Error("overlay host is not present");
  return { overlay, host };
}
