import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { syncPreferencesContracts } from "../scripts/sdk/settings/preferences.mjs";

test("preference synchronization checks both independent DTOs and schemas without writing in check mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "tunnelde-preferences-contract-"));
  const write = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, value); };
  const app = join(root, "app"), sdk = join(root, "sdk");
  try {
    await write(join(app, "src/lib/extensions/contracts/preferences/data/index.ts"), 'export type * from "./values.js";\n');
    await write(join(app, "src/lib/extensions/contracts/preferences/data/values.ts"), 'export interface PreferenceValues { readonly theme: "dark" | "light"; }\n');
    await write(join(app, "src-tauri/src/services/settings/preferences/mapping/mod.rs"), 'Group { id: "appearance" }');
    await write(join(app, "src-tauri/src/services/settings/preferences/schema/appearance.json"), '{"type":"object"}');
    await syncPreferencesContracts(app, sdk, false);
    await syncPreferencesContracts(app, sdk, true);
    const dto = join(sdk, "rpc/settings/preferences/values.d.mts");
    const initial = await readFile(dto, "utf8");
    await write(dto, "outdated");
    await assert.rejects(syncPreferencesContracts(app, sdk, true), /Preference contract differs/);
    assert.equal(await readFile(dto, "utf8"), "outdated");
    await write(dto, initial);
    const schema = join(sdk, "preferences/schema.json");
    await write(schema, "{}");
    await assert.rejects(syncPreferencesContracts(app, sdk, true), /Preference schemas differ/);
    assert.equal(await readFile(schema, "utf8"), "{}");
    await write(join(app, "src/lib/extensions/contracts/preferences/data/values.ts"), 'import type { Settings } from "@/private";');
    await assert.rejects(syncPreferencesContracts(app, sdk, false), /Private preference/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("preference SDK types infer field replacements and reject private fields, invalid enums and incomplete nested values", () => {
  const program = ts.createProgram([resolve("tests/fixtures/preferences/consumer.mts")], {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true,
    noEmit: true, skipLibCheck: false, types: ["node"],
  });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(item => ts.flattenDiagnosticMessageText(item.messageText, "\n")), []);
});
