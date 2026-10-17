// Spike E: pin the window titled "Blip" topmost.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pinTopmost } from "../../apps/server/src/voice/pin-topmost";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "..", ".planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes");
mkdirSync(dir, { recursive: true });

console.log("Open the Blip window first (chrome --app=http://127.0.0.1:8788). Pinning...");
const r = await pinTopmost("Blip");
const line = `${new Date().toISOString()} pinTopmost("Blip") -> ${JSON.stringify(r)}`;
appendFileSync(join(dir, "E.log"), line + "\n");
console.log(line);
console.log("Now maximize another Chrome window and confirm the Blip window stays above it.");
process.exit(r.ok ? 0 : 1);
