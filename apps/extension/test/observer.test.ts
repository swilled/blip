// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StructuralChange } from "../src/content/observer.js";
import { getHighlightOverlay, openOverlayForContentTest } from "../src/content/overlay.js";
import { observeStructuralChanges } from "../src/content/observer.js";

let activeObservers: Array<() => void> = [];

beforeEach(() => {
  vi.useFakeTimers();
  activeObservers = [];
  document.documentElement.replaceChildren(document.createElement("head"), document.createElement("body"));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20, toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  for (const stop of activeObservers) stop();
  if (openOverlayForContentTest(document)) getHighlightOverlay(document).dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function flushMutationTurn(ms = 0): Promise<void> {
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(ms);
  await Promise.resolve();
}

function startObserver(onChange: (change: StructuralChange) => void): () => void {
  const stop = observeStructuralChanges(document, onChange);
  activeObservers.push(stop);
  return stop;
}

describe("structural page mutation observer", () => {
  it("signals live value changes without including values in the page-change message", async () => {
    document.body.innerHTML = '<label for="name">Name</label><input id="name"><label><input id="check" type="checkbox">Agree</label>';
    const changes: StructuralChange[] = [];
    const stop = startObserver((change) => changes.push(change));

    document.querySelector<HTMLInputElement>("#name")!.value = "private value";
    document.querySelector<HTMLInputElement>("#check")!.checked = true;
    document.querySelector<HTMLInputElement>("#name")!.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector<HTMLInputElement>("#check")!.dispatchEvent(new Event("change", { bubbles: true }));
    await flushMutationTurn(120);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ structuralHash: expect.any(String), changeSignature: expect.any(String) });
    expect(Object.keys(changes[0]!)).toEqual(["structuralHash", "changeSignature"]);
    expect(JSON.stringify(changes)).not.toContain("private value");

    // A second edit still sends a refresh signal even though value-free structure is unchanged.
    document.querySelector<HTMLInputElement>("#name")!.value = "another private value";
    document.querySelector<HTMLInputElement>("#name")!.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMutationTurn(120);
    expect(changes).toHaveLength(2);
    expect(changes[1]!.changeSignature).toBe(changes[0]!.changeSignature);
    expect(JSON.stringify(changes)).not.toContain("another private value");
    stop();
  });

  it("refresh-signals form reset and contenteditable changes", async () => {
    document.body.innerHTML = '<form><input id="name" value="before"><button type="reset">Reset</button></form><div id="editor" contenteditable="true"></div>';
    const changes: StructuralChange[] = [];
    const stop = startObserver((change) => changes.push(change));

    document.querySelector("form")!.dispatchEvent(new Event("reset", { bubbles: true }));
    document.querySelector("#editor")!.dispatchEvent(new Event("input", { bubbles: true }));
    await flushMutationTurn(120);

    expect(changes).toHaveLength(1);
    expect(JSON.stringify(changes)).not.toContain("before");
    stop();
  });

  it("signals a selected bubble when an ARIA radio changes state without input/change events", async () => {
    document.body.innerHTML = '<div role="radiogroup"><div id="option" role="radio" aria-checked="false">Full time</div></div>';
    const changes: StructuralChange[] = [];
    const stop = startObserver((change) => changes.push(change));

    document.querySelector("#option")!.setAttribute("aria-checked", "true");
    await flushMutationTurn(500);

    expect(changes).toHaveLength(1);
    expect(Object.keys(changes[0]!)).toEqual(["structuralHash", "changeSignature"]);
    expect(JSON.stringify(changes)).not.toContain("Full time");
    stop();
  });

  it("watches editable controls inside open and Chrome-exposed closed shadow roots", async () => {
    const openHost = document.createElement("x-open-form");
    const openRoot = openHost.attachShadow({ mode: "open" });
    openRoot.innerHTML = '<input aria-label="Open value">';
    const closedHost = document.createElement("x-closed-form");
    const closedRoot = closedHost.attachShadow({ mode: "closed" });
    closedRoot.innerHTML = '<input aria-label="Closed value">';
    document.body.append(openHost, closedHost);
    vi.stubGlobal("chrome", { dom: { openOrClosedShadowRoot: (host: Element) => host === closedHost ? closedRoot : null } });

    const changes: StructuralChange[] = [];
    const stop = startObserver((change) => changes.push(change));
    const openInput = openRoot.querySelector("input")!;
    const closedInput = closedRoot.querySelector("input")!;
    openInput.value = "open private value";
    closedInput.value = "closed private value";
    openInput.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    closedInput.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await flushMutationTurn(120);

    expect(changes).toHaveLength(1);
    expect(JSON.stringify(changes)).not.toContain("open private value");
    expect(JSON.stringify(changes)).not.toContain("closed private value");
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
    const changeCount = async (): Promise<void> => flushMutationTurn(500);

    document.querySelector<HTMLInputElement>("#revealed")!.hidden = false;
    await changeCount();
    expect(changes).toHaveLength(1);
    document.querySelector<HTMLInputElement>("#locked")!.disabled = false;
    await changeCount();
    expect(changes).toHaveLength(2);
    document.querySelector<HTMLInputElement>("#required")!.required = true;
    await changeCount();
    expect(changes).toHaveLength(3);
    document.querySelector("#errors")!.innerHTML = '<span id="error" role="alert">Required</span>';
    await changeCount();
    expect(changes).toHaveLength(4);
    document.querySelector("#alerts")!.innerHTML = '<div role="status">Saved</div>';
    await changeCount();
    expect(changes).toHaveLength(5);
    document.querySelector("#removed")!.remove();
    await changeCount();
    expect(changes).toHaveLength(6);
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

    getHighlightOverlay(document);
    const changes: StructuralChange[] = [];
    const stop = startObserver((change) => changes.push(change));
    const baseline = changes.length;
    root.querySelector("input")!.setAttribute("required", "");
    await flushMutationTurn(0);
    expect(changes).toHaveLength(baseline + 1);

    const field = document.querySelector("x-panel")!.shadowRoot!.querySelector("input")!;
    field.setAttribute("data-blip-id", "e999");
    openOverlayForContentTest(document)!.host.setAttribute("class", "decorative-change");
    await flushMutationTurn(1000);
    expect(changes).toHaveLength(baseline + 1);
    expect(document.querySelectorAll("input")).toHaveLength(0);
    stop();
  });

  it("coalesces a thousand-mutation burst and spaces later passes by at least 500 ms", async () => {
    document.body.innerHTML = '<input id="required">';
    const changes: Array<{ change: StructuralChange; at: number }> = [];
    const start = Date.now();
    const stop = startObserver((change) => changes.push({ change, at: Date.now() }));
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
