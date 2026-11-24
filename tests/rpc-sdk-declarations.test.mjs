import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { loadRpcDeclarations } from "../scripts/sdk/rpc/declarations.mjs";
import { checkMethodTypes, syncSdk } from "../scripts/sync-sdk.mjs";

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "tunnelde-rpc-declarations-"));
  const sdk = join(root, "sdk");
  const write = async (name, text) => {
    const path = join(sdk, name); await mkdir(dirname(path), { recursive: true }); await writeFile(path, text);
  };
  try {
    await write("tunnelde-plugin.d.mts", 'export type * from "./rpc/transport/methodMap.mjs";\nexport type * from "./rpc/workbench/layout.mjs";\n');
    await write("rpc/transport/methodMap.d.mts", 'import type { WorkbenchMethodMap } from "../workbench/methods.mjs";\nexport interface HostMethodMap extends WorkbenchMethodMap {}\n');
    await write("rpc/workbench/methods.d.mts", 'import type { PluginWorkspaceSnapshot } from "./layout.mjs";\nexport interface WorkbenchMethodMap {\n  "workspace.snapshot": [Record<string, never>, PluginWorkspaceSnapshot];\n}\n');
    await write("rpc/workbench/layout.d.mts", '// BEGIN GENERATED WORKSPACE V1 TYPES\nexport interface PluginWorkspaceSnapshot { tabs: string[] }\n// END GENERATED WORKSPACE V1 TYPES\n');
    await run(root, sdk, write);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("RPC declaration projections retain file boundaries and validate the entire composed method map", async () => {
  await fixture(async (_, sdk) => {
    const declarations = await loadRpcDeclarations(sdk);
    const catalogue = { methods: [{ name: "workspace.snapshot" }] };
    checkMethodTypes(declarations.source, catalogue);
    assert.deepEqual(new Map(declarations.project(declarations.source)), declarations.files);
    const changed = declarations.source.replace("tabs: string[]", "tabs: number[]");
    const output = new Map(declarations.project(changed));
    assert.match(output.get("rpc/workbench/layout.d.mts"), /tabs: number\[\]/);
    assert.equal(output.get("tunnelde-plugin.d.mts"), declarations.files.get("tunnelde-plugin.d.mts"));
    assert.throws(() => checkMethodTypes(declarations.source.replace("extends WorkbenchMethodMap", "extends MissingMethodMap"), catalogue), /Uncomposed/);
    assert.throws(() => checkMethodTypes(declarations.source + '\nexport interface ExtraMethodMap {\n  "forgotten": [{}, null];\n}\n', catalogue), /Uncomposed/);
    assert.throws(() => declarations.project(changed.replace("// SDK DECLARATION FILE rpc/workbench/layout.d.mts", "// altered")), /boundaries/);
  });
});

test("SDK synchronization updates generated DTOs inside their owning domain", async () => {
  await fixture(async (root, sdk) => {
    const app = join(root, "app");
    await mkdir(join(app, "src-tauri/src/plugins"), { recursive: true });
    await mkdir(join(app, "src/lib/plugins"), { recursive: true });
    await writeFile(join(app, "package.json"), JSON.stringify({ version: "0.26.1" }));
    await writeFile(join(app, "src-tauri/src/plugins/api.rs"), 'pub const METHODS: &[ApiMethod] = &[\n stable_method!("workspace.snapshot", ["workspace.read"], "{}", "Snapshot.", "0.21.0"),\n];');
    const path = join(sdk, "rpc/workbench/layout.d.mts");
    const original = await readFile(path, "utf8"), updated = original.replace("tabs: string[]", "tabs: number[]");
    await writeFile(join(app, "src/lib/plugins/workspace.ts"), updated);
    await assert.rejects(syncSdk(app, { sdkDirectory: sdk, check: true }), /DTOs differ/);
    assert.equal(await readFile(path, "utf8"), original);
    await syncSdk(app, { sdkDirectory: sdk });
    assert.equal(await readFile(path, "utf8"), updated);
    await syncSdk(app, { sdkDirectory: sdk, check: true });
  });
});

test("RPC declaration graph rejects private imports, cycles and unreachable files", async () => {
  for (const [name, text, error] of [
    ["rpc/workbench/layout.d.mts", 'import type { Private } from "@/private";', /private/],
    ["rpc/workbench/layout.d.mts", 'import type { HostMethodMap } from "../transport/methodMap.mjs";', /cycle/],
    ["rpc/workbench/layout.d.mts", 'export type X = import("private").X;', /unsupported/],
    ["rpc/workbench/orphan.d.mts", 'export interface Orphan {}', /unreachable/],
    ["tunnelde-plugin.d.mts", 'export type * from "./rpc/workbench/layout.mjs";\nexport interface Business {}', /only re-exports/],
  ]) await fixture(async (_, sdk, write) => {
    await write(name, text);
    await assert.rejects(loadRpcDeclarations(sdk), error);
  });
});
