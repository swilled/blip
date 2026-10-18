// Design D docking: move the Blip app window to a screen edge and fit the browser beside it.
// Left/right: a full-height sidebar with the browser in the remaining space. Top: a centered strip
// over a full-size browser. Dragging folds Blip into a puck that follows the cursor, then snaps.
import koffi from "koffi";

export type DockEdge = "left" | "right" | "top";
export interface Rect { x: number; y: number; w: number; h: number }
export interface Size { w: number; h: number }

export const DOCK_EDGES: readonly DockEdge[] = ["left", "right", "top"];
export const PANEL_WIDTH = 380;
export const GAP = 8;
/** Client-area sizes; the window frame is added on top. */
export const STRIP: Size = { w: 560, h: 72 };
export const PUCK: Size = { w: 340, h: 72 };
const TWEEN_MS = 240;
const FOLD_MS = 150;
const FRAME_MS = 16;
const DRAG_LIMIT_MS = 30_000;

/** Rects are physical pixels; `scale` is the monitor's DPI / 96 and sizes Blip's CSS-pixel constants. */
export function dockLayout(edge: DockEdge, work: Rect, frame: Size, scale = 1): { blip: Rect; browser: Rect } {
  const gap = Math.round(GAP * scale);
  if (edge === "top") {
    const w = Math.round(STRIP.w * scale) + frame.w;
    return {
      blip: { x: Math.round(work.x + (work.w - w) / 2), y: work.y + gap, w, h: Math.round(STRIP.h * scale) + frame.h },
      browser: { ...work },
    };
  }
  const panel = Math.round(PANEL_WIDTH * scale);
  const browserW = work.w - panel - gap * 2;
  const blip = { x: edge === "left" ? work.x + gap : work.x + work.w - panel - gap, y: work.y + gap, w: panel, h: work.h - gap * 2 };
  const browser = { x: edge === "left" ? work.x + panel + gap * 2 : work.x, y: work.y, w: browserW, h: work.h };
  return { blip, browser };
}

/** Which edge a drop at this point snaps to; null in the middle of the screen. */
export function zoneAt(pt: { x: number; y: number }, work: Rect): DockEdge | null {
  const fx = (pt.x - work.x) / work.w;
  const fy = (pt.y - work.y) / work.h;
  if (fx < 0.22) return "left";
  if (fx > 0.78) return "right";
  if (fy < 0.2) return "top";
  return null;
}

export function easeOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

export function tweenRect(from: Rect, to: Rect, t: number): Rect {
  const e = easeOutCubic(t);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * e);
  return { x: lerp(from.x, to.x), y: lerp(from.y, to.y), w: lerp(from.w, to.w), h: lerp(from.h, to.h) };
}

export function parseDockEdge(value: unknown): DockEdge | null {
  return value === "left" || value === "right" || value === "top" ? value : null;
}

// ---------- Win32 driver ----------

const CHROME_CLASS = "Chrome_WidgetWin_1";
const BROWSER_EXES = new Set(["chrome.exe", "msedge.exe", "brave.exe", "chromium.exe"]);
const HWND_TOPMOST = -1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_NOOWNERZORDER = 0x0200;
const SWP_ASYNCWINDOWPOS = 0x4000;
const SW_RESTORE = 9;
const MONITOR_DEFAULTTONEAREST = 2;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = -4;
const VK_LBUTTON = 0x01;
const MOVE_FLAGS =SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS;

interface WinRect { left: number; top: number; right: number; bottom: number }
type Hwnd = unknown;

interface Win32 {
  EnumWindows: (cb: unknown, lparam: number) => boolean;
  IsWindowVisible: (h: Hwnd) => boolean;
  IsIconic: (h: Hwnd) => boolean;
  IsZoomed: (h: Hwnd) => boolean;
  GetClassNameW: (h: Hwnd, buf: Buffer, max: number) => number;
  GetWindowTextW: (h: Hwnd, buf: Buffer, max: number) => number;
  GetWindowRect: (h: Hwnd, out: WinRect) => boolean;
  GetClientRect: (h: Hwnd, out: WinRect) => boolean;
  ShowWindow: (h: Hwnd, cmd: number) => boolean;
  SetWindowPos: (h: Hwnd, after: number, x: number, y: number, cx: number, cy: number, flags: number) => boolean;
  MonitorFromWindow: (h: Hwnd, flags: number) => unknown;
  MonitorFromPoint: (pt: { x: number; y: number }, flags: number) => unknown;
  GetMonitorInfoW: (mon: unknown, info: { cbSize: number; rcMonitor?: WinRect; rcWork?: WinRect; dwFlags?: number }) => boolean;
  GetCursorPos: (out: { x?: number; y?: number }) => boolean;
  GetAsyncKeyState: (vk: number) => number;
  GetDpiForWindow: (h: Hwnd) => number;
  SetThreadDpiAwarenessContext: (ctx: number) => unknown;
  GetWindowThreadProcessId: (h: Hwnd, pid: number[]) => number;
  OpenProcess: (access: number, inherit: boolean, pid: number) => unknown;
  QueryFullProcessImageNameW: (proc: unknown, flags: number, buf: Buffer, size: number[]) => boolean;
  CloseHandle: (h: unknown) => boolean;
  DwmGetWindowAttribute: (h: Hwnd, attr: number, out: WinRect, size: number) => number;
  proto: unknown;
}

