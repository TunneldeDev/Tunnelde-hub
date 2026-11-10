import assert from "node:assert/strict";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";

const entry = "tunnelde-plugin.d.mts";
const marker = name => `// SDK DECLARATION FILE ${name}\n`;
const importPattern = /\b(?:import\s+type\s+\{[\w\s,]+\}|export\s+(?:type\s+)?\*)\s+from\s+"([^"\r\n]+)"\s*;/g;

function uncomment(source) {
  return source.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    token => token.startsWith("/") ? " " : token);
}

async function filesIn(directory, prefix = "") {
  const stat = await lstat(directory);
  assert.ok(stat.isDirectory(), `RPC declaration directory must not be a symlink: ${directory}`);
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + item.name;
    if (item.isDirectory()) files.push(...await filesIn(join(directory, item.name), name + "/"));
    else {
      assert.ok(item.isFile() && name.endsWith(".d.mts"), `Unexpected RPC declaration file: ${name}`);
      files.push("rpc/" + name);
    }
  }
  return files.sort();
}

/** Read all public declarations without depending on a TypeScript installation. */
export async function loadRpcDeclarations(sdkDirectory) {
  const root = (await readFile(join(sdkDirectory, entry), "utf8")).replaceAll("\r\n", "\n");
  // Historical SDKs and small synchronization fixtures remain supported.
  if (!/export (?:type )?\* from "\.\/rpc\//.test(uncomment(root)))
    return { source: root, files: new Map([[entry, root]]), project: source => [[entry, source]] };
  const files = new Map(), active = new Set();
  async function visit(name) {
    assert.ok(!active.has(name), `RPC declaration dependency cycle: ${name}`);
    if (files.has(name)) return;
    assert.ok((await lstat(join(sdkDirectory, name))).isFile(), `RPC declaration is not a regular file: ${name}`);
    const text = name === entry ? root : (await readFile(join(sdkDirectory, name), "utf8")).replaceAll("\r\n", "\n");
    files.set(name, text); active.add(name);
    const clean = uncomment(text), imports = [...clean.matchAll(importPattern)];
    const remaining = clean.replace(importPattern, "").replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, " ");
    assert.ok(!/\b(?:import|require|namespace)\b|export\s+(?:type\s+)?(?:\*|\{)/.test(remaining), `${name}: unsupported RPC declaration dependency`);
    if (name === entry) assert.ok(!remaining.trim(), "RPC compatibility entry must contain only re-exports");
    for (const match of imports) {
      const specifier = match[1];
      if (specifier === "node:stream" && name === "rpc/runtime/plugin.d.mts") continue;
      assert.ok(specifier.startsWith(".") && specifier.endsWith(".mjs") && !specifier.includes("\\"), `${name}: private RPC declaration dependency`);
      const target = posix.normalize(posix.join(posix.dirname(name), specifier)).replace(/\.mjs$/, ".d.mts");
      assert.match(target, /^rpc\/(?:[a-zA-Z][\w-]*\/)+[a-zA-Z][\w-]*\.d\.mts$/, `${name}: private RPC declaration dependency`);
      await visit(target);
    }
    active.delete(name);
  }
  await visit(entry);
  assert.deepEqual([...files.keys()].filter(name => name !== entry).sort(), await filesIn(join(sdkDirectory, "rpc")), "RPC declarations contain unreachable files");
  const ordered = [...files].sort(([a], [b]) => a.localeCompare(b, "en"));
  const source = ordered.map(([name, text]) => marker(name) + text).join("\n");
  return {
    source, files,
    project(projected) {
      const names = [...projected.matchAll(/^\/\/ SDK DECLARATION FILE (.+)\n/gm)].map(match => match[1]);
      assert.deepEqual(names, ordered.map(([name]) => name), "RPC declaration projection changed file boundaries");
      return ordered.map(([name], index) => {
        const start = projected.indexOf(marker(name)) + marker(name).length;
        const end = index + 1 < ordered.length ? projected.indexOf(marker(ordered[index + 1][0])) - 1 : projected.length;
        return [name, projected.slice(start, end)];
      });
    },
  };
}
