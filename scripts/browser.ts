import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

export type BrowserEnvironment = {
  BLIP_BROWSER?: string;
  ProgramFiles?: string;
  [key: string]: string | undefined;
};

type ResolveBrowserOptions = {
  env?: BrowserEnvironment;
  exists?: (candidate: string) => boolean;
};

/** BLIP_BROWSER wins; otherwise prefer Chrome and use Edge as this machine's fallback. */
export function resolveBrowser(options: ResolveBrowserOptions = {}): string {
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const override = env["BLIP_BROWSER"]?.trim();
  if (override) return override;

  const programFiles = env["ProgramFiles"] ?? "C:\\Program Files";
  const programFilesX86 = env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const localAppData = env["LOCALAPPDATA"] ?? path.join(env["USERPROFILE"] ?? "C:\\Users\\Default", "AppData", "Local");
  const candidates = [
    path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
    path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
  ];
  const found = candidates.find(exists);
  if (found) return found;
  throw new Error("No Chrome or Edge executable found; set BLIP_BROWSER to the browser executable path.");
}
