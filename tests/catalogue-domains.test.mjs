import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { loadRustCatalogue } from "../scripts/sync-sdk.mjs";

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "tunnelde-domain-catalogue-"));
  const write = async (path, value) => {
    const target = join(root, "src-tauri/src/plugins", path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, value);
  };
  try {
    await write("api.rs", 'mod catalogue;\npub use catalogue::{ApiMethod, METHODS};\n');
    await write("api/catalogue/mod.rs", '#[path = "hosts/methods.rs"]\nmod hosts;\n#[path = "files/methods.rs"]\nmod files;\nconst DOMAINS: &[&[ApiMethod]] = &[\n    hosts::METHODS,\n    files::METHODS,\n];\n');
    await write("api/catalogue/hosts/methods.rs", 'pub const METHODS: &[ApiMethod] = &[\n method!("hosts.snapshot", ["hosts.read"], "{}", "Hosts."),\n];');
    await write("api/catalogue/files/methods.rs", 'pub const METHODS: &[ApiMethod] = &[\n method!("files.local.list", ["fs.read"], "{}", "Files."),\n];');
    await run(root, write);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test("domain loading preserves composition order and includes every method", async () => {
  await fixture(async root => {
    const catalogue = await loadRustCatalogue(root);
    assert.deepEqual(catalogue.methods.map(method => method.name), ["hosts.snapshot", "files.local.list"]);
  });
});

test("domain loading rejects malformed, duplicated, missing and unreferenced declarations", async () => {
  for (const [path, text, error] of [
    ["api/catalogue/files/methods.rs", 'pub const METHODS: &[ApiMethod] = &[\n future!("files.list"),\n];', /Unparsed/],
    ["api/catalogue/files/methods.rs", 'pub const METHODS: &[ApiMethod] = &[\n method!("hosts.snapshot", [], "{}", "Duplicate."),\n];', /Duplicate host method/],
    ["api/catalogue/mod.rs", 'const DOMAINS: &[&[ApiMethod]] = &[\n missing::METHODS,\n];', /modules and composition/],
    ["api/catalogue/mod.rs", 'const DOMAINS: &[&[ApiMethod]] = &[\n weird!(),\n];', /Unparsed domain/],
    ["api/catalogue/mod.rs", 'const DOMAINS: &[&[ApiMethod]] = &[\n hosts::METHODS, hosts::METHODS,\n];', /Duplicate catalogue domain/],
    ["api/catalogue/orphan/methods.rs", "", /Unreferenced/],
  ]) await fixture(async (root, write) => {
    await write(path, text);
    await assert.rejects(loadRustCatalogue(root), error);
  });
});

test("domain loading applies the selected host's stable contracts after complete assembly", async () => {
  await fixture(async (root, write) => {
    await write("api.rs", 'mod catalogue;\npub use catalogue::{ApiMethod, METHODS};\nconst CORE_CONTRACTS: &str = include_str!("contracts/core-v1.json");\n');
    await write("api/catalogue/hosts/methods.rs", 'pub const METHODS: &[ApiMethod] = &[\n stable_method!("hosts.snapshot", ["hosts.read"], "{}", "Hosts.", "0.35.0"),\n];');
    const contract = { version: 1, inputSchema: {}, resultSchema: {}, errorSchema: {}, knownErrors: [], events: [] };
    await write("contracts/core-v1.json", JSON.stringify({ version: 1, methods: { "hosts.snapshot": contract } }));
    assert.deepEqual((await loadRustCatalogue(root)).methods[0].contract, contract);
    await write("contracts/core-v1.json", JSON.stringify({ version: 1, methods: {} }));
    await assert.rejects(loadRustCatalogue(root), /no core contract/);
  });
});
