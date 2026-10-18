import type { RawElement } from "@blip/protocol";
import { classifyAction, classifyField, type ActionFacts } from "@blip/policy/classify";
import { errorStateOf } from "./errors.js";
import { fingerprintOf } from "./fingerprint.js";
import { createIdRegistry, type ElementIdRegistry } from "./ids.js";
import { labelCandidatesOf, type LabelCandidate } from "./labels.js";
import { optionsOf } from "./options.js";
import { requiredStateOf } from "./required.js";
import { safeValueOf } from "./sensitive.js";
import { boundedText } from "./text.js";
import { isDisabled, isVisible } from "./visibility.js";

export interface WalkOptions {
  frameId?: number;
  timeBudgetMs?: number;
  now?: () => number;
}

interface FoundElement {
  element: Element;
  order: number;
}

interface RadioGroup extends FoundElement {
  name: string;
  members: HTMLInputElement[];
  groupRoot: Element;
}

interface AriaRadioGroup extends FoundElement {
  ariaRadio: true;
  members: Element[];
}

type ChromeWithClosedRoots = typeof globalThis & {
  chrome?: {
    dom?: {
      openOrClosedShadowRoot?: (element: Element) => ShadowRoot | null;
    };
  };
};

const idRegistries = new WeakMap<Document, ElementIdRegistry>();
const FIELD_ROLES = new Set([
  "textbox", "searchbox", "combobox", "listbox", "checkbox", "radio", "radiogroup", "switch",
  "spinbutton", "slider", "option",
]);

function registryFor(document: Document): ElementIdRegistry {
  let registry = idRegistries.get(document);
  if (!registry) {
    registry = createIdRegistry();
    idRegistries.set(document, registry);
  }
  return registry;
}

/** Resolve an element only through the isolated world's private registry. */
export function resolveElementId(id: string, ownerDocument: Document = document): Element | null {
  return idRegistries.get(ownerDocument)?.resolve(id) ?? null;
}

function shadowRootOf(element: Element): ShadowRoot | null {
  if (element.shadowRoot) return element.shadowRoot;
  const chromeApi = (globalThis as ChromeWithClosedRoots).chrome?.dom?.openOrClosedShadowRoot;
  if (typeof chromeApi !== "function") return null;
  try {
    return chromeApi.call((globalThis as ChromeWithClosedRoots).chrome?.dom, element);
  } catch {
    return null;
  }
}

function composedElements(document: Document, options: WalkOptions): { elements: Element[]; timedOut: boolean } {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const budget = options.timeBudgetMs ?? 100;
  const elements: Element[] = [];
  let timedOut = false;

  const visit = (element: Element): void => {
    if (timedOut) return;
    if (now() - startedAt > budget) {
      timedOut = true;
      return;
    }
    elements.push(element);

    const shadowRoot = shadowRootOf(element);
    if (shadowRoot) {
      for (const child of Array.from(shadowRoot.children)) visit(child);
    }
    for (const child of Array.from(element.children)) visit(child);
  };

  if (document.documentElement) visit(document.documentElement);
  return { elements, timedOut };
}

/** Read-only composed-tree view for snapshot metadata such as headings and alerts. */
export function elementsInComposedDocument(document: Document, options: WalkOptions = {}): Element[] {
  return composedElements(document, options).elements;
}

function inputTypeOf(element: Element): string | undefined {
  if (element.localName !== "input") return undefined;
  const raw = element.getAttribute("type");
  return raw?.trim().toLowerCase() || "text";
}

function explicitRole(element: Element): string | undefined {
  return boundedText(element.getAttribute("role"), 80, 80).toLowerCase() || undefined;
}

