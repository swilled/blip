// Regenerates the voice-owned survey FormModel from its raw snapshot and core baseline builder.
// Reads core code, edits none; the model fixture is generated rather than hand-authored.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FormModel, Snapshot } from "@blip/protocol";
import { buildBaselineFormModel } from "../apps/server/src/baseline/index";

const formsDir = new URL("../fixtures/forms/", import.meta.url);
const snapshotPath = fileURLToPath(new URL("broken.snapshot.json", formsDir));
const outPath = fileURLToPath(new URL("survey-form.model.json", formsDir));

mkdirSync(fileURLToPath(formsDir), { recursive: true });
const snapshot = Snapshot.parse(JSON.parse(readFileSync(snapshotPath, "utf8")));
const model = FormModel.parse(buildBaselineFormModel(snapshot));
writeFileSync(outPath, JSON.stringify(model, null, 2) + "\n");
console.log(
  `wrote ${outPath}: title=${JSON.stringify(model.title)} fields=${model.fields.length} required=${model.fields.filter((field) => field.required).length} actions=${model.actions.length}`,
);
