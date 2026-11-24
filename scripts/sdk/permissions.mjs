import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { permissionsFor } from "../plugins/permissions.mjs";

export async function checkPermissionCoverage(applicationDirectory, catalogue) {
  const source = await readFile(join(applicationDirectory, "src-tauri/src/plugins/security.rs"), "utf8");
  const body = source.match(/pub const PERMISSIONS:\s*&\[&str\]\s*=\s*&\[([\s\S]*?)\];/)?.[1];
  assert(body, "Native permission declaration not found");
  assert.equal(body.replace(/"[A-Za-z.]+"|[,\s]/g, ""), "", "Unrecognized native permission syntax");
  const native = [...body.matchAll(/"([A-Za-z.]+)"/g)].map(match => match[1]);
  assert.equal(new Set(native).size, native.length, "Duplicate native permission");
  assert.deepEqual([...permissionsFor(catalogue)].sort(), native.sort(), "Marketplace and host permissions differ");
}
