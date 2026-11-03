import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { cleanupDeployment, deployFiles } from "../lib/deployment.mjs";
import { AiPlugin } from "../lib/engine.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tunnelde-deployment-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const local = (remote) => {
    assert.ok(remote === "/home/test" || remote.startsWith("/home/test/"));
    return path.join(root, remote.slice("/home/test".length));
  };
  const host = { async call(method, params) {
    calls.push({ method, params });
    if (method === "ui.confirm") return true;
    if (method === "files.sftp.mkdir") return mkdir(local(params.path));
    if (method === "files.sftp.createFile") return writeFile(local(params.path), "", { flag: "wx" });
    if (method === "files.sftp.writeText") return writeFile(local(params.path), params.content);
    if (method === "files.sftp.readText") return { content: await readFile(local(params.path), "utf8") };
    if (method === "files.sftp.list") {
      const entries = await readdir(local(params.path), { withFileTypes: true });
      return { path: params.path, entries: entries.map((item) => ({ path: path.posix.join(params.path, item.name), isDir: item.isDirectory() })) };
    }
    if (method === "files.sftp.delete") return rm(local(params.path), { recursive: params.isDir });
    if (method === "files.sftp.rename") return rename(local(params.from), local(params.to));
    throw new Error(`Unexpected ${method}`);
  } };
  return { root, host, calls, local, execution: { home: "/home/test", platform: "posix", hostId: "host", sessionId: "ssh", title: "Test" } };
}

test("deployments share an application parent, reuse sources and clean only their own files", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, "service.conf"), "existing service");
  const files = new Map([["index.mjs", "code"], ["lib/helper.mjs", "helper"]]);
  const first = await deployFiles(f.host, f.execution, files, { label: "tunnelde-ai" });
  const second = await deployFiles(f.host, f.execution, files, { label: "pi-permissions" });
  assert.equal(await deployFiles(f.host, f.execution, files, { label: "tunnelde-ai", saved: first }), first);
  assert.match(first.directory, /^\/home\/test\/\.TunneldeAI\/Chats\/tunnelde-ai-/);
  await cleanupDeployment(f.host, f.execution, first);
  assert.equal(await stat(f.local(first.directory)).then(() => true, () => false), false);
  assert.equal(await readFile(f.local(second.directory + "/index.mjs"), "utf8"), "code");
  assert.equal(await readFile(path.join(f.root, "service.conf"), "utf8"), "existing service");
});

test("cleanup refuses changed content and unrelated files before deleting anything", async (t) => {
  const f = await fixture(t);
  const saved = await deployFiles(f.host, f.execution, new Map([["index.mjs", "code"]]), { label: "tunnelde-ai" });
  await writeFile(f.local(saved.directory + "/user.txt"), "user data");
  await assert.rejects(cleanupDeployment(f.host, f.execution, saved), /unrecognized/);
  assert.equal(f.calls.filter((call) => call.method === "files.sftp.delete").length, 0);
  await rm(f.local(saved.directory + "/user.txt"));
  await writeFile(f.local(saved.directory + "/index.mjs"), "user modified");
  await assert.rejects(cleanupDeployment(f.host, f.execution, saved), /changed/);
  assert.equal(f.calls.filter((call) => call.method === "files.sftp.delete").length, 0);
});

test("owned legacy deployment moves under Chats and its original fingerprint permits cleanup", async (t) => {
  const f = await fixture(t);
  const files = new Map([["index.mjs", "legacy code"]]);
  const directory = "/home/test/.tunnelde-tunnelde-ai-4cc36dc4-fefb-49a8-a0c6-a2238115e144";
  await mkdir(f.local(directory));
  await writeFile(f.local(directory + "/index.mjs"), "legacy code");
  const saved = { directory, hostId: "host", fingerprint: createHash("sha256").update(JSON.stringify([...files])).digest("hex"),
    created: [{ path: directory, isDir: true }, { path: directory + "/index.mjs", isDir: false }] };
  const migrated = await deployFiles(f.host, f.execution, files, { label: "tunnelde-ai", saved });
  assert.equal(migrated, saved);
  assert.ok(migrated.directory.includes("/.TunneldeAI/Chats/"));
  assert.equal(await stat(f.local(directory)).then(() => true, () => false), false);
  await cleanupDeployment(f.host, f.execution, migrated);
  assert.equal(await stat(f.local(migrated.directory)).then(() => true, () => false), false);
});

test("reaching the conversation limit does not discard history or remote ownership records", () => {
  const engine = new AiPlugin({ call: async () => null });
  for (let i = 0; i < 12; i++) engine.newSession();
  engine.sessions[0].remoteStdio = { directory: "/home/test/owned", created: [{ path: "/home/test/owned", isDir: true }] };
  const oldest = engine.sessions[0];
  assert.throws(() => engine.newSession(), /Delete a conversation/);
  assert.equal(engine.sessions.length, 12);
  assert.equal(engine.sessions[0], oldest);
});
