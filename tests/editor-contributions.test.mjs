import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { validateManifest } from "../scripts/validate.mjs";
import { runCommand } from "../plugins/json-formatter/index.mjs";

const manifest = JSON.parse(
  await readFile(
    new URL("../plugins/json-formatter/tunnelde-plugin.json", import.meta.url),
    "utf8",
  ),
);

test("formatter declares compatible editor commands and permissions", () => {
  validateManifest(manifest, manifest.id);
  assert.equal(manifest.engines.tunnelde, ">=0.29.0-beta.2");
  assert.deepEqual(manifest.permissions, ["editor.read", "editor.write"]);
  assert.equal(manifest.commands.filter((command) => command.editor?.format).length, 1);
  assert.equal(manifest.commands[1].keybindings[0], "Mod+Alt+M");
});

test("editor contributions reject missing permissions, unsafe suffixes and invalid shortcuts", () => {
  const cases = [];
  for (const permissions of [[], ["editor.read"], ["editor.write"]])
    cases.push({ ...structuredClone(manifest), permissions });
  for (const editor of [
    { extensions: [] },
    { extensions: ["../json"] },
    { extensions: ["json"], format: "yes" },
    { extensions: ["json"], unknown: true },
  ]) {
    const value = structuredClone(manifest);
    value.commands[0].editor = editor;
    cases.push(value);
  }
  for (const keys of [
    ["Mod+Ctrl+F"],
    ["Ctrl+Meta+F"],
    ["Ctrl+Ctrl+F"],
    ["F25"],
    [""],
    ["A", "B", "C", "D", "E"],
  ]) {
    const value = structuredClone(manifest);
    value.commands[0].keybindings = keys;
    cases.push(value);
  }
  const duplicate = structuredClone(manifest);
  duplicate.commands.push(duplicate.commands[0]);
  cases.push(duplicate);
  for (const value of cases) assert.throws(() => validateManifest(value, value.id));
});

test("editor formatting honors all indentation widths and preserves CRLF, terminal newline and number tokens", () => {
  const source = '{"n":9007199254740993,"n":1e+200}\r\n';
  for (let width = 1; width <= 8; width++) {
    const result = runCommand("pretty", {
      source,
      indent: String(width),
      document: { tabId: "editor" },
    });
    assert.equal(
      result.text,
      `{\r\n${" ".repeat(width)}"n": 9007199254740993,\r\n${" ".repeat(width)}"n": 1e+200\r\n}\r\n`,
    );
    assert.equal(result.error, undefined);
  }
  assert.equal(
    runCommand("pretty", { source: '{"a":1}', indent: "3", document: {} }).text,
    '{\n   "a": 1\n}',
  );
  assert.equal(
    runCommand("minify", { source, document: {} }).text,
    '{"n":9007199254740993,"n":1e+200}',
  );
  assert.equal(runCommand("pretty", { source: "invalid", document: {} }).error, true);
});
