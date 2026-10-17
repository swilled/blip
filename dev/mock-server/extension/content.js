// This content script is restricted to the local broken-form demo. It snapshots the live DOM and
// performs only fill/select/check/focus operations. Clicks, including the submit button, are refused.
let snapshotVersion = 1;
let nextElementId = 1;
let writingFromBlip = false;
let changeTimer = null;

const isVisible = (element) => {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
};

function stableId(element) {
  if (!element.dataset.blipId) element.dataset.blipId = `e${nextElementId++}`;
  return element.dataset.blipId;
}

function clean(text, max = 200) {
  return String(text ?? "").replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function labelCandidates(element) {
  const candidates = [];
  const aria = element.getAttribute("aria-label");
  if (aria) candidates.push({ text: clean(aria), source: "aria", confidence: 1 });
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
    if (clean(text)) candidates.push({ text: clean(text), source: "aria", confidence: 1 });
  }
  const explicit = Array.from(element.labels ?? []).map((label) => clean(label.textContent)).filter(Boolean).join(" ");
  if (explicit) candidates.push({ text: explicit, source: "label", confidence: 1 });
  const fieldset = element.closest("fieldset");
  const legend = fieldset?.querySelector(":scope > legend");
  if (legend && clean(legend.textContent)) candidates.push({ text: clean(legend.textContent), source: "nearby-text", confidence: 0.7 });
  if (!explicit && !legend) {
    const container = element.closest(".field, fieldset, [role=group]") ?? element.parentElement;
    if (container) {
      const text = Array.from(container.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE || (node.nodeType === Node.ELEMENT_NODE && !node.contains(element)))
        .map((node) => node.textContent ?? "").join(" ");
      const nearby = clean(text).replace(/\*/g, "").replace(/\brequired\b/gi, "").trim();
      if (nearby) candidates.push({ text: nearby, source: "nearby-text", confidence: 0.7 });
    }
  }
  const placeholder = element.getAttribute("placeholder");
  if (placeholder) candidates.push({ text: clean(placeholder), source: "placeholder", confidence: 0.5 });
  const autocomplete = element.getAttribute("autocomplete");
  if (autocomplete === "email") candidates.push({ text: "Email address", source: "inferred", confidence: 0.45 });
  if (autocomplete === "tel") candidates.push({ text: "Phone number", source: "inferred", confidence: 0.45 });
  if (autocomplete === "name" || autocomplete === "given-name" || autocomplete === "family-name") {
    candidates.push({ text: "Name", source: "inferred", confidence: 0.45 });
  }
  return candidates;
}

function requiredInfo(element, label) {
  if (element.required || element.getAttribute("aria-required") === "true") {
    return { required: true, requiredSource: element.required ? "attr" : "aria" };
  }
  if (/\*/.test(label) || /\brequired\b/i.test(label)) return { required: true, requiredSource: "asterisk" };
  return { required: false, requiredSource: "none" };
}

function sensitivity(element) {
  const autocomplete = (element.getAttribute("autocomplete") ?? "").toLowerCase();
  const type = (element.getAttribute("type") ?? "").toLowerCase();
  if (type === "password") return "password";
  if (autocomplete.includes("one-time-code")) return "otp";
  if (autocomplete.includes("cc-number")) return "card-number";
  if (autocomplete.includes("cc-csc")) return "card-cvc";
  if (autocomplete.includes("ssn") || autocomplete.includes("tax-id")) return "ssn";
  return "none";
}

function labelText(element) {
  return [
    ...Array.from(element.labels ?? []).map((label) => label.textContent ?? ""),
    element.getAttribute("aria-label") ?? "",
    element.getAttribute("placeholder") ?? "",
  ].join(" ");
}

function optionsFor(select) {
  return Array.from(select.options).map((option) => ({
    value: option.value,
    label: clean(option.label || option.textContent),
    selected: option.selected,
  }));
}

function radioOptions(radios) {
  return radios.map((radio) => ({
    value: radio.value,
    label: clean(Array.from(radio.labels ?? []).map((label) => label.textContent).join(" ") || radio.parentElement?.textContent),
    selected: radio.checked,
  }));
}

