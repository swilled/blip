// Regenerates packages/protocol/fixtures/booking.formmodel.json from the baseline builder.
// The golden is generated, never hand-written, so the golden test only catches real builder drift.
// Run: npm run fixtures:update
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Snapshot } from "@blip/protocol";
import { buildBaselineFormModel } from "../apps/server/src/baseline/index";

const fixtures = new URL("../packages/protocol/fixtures/", import.meta.url);
const snapshotPath = fileURLToPath(new URL("booking.snapshot.json", fixtures));
const goldenPath = fileURLToPath(new URL("booking.formmodel.json", fixtures));

const snapshot = Snapshot.parse(JSON.parse(readFileSync(snapshotPath, "utf8")));
const model = buildBaselineFormModel(snapshot);
writeFileSync(goldenPath, JSON.stringify(model, null, 2) + "\n");
console.log(`wrote ${goldenPath}: ${model.fields.length} fields, ${model.actions.length} actions`);
