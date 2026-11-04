import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { publishPackages } from "../scripts/publishing/publish.mjs";

const tag = "plugins-v1.7.0";
const sha = "a".repeat(40);
async function fixture(run) {
  const output = await mkdtemp(join(tmpdir(), "tunnelde-publisher-test-"));
  await writeFile(join(output, "file-previews-1.7.0.zip"), "archive");
  await writeFile(join(output, "registry.json"), "catalogue");
  const remote = { release: null, assets: new Map(), calls: [], create502: false, viewFailure: false };
  const gh = async (args) => {
    remote.calls.push(args);
    const command = args[1];
    if (command === "view") {
      if (remote.viewFailure) throw new Error("HTTP 502 Bad Gateway");
      if (!remote.release) throw new Error("release not found");
      return JSON.stringify({ ...remote.release, assets: [...remote.assets.keys()].map((name) => ({ name })) });
    }
    if (command === "create") {
      remote.release = { isDraft: true, isPrerelease: args.includes("--prerelease"), targetCommitish: sha };
      if (remote.create502) throw new Error("HTTP 502 Bad Gateway");
    } else if (command === "upload") {
      assert.ok(!args.includes("--clobber"));
      assert.ok(!remote.assets.has(basename(args[3])));
      remote.assets.set(basename(args[3]), await readFile(args[3]));
    } else if (command === "download") {
      for (const [name, bytes] of remote.assets) await writeFile(join(args[4], name), bytes);
    } else if (command === "edit") remote.release.isDraft = false;
    return "";
  };
  try { await run({ remote, gh, output }); }
  finally { await rm(output, { recursive: true, force: true }); }
}

test("publishing resumes a partially uploaded draft, verifies bytes and then publishes", () => fixture(async ({ remote, gh, output }) => {
  remote.release = { isDraft: true, isPrerelease: true, targetCommitish: sha };
  remote.assets.set("registry.json", Buffer.from("catalogue"));
  await publishPackages({ gh, tag, sha, prerelease: true, output });
  assert.equal(remote.release.isDraft, false);
  assert.equal(remote.calls.filter((args) => args[1] === "upload").length, 1);
  assert.ok(remote.calls.findIndex((args) => args[1] === "download") < remote.calls.findIndex((args) => args[1] === "edit"));
}));
test("creation that commits before returning 502 is recovered without recreating", () => fixture(async ({ remote, gh, output }) => {
  remote.create502 = true;
  await publishPackages({ gh, tag, sha, prerelease: true, output });
  assert.equal(remote.calls.filter((args) => args[1] === "create").length, 1);
  assert.equal(remote.release.isDraft, false);
}));
test("mismatched published bytes are rejected without replacing or deleting assets", () => fixture(async ({ remote, gh, output }) => {
  remote.release = { isDraft: false, isPrerelease: true, targetCommitish: sha };
  remote.assets.set("registry.json", Buffer.from("catalogue"));
  remote.assets.set("file-previews-1.7.0.zip", Buffer.from("different bytes"));
  await assert.rejects(publishPackages({ gh, tag, sha, prerelease: true, output }), /bytes differ/);
  assert.ok(remote.calls.every((args) => ["view", "download"].includes(args[1])));
}));
test("lookup failures never cause release creation", () => fixture(async ({ remote, gh, output }) => {
  remote.viewFailure = true;
  await assert.rejects(publishPackages({ gh, tag, sha, prerelease: true, output }), /502/);
  assert.equal(remote.calls.length, 1);
}));
test("a conflicting partial draft is not extended with more assets", () => fixture(async ({ remote, gh, output }) => {
  remote.release = { isDraft: true, isPrerelease: true, targetCommitish: sha };
  remote.assets.set("registry.json", Buffer.from("changed catalogue"));
  await assert.rejects(publishPackages({ gh, tag, sha, prerelease: true, output }), /bytes differ/);
  assert.ok(remote.calls.every((args) => ["view", "download"].includes(args[1])));
}));
test("draft source and unexpected assets are rejected before uploads", () => fixture(async ({ remote, gh, output }) => {
  remote.release = { isDraft: true, isPrerelease: true, targetCommitish: "b".repeat(40) };
  await assert.rejects(publishPackages({ gh, tag, sha, prerelease: true, output }), /different source/);
  remote.release.targetCommitish = sha;
  remote.assets.set("unexpected.zip", Buffer.from("old"));
  await assert.rejects(publishPackages({ gh, tag, sha, prerelease: true, output }), /unexpected assets/);
  assert.ok(remote.calls.every((args) => args[1] === "view"));
}));
