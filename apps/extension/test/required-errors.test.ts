// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { errorStateOf } from "../src/content/errors.js";
import { requiredStateOf } from "../src/content/required.js";

function setVisible(element: Element): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, right: 120, bottom: 24, width: 120, height: 24 }),
  });
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("required metadata", () => {
  it("applies attribute, ARIA, asterisk and none precedence", () => {
    document.body.innerHTML = `
      <label for="attr">Name *</label><input id="attr" required aria-required="false">
      <label for="aria">Email</label><input id="aria" aria-required="true">
      <label for="asterisk">Phone *</label><input id="asterisk">
      <label for="optional">Notes</label><textarea id="optional"></textarea>
    `;
    expect(requiredStateOf(document.getElementById("attr")!)).toEqual({ required: true, requiredSource: "attr" });
    expect(requiredStateOf(document.getElementById("aria")!)).toEqual({ required: true, requiredSource: "aria" });
    expect(requiredStateOf(document.getElementById("asterisk")!)).toEqual({ required: true, requiredSource: "asterisk" });
    expect(requiredStateOf(document.getElementById("optional")!)).toEqual({ required: false, requiredSource: "none" });
  });

  it("does not treat aria-required=false as required and accepts label candidates from the label helper", () => {
    const input = document.createElement("input");
    input.setAttribute("aria-required", "false");
    document.body.append(input);
    expect(requiredStateOf(input, [{ text: "Asterisk marked *", source: "label", confidence: 0.9 }]))
      .toEqual({ required: true, requiredSource: "asterisk" });
  });
});

describe("visible validation metadata", () => {
  it("returns bounded visible described-by error text and invalid state", () => {
    document.body.innerHTML = `
      <label for="email">Email</label>
      <input id="email" aria-invalid="true" aria-describedby="hint error">
      <span id="hint">Use your work email</span>
      <span id="error" role="alert">That address is not allowed</span>
    `;
    const input = document.getElementById("email")!;
    setVisible(input);
    setVisible(document.getElementById("hint")!);
    setVisible(document.getElementById("error")!);

    expect(errorStateOf(input)).toEqual({
      invalid: true,
      describedBy: "Use your work email That address is not allowed",
      errorText: "That address is not allowed",
    });
  });

  it("ignores hidden error sources and clamps exposed descriptions/errors", () => {
    document.body.innerHTML = `
      <input id="field" aria-invalid="false" aria-describedby="hidden-error">
      <span id="hidden-error" hidden>${"secret-looking error ".repeat(30)}</span>
    `;
    const input = document.getElementById("field")!;
    setVisible(input);

    const state = errorStateOf(input);
    expect(state.invalid).toBe(false);
    expect(state.describedBy).toBeUndefined();
    expect(state.errorText).toBeNull();
    expect(state.errorText?.length ?? 0).toBeLessThanOrEqual(300);
  });

  it("reads a visible inline error adjacent to the control", () => {
    document.body.innerHTML = '<div><input id="field"><span class="error">Choose a valid date</span></div>';
    const input = document.getElementById("field")!;
    const error = document.querySelector(".error")!;
    setVisible(input);
    setVisible(error);
    expect(errorStateOf(input).errorText).toBe("Choose a valid date");
  });
});
