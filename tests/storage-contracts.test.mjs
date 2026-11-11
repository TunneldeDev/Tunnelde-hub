import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { syncStorageContracts } from "../scripts/sdk/storage/contracts.mjs";
import { createStorageClient } from "../sdk/storage/client.mjs";

test("storage DTO and schema drift fail check mode without modifying files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tunnelde-storage-contract-")), app = join(root, "app"), sdk = join(root, "sdk");
  const write = async (name, content) => { await mkdir(dirname(name), { recursive: true }); await writeFile(name, content); };
  try {
    const source = join(app, "src/lib/extensions/contracts/storage/pluginData/snapshot.ts");
    await write(source, 'export interface PluginStorageSnapshot { readonly id: string; }\n');
    await write(join(app, "src-tauri/src/plugins/api/domains/storage/observation/schema.json"), '{}');
    await syncStorageContracts(app, sdk, false); await syncStorageContracts(app, sdk, true);
    const dto = join(sdk, "rpc/storage/pluginData/snapshot.d.mts"), initial = await readFile(dto, "utf8");
    await write(dto, "outdated"); await assert.rejects(syncStorageContracts(app, sdk, true), /Storage contract differs/);
    assert.equal(await readFile(dto, "utf8"), "outdated"); await write(dto, initial);
    const schema = join(sdk, "storage/schema.json");
    await write(schema, "invalid"); await assert.rejects(syncStorageContracts(app, sdk, true), /Storage schema differs/);
    assert.equal(await readFile(schema, "utf8"), "invalid");
    await write(source, 'import type { Settings } from "@/private";');
    await assert.rejects(syncStorageContracts(app, sdk, false), /Private storage dependency/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("storage SDK narrows conditional snapshots and exposes only immutable metadata", () => {
  const program = ts.createProgram([resolve("tests/fixtures/storage/consumer.mts")], {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, skipLibCheck: false, types: ["node"],
  });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(item => ts.flattenDiagnosticMessageText(item.messageText, "\n")), []);
});

test("the actual Rust storage metadata producer satisfies the SDK consumer", { skip: !process.env.TUNNELDE_STORAGE_CONTRACT_OUTPUT }, async () => {
  const fixture = JSON.parse(await readFile(process.env.TUNNELDE_STORAGE_CONTRACT_OUTPUT, "utf8"));
  let response = fixture.initial;
  const client = createStorageClient({ call: async () => response });
  const observed = await client.observe(); assert.equal(observed.snapshot.values.large.length, 256 * 1024 - 12);
  response = fixture.idle;
  assert.deepEqual(await client.observe({ revision: observed.revision }), fixture.idle);
  for (const name of ["unicode", "decimal"]) {
    response = fixture[name];
    assert.deepEqual(await client.observe(), response);
  }
  assert(Buffer.byteLength(JSON.stringify(fixture.decimal.snapshot.values)) > 256 * 1024);
});
