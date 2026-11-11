import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { syncProfilesContracts } from "../scripts/sdk/settings/profiles.mjs";
import { createProfilesClient } from "../sdk/profiles/client.mjs";

test("profile DTO and schema drift fail check mode without modifying files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tunnelde-profile-contract-")), app = join(root, "app"), sdk = join(root, "sdk");
  const write = async (name, content) => { await mkdir(dirname(name), { recursive: true }); await writeFile(name, content); };
  try {
    const source = join(app, "src/lib/extensions/contracts/profiles/data/metadata.ts");
    await write(source, 'export interface ProfileMetadata { readonly id: string; }\n');
    await write(join(app, "src-tauri/src/settings_profiles/observation/schema.json"), '{}');
    await syncProfilesContracts(app, sdk, false); await syncProfilesContracts(app, sdk, true);
    const dto = join(sdk, "rpc/settings/profiles/metadata.d.mts"), initial = await readFile(dto, "utf8");
    await write(dto, "outdated"); await assert.rejects(syncProfilesContracts(app, sdk, true), /Profile contract differs/);
    assert.equal(await readFile(dto, "utf8"), "outdated"); await write(dto, initial);
    const schema = join(sdk, "profiles/schema.json");
    await write(schema, "invalid"); await assert.rejects(syncProfilesContracts(app, sdk, true), /Profile schema differs/);
    assert.equal(await readFile(schema, "utf8"), "invalid");
    await write(source, 'import type { Settings } from "@/private";');
    await assert.rejects(syncProfilesContracts(app, sdk, false), /Private profile dependency/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("profile SDK narrows conditional snapshots and exposes only immutable metadata", () => {
  const program = ts.createProgram([resolve("tests/fixtures/profiles/consumer.mts")], {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true, skipLibCheck: false, types: ["node"],
  });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(item => ts.flattenDiagnosticMessageText(item.messageText, "\n")), []);
});

test("the actual Rust profile metadata producer satisfies the SDK consumer", { skip: !process.env.TUNNELDE_PROFILE_CONTRACT_OUTPUT }, async () => {
  const fixture = JSON.parse(await readFile(process.env.TUNNELDE_PROFILE_CONTRACT_OUTPUT, "utf8"));
  let response = fixture.initial;
  const client = createProfilesClient({ call: async () => response });
  const observed = await client.observe(); assert.equal(observed.snapshot.items.length, 32);
  response = fixture.idle;
  assert.deepEqual(await client.observe({ revision: observed.revision }), fixture.idle);
});
