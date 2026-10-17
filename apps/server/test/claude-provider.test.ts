import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createClaudeProvider,
  InvalidClaudeOutputError,
  type RepairPatch,
} from "../src/brain/claude/provider";
import type {
  ClaudeRoleConfig,
  ClaudeRoleSession,
  ClaudeSdkAdapter,
} from "../src/brain/claude/session";

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function scriptedAdapter(options: {
  toolsFor?: (config: ClaudeRoleConfig) => string[];
  answer?: (config: ClaudeRoleConfig, prompt: string) => Promise<string>;
  onClose?: (config: ClaudeRoleConfig) => void;
} = {}) {
  const configs: ClaudeRoleConfig[] = [];
  const started: string[] = [];
  const closed: string[] = [];
  const adapter: ClaudeSdkAdapter = {
    createSession(config): ClaudeRoleSession {
      configs.push(config);
      return {
        async start() {
          started.push(config.role);
          return { tools: options.toolsFor?.(config) ?? [] };
        },
        call(prompt) {
          return options.answer?.(config, prompt) ?? Promise.resolve(
            config.role === "intent" ? '{"type":"describe"}' : '{"fields":[]}',
          );
        },
        abort() {},
        async close() {
          closed.push(config.role);
          options.onClose?.(config);
        },
      };
    },
  };
  return { adapter, configs, started, closed };
}

describe("Claude role provider", () => {
  let provider: Awaited<ReturnType<typeof createClaudeProvider>> | undefined;

  afterEach(async () => {
    await provider?.close();
    provider = undefined;
  });

  it("starts both roles with locked isolation settings, clean cwd, retained host env, and separate models", async () => {
    const f = scriptedAdapter();
    const tempDirs: string[] = [];
    provider = await createClaudeProvider({
      adapter: f.adapter,
      hostEnv: {
        PATH: "synthetic-host-path",
        USERPROFILE: "synthetic-user-profile",
        ANTHROPIC_API_KEY: "test-only-key-must-not-forward",
        EXTRA_HOST_SETTING: "retained",
      },
      createEmptyCwd: async () => {
        const cwd = await mkdtemp(join(tmpdir(), "blip-provider-test-"));
        tempDirs.push(cwd);
        return cwd;
      },
    });

    expect(f.started).toEqual(["intent", "repair"]);
    expect(f.configs).toHaveLength(2);
    for (const config of f.configs) {
      expect(config).toMatchObject({
        tools: [],
        disallowedTools: ["*"],
        settingSources: [],
        strictMcpConfig: true,
        mcpServers: {},
        permissionMode: "dontAsk",
      });
      expect(config.env).toMatchObject({
        PATH: "synthetic-host-path",
        USERPROFILE: "synthetic-user-profile",
        EXTRA_HOST_SETTING: "retained",
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
        ENABLE_CLAUDEAI_MCP_SERVERS: "false",
      });
      expect(config.env).not.toHaveProperty("ANTHROPIC_API_KEY");
      expect(await readdir(config.cwd)).toEqual([]);
    }
    expect(new Set(f.configs.map((config) => config.cwd)).size).toBe(2);
    expect(f.configs.map(({ role, model }) => [role, model])).toEqual([
      ["intent", "claude-haiku-5-5"],
      ["repair", "claude-sonnet-5-5"],
    ]);
    expect(await provider.parseIntent("safe serialized prompt")).toEqual({ type: "describe" });
    const patch: RepairPatch = await provider.repairFormModel("safe repair prompt");
    expect(patch).toEqual({ fields: [] });
    expect(tempDirs).toHaveLength(2);
  });

  it("rejects unexpected init tools and closes partial sessions before startup can complete", async () => {
    const f = scriptedAdapter({ toolsFor: (config) => config.role === "repair" ? ["Bash"] : [] });
    await expect(createClaudeProvider({ adapter: f.adapter })).rejects.toThrow(/expected no tools.*Bash/);
    expect(f.started).toEqual(["intent", "repair"]);
    expect(f.closed.sort()).toEqual(["intent", "repair"]);
  });

  it("aborts and recreates a role before accepting calls; late old-generation output is rejected", async () => {
    const calls: Array<Deferred<string>> = [];
    const f = scriptedAdapter({
      answer: () => {
        const result = deferred<string>();
        calls.push(result);
        return result.promise;
      },
    });
    provider = await createClaudeProvider({ adapter: f.adapter });

    const oldCall = provider.parseIntent("old generation");
    const oldOutcome = oldCall.then(() => "resolved", (error: Error) => error.message);
    await provider.abortRole("intent");
    await provider.recreateRole("intent");

    const newCall = provider.parseIntent("new generation");
    calls[1]!.resolve('{"type":"describe"}');
    await expect(newCall).resolves.toEqual({ type: "describe" });

    calls[0]!.resolve('{"type":"stop"}');
    await expect(oldOutcome).resolves.toMatch(/invalidated session generation/);
    expect(f.configs.filter((config) => config.role === "intent")).toHaveLength(2);
    expect(f.started).toEqual(["intent", "repair", "intent"]);
  });

  it("returns only parsed Intent or strict repair patch data", async () => {
    const f = scriptedAdapter({
      answer: (config) => Promise.resolve(config.role === "intent"
        ? '{"type":"request_action","actionId":"act1","approve":true}'
        : '{"fields":[],"snapshot":{"value":"forbidden"}}'),
    });
    provider = await createClaudeProvider({ adapter: f.adapter });

    await expect(provider.parseIntent("safe prompt")).rejects.toBeInstanceOf(InvalidClaudeOutputError);
    await expect(provider.repairFormModel("safe prompt")).rejects.toBeInstanceOf(InvalidClaudeOutputError);
  });
});
