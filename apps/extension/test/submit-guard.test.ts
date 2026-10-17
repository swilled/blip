// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  beginOneSubmitAllowance,
  installPersistentSubmitGuard,
  isPersistentSubmitGuardInstalled,
  withSubmitEventsBlocked,
} from "../src/content/submit-guard.js";

function createDocument(): Document {
  return document.implementation.createHTMLDocument("submit guard test");
}

describe("persistent submit event guard", () => {
  it("denies submit events by default for the document lifetime", async () => {
    const page = createDocument();
    page.body.innerHTML = "<form></form>";
    const form = page.querySelector("form")!;
    const pageSubmit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", pageSubmit);

    expect(installPersistentSubmitGuard(page)).toBe(true);
    expect(installPersistentSubmitGuard(page)).toBe(true);
    expect(isPersistentSubmitGuardInstalled(page)).toBe(true);
    form.requestSubmit();
    await withSubmitEventsBlocked(page, () => undefined);
    form.requestSubmit();

    expect(pageSubmit).not.toHaveBeenCalled();
  });

  it("allows only one submit from the exact form with the exact submitter", () => {
    const page = createDocument();
    page.body.innerHTML = '<form><button id="first" type="submit">First</button><button id="second" type="submit">Second</button></form>';
    const form = page.querySelector("form")!;
    const first = page.querySelector<HTMLButtonElement>("#first")!;
    const second = page.querySelector<HTMLButtonElement>("#second")!;
    const seenSubmitters: Array<HTMLElement | null> = [];
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      seenSubmitters.push((event as SubmitEvent).submitter as HTMLElement | null);
    });
    installPersistentSubmitGuard(page);
    const cleanup = beginOneSubmitAllowance(first.form!, first);

    form.requestSubmit(second);
    form.requestSubmit(first);
    form.requestSubmit(first);
    cleanup();

    expect(seenSubmitters).toEqual([first]);
  });

  it("clears an unused allowance when its dispatch cleanup runs", () => {
    const page = createDocument();
    page.body.innerHTML = '<form><button type="submit">Send</button></form>';
    const form = page.querySelector("form")!;
    const submitter = page.querySelector<HTMLButtonElement>("button")!;
    const pageSubmit = vi.fn((event: Event) => event.preventDefault());
    form.addEventListener("submit", pageSubmit);
    installPersistentSubmitGuard(page);
    const cleanup = beginOneSubmitAllowance(form, submitter);
    cleanup();

    form.requestSubmit(submitter);

    expect(pageSubmit).not.toHaveBeenCalled();
  });

  it("reports an uninstalled isolated guard as absent and fails acts closed", async () => {
    const page = createDocument();
    const act = vi.fn();

    expect(isPersistentSubmitGuardInstalled(page)).toBe(false);
    await expect(withSubmitEventsBlocked(page, act)).rejects.toThrow();
    expect(act).not.toHaveBeenCalled();
  });
});
