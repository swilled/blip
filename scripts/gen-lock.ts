// Regenerates packages/protocol/protocol.lock.json from the live registry (D-17).
//
// The lock records the frozen v1 surface: every message type with its senders and receivers, the
// Intent type literals, ActionKind members, DialogueStateName values and the fixture files. The lock
// test fails if any of those is removed or if a message's senders/receivers change; additions pass.
//
// Run: npm run protocol:lock -- ONLY inside a protocol PR that both developers approve.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ActionKind, DialogueStateName, Intent, LabelSource, MESSAGES, PROTOCOL_VERSION, RawLabelSource } from "@blip/protocol";
import type { MessageType } from "@blip/protocol";

const lockPath = fileURLToPath(new URL("../packages/protocol/protocol.lock.json", import.meta.url));

const messages: Record<string, { senders: string[]; receivers: string[] }> = {};
for (const type of Object.keys(MESSAGES).sort() as MessageType[]) {
  messages[type] = {
    senders: [...MESSAGES[type].senders].sort(),
    receivers: [...MESSAGES[type].receivers].sort(),
  };
}

const lock = {
  protocolVersion: PROTOCOL_VERSION,
  frozenAt: new Date().toISOString().slice(0, 10),
  messages,
  intents: Intent.options.map((o) => o.shape.type.value).sort(),
  actionKinds: [...ActionKind.options].sort(),
  dialogueStates: [...DialogueStateName.options].sort(),
  labelSources: {
    raw: [...RawLabelSource.options],
    resolved: [...LabelSource.options],
  },
  fixtures: [
    "booking.snapshot.json",
    "broken.snapshot.json",
    "result-ok.snapshot.json",
    "result-errors.snapshot.json",
    "booking.formmodel.json",
  ],
};

writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
console.log(`wrote ${lockPath}: ${Object.keys(messages).length} message types`);
