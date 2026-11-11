import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { syncFileBrowserContracts } from "../scripts/sdk/files/browser/contracts.mjs";
import { validateManifest } from "../scripts/validate.mjs";
import { checkPermissionCoverage } from "../scripts/sdk/permissions.mjs";
import { capabilityPermissions } from "../scripts/plugins/permissions.mjs";

test("browser wire and schema sync detect drift without mutating check targets", async () => {
  const temp = resolve(".tmp"); await mkdir(temp, { recursive: true });
  const root = await mkdtemp(join(temp, "browser-contract-")), app = join(root, "app"), sdk = join(root, "sdk");
  try {
    const source = join(app, "src/lib/extensions/contracts/files/browser");
    const schema = join(app, "src-tauri/src/plugins/api/domains/files/browser");
    await mkdir(source, { recursive: true }); await mkdir(schema, { recursive: true });
    await writeFile(join(source, "data.ts"), "export interface Browser { readonly paneId:string; }\n");
    await writeFile(join(schema, "schema.json"), "{}");
    await syncFileBrowserContracts(app, sdk, false); await syncFileBrowserContracts(app, sdk, true);
    const target = join(sdk, "files/browser/schema.json"); await writeFile(target, "stale");
    await assert.rejects(syncFileBrowserContracts(app, sdk, true), /Browser contract differs/);
    assert.equal(await readFile(target, "utf8"), "stale");
    await writeFile(join(source, "data.ts"), 'import type { Store } from "@/private";\n');
    await assert.rejects(syncFileBrowserContracts(app, sdk, false), /Private browser dependency/);
  } finally {
    assert(root.startsWith(temp + "/") || root.startsWith(temp + "\\"));
    await rm(root, { recursive: true, force: true });
  }
});

test("marketplace accepts every synchronized host grant and rejects invented permissions", async () => {
  const catalogue = JSON.parse(await readFile(new URL("../sdk/api.json", import.meta.url), "utf8"));
  const permissions = [...new Set(catalogue.methods.flatMap(method => method.permissions))];
  for (const permission of [...permissions, "ui.trusted"]) {
    const manifest = { id: "permission-probe", name: "Permission probe", description: "Contract test", author: "Test",
      version: "1.0.0", apiVersion: 1, runtime: "node", main: "index.mjs", readme: "README.md", permissions: [permission] };
    assert.doesNotThrow(() => validateManifest(manifest, manifest.id), permission);
    assert.throws(() => validateManifest({ ...manifest, permissions: ["invented.superuser"] }, manifest.id), /unknown permission/);
  }
  for (const permission of ["logs.read", "storage.recovery.read", "storage.recovery.write", "fileBrowser.read", "fileBrowser.write"])
    assert(permissions.includes(permission));
});

test("complete host checks reject permission drift, duplicates and unrecognized native declarations", async () => {
  const temp = resolve(".tmp"); await mkdir(temp, { recursive: true });
  const root = await mkdtemp(join(temp, "browser-permissions-"));
  try {
    const directory = join(root, "src-tauri/src/plugins"); await mkdir(directory, { recursive: true });
    const target = join(directory, "security.rs"), catalogue = { methods: [{ permissions: ["fs.read"] }] };
    const write = body => writeFile(target, `pub const PERMISSIONS: &[&str] = &[${body}];`);
    const permissions = [...capabilityPermissions, "fs.read"].map(name => JSON.stringify(name)).join(",");
    await write(permissions); await checkPermissionCoverage(root, catalogue);
    await write(permissions + ',"fs.write"'); await assert.rejects(checkPermissionCoverage(root, catalogue), /permissions differ/);
    await write(permissions + ',"fs.read"'); await assert.rejects(checkPermissionCoverage(root, catalogue), /Duplicate native permission/);
    await write(permissions + ',extra()'); await assert.rejects(checkPermissionCoverage(root, catalogue), /Unrecognized native permission syntax/);
  } finally { assert(root.startsWith(temp + "/") || root.startsWith(temp + "\\")); await rm(root, { recursive: true, force: true }); }
});
