import process from "node:process";
import { runConnectionSmoke } from "../apps/extension/test/e2e/harness.js";

const result = await runConnectionSmoke();
process.stdout.write(
  `extension connection bound in ${result.browser}\nOrigin: ${result.extensionOrigin}\nServer: ${result.log}\n`,
);
