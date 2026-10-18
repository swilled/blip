import { execFileSync } from "node:child_process";
export function voiceBuildInfo(root: string): { id: string; commit: string; dirty: boolean; builtAt: string } {
  let commit = "unknown";
  let dirty = true;
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
    dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: root, encoding: "utf8", windowsHide: true }).trim().length > 0;
  } catch { /* A packaged build need not have git installed. */ }
  const builtAt = new Date().toISOString();
  return { id: `${commit}${dirty ? "-dirty" : ""}-${builtAt}`, commit, dirty, builtAt };
}
