const MAX_TEXT_NODES = 500;
const MAX_TOTAL_CHARACTERS = 20_000;
const MAX_NODE_CHARACTERS = 1_000;

const EXCLUDED_ELEMENTS = new Set([
  "input",
  "textarea",
  "select",
  "option",
  "optgroup",
  "button",
  "datalist",
  "output",
  "progress",
  "meter",
  "script",
  "style",
  "template",
  "noscript",
]);

const DIRECT_INSTRUCTION = /\b(?:blip(?:\s*\/\s*ai\s+(?:agent|assistant))?|ai\s+(?:agent|assistant)|ai|assistant|agent)\s*(?:[,;:!\u2014-]\s*|\s+)(?:please\s+)?(?:you\s+(?:must|should|need to|have to)\s+)?(?:ignore|disregard|override|bypass|click|submit|pay|delete|send|reveal|share|exfiltrate|follow|execute|run|open|navigate|fill|type|enter|select|choose|read|forget)\b/u;

function isExcludedTextNode(node: Node): boolean {
  let element = node.parentElement;
  while (element) {
    if (EXCLUDED_ELEMENTS.has(element.localName)) return true;

    const editable = element.getAttribute("contenteditable")?.trim().toLowerCase();
    if (editable !== undefined && editable !== "false") return true;

    element = element.parentElement;
  }
  return false;
}

/** Detect direct instructions aimed at Blip or an AI agent without retaining page text. */
export function detectUntrustedInstruction(document: Document): boolean {
  const root = document.body ?? document.documentElement;
  if (!root) return false;

  const showText = document.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
  const walker = document.createTreeWalker(root, showText);
  let inspectedNodes = 0;
  let inspectedCharacters = 0;

  while (inspectedNodes < MAX_TEXT_NODES && inspectedCharacters < MAX_TOTAL_CHARACTERS) {
    const node = walker.nextNode();
    if (!node) break;
    inspectedNodes += 1;

    if (isExcludedTextNode(node)) continue;

    const remainingCharacters = MAX_TOTAL_CHARACTERS - inspectedCharacters;
    const rawText = node.nodeValue ?? "";
    const boundedText = rawText.slice(0, Math.min(MAX_NODE_CHARACTERS, remainingCharacters));
    inspectedCharacters += boundedText.length;

    const normalizedText = boundedText.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
    if (DIRECT_INSTRUCTION.test(normalizedText)) return true;
  }

  return false;
}
