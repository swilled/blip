// Pure Host / Origin guard (D-03, research Pitfall 12). No sockets, so it is unit tested directly.
import { extensionOrigin, LOOPBACK_HOST, type Role } from "@blip/protocol";

/**
 * DNS-rebinding defence: only `127.0.0.1:<port>` (and `localhost:<port>` under dev) is a valid Host.
 * Case-insensitive, port must match exactly. A missing Host header is refused.
 */
export function hostAllowed(hostHeader: string | undefined, port: number, dev: boolean): boolean {
  if (hostHeader === undefined) return false;
  const host = hostHeader.toLowerCase();
  if (host === `${LOOPBACK_HOST}:${port}`) return true;
  return dev && host === `localhost:${port}`;
}

/** Extra voice origins granted under --dev: the page served by the hub itself and the default Vite ports. */
export function devVoiceOrigins(port: number): string[] {
  return [`http://localhost:${port}`, "http://127.0.0.1:5173", "http://localhost:5173"];
}

const LOOPBACK_HTTP_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost):([0-9]{1,5})$/;

/**
 * Validates a user-supplied `--allow-origin` value: an exact loopback http origin, no path, no trailing
 * slash. Throws a clear error otherwise (T-01-24). Returns the origin unchanged.
 */
export function parseAllowedOrigin(s: string): string {
  const m = LOOPBACK_HTTP_ORIGIN.exec(s);
  const port = m?.[1] === undefined ? NaN : Number(m[1]);
  if (!m || !(port >= 1 && port <= 65535)) {
    throw new Error(
      `invalid allowed origin "${s}": expected an exact loopback http origin like http://localhost:5173 (no path, no trailing slash)`,
    );
  }
  return s;
}

export type OriginRules = {
  extId: string;
  port: number;
  dev: boolean;
  extraVoice: readonly string[];
};

/**
 * Which roles may a connection with this Origin claim? Exact string match only.
 * `[]` means the upgrade is refused. Extra origins never grant the extension role.
 */
export function rolesForOrigin(origin: string | undefined, rules: OriginRules): Role[] {
  if (origin === undefined) return rules.dev ? ["extension", "voice"] : [];
  if (origin === extensionOrigin(rules.extId)) return ["extension"];
  if (origin === `http://${LOOPBACK_HOST}:${rules.port}`) return ["voice"];
  if (rules.dev && (devVoiceOrigins(rules.port).includes(origin) || rules.extraVoice.includes(origin))) {
    return ["voice"];
  }
  return [];
}
