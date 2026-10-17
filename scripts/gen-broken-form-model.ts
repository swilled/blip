// Regenerates fixtures/forms/broken-form.model.json from core's broken snapshot and baseline builder.
// Voice-owned script; reads core code, edits none. The fixture is generated, never hand-written.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FormModel } from "@blip/protocol";
import { loadSnapshot } from "@blip/protocol/fixtures-loader";
import { buildBaselineFormModel } from "../apps/server/src/baseline/index";

const outDir = new URL("../fixtures/forms/", import.meta.url);
mkdirSync(fileURLToPath(outDir), { recursive: true });
const outPath = fileURLToPath(new URL("broken-form.model.json", outDir));

const model = FormModel.parse(buildBaselineFormModel(loadSnapshot("broken")));
writeFileSync(outPath, JSON.stringify(model, null, 2) + "\n");
console.log(
  `wrote ${outPath}: title=${JSON.stringify(model.title)} fields=${model.fields.length} required=${model.fields.filter((f) => f.required).length} actions=${model.actions.length}`,
);
