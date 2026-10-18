import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dock: vi.fn(), broadcastWindow: vi.fn(), options: null as any }));
vi.mock("./window-dock", () => ({ createWindowDock: () => ({ edge: "right", dock: mocks.dock }) }));
vi.mock("./ptt-hook", () => ({ startPttHook: vi.fn(), stopPttHook: vi.fn() }));
vi.mock("./ptt-sidecar", () => ({ startPttSidecar: (options: unknown) => {
  mocks.options = options;
  return { listening: Promise.resolve(7778), broadcastWindow: mocks.broadcastWindow, close: async () => {} };
} }));
import { startPttWire } from "../../../../dev/mock-server/src/ptt-wire";

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("keeps docking available after a transient failure and acknowledges a later successful attempt", async () => {
  vi.stubGlobal("process", { ...process, platform: "win32" });
  mocks.dock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const stop = await startPttWire(7777);
  try {
    mocks.options.onWindowRequest({ dock: "right" });
    await vi.waitFor(() => expect(mocks.broadcastWindow).toHaveBeenCalledWith({ dockAvailable: true }));
    mocks.options.onWindowRequest({ dock: "left" });
    await vi.waitFor(() => expect(mocks.broadcastWindow).toHaveBeenCalledWith({ docked: "left" }));
    expect(mocks.broadcastWindow).not.toHaveBeenCalledWith({ dockAvailable: false });
  } finally { await stop(); }
});
