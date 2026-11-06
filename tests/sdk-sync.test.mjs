import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { checkMethodTypes, parseRustCatalogue, syncSdk } from "../scripts/sync-sdk.mjs";

const run = promisify(execFile);
const releaseCheck = fileURLToPath(new URL("../scripts/ci/check-release-sdk.mjs", import.meta.url));

test("catalogue parser rejects unrecognized entries instead of silently dropping them", () => {
  const source = `pub const METHODS: &[ApiMethod] = &[
    // method!("commented.out", [], "{}", "Not a method."),
    method!("api.describe", [], "{}", "Text mentioning method!( or // is harmless."),
    /* The stable method has an explicit introduction version. */
    stable_method!("other", ["app.read"], "{}", "Read.", "0.29.0"),
];`;
  const catalogue = parseRustCatalogue(source);
  assert.deepEqual(catalogue.methods.map(({ name }) => name), ["api.describe", "other"]);
  assert.equal(catalogue.methods[1].stability, "stable");
  assert.equal(catalogue.methods[1].since, "0.29.0");

  for (const entry of [
    'deprecated_method!("old", [], "{}", "Old.", "0.29.0"),',
    'future_macro!("new", [], "{}", "New."),',
    'ApiMethod { name: "new" },',
    'method!("broken", [], "{}"),',
  ]) {
    assert.throws(() => parseRustCatalogue(source.replace('\n];', `\n    ${entry}\n];`)), /Unparsed host method/);
  }
});

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
    await writeFile(join(sdk, "tunnelde-plugin.d.mts"), 'export interface HostMethodMap {\n  "api.describe": [Record<string, never>, unknown];\n}\n');
    await syncSdk(app, { sdkDirectory: sdk });
    await syncSdk(app, { sdkDirectory: sdk, check: true });
    await run(process.execPath, [releaseCheck, app, sdk]);
    const previous = await readFile(join(sdk, "api.json"), "utf8");
    await writeFile(host, source.replace("Discover methods.", "Changed behavior."));
    await assert.rejects(syncSdk(app, { sdkDirectory: sdk, check: true }), /api.json differs/);
    await assert.rejects(run(process.execPath, [releaseCheck, app, sdk]), /api.json differs/);
    assert.equal(await readFile(join(sdk, "api.json"), "utf8"), previous);
    await writeFile(host, source);
    await writeFile(join(sdk, "api.md"), "stale\n");
    await assert.rejects(syncSdk(app, { sdkDirectory: sdk, check: true }), /api.md differs/);
    assert.equal(await readFile(join(sdk, "api.md"), "utf8"), "stale\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SDK method types must cover precisely the host method names", () => {
  const catalogue = { methods: [{ name: "api.describe" }, { name: "log" }] };
  const types = 'export interface HostMethodMap {\n  "api.describe": [\n    Record<string, never>,\n    unknown,\n  ];\n  log: [{ message: string }, void];\n}\n';
  checkMethodTypes(types, catalogue);
  assert.throws(() => checkMethodTypes(types.replace('  log:', '  extra:'), catalogue), /SDK method types differ/);
  assert.throws(() => checkMethodTypes(types.replace('  log:', '  "api.describe":'), catalogue), /Duplicate SDK method type/);
  assert.throws(() => checkMethodTypes(types.replace('  log:', '  [key: string]:'), catalogue), /Unsupported HostMethodMap entry/);
  assert.throws(() => checkMethodTypes("", catalogue), /HostMethodMap was not found/);
});
