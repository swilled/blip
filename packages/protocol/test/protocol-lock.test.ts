import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ActionKind, DialogueStateName, Intent, LabelSource, MESSAGES, PROTOCOL_VERSION, RawLabelSource } from "../src/index";

// D-17 made mechanical: after M0 the contract grows additively only. The lock lists the frozen v1
// surface; anything in the lock must still exist unchanged. Things absent from the lock are fine.

interface Lock {
  protocolVersion: number;
  messages: Record<string, { senders: string[]; receivers: string[] }>;
  intents: string[];
  actionKinds: string[];
  dialogueStates: string[];
  labelSources: { raw: string[]; resolved: string[] };
  fixtures: string[];
}

type Registry = Record<string, { senders: readonly string[]; receivers: readonly string[] }>;

const same = (a: readonly string[], b: readonly string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** Everything in the lock that the live contract no longer satisfies. Empty means additive-only. */
export function lockViolations(lock: Lock, registry: Registry, live: {
  intents: string[];
  actionKinds: string[];
  dialogueStates: string[];
  rawLabelSources: string[];
  resolvedLabelSources: string[];
}): string[] {
  const out: string[] = [];
  for (const [type, entry] of Object.entries(lock.messages)) {
    const now = registry[type];
    if (!now) out.push(`message type removed: ${type}`);
    else {
      if (!same(now.senders, entry.senders)) out.push(`senders changed: ${type}`);
      if (!same(now.receivers, entry.receivers)) out.push(`receivers changed: ${type}`);
    }
  }
  for (const i of lock.intents) if (!live.intents.includes(i)) out.push(`intent removed: ${i}`);
  for (const k of lock.actionKinds) if (!live.actionKinds.includes(k)) out.push(`action kind removed: ${k}`);
  for (const s of lock.dialogueStates) if (!live.dialogueStates.includes(s)) out.push(`dialogue state removed: ${s}`);
  for (const s of lock.labelSources.raw) if (!live.rawLabelSources.includes(s)) out.push(`raw label source removed: ${s}`);
  for (const s of lock.labelSources.resolved) if (!live.resolvedLabelSources.includes(s)) out.push(`resolved label source removed: ${s}`);
  return out;
}

/** Problems with the machine-readable approval line. Empty means exactly one well-formed line. */
export function approvalProblems(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/).filter((l) => l.startsWith("M0 approval:"));
  if (lines.length === 0) return ["M0 approval line missing"];
  if (lines.length > 1) return ["M0 approval line duplicated"];
  const ok = /^M0 approval: (pending|received \(\S[^)]*\))$/.test(lines[0]!);
  return ok ? [] : [`M0 approval line malformed: ${lines[0]}`];
}

const root = new URL("../", import.meta.url);
const lock = JSON.parse(readFileSync(new URL("protocol.lock.json", root), "utf8")) as Lock;
const protocolMd = readFileSync(new URL("../../PROTOCOL.md", root), "utf8");
const live = {
  intents: Intent.options.map((o) => o.shape.type.value as string),
  actionKinds: [...ActionKind.options] as string[],
  dialogueStates: [...DialogueStateName.options] as string[],
  rawLabelSources: [...RawLabelSource.options] as string[],
  resolvedLabelSources: [...LabelSource.options] as string[],
};

describe("protocol.lock.json (additive-only freeze)", () => {
  it("lists all 25 message types and matches the live registry", () => {
    expect(Object.keys(lock.messages)).toHaveLength(25);
    expect(lockViolations(lock, MESSAGES, live)).toEqual([]);
  });

  it("protocolVersion equals PROTOCOL_VERSION", () => {
    expect(lock.protocolVersion).toBe(PROTOCOL_VERSION);
  });

  it("locks raw and resolved label source membership independently", () => {
    expect(lock.labelSources.raw).toEqual(RawLabelSource.options);
    expect(lock.labelSources.raw).not.toContain("model");
    expect(lock.labelSources.resolved).toEqual(LabelSource.options);
    expect(lock.labelSources.resolved).toContain("model");
    expect(lockViolations(lock, MESSAGES, {
      ...live,
      rawLabelSources: live.rawLabelSources.slice(1),
    })).toContain("raw label source removed: aria");
    expect(lockViolations(lock, MESSAGES, {
      ...live,
      resolvedLabelSources: live.resolvedLabelSources.filter((source) => source !== "model"),
    })).toContain("resolved label source removed: model");
  });

  it("every locked fixture file exists on disk", () => {
    expect(lock.fixtures.length).toBe(5);
    for (const f of lock.fixtures) expect(existsSync(new URL(`fixtures/${f}`, root)), f).toBe(true);
  });

  it("allows additive growth: a new type or member not in the lock passes", () => {
    const grown: Registry = { ...MESSAGES, "future.thing": { senders: ["server"], receivers: ["voice"] } };
    expect(lockViolations(lock, grown, { ...live, intents: [...live.intents, "future"] })).toEqual([]);
  });

  it("fails when a locked type is removed", () => {
    const { speak: _removed, ...rest } = MESSAGES;
    expect(lockViolations(lock, rest, live)).toContain("message type removed: speak");
  });

  it("fails when a locked message's senders or receivers change", () => {
    const changedSender: Registry = { ...MESSAGES, utterance: { senders: ["voice", "extension"], receivers: ["server"] } };
    expect(lockViolations(lock, changedSender, live)).toContain("senders changed: utterance");
    const changedReceiver: Registry = { ...MESSAGES, speak: { senders: ["server"], receivers: ["voice", "extension"] } };
    expect(lockViolations(lock, changedReceiver, live)).toContain("receivers changed: speak");
  });

  it("fails when a locked intent, action kind or dialogue state is removed", () => {
    expect(lockViolations(lock, MESSAGES, { ...live, intents: live.intents.slice(1) })).toHaveLength(1);
    expect(lockViolations(lock, MESSAGES, { ...live, actionKinds: live.actionKinds.slice(1) })).toHaveLength(1);
    expect(lockViolations(lock, MESSAGES, { ...live, dialogueStates: live.dialogueStates.slice(1) })).toHaveLength(1);
  });
});

describe("PROTOCOL.md freeze status", () => {
  it("carries the FROZEN v1 (M0) status line", () => {
    expect(protocolMd.split(/\r?\n/)).toContain("Status: FROZEN v1 (M0)");
  });

  it("has exactly one well-formed M0 approval line (pending or received with a location)", () => {
    expect(approvalProblems(protocolMd)).toEqual([]);
  });

  it("rejects a missing, duplicated or malformed approval line", () => {
    expect(approvalProblems("# doc\n")).toEqual(["M0 approval line missing"]);
    expect(approvalProblems("M0 approval: pending\nM0 approval: pending\n")).toEqual(["M0 approval line duplicated"]);
    expect(approvalProblems("M0 approval: received\n")).toHaveLength(1);
    expect(approvalProblems("M0 approval: received ()\n")).toHaveLength(1);
    expect(approvalProblems("M0 approval: maybe\n")).toHaveLength(1);
    expect(approvalProblems("M0 approval: pending\n")).toEqual([]);
    expect(approvalProblems("M0 approval: received (PR #1 review by voice dev)\n")).toEqual([]);
  });
});
