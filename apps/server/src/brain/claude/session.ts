import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ClaudeRole = "intent" | "repair";

export type ClaudeRoleConfig = {
  role: ClaudeRole;
  model: string;
  /** A newly-created, empty directory used as the SDK working directory. */
  cwd: string;
  env: Record<string, string | undefined>;
  tools: [];
  disallowedTools: ["*"];
  settingSources: [];
  strictMcpConfig: true;
  mcpServers: Record<string, never>;
  permissionMode: "dontAsk";
};

export type ClaudeRoleSession = {
  /** Starts the SDK process and resolves with the `system/init` tool list. */
  start(): Promise<{ tools: string[] }>;
  /** Sends one JSON-only user prompt on the role's persistent streaming session. */
  call(prompt: string, signal?: AbortSignal): Promise<string>;
  /** Aborts the active turn and its subprocess/session. */
  abort(): void;
  /** Closes the subprocess/session and releases its input/output resources. */
  close(): Promise<void>;
};

export type ClaudeSdkAdapter = {
  createSession(config: ClaudeRoleConfig): Promise<ClaudeRoleSession> | ClaudeRoleSession;
};

export type ClaudeSessionOptions = {
  adapter?: ClaudeSdkAdapter;
  hostEnv?: Record<string, string | undefined>;
  createEmptyCwd?: () => Promise<string>;
};

export const INTENT_MODEL = "claude-haiku-5-5";
export const REPAIR_MODEL = "claude-sonnet-5-5";

const createEmptyCwd = async (): Promise<string> => mkdtemp(join(tmpdir(), "blip-claude-"));

/** Copy the host environment required to find the signed-in CLI, but never allow API-key precedence. */
export function buildRoleConfig(
  role: ClaudeRole,
  cwd: string,
  hostEnv: Record<string, string | undefined> = process.env,
): ClaudeRoleConfig {
  const env = { ...hostEnv };
  delete env.ANTHROPIC_API_KEY;
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
  env.ENABLE_CLAUDEAI_MCP_SERVERS = "false";

  return {
    role,
    model: role === "intent" ? INTENT_MODEL : REPAIR_MODEL,
    cwd,
    env,
    tools: [],
    disallowedTools: ["*"],
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: {},
    permissionMode: "dontAsk",
  };
}

export class UnexpectedClaudeToolsError extends Error {
  constructor(tools: string[]) {
    super(`Claude SDK startup refused: expected no tools, received ${tools.length ? tools.join(", ") : "an invalid tool list"}.`);
    this.name = "UnexpectedClaudeToolsError";
  }
}

export class ClaudeRoleSessionManager {
  #adapter: ClaudeSdkAdapter;
  #hostEnv: Record<string, string | undefined>;
  #createCwd: () => Promise<string>;
  #roles = new Map<ClaudeRole, RoleGeneration>();
  #generationCounter = 0;
  #closed = false;

  constructor(options: ClaudeSessionOptions = {}) {
    this.#adapter = options.adapter ?? createSdkAdapter();
    this.#hostEnv = options.hostEnv ?? process.env;
    this.#createCwd = options.createEmptyCwd ?? createEmptyCwd;
  }

