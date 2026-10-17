// Automated Spike E: launch a Chrome --app window, pin it topmost, read the WS_EX_TOPMOST flag back, close it.
// Run: npx tsx scripts/spikes/auto-e-pin.ts
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pinTopmost } from "../../apps/server/src/voice/pin-topmost";

const chromeCandidates = [
  join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
  join(process.env.ProgramFiles ?? "", "Google/Chrome/Application/chrome.exe"),
  join(process.env["ProgramFiles(x86)"] ?? "", "Google/Chrome/Application/chrome.exe"),
];
const chrome = chromeCandidates.find((p) => existsSync(p));
if (!chrome) {
  console.log("RESULT E: SKIPPED (Chrome not found)");
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), "blip-spike-e-"));
const html = "data:text/html,<title>BlipSpikeE</title><h1>Spike E</h1>";
const child = spawn(
  chrome,
  [`--user-data-dir=${profile}`, `--app=${html}`, "--no-first-run", "--no-default-browser-check", "--window-size=420,300"],
  { stdio: "ignore", detached: false },
);

const readExStyle = (hwnd: string): number => {
  const ps = `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern long GetWindowLongPtrW(System.IntPtr h, int i);' -Name W -Namespace B; [B.W]::GetWindowLongPtrW([System.IntPtr]${hwnd}, -20)`;
  return Number(execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim());
};

let code = 1;
try {
  const before = await pinTopmost("BlipSpikeE", { timeoutMs: 15000 });
  console.log("pinTopmost ->", JSON.stringify(before));
  if (before.ok && before.hwnd) {
    const ex = readExStyle(before.hwnd);
    const topmost = (ex & 0x8) !== 0;
    console.log(`WS_EX_TOPMOST set: ${topmost} (exstyle=0x${ex.toString(16)})`);
    console.log(topmost ? "RESULT E: PASS (pin works on a real Chrome --app window)" : "RESULT E: FAIL (flag not set)");
    code = topmost ? 0 : 1;
  } else {
    console.log("RESULT E: FAIL (could not find or pin the window)");
  }
} finally {
  try {
    execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    /* already closed */
  }
  await new Promise((r) => setTimeout(r, 800));
  rmSync(profile, { recursive: true, force: true });
}
process.exit(code);
