import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { access, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(packageRoot, "public");
const distRoot = path.join(packageRoot, "dist");
const MAX_REPORT_BYTES = 64 * 1024;
const MAX_REPORTS = 500;

export type TestPageReport = Record<string, unknown>;

export interface TestPagesOrigins {
  /** Canonical address used for ordinary fixture pages. */
  primary: string;
  /** Alternate loopback hostname, used for cross-origin iframe fixtures. */
  alternate: string;
  /** Every origin backed by a successfully bound loopback listener. */
  all: string[];
}

export interface StartTestPagesOptions {
  port?: number;
  /** Build the optional fixture bundle before listening when build.ts exists. */
  build?: boolean;
}

export interface TestPagesServer {
  port: number;
  origins: TestPagesOrigins;
  /** Newest first; callers receive a snapshot so they cannot bypass the ring bound. */
  reports: TestPageReport[];
  clearReports(): void;
  close(): Promise<void>;
}

/** Start the local fixture host. Listeners are created only on explicit loopback addresses. */
export async function startTestPages({ port = 7790, build = true }: StartTestPagesOptions = {}): Promise<TestPagesServer> {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new RangeError("port must be an integer between 0 and 65535");
  }

  if (build) await buildAssetsIfAvailable();

  const records: TestPageReport[] = [];
  const servers: Server[] = [];
  const origins: TestPagesOrigins = { primary: "", alternate: "", all: [] };
  const primaryServer = await listen(createServer(createRequestHandler(records, origins)), "127.0.0.1", port);
  servers.push(primaryServer.server);
  const actualPort = primaryServer.port;

  let ipv6Server: Server | undefined;
  try {
    const bound = await listen(createServer(createRequestHandler(records, origins)), "::1", actualPort);
    ipv6Server = bound.server;
    servers.push(bound.server);
  } catch {
    // IPv6 loopback is best-effort; IPv4 remains the required listener.
  }

  origins.primary = `http://127.0.0.1:${actualPort}`;
  origins.alternate = `http://localhost:${actualPort}`;
  origins.all = [origins.primary, origins.alternate];
  if (ipv6Server) origins.all.push(`http://[::1]:${actualPort}`);

  return {
    port: actualPort,
    origins,
    get reports() {
      return records.slice().reverse();
    },
    clearReports() {
      records.length = 0;
    },
    async close() {
      await Promise.all(servers.map(closeServer));
    },
  };
}

async function buildAssetsIfAvailable(): Promise<void> {
  const buildScript = path.join(packageRoot, "build.ts");
  try {
    await access(buildScript);
  } catch {
    // The server is useful before the separate fixture-builder plan lands.
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", buildScript], {
      cwd: packageRoot,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`fixture build failed (${signal ?? `exit ${code ?? "unknown"}`})`));
    });
  });
}

function listen(server: Server, host: "127.0.0.1" | "::1", port: number): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("test page server did not receive a TCP address"));
        return;
      }
      resolve({ server, port: address.port });
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host, port, ipv6Only: host === "::1" });
  });
}

function createRequestHandler(records: TestPageReport[], origins: TestPagesOrigins) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    const method = request.method ?? "GET";
    const parsed = parseRequestTarget(request.url ?? "/");
    if (parsed.error) {
      send(response, parsed.error, "invalid request path", method);
      request.resume();
      return;
    }

    if (parsed.pathname === "/__report") {
      if (method !== "POST") {
        response.setHeader("Allow", "POST");
        send(response, 405, "method not allowed", method);
        request.resume();
        return;
      }
      void acceptReport(request, response, records);
      return;
    }

    if (parsed.pathname === "/__reports") {
      request.resume();
      if (method !== "GET" && method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        send(response, 405, "method not allowed", method);
        return;
      }
      const page = parsed.query.get("page");
      const newest = records
        .filter((record) => page === null || record.page === page)
        .slice(-MAX_REPORTS)
        .reverse();
      sendJson(response, 200, newest, method);
      return;
    }

    if (method !== "GET" && method !== "HEAD") {
      request.resume();
      response.setHeader("Allow", "GET, HEAD");
      send(response, 405, "method not allowed", method);
      return;
    }

    request.resume();
    void serveStatic(parsed.pathname, response, method, origins);
  };
}

function parseRequestTarget(target: string): { pathname: string; query: URLSearchParams; error?: number } {
  const queryIndex = target.indexOf("?");
  const rawPath = queryIndex === -1 ? target : target.slice(0, queryIndex);
  const rawQuery = queryIndex === -1 ? "" : target.slice(queryIndex + 1).split("#", 1)[0] ?? "";
  if (!rawPath.startsWith("/") || rawPath.startsWith("//") || rawPath.includes("\\") || rawPath.includes("\0")) {
    return { pathname: "/", query: new URLSearchParams(), error: 400 };
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(rawPath);
  } catch {
    return { pathname: "/", query: new URLSearchParams(), error: 400 };
  }
  if (pathname.includes("\\") || pathname.includes("\0") || pathname.startsWith("//")) {
    return { pathname: "/", query: new URLSearchParams(), error: 400 };
  }

  const segments = pathname.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return { pathname: "/", query: new URLSearchParams(), error: 400 };
  }
  return { pathname, query: new URLSearchParams(rawQuery) };
}

