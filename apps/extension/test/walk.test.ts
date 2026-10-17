// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { actionFactsOf, resolveElementId, walkDocument } from "../src/content/walk.js";

const rect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 80,
  bottom: 20,
  width: 80,
  height: 20,
  toJSON: () => ({}),
};

beforeEach(() => {
  document.body.replaceChildren();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("walkDocument", () => {
  it("collects native fields, one radio group, actions and unsupported widgets with safe metadata", () => {
    document.body.innerHTML = `
      <form action="/book">
        <label for="name">Guest name</label>
        <input id="name" name="guestName" required value="Alex">
        <label for="locked">Locked</label><input id="locked" name="locked" readonly value="cannot change">
        <input id="secret" type="hidden" value="never read">
        <fieldset><legend>Bed preference</legend>
          <label><input type="radio" name="bed" value="king">King</label>
          <label><input type="radio" name="bed" value="twin" checked>Twin</label>
        </fieldset>
        <label><input type="checkbox" name="breakfast" checked>Breakfast</label>
        <label for="room">Room</label><select id="room" name="room"><option value="">Choose</option><option value="suite" selected>Suite</option></select>
        <div role="combobox" aria-label="Custom choice">Unsupported control</div>
        <button type="button">Close</button>
        <a href="/help?campaign=pay" target="_blank">Help</a>
        <a href="/dialog" target="pay-confirm">Close</a>
        <a href="/dialog">Close and confirm</a>
      </form>
    `;
    Object.defineProperty(document.getElementById("secret"), "value", { get: () => { throw new Error("hidden value read"); } });

    const elements = walkDocument(document, { frameId: 7 });
    const byName = (name: string) => elements.find((element) => element.name === name);

    expect(elements.map(({ category, name }) => [category, name])).toContainEqual(["field", "guestName"]);
    expect(byName("guestName")).toMatchObject({
      frameId: 7,
      category: "field",
      tag: "input",
      role: "textbox",
      value: "Alex",
      hasValue: true,
      required: true,
      requiredSource: "attr",
    });
    expect(byName("locked")?.disabled).toBe(true);
    expect(elements.some((element) => element.name === "secret")).toBe(false);
    expect(byName("bed")).toMatchObject({
      category: "field",
      tag: "fieldset",
      inputType: "radio",
      role: "radiogroup",
      value: "twin",
      hasValue: true,
      group: "Bed preference",
      options: [
        { value: "king", label: "King", selected: false },
        { value: "twin", label: "Twin", selected: true },
      ],
    });
    expect(byName("room")).toMatchObject({ kind: "select", options: [{ value: "", label: "Choose", selected: false }, { value: "suite", label: "Suite", selected: true }] });
    expect(elements.find((element) => element.role === "combobox" && element.tag === "div")).toMatchObject({ category: "field", kind: "fill" });
    expect(elements.find((element) => element.text === "Close")).toMatchObject({ category: "action", kind: "click-safe" });

    const help = elements.find((element) => element.text === "Help");
    expect(help).toMatchObject({ category: "action", kind: "pay", href: "http://localhost:3000/help" });
    const rawFacts = actionFactsOf(document.querySelector('a[href^="/help"]')!, document.location.href);
    expect(rawFacts).toMatchObject({ href: "http://localhost:3000/help?campaign=pay", target: "_blank" });
    expect(elements.find((element) => element.text === "Close" && element.href === "http://localhost:3000/dialog")).toMatchObject({ category: "action", kind: "pay" });
    expect(elements.find((element) => element.text === "Close and confirm")).toMatchObject({ category: "action", kind: "submit" });
  });

  it("discovers controls in open and Chrome-exposed closed shadow roots", () => {
    document.body.innerHTML = `<x-open></x-open><x-closed></x-closed>`;
    const openHost = document.querySelector("x-open")!;
    const openRoot = openHost.attachShadow({ mode: "open" });
    openRoot.innerHTML = `<label>Open field<input name="openField" value="open"></label>`;

    const closedHost = document.querySelector("x-closed")!;
    const closedRoot = closedHost.attachShadow({ mode: "closed" });
    closedRoot.innerHTML = `<label>Closed field<input name="closedField" value="closed"></label>`;
    vi.stubGlobal("chrome", { dom: { openOrClosedShadowRoot: (host: Element) => host === closedHost ? closedRoot : null } });

    const elements = walkDocument(document);

    expect(elements.map((element) => element.name)).toEqual(["openField", "closedField"]);
  });

  it("resolves IDs from its private registry even if the page changes the debug stamp", () => {
    document.body.innerHTML = `<input id="email" name="email" value="a@example.com">`;
    const input = document.querySelector("input")!;
    const [field] = walkDocument(document);
    if (!field) throw new Error("expected a field");

    input.setAttribute("data-blip-id", "e999");

    expect(resolveElementId(field.id, document)).toBe(input);
    expect(resolveElementId("e999", document)).toBeNull();
  });
});
