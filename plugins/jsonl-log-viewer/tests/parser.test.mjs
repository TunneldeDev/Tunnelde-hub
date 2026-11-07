import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { formatJSONL, runCommand } from "../index.mjs";

test("renders the reported Tunnelde TLS error with timestamp, target and diagnostic fields", () => {
  const record = { timestamp: "2026-11-07T21:35:27.198355Z", level: "WARN", fields: { message: "plugin HTTPS request failed", timeout: false, connect: true, body: false, detail: 'reqwest::Error { error: "tls handshake eof" }' }, target: "tunnelde_lib::plugins::network" };
  const result = formatJSONL(JSON.stringify(record));
  assert.match(result.text, /^2026-11-07T21:35:27.198355Z \[WARN\] tunnelde_lib::plugins::network: plugin HTTPS request failed/);
  assert.match(result.text, /timeout=false connect=true body=false/);
  assert.match(result.text, /tls handshake eof/);
  assert.deepEqual(result.invalidLines, []);
});

test("retains large numeric literals and indents multiline messages without terminal escapes", () => {
  const result = formatJSONL('\uFEFF{"time":1,"level":30,"msg":"hello\\nworld\\u001b[31m","id":900719925474099312345}\r\n');
  assert.match(result.text, /^1 \[INFO\] hello\n    world\\u001b\[31m/);
  assert.match(result.text, /id=900719925474099312345/);
});

test("unknown and structured severity values cannot read object prototype properties", () => {
  for (const level of ["__proto__", "constructor", { toString: "custom" }, ["WARN"]]) {
    const result = formatJSONL(JSON.stringify({ level, message: "retained" }));
    assert.deepEqual(result.invalidLines, []);
    assert.ok(result.text.includes("[" + (typeof level === "string" ? level : JSON.stringify(level)).toUpperCase() + "]"));
    assert.ok(result.text.includes("retained"));
  }
  assert.match(formatJSONL('{"level":"30","msg":"ok"}').text, /\[INFO\]/);
});

test("invalid lines remain visible in preview and prevent any editor replacement", () => {
  const source = '{"msg":"ok"}\n{broken\nnull\n';
  const result = formatJSONL(source);
  assert.deepEqual(result.invalidLines, [2, 3]);
  assert.match(result.text, /\[INVALID JSONL: line 2\] \{broken/);
  assert.equal(runCommand("to-log", { source, document: { path: "a.jsonl" } }).error, true);
  assert.equal(runCommand("to-log", { source }).error, undefined);
});

test("conversion retains CRLF and handles primitive nested data and size limits", () => {
  const converted = runCommand("to-log", { source: '{"fields":7,"message":"a"}\r\n', document: {} });
  assert.match(converted.text, /fields=7\r\n$/);
  assert.throws(() => formatJSONL("x".repeat(128 * 1024 + 1)), /128 KiB/);
});

test("actual plugin transport handles editor conversion and localized view without host access", () => {
  const messages = [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { apiVersion: 1 } },
    { jsonrpc: "2.0", id: 2, method: "command.run", params: { command: "to-log", input: { source: '{"level":"WARN","message":"test"}', document: {} } } },
    { jsonrpc: "2.0", id: 3, method: "view.render", params: { view: "main", locale: "zh-CN" } },
    { jsonrpc: "2.0", id: 4, method: "shutdown" },
  ];
  const child = spawnSync(process.execPath, [fileURLToPath(new URL("../index.mjs", import.meta.url))], { input: messages.map((value) => JSON.stringify(value)).join("\n") + "\n", encoding: "utf8", timeout: 5000 });
  assert.equal(child.status, 0, child.stderr);
  const frames = child.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.match(frames.find((frame) => frame.id === 2).result.text, /\[WARN\] test/);
  assert.match(frames.find((frame) => frame.id === 3).result.blocks[0].text, /Ctrl\+Shift\+F/);
});
