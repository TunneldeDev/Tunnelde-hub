import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { syncSdk } from "../scripts/sync-sdk.mjs";

test("SDK check detects host and documentation drift without changing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tunnelde-sdk-check-"));
  const app = join(root, "app");
  const sdk = join(root, "sdk");
  try {
    await mkdir(join(app, "src-tauri/src/plugins"), { recursive: true });
    await mkdir(sdk);
    await writeFile(join(app, "package.json"), JSON.stringify({ version: "0.29.0" }));
    const host = join(app, "src-tauri/src/plugins/api.rs");
    const source = 'pub const METHODS: &[ApiMethod] = &[\n    method!("api.describe", [], "{}", "Discover methods."),\n];\n';
    await writeFile(host, source);
    await syncSdk(app, { sdkDirectory: sdk });
    await syncSdk(app, { sdkDirectory: sdk, check: true });
    const previous = await readFile(join(sdk, "api.json"), "utf8");
    await writeFile(host, source.replace("Discover methods.", "Changed behavior."));
    await assert.rejects(syncSdk(app, { sdkDirectory: sdk, check: true }), /api.json differs/);
    assert.equal(await readFile(join(sdk, "api.json"), "utf8"), previous);
    await writeFile(host, source);
    await writeFile(join(sdk, "api.md"), "stale\n");
    await assert.rejects(syncSdk(app, { sdkDirectory: sdk, check: true }), /api.md differs/);
    assert.equal(await readFile(join(sdk, "api.md"), "utf8"), "stale\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
