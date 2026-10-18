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

let decoy: ReturnType<typeof spawn> | null = null;
const readExStyle = (hwnd: string): number => {
  const ps = `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern long GetWindowLongPtrW(System.IntPtr h, int i);' -Name W -Namespace B; [B.W]::GetWindowLongPtrW([System.IntPtr]${hwnd}, -20)`;
  return Number(execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim());
};

let code = 1;
try {
  // Wait for the app window, then open a decoy normal window whose title also contains "BlipSpikeE" (the old substring match would pin it).
  await new Promise((r) => setTimeout(r, 2500));
  decoy = spawn(chrome, [`--user-data-dir=${profile}`, "data:text/html,<title>decoy BlipSpikeE decoy</title>decoy"], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 2500));
  const before = await pinTopmost("BlipSpikeE", { timeoutMs: 15000 });
  console.log("pinTopmost ->", JSON.stringify(before));
  if (before.ok && before.hwnd) {
    const ex = readExStyle(before.hwnd);
    const topmost = (ex & 0x8) !== 0;
    console.log(`WS_EX_TOPMOST set: ${topmost} (exstyle=0x${ex.toString(16)})`);
    // click away: activate the decoy window, then re-read the flag on the app window
    execFileSync("powershell", ["-NoProfile", "-Command", "(New-Object -ComObject WScript.Shell).AppActivate('decoy BlipSpikeE decoy') | Out-Null"], { stdio: "ignore" });
    await new Promise((r) => setTimeout(r, 800));
    const stillTopmost = (readExStyle(before.hwnd) & 0x8) !== 0;
    const exactTitle = before.title === "BlipSpikeE";
    console.log(`pinned the exact app window: ${exactTitle}; still topmost after activating the decoy window: ${stillTopmost}`);
    const pass = topmost && stillTopmost && exactTitle;
    console.log(pass ? "RESULT E: PASS (pins only the exact app window and it stays topmost after clicking away)" : "RESULT E: FAIL");
    code = pass ? 0 : 1;
  } else {
    console.log("RESULT E: FAIL (could not find or pin the window)");
  }
} finally {
  for (const c of [child, decoy]) {
    if (!c) continue;
    try {
      execFileSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      /* already closed */
    }
  }
  await new Promise((r) => setTimeout(r, 800));
  rmSync(profile, { recursive: true, force: true });
}
process.exit(code);
