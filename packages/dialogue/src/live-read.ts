import { normalizeCommand } from "./normalize";

const LIVE_PAGE_READS = new Set([
  "read the form", "read form", "read the fields",
  "read back", "read it back", "read everything back",
  "whats required", "what is required", "which fields are required", "what fields are required",
  "whats missing", "what is missing", "what do i still need", "what do i need to fill",
  "where am i", "where am i on this page", "where am i in the form",
  "submit", "submit it", "submit the form", "submit survey",
]);

const LIVE_VALUE_PREFIXES = [
  "what is in ", "whats in ", "what is written in ", "whats written in ",
  "what did i enter in ", "what did i put in ", "read the value of ", "read value of ",
];

/** Return the requested field label for a named value question, if the command uses that grammar. */
export function fieldValueRequest(text: string): string | undefined {
  const command = normalizeCommand(text);
  const prefix = LIVE_VALUE_PREFIXES.find((candidate) => command.startsWith(candidate));
  if (prefix === undefined) return undefined;
  return command.slice(prefix.length).trim()
    .replace(/^the\s+/, "")
    .replace(/\s+field$/, "")
    .trim();
}

/** Whether a user utterance needs a fresh browser snapshot before it is answered or acted on. */
export function requiresFreshFormSnapshot(text: string): boolean {
  const command = normalizeCommand(text);
  return LIVE_PAGE_READS.has(command)
    || command === "spell"
    || command.startsWith("spell ")
    || LIVE_VALUE_PREFIXES.some((prefix) => command.startsWith(prefix));
}