  async start(): Promise<void> {
    if (this.#closed) throw new Error("Claude provider is closed.");
    try {
      // Start each role in sequence so a refusal can close an already-started role deterministically.
      await this.#openRole("intent");
      await this.#openRole("repair");
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async call(role: ClaudeRole, prompt: string, signal?: AbortSignal): Promise<string> {
    if (this.#closed) throw new Error("Claude provider is closed.");
    const generation = this.#roles.get(role);
    if (generation === undefined || !generation.valid) {
      throw new Error(`Claude ${role} role is unavailable; recreate it before the next call.`);
    }
    if (generation.active) throw new Error(`Claude ${role} role already has an active call.`);

    const active = { generation: generation.id };
    generation.active = active;
    try {
      const result = await generation.session.call(prompt, signal);
      if (!generation.valid || this.#roles.get(role) !== generation || generation.id !== active.generation) {
        throw new Error(`Claude ${role} result belongs to an invalidated session generation.`);
      }
      return result;
    } finally {
      if (generation.active === active) generation.active = null;
    }
  }

  async abortRole(role: ClaudeRole): Promise<void> {
    const generation = this.#roles.get(role);
    if (generation === undefined || !generation.valid) return;
    generation.valid = false;
    generation.session.abort();
  }

  async recreateRole(role: ClaudeRole): Promise<void> {
    if (this.#closed) throw new Error("Claude provider is closed.");
    const prior = this.#roles.get(role);
    if (prior !== undefined) {
      prior.valid = false;
      prior.session.abort();
      await this.#disposeGeneration(prior);
      if (this.#roles.get(role) === prior) this.#roles.delete(role);
    }
    await this.#openRole(role);
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const roles = [...this.#roles.values()];
    this.#roles.clear();
    for (const generation of roles) {
      generation.valid = false;
      generation.session.abort();
    }
    await Promise.all(roles.map((generation) => this.#disposeGeneration(generation)));
  }

  async #openRole(role: ClaudeRole): Promise<void> {
    const cwd = await this.#createCwd();
    const session = await this.#adapter.createSession(buildRoleConfig(role, cwd, this.#hostEnv));
    const generation: RoleGeneration = {
      id: ++this.#generationCounter,
      cwd,
      session,
      valid: true,
      active: null,
    };
    this.#roles.set(role, generation);
    try {
      const init = await session.start();
      if (!Array.isArray(init.tools) || init.tools.length !== 0) {
        throw new UnexpectedClaudeToolsError(Array.isArray(init.tools) ? init.tools : []);
      }
      // The SDK must not inherit a repo/profile working directory or leave config files in its cwd.
      const entries = await readdir(cwd);
      if (entries.length !== 0) throw new Error("Claude SDK working directory was not empty at startup.");
    } catch (error) {
      generation.valid = false;
      await this.#disposeGeneration(generation);
      if (this.#roles.get(role) === generation) this.#roles.delete(role);
      throw error;
    }
  }

  async #disposeGeneration(generation: RoleGeneration): Promise<void> {
    await generation.session.close().catch(() => {});
    await rm(generation.cwd, { recursive: true, force: true }).catch(() => {});
  }
}

type RoleGeneration = {
  id: number;
  cwd: string;
  session: ClaudeRoleSession;
  valid: boolean;
  active: { generation: number } | null;
};

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

class AsyncQueue<T> implements AsyncIterable<T> {
  #values: T[] = [];
  #waiters: Array<Deferred<IteratorResult<T>>> = [];
  #ended = false;

  push(value: T): void {
    if (this.#ended) throw new Error("Claude SDK input stream is closed.");
    const waiter = this.#waiters.shift();
    if (waiter) waiter.resolve({ done: false, value });
    else this.#values.push(value);
  }

  end(): void {
    this.#ended = true;
    for (const waiter of this.#waiters.splice(0)) waiter.resolve({ done: true, value: undefined });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const value = this.#values.shift();
        if (value !== undefined) return Promise.resolve({ done: false, value });
        if (this.#ended) return Promise.resolve({ done: true, value: undefined });
        const waiter = deferred<IteratorResult<T>>();
        this.#waiters.push(waiter);
        return waiter.promise;
      },
    };
  }
}

type SdkUserMessage = {
  type: "user";
  message: { role: "user"; content: string };
  parent_tool_use_id: null;
  client_composed: true;
};

type SdkOutputMessage =
  | { type: "system"; subtype: "init"; tools?: unknown }
  | { type: "result"; subtype: string; result?: string; is_error?: boolean };

/** Real SDK adapter. Imported only for `--brain=claude`; tests inject a fake at this boundary. */
function createSdkAdapter(): ClaudeSdkAdapter {
  return {
    async createSession(config) {
      const sdk = await import("@anthropic-ai/claude-agent-sdk");
      const input = new AsyncQueue<SdkUserMessage>();
      const controller = new AbortController();
      const init = deferred<{ tools: string[] }>();
      const pendingState: { current: Deferred<string> | null } = { current: null };
      let closed = false;
      const query = sdk.query({
        prompt: input,
        options: {
          cwd: config.cwd,
          env: config.env,
          model: config.model,
          tools: config.tools,
          disallowedTools: config.disallowedTools,
          settingSources: config.settingSources,
          strictMcpConfig: config.strictMcpConfig,
          mcpServers: config.mcpServers,
          permissionMode: config.permissionMode,
          abortController: controller,
        },
      });

      const pump = (async () => {
        try {
          for await (const message of query as AsyncIterable<SdkOutputMessage>) {
            if (message.type === "system" && message.subtype === "init") {
              init.resolve({ tools: message.tools as string[] });
            } else if (message.type === "result") {
              const call = pendingState.current;
              pendingState.current = null;
              if (call === null) continue;
              if (message.subtype !== "success" || message.is_error === true || typeof message.result !== "string") {
                call.reject(new Error("Claude SDK returned an unsuccessful role result."));
              } else {
                call.resolve(message.result);
              }
            }
          }
          if (!closed) throw new Error("Claude SDK session ended unexpectedly.");
        } catch (error) {
          init.reject(error);
          pendingState.current?.reject(error);
          pendingState.current = null;
        }
      })();
      void pump;

      const abort = (): void => {
        if (closed) return;
        closed = true;
        input.end();
        controller.abort();
        query.close();
        pendingState.current?.reject(new Error("Claude SDK role call was aborted."));
        pendingState.current = null;
      };

      return {
        start: () => init.promise,
        call: (prompt, signal) => {
          if (closed) return Promise.reject(new Error("Claude SDK session is closed."));
          if (pendingState.current !== null) return Promise.reject(new Error("Claude SDK role already has an active call."));
          if (signal?.aborted) return Promise.reject(signal.reason ?? new Error("Claude role call was aborted."));
          const result = deferred<string>();
          pendingState.current = result;
          const onAbort = (): void => abort();
          signal?.addEventListener("abort", onAbort, { once: true });
          void result.promise.finally(() => signal?.removeEventListener("abort", onAbort)).catch(() => {});
          input.push({
            type: "user",
            message: { role: "user", content: prompt },
            parent_tool_use_id: null,
            client_composed: true,
          });
          return result.promise;
        },
        abort,
        async close() {
          abort();
          await pump.catch(() => {});
        },
      };
    },
  };
}
