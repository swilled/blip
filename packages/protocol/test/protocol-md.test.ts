import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLOSE_CODES, ERROR_CODES, MESSAGES, extensionOrigin, type MessageType } from "../src/index";

// D-18: PROTOCOL.md and the registry must not drift. Every table whose header's first cell is
// `type` lists registry types; other tables (origins, close codes, error codes) start with a
// different header cell and are ignored here.

const here = dirname(fileURLToPath(import.meta.url));
const PROTOCOL_MD = resolve(here, "../../../PROTOCOL.md");

type Row = { type: string; from: string[]; to: string[] };

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function roles(cell: string): string[] {
  return cell
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

export function parseTypeTables(markdown: string): Row[] {
  const lines = markdown.split(/\r?\n/);
  const rows: Row[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trimStart().startsWith("|")) continue;
    const header = cells(line);
    // A table starts where the previous line is not a table row.
    const prev = i > 0 ? lines[i - 1]! : "";
    if (prev.trimStart().startsWith("|")) continue;
    if (header[0] !== "type") continue;
    const fromIdx = header.indexOf("from");
    const toIdx = header.indexOf("to");
    expect(fromIdx, "type table needs a `from` column").toBeGreaterThan(0);
    expect(toIdx, "type table needs a `to` column").toBeGreaterThan(0);
    for (let j = i + 2; j < lines.length && lines[j]!.trimStart().startsWith("|"); j++) {
      const row = cells(lines[j]!);
      const m = /^`([^`]+)`$/.exec(row[0] ?? "");
      expect(m, `first cell must be a backticked type: ${row[0]}`).not.toBeNull();
      rows.push({ type: m![1]!, from: roles(row[fromIdx]!), to: roles(row[toIdx]!) });
    }
  }
  return rows;
}

const rows = parseTypeTables(readFileSync(PROTOCOL_MD, "utf8"));
const registryTypes = Object.keys(MESSAGES) as MessageType[];

describe("PROTOCOL.md matches the registry (D-18)", () => {
  it("documents every registry type", () => {
    const documented = new Set(rows.map((r) => r.type));
    const missing = registryTypes.filter((t) => !documented.has(t));
    expect(missing, `type exists in registry but not in PROTOCOL.md: ${missing.join(", ")}`).toEqual([]);
  });

  it("documents no type that is not in the registry", () => {
    const extra = rows.map((r) => r.type).filter((t) => !Object.hasOwn(MESSAGES, t));
    expect(extra, `type exists in PROTOCOL.md but not in registry: ${extra.join(", ")}`).toEqual([]);
  });

  it("lists each type exactly once", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const r of rows) {
      if (seen.has(r.type)) dupes.push(r.type);
      seen.add(r.type);
    }
    expect(dupes, `types listed more than once: ${dupes.join(", ")}`).toEqual([]);
  });

  it("names the pinned extension origin, every error code and every close code", () => {
    const md = readFileSync(PROTOCOL_MD, "utf8");
    expect(md).toContain(extensionOrigin());
    for (const code of ERROR_CODES) expect(md, `error code ${code}`).toContain(`| ${code} |`);
    for (const code of Object.values(CLOSE_CODES)) expect(md, `close code ${code}`).toContain(`| ${code} |`);
  });

  it("has from and to columns equal to the registry senders and receivers", () => {
    for (const r of rows) {
      if (!Object.hasOwn(MESSAGES, r.type)) continue;
      const entry = MESSAGES[r.type as MessageType];
      expect([...r.from].sort(), `${r.type} from`).toEqual([...entry.senders].sort());
      expect([...r.to].sort(), `${r.type} to`).toEqual([...entry.receivers].sort());
    }
  });
});