function getFieldsAndActions() {
  const elements = [];
  const seenRadioNames = new Set();
  const documentOrder = new Map(Array.from(document.querySelectorAll("*"), (element, index) => [element, index]));
  const controls = Array.from(document.querySelectorAll("input, select, textarea, [role=textbox], [role=combobox], [role=checkbox]"));

  for (const element of controls) {
    const type = (element.getAttribute("type") ?? (element.tagName === "INPUT" ? "text" : "")).toLowerCase();
    if (type === "hidden" || !isVisible(element) || element.disabled) continue;
    if (type === "radio") {
      const name = element.name || stableId(element);
      if (seenRadioNames.has(name)) continue;
      seenRadioNames.add(name);
      const radios = controls.filter((candidate) => candidate instanceof HTMLInputElement && candidate.type === "radio" && (candidate.name || stableId(candidate)) === name && isVisible(candidate));
      const first = radios[0] ?? element;
      const labels = labelCandidates(first);
      const groupContainer = first.closest(".field, fieldset, [role=group]");
      const groupText = clean(groupContainer?.textContent ?? "").replace(/\b(low|medium|high)\b/gi, " ").trim();
      if (groupText && labels.length === 0) labels.push({ text: groupText, source: "nearby-text", confidence: 0.7 });
      first.dataset.blipKind = "select";
      const required = radios.some((radio) => radio.required || radio.getAttribute("aria-required") === "true");
      elements.push({
        id: stableId(first), frameId: 0, category: "field", tag: "input", inputType: "radio", role: "radiogroup",
        labelCandidates: labels, ...(first.name ? { name: first.name } : {}), required, kind: "select",
        requiredSource: required ? "attr" : "none", invalid: radios.some((radio) => radio.getAttribute("aria-invalid") === "true"),
        errorText: null, value: radios.find((radio) => radio.checked)?.value ?? null,
        hasValue: radios.some((radio) => radio.checked), options: radioOptions(radios), sensitive: "none", disabled: false,
        visible: true, order: documentOrder.get(first) ?? 0,
      });
      continue;
    }
    const sensitive = sensitivity(element);
    const labels = labelCandidates(element);
    const candidateText = labels.map((candidate) => candidate.text).join(" ");
    const req = requiredInfo(element, candidateText);
    const role = element.tagName === "SELECT" ? "combobox" : type === "checkbox" ? "checkbox" : type === "number" ? "spinbutton" : "textbox";
    const kind = element.tagName === "SELECT" ? "select" : type === "checkbox" ? "check" : "fill";
    element.dataset.blipKind = kind;
    const field = {
      id: stableId(element), frameId: 0, category: "field", tag: element.tagName.toLowerCase(),
      ...(type ? { inputType: type } : {}), role, labelCandidates: labels,
      ...(element.getAttribute("aria-describedby") ? {
        describedBy: clean(element.getAttribute("aria-describedby").split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" "), 300),
      } : {}),
      ...(element.getAttribute("name") ? { name: element.getAttribute("name") } : {}),
      ...(element.getAttribute("autocomplete") ? { autocomplete: element.getAttribute("autocomplete") } : {}),
      ...req, invalid: element.getAttribute("aria-invalid") === "true", errorText: null, kind,
      value: sensitive === "none" && type !== "checkbox" ? (element.value ?? "") : null,
      hasValue: type === "checkbox" ? element.checked : (element.value ?? "") !== "",
      ...(type === "checkbox" ? { checked: element.checked } : {}),
      ...(element.tagName === "SELECT" ? { options: optionsFor(element) } : {}),
      sensitive, disabled: false, visible: true, order: documentOrder.get(element) ?? 0,
    };
    elements.push(field);
  }

  const actions = Array.from(document.querySelectorAll("button, a[href], input[type=submit], input[type=button], [role=button]"))
    .filter((element) => isVisible(element) && !element.disabled)
    .map((element) => ({
      id: stableId(element), frameId: 0, category: "action", tag: element.tagName.toLowerCase(),
      ...(element.getAttribute("type") ? { inputType: element.getAttribute("type") } : {}),
      role: element.getAttribute("role") || (element.tagName === "A" ? "link" : "button"), labelCandidates: [],
      required: false, requiredSource: "none", invalid: false, errorText: null, value: null,
      hasValue: false, sensitive: "none", disabled: false, visible: true,
      text: clean(element.innerText || element.textContent, 200), order: documentOrder.get(element) ?? 0,
      ...(element.tagName === "A" ? { href: element.href } : {}),
    }));
  return [...elements, ...actions]
    .sort((a, b) => a.order - b.order)
    .map((element, index) => ({ ...element, order: index + 1 }));
}

function hashStructure(elements) {
  const input = elements.map((element) => [element.tag, element.inputType ?? "", element.name ?? "", element.role, element.labelCandidates[0]?.text ?? ""].join(":" )).join("|");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return `blip-${(hash >>> 0).toString(16)}`;
}

