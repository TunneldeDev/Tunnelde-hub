import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { parseRustCatalogue, checkMethodTypes } from "../scripts/sync-sdk.mjs";
import { loadRpcDeclarations } from "../scripts/sdk/rpc/declarations.mjs";
import { fileURLToPath } from "node:url";

test("SDK types cover the complete generated host catalogue", async () => {
  const catalogue = JSON.parse(await readFile(new URL("../sdk/api.json", import.meta.url), "utf8"));
  const { source: types } = await loadRpcDeclarations(fileURLToPath(new URL("../sdk", import.meta.url)));
  checkMethodTypes(types, catalogue);
  const docs = await readFile(new URL("../sdk/api.md", import.meta.url), "utf8");
  for (const { name } of catalogue.methods) assert.ok(docs.includes(`\`${name}\``), name);
});

test("Rust catalogue import rejects silently omitted method declarations", () => {
  const valid = `pub const METHODS: &[ApiMethod] = &[\nmethod!("sample.run", ["ssh.exec"], "{mode:ask|full}", "Call \\\"sample\\\" safely."),\n];`;
  assert.deepEqual(parseRustCatalogue(valid).methods[0], {
    name: "sample.run",
    permissions: ["ssh.exec"],
    params: "{mode:ask|full}",
    description: 'Call "sample" safely.',
    stability: "experimental",
    since: null,
    deprecated: null,
  });
  const stable = `pub const METHODS: &[ApiMethod] = &[\nstable_method!("sample.stable", [], "{}", "Stable call.", "0.30.0"),\n];`;
  assert.deepEqual(parseRustCatalogue(stable).methods[0], {
    name: "sample.stable",
    permissions: [],
    params: "{}",
    description: "Stable call.",
    stability: "stable",
    since: "0.30.0",
    deprecated: null,
  });
  assert.throws(
    () => parseRustCatalogue(valid.replace('"{mode:ask|full}"', "DYNAMIC_PARAMS")),
    /Unparsed/,
  );
});
