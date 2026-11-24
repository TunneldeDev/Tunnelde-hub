import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { test } from "node:test";
import { loadUiContracts, contractDependencies, checkUiContractFiles } from "../scripts/sdk/ui-contracts.mjs";

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "tunnelde-public-types-"));
  const base = join(root, "src/lib/extensions");
  const write = async (name, source) => {
    await mkdir(dirname(join(base, name)), { recursive: true });
    await writeFile(join(base, name), source);
  };
  try { await run(root, write); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test("UI dependency mirroring preserves domain paths and supports the legacy single-file host", async () => {
  await fixture(async (root, write) => {
    const legacy = 'export interface UiSdk { readonly version: "0.1.0"; }\n';
    await write("uiSdkContract.ts", legacy);
    assert.equal((await loadUiContracts(root)).artifacts.find(([name]) => name === "tunnelde-ui.d.mts")[1], legacy);
    await write("uiSdkContract.ts", '// export type * from "./contracts/frontend/context.js";\nexport type * from "./contracts/frontend/context.js";\n');
    await write("contracts/frontend/context.ts", 'import type { Scope } from "../runtime/scope.js";\nexport interface Context { scope: Scope }\n');
    await write("contracts/runtime/scope.ts", 'export interface Scope { dispose(): void; }\n');
    const graph = await loadUiContracts(root), artifacts = new Map(graph.artifacts);
    assert.equal(artifacts.get("tunnelde-ui.d.mts"), '// export type * from "./contracts/frontend/context.js";\nexport type * from "./ui/frontend/context.mjs";\n');
    assert.match(artifacts.get("ui/frontend/context.d.mts"), /from "\.\.\/runtime\/scope\.mjs"/);
    const manifest = JSON.parse(artifacts.get("ui-contracts.json"));
    assert.deepEqual(manifest.dependencies["ui/frontend/context.d.mts"], ["ui/runtime/scope.d.mts"]);
    assert.match(graph.declarations, /interface Scope/);
  });
});

test("public graph rejects private, unknown, runtime and indirect import forms", () => {
  for (const source of [
    'import { Private } from "./private.js";',
    'import "./side-effect.js";',
    'export * from "./private.js";',
    'export type X = import("./private.js").X;',
    'const x = require("private");',
    'export namespace X {}',
    'declare module "private" {}',
  ]) assert.throws(() => contractDependencies(source, "example.ts"), /unsupported|types only/);
  assert.deepEqual(contractDependencies('// import "private";\n/** import("private") */\nexport type Text = "import private";', "example.ts"), []);
});

test("public graph rejects dangling dependencies, escapes, aliases, cycles and unexported contracts", async () => {
  for (const specifier of ["@/store/private", "node:fs", "../private.js", "./contracts/private.js", "./contracts/runtime/missing.js"]) {
    await fixture(async (root, write) => {
      await write("uiSdkContract.ts", `export type * from "${specifier}";\n`);
      await assert.rejects(loadUiContracts(root), /private types|ENOENT/);
    });
  }
  await fixture(async (root, write) => {
    await write("uiSdkContract.ts", 'export type * from "./contracts/runtime/a.js";');
    await write("contracts/runtime/a.ts", 'export type * from "./b.js";');
    await write("contracts/runtime/b.ts", 'export type * from "./a.js";');
    await assert.rejects(loadUiContracts(root), /cycle/);
    await write("contracts/runtime/b.ts", 'export interface B {}');
    await write("contracts/runtime/orphan.ts", 'export interface Orphan {}');
    await assert.rejects(loadUiContracts(root), /unreachable/);
  });
});

test("the generated subtree refuses retired files rather than leaving stale SDK entry points", async () => {
  const root = await mkdtemp(join(tmpdir(), "tunnelde-sdk-files-"));
  try {
    await mkdir(join(root, "ui/runtime"), { recursive: true });
    await writeFile(join(root, "ui/runtime/old.d.mts"), "export interface Old {}\n");
    await assert.rejects(checkUiContractFiles(root, []), /Obsolete/);
    assert.equal(await readFile(join(root, "ui/runtime/old.d.mts"), "utf8"), "export interface Old {}\n");
    await checkUiContractFiles(root, [["ui/runtime/old.d.mts", ""]]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
