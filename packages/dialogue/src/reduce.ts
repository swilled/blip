import type { DialogueContext, DialogueState, Effect } from "./effects";
import type { DialogueEvent } from "./events";

// Pure grammar-first reducer. No IO, no clock. Page text (the title) is data and is sanitized
// before it is spoken; only counts are spoken, never field labels or values.

const WHATS_HERE = [
  /^whats here$/,
  /^what is here$/,
  /^what is on this page$/,
  /^whats on this page$/,
  /^whats on the page$/,
  /^what is on the page$/,
  /^what is this page$/,
  /^whats on this form$/,
  /^what is on this form$/,
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(title: string): string {
  // eslint-disable-next-line no-control-regex
  return title.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function describe(form: NonNullable<DialogueContext["form"]>): string {
  const title = cleanTitle(form.title);
  const required = form.fields.filter((f) => f.required).length;
  const actions = plural(form.actions.length, "action", "actions");
  if (form.fields.length === 0) return `${title}. No fields, ${actions}.`;
  return `${title}. ${plural(form.fields.length, "field", "fields")}, ${required} required, ${actions}.`;
}

export function reduce(
  state: DialogueState,
  event: DialogueEvent,
  ctx: DialogueContext,
): { state: DialogueState; effects: Effect[] } {
  if (event.type !== "utterance") return { state, effects: [] };
  const raw = event.utterance.text;
  const norm = normalize(raw);
  if (norm === "") return { state, effects: [] };

  if (WHATS_HERE.some((re) => re.test(norm))) {
    const text = ctx.form === null ? "I can't see a page yet." : describe(ctx.form);
    return {
      state: { ...state, lastSpoken: text },
      effects: [{ kind: "speak", text, category: "answer", interruptible: true }],
    };
  }
  return { state, effects: [{ kind: "parseIntent", text: raw }] };
}
