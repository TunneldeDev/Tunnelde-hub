import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { syncFilePreviewContracts } from "../scripts/sdk/files/preview/contracts.mjs";
import { validateManifest } from "../scripts/validate.mjs";

test("preview wire/schema synchronization detects drift and rejects private dependencies", async () => {
  const temp = resolve(".tmp"); await mkdir(temp, { recursive: true });
  const root = await mkdtemp(join(temp, "preview-contract-")), app = join(root, "app"), sdk = join(root, "sdk");
  const source = join(app, "src/lib/extensions/contracts/files/preview"), schema = join(app, "src-tauri/src/plugins/api/domains/files/preview");
  try {
    await mkdir(source, { recursive: true }); await mkdir(schema, { recursive: true });
    await writeFile(join(source, "data.ts"), 'export type FilePreviewSource = { kind: "local" };\n');
    await writeFile(join(source, "actions.ts"), 'import type { FilePreviewSource } from "./data.js";\nexport interface Open { source: FilePreviewSource; }\n');
    await writeFile(join(schema, "schema.json"), "{}");
    await syncFilePreviewContracts(app, sdk, false); await syncFilePreviewContracts(app, sdk, true);
    assert.match(await readFile(join(sdk, "rpc/files/preview/actions.d.mts"), "utf8"), /from "\.\/data\.mjs"/);
    const target = join(sdk, "files/preview/schema.json"); await writeFile(target, "stale");
    await assert.rejects(syncFilePreviewContracts(app, sdk, true), /Preview contract differs/);
    assert.equal(await readFile(target, "utf8"), "stale");
    await writeFile(join(source, "data.ts"), 'import type { State } from "@/private";\n');
    await assert.rejects(syncFilePreviewContracts(app, sdk, false), /Private preview dependency/);
  } finally {
    assert(root.startsWith(temp + "/") || root.startsWith(temp + "\\"));
    await rm(root, { recursive: true, force: true });
  }
});

test("preview presentation declares metadata and either endpoint read grant without implicit mutation authority", () => {
  const base = { id: "preview-ui", name: "Preview", description: "Preview UI", author: "Example", version: "1.0.0",
    apiVersion: 1, runtime: "frontend", readme: "README.md", frontend: { entry: "ui/index.mjs", sdk: "^0.1.0" },
    views: [{ id: "main", title: "Preview", kind: "component", provider: "filePreview" }] };
  for (const endpoint of ["fs.read", "sftp.read"]) {
    const valid = { ...base, permissions: ["ui.trusted", "filePreview.read", endpoint] };
    assert.doesNotThrow(() => validateManifest(valid, valid.id));
    for (const omitted of valid.permissions)
      assert.throws(() => validateManifest({ ...valid, permissions: valid.permissions.filter(p => p !== omitted) }, valid.id));
  }
});
