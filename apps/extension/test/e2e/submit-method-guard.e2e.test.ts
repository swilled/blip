// @vitest-environment node
import process from "node:process";
import { describe, expect, it } from "vitest";
import type { TestPageReport } from "../../../../tools/test-pages/serve.js";
import { openFixturePage, type BrowserFixtureSession } from "./harness.js";

const enabled = process.env["BLIP_E2E_BROWSER"] === "1";
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitForReports(
  fixture: BrowserFixtureSession,
  expected: (page: TestPageReport[], sink: TestPageReport[]) => boolean,
  timeoutMs = 8_000,
): Promise<{ page: TestPageReport[]; sink: TestPageReport[] }> {
  const deadline = Date.now() + timeoutMs;
  let page: TestPageReport[] = [];
  let sink: TestPageReport[] = [];
  while (Date.now() < deadline) {
    [page, sink] = await Promise.all([
      fixture.reports("/submit-bypass.html"),
      fixture.reports("/submit-sink.html"),
    ]);
    if (expected(page, sink)) return { page, sink };
    await delay(25);
  }
  return { page, sink };
}

function count(records: TestPageReport[], type: string): number {
  return records.filter((record) => record.type === type).length;
}

function countPageEvents(records: TestPageReport[], eventName: string): number {
  return records.filter((report) => report.type === "page-event" &&
    report.detail !== null && typeof report.detail === "object" &&
    (report.detail as { event?: unknown }).event === eventName).length;
}

async function assertFormReady(fixture: BrowserFixtureSession): Promise<void> {
  const setup = await fixture.evaluateInPage(`(() => {
    const form = document.querySelector('#bypass-form');
    const button = document.querySelector('#native-submit');
    return {
      href: location.href,
      title: document.title,
      bodyText: document.body?.innerText?.slice(0, 200) ?? '',
      valid: form instanceof HTMLFormElement && form.checkValidity(),
      defaultFirst: form instanceof HTMLFormElement && form.elements[0] === button,
      defaultType: button instanceof HTMLButtonElement ? button.type : null,
      defaultDisabled: button instanceof HTMLButtonElement ? button.disabled : null,
    };
  })()`);
  expect(setup, JSON.stringify(setup)).toMatchObject({ valid: true, defaultFirst: true, defaultType: "submit", defaultDisabled: false });
}

async function proveBaselineRoute(route: "requestSubmit" | "enter" | "div-click"): Promise<void> {
  const fixture = await openFixturePage("/submit-bypass.html", { withExtension: false });
  try {
    await assertFormReady(fixture);
    if (route === "requestSubmit") {
      await fixture.evaluateInPage(`(() => {
        const form = document.querySelector('#bypass-form');
        if (!(form instanceof HTMLFormElement)) throw new Error('bypass form is missing');
        window.blipReport('request-submit-attempt', {});
        form.requestSubmit();
      })()`);
    } else if (route === "enter") {
      await fixture.pressEnter("#enter-input");
    } else {
      await fixture.clickElement("#div-submit");
    }

    const { page, sink } = await waitForReports(fixture, (pageReports, sinkReports) =>
      count(pageReports, "window-submit-capture") >= 1 &&
      count(pageReports, "submit-form-handler") >= 1 &&
      count(sinkReports, "submit-sink-reached") >= 1,
    );
    expect(fixture.browser).toMatch(/chrome|edge|chromium/i);
    expect(count(page, "window-submit-capture")).toBe(1);
    expect(count(page, "submit-form-handler")).toBe(1);
    expect(countPageEvents(page, "submit")).toBe(1);
    expect(count(sink, "submit-sink-reached")).toBe(1);
    if (route === "requestSubmit") expect(count(page, "request-submit-attempt")).toBe(1);
    if (route === "enter") {
      expect(page.some((report) => report.type === "page-event" &&
        report.detail !== null && typeof report.detail === "object" &&
        (report.detail as { event?: unknown; enter?: unknown }).event === "keydown" &&
        (report.detail as { event?: unknown; enter?: unknown }).enter === true)).toBe(true);
    }
    if (route === "div-click") {
      expect(count(page, "div-click-handler")).toBe(1);
      expect(count(page, "div-request-submit-attempt")).toBe(1);
    }
  } finally {
    await fixture.close();
  }
}

