// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { isSsn, luhnValid, safeValueOf, sensitivityOf, readValue } from "../src/content/sensitive.js";

beforeEach(() => {
  document.body.replaceChildren();
});

function input(markup: string): HTMLInputElement {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = markup;
  const element = wrapper.querySelector("input");
  if (!element) throw new Error("test input missing");
  return element;
}

describe("sensitivity classification", () => {
  it("classifies password, card, CVC, OTP and SSN fields from type, autocomplete or names", () => {
    expect(sensitivityOf(input('<input type="password">'))).toBe("password");
    expect(sensitivityOf(input('<input autocomplete="cc-number">'))).toBe("card-number");
    expect(sensitivityOf(input('<input name="security_code">'))).toBe("card-cvc");
    expect(sensitivityOf(input('<input autocomplete="one-time-code">'))).toBe("otp");
    expect(sensitivityOf(input('<input aria-label="Social security number">'))).toBe("ssn");
  });

  it("detects Luhn-valid card-shaped values in an otherwise ordinary text field", () => {
    const ordinary = input('<input type="text" name="reference" aria-label="Reference">');
    ordinary.value = "4111 1111 1111 1111";

    expect(luhnValid(ordinary.value)).toBe(true);
    expect(sensitivityOf(ordinary)).toBe("card-number");
    expect(readValue(ordinary)).toBeNull();
    expect(safeValueOf(ordinary)).toEqual({ sensitive: "card-number", value: null, hasValue: true });
  });

  it("exposes SSN and Luhn shape detectors while avoiding ordinary phone, passport and compass values", () => {
    expect(isSsn("078-05-1120")).toBe(true);
    expect(isSsn("078-00-1120")).toBe(false);
    expect(luhnValid("4111 1111 1111 1112")).toBe(false);
    expect(luhnValid("411111111111")).toBe(false);

    const phone = input('<input type="tel" name="phone">');
    phone.value = "+1 (202) 555-0131";
    const passport = input('<input type="text" name="passportNumber">');
    passport.value = "X12345678";
    const compass = input('<input type="text" name="compass">');
    compass.value = "north";
    expect(sensitivityOf(phone)).toBe("none");
    expect(sensitivityOf(passport)).toBe("none");
    expect(sensitivityOf(compass)).toBe("none");
  });

  it("never reads hidden input values", () => {
    const hidden = input('<input type="hidden" name="token">');
    Object.defineProperty(hidden, "value", { get: () => { throw new Error("hidden value read"); } });

    expect(readValue(hidden)).toBeNull();
    expect(safeValueOf(hidden)).toEqual({ sensitive: "none", value: null, hasValue: false });
  });

  it("withholds known sensitive values while reporting only whether a value exists", () => {
    const password = input('<input type="password" name="password">');
    password.value = "sentinel-password-731";
    expect(readValue(password)).toBeNull();
    expect(safeValueOf(password)).toEqual({ sensitive: "password", value: null, hasValue: true });
  });
});
