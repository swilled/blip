import { describe, expect, it, vi } from "vitest";
import { newId } from "@blip/protocol";
import { startServer } from "../src/server";
import type { AgyRoleConfig, AgyRoleSession, AgyCliAdapter } from "../src/brain/agy/session";
import { bindClient, type Frame } from "./helpers";

function adapterWithInit(options: {
  toolsFor?: (config: AgyRoleConfig) => string[];
  agentFor?: (config: AgyRoleConfig) => string;
  events: string[];
}) {
  const close = vi.fn();
  const calls: Array<{ role: string; prompt: string }> = [];
  const adapter: AgyCliAdapter = {
    createSession(config): AgyRoleSession {
      options.events.push(`create:${config.role}`);
      let callNumber = 0;
      return {
        async start() {
          options.events.push(`init:${config.role}`);
          return {
            agent: options.agentFor?.(config) ?? config.agent,
            permissionMode: "request-review",
            tools: options.toolsFor?.(config) ?? [],
          };
        },
        async call(prompt) {
          callNumber += 1;
          if (callNumber === 1) {
            return config.role === "intent"
              ? '{"type":"describe"}'
              : '{"fields":[{"id":"bootstrap-field","label":"Synthetic field","confidence":0.5}]}';
          }
          calls.push({ role: config.role, prompt });
          return '{"type":"describe"}';
        },
        abort() {},
        async close() {
          options.events.push(`close:${config.role}`);
          close(config.role);
        },
      };
    },
  };
  return { adapter, calls, close };
}

describe("server brain mode", () => {
  it("default and explicit fake startup remain usable without initializing the AGY CLI", async () => {
    const createSession = vi.fn(() => {
      throw new Error("fake mode must not initialize an AGY CLI session");
    });
    const adapter: AgyCliAdapter = { createSession };

    const defaultServer = await startServer({ port: 0, dev: true, agyAdapter: adapter });
    try {
      expect(defaultServer.config.brain).toBe("fake");
      expect((await fetch(`http://127.0.0.1:${defaultServer.port}/healthz`)).status).toBe(200);
    } finally {
      await defaultServer.close();
    }

    const fakeServer = await startServer({ port: 0, dev: true, brain: "fake", agyAdapter: adapter });
    try {
      expect(fakeServer.config.brain).toBe("fake");
      expect((await fetch(`http://127.0.0.1:${fakeServer.port}/healthz`)).status).toBe(200);
    } finally {
      await fakeServer.close();
    }
    expect(createSession).not.toHaveBeenCalled();
  });

  it("Agy startup initializes and validates both roles before the server listens", async () => {
    const events: string[] = [];
    const bootstrapDispatches: string[] = [];
    const f = adapterWithInit({ events });
    const server = await startServer({
      port: 0,
      dev: true,
      brain: "agy",
      agyAdapter: f.adapter,
      agySessionHooks: {
        beforeBootstrapDispatch: (role) => bootstrapDispatches.push(role),
        beforePromptDispatch: () => { throw new Error("ordinary prompt hook must not run for bootstrap"); },
      },
    });
    try {
      expect(events).toEqual(["create:intent", "init:intent", "create:repair", "init:repair"]);
      expect(server.config.brain).toBe("agy");
      expect((await fetch(`http://127.0.0.1:${server.port}/healthz`)).status).toBe(200);
    } finally {
      await server.close();
    }
    expect(f.close).toHaveBeenCalledTimes(2);
    expect(bootstrapDispatches).toEqual(["intent", "repair"]);
  });

  it("fails startup and closes partial roles if init reports the wrong no-tools agent", async () => {
    const events: string[] = [];
    const f = adapterWithInit({ events, agentFor: (config) => config.role === "repair" ? "unexpected-agent" : config.agent });

    const outcome = await startServer({ port: 0, dev: true, brain: "agy", agyAdapter: f.adapter }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(outcome).toMatchObject({ name: "AgyCliStartupError", role: "repair", category: "unexpected_agent" });
    expect(events).toEqual([
      "create:intent", "init:intent", "create:repair", "init:repair", "close:repair", "close:intent",
    ]);
  });

  it("does not send an utterance to Agy when no accepted page snapshot exists", async () => {
    const events: string[] = [];
    const f = adapterWithInit({ events });
    const server = await startServer({ port: 0, dev: true, brain: "agy", agyAdapter: f.adapter });
    const voice = await bindClient(server.port, "voice", { origin: undefined });
    try {
      voice.send("utterance", {
        utteranceId: newId(),
        text: "my password is offline-sentinel-unique",
        source: "typed",
      });
      const frames: Frame[] = [];
      for (;;) {
        const frame = await voice.nextMessage(3000);
        frames.push(frame);
        if (frame.type === "state" && frame.payload.busy === false) break;
      }
      expect(f.calls).toEqual([]);
      expect(frames.filter((frame) => frame.type === "speak").at(-1)?.payload.text)
        .toBe("I can't see the page because the browser extension is not connected.");
    } finally {
      voice.ws.terminate();
      await server.close();
    }
  });
});
