// Pin a Chrome app window above other windows via user32 SetWindowPos (Spike E, Pattern 3).
import koffi from "koffi";

export interface PinResult {
  ok: boolean;
  hwnd?: string;
  title?: string;
  error?: string;
}

const HWND_TOPMOST = -1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOACTIVATE = 0x0010;
const CHROME_CLASS = "Chrome_WidgetWin_1";

interface User32 {
  EnumWindows: (cb: unknown, lparam: number) => boolean;
  IsWindowVisible: (hwnd: unknown) => boolean;
  GetClassNameW: (hwnd: unknown, buf: Buffer, max: number) => number;
  GetWindowTextW: (hwnd: unknown, buf: Buffer, max: number) => number;
  SetWindowPos: (hwnd: unknown, after: number, x: number, y: number, cx: number, cy: number, flags: number) => boolean;
  proto: unknown;
}

let api: User32 | null = null;

function load(): User32 {
  if (api) return api;
  const user32 = koffi.load("user32.dll");
  const proto = koffi.proto("bool __stdcall BlipEnumProc(void *hwnd, intptr_t lparam)");
  api = {
    EnumWindows: user32.func("bool __stdcall EnumWindows(BlipEnumProc *cb, intptr_t lparam)"),
    IsWindowVisible: user32.func("bool __stdcall IsWindowVisible(void *hwnd)"),
    GetClassNameW: user32.func("int __stdcall GetClassNameW(void *hwnd, _Out_ uint16_t *buf, int max)"),
    GetWindowTextW: user32.func("int __stdcall GetWindowTextW(void *hwnd, _Out_ uint16_t *buf, int max)"),
    SetWindowPos: user32.func(
      "bool __stdcall SetWindowPos(void *hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)",
    ),
    proto,
  } as User32;
  return api;
}

function readW(fn: (h: unknown, b: Buffer, n: number) => number, hwnd: unknown): string {
  const buf = Buffer.alloc(512 * 2);
  const n = fn(hwnd, buf, 512);
  return buf.toString("utf16le", 0, Math.max(0, n) * 2);
}

// Chrome --app windows are titled exactly with the page <title>. Normal browser windows are titled
// "<page> - Google Chrome", so a substring match can pin the wrong window (e.g. a GitHub tab named "...blip").
// Default is an exact match; pass { loose: true } for a substring match.
function findOnce(u: User32, needle: string, loose: boolean): { hwnd: unknown; title: string } | null {
  let found: { hwnd: unknown; title: string } | null = null;
  const cb = koffi.register((hwnd: unknown) => {
    if (found || !u.IsWindowVisible(hwnd)) return true;
    if (readW(u.GetClassNameW, hwnd) !== CHROME_CLASS) return true;
    const title = readW(u.GetWindowTextW, hwnd);
    if (loose ? title.includes(needle) : title === needle) found = { hwnd, title };
    return true;
  }, koffi.pointer(u.proto as never));
  try {
    u.EnumWindows(cb, 0);
  } finally {
    koffi.unregister(cb);
  }
  return found;
}

export async function pinTopmost(title: string, opts?: { timeoutMs?: number; loose?: boolean }): Promise<PinResult> {
  const titleSubstring = title;
  const loose = opts?.loose ?? false;
  const timeoutMs = opts?.timeoutMs ?? 5000;
  try {
    const u = load();
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = findOnce(u, titleSubstring, loose);
      if (hit) {
        const ok = u.SetWindowPos(
          hit.hwnd,
          HWND_TOPMOST,
          0,
          0,
          0,
          0,
          SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
        );
        const addr = koffi.address(hit.hwnd as never);
        return { ok, hwnd: String(addr), title: hit.title };
      }
      if (Date.now() >= deadline) return { ok: false, error: "window not found" };
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