function createSnapshot(tabId) {
  const elements = getFieldsAndActions();
  const structuralHash = hashStructure(elements);
  return {
    snapshotId: `demo-${tabId}-${snapshotVersion}`,
    version: snapshotVersion,
    tabId,
    url: location.href,
    origin: location.origin,
    title: document.title,
    headings: Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).slice(0, 40).map((heading) => ({
      level: Number(heading.tagName.slice(1)), text: clean(heading.textContent, 200),
    })),
    alerts: Array.from(document.querySelectorAll('[role="alert"],[role="status"],[aria-live]'))
      .filter(isVisible).slice(0, 20).map((alert) => clean(alert.textContent, 300)).filter(Boolean),
    elements: elements.slice(0, 250),
    truncated: elements.length > 250,
    structuralHash,
    capturedAt: Date.now(),
  };
}

function reportChange() {
  if (writingFromBlip) return;
  snapshotVersion += 1;
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => {
    const snapshot = createSnapshot(-1);
    chrome.runtime.sendMessage({ kind: "blip.page-changed", structuralHash: snapshot.structuralHash });
  }, 500);
}

function findTarget(id) {
  return Array.from(document.querySelectorAll("[data-blip-id]")).find((element) => element.dataset.blipId === id);
}

function setValue(element, value) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) return false;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function act(request) {
  const { actId, snapshotVersion: requestedVersion, expectedKind, action } = request;
  const fail = (error, extra = {}) => ({ actId, ok: false, error, ...extra });
  if (requestedVersion !== snapshotVersion) return fail("stale-snapshot", { newSnapshotVersion: snapshotVersion });
  const target = findTarget(action.targetId);
  if (!target) return fail("target-not-found");
  if (target.disabled) return fail("disabled");
  if (action.op === "click") return fail("gate-required");
  const sensitive = sensitivity(target);
  const liveKind = target.dataset.blipKind;
  if (sensitive !== "none" && ["fill", "select", "check"].includes(action.op)) return fail("sensitive-field");
  if (expectedKind !== liveKind && action.op !== "focus" && action.op !== "click") return fail("kind-mismatch", { liveKind });

  writingFromBlip = true;
  let result;
  try {
    if (action.op === "fill") {
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) || expectedKind !== "fill") return fail("kind-mismatch");
      if (!setValue(target, action.value)) return fail("exception");
      result = { actId, ok: true, observedValue: target.value, liveKind };
    } else if (action.op === "select") {
      if (target instanceof HTMLSelectElement && expectedKind === "select") {
        if (!Array.from(target.options).some((option) => option.value === action.optionValue)) return fail("exception", { detail: "no such option" });
        if (!setValue(target, action.optionValue)) return fail("exception");
        result = { actId, ok: true, observedValue: target.value, liveKind };
      } else if (target instanceof HTMLInputElement && target.type === "radio" && expectedKind === "select") {
        const group = Array.from(document.querySelectorAll('input[type="radio"]')).find((radio) => radio.name === target.name && radio.value === action.optionValue);
        if (!group) return fail("exception", { detail: "no such option" });
        group.checked = true;
        group.dispatchEvent(new Event("input", { bubbles: true }));
        group.dispatchEvent(new Event("change", { bubbles: true }));
        result = { actId, ok: true, observedValue: group.value, liveKind };
      } else return fail("kind-mismatch");
    } else if (action.op === "check") {
      if (!(target instanceof HTMLInputElement) || target.type !== "checkbox" || expectedKind !== "check") return fail("kind-mismatch");
      target.checked = action.checked;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      result = { actId, ok: true, observedValue: String(target.checked), liveKind };
    } else if (action.op === "focus") {
      target.focus();
      target.scrollIntoView({ block: "center" });
      result = { actId, ok: true, observedValue: sensitive === "none" ? (target.value ?? null) : null, liveKind };
    } else {
      return fail("exception");
    }
  } finally {
    writingFromBlip = false;
  }
  snapshotVersion += 1;
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => {
    const snapshot = createSnapshot(-1);
    chrome.runtime.sendMessage({ kind: "blip.page-changed", structuralHash: snapshot.structuralHash });
  }, 500);
  return result;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.kind === "blip.page-status") {
    sendResponse({ structuralHash: createSnapshot(-1).structuralHash });
  } else if (message?.kind === "blip.snapshot") {
    sendResponse({ snapshot: createSnapshot(Number.isInteger(message.tabId) ? message.tabId : -1) });
  } else if (message?.kind === "blip.act") {
    sendResponse({ result: act(message.request) });
  }
});

document.addEventListener("input", reportChange, true);
document.addEventListener("change", reportChange, true);
chrome.runtime.sendMessage({ kind: "blip.page-ready", structuralHash: createSnapshot(-1).structuralHash });
