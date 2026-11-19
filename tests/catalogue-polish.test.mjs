import assert from "node:assert/strict";
import { test } from "node:test";
import { runCommand as convert } from "../plugins/timestamp/index.mjs";
import { runCommand as uuid } from "../plugins/uuid/index.mjs";
import { runCommand as log } from "../plugins/jsonl-log-viewer/index.mjs";

test("UTC and offset dates round-trip at both JS date limits", () => {
  for (const [ms, offset] of [[-8640000000000000, "-271821-04-19T12:00:00-12:00"], [8640000000000000, "+275760-09-13T12:00:00+12:00"]]) {
    const result = convert("decode", { timestamp: ms, unit: "milliseconds" });
    const encoded = /^UTC: (.+)$/m.exec(result.text)[1];
    for (const datetime of [encoded, offset]) assert.equal(convert("encode", { datetime }).text, result.text);
  }
  assert.equal(convert("encode", { datetime: "-000000-01-01T00:00Z" }).error, true);
});

test("UUID keeps copyable values separate from the localized batch count", () => {
  for (const letterCase of [undefined, "upper"]) {
    const result = uuid("generate", { count: "3", letterCase, _locale: "zh-CN" });
    assert.equal(result.title, "已生成 3 个 UUID");
    const rows = result.text.split("\n");
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.match(row, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
      assert.equal(row, letterCase ? row.toUpperCase() : row.toLowerCase());
    }
  }
});

test("invalid editor JSONL reports a bounded summary without returning replacement text", () => {
  const result = log("to-log", { source: "bad\n".repeat(200), document: {} });
  assert.equal(result.error, true);
  assert.match(result.text, /1, 2, 3, 4, 5, 6, 7, 8… \(200\)/);
  assert.doesNotMatch(result.text, /INVALID JSONL/);
});
