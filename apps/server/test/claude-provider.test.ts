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
  toolsFor?: (config: ClaudeRoleConfig) => unknown;
  answer?: (config: ClaudeRoleConfig, prompt: string) => Promise<string>;
  bootstrapAnswer?: (config: ClaudeRoleConfig, prompt: string) => Promise<string>;
  onClose?: (config: ClaudeRoleConfig) => void;
} = {}) {
  const configs: ClaudeRoleConfig[] = [];
  const started: string[] = [];
  const closed: string[] = [];
  const calls: Array<{ role: string; prompt: string }> = [];
  const adapter: ClaudeSdkAdapter = {
    createSession(config): ClaudeRoleSession {
      configs.push(config);
      let callNumber = 0;
      return {
        async start() {
          started.push(config.role);
          return { tools: options.toolsFor === undefined ? [] : options.toolsFor(config) };
        },
        call(prompt) {
          calls.push({ role: config.role, prompt });
          callNumber += 1;
          if (callNumber === 1) {
            return options.bootstrapAnswer?.(config, prompt) ?? Promise.resolve(
              config.role === "intent"
                ? '{"type":"describe"}'
                : '{"fields":[{"id":"bootstrap-field","label":"Synthetic field","confidence":0.5}]}',
            );
          }
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
  return { adapter, configs, started, closed, calls };
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
    const bootstrapDispatches: string[] = [];
    provider = await createClaudeProvider({
      adapter: f.adapter,
      beforeBootstrapDispatch: (role) => bootstrapDispatches.push(role),
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
    expect(f.calls.slice(0, 2).map(({ role }) => role)).toEqual(["intent", "repair"]);
    expect(bootstrapDispatches).toEqual(["intent", "repair"]);
    expect(f.calls[0]!.prompt).toContain('User request as JSON string: "Describe the synthetic empty form."');
    expect(f.calls[0]!.prompt).toContain('"f":[],"a":[]');
    expect(f.calls[0]!.prompt).not.toContain("safe serialized prompt");
    expect(f.calls[1]!.prompt).toContain('"i":"bootstrap-field"');
    expect(f.calls[1]!.prompt).not.toContain("safe repair prompt");
    expect(await provider.parseIntent("safe serialized prompt")).toEqual({ type: "describe" });
    const patch: RepairPatch = await provider.repairFormModel("safe repair prompt");
    expect(patch).toEqual({ fields: [] });
    expect(f.calls.slice(2).map(({ role }) => role)).toEqual(["intent", "repair"]);
    expect(tempDirs).toHaveLength(2);
  });

  it("requires a strict, harmless schema-valid synthetic result for each role bootstrap", async () => {
    const intent = scriptedAdapter({
      bootstrapAnswer: (config) => Promise.resolve(config.role === "intent"
        ? '{"type":"describe","text":"must be rejected"}'
        : '{"fields":[{"id":"bootstrap-field","label":"Synthetic field","confidence":0.5}]}'),
    });
    const intentOutcome = await createClaudeProvider({ adapter: intent.adapter }).then(() => null, (error: unknown) => error);
    expect(intentOutcome).toMatchObject({ name: "Error", message: "Claude synthetic intent bootstrap result was rejected." });
    expect(intent.closed).toContain("intent");
    expect(intent.calls).toHaveLength(1);

    const repair = scriptedAdapter({
      bootstrapAnswer: (config) => Promise.resolve(config.role === "repair"
        ? '{"fields":[{"id":"not-the-synthetic-id","label":"Synthetic field"}]}'
        : '{"type":"describe"}'),
    });
    const repairOutcome = await createClaudeProvider({ adapter: repair.adapter }).then(() => null, (error: unknown) => error);
    expect(repairOutcome).toMatchObject({ name: "Error", message: "Claude synthetic repair bootstrap result was rejected." });
    expect(repair.closed.sort()).toEqual(["intent", "repair"]);
    expect(repair.calls.map(({ role }) => role)).toEqual(["intent", "repair"]);
    expect((repairOutcome as Error).message).not.toContain("not-the-synthetic-id");
  });

  it("requires repair bootstrap output to validate the exact eligible synthetic field", async () => {
    const f = scriptedAdapter({
      bootstrapAnswer: (config) => Promise.resolve(config.role === "repair"
        ? '{"title":"Synthetic title only","fields":[]}'
        : '{"type":"describe"}'),
    });
    await expect(createClaudeProvider({ adapter: f.adapter })).rejects.toThrow(
      "Claude synthetic repair bootstrap result was rejected.",
    );
    expect(f.calls.map(({ role }) => role)).toEqual(["intent", "repair"]);
  });

  it("waits for both bootstrap terminal results before returning the provider", async () => {
    const firstSent = deferred<void>();
    const secondSent = deferred<void>();
    const firstResult = deferred<string>();
    const secondResult = deferred<string>();
    const calls: Array<{ role: string; prompt: string }> = [];
    const adapter: ClaudeSdkAdapter = {
      createSession(config): ClaudeRoleSession {
        let firstCall = true;
        return {
          async start() { return { tools: [] }; },
          call(prompt) {
            calls.push({ role: config.role, prompt });
            if (firstCall) {
              firstCall = false;
              if (config.role === "intent") firstSent.resolve();
              else secondSent.resolve();
              return config.role === "intent" ? firstResult.promise : secondResult.promise;
            }
            return Promise.resolve('{"type":"describe"}');
          },
          abort() {},
          async close() {},
        };
      },
    };
    let providerReady = false;
    const creating = createClaudeProvider({ adapter }).then((created) => {
      providerReady = true;
      return created;
    });

    await firstSent.promise;
    expect(providerReady).toBe(false);
    expect(calls.map(({ role }) => role)).toEqual(["intent"]);
    firstResult.resolve('{"type":"describe"}');
    await secondSent.promise;
    expect(providerReady).toBe(false);
    expect(calls.map(({ role }) => role)).toEqual(["intent", "repair"]);
    secondResult.resolve('{"fields":[{"id":"bootstrap-field","label":"Synthetic field"}]}');
    provider = await creating;
    expect(providerReady).toBe(true);
    expect(calls).toHaveLength(2);
    await provider.parseIntent("ordinary request only after both gates");
    expect(calls[2]!.prompt).toContain("ordinary request only after both gates");
  });

  it("rejects unexpected init tools and closes partial sessions before startup can complete", async () => {
    const f = scriptedAdapter({ toolsFor: (config) => config.role === "repair" ? ["Bash"] : [] });
    const outcome = await createClaudeProvider({ adapter: f.adapter }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(outcome).toMatchObject({
      name: "UnexpectedClaudeToolsError",
      role: "repair",
      toolCount: 1,
      invalidToolList: false,
    });
    expect(outcome).toHaveProperty("message", "Claude SDK startup refused for repair: expected no tools, received 1.");
    expect((outcome as Error).message).not.toContain("Bash");
    expect(f.started).toEqual(["intent", "repair"]);
    expect(f.closed.sort()).toEqual(["intent", "repair"]);
    expect(f.calls.map(({ role }) => role)).toEqual(["intent", "repair"]);
  });

  it("rejects a malformed init tool list without exposing its contents", async () => {
    const f = scriptedAdapter({ toolsFor: () => ({ candidate: "sensitive-tool-name" }) });
    const outcome = await createClaudeProvider({ adapter: f.adapter }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(outcome).toMatchObject({
      name: "UnexpectedClaudeToolsError",
      role: "intent",
      toolCount: null,
      invalidToolList: true,
    });
    expect((outcome as Error).message).toBe("Claude SDK startup refused for intent: init tool list was invalid.");
    expect((outcome as Error).message).not.toContain("sensitive-tool-name");
    expect(f.closed).toContain("intent");
    expect(f.calls.map(({ role }) => role)).toEqual(["intent"]);
  });

  it("aborts and closes an SDK role whose startup reaches the deadline", async () => {
    const controller = new AbortController();
    const started = deferred<void>();
    let rejectInit!: (error: Error) => void;
    let aborted = false;
    let closed = false;
    const adapter: ClaudeSdkAdapter = {
      createSession(): ClaudeRoleSession {
        return {
          start() {
            started.resolve();
            return new Promise((_, reject) => { rejectInit = reject; });
          },
          async call() { return "{}"; },
          abort() {
            aborted = true;
            rejectInit(new Error("startup aborted"));
          },
          async close() { closed = true; },
        };
      },
    };
    const creating = createClaudeProvider({ adapter, startupSignal: controller.signal });

    await started.promise;
    controller.abort(new Error("startup deadline"));
    await expect(creating).rejects.toThrow("startup aborted");
    expect(aborted).toBe(true);
    expect(closed).toBe(true);
  });

  it("settles provider startup when the owner aborts even if session start stays pending", async () => {
    const controller = new AbortController();
    const started = deferred<void>();
    let aborted = false;
    let closed = false;
    const adapter: ClaudeSdkAdapter = {
      createSession(): ClaudeRoleSession {
        return {
          start() {
            started.resolve();
            return new Promise(() => {});
          },
          async call() { return "{}"; },
          abort() { aborted = true; },
          async close() { closed = true; },
        };
      },
    };
    const creating = createClaudeProvider({ adapter, hostEnv: {}, startupSignal: controller.signal });

    await started.promise;
    controller.abort(new Error("startup deadline"));
    await expect(creating).rejects.toThrow("startup deadline");
    expect(aborted).toBe(true);
    expect(closed).toBe(true);
  });

  it("settles and cleans up when the owner aborts a pending bootstrap result", async () => {
    const controller = new AbortController();
    const bootstrapSent = deferred<void>();
    let aborted = false;
    let closed = false;
    const adapter: ClaudeSdkAdapter = {
      createSession(): ClaudeRoleSession {
        return {
          async start() { return { tools: [] }; },
          call() {
            bootstrapSent.resolve();
            return new Promise(() => {});
          },
          abort() { aborted = true; },
          async close() { closed = true; },
        };
      },
    };
    const creating = createClaudeProvider({ adapter, hostEnv: {}, startupSignal: controller.signal });

    await bootstrapSent.promise;
    controller.abort(new Error("startup bootstrap deadline"));
    await expect(creating).rejects.toThrow("startup bootstrap deadline");
    expect(aborted).toBe(true);
    expect(closed).toBe(true);
  });

  it("calls the bootstrap accounting gate before queueing any synthetic operation", async () => {
    const f = scriptedAdapter();
    await expect(createClaudeProvider({
      adapter: f.adapter,
      beforeBootstrapDispatch: () => { throw new Error("bootstrap dispatch cap reached"); },
    })).rejects.toThrow("bootstrap dispatch cap reached");
    expect(f.calls).toHaveLength(0);
    expect(f.closed).toContain("intent");
  });

  it("aborts and recreates a role before accepting calls; late old-generation output is rejected", async () => {
    const calls: Array<Deferred<string>> = [];
    const bootstrapDispatches: string[] = [];
    const f = scriptedAdapter({
      answer: () => {
        const result = deferred<string>();
        calls.push(result);
        return result.promise;
      },
    });
    provider = await createClaudeProvider({
      adapter: f.adapter,
      beforeBootstrapDispatch: (role) => bootstrapDispatches.push(role),
    });

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
    expect(f.calls.filter(({ role, prompt }) => role === "intent" && prompt.includes("Describe the synthetic empty form.")).length).toBe(2);
    expect(bootstrapDispatches).toEqual(["intent", "repair", "intent"]);
    await expect(provider.recreateRole("intent")).rejects.toThrow("bootstrap dispatch cap");
    expect(f.configs.filter((config) => config.role === "intent")).toHaveLength(2);
    await expect(provider.recreateRole("repair")).rejects.toThrow("bootstrap dispatch cap");
    expect(f.configs.filter((config) => config.role === "repair")).toHaveLength(1);
    expect(bootstrapDispatches).toEqual(["intent", "repair", "intent"]);
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
