import type { Field, RawElement, Snapshot } from "../src/index";

/** A valid text-field RawElement. Later plans reuse this; override what the test cares about. */
export function makeElement(overrides: Partial<RawElement> = {}): RawElement {
  return {
    id: "e1",
    frameId: 0,
    category: "field",
    tag: "input",
    inputType: "text",
    role: "textbox",
    labelCandidates: [{ text: "First name", source: "label", confidence: 0.95 }],
    required: false,
    requiredSource: "none",
    invalid: false,
    errorText: null,
    value: null,
    hasValue: false,
    sensitive: "none",
    disabled: false,
    visible: true,
    order: 0,
    ...overrides,
  };
}

/** A valid Snapshot with one element. */
export function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    snapshotId: "snap-1",
    version: 1,
    tabId: 1,
    url: "http://127.0.0.1:7777/fixtures/forms/booking.html",
    origin: "http://127.0.0.1:7777",
    title: "Booking",
    headings: [],
    alerts: [],
    elements: [makeElement()],
    truncated: false,
    structuralHash: "h1",
    capturedAt: 0,
    ...overrides,
  };
}

/** A valid resolved Field. */
export function makeField(overrides: Partial<Field> = {}): Field {
  return {
    id: "e1",
    role: "textbox",
    type: "text",
    label: "First name",
    labelSource: "label",
    confidence: 0.95,
    required: false,
    value: null,
    hasValue: false,
    sensitive: "none",
    error: null,
    disabled: false,
    order: 0,
    ...overrides,
  };
}
