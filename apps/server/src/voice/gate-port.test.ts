import { expect, test } from "vitest";

test("createStubGate exposes the fail-closed gate factory", async () => {
  const loadModule = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<Record<string, unknown>>;
  const moduleUrl = new URL("./gate-port.ts", import.meta.url).href;
  const gatePort = await loadModule(moduleUrl).catch(() => ({}));

  expect(typeof gatePort.createStubGate).toBe("function");
});
