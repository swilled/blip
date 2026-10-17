// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifySensitiveShape, isSsn, luhnValid } from "@blip/policy/sensitive-shapes";

function validCardNumber(length: number): string {
  const prefix = `4${"2".repeat(length - 2)}`;
  for (let check = 0; check <= 9; check += 1) {
    const candidate = `${prefix}${check}`;
    if (luhnValid(candidate)) return candidate;
  }
  throw new Error(`could not generate a ${length}-digit Luhn number`);
}

describe("shared sensitive value shapes", () => {
  it("accepts Luhn values from 13 through 19 digits and rejects invalid length, checksum, and characters", () => {
    for (let length = 13; length <= 19; length += 1) {
      const card = validCardNumber(length);
      expect(luhnValid(card)).toBe(true);
      expect(luhnValid(card.replace(/(.{4})/g, "$1 ").trim())).toBe(true);
    }

    expect(luhnValid("411111111111")).toBe(false);
    expect(luhnValid("41111111111111111111")).toBe(false);
    expect(luhnValid("4111 1111 1111 1112")).toBe(false);
    expect(luhnValid("4111-1111-1111-abcd")).toBe(false);
    expect(luhnValid("  ")).toBe(false);
  });

  it("accepts only the conventional SSN shape and rejects prohibited values", () => {
    expect(isSsn("078-05-1120")).toBe(true);
    expect(isSsn("123-45-6789")).toBe(true);
    for (const value of [
      "000-12-3456",
      "666-12-3456",
      "900-12-3456",
      "123-00-6789",
      "123-45-0000",
      "123456789",
      "12-345-6789",
    ]) {
      expect(isSsn(value)).toBe(false);
    }
  });

  it("classifies SSNs and broad card-shaped values even when a card checksum is mistyped", () => {
    expect(classifySensitiveShape("078-05-1120")).toBe("ssn");
    expect(classifySensitiveShape("4111 1111 1111 1111")).toBe("card-number");
    expect(classifySensitiveShape("4111 1111 1111 1112")).toBe("card-number");
    expect(classifySensitiveShape("5551234567")).toBeNull();
    expect(classifySensitiveShape("X4111111111111111")).toBeNull();
  });

  it("loads in the Node test environment without a DOM global", () => {
    expect("document" in globalThis).toBe(false);
    expect(typeof luhnValid).toBe("function");
    expect(typeof isSsn).toBe("function");
  });
});
