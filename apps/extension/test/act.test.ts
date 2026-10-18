// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActRequest } from "@blip/protocol";
import { executeAct } from "../src/content/act.js";
import { captureFrameSnapshot } from "../src/content/snapshot.js";
import { installPersistentSubmitGuard, isPersistentSubmitGuardInstalled } from "../src/content/submit-guard.js";

beforeEach(() => {
  document.body.replaceChildren();
  installPersistentSubmitGuard(document);
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

function captureIn(page: Document, frameId = 0): ReturnType<typeof captureFrameSnapshot> {
  return captureFrameSnapshot({ document: page, topOrigin: "https://forms.example", frameId, timeBudgetMs: 1000 });
}

function request(
  targetId: string,
  action: ActRequest["action"],
  expectedKind: ActRequest["expectedKind"] = "fill",
  frameId = 0,
  gate?: ActRequest["gate"],
): ActRequest {
  return {
    actId: "act-1", tabId: 1, snapshotVersion: 1,
    action: { ...action, targetId } as ActRequest["action"], expectedKind,
    ...(gate !== undefined ? { gate } : {}),
  };
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

  it("selects a bubbled ARIA radio option and returns the page-observed choice", async () => {
    document.body.innerHTML = `
      <div data-automation-id="questionItem">
        <span data-automation-id="questionTitle"><span id="employment-title">Employment type</span></span>
        <div role="radiogroup" aria-labelledby="employment-title">
          <div id="full-time" role="radio" aria-label="Full time" aria-checked="false">Full time</div>
          <div id="part-time" role="radio" aria-label="Part time" aria-checked="false">Part time</div>
        </div>
      </div>
    `;
    const frame = capture();
    const field = frame.elements[0]!;
    document.querySelector("#part-time")!.addEventListener("click", () => {
      document.querySelector("#full-time")!.setAttribute("aria-checked", "false");
      document.querySelector("#part-time")!.setAttribute("aria-checked", "true");
    });

    await expect(executeAct(request(
      field.id,
      { op: "select", targetId: field.id, optionValue: "Part time" },
      "select",
    ))).resolves.toMatchObject({
      ok: true,
      observedValue: "Part time",
      liveKind: "select",
    });
    expect(document.querySelector('[role="radio"][aria-checked="true"]')?.id).toBe("part-time");
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

  it("refuses a granted click when the live kind no longer matches the grant", async () => {
    document.body.innerHTML = '<form><button id="save">Continue</button></form>';
    const frame = capture();
    const button = frame.elements[0]!;
    const click = vi.fn();
    document.querySelector("#save")!.addEventListener("click", click);

    await expect(executeAct(request(
      button.id,
      { op: "click", targetId: button.id },
      "pay",
      0,
      { grantId: "grant-1", kind: "pay" },
    ))).resolves.toMatchObject({ ok: false, error: "kind-mismatch", liveKind: "submit" });
    expect(click).not.toHaveBeenCalled();
  });

  it("refuses a grant whose kind does not match the request", async () => {
    document.body.innerHTML = '<form><button id="save">Continue</button></form>';
    const frame = capture();
    const button = frame.elements[0]!;
    const click = vi.fn();
    document.querySelector("#save")!.addEventListener("click", click);

    await expect(executeAct(request(
      button.id,
      { op: "click", targetId: button.id },
      "submit",
      0,
      { grantId: "grant-1", kind: "pay" },
    ))).resolves.toMatchObject({ ok: false, error: "gate-required", liveKind: "submit" });
    expect(click).not.toHaveBeenCalled();
  });

  it("refuses a gate attached to a click-safe action", async () => {
    document.body.innerHTML = '<button id="close" type="button">Close</button>';
    const frame = capture();
    const button = frame.elements[0]!;
    const click = vi.fn();
    document.querySelector("#close")!.addEventListener("click", click);

    await expect(executeAct(request(
      button.id,
      { op: "click", targetId: button.id },
      "click-safe",
      0,
      { grantId: "grant-1", kind: "click-safe" },
    ))).resolves.toMatchObject({ ok: false, error: "gate-required", liveKind: "click-safe" });
    expect(click).not.toHaveBeenCalled();
  });

  it("allows exactly one submit from the clicked form and submitter during a valid gated click", async () => {
    document.body.innerHTML = `
      <form id="target"><button id="submit">Submit</button></form>
      <form id="other"><button id="other-submit">Other</button></form>
    `;
    const frame = capture();
    const button = frame.elements.find((item) => item.category === "action")!;
    const form = document.querySelector<HTMLFormElement>("#target")!;
    const submitter = document.querySelector<HTMLButtonElement>("#submit")!;
    const otherForm = document.querySelector<HTMLFormElement>("#other")!;
    const otherSubmitter = document.querySelector<HTMLButtonElement>("#other-submit")!;
    const seenSubmitters: Array<HTMLElement | null> = [];
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      seenSubmitters.push((event as SubmitEvent).submitter as HTMLElement | null);
      form.requestSubmit();
      otherForm.requestSubmit(otherSubmitter);
    });
    otherForm.addEventListener("submit", (event) => {
      event.preventDefault();
      seenSubmitters.push((event as SubmitEvent).submitter as HTMLElement | null);
    });

    await expect(executeAct(request(
      button.id,
      { op: "click", targetId: button.id },
      "submit",
      0,
      { grantId: "grant-1", kind: "submit" },
    ))).resolves.toMatchObject({ ok: true, liveKind: "submit" });

    form.requestSubmit(submitter);
    expect(seenSubmitters).toEqual([submitter]);
    expect(isPersistentSubmitGuardInstalled(document)).toBe(true);
  });

  it("does not authorize a submit while dispatching a granted non-form click", async () => {
    document.body.innerHTML = `
      <form id="target"><button id="submit">Submit</button></form>
      <a id="external" href="https://external.example/leave">Leave this site</a>
    `;
    const frame = capture();
    const link = frame.elements.find((item) => item.tag === "a")!;
    const form = document.querySelector<HTMLFormElement>("#target")!;
    const submitter = document.querySelector<HTMLButtonElement>("#submit")!;
    const submit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", submit);
    document.querySelector("#external")!.addEventListener("click", (event) => {
      event.preventDefault();
      form.requestSubmit(submitter);
    });

    await expect(executeAct(request(
      link.id,
      { op: "click", targetId: link.id },
      "navigate-cross-domain",
      0,
      { grantId: "grant-1", kind: "navigate-cross-domain" },
    ))).resolves.toMatchObject({ ok: true, liveKind: "navigate-cross-domain" });

    expect(submit).not.toHaveBeenCalled();
  });

  it("does not authorize a submit from an ungated select change", async () => {
    document.body.innerHTML = `
      <form id="target">
        <label for="choice">Choice</label>
        <select id="choice"><option value="">Choose</option><option value="yes">Yes</option></select>
        <button id="submit">Submit</button>
      </form>
    `;
    const frame = capture();
    const select = frame.elements.find((item) => item.category === "field")!;
    const form = document.querySelector<HTMLFormElement>("#target")!;
    const submitter = document.querySelector<HTMLButtonElement>("#submit")!;
    const submit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", submit);
    document.querySelector("#choice")!.addEventListener("change", () => form.requestSubmit(submitter));

    await expect(executeAct(request(
      select.id,
      { op: "select", targetId: select.id, optionValue: "yes" },
      "select",
    ))).resolves.toMatchObject({ ok: true, observedValue: "yes" });

    expect(submit).not.toHaveBeenCalled();
    expect(isPersistentSubmitGuardInstalled(document)).toBe(true);
  });

  it("refuses every act when the document-start persistent guard is absent", async () => {
    const page = document.implementation.createHTMLDocument("unguarded page");
    page.body.innerHTML = '<label for="name">Name</label><input id="name">';
    const frame = captureIn(page);
    const field = frame.elements[0]!;

    await expect(executeAct(
      request(field.id, { op: "fill", targetId: field.id, value: "Ada" }),
      { document: page },
    )).resolves.toMatchObject({ ok: false, error: "exception" });
    expect(page.querySelector<HTMLInputElement>("#name")?.value).toBe("");
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
