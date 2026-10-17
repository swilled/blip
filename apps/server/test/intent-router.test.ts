import { describe, expect, it, vi } from "vitest";
import type { Intent } from "@blip/protocol";
import { buildBaselineFormModel } from "../src/baseline";
import {
  InvalidIntentResultError,
  StaleIntentPageError,
  routeIntent,
  type IntentRouteProvider,
} from "../src/brain/claude/intent-router";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";

function page() {
  const snapshot = loadSnapshot("booking");
  const model = buildBaselineFormModel(snapshot);
  return { snapshot, model, isCurrent: () => true };
}

function providerWith(...responses: unknown[]) {
  let index = 0;
  return {
    parseIntent: vi.fn(async (_prompt: string, _signal?: AbortSignal): Promise<Intent> => {
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      if (response instanceof Error) throw response;
      return response as Intent;
    }),
  } satisfies IntentRouteProvider;
}

describe("privacy-gated intent routing", () => {
  it("keeps recognized commands and field phrases local", async () => {
    const provider = providerWith(new Error("provider must not run"));
    const accepted = page();

    const grammar = await routeIntent("describe this page", accepted, provider);
    const field = await routeIntent("fill Guest name with Ada", accepted, provider);

    expect(grammar).toMatchObject({ kind: "local", route: "grammar" });
    expect(field).toMatchObject({ kind: "local", route: "field-phrase" });
    expect(provider.parseIntent).not.toHaveBeenCalled();
  });

  it.each([
    ["set_fields", (p: ReturnType<typeof page>) => ({
      type: "set_fields", fills: [{ fieldId: p.model.fields.find((f) => f.type === "text" && f.sensitive === "none")!.id, value: "Ada" }],
    })],
    ["go_to_field", (p: ReturnType<typeof page>) => ({
      type: "go_to_field", fieldId: p.model.fields.find((f) => !f.disabled)!.id,
    })],
    ["request_action", (p: ReturnType<typeof page>) => ({
      type: "request_action", actionId: p.model.actions.find((a) => ["submit", "pay", "delete", "send", "navigate-cross-domain"].includes(a.kind))!.id,
    })],
    ["click_safe", (p: ReturnType<typeof page>) => ({
      type: "click_safe", actionId: p.model.actions.find((a) => ["submit", "pay", "delete", "send", "navigate-cross-domain"].includes(a.kind))!.id,
    })],
  ])("accepts %s only when its target belongs to the captured current model", async (_name, makeIntent) => {
    const accepted = page();
    const expected = makeIntent(accepted) as Intent;
    const provider = providerWith(expected);

    const result = await routeIntent("use the matching field", accepted, provider);

    expect(result).toEqual({ kind: "intent", intent: expected });
    expect(provider.parseIntent).toHaveBeenCalledOnce();
  });

  it("rejects stale field and action ids after one invalid-output retry", async () => {
    const accepted = page();
    const provider = providerWith(
      { type: "go_to_field", fieldId: "stale-field-id" },
      { type: "request_action", actionId: "stale-action-id" },
    );

    await expect(routeIntent("use the old field", accepted, provider)).rejects.toBeInstanceOf(InvalidIntentResultError);
    expect(provider.parseIntent).toHaveBeenCalledTimes(2);
  });

  it("rejects duplicate targets and unsupported keys rather than returning them to the turn router", async () => {
    const accepted = page();
    const fieldId = accepted.model.fields.find((field) => field.type === "text" && field.sensitive === "none")!.id;
    const provider = providerWith(
      { type: "set_fields", fills: [{ fieldId, value: "Ada" }, { fieldId, value: "Lin" }] },
      { type: "answer", text: "done", approve: true },
    );

    await expect(routeIntent("set the field", accepted, provider)).rejects.toBeInstanceOf(InvalidIntentResultError);
    expect(provider.parseIntent).toHaveBeenCalledTimes(2);
  });

  it("rejects sensitive-shaped values from model output before they can be spoken or written", async () => {
    const provider = providerWith(
      { type: "answer", text: "Your card number is 4111 1111 1111 1111" },
      { type: "answer", text: "Your card number is 4111 1111 1111 1111" },
    );

    await expect(routeIntent("tell me the card number", page(), provider)).rejects.toBeInstanceOf(InvalidIntentResultError);
    expect(provider.parseIntent).toHaveBeenCalledTimes(2);
  });

  it("retries invalid structured output once, but not a provider failure", async () => {
    const accepted = page();
    const valid = { type: "describe" } as const;
    const invalidThenValid = providerWith({ type: "describe", extra: true }, valid);

    await expect(routeIntent("explain this page", accepted, invalidThenValid))
      .resolves.toEqual({ kind: "intent", intent: valid });
    expect(invalidThenValid.parseIntent).toHaveBeenCalledTimes(2);

    const failed = providerWith(new Error("offline adapter failure"), valid);
    await expect(routeIntent("explain this page", accepted, failed)).rejects.toThrow("offline adapter failure");
    expect(failed.parseIntent).toHaveBeenCalledOnce();
  });

  it("does not retry when the accepted page changes during the provider call", async () => {
    let current = true;
    const accepted = { ...page(), isCurrent: () => current };
    const provider: IntentRouteProvider = {
      parseIntent: vi.fn(async (_prompt: string, _signal?: AbortSignal): Promise<Intent> => {
        current = false;
        return { type: "describe" };
      }),
    };

    await expect(routeIntent("what is on the current page", accepted, provider)).rejects.toBeInstanceOf(StaleIntentPageError);
    expect(provider.parseIntent).toHaveBeenCalledOnce();
  });

  it("withholds secret-shaped free-form text before provider input", async () => {
    const sentinel = "offline-password-sentinel-921";
    const accepted = page();
    const template = accepted.model.fields[0]!;
    accepted.model.fields.push({
      ...template,
      id: "private-password-field",
      label: "Password",
      type: "password",
      sensitive: "password",
      value: null,
      hasValue: false,
      order: accepted.model.fields.length,
    });
    const provider = providerWith({ type: "describe" });

    const result = await routeIntent(`my password is ${sentinel}`, accepted, provider);

    expect(result).toMatchObject({ kind: "handoff", handoff: { kind: "focus-and-type" } });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(provider.parseIntent).not.toHaveBeenCalled();
  });

  it("serializes only the value-free page projection and privacy-approved utterance", async () => {
    const accepted = page();
    accepted.snapshot.elements[0]!.value = "page-value-sentinel-275";
    accepted.snapshot.elements[0]!.hasValue = true;
    const provider = providerWith({ type: "describe" });

    await routeIntent("tell me about this form", accepted, provider);

    expect(provider.parseIntent).toHaveBeenCalledOnce();
    expect(provider.parseIntent.mock.calls[0]![0]).toContain("tell me about this form");
    expect(provider.parseIntent.mock.calls[0]![0]).toContain("no markdown fences");
    expect(provider.parseIntent.mock.calls[0]![0]).toContain("schema-valid clarify Intent with a short question");
    expect(provider.parseIntent.mock.calls[0]![0]).toContain("Allowed Intent types and required keys");
    expect(provider.parseIntent.mock.calls[0]![0]).toContain("go_to_field and spell require fieldId");
    expect(provider.parseIntent.mock.calls[0]![0]).toContain("set_fields requires fills with exactly one item containing fieldId and value");
    expect(provider.parseIntent.mock.calls[0]![0]).toContain("request_action and click_safe require actionId");
    expect(provider.parseIntent.mock.calls[0]![0]).toContain("answer requires text; clarify requires question");
    expect(provider.parseIntent.mock.calls[0]![0]).not.toContain("page-value-sentinel-275");
  });
});
