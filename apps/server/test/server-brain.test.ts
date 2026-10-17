import { describe, expect, it, vi } from "vitest";
import { newId } from "@blip/protocol";
import { startServer } from "../src/server";
import type { ClaudeRoleConfig, ClaudeRoleSession, ClaudeSdkAdapter } from "../src/brain/claude/session";
import { bindClient, type Frame } from "./helpers";

function adapterWithInit(options: {
  toolsFor?: (config: ClaudeRoleConfig) => string[];
  events: string[];
}) {
  const close = vi.fn();
  const calls: Array<{ role: string; prompt: string }> = [];
  const adapter: ClaudeSdkAdapter = {
    createSession(config): ClaudeRoleSession {
      options.events.push(`create:${config.role}`);
      return {
        async start() {
          options.events.push(`init:${config.role}`);
          return { tools: options.toolsFor?.(config) ?? [] };
        },
        async call(prompt) {
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
  it("default and explicit fake startup remain usable without initializing the SDK", async () => {
    const createSession = vi.fn(() => {
      throw new Error("fake mode must not initialize a Claude SDK session");
    });
    const adapter: ClaudeSdkAdapter = { createSession };

    const defaultServer = await startServer({ port: 0, dev: true, claudeAdapter: adapter });
    try {
      expect(defaultServer.config.brain).toBe("fake");
      expect((await fetch(`http://127.0.0.1:${defaultServer.port}/healthz`)).status).toBe(200);
    } finally {
      await defaultServer.close();
    }

    const fakeServer = await startServer({ port: 0, dev: true, brain: "fake", claudeAdapter: adapter });
    try {
      expect(fakeServer.config.brain).toBe("fake");
      expect((await fetch(`http://127.0.0.1:${fakeServer.port}/healthz`)).status).toBe(200);
    } finally {
      await fakeServer.close();
    }
    expect(createSession).not.toHaveBeenCalled();
  });

  it("Claude startup initializes and validates both roles before the server listens", async () => {
    const events: string[] = [];
    const f = adapterWithInit({ events });
    const server = await startServer({ port: 0, dev: true, brain: "claude", claudeAdapter: f.adapter });
    try {
      expect(events).toEqual(["create:intent", "init:intent", "create:repair", "init:repair"]);
      expect(server.config.brain).toBe("claude");
      expect((await fetch(`http://127.0.0.1:${server.port}/healthz`)).status).toBe(200);
    } finally {
      await server.close();
    }
    expect(f.close).toHaveBeenCalledTimes(2);
  });

  it("fails startup and closes partial roles if init reports an unexpected tool", async () => {
    const events: string[] = [];
    const f = adapterWithInit({ events, toolsFor: (config) => config.role === "repair" ? ["mcp__unexpected__tool"] : [] });

    await expect(startServer({ port: 0, dev: true, brain: "claude", claudeAdapter: f.adapter }))
      .rejects.toThrow(/expected no tools.*mcp__unexpected__tool/);
    expect(events).toEqual([
      "create:intent", "init:intent", "create:repair", "init:repair", "close:repair", "close:intent",
    ]);
  });

  it("does not send an utterance to Claude when no accepted page snapshot exists", async () => {
    const events: string[] = [];
    const f = adapterWithInit({ events });
    const server = await startServer({ port: 0, dev: true, brain: "claude", claudeAdapter: f.adapter });
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
