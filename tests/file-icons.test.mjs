import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { validateFileIconThemes, validateTags } from "../scripts/plugins/file-icons.mjs";
import { validateManifest } from "../scripts/validate.mjs";
import { catalogueTags } from "../scripts/plugins/tags.mjs";

const manifest = JSON.parse(await readFile(new URL("../plugins/file-icons/tunnelde-plugin.json", import.meta.url), "utf8"));
test("the icon package is declarative, tagged and covers code, documents and media", () => {
  validateManifest(manifest, "file-icons");
  assert.equal(manifest.runtime, "theme");
  assert.deepEqual(manifest.permissions, []);
  assert.equal(manifest.main, undefined);
  const theme = manifest.fileIconThemes[0];
  for (const extension of ["ts", "py", "rs", "mp3", "mp4", "pdf", "md", "png", "jpg", "gif", "tar.gz"])
    assert.ok(Object.hasOwn(theme.icons, theme.extensions[extension]));
  assert.equal(theme.fileNames.Dockerfile, "docker");
  assert.equal(theme.fileNames[".gitignore"], "git");
});
test("icon validation rejects URLs, executable fields, duplicate mappings and missing references", () => {
  for (const mutate of [
    (theme) => { theme.icons.typescript.url = "https://example.com/icon.svg"; },
    (theme) => { theme.icons.typescript.color = "url(remote)"; },
    (theme) => { theme.icons.typescript.label = "<svg>"; },
    (theme) => { theme.icons.typescript.symbol = "execute"; },
    (theme) => { theme.extensions.TS = "typescript"; },
    (theme) => { theme.fileNames["../passwd"] = "text"; },
    (theme) => { theme.extensions.bin = "missing"; },
  ]) {
    const theme = structuredClone(manifest.fileIconThemes[0]);
    mutate(theme);
    assert.throws(() => validateFileIconThemes([theme]));
  }
});
test("tags share the application's Unicode, uniqueness and byte bounds", () => {
  validateTags(["文件", "preview", "tar.gz"]);
  for (const tags of [["PDF", "pdf"], ["a b"], [""], Array(25).fill("a"), ["界".repeat(22)]])
    assert.throws(() => validateTags(tags));
});
test("catalogue tags classify existing immutable archives without rewriting manifests", () => {
  const old = { id: "tunnelde-pi", version: "1.4.1" };
  assert.deepEqual(catalogueTags(old), ["ai", "pi", "remote"]);
  assert.equal(old.tags, undefined);
  assert.deepEqual(catalogueTags({ id: "uuid", tags: ["custom"] }), ["custom"]);
});
