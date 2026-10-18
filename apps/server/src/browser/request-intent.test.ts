import { describe, expect, it } from "vitest";
import type { BrowserCapture } from "./commands";
import {
  browserCommandForIntent,
  shouldInferBrowserRequest,
} from "./request-intent";

const capture: BrowserCapture = {
  identity: { captureId: "capture-1", captureRevision: 1, tabId: 7, pageUrl: "https://example.com/" },
  blocks: [],
  links: [],
  tabs: {
    activeTabId: 7,
    tabs: [
      { tabId: 7, title: "Example", hostHint: "example.com" },
      { tabId: 11, title: "Research Notes", hostHint: "notes.example" },
    ],
    truncated: false,
  },
};

describe("semantic browser request inference", () => {
  it.each([
    "Would you mind opening my Gmail?",
    "Gmail",
    "New York Times",
    "Could we pop over to Wikipedia?",
    "Please take me to github.com",
    "I'd like you to get me to Wikipedia",
    "Could you show me the article?",
    "Can you launch a separate browser tab for Gmail?",
  ])("recognizes browser-action phrasing without matching a fixed command sentence: %s", (text) => {
    expect(shouldInferBrowserRequest(text)).toBe(true);
  });

  it.each(["Tell me another fact", "Describe the movie in one sentence", "What is the weather like?"])(
    "does not send ordinary short conversation to browser intent inference: %s",
    (text) => expect(shouldInferBrowserRequest(text)).toBe(false),
  );

  it("maps paraphrased destinations only when the target was spoken", () => {
    expect(browserCommandForIntent(
      { intent: "navigate", target: "Gmail", destinationUrl: "https://gmail.com/" },
      "Would you mind taking me over to Gmail?",
      capture,
    )).toEqual({ type: "navigate", url: "https://gmail.com/", host: "gmail.com" });
    expect(browserCommandForIntent(
      { intent: "navigate", target: "Gmail", destinationUrl: "https://unrelated.example/" },
      "Open Gmail",
      capture,
    )).toEqual({ type: "search", query: "Gmail", route: "browser-default" });
    expect(browserCommandForIntent(
      { intent: "navigate", target: "attacker.example" },
      "Could you visit Gmail?",
      capture,
    )).toBeNull();
  });

  it("uses another tab only when the user explicitly asks for one", () => {
    expect(browserCommandForIntent(
      { intent: "navigate", target: "Wikipedia", destinationUrl: "https://www.wikipedia.org/", newTab: true },
      "Could you pop over to Wikipedia in a separate tab?",
      capture,
    )).toEqual({ type: "navigate", url: "https://www.wikipedia.org/", host: "www.wikipedia.org", newTab: true });
    expect(browserCommandForIntent(
      { intent: "navigate", target: "Wikipedia", destinationUrl: "https://www.wikipedia.org/", newTab: true },
      "Could you pop over to Wikipedia?",
      capture,
    )).toEqual({ type: "navigate", url: "https://www.wikipedia.org/", host: "www.wikipedia.org" });
  });

  it("resolves model-selected tabs and links through fresh local records", () => {
    expect(browserCommandForIntent(
      { intent: "switch-tab", target: "Research Notes" },
      "Bring me back to Research Notes",
      capture,
    )).toEqual({ type: "switch-tab", targetTabId: 11 });
    expect(browserCommandForIntent(
      { intent: "open-link", target: "Usage" },
      "Open the Usage link",
      capture,
    )).toMatchObject({ type: "clarify" });
  });
});