describe("fresh-page no-grant submit barrier", () => {
  it.skipIf(!enabled)("blocks native submit routes before any extension act or grant", async () => {
    // Matched no-extension profiles establish that each browser route is valid and really dispatches.
    await proveBaselineRoute("requestSubmit");
    await proveBaselineRoute("enter");
    await proveBaselineRoute("div-click");

    const fixture = await openFixturePage("/submit-bypass.html");
    try {
      await assertFormReady(fixture);
      const descriptor = await fixture.evaluateInPage(`(() => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'submit');
        return {
          configurable: descriptor?.configurable,
          enumerable: descriptor?.enumerable,
          writable: descriptor?.writable,
          valueType: typeof descriptor?.value,
          sentinel: globalThis.__blipSubmitMethodGuardInstalled,
        };
      })()`);
      expect(descriptor).toEqual({
        configurable: false,
        enumerable: false,
        writable: false,
        valueType: "function",
        sentinel: "blip-submit-method-guard-v1",
      });

      await fixture.evaluateInPage(`(() => {
        const form = document.querySelector('#bypass-form');
        if (!(form instanceof HTMLFormElement)) throw new Error('bypass form is missing');
        form.submit();
        HTMLFormElement.prototype.submit.call(form);
      })()`);
      await delay(200);
      let page = await fixture.reports("/submit-bypass.html");
      let sink = await fixture.reports("/submit-sink.html");
      expect(count(page, "window-submit-capture")).toBe(0);
      expect(count(page, "submit-form-handler")).toBe(0);
      expect(countPageEvents(page, "submit")).toBe(0);
      expect(count(sink, "submit-sink-reached")).toBe(0);

      await fixture.evaluateInPage(`(() => {
        const form = document.querySelector('#bypass-form');
        if (!(form instanceof HTMLFormElement)) throw new Error('bypass form is missing');
        window.blipReport('request-submit-attempt', {});
        form.requestSubmit();
      })()`);
      await delay(200);
      page = await fixture.reports("/submit-bypass.html");
      sink = await fixture.reports("/submit-sink.html");
      expect(count(page, "request-submit-attempt")).toBe(1);
      expect(count(page, "window-submit-capture")).toBe(0);
      expect(count(page, "submit-form-handler")).toBe(0);
      expect(countPageEvents(page, "submit")).toBe(0);
      expect(count(sink, "submit-sink-reached")).toBe(0);

      await fixture.pressEnter("#enter-input");
      await delay(200);
      page = await fixture.reports("/submit-bypass.html");
      expect(page.some((report) => report.type === "page-event" &&
        report.detail !== null && typeof report.detail === "object" &&
        (report.detail as { event?: unknown; enter?: unknown }).event === "keydown" &&
        (report.detail as { event?: unknown; enter?: unknown }).enter === true)).toBe(true);
      expect(count(page, "window-submit-capture")).toBe(0);
      expect(count(page, "submit-form-handler")).toBe(0);
      expect(countPageEvents(page, "submit")).toBe(0);
      expect(await fixture.reports("/submit-sink.html")).toEqual([]);

      await fixture.clickElement("#div-submit");
      await delay(200);
      page = await fixture.reports("/submit-bypass.html");
      sink = await fixture.reports("/submit-sink.html");
      expect(count(page, "div-click-handler")).toBe(1);
      expect(count(page, "div-request-submit-attempt")).toBe(1);
      expect(count(page, "window-submit-capture")).toBe(0);
      expect(count(page, "submit-form-handler")).toBe(0);
      expect(countPageEvents(page, "submit")).toBe(0);
      expect(count(sink, "submit-sink-reached")).toBe(0);
      expect(fixture.actResults()).toEqual([]);
    } finally {
      await fixture.close();
    }
  }, 120_000);
});
