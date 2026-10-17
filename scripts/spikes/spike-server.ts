// Spike log server (Phase 1 spikes A, B, C2, F). Localhost only, no deps.
import { createServer } from "node:http";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 8788;
const HOST = "127.0.0.1";
const ORIGIN = `http://${HOST}:${PORT}`;
const MAX_BODY = 4096;
const SPIKES = new Set(["A", "B", "C2", "F", "D", "E", "C1"]);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
export const SPIKE_LOG_DIR = join(
  repoRoot,
  ".planning/workstreams/voice/phases/01-spikes-and-push-to-talk-loop/spikes",
);
mkdirSync(SPIKE_LOG_DIR, { recursive: true });

const html = readFileSync(join(here, "spike.html"));

const server = createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== ORIGIN) {
    res.writeHead(403).end("forbidden origin");
    return;
  }
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
    return;
  }
  if (req.method === "POST" && req.url === "/log") {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooBig = false;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        tooBig = true;
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (tooBig) {
        res.writeHead(413).end("too large");
        return;
      }
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          spike?: unknown;
          line?: unknown;
        };
        if (typeof body.spike !== "string" || !SPIKES.has(body.spike) || typeof body.line !== "string") {
          res.writeHead(204).end();
          return;
        }
        const line = body.line.replace(/[\r\n]+/g, " ");
        appendFileSync(join(SPIKE_LOG_DIR, `${body.spike}.log`), `${new Date().toISOString()} ${line}\n`);
        res.writeHead(204).end();
      } catch {
        res.writeHead(400).end("bad json");
      }
    });
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT, HOST, () => {
  console.log(`Spike server on ${ORIGIN}  (logs: ${SPIKE_LOG_DIR})`);
});
