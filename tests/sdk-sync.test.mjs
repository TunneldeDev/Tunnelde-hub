import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { checkMethodTypes, loadRustCatalogue, parseRustCatalogue, syncSdk } from "../scripts/sync-sdk.mjs";

const run = promisify(execFile);
const releaseCheck = fileURLToPath(new URL("../scripts/ci/check-release-sdk.mjs", import.meta.url));

test("core contracts are copied completely and fail closed on missing or unmatched schemas", () => {
  const source = 'const CORE_CONTRACTS: &str = include_str!("contracts/core-v1.json");\npub const METHODS: &[ApiMethod] = &[\n stable_method!("example", [], "{}", "Example.", "0.31.0"),\n];';
  const contract = { version: 1, inputSchema: { type: "object" }, resultSchema: { type: "null" }, errorSchema: { type: "object" }, knownErrors: [], events: [] };
  const contracts = { version: 1, methods: { example: contract } };
  assert.deepEqual(parseRustCatalogue(source, contracts).methods[0].contract, contract);
  assert.throws(() => parseRustCatalogue(source), /contracts are missing/);
  assert.throws(() => parseRustCatalogue(source, { ...contracts, version: 2 }), /contract version/);
  assert.throws(() => parseRustCatalogue(source, { version: 1, methods: {} }), /no core contract/);
  assert.throws(() => parseRustCatalogue(source, { version: 1, methods: { missing: contract } }), /unknown or non-stable/);
  assert.throws(() => parseRustCatalogue(source, { version: 1, methods: { example: { ...contract, resultSchema: [] } } }), /resultSchema/);
  assert.throws(() => parseRustCatalogue(source.replace('stable_method!("example", [], "{}", "Example.", "0.31.0")', 'method!("example", [], "{}", "Example.")'), contracts), /unknown or non-stable/);
});

test("catalogue loading requires the schema embedded by the chosen application checkout", async () => {
  const root = await mkdtemp(join(tmpdir(), "tunnelde-core-contract-"));
  const directory = join(root, "src-tauri/src/plugins");
  try {
    await mkdir(join(directory, "contracts"), { recursive: true });
    await writeFile(join(directory, "api.rs"), 'const CORE_CONTRACTS: &str = include_str!("contracts/core-v1.json");\npub const METHODS: &[ApiMethod] = &[\n stable_method!("example", [], "{}", "Example.", "0.31.0"),\n];');
    await assert.rejects(loadRustCatalogue(root), /ENOENT/);
    const contract = { version: 1, inputSchema: {}, resultSchema: {}, errorSchema: {}, knownErrors: [], events: [] };
    await writeFile(join(directory, "contracts/core-v1.json"), JSON.stringify({ version: 1, methods: { example: contract } }));
    assert.deepEqual((await loadRustCatalogue(root)).methods[0].contract, contract);
  } finally { await rm(root, { recursive: true, force: true }); }
});

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

test("stable workspace DTOs synchronize and detect drift without mutating SDK files in check mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "tunnelde-workspace-dto-"));
  const app = join(root, "app");
  const sdk = join(root, "sdk");
  const dtoPath = join(app, "src/lib/plugins/workspace.ts");
  const sdkPath = join(sdk, "tunnelde-plugin.d.mts");
  const declaration = '// BEGIN GENERATED WORKSPACE V1 TYPES\nexport interface PluginWorkspaceSnapshot { tabs: string[] }\n// END GENERATED WORKSPACE V1 TYPES';
  const types = 'export interface HostMethodMap {\n  "workspace.snapshot": [Record<string, never>, PluginWorkspaceSnapshot];\n}\n';
  try {
    await mkdir(join(app, "src-tauri/src/plugins"), { recursive: true });
    await mkdir(join(app, "src/lib/plugins"), { recursive: true });
    await mkdir(sdk);
    await writeFile(join(app, "package.json"), JSON.stringify({ version: "0.21.0" }));
    await writeFile(join(app, "src-tauri/src/plugins/api.rs"), 'pub const METHODS: &[ApiMethod] = &[\n stable_method!("workspace.snapshot", ["workspace.read"], "{}", "Snapshot.", "0.21.0"),\n];');
    await writeFile(sdkPath, types);
    await assert.rejects(syncSdk(app, { sdkDirectory: sdk }), /ENOENT/);
    await writeFile(dtoPath, declaration + '\nexport function projectPluginWorkspace() {}\n');
    await syncSdk(app, { sdkDirectory: sdk });
    const expected = await readFile(sdkPath, "utf8");
    assert.equal(expected, declaration + '\n\n' + types);
    assert.ok(!expected.includes("projectPluginWorkspace"));
    await syncSdk(app, { sdkDirectory: sdk, check: true });
    // Removing or changing a generated declaration must fail before any write.
    for (const changed of [types, expected.replace('tabs: string[]', 'tabs: number[]')]) {
      await writeFile(sdkPath, changed);
      await assert.rejects(syncSdk(app, { sdkDirectory: sdk, check: true }), /DTO/);
      assert.equal(await readFile(sdkPath, "utf8"), changed);
    }
    await syncSdk(app, { sdkDirectory: sdk });
    assert.equal(await readFile(sdkPath, "utf8"), expected);
    await writeFile(sdkPath, expected.replace('never>, PluginWorkspaceSnapshot', 'never>, unknown'));
    await assert.rejects(syncSdk(app, { sdkDirectory: sdk, check: true }), /must return PluginWorkspaceSnapshot/);
    await writeFile(sdkPath, expected);
    for (const invalid of [declaration.replace('END GENERATED', 'BROKEN'), declaration + '\n' + declaration]) {
      await writeFile(dtoPath, invalid);
      await assert.rejects(syncSdk(app, { sdkDirectory: sdk }), /marker/);
      assert.equal(await readFile(sdkPath, "utf8"), expected);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
