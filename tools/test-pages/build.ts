import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const outputFile = path.join(packageRoot, "dist", "react-app.js");

await mkdir(path.dirname(outputFile), { recursive: true });
await build({
  entryPoints: [path.join(packageRoot, "src", "react-app.jsx")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome116"],
  outfile: outputFile,
});

process.stdout.write(`Built ${path.relative(packageRoot, outputFile)}\n`);
