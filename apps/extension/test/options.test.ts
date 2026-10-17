// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { optionsOf } from "../src/content/options.js";

describe("bounded select options", () => {
  it("returns option values, bounded labels and selected state", () => {
    const select = document.createElement("select");
    select.innerHTML = `
      <option value="">Choose one</option>
      <option value="yes" selected>Yes</option>
      <option value="no">No</option>
    `;

    expect(optionsOf(select)).toEqual([
      { value: "", label: "Choose one", selected: false },
      { value: "yes", label: "Yes", selected: true },
      { value: "no", label: "No", selected: false },
    ]);
  });

  it("caps at 200 options and retains a selected option beyond the cap", () => {
    const select = document.createElement("select");
    select.innerHTML = Array.from({ length: 205 }, (_, index) => `<option value="v${index}">Option ${index}</option>`).join("");
    select.selectedIndex = 204;

    const options = optionsOf(select);
    expect(options).toHaveLength(200);
    expect(options[0]).toMatchObject({ value: "v0", selected: false });
    expect(options.at(-1)).toMatchObject({ value: "v204", label: "Option 204", selected: true });
  });

  it("keeps each option field within a bounded text size", () => {
    const select = document.createElement("select");
    const option = document.createElement("option");
    option.value = "v".repeat(500);
    option.textContent = "L".repeat(500);
    select.append(option);

    const [result] = optionsOf(select);
    expect(result?.value.length).toBeLessThanOrEqual(200);
    expect(result?.label.length).toBeLessThanOrEqual(200);
  });
});
