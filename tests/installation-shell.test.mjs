import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { nodeInstallScript } from "../plugins/tunnelde-ai/lib/installation.mjs";

const shell = process.platform === "win32" ? "sh.exe" : "/bin/sh";
const available = spawnSync(shell, ["-c", "command -v tar >/dev/null && command -v sha256sum >/dev/null"], { encoding: "utf8" }).status === 0;
const officialArchive = "https://nodejs.org/dist/v24.0.0/node-v24.0.0-linux-x64.tar.gz";

function run(script, args = [], cwd) {
  return spawnSync(shell, ["-c", script, "installation-test", ...args], { cwd, encoding: "utf8", timeout: 20000 });
}
function posix(file) {
  if (process.platform !== "win32") return file;
  const result = run('cygpath -u "$1"', [file]);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "tunnelde-installer-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const home = path.join(root, "a'$(touch INJECTED)");
  const tools = path.join(root, "tools");
  const stage = path.join(root, "stage");
  const bin = path.join(stage, "node-v24.0.0", "bin");
  const archive = path.join(root, "fixture.tar.gz");
  await Promise.all([fs.mkdir(home), fs.mkdir(tools), fs.mkdir(bin, { recursive: true })]);
  await fs.writeFile(path.join(home, "existing-service.conf"), "existing data\n");
  await fs.writeFile(path.join(bin, "node"), "#!/bin/sh\nprintf 'v24.0.0\\n'\n", { mode: 0o700 });
  // Substitute the download only. The generated script still runs real mktemp,
  // checksum comparison, tar extraction and the extracted executable.
  await fs.writeFile(path.join(tools, "curl"), `#!/bin/sh
set -eu
if [ "\${FIXTURE_DOWNLOAD_FAIL:-}" = 1 ]; then exit 22; fi
while [ "$#" -gt 0 ]; do
  if [ "$1" = -o ]; then shift; cp "$FIXTURE_ARCHIVE" "$1"; exit 0; fi
  shift
done
exit 2
`, { mode: 0o700 });
  const packed = run('chmod 700 "$1/bin/node" "$2/curl" && tar -czf "$3" -C "$4" node-v24.0.0', [posix(path.join(stage, "node-v24.0.0")), posix(tools), posix(archive), posix(stage)]);
  assert.equal(packed.status, 0, packed.stderr);
  const digest = createHash("sha256").update(await fs.readFile(archive)).digest("hex");
  return {
    root, home,
    execute(checksum = digest, failDownload = false) {
      return run('export PATH="$1:$PATH"\nexport FIXTURE_ARCHIVE="$2"\nexport FIXTURE_DOWNLOAD_FAIL="$3"\n' + nodeInstallScript(posix(home), officialArchive, checksum), [posix(tools), posix(archive), failDownload ? "1" : "0"], root);
    },
  };
}

test("installer extracts only a verified archive into a fresh private directory and quotes the home path", { skip: !available }, async (t) => {
  const setup = await fixture(t);
  const result = setup.execute();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /v24\.0\.0/);
  const entries = await fs.readdir(setup.home);
  const directory = entries.find((item) => item.startsWith(".tunnelde-runtime-"));
  assert.ok(directory);
  assert.match(result.stdout, /__TUNNELDE_RUNTIME__.*\/bin\/node/);
  assert.match(await fs.readFile(path.join(setup.home, directory, "bin", "node"), "utf8"), /v24\.0\.0/);
  assert.equal(await fs.readFile(path.join(setup.home, "existing-service.conf"), "utf8"), "existing data\n");
  assert.equal(await fs.stat(path.join(setup.root, "INJECTED")).then(() => true, () => false), false);
});

for (const failure of ["checksum", "download"]) {
  test(`installer ${failure} failure preserves existing files and removes its incomplete directory`, { skip: !available }, async (t) => {
    const setup = await fixture(t);
    const result = setup.execute(failure === "checksum" ? "0".repeat(64) : undefined, failure === "download");
    assert.notEqual(result.status, 0);
    if (failure === "checksum") assert.match(result.stderr, /checksum verification failed/);
    assert.deepEqual(await fs.readdir(setup.home), ["existing-service.conf"]);
    assert.equal(await fs.readFile(path.join(setup.home, "existing-service.conf"), "utf8"), "existing data\n");
  });
}
