// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActRequest } from "@blip/protocol";
import { executeAct } from "../src/content/act.js";
import { captureFrameSnapshot } from "../src/content/snapshot.js";

beforeEach(() => {
  document.body.replaceChildren();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 80, bottom: 20, width: 80, height: 20, toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function capture(frameId = 0): ReturnType<typeof captureFrameSnapshot> {
  return captureFrameSnapshot({ document, topOrigin: "https://forms.example", frameId, timeBudgetMs: 1000 });
}

function request(
  targetId: string,
  action: ActRequest["action"],
  expectedKind: ActRequest["expectedKind"] = "fill",
  frameId = 0,
): ActRequest {
  return { actId: "act-1", tabId: 1, snapshotVersion: 1, action: { ...action, targetId } as ActRequest["action"], expectedKind };
}

describe("executeAct live safety checks", () => {
  it("treats readonly fields as disabled and does not mutate them", async () => {
    document.body.innerHTML = '<label for="locked">Locked</label><input id="locked" name="locked" value="old">';
    const frame = capture();
    const locked = frame.elements.find((item) => item.name === "locked")!;
    document.querySelector<HTMLInputElement>("#locked")!.readOnly = true;

    await expect(executeAct(request(locked.id, { op: "fill", targetId: locked.id, value: "new" }))).resolves.toMatchObject({
      ok: false, error: "disabled",
    });
    expect(document.querySelector<HTMLInputElement>("#locked")?.value).toBe("old");
  });

  it("refuses known sensitive writes but still allows a focus handoff without read-back", async () => {
    document.body.innerHTML = '<label for="password">Password</label><input id="password" type="text" value="never-return-this">';
    const frame = capture();
    const field = frame.elements[0]!;
    document.querySelector<HTMLInputElement>("#password")!.type = "password";

    await expect(executeAct(request(field.id, { op: "fill", targetId: field.id, value: "new-secret" }))).resolves.toEqual({
      actId: "act-1", ok: false, error: "sensitive-field", observedValue: null,
    });
    const refreshed = capture();
    const refreshedField = refreshed.elements[0]!;
    await expect(executeAct(request(refreshedField.id, { op: "focus", targetId: refreshedField.id }))).resolves.toMatchObject({
      actId: "act-1", ok: true, observedValue: null,
    });
  });

  it("rechecks a text field after writing and never returns a card-shaped value", async () => {
    document.body.innerHTML = '<label for="reference">Reference</label><input id="reference" type="text" name="reference">';
    const frame = capture();
    const field = frame.elements[0]!;
    const cardNumber = "4111 1111 1111 1111";

    const result = await executeAct(request(field.id, { op: "fill", targetId: field.id, value: cardNumber }));

    expect(result).toEqual({ actId: "act-1", ok: false, error: "sensitive-field", observedValue: null });
    expect(JSON.stringify(result)).not.toContain(cardNumber);
    expect(document.querySelector<HTMLInputElement>("#reference")?.value).toBe(cardNumber);
  });

  it("rechecks select read-back shapes before returning an option value", async () => {
    const cardNumber = "4111111111111111";
    document.body.innerHTML = `<label for="reference">Reference</label><select id="reference" name="reference"><option value="">Choose</option><option value="${cardNumber}">Card</option></select>`;
    const frame = capture();
    const field = frame.elements[0]!;

    const result = await executeAct(request(field.id, { op: "select", targetId: field.id, optionValue: cardNumber }, "select"));

    expect(result).toEqual({ actId: "act-1", ok: false, error: "sensitive-field", observedValue: null });
    expect(JSON.stringify(result)).not.toContain(cardNumber);
  });

  it("returns the actual clamped DOM value for a safe fill", async () => {
    document.body.innerHTML = '<label for="name">Name</label><input id="name" maxlength="5">';
    const frame = capture();
    const field = frame.elements[0]!;

    await expect(executeAct(request(field.id, { op: "fill", targetId: field.id, value: "abcdefgh" }))).resolves.toMatchObject({
      ok: true, observedValue: "abcde", detail: "truncated to 5 characters", liveKind: "fill",
    });
  });

  it("reports actual checkbox and radio states while keeping matching writes as no-ops", async () => {
    document.body.innerHTML = `
      <label><input id="breakfast" type="checkbox" name="breakfast">Breakfast</label>
      <fieldset><legend>Room</legend>
        <label><input type="radio" name="room" value="a" checked>A</label>
        <label><input type="radio" name="room" value="b">B</label>
      </fieldset>
    `;
    const frame = capture();
    const checkbox = frame.elements.find((item) => item.name === "breakfast")!;
    const radioGroup = frame.elements.find((item) => item.name === "room")!;
    const change = vi.fn();
    document.querySelector<HTMLInputElement>("#breakfast")!.addEventListener("change", change);

    await expect(executeAct(request(checkbox.id, { op: "check", targetId: checkbox.id, checked: true }, "check"))).resolves.toMatchObject({
      ok: true, observedValue: "true", liveKind: "check",
    });
    await executeAct(request(checkbox.id, { op: "check", targetId: checkbox.id, checked: true }, "check"));
    await expect(executeAct(request(radioGroup.id, { op: "select", targetId: radioGroup.id, optionValue: "b" }, "select"))).resolves.toMatchObject({
      ok: true, observedValue: "b", liveKind: "select",
    });

    expect(change).toHaveBeenCalledOnce();
    expect(document.querySelector<HTMLInputElement>('input[name="room"][value="b"]')?.checked).toBe(true);
  });

  it("rejects a changed target fingerprint before acting", async () => {
    document.body.innerHTML = '<label for="name">Name</label><input id="name">';
    const frame = capture();
    const field = frame.elements[0]!;
    document.querySelector("label")!.textContent = "Account number";

    await expect(executeAct(request(field.id, { op: "fill", targetId: field.id, value: "changed" }))).resolves.toMatchObject({
      ok: false, error: "stale-snapshot",
    });
    expect(document.querySelector<HTMLInputElement>("#name")?.value).toBe("");
  });

  it("reclassifies actions live and refuses gated clicks without dispatching them", async () => {
    document.body.innerHTML = '<form><button id="save">Next</button></form>';
    const frame = capture();
    const button = frame.elements[0]!;
    const click = vi.fn();
    document.querySelector("#save")!.addEventListener("click", click);

    await expect(executeAct(request(button.id, { op: "click", targetId: button.id }, "submit"))).resolves.toMatchObject({
      ok: false, error: "gate-required", liveKind: "submit",
    });
    expect(click).not.toHaveBeenCalled();
  });

  it("routes a frame-qualified id only to the matching frame", async () => {
    document.body.innerHTML = '<label for="name">Name</label><input id="name">';
    const frame = capture(7);
    const field = frame.elements[0]!;

    await expect(executeAct(request(`f7${field.id}`, { op: "fill", targetId: `f7${field.id}`, value: "Ada" }), { frameId: 7 })).resolves.toMatchObject({
      ok: true, observedValue: "Ada",
    });
    await expect(executeAct(request(`f8${field.id}`, { op: "fill", targetId: `f8${field.id}`, value: "Ada" }), { frameId: 7 })).resolves.toMatchObject({
      ok: false, error: "target-not-found",
    });
  });
});
