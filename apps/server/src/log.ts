// Payload-free structured logger (V7, T-01-20, T-01-23).
//
// The field type has NO payload member, so logging a frame body, snapshot text or a field value is
// impossible by construction. Attacker-controlled strings (Origin, Host, frame id and type) are
// sanitized and truncated before they reach the sink (log injection).

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = {
  msg: string;
  role?: string;
  type?: string;
  id?: string;
  bytes?: number;
  code?: string | number;
  origin?: string;
  host?: string;
};

export type LogSink = (line: string) => void;

/** The only keys that can appear in a log line (the logging test asserts this set). */
export const LOG_KEYS = ["level", "msg", "role", "type", "id", "bytes", "code", "origin", "host"] as const;

/** Strip control characters and truncate an attacker-controlled string before logging it. */
export function sanitize(s: string, max = 200): string {
  const clean = s.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "");
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

const stderrSink: LogSink = (line) => {
  process.stderr.write(`${line}\n`);
};

let sink: LogSink = stderrSink;

/** Swap the sink (tests capture lines). Returns the previous sink so it can be restored. */
export function setLogSink(next: LogSink | undefined): LogSink {
  const prev = sink;
  sink = next ?? stderrSink;
  return prev;
}

const debugEnabled = (): boolean => process.env["BLIP_LOG"] === "debug";

export function log(level: LogLevel, fields: LogFields): void {
  const entry: Record<string, string | number> = { level, msg: sanitize(fields.msg) };
  if (fields.role !== undefined) entry["role"] = sanitize(fields.role, 32);
  if (fields.type !== undefined) entry["type"] = sanitize(fields.type, 64);
  if (fields.id !== undefined) entry["id"] = sanitize(fields.id, 64);
  if (fields.bytes !== undefined) entry["bytes"] = fields.bytes;
  if (fields.code !== undefined) entry["code"] = typeof fields.code === "string" ? sanitize(fields.code, 64) : fields.code;
  if (fields.origin !== undefined) entry["origin"] = sanitize(fields.origin);
  if (fields.host !== undefined) entry["host"] = sanitize(fields.host);
  // The default sink drops debug lines unless BLIP_LOG=debug; a custom sink sees everything.
  if (level === "debug" && sink === stderrSink && !debugEnabled()) return;
  sink(JSON.stringify(entry));
}
