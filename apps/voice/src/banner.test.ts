import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfirmArmedPayload, ConfirmClearedPayload, StatePayload } from "@blip/protocol";
import {
  applyArmed,
  applyCleared,
  applyClose,
  applyState,
  createBannerModel,
  renderBanner,
  type BannerModel,
} from "./banner";

interface FakeElement {
  tagName: string;
  dataset: Record<string, string>;
  attributes: Map<string, string>;
  textContent: string;
  textContentAssignments: string[];
  setAttribute(name: string, value: string): void;
}

function fakeElement(tagName: string): FakeElement {
  let textContent = "";
  const element: FakeElement = {
    tagName,
    dataset: {},
    attributes: new Map(),
    textContentAssignments: [],
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    get textContent() {
      return textContent;
    },
    set textContent(value: string) {
      textContent = value;
      this.textContentAssignments.push(value);
    },
  };

  Object.defineProperty(element, "innerHTML", {
    set() {
      throw new Error("banner renderer must not use innerHTML");
    },
  });
  return element;
}

function fakeSlot() {
  return {
    children: [] as FakeElement[],
    replaceChildren(...children: FakeElement[]) {
      this.children = children;
    },
  };
}

function armed(grantId: string, phrase: string): ConfirmArmedPayload {
  return {
    grantId,
    phrase,
    kind: "submit",
    actionLabel: "Submit survey",
    expiresAt: 1,
  };
}

function cleared(grantId: string): ConfirmClearedPayload {
  return { grantId, reason: "cancelled" };
}

function state(dialogue: StatePayload["dialogue"]): Pick<StatePayload, "dialogue"> {
  return { dialogue };
}

afterEach(() => vi.unstubAllGlobals());

describe("blocked confirmation banner", () => {
  it("starts hidden with no phrase or grant", () => {
    expect(createBannerModel()).toEqual({
      visible: false,
      phrase: null,
      grantId: null,
      text: "",
    });
  });

  it("shows the banner when a confirmation is armed", () => {
    const model = applyArmed(createBannerModel(), armed("grant-1", "submit survey"));

    expect(model.visible).toBe(true);
  });

  it("shows the exact confirmation phrase from the armed payload", () => {
    const model = applyArmed(createBannerModel(), armed("grant-1", "submit survey"));

    expect(model.text).toBe("BLOCKED - say 'submit survey'");
    expect(model.visible).toBe(true);
    expect(model.grantId).toBe("grant-1");
    expect(model.phrase).toBe("submit survey");
  });

  it("replaces an older grant when a second confirmation is armed", () => {
    const first = applyArmed(createBannerModel(), armed("grant-1", "submit survey"));
    const second = applyArmed(first, armed("grant-2", "send report"));

    expect(second.grantId).toBe("grant-2");
    expect(second.phrase).toBe("send report");
    expect(second.text).toBe("BLOCKED - say 'send report'");
  });

  it("ignores a cleared event for a different grant", () => {
    const model = applyArmed(createBannerModel(), armed("grant-2", "submit survey"));

    expect(applyCleared(model, cleared("grant-1"))).toBe(model);
  });

  it("hides only when the cleared event matches the active grant", () => {
    const model = applyArmed(createBannerModel(), armed("grant-2", "submit survey"));

    expect(applyCleared(model, cleared("grant-2"))).toEqual(createBannerModel());
  });

  it("clears on state changes away from awaiting-confirm and stays unchanged while awaiting", () => {
    const model = applyArmed(createBannerModel(), armed("grant-1", "submit survey"));

    expect(applyState(model, state("awaiting-confirm"))).toBe(model);
    expect(applyState(model, state("ready"))).toEqual(createBannerModel());
  });

  it("clears on socket close", () => {
    const model = applyArmed(createBannerModel(), armed("grant-1", "submit survey"));

    expect(applyClose(model)).toEqual(createBannerModel());
  });

  it("renders one textContent-only blocked child and leaves the hidden slot empty", () => {
    const slot = fakeSlot();
    const armedModel: BannerModel = applyArmed(createBannerModel(), armed("grant-1", "submit survey"));
    vi.stubGlobal("document", { createElement: (tag: string) => fakeElement(tag) });

    renderBanner(slot as unknown as HTMLElement, armedModel);

    expect(slot.children).toHaveLength(1);
    expect(slot.children[0]?.tagName).toBe("p");
    expect(slot.children[0]?.dataset.blocked).toBe("true");
    expect(slot.children[0]?.textContent).toBe("BLOCKED - say 'submit survey'");
    expect(slot.children[0]?.textContentAssignments).toEqual(["BLOCKED - say 'submit survey'"]);
    expect(slot.children[0]?.attributes.get("aria-label")).toBe("Blocked, waiting for confirmation phrase");
    expect(slot.children[0]?.attributes.has("aria-live")).toBe(false);
    expect(slot.children[0]?.attributes.has("role")).toBe(false);

    renderBanner(slot as unknown as HTMLElement, createBannerModel());
    expect(slot.children).toHaveLength(0);
  });
});