async function acceptReport(request: IncomingMessage, response: ServerResponse, records: TestPageReport[]): Promise<void> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    request.resume();
    send(response, 415, "content-type must be application/json", request.method);
    return;
  }

  const contentLength = Number(request.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > MAX_REPORT_BYTES) {
    request.resume();
    send(response, 413, "report body exceeds 64 KB", request.method);
    return;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  request.on("data", (chunk: Buffer | string) => {
    if (tooLarge) return;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_REPORT_BYTES) {
      tooLarge = true;
      chunks.length = 0;
      send(response, 413, "report body exceeds 64 KB", request.method);
      return;
    }
    chunks.push(buffer);
  });
  request.on("end", () => {
    if (tooLarge || response.writableEnded) return;
    let report: unknown;
    try {
      report = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      send(response, 400, "invalid JSON report", request.method);
      return;
    }
    if (!report || typeof report !== "object" || Array.isArray(report)) {
      send(response, 400, "report must be a JSON object", request.method);
      return;
    }

    records.push(report as TestPageReport);
    if (records.length > MAX_REPORTS) records.splice(0, records.length - MAX_REPORTS);
    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
  });
  request.on("error", () => {
    if (!response.writableEnded) send(response, 400, "could not read report body", request.method);
  });
}

async function serveStatic(pathname: string, response: ServerResponse, method: string, origins: TestPagesOrigins): Promise<void> {
  if (pathname === "/large.html") {
    const html = makeLargePage();
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-length": Buffer.byteLength(html),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.end(method === "HEAD" ? undefined : html);
    return;
  }

  const spaRoute = pathname === "/spa" || pathname.startsWith("/spa/");
  const relativePath = spaRoute ? "spa.html" : pathname === "/" ? "index.html" : pathname.slice(1);
  const roots = spaRoute ? [publicRoot] : [publicRoot, distRoot];

  for (const root of roots) {
    const result = await readStaticFile(root, relativePath);
    if (result.kind === "forbidden") {
      send(response, 403, "path outside fixture root", method);
      return;
    }
    if (result.kind === "file") {
      const body = isTextMime(contentTypeFor(relativePath))
        ? Buffer.from(replaceTokens(result.data.toString("utf8"), origins))
        : result.data;
      response.writeHead(200, {
        "content-type": contentTypeFor(relativePath),
        "content-length": body.byteLength,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(method === "HEAD" ? undefined : body);
      return;
    }
  }

  send(response, 404, "not found", method);
}

type StaticFileResult = { kind: "missing" } | { kind: "forbidden" } | { kind: "file"; data: Buffer };

async function readStaticFile(root: string, relativePath: string): Promise<StaticFileResult> {
  const rootParts = relativePath.split(/[\\/]/);
  if (rootParts.some((part) => part === ".." || part === ".") || path.isAbsolute(relativePath)) {
    return { kind: "forbidden" };
  }

  try {
    const canonicalRoot = await realpath(root);
    let candidate = path.resolve(canonicalRoot, ...rootParts);
    if (!isWithin(candidate, canonicalRoot)) return { kind: "forbidden" };
    let canonicalTarget = await realpath(candidate);
    if (!isWithin(canonicalTarget, canonicalRoot)) return { kind: "forbidden" };
    let targetStat = await stat(canonicalTarget);
    if (targetStat.isDirectory()) {
      candidate = path.join(canonicalTarget, "index.html");
      canonicalTarget = await realpath(candidate);
      if (!isWithin(canonicalTarget, canonicalRoot)) return { kind: "forbidden" };
      targetStat = await stat(canonicalTarget);
    }
    if (!targetStat.isFile()) return { kind: "missing" };
    return { kind: "file", data: await readFile(canonicalTarget) };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM") return { kind: "forbidden" };
    if (code === "ENOENT" || code === "ENOTDIR") return { kind: "missing" };
    throw error;
  }
}

function isWithin(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function replaceTokens(text: string, origins: TestPagesOrigins): string {
  return text.replaceAll("ALT_ORIGIN", origins.alternate).replaceAll("ORIGIN", origins.primary);
}

function makeLargePage(): string {
  const fields = Array.from({ length: 300 }, (_, index) => {
    const number = index + 1;
    return `<div><label for="field-${number}">Field ${number}</label><input id="field-${number}" name="field-${number}" type="text"></div>`;
  }).join("\n");
  const links = Array.from({ length: 60 }, (_, index) => {
    const number = index + 1;
    return `<a href="/large.html?link=${number}">Large page link ${number}</a>`;
  }).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Large form</title></head><body><main><h1>Large form</h1><form>${fields}</form><nav aria-label="Large page links">${links}</nav></main></body></html>`;
}

function contentTypeFor(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js":
    case ".mjs": return "text/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".gif": return "image/gif";
    case ".webp": return "image/webp";
    case ".ico": return "image/x-icon";
    case ".txt": return "text/plain; charset=utf-8";
    case ".wasm": return "application/wasm";
    default: return "application/octet-stream";
  }
}

function isTextMime(mime: string): boolean {
  return mime.startsWith("text/") || mime.startsWith("application/json") || mime.startsWith("application/javascript") || mime.startsWith("image/svg+xml");
}

function sendJson(response: ServerResponse, status: number, body: unknown, method?: string): void {
  const data = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": data.byteLength,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(method === "HEAD" ? undefined : data);
}

function send(response: ServerResponse, status: number, message: string, method?: string): void {
  const body = `${message}\n`;
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(method === "HEAD" ? undefined : body);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void startTestPages().then((server) => {
    process.stdout.write(`Test pages listening on ${server.origins.primary} and ${server.origins.alternate}\n`);
    const stop = () => void server.close().finally(() => process.exit(0));
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