let win32: Win32 | null = null;

function load(): Win32 {
  if (win32) return win32;
  const user32 = koffi.load("user32.dll");
  const kernel32 = koffi.load("kernel32.dll");
  const dwmapi = koffi.load("dwmapi.dll");
  const rect = koffi.struct("BlipDockRect", { left: "int32", top: "int32", right: "int32", bottom: "int32" });
  koffi.struct("BlipDockPoint", { x: "int32", y: "int32" });
  koffi.struct("BlipDockMonitorInfo", { cbSize: "uint32", rcMonitor: rect, rcWork: rect, dwFlags: "uint32" });
  const proto = koffi.proto("bool __stdcall BlipDockEnumProc(void *hwnd, intptr_t lparam)");
  win32 = {
    EnumWindows: user32.func("bool __stdcall EnumWindows(BlipDockEnumProc *cb, intptr_t lparam)"),
    IsWindowVisible: user32.func("bool __stdcall IsWindowVisible(void *hwnd)"),
    IsIconic: user32.func("bool __stdcall IsIconic(void *hwnd)"),
    IsZoomed: user32.func("bool __stdcall IsZoomed(void *hwnd)"),
    GetClassNameW: user32.func("int __stdcall GetClassNameW(void *hwnd, _Out_ uint16_t *buf, int max)"),
    GetWindowTextW: user32.func("int __stdcall GetWindowTextW(void *hwnd, _Out_ uint16_t *buf, int max)"),
    GetWindowRect: user32.func("bool __stdcall GetWindowRect(void *hwnd, _Out_ BlipDockRect *rect)"),
    GetClientRect: user32.func("bool __stdcall GetClientRect(void *hwnd, _Out_ BlipDockRect *rect)"),
    ShowWindow: user32.func("bool __stdcall ShowWindow(void *hwnd, int cmd)"),
    SetWindowPos: user32.func("bool __stdcall SetWindowPos(void *hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)"),
    MonitorFromWindow: user32.func("void * __stdcall MonitorFromWindow(void *hwnd, uint32_t flags)"),
    MonitorFromPoint: user32.func("void * __stdcall MonitorFromPoint(BlipDockPoint pt, uint32_t flags)"),
    GetMonitorInfoW: user32.func("bool __stdcall GetMonitorInfoW(void *mon, _Inout_ BlipDockMonitorInfo *info)"),
    GetCursorPos: user32.func("bool __stdcall GetCursorPos(_Out_ BlipDockPoint *pt)"),
    GetAsyncKeyState: user32.func("int16_t __stdcall GetAsyncKeyState(int vk)"),
    GetDpiForWindow: user32.func("uint32_t __stdcall GetDpiForWindow(void *hwnd)"),
    SetThreadDpiAwarenessContext: user32.func("void * __stdcall SetThreadDpiAwarenessContext(intptr_t ctx)"),
    GetWindowThreadProcessId: user32.func("uint32_t __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32_t *pid)"),
    OpenProcess: kernel32.func("void * __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)"),
    QueryFullProcessImageNameW: kernel32.func("bool __stdcall QueryFullProcessImageNameW(void *proc, uint32_t flags, _Out_ uint16_t *buf, _Inout_ uint32_t *size)"),
    CloseHandle: kernel32.func("bool __stdcall CloseHandle(void *h)"),
    DwmGetWindowAttribute: dwmapi.func("long __stdcall DwmGetWindowAttribute(void *hwnd, uint32_t attr, _Out_ BlipDockRect *out, uint32_t size)"),
    proto,
  } as Win32;
  // Work in physical pixels. A DPI-unaware caller gets scaled window rects but unscaled DWM frame
  // bounds, which misplaces every window on a scaled display.
  win32.SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  return win32;
}

function readW(fn: (h: Hwnd, b: Buffer, n: number) => number, h: Hwnd): string {
  const buf = Buffer.alloc(512 * 2);
  const n = fn(h, buf, 512);
  return buf.toString("utf16le", 0, Math.max(0, n) * 2);
}

