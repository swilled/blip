import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { RepairPatchSchema, type RepairPatch } from "./repair-schema";

const CacheEntrySchema = z.object({
  version: z.literal(1),
  identity: z.string().regex(/^[a-f0-9]{64}$/),
  savedAt: z.number().int().nonnegative(),
  patch: RepairPatchSchema,
}).strict();

const DEFAULT_MAX_ENTRIES = 128;
const DEFAULT_MAX_BYTES = 1_048_576;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** A query- and fragment-independent key; the cleartext route is never written to disk. */
export function repairCacheIdentity(url: string, structuralHash: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.origin === "null" || structuralHash === "") return null;
    return digest(`${parsed.origin}\n${parsed.pathname}\n${structuralHash}`);
  } catch {
    return null;
  }
}

type CacheFile = { name: string; path: string; size: number; savedAt: number };

/** Small bounded disk cache for strict, value-free descriptive patches only. */
export class RepairCache {
  readonly #directory: string;
  readonly #maxEntries: number;
  readonly #maxBytes: number;
  readonly #now: () => number;

  constructor(options: {
    directory: string;
    maxEntries?: number;
    maxBytes?: number;
    now?: () => number;
  }) {
    this.#directory = options.directory;
    this.#maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.#maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.#now = options.now ?? Date.now;
    if (!Number.isSafeInteger(this.#maxEntries) || this.#maxEntries < 1) {
      throw new RangeError("maxEntries must be a positive safe integer");
    }
    if (!Number.isSafeInteger(this.#maxBytes) || this.#maxBytes < 1) {
      throw new RangeError("maxBytes must be a positive safe integer");
    }
    mkdirSync(this.#directory, { recursive: true, mode: 0o700 });
  }

  load(url: string, structuralHash: string): RepairPatch | null {
    const identity = repairCacheIdentity(url, structuralHash);
    if (identity === null) return null;
    const path = join(this.#directory, `${identity}.json`);
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      return null;
    }

    try {
      const parsed = CacheEntrySchema.safeParse(JSON.parse(raw) as unknown);
      if (!parsed.success || parsed.data.identity !== identity) {
        unlinkSync(path);
        return null;
      }
      return parsed.data.patch;
    } catch {
      try { unlinkSync(path); } catch { /* A concurrent prune may already have removed it. */ }
      return null;
    }
  }

  /** Atomically replace one entry, then evict oldest entries by timestamp and filename. */
  save(url: string, structuralHash: string, patchValue: unknown): boolean {
    const identity = repairCacheIdentity(url, structuralHash);
    const parsed = RepairPatchSchema.safeParse(patchValue);
    if (identity === null || !parsed.success) return false;

    const entry = { version: 1 as const, identity, savedAt: Math.max(0, Math.floor(this.#now())), patch: parsed.data };
    const contents = JSON.stringify(entry);
    const target = join(this.#directory, `${identity}.json`);
    const temp = join(this.#directory, `.${identity}.${randomUUID()}.tmp`);
    try {
      writeFileSync(temp, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
      renameSync(temp, target);
      this.#evict();
      return true;
    } catch {
      try { unlinkSync(temp); } catch { /* The temp was already renamed or never created. */ }
      return false;
    }
  }

  #evict(): void {
    let entries: CacheFile[];
    try {
      entries = readdirSync(this.#directory)
        .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
        .map((name) => {
          const path = join(this.#directory, name);
          const size = statSync(path).size;
          let savedAt = 0;
          try {
            const parsed = CacheEntrySchema.safeParse(JSON.parse(readFileSync(path, "utf8")) as unknown);
            if (parsed.success) savedAt = parsed.data.savedAt;
          } catch { /* Invalid entries sort first and are removed when bounds require it. */ }
          return { name, path, size, savedAt };
        })
        .sort((a, b) => a.savedAt - b.savedAt || a.name.localeCompare(b.name));
    } catch {
      return;
    }

    let totalBytes = entries.reduce((total, entry) => total + entry.size, 0);
    while (entries.length > this.#maxEntries || totalBytes > this.#maxBytes) {
      const oldest = entries.shift();
      if (oldest === undefined) break;
      try { unlinkSync(oldest.path); } catch { /* Best-effort bounded cleanup. */ }
      totalBytes -= oldest.size;
    }
  }
}
