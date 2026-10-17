// @vitest-environment node
import process from "node:process";
import { describe, expect, it } from "vitest";
import type { BrowserFixtureSession } from "./harness.js";
import type { TestPageReport } from "../../../../tools/test-pages/serve.js";
import { openFixturePage } from "./harness.js";

const enabled = process.env["BLIP_E2E_BROWSER"] === "1";
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
type InputFixture = BrowserFixtureSession & {
  pressEnter(selector: string): Promise<void>;
  clickElement(selector: string): Promise<void>;
};

async function reportsWithCaptures(fixture: BrowserFixtureSession, expected: number): Promise<TestPageReport[]> {
  const deadline = Date.now() + 5_000;
  let reports: TestPageReport[] = [];
  while (Date.now() < deadline) {
    reports = await fixture.reports("/submit-bypass.html");
    if (reports.filter((report) => report.type === "window-submit-capture").length >= expected) return reports;
    await delay(25);
  }
  return reports;
}

describe("fresh-page no-grant submit barrier", () => {
  it.skipIf(!enabled)("blocks native submit routes before any extension act or grant", async () => {
    const fixture = await openFixturePage("/submit-bypass.html");
    const inputFixture = fixture as InputFixture;
    try {
      const setup = await fixture.evaluateInPage(`(() => {
        const form = document.querySelector('#bypass-form');
        const button = document.querySelector('#native-submit');
        const descriptor = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'submit');
        return {
          valid: form instanceof HTMLFormElement && form.checkValidity(),
          defaultFirst: form instanceof HTMLFormElement && form.elements[0] === button,
          defaultType: button instanceof HTMLButtonElement ? button.type : null,
          defaultDisabled: button instanceof HTMLButtonElement ? button.disabled : null,
          descriptor: {
            configurable: descriptor?.configurable,
            enumerable: descriptor?.enumerable,
            writable: descriptor?.writable,
            valueType: typeof descriptor?.value,
          },
          sentinel: globalThis.__blipSubmitMethodGuardInstalled,
        };
      })()`);
      expect(setup).toEqual({
        valid: true,
        defaultFirst: true,
        defaultType: "submit",
        defaultDisabled: false,
        descriptor: { configurable: false, enumerable: false, writable: false, valueType: "function" },
        sentinel: "blip-submit-method-guard-v1",
      });

      await fixture.evaluateInPage(`(() => {
        const form = document.querySelector('#bypass-form');
        if (!(form instanceof HTMLFormElement)) throw new Error('bypass form is missing');
        form.submit();
        HTMLFormElement.prototype.submit.call(form);
        return true;
      })()`);
      await delay(200);
      let reports = await fixture.reports("/submit-bypass.html");
      expect(reports.filter((report) => report.type === "window-submit-capture")).toHaveLength(0);
      expect(reports.filter((report) => report.type === "submit-form-handler")).toHaveLength(0);
      expect(await fixture.evaluateInPage("document.querySelector('#sink-frame')?.contentWindow?.location.href")).toBe("about:blank");

      await fixture.evaluateInPage("document.querySelector('#bypass-form')?.requestSubmit(); true");
      reports = await reportsWithCaptures(fixture, 1);
      expect(reports.filter((report) => report.type === "window-submit-capture")).toHaveLength(1);
      expect(reports.filter((report) => report.type === "submit-form-handler")).toHaveLength(0);
      expect(await fixture.evaluateInPage("document.querySelector('#sink-frame')?.contentWindow?.location.href")).toBe("about:blank");

      await inputFixture.pressEnter("#enter-input");
      reports = await reportsWithCaptures(fixture, 2);
      expect(reports.filter((report) => report.type === "window-submit-capture")).toHaveLength(2);
      expect(reports.filter((report) => report.type === "submit-form-handler")).toHaveLength(0);
      expect(await fixture.evaluateInPage("document.querySelector('#sink-frame')?.contentWindow?.location.href")).toBe("about:blank");

      await inputFixture.clickElement("#div-submit");
      reports = await reportsWithCaptures(fixture, 3);
      expect(reports.filter((report) => report.type === "div-click-handler")).toHaveLength(1);
      expect(reports.filter((report) => report.type === "window-submit-capture")).toHaveLength(3);
      expect(reports.filter((report) => report.type === "submit-form-handler")).toHaveLength(0);
      expect(await fixture.evaluateInPage("document.querySelector('#sink-frame')?.contentWindow?.location.href")).toBe("about:blank");
      expect(await fixture.reports("/submit-sink.html")).toEqual([]);
      expect(fixture.actResults()).toEqual([]);
    } finally {
      await fixture.close();
    }
  }, 60_000);
});
