import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { renderView } from "../plugins/sshfs/index.mjs";
import { validateManifest } from "../scripts/validate.mjs";

test("SSHFS plugins share native mount UI but Lite has no Node dependency", async () => {
  const load = async (id, file) =>
    JSON.parse(
      await readFile(
        new URL(`../plugins/${id}/${file}`, import.meta.url),
        "utf8",
      ),
    );
  const node = await load("sshfs", "tunnelde-plugin.json");
  const lite = await load("sshfs-lite", "tunnelde-plugin.json");
  validateManifest(node, "sshfs");
  validateManifest(lite, "sshfs-lite");
  assert.equal(node.runtime, "node");
  assert.equal(node.engines.node, ">=22");
  assert.equal(lite.runtime, "declarative");
  assert.equal(lite.engines.node, undefined);
  assert.deepEqual(node.permissions, ["mounts.read", "mounts.write"]);
  assert.deepEqual(lite.permissions, node.permissions);
  assert.equal(lite.engines.tunnelde, ">=0.29.0-beta.6");
  assert.equal(node.engines.tunnelde, lite.engines.tunnelde);
  assert.equal(node.mountedFileReveal, true);
  assert.equal(lite.mountedFileReveal, true);
  const views = await load("sshfs-lite", "views.json");
  assert.deepEqual(views.views.main.blocks, renderView().blocks);
  assert.ok(!node.permissions.includes("secrets"));
  assert.ok(!node.permissions.includes("process.exec"));
  assert.throws(
    () =>
      validateManifest(
        { ...lite, commands: [{ id: "exec", title: "Exec" }] },
        "sshfs-lite",
      ),
    /declarative/,
  );
  assert.throws(
    () =>
      validateManifest({ ...lite, engines: { node: ">=22" } }, "sshfs-lite"),
    /declarative/,
  );
});
