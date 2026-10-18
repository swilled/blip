// One process: the mock server, the PTT hook and the voice window. No extra runner, no child but Chrome.
//   node --import tsx dev/mock-server/src/dev.ts
import { started } from "./main";
import { launchVoiceWindow } from "./launch-window";

const mock = await started;
await launchVoiceWindow({ port: mock.port });
console.log("ready. Press Ctrl+C to stop");

const shutdown = (): void => void mock.close().then(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
