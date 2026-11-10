import assert from "node:assert/strict";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { attachContracts, parseRustCatalogue } from "./parse.mjs";

function uncomment(source) {
  return source.replace(/"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    token => token.startsWith('"') ? token : " ");
}

/** Use exactly the files referenced by the host, including older single-file hosts. */
export async function loadRustCatalogue(applicationDirectory) {
  const root = join(resolve(applicationDirectory), "src-tauri/src/plugins");
  const source = await readFile(join(root, "api.rs"), "utf8");
  const clean = uncomment(source);
  const contracts = /include_str!\(\s*"contracts\/core-v1\.json"\s*\)/.test(clean)
    ? JSON.parse(await readFile(join(root, "contracts/core-v1.json"), "utf8"))
    : undefined;
  const split = /pub\s+use\s+catalogue::\{\s*ApiMethod,\s*METHODS\s*\};/.test(clean);
  assert.ok(!split || !/pub const METHODS:/.test(clean), "Host declares both catalogue formats");
  if (!split) return parseRustCatalogue(source, contracts);
  assert.match(clean, /\bmod catalogue;/, "Missing catalogue module");
  const directory = join(root, "api/catalogue");
  assert.ok((await lstat(directory)).isDirectory(), "Catalogue directory must not be a symlink");
  const index = uncomment(await readFile(join(directory, "mod.rs"), "utf8"));
  const body = index.match(/const DOMAINS:\s*&\[&\[ApiMethod\]\]\s*=\s*&\[([\s\S]*?)\n\];/)?.[1];
  assert.ok(body, "Missing domain catalogue composition");
  const domainPattern = /([a-z][a-z0-9_]*)::METHODS/g;
  const domains = [...body.matchAll(domainPattern)].map(match => match[1]);
  assert.equal(body.replace(domainPattern, "").replace(/[\s,]/g, ""), "", "Unparsed domain catalogue entry");
  assert.ok(domains.length > 0, "Empty domain catalogue");
  assert.equal(new Set(domains).size, domains.length, "Duplicate catalogue domain");
  const modulePattern = /#\[path\s*=\s*"((?:[a-z][a-z0-9_]*\/)+methods\.rs)"\]\s*mod ([a-z][a-z0-9_]*);/g;
  const modules = [...index.matchAll(modulePattern)].map(match => [match[2], match[1]]);
  assert.equal(new Set(modules.map(([name]) => name)).size, modules.length, "Duplicate catalogue module");
  assert.deepEqual(modules.map(([name]) => name).sort(), [...domains].sort(), "Catalogue modules and composition differ");
  const actual = [];
  async function visit(prefix = "", depth = 0) {
    assert.ok(depth <= 8, "Catalogue nesting exceeds its limit");
    for (const item of await readdir(join(directory, prefix), { withFileTypes: true })) {
      if (!prefix && item.name === "mod.rs" && item.isFile()) continue;
      if (prefix && item.name === "methods.rs" && item.isFile()) actual.push(prefix + item.name);
      else {
        assert.ok(item.isDirectory() && /^[a-z][a-z0-9_]*$/.test(item.name), `Unexpected catalogue entry: ${prefix}${item.name}`);
        await visit(prefix + item.name + "/", depth + 1);
      }
    }
  }
  await visit();
  assert.deepEqual(actual.sort(), modules.map(([, path]) => path).sort(), "Unreferenced catalogue files");
  const methods = [];
  for (const domain of domains) {
    const path = new Map(modules).get(domain);
    const text = await readFile(join(directory, path), "utf8");
    methods.push(...parseRustCatalogue(text).methods);
  }
  return attachContracts(methods, source, contracts);
}