function processExe(u: Win32, h: Hwnd): string {
  const pid = [0];
  u.GetWindowThreadProcessId(h, pid);
  const proc = u.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid[0] ?? 0);
  if (!proc) return "";
  try {
    const buf = Buffer.alloc(1024 * 2);
    const size = [1024];
    if (!u.QueryFullProcessImageNameW(proc, 0, buf, size)) return "";
    const full = buf.toString("utf16le", 0, (size[0] ?? 0) * 2);
    return full.slice(full.lastIndexOf("\\") + 1).toLowerCase();
  } finally {
    u.CloseHandle(proc);
  }
}

/** The Blip window (exact app-window title) and the topmost real browser window in z-order. */
function findWindows(u: Win32, title: string): { blip: Hwnd | null; browser: Hwnd | null } {
  let blip: Hwnd | null = null;
  let browser: Hwnd | null = null;
  const cb = koffi.register((h: Hwnd) => {
    if (!u.IsWindowVisible(h) || readW(u.GetClassNameW, h) !== CHROME_CLASS) return true;
    const text = readW(u.GetWindowTextW, h);
    if (text === title) {
      blip ??= h;
    } else if (browser === null && text !== "" && !u.IsIconic(h) && BROWSER_EXES.has(processExe(u, h))) {
      browser = h;
    }
    return true;
  }, koffi.pointer(u.proto as never));
  try {
    u.EnumWindows(cb, 0);
  } finally {
    koffi.unregister(cb);
  }
  return { blip, browser };
}

function toRect(r: WinRect): Rect {
  return { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top };
}

/** Invisible resize borders: how far the window rect extends past what the user sees. */
function frameInset(u: Win32, h: Hwnd): WinRect {
  const outer: WinRect = { left: 0, top: 0, right: 0, bottom: 0 };
  const seen: WinRect = { left: 0, top: 0, right: 0, bottom: 0 };
  u.GetWindowRect(h, outer);
  if (u.DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, seen, 16) !== 0) return { left: 0, top: 0, right: 0, bottom: 0 };
  return { left: seen.left - outer.left, top: seen.top - outer.top, right: outer.right - seen.right, bottom: outer.bottom - seen.bottom };
}

function visibleRect(u: Win32, h: Hwnd): Rect {
  const outer: WinRect = { left: 0, top: 0, right: 0, bottom: 0 };
  u.GetWindowRect(h, outer);
  const i = frameInset(u, h);
  return toRect({ left: outer.left + i.left, top: outer.top + i.top, right: outer.right - i.right, bottom: outer.bottom - i.bottom });
}

/** Visible frame minus client area: what to add to a client size to get a window size. */
function frameSize(u: Win32, h: Hwnd): Size {
  const client: WinRect = { left: 0, top: 0, right: 0, bottom: 0 };
  u.GetClientRect(h, client);
  const seen = visibleRect(u, h);
  return { w: Math.max(0, seen.w - (client.right - client.left)), h: Math.max(0, seen.h - (client.bottom - client.top)) };
}

function dpiScale(u: Win32, h: Hwnd): number {
  const dpi = u.GetDpiForWindow(h);
  return dpi > 0 ? dpi / 96 : 1;
}

function workArea(u: Win32, monitor: unknown): Rect {
  const info = { cbSize: 40 } as { cbSize: number; rcWork?: WinRect };
  u.GetMonitorInfoW(monitor, info);
  return toRect(info.rcWork ?? { left: 0, top: 0, right: 1920, bottom: 1080 });
}