function roleOf(element: Element, inputType = inputTypeOf(element)): string {
  const role = explicitRole(element);
  if (role) return role;
  if (element.localName === "textarea") return "textbox";
  if (element.localName === "select") return (element as HTMLSelectElement).multiple ? "listbox" : "combobox";
  if (element.localName === "button") return "button";
  if (element.localName === "a") return "link";
  if (element.localName !== "input") return "generic";
  switch (inputType) {
    case "checkbox": return "checkbox";
    case "radio": return "radio";
    case "range": return "slider";
    case "number": return "spinbutton";
    case "search": return "searchbox";
    case "button":
    case "reset":
    case "submit":
    case "image": return "button";
    default: return "textbox";
  }
}

function isHiddenInput(element: Element): boolean {
  return element.localName === "input" && inputTypeOf(element) === "hidden";
}

function isActionElement(element: Element, inputType = inputTypeOf(element)): boolean {
  if (element.localName === "button" || element.localName === "a" && element.hasAttribute("href")) return true;
  if (element.localName === "input" && ["button", "reset", "submit", "image"].includes(inputType ?? "")) return true;
  return ["button", "link"].includes(explicitRole(element) ?? "");
}

function isCustomField(element: Element): boolean {
  const role = explicitRole(element);
  const contentEditable = element.getAttribute("contenteditable")?.trim().toLowerCase();
  return (contentEditable === "" || contentEditable === "true" || contentEditable === "plaintext-only") ||
    (role !== undefined && FIELD_ROLES.has(role));
}

function groupText(element: Element): string | undefined {
  const fieldset = element.closest("fieldset");
  const legend = fieldset?.querySelector(":scope > legend");
  if (legend) return boundedText(legend.textContent, 120, 120) || undefined;

  const section = element.closest("section, [role=group], [role=radiogroup]");
  const heading = section?.querySelector("h1, h2, h3, h4, h5, h6, legend");
  return boundedText(heading?.textContent, 120, 120) || undefined;
}

function radioGroupKey(element: HTMLInputElement, order: number): { scope: Node; key: string } {
  const root = element.getRootNode();
  const scope = element.form ?? root;
  const name = element.name;
  return { scope, key: name ? `name:${name}` : `anonymous:${order}` };
}

export function ariaRadioOwner(element: Element, elements?: readonly Element[]): Element {
  const ancestorGroup = element.closest('[role="radiogroup"]');
  if (ancestorGroup) return ancestorGroup;

  const id = element.getAttribute("id");
  if (id && elements) {
    const ownedGroup = elements.find((candidate) =>
      explicitRole(candidate) === "radiogroup" &&
      (candidate.getAttribute("aria-owns") ?? "").trim().split(/\s+/).includes(id),
    );
    if (ownedGroup) return ownedGroup;
  }

  return element.closest("fieldset") ??
    element.closest('[data-automation-id="questionItem"]') ??
    element.closest('[role="group"]') ??
    element.parentElement ??
    element;
}

export function ariaRadioSelected(element: Element): boolean {
  if (element.getAttribute("aria-checked")?.trim().toLowerCase() === "true") return true;
  return element.localName === "input" && (element as HTMLInputElement).checked;
}

export function ariaRadioOptionLabel(element: Element): string {
  const accessible = labelCandidatesOf(element).find((candidate) => candidate.source === "aria")?.text;
  if (accessible) return accessible;
  return boundedText(element.textContent, 200, 200) ||
    labelCandidatesOf(element).find((candidate) => candidate.source === "label")?.text ||
    boundedText(element.getAttribute("value"), 200, 200);
}

export function ariaRadioOptionValue(element: Element): string {
  return boundedText(element.getAttribute("value"), 200, 200) || ariaRadioOptionLabel(element);
}

export function ariaRadioGroupMembers(group: Element): Element[] {
  const elements = elementsInComposedDocument(group.ownerDocument);
  return elements.filter((element) => explicitRole(element) === "radio" && ariaRadioOwner(element, elements) === group);
}

function ariaRadioGroupLabels(element: Element): LabelCandidate[] {
  const question = element.closest('[data-automation-id="questionItem"]');
  const title = question?.querySelector('[data-automation-id="questionTitle"]');
  const titleText = boundedText(title?.textContent, 200, 200);
  const candidates = labelCandidatesOf(element);
  if (!titleText || candidates.some((candidate) => candidate.text === titleText)) return candidates;
  return [{ text: titleText, source: "aria" as const, confidence: 1 }, ...candidates].slice(0, 8);
}

