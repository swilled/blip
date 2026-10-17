// Fixture loader for tests and tooling. Exposed as the `@blip/protocol/fixtures-loader` subpath and
// deliberately NOT re-exported from index.ts: the browser bundles the index, and the fixtures are
// test data (research anti-pattern). Import attributes keep this free of node: builtins.
import booking from "../fixtures/booking.snapshot.json" with { type: "json" };
import broken from "../fixtures/broken.snapshot.json" with { type: "json" };
import resultOk from "../fixtures/result-ok.snapshot.json" with { type: "json" };
import resultErrors from "../fixtures/result-errors.snapshot.json" with { type: "json" };
import gate07 from "../fixtures/gate-07.snapshot.json" with { type: "json" };
import bookingGolden from "../fixtures/booking.formmodel.json" with { type: "json" };
import { FormModel } from "./form-model";
import { Snapshot } from "./snapshot";

export const FIXTURE_NAMES = ["booking", "broken", "result-ok", "result-errors", "gate-07"] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];

const RAW: Record<FixtureName, unknown> = {
  booking,
  broken,
  "result-ok": resultOk,
  "result-errors": resultErrors,
  "gate-07": gate07,
};

/** A fresh, schema-parsed copy: callers may mutate it. */
export function loadSnapshot(name: FixtureName): Snapshot {
  return Snapshot.parse(structuredClone(RAW[name]));
}

/** The core-generated golden baseline FormModel for the booking fixture (M0 sign-off item 9). */
export function loadFormModelGolden(): FormModel {
  return FormModel.parse(structuredClone(bookingGolden));
}
