// Spike C1: NVDA speakText through the controller client, three times 5 s apart.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { nvdaSpeak, nvdaLastError, nvdaDllPath } from "../../apps/server/src/voice/nvda";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "..", ".planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes");
mkdirSync(dir, { recursive: true });
const file = join(dir, "C1.log");

function log(line: string): void {
  const l = `${new Date().toISOString()} ${line}`;
  appendFileSync(file, l + "\n");
  console.log(l);
}

console.log(`NVDA must be running. DLL: ${nvdaDllPath()}`);
console.log("Focus the FORM TAB now for the first calls, then the VOICE WINDOW for later runs; note which in the log.");
for (let i = 1; i <= 3; i++) {
  const code = nvdaSpeak("Blip test");
  log(`speakText #${i} -> code ${code}${code === -1 ? " " + nvdaLastError() : ""}`);
  if (i < 3) await new Promise((r) => setTimeout(r, 5000));
}
