// Automated check: after the pin flag is cleared, the launcher puts the Blip window back on top within a few seconds.
// Run: node --import tsx scripts/spikes/auto-repin.ts
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pinTopmost } from "../../apps/server/src/voice/pin-topmost";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const root = fileURLToPath(new URL("../../", import.meta.url));
const child = spawn(process.execPath, ["--import", "tsx", "dev/mock-server/src/dev.ts"], { cwd: root, stdio: "ignore" });

const ps = (script: string) => execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" }).trim();
const exStyle = (hwnd: string) =>
  Number(ps(`Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern long GetWindowLongPtrW(System.IntPtr h, int i);' -Name W -Namespace B; [B.W]::GetWindowLongPtrW([System.IntPtr]${hwnd}, -20)`));
const setNoTopmost = (hwnd: string) =>
  ps(`Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr a, int x, int y, int cx, int cy, uint f);' -Name S -Namespace B; [B.S]::SetWindowPos([System.IntPtr]${hwnd}, [System.IntPtr](-2), 0,0,0,0, 0x13)`);

let code = 1;
try {
  await sleep(9000);
  const r = await pinTopmost("Blip", { timeoutMs: 10000 });
  if (!r.ok || !r.hwnd) throw new Error("no Blip window: " + JSON.stringify(r));
  console.log("window title:", JSON.stringify(r.title), "hwnd:", r.hwnd);
  console.log("topmost now:", (exStyle(r.hwnd) & 8) !== 0);
  setNoTopmost(r.hwnd);
  const cleared = (exStyle(r.hwnd) & 8) === 0;
  console.log("after clearing the flag, topmost:", !cleared);
  await sleep(3500);
  const back = (exStyle(r.hwnd) & 8) !== 0;
  console.log("3.5 s later, topmost again:", back);
  console.log(cleared && back ? "RESULT: PASS (window re-raises itself)" : "RESULT: FAIL");
  code = cleared && back ? 0 : 1;
} catch (e) {
  console.log("ERROR:", e instanceof Error ? e.message : e);
} finally {
  try {
    execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    /* gone */
  }
}
process.exit(code);
