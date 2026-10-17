// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardSentinel = "blip-submit-method-guard-v1";

describe("document-start MAIN-world submit method guard", () => {
  it("replaces direct form.submit calls with a permanent no-op", async () => {
    const nativeSubmit = vi.fn();
    Object.defineProperty(HTMLFormElement.prototype, "submit", {
      configurable: true,
      writable: true,
      value: nativeSubmit,
    });
    document.body.innerHTML = "<form></form>";
    const form = document.querySelector("form")!;

    await import("../src/content/submit-method-guard-main.js");
    form.submit();
    HTMLFormElement.prototype.submit.call(form);

    expect(nativeSubmit).not.toHaveBeenCalled();
    const descriptor = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, "submit");
    expect(descriptor).toMatchObject({ configurable: false, writable: false, enumerable: false });
    expect(descriptor?.value).toBeTypeOf("function");
    expect(() => Object.defineProperty(HTMLFormElement.prototype, "submit", { value: nativeSubmit })).toThrow();
    expect((globalThis as Record<string, unknown>).__blipSubmitMethodGuardInstalled).toBe(guardSentinel);
  });
});

describe("verifySubmitMethodGuard", () => {
  let executeScript: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    executeScript = vi.fn().mockResolvedValue([{ result: guardSentinel }]);
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: { scripting: { executeScript } },
    });
  });

  it("verifies exactly one result in the requested MAIN-world frame", async () => {
    const { verifySubmitMethodGuard } = await import("../src/background/submit-method-guard.js");

    await expect(verifySubmitMethodGuard(42, 7)).resolves.toBe(true);
    expect(executeScript).toHaveBeenCalledOnce();
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 42, frameIds: [7] },
      world: "MAIN",
      func: expect.any(Function),
    }));
  });

  it.each([
    ["an absent frame", []],
    ["ambiguous results", [{ result: guardSentinel }, { result: guardSentinel }]],
    ["a malformed result", [{ result: { installed: true } }]],
    ["a missing result value", [{}]],
  ])("fails closed on %s", async (_name, result) => {
    executeScript.mockResolvedValueOnce(result);
    const { verifySubmitMethodGuard } = await import("../src/background/submit-method-guard.js");

    await expect(verifySubmitMethodGuard(42, 7)).resolves.toBe(false);
  });

  it("fails closed when Chrome rejects the exact-frame check", async () => {
    executeScript.mockRejectedValueOnce(new Error("frame was removed"));
    const { verifySubmitMethodGuard } = await import("../src/background/submit-method-guard.js");

    await expect(verifySubmitMethodGuard(42, 7)).resolves.toBe(false);
  });
});
