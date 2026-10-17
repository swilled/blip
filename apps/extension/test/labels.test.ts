// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { labelCandidatesOf } from "../src/content/labels.js";

beforeEach(() => {
  document.body.replaceChildren();
});

describe("label candidates", () => {
  it("uses ARIA names before labels, title, nearby text, placeholder and inferred names", () => {
    document.body.innerHTML = `
      <label for="email">Email address</label>
      <input id="email" name="user_email" aria-label="Preferred email" title="Email title"
        placeholder="name@example.com">
      <span>Work phone</span><input id="phone" name="phoneNumber" placeholder="555-0100">
      <input id="inferred" name="shipping_postal_code">
    `;
    const email = document.getElementById("email")!;
    const phone = document.getElementById("phone")!;
    const inferred = document.getElementById("inferred")!;

    expect(labelCandidatesOf(email).map(({ text, source }) => [text, source])).toEqual([
      ["Preferred email", "aria"],
      ["Email address", "label"],
      ["Email title", "label"],
      ["name@example.com", "placeholder"],
      ["User email", "inferred"],
    ]);
    expect(labelCandidatesOf(phone)[0]).toMatchObject({ text: "Work phone", source: "nearby-text" });
    expect(labelCandidatesOf(inferred)[0]).toMatchObject({ text: "Shipping postal code", source: "inferred" });
  });

  it("uses aria-labelledby and fieldset legends without including nested control or option text", () => {
    document.body.innerHTML = `
      <span id="external-name">Preferred contact</span>
      <fieldset>
        <legend>Contact method <input type="radio" name="method" value="phone" aria-label="Phone"></legend>
        <label>Delivery method
          <select id="delivery" aria-labelledby="external-name">
            <option>Leave at front desk</option>
          </select>
        </label>
      </fieldset>
    `;
    const delivery = document.getElementById("delivery")!;
    const labels = labelCandidatesOf(delivery);

    expect(labels[0]).toMatchObject({ text: "Preferred contact", source: "aria" });
    expect(labels.some((candidate) => candidate.text.includes("Leave at front desk"))).toBe(false);
    expect(labels.some((candidate) => candidate.text.includes("Phone"))).toBe(false);
  });

  it("bounds candidate count and text while preserving unique candidates", () => {
    document.body.innerHTML = `<input id="field" aria-label="A" placeholder="A" title="${"T".repeat(400)}">`;
    const candidates = labelCandidatesOf(document.getElementById("field")!);
    expect(candidates.length).toBeLessThanOrEqual(8);
    expect(candidates.every(({ text }) => text.length <= 200)).toBe(true);
    expect(candidates.filter(({ text }) => text === "A")).toHaveLength(1);
  });
});
