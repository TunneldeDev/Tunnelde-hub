import { resolve } from "node:path";
import { syncSdk } from "../sync-sdk.mjs";

const [application, sdk] = process.argv.slice(2);
if (!application || !sdk) throw new Error("Expected application and SDK paths");
const catalogue = await syncSdk(resolve(application), {
  check: true,
  sdkDirectory: resolve(sdk),
});
console.log(`Release SDK catalogue matches ${catalogue.methods.length} application methods.`);
