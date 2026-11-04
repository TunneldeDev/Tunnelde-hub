import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function publishPackages({ gh, tag, sha, prerelease, output = "artifacts/release" }) {
  assert.match(tag, /^plugins-v\d+\.\d+\.\d+$/);
  assert.match(sha, /^[a-f0-9]{40}$/);
  const names = (await readdir(output)).sort();
  assert.ok(names.some((name) => name.endsWith(".zip")), "No packages collected");
  const directory = await mkdtemp(join(tmpdir(), "tunnelde-publish-"));
  const inspect = async () => {
    try { return JSON.parse(await gh(["release", "view", tag, "--json", "isDraft,isPrerelease,targetCommitish,assets"])); }
    catch (error) {
      if (/release not found|HTTP 404|Not Found/i.test(`${error.stderr ?? ""} ${error.message}`)) return null;
      throw error;
    }
  };
  try {
    let release = await inspect();
    if (!release) {
      try {
        await gh(["release", "create", tag, "--verify-tag", "--target", sha, "--draft", "--title", `Packages ${tag.slice(9)}`,
          "--notes", "Independent Tunnelde packages. See registry.json and SHA256SUMS for package versions and checksums.",
          ...(prerelease ? ["--prerelease"] : [])]);
      } catch (error) {
        // A 502 can arrive after creation committed. Reconcile before attempting it again.
        if (!await inspect()) throw error;
      }
      release = await inspect();
      assert.ok(release, "Release creation was not confirmed");
    }
    const existingNames = release.assets.map((asset) => asset.name).sort();
    assert.ok(existingNames.every((name) => names.includes(name)), "Release contains unexpected assets");
    if (release.isDraft) {
      assert.equal(release.targetCommitish, sha, "Draft belongs to a different source commit");
      assert.equal(release.isPrerelease, prerelease, "Draft has a different release channel");
      for (const name of names) {
        if (!existingNames.includes(name)) await gh(["release", "upload", tag, join(output, name)]);
      }
    }
    await gh(["release", "download", tag, "--dir", directory]);
    assert.deepEqual((await readdir(directory)).sort(), names, "Release asset set differs");
    for (const name of names) {
      assert.ok((await readFile(join(directory, name))).equals(await readFile(join(output, name))), `${name}: existing published bytes differ`);
    }
    if (release.isDraft) {
      await gh(["release", "edit", tag, "--draft=false", `--prerelease=${prerelease}`, "--latest=false"]);
      const published = await inspect();
      assert.ok(published && !published.isDraft && published.isPrerelease === prerelease, "Publication was not confirmed");
    }
    console.log(`${tag}: published packages verified; existing assets were not replaced.`);
  } finally { await rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const execute = promisify(execFile);
  await publishPackages({
    tag: process.env.PACKAGE_TAG, sha: process.env.PACKAGE_SHA,
    prerelease: process.env.PACKAGE_PRERELEASE !== "false",
    gh: async (args) => (await execute("gh", args, { encoding: "utf8", timeout: 120_000, maxBuffer: 2 * 1024 * 1024 })).stdout,
  });
}
