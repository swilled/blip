import type { FormModel } from "@blip/protocol";
import { z } from "zod";

const RepairFieldSchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().max(120).optional(),
  group: z.string().max(120).optional(),
  confidence: z.number().finite().min(0).max(1).optional(),
}).strict();

export const RepairPatchSchema = z.object({
  title: z.string().max(200).optional(),
  fields: z.array(RepairFieldSchema).max(250),
}).strict();

export type RepairPatch = z.infer<typeof RepairPatchSchema>;

/** Parse the strict descriptive boundary without echoing untrusted provider content. */
export function parseRepairPatch(value: unknown): RepairPatch | null {
  const parsed = RepairPatchSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function pageIdentity(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

function fieldIds(model: FormModel): Set<string> | null {
  const ids = model.fields.map((field) => field.id);
  const unique = new Set(ids);
  return unique.size === ids.length ? unique : null;
}

/**
 * Validate a provider/cache patch against both the request's captured model and current accepted
 * model. A completion for another page shape is discarded even when its individual IDs happen to
 * overlap.
 */
export function validateRepairPatch(
  value: unknown,
  captured: FormModel,
  current: FormModel,
): RepairPatch | null {
  const patch = parseRepairPatch(value);
  if (patch === null) return null;

  const capturedIdentity = pageIdentity(captured.url);
  const currentIdentity = pageIdentity(current.url);
  if (
    capturedIdentity === null ||
    capturedIdentity !== currentIdentity ||
    captured.structuralHash !== current.structuralHash
  ) return null;

  const capturedIds = fieldIds(captured);
  const currentIds = fieldIds(current);
  if (
    capturedIds === null ||
    currentIds === null ||
    capturedIds.size !== currentIds.size ||
    [...capturedIds].some((id) => !currentIds.has(id))
  ) return null;

  const patchIds = new Set(patch.fields.map((field) => field.id));
  if (patchIds.size !== patch.fields.length) return null;
  if (patch.fields.some((field) => !capturedIds.has(field.id) || !currentIds.has(field.id))) return null;
  const hasSuggestion = patch.title !== undefined || patch.fields.some(({ label, group, confidence }) =>
    label !== undefined || group !== undefined || confidence !== undefined,
  );
  return hasSuggestion ? patch : null;
}
