// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fillSelect, fillText, selectRadio, setChecked } from "../src/content/fill.js";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("native field writes", () => {
  it("uses the native text setter and input/change/focus/blur events without key events", async () => {
    document.body.innerHTML = '<label for="name">Name</label><input id="name" type="text">';
    const input = document.querySelector("input")!;
    const events: string[] = [];
    for (const type of ["focus", "focusin", "input", "change", "blur", "focusout", "keydown", "keypress", "keyup"]) {
      input.addEventListener(type, () => events.push(type));
    }

    await expect(fillText(input, "Ada Lovelace")).resolves.toEqual({ ok: true });

    expect(input.value).toBe("Ada Lovelace");
    expect(events).toEqual(["focus", "focusin", "input", "change", "blur", "focusout"]);
  });

  it("clamps maxlength before the write and reports the clamp without reading the value", async () => {
    document.body.innerHTML = '<textarea maxlength="4"></textarea>';
    const textarea = document.querySelector("textarea")!;

    await expect(fillText(textarea, "abcdefgh")).resolves.toEqual({
      ok: true,
      detail: "truncated to 4 characters",
    });
    expect(textarea.value).toBe("abcd");
  });

  it("selects by option label and dispatches native events", async () => {
    document.body.innerHTML = '<select><option value="">Choose</option><option value="suite">A Suite</option></select>';
    const select = document.querySelector("select")!;
    const changes = vi.fn();
    select.addEventListener("change", changes);

    await expect(fillSelect(select, "a suite")).resolves.toEqual({ ok: true });

    expect(select.value).toBe("suite");
    expect(changes).toHaveBeenCalledOnce();
  });

  it("uses native click only when a checkbox or radio selection changes", async () => {
    document.body.innerHTML = `
      <label><input id="check" type="checkbox" checked>Breakfast</label>
      <label><input id="radio-a" type="radio" name="room" value="a" checked>A</label>
      <label><input id="radio-b" type="radio" name="room" value="b">B</label>
    `;
    const checkbox = document.querySelector<HTMLInputElement>("#check")!;
    const radioA = document.querySelector<HTMLInputElement>("#radio-a")!;
    const radioB = document.querySelector<HTMLInputElement>("#radio-b")!;
    const checkboxChanges = vi.fn();
    checkbox.addEventListener("change", checkboxChanges);

    await setChecked(checkbox, true);
    await selectRadio([radioA, radioB], "B");

    expect(checkboxChanges).not.toHaveBeenCalled();
    expect(radioB.checked).toBe(true);
    expect(radioA.checked).toBe(false);
  });
});