function effectiveButtonType(element: Element): string | undefined {
  if (element.localName === "button") {
    const value = (element as HTMLButtonElement).type.toLowerCase();
    return ["submit", "button", "reset"].includes(value) ? value : "submit";
  }
  const inputType = inputTypeOf(element);
  return inputType && ["submit", "button", "reset"].includes(inputType) ? inputType : undefined;
}

function sanitizedHref(rawHref: string, pageUrl: string): string | undefined {
  if (!rawHref) return undefined;
  try {
    const url = new URL(rawHref, pageUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

/** Capture live classifier facts before the outgoing href is stripped of query and fragment data. */
export function actionFactsOf(element: Element, pageUrl: string): ActionFacts {
  const tag = element.localName;
  const inputType = inputTypeOf(element);
  const role = roleOf(element, inputType);
  const text = boundedText(element.textContent, 200, 200);
  const rawHref = element.localName === "a"
    ? (element as HTMLAnchorElement).href || element.getAttribute("href") || ""
    : element.getAttribute("href") ?? "";
  const target = element.getAttribute("target") ?? "";
  const inForm = element.localName === "button" || element.localName === "input"
    ? Boolean((element as HTMLButtonElement | HTMLInputElement).form)
    : element.closest("form") !== null;
  const buttonType = effectiveButtonType(element);
  return {
    tag,
    role,
    text,
    href: rawHref,
    target,
    origin: new URL(pageUrl).origin,
    ...(buttonType ? { buttonType } : {}),
    ...(inputType ? { inputType } : {}),
    inForm,
  };
}

function actionRaw(element: Element, order: number, frameId: number, pageUrl: string): RawElement {
  const facts = actionFactsOf(element, pageUrl);
  const labels = labelCandidatesOf(element);
  const text = facts.text ?? "";
  const rawHref = facts.href ?? "";
  const buttonType = facts.buttonType;
  const inputType = facts.inputType;
  const classification = classifyAction(facts);
  const id = "";
  const value: RawElement = {
    id,
    frameId,
    category: "action",
    tag: facts.tag ?? element.localName,
    ...(inputType ? { inputType } : {}),
    role: facts.role ?? roleOf(element),
    labelCandidates: labels,
    required: false,
    requiredSource: "none",
    invalid: false,
    errorText: null,
    value: null,
    hasValue: false,
    sensitive: "none",
    disabled: isDisabled(element),
    visible: isVisible(element),
    ...(element.getAttribute("name") ? { name: boundedText(element.getAttribute("name"), 200, 200) } : {}),
    ...(text ? { text } : {}),
    ...(buttonType ? { buttonType: buttonType as "submit" | "button" | "reset" } : {}),
    ...(facts.inForm === undefined ? {} : { inForm: facts.inForm }),
    ...(sanitizedHref(rawHref, pageUrl) ? { href: sanitizedHref(rawHref, pageUrl)! } : {}),
    kind: classification.kind,
    kindReasons: classification.reasons,
    order,
  };
  return assignId(element, value);
}

function assignId(element: Element, raw: RawElement): RawElement {
  const id = registryFor(element.ownerDocument).idFor(element, fingerprintOf(raw));
  return { ...raw, id };
}

function valueRaw(element: Element, order: number, frameId: number): RawElement {
  const inputType = inputTypeOf(element);
  const radio = inputType === "radio";
  const checkbox = inputType === "checkbox";
  const tag = element.localName;
  const role = radio ? "radiogroup" : roleOf(element, inputType);
  const labels = labelCandidatesOf(element);
  const required = requiredStateOf(element, labels);
  const error = errorStateOf(element);
  const fieldType = tag === "select" ? "select" : tag === "textarea" ? "textarea" : inputType;
  const classification = classifyField({ tag, inputType, role, ...(fieldType ? { fieldType } : {}) });
  // Unsupported controls may expose opaque or sensitive values through page-defined getters.
  const supportedValue = inputType !== "file" && !classification.unsupported;
  const safe = supportedValue ? safeValueOf(element) : { sensitive: "none" as const, value: null, hasValue: false };
  const value: RawElement = {
    id: "",
    frameId,
    category: "field",
    tag,
    ...(inputType ? { inputType } : {}),
    role,
    labelCandidates: labels,
    ...(error.describedBy ? { describedBy: error.describedBy } : {}),
    ...(element.getAttribute("name") ? { name: boundedText(element.getAttribute("name"), 200, 200) } : {}),
    ...(element.getAttribute("autocomplete") ? { autocomplete: boundedText(element.getAttribute("autocomplete"), 200, 200) } : {}),
    required: required.required,
    requiredSource: required.requiredSource,
    invalid: error.invalid,
    errorText: error.errorText,
    value: checkbox ? null : safe.value,
    hasValue: checkbox ? (element as HTMLInputElement).checked : safe.hasValue,
    ...(checkbox ? { checked: (element as HTMLInputElement).checked } : {}),
    ...(tag === "select" ? { options: optionsOf(element as HTMLSelectElement) } : {}),
    sensitive: safe.sensitive,
    disabled: isDisabled(element),
    visible: isVisible(element),
    ...(groupText(element) ? { group: groupText(element)! } : {}),
    order,
    kind: classification.kind,
  };

  // File paths, custom-widget values, and unsupported control values are never useful on the wire.
  if (inputType === "file" || classification.unsupported) {
    value.value = null;
    value.hasValue = inputType === "file" ? Boolean((element as HTMLInputElement).files?.length) : false;
    value.sensitive = "none";
  }
  return assignId(element, value);
}

function radioRaw(group: RadioGroup, frameId: number): RawElement {
  const first = group.members[0]!;
  const fieldset = first.closest("fieldset");
  const labelRoot = fieldset ?? first.closest('[role="radiogroup"]') ?? first;
  const labels = labelCandidatesOf(labelRoot);
  const required = group.members.some((radio) => radio.hasAttribute("required"))
    ? { required: true, requiredSource: "attr" as const }
    : requiredStateOf(labelRoot, labels);
  const error = errorStateOf(labelRoot);
  const selected = group.members.find((radio) => radio.checked);
  const sensitive = group.members.map((radio) => safeValueOf(radio).sensitive).find((value) => value !== "none") ?? "none";
  const options = group.members.map((radio) => ({
    value: boundedText(radio.value, 200, 200),
    label: labelCandidatesOf(radio)[0]?.text ?? boundedText(radio.value, 200, 200),
    selected: radio.checked,
  }));
  const value: RawElement = {
    id: "",
    frameId,
    category: "field",
    tag: fieldset ? "fieldset" : "input",
    inputType: "radio",
    role: "radiogroup",
    labelCandidates: labels.length ? labels : labelCandidatesOf(first),
    ...(error.describedBy ? { describedBy: error.describedBy } : {}),
    ...(group.name ? { name: boundedText(group.name, 200, 200) } : {}),
    required: required.required,
    requiredSource: required.requiredSource,
    invalid: error.invalid || group.members.some((radio) => errorStateOf(radio).invalid),
    errorText: error.errorText ?? group.members.map((radio) => errorStateOf(radio).errorText).find(Boolean) ?? null,
    value: sensitive === "none" ? selected?.value ?? null : null,
    hasValue: selected !== undefined,
    options,
    sensitive,
    disabled: group.members.every(isDisabled),
    visible: group.members.some(isVisible),
    ...(groupText(labelRoot) ? { group: groupText(labelRoot)! } : {}),
    order: group.order,
    kind: "select",
  };
  return assignId(group.element, value);
}

function ariaRadioRaw(group: AriaRadioGroup, frameId: number): RawElement {
  const root = group.element;
  const labels = ariaRadioGroupLabels(root);
  const required = requiredStateOf(root, labels);
  const error = errorStateOf(root);
  const options = group.members.map((member) => {
    const label = ariaRadioOptionLabel(member);
    const value = ariaRadioOptionValue(member);
    return { value, label: label || value, selected: ariaRadioSelected(member) };
  });
  const selected = options.find((option) => option.selected);
  const sensitive = group.members.map((member) => safeValueOf(member).sensitive).find((value) => value !== "none") ?? "none";
  const value: RawElement = {
    id: "",
    frameId,
    category: "field",
    tag: root.localName,
    inputType: "radio",
    role: "radiogroup",
    labelCandidates: labels,
    ...(root.getAttribute("name") ? { name: boundedText(root.getAttribute("name"), 200, 200) } : {}),
    ...(error.describedBy ? { describedBy: error.describedBy } : {}),
    required: required.required,
    requiredSource: required.requiredSource,
    invalid: error.invalid,
    errorText: error.errorText,
    value: sensitive === "none" ? selected?.value ?? null : null,
    hasValue: selected !== undefined,
    options,
    sensitive,
    disabled: group.members.every(isDisabled),
    visible: group.members.some(isVisible),
    ...(groupText(root) ? { group: groupText(root)! } : {}),
    order: group.order,
    kind: "select",
  };
  return assignId(root, value);
}

function pageUrlOf(document: Document): string {
  try {
    const url = new URL(document.location.href);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "about:blank";
  }
}

/** Walk native controls and explicit custom widgets in composed DOM order. */
export function walkDocument(document: Document, options: WalkOptions = {}): RawElement[] {
  const frameId = options.frameId ?? 0;
  const pageUrl = pageUrlOf(document);
  const { elements } = composedElements(document, options);
  const found: Array<FoundElement | RadioGroup | AriaRadioGroup> = [];
  const radioScopes = new Map<Node, Map<string, RadioGroup>>();
  const ariaRadioGroups = new Map<Element, AriaRadioGroup>();
  const elementOrder = new Map(elements.map((element, index) => [element, index]));

  elements.forEach((element, order) => {
    if (isHiddenInput(element)) return;
    const inputType = inputTypeOf(element);
    const role = explicitRole(element);
    if (role === "radio" && !(element.localName === "input" && inputType === "radio")) {
      const owner = ariaRadioOwner(element, elements);
      let group = ariaRadioGroups.get(owner);
      if (!group) {
        group = { element: owner, order: elementOrder.get(owner) ?? order, ariaRadio: true, members: [] };
        ariaRadioGroups.set(owner, group);
      }
      group.members.push(element);
      return;
    }
    if (role === "radiogroup") return;
    if (element.localName === "input" && inputType === "radio") {
      const radio = element as HTMLInputElement;
      const key = radioGroupKey(radio, order);
      let byName = radioScopes.get(key.scope);
      if (!byName) {
        byName = new Map();
        radioScopes.set(key.scope, byName);
      }
      let group = byName.get(key.key);
      if (!group) {
        group = { element: radio.closest("fieldset") ?? radio, order, name: radio.name, members: [], groupRoot: radio.closest("fieldset") ?? radio };
        byName.set(key.key, group);
      }
      group.members.push(radio);
      return;
    }

    if (element.localName === "input" || element.localName === "textarea" || element.localName === "select" || isCustomField(element)) {
      if (isActionElement(element, inputType)) return;
      found.push({ element, order });
      return;
    }
    if (isActionElement(element, inputType)) found.push({ element, order });
  });

  for (const byName of radioScopes.values()) found.push(...byName.values());
  found.push(...ariaRadioGroups.values());

  const raw = found.map((entry) => {
    if ("ariaRadio" in entry) return ariaRadioRaw(entry, frameId);
    if ("members" in entry) return radioRaw(entry, frameId);
    if (isActionElement(entry.element)) return actionRaw(entry.element, entry.order, frameId, pageUrl);
    return valueRaw(entry.element, entry.order, frameId);
  });
  return raw.sort((left, right) => left.order - right.order);
}
