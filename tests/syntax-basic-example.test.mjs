import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { validateManifest } from "../scripts/validate.mjs";

const root = fileURLToPath(new URL("../examples/syntax-basic/", import.meta.url));
const sdkHash = "c8f22cd663e1978e5ad751e24f27ade321b74746896e915c66a1a1f478f9aaf9";
const source = "const value = 42;\n".repeat(5882);
const types = new Set([
  "keyword",
  "string",
  "number",
  "comment",
  "type",
  "function",
  "property",
  "operator",
  "punctuation",
  "variable",
  "constant",
  "invalid",
]);
function validateTokens(result, text) {
  assert.ok(Array.isArray(result.tokens));
  assert.ok(result.tokens.length <= 16_384);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 128 * 1024);
  let end = 0;
  for (const token of result.tokens) {
    assert.ok(Number.isSafeInteger(token.start) && Number.isSafeInteger(token.end));
    assert.ok(token.start >= end && token.end > token.start && token.end <= text.length);
    assert.ok(types.has(token.type));
    end = token.end;
  }
}
async function runPlugin(t, directory) {
  const child = spawn(process.execPath, [join(directory, "index.mjs")], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "",
    serial = 0;
  child.stderr.setEncoding("utf8").on("data", (value) => {
    stderr += value;
  });
  const closed = once(child, "close");
  const pending = new Map();
  const pages = [];
  const reader = createInterface({ input: child.stdout });
  const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`);
  reader.on("line", (line) => {
    const message = JSON.parse(line);
    if (message.method === "editor.readRange") {
      const { offset, limit } = message.params;
      pages.push(message.params);
      const text = source.slice(offset, offset + limit);
      send({
        jsonrpc: "2.0",
        id: message.id,
        result: {
          schemaVersion: 1,
          tabId: "editor",
          documentId: "doc",
          version: 1,
          offset,
          totalLength: source.length,
          text,
          nextOffset: offset + text.length < source.length ? offset + text.length : null,
        },
      });
      return;
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    message.error
      ? waiter.reject(new Error(message.error.message))
      : waiter.resolve(message.result);
  });
  child.on("exit", () => {
    for (const waiter of pending.values()) waiter.reject(new Error(`Plugin exited: ${stderr}`));
    pending.clear();
  });
  child.on("error", (error) => {
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  });
  t.after(async () => {
    reader.close();
    child.stdin.end();
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await closed;
  });
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, { resolve, reject });
      send({ jsonrpc: "2.0", id, method, params });
    });
  assert.deepEqual(await request("initialize", { apiVersion: 1, pluginId: "syntax-basic" }), {
    ok: true,
  });
  return { request, pages };
}
const document = {
  tabId: "editor",
  documentId: "doc",
  version: 1,
  path: "/file.js",
  name: "file.js",
};

test("syntax example declares only editor read access and pins its self-contained SDK", async () => {
  const manifest = JSON.parse(await readFile(join(root, "tunnelde-plugin.json"), "utf8"));
  validateManifest(manifest, "syntax-basic");
  assert.deepEqual(manifest.permissions, ["editor.read"]);
  assert.equal(manifest.commands[0].editor.syntax, true);
  assert.equal(
    createHash("sha256")
      .update(await readFile(join(root, "sdk.mjs")))
      .digest("hex"),
    sdkHash,
  );
  for (const editor of [
    { extensions: ["js"], syntax: "true" },
    { extensions: ["js"], syntax: false },
    { extensions: ["js"], syntax: true, format: true },
    { extensions: ["js"], syntax: true, unknown: true },
  ]) {
    const invalid = structuredClone(manifest);
    invalid.commands[0].editor = editor;
    assert.throws(() => validateManifest(invalid, "syntax-basic"));
  }
  assert.throws(() => validateManifest({ ...manifest, permissions: [] }, "syntax-basic"));
});
test(
  "syntax tokenizer runs over real stdio with bounded inline and paged window results",
  { timeout: 10_000 },
  async (t) => {
    const { request, pages } = await runPlugin(t, root);
    const inline = 'const answer = 42;\nconsole.log("hello");';
    const highlight = (input) =>
      request("command.run", {
        command: "highlight",
        input: { document, extensions: ["js"], _locale: "en-US", ...input },
      });
    const result = await highlight({ source: inline });
    validateTokens(result, inline);
    assert.ok(result.tokens.some((token) => token.type === "keyword"));
    assert.ok(result.tokens.some((token) => token.type === "string"));
    const large = await highlight({ source });
    validateTokens(large, source);
    const window = await highlight({
      mode: "window",
      source: null,
      range: { offset: 0, length: 32_768 },
    });
    validateTokens(window, source.slice(0, 32_768));
    assert.ok(window.tokens.length > 100);
    assert.deepEqual(window.tokens[0], { start: 0, end: 5, type: "keyword" });
    assert.deepEqual(
      pages.map(({ offset, limit }) => ({ offset, limit })),
      [
        { offset: 0, limit: 16_384 },
        { offset: 16_384, limit: 16_384 },
      ],
    );
    assert.ok(
      pages.every(
        (page) => page.tabId === "editor" && page.documentId === "doc" && page.version === 1,
      ),
    );
    assert.equal(await request("shutdown", {}), null);
  },
);
test(
  "example packager produces an independently runnable local-install folder without repository dependencies",
  { timeout: 10_000 },
  async (t) => {
    const temp = await mkdtemp(join(tmpdir(), "tunnelde-syntax-example-"));
    t.after(() => rm(temp, { recursive: true, force: true }));
    const output = join(temp, "package");
    execFileSync(process.execPath, [join(root, "scripts/package.mjs"), output], { cwd: temp });
    assert.deepEqual((await readdir(output)).sort(), [
      "README.md",
      "index.mjs",
      "sdk.mjs",
      "syntax-basic-0.1.0.sha256",
      "tunnelde-plugin.json",
    ]);
    for (const name of ["README.md", "index.mjs", "sdk.mjs", "tunnelde-plugin.json"])
      assert.deepEqual(await readFile(join(output, name)), await readFile(join(root, name)));
    const { request } = await runPlugin(t, output);
    const result = await request("command.run", {
      command: "highlight",
      input: { source: "const value = 42;", document, extensions: ["js"] },
    });
    validateTokens(result, "const value = 42;");
    assert.deepEqual(result.tokens[0], { start: 0, end: 5, type: "keyword" });
    assert.equal(await request("shutdown", {}), null);
  },
);
