import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, ".local-stt");
const models: Record<string, { sha: string }> = {
  "base.en": { sha: "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002" },
  "small.en": { sha: "c6138d6d58ecc8322097e0f987c32f1be8bb0a18532a3f88f734d1bbf9c41e5d" },
  "medium.en-q5_0": { sha: "76733e26ad8fe1c7a5bf7531a9d41917b2adc0f20f2e4f5531688a8c6cd88eb0" },
};
const selected = process.argv.find(arg => arg.startsWith("--model="))?.slice(8) ?? "small.en";
if (!models[selected]) throw new Error("Supported models: base.en, small.en, medium.en-q5_0");
// Official upstream artifacts, pinned independently of mutable latest/main references.
const artifacts = [
  { name: "whisper.zip", url: "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip", sha: "49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a" },
  { name: `ggml-${selected}.bin`, url: `https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-${selected}.bin`, sha: models[selected]!.sha },
];
if (process.platform !== "win32" || process.arch !== "x64") throw new Error("This setup installs the Windows x64 CPU build.");
await mkdir(target, { recursive: true });
await Promise.all(artifacts.map(async artifact => {
  const dest = path.join(target, artifact.name);
  let bytes: Buffer | undefined;
  try { bytes = await readFile(dest); } catch { /* first install */ }
  const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
  if (!bytes || hash(bytes) !== artifact.sha) {
    process.stdout.write(`Downloading ${artifact.name} from the pinned upstream source...\n`);
    const response = await fetch(artifact.url, { signal: AbortSignal.timeout(300_000) });
    if (!response.ok) throw new Error(`Download failed (${response.status}) for ${artifact.name}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (hash(bytes) !== artifact.sha) throw new Error(`Checksum mismatch for ${artifact.name}; not installing.`);
    await writeFile(dest, bytes);
  }
  process.stdout.write(`Verified SHA-256: ${artifact.name}\n`);
}));
// The paths are passed as literal PowerShell arguments, never interpreted as shell fragments.
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath ${literal(path.join(target, "whisper.zip"))} -DestinationPath ${literal(path.join(target, "bin"))} -Force`], { windowsHide: true, stdio: "inherit" });
if (result.status !== 0) throw new Error("Could not extract the verified whisper.cpp archive.");
process.stdout.write(`Local Whisper ${selected} installed. Demo prefers small.en; BLIP_STT_MODEL can select an installed comparison model. Restart the demo after changes. No audio is uploaded.\n`);
