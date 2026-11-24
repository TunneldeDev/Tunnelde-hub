import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateFilePreviews } from "../scripts/plugins/previews.mjs";
import { validateManifest } from "../scripts/validate.mjs";

test("common previews are runtime-free, bounded and cover requested formats", async () => {
  const manifest = JSON.parse(await readFile(new URL("../plugins/file-previews/tunnelde-plugin.json", import.meta.url), "utf8"));
  validateManifest(manifest, "file-previews");
  assert.equal(manifest.runtime, "theme");
  assert.deepEqual(manifest.permissions, []);
  assert.equal(manifest.main, undefined);
  assert.ok(manifest.tags.includes("preview"));
  const extensions = manifest.filePreviews.flatMap((p) => p.extensions);
  for (const extension of ["mp3", "mp4", "pdf", "md", "png", "jpg", "gif"]) assert.ok(extensions.includes(extension));
});

test("preview declarations reject executable, external, duplicate and unbounded fields", () => {
  const base = {id:"images",name:"Images",renderer:"image",extensions:["png"]};
  validateFilePreviews([base]);
  for (const override of [{renderer:"html"},{url:"https://example.com"},{extensions:["png","PNG"]},{extensions:["../png"]},{extensions:[]},{extensions:["svg/"]}]) assert.throws(() => validateFilePreviews([{...base,...override}]));
  assert.throws(() => validateFilePreviews([base, base]));
  assert.throws(() => validateFilePreviews(Array(17).fill(base)));
});
