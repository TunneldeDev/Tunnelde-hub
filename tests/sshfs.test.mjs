import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { renderView } from "../plugins/sshfs/index.mjs";
import { validateManifest } from "../scripts/validate.mjs";

test("shared mount details require a compatible view and explicit permission", async () => {
  const lite = JSON.parse(await readFile(new URL("../plugins/sshfs-lite/tunnelde-plugin.json", import.meta.url)));
  const manifest = {
    ...lite,
    views: [{ ...lite.views[0], kind: "sharedMounts" }],
    hostDetails: [{ id: "mounts", viewId: "main", title: "Mounts", kind: "mounts" }],
    permissions: [...new Set([...lite.permissions, "hosts.read", "mounts.hostDetails"])],
  };
  validateManifest(manifest, manifest.id);
  for (const name of ["hosts.read", "mounts.read", "mounts.hostDetails"]) {
    assert.throws(() => validateManifest({
      ...manifest, permissions: manifest.permissions.filter(permission => permission !== name),
    }, manifest.id), /missing permissions/);
  }
  assert.throws(() => validateManifest({ ...manifest, views: lite.views.map(view => ({ ...view, kind: "blocks" })) }, manifest.id), /hostDetails view/);
  assert.throws(() => validateManifest({ ...manifest, hostDetails: Array(2).fill(manifest.hostDetails[0]) }, manifest.id), /hostDetails contribution/);
});

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
  assert.deepEqual(node.permissions, ["hosts.read", "mounts.read", "mounts.write", "mounts.hostDetails"]);
  assert.deepEqual(lite.permissions, node.permissions);
  assert.equal(lite.engines.tunnelde, ">=1.5.0-beta.5");
  assert.equal(node.engines.tunnelde, lite.engines.tunnelde);
  assert.equal(node.mountedFileReveal, true);
  assert.equal(lite.mountedFileReveal, true);
  const views = await load("sshfs-lite", "views.json");
  assert.equal(lite.frontend, undefined);
  assert.equal(node.views[0].kind, "sharedMounts");
  assert.equal(lite.views[0].kind, "sharedMounts");
  assert.deepEqual(node.hostDetails, [{ id: "mounts", title: "Mounts", viewId: "main", kind: "mounts" }]);
  assert.deepEqual(lite.hostDetails, node.hostDetails);
  assert.deepEqual(views.views.main.blocks, [{ type: "sharedMounts" }]);
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
