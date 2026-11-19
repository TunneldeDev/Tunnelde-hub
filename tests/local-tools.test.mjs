import assert from "node:assert/strict";
import { test } from "node:test";
import { calculate as checksum } from "../plugins/text-checksum/tool.mjs";
import { calculate as units } from "../plugins/byte-units/tool.mjs";
import { calculate as permissions } from "../plugins/unix-permissions/tool.mjs";
import { calculate as csv } from "../plugins/csv-to-json/tool.mjs";
import { calculate as unicode } from "../plugins/unicode-inspector/tool.mjs";

test("checksum hashes exact UTF-8 bytes, including empty and trailing whitespace", () => {
  assert.equal(
    checksum("", {}).text,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
  assert.equal(
    checksum("abc", {}).text,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.notEqual(checksum("abc\n", {}).text, checksum("abc", {}).text);
  assert.match(checksum("中", { algorithm: "SHA-512" }).title, /3 bytes/);
  assert.equal(checksum("x", { algorithm: "other" }).error, true);
});
test("capacity calculations do not silently round large or fractional quantities", () => {
  assert.match(units("9007199254740993", { unit: "B" }).text, /^9007199254740993 B\n/);
  assert.match(units("1.5", { unit: "KiB" }).text, /^1536 B\n/);
  assert.match(units("0.1", { unit: "B" }).text, /^0\.1 B\n/);
  for (const s of ["", "NaN", "1e9", "-4", "1.0000000000001"])
    assert.equal(units(s, {}).error, true);
});
test("all 4096 Unix permission modes round trip, including special bits without execute", () => {
  for (let n = 0; n < 4096; n++) {
    const s = n.toString(8).padStart(4, "0"),
      r = permissions(s, {}).text;
    assert.equal(permissions(r.split("\n")[0].split("  ")[1], {}).text, r);
  }
  assert.match(permissions("4644", {}).text, /rwSr--r--/);
  assert.equal(permissions("99", {}).error, true);
});
test("CSV retains quoted CRLFs, escaped quotes, blank rows, final cells and leading zeros", () => {
  assert.deepEqual(JSON.parse(csv('\uFEFFx,x\r\n"001\r\n""",\r\n\r\n', {}).text), [
    ["x", "x"],
    ['001\r\n"', ""],
    [""],
  ]);
  assert.deepEqual(JSON.parse(csv("a\tb\t", { delimiter: "tab" }).text), [["a", "b", ""]]);
  assert.equal(csv('a\n"broken', {}).error, true);
  assert.equal(csv('"closed"bad', {}).error, true);
  assert.equal(csv(",".repeat(16384), {}).error, true);
  assert.deepEqual(JSON.parse(csv("", {}).text), []);
});
test("Unicode reports graphemes separately from code points and never renders raw direction controls", () => {
  const r = unicode("e\u0301🙂\u202e", {});
  assert.match(r.text, /Graphemes: 3 · Code points: 4 · UTF-8 bytes: 10/);
  assert.match(r.text, /U\+202E/);
  assert.ok(!r.text.includes("\u202e"));
  assert.match(unicode("中".repeat(200), {}, true).text, /仅显示前 128/);
  assert.equal(unicode("x".repeat(4097), {}).error, true);
});