function place(u: Win32, h: Hwnd, r: Rect, inset: WinRect, flags = MOVE_FLAGS): void {
  u.SetWindowPos(h, 0, r.x - inset.left, r.y - inset.top, r.w + inset.left + inset.right, r.h + inset.top + inset.bottom, flags);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function animate(u: Win32, moves: { h: Hwnd; from: Rect; to: Rect; inset: WinRect }[], ms: number): Promise<void> {
  const start = Date.now();
  for (;;) {
    const t = ms <= 0 ? 1 : (Date.now() - start) / ms;
    for (const m of moves) place(u, m.h, tweenRect(m.from, m.to, t), m.inset);
    if (t >= 1) return;
    await sleep(FRAME_MS);
  }
}

export interface WindowDock {
  dock(edge: DockEdge): Promise<boolean>;
  /** onDocked fires when the server ends the drag itself (button released without a page event). */
  dragStart(onZone: (zone: DockEdge | null) => void, onDocked?: (edge: DockEdge | null) => void): Promise<boolean>;
  /** Ends a drag: snaps to the zone under the cursor, or back to the last dock when there is none. */
  dragEnd(): Promise<DockEdge | null>;
  dragCancel(): Promise<DockEdge | null>;
  readonly edge: DockEdge;
}

export function createWindowDock(opts: { title?: string } = {}): WindowDock {
  const title = opts.title ?? "Blip";
  let edge: DockEdge = "right";
  let busy: Promise<unknown> = Promise.resolve();
  let drag: { timer: ReturnType<typeof setInterval>; zone: DockEdge | null; limit: ReturnType<typeof setTimeout> } | null = null;

  // One window operation at a time, so a tween never fights the next one.
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = busy.then(fn, fn);
    busy = next.catch(() => {});
    return next;
  }

  async function doDock(target: DockEdge): Promise<boolean> {
    stopDrag();
    const u = load();
    const { blip, browser } = findWindows(u, title);
    if (!blip) return false;
    if (u.IsZoomed(blip)) u.ShowWindow(blip, SW_RESTORE);
    const work = workArea(u, u.MonitorFromWindow(blip, MONITOR_DEFAULTTONEAREST));
    const layout = dockLayout(target, work, frameSize(u, blip), dpiScale(u, blip));
    const moves = [{ h: blip, from: visibleRect(u, blip), to: layout.blip, inset: frameInset(u, blip) }];
    if (browser) {
      if (u.IsZoomed(browser)) u.ShowWindow(browser, SW_RESTORE);
      moves.push({ h: browser, from: visibleRect(u, browser), to: layout.browser, inset: frameInset(u, browser) });
    }
    await animate(u, moves, TWEEN_MS);
    u.SetWindowPos(blip, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    edge = target;
    return true;
  }

  function stopDrag(): DockEdge | null {
    if (!drag) return null;
    clearInterval(drag.timer);
    clearTimeout(drag.limit);
    const zone = drag.zone;
    drag = null;
    return zone;
  }

  return {
    get edge() { return edge; },
    dock: (target) => serial(() => doDock(target)),
    dragStart: (onZone, onDocked) => serial(async () => {
      if (drag) return true;
      const u = load();
      const { blip } = findWindows(u, title);
      if (!blip) return false;
      if (u.IsZoomed(blip)) u.ShowWindow(blip, SW_RESTORE);
      const frame = frameSize(u, blip);
      const inset = frameInset(u, blip);
      const cursor = { x: 0, y: 0 };
      u.GetCursorPos(cursor);
      // Keep the grip under the cursor: it sits near the left end of the folded puck.
      const scale = dpiScale(u, blip);
      const puck = { w: Math.round(PUCK.w * scale) + frame.w, h: Math.round(PUCK.h * scale) + frame.h };
      const grab = { x: Math.round(30 * scale), y: frame.h + Math.round((PUCK.h * scale) / 2) };
      const puckAt = (c: { x: number; y: number }): Rect => ({ x: c.x - grab.x, y: c.y - grab.y, ...puck });
      await animate(u, [{ h: blip, from: visibleRect(u, blip), to: puckAt(cursor), inset }], FOLD_MS);
      u.SetWindowPos(blip, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
      const state = {
        zone: null as DockEdge | null,
        timer: setInterval(() => { try {
          if (drag !== state) return;
          // The button came up but the page never said so: snap anyway rather than leave a puck behind.
          if ((u.GetAsyncKeyState(VK_LBUTTON) & 0x8000) === 0) {
            const zone = stopDrag();
            void serial(async () => ((await doDock(zone ?? edge)) ? zone ?? edge : null)).then((e) => onDocked?.(e), () => onDocked?.(null));
            return;
          }
          const c = { x: 0, y: 0 };
          if (!u.GetCursorPos(c)) return;
          const r = puckAt(c);
          u.SetWindowPos(blip, 0, r.x - inset.left, r.y - inset.top, 0, 0, MOVE_FLAGS | SWP_NOSIZE);
          const zone = zoneAt(c, workArea(u, u.MonitorFromPoint(c, MONITOR_DEFAULTTONEAREST)));
          if (zone !== state.zone) {
            state.zone = zone;
            onZone(zone);
          }
        } catch { stopDrag(); } }, FRAME_MS), // a Win32 failure must never crash the server
        limit: setTimeout(() => { void serial(async () => { stopDrag(); await doDock(edge); }); }, DRAG_LIMIT_MS),
      };
      drag = state;
      return true;
    }),
    dragEnd: () => serial(async () => {
      const zone = stopDrag();
      const target = zone ?? edge;
      return (await doDock(target)) ? target : null;
    }),
    dragCancel: () => serial(async () => {
      stopDrag();
      return (await doDock(edge)) ? edge : null;
    }),
  };
}
