/** Unique frame id. Uses the Web Crypto global, which exists in Node 24, browsers and MV3 workers. */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}
