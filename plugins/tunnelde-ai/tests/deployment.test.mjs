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
    if (method === "sessions.list") return host.sessions;
    if (method === "files.sftp.resolveDirectory") return { home: "/home/test", path: "/home/test" };
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
  host.sessions = [{ id: "ssh", hostId: "host", address: "test@server:22", title: "Test" }];
  return { root, host, calls, local, execution: { kind: "remote", home: "/home/test", platform: "posix", hostId: "host", sessionId: "ssh", title: "Test", address: "test@server:22" } };
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
  const saved = { directory, hostId: "host", address: f.execution.address, fingerprint: createHash("sha256").update(JSON.stringify([...files])).digest("hex"),
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

test("a disconnected partial deployment retains persisted ownership and cleans on retry", async (t) => {
  const f = await fixture(t);
  const call = f.host.call.bind(f.host);
  let disconnected = false;
  let saved;
  f.host.call = async (method, params) => {
    if (disconnected) throw new Error("offline");
    if (method === "files.sftp.writeText") { disconnected = true; throw new Error("write disconnected"); }
    return call(method, params);
  };
  await assert.rejects(deployFiles(f.host, f.execution, new Map([["index.mjs", "code"]]), {
    label: "tunnelde-ai", onCheckpoint: async (record) => { saved = structuredClone(record); },
  }), /cleanup is pending/);
  assert.equal(saved.incomplete, true);
  assert.equal(saved.created.length, 2);
  assert.equal(saved.pendingWrites["index.mjs"], createHash("sha256").update("code").digest("hex"));
  const failedDirectory = saved.directory;
  f.host.call = call;
  const restored = await deployFiles(f.host, f.execution, new Map([["index.mjs", "code"]]), {
    label: "tunnelde-ai", saved, onCheckpoint: async (record) => { saved = structuredClone(record); },
  });
  assert.equal(await stat(f.local(failedDirectory)).then(() => true, () => false), false);
  assert.equal(restored.incomplete, false);
  await cleanupDeployment(f.host, f.execution, restored);
});

test("cleanup verifies current content after a lost write acknowledgement", async (t) => {
  const f = await fixture(t);
  const call = f.host.call.bind(f.host);
  f.host.call = async (method, params) => {
    const result = await call(method, params);
    if (method === "files.sftp.writeText") throw new Error("lost acknowledgement");
    return result;
  };
  let saved;
  await assert.rejects(deployFiles(f.host, f.execution, new Map([["index.mjs", "code"]]), {
    label: "tunnelde-ai", onCheckpoint: async (record) => { saved = structuredClone(record); },
  }), /lost acknowledgement/);
  assert.equal(saved, null);
  assert.deepEqual(await readdir(f.local("/home/test/.TunneldeAI/Chats")), []);
});

test("failed upload preserves unrecognized files and keeps a retryable ownership record", async (t) => {
  const f = await fixture(t);
  const call = f.host.call.bind(f.host);
  f.host.call = async (method, params) => {
    if (method === "files.sftp.writeText") {
      await writeFile(f.local(path.posix.dirname(params.path) + "/user.txt"), "user data");
      throw new Error("upload failed");
    }
    return call(method, params);
  };
  let saved;
  await assert.rejects(deployFiles(f.host, f.execution, new Map([["index.mjs", "code"]]), {
    label: "tunnelde-ai", onCheckpoint: async (record) => { saved = structuredClone(record); },
  }), /cleanup is pending.*unrecognized/);
  assert.equal(saved.incomplete, true);
  assert.equal(await readFile(f.local(saved.directory + "/user.txt"), "utf8"), "user data");
  assert.equal(f.calls.some((call) => call.method === "files.sftp.delete"), false);
  await rm(f.local(saved.directory + "/user.txt"));
  f.host.call = call;
  await cleanupDeployment(f.host, f.execution, saved);
});

test("failed replacement cleanup preserves the previous reusable deployment", async (t) => {
  const f = await fixture(t);
  const old = await deployFiles(f.host, f.execution, new Map([["index.mjs", "old"]]), { label: "tunnelde-ai" });
  const call = f.host.call.bind(f.host);
  f.host.call = async (method, params) => {
    if (method === "files.sftp.writeText") throw new Error("cannot upload");
    return call(method, params);
  };
  let saved;
  await assert.rejects(deployFiles(f.host, f.execution, new Map([["index.mjs", "new"]]), {
    label: "tunnelde-ai", saved: old, onCheckpoint: async (record) => { saved = structuredClone(record); },
  }), /cannot upload/);
  assert.equal(saved.directory, old.directory);
  assert.equal(await readFile(f.local(old.directory + "/index.mjs"), "utf8"), "old");
  f.host.call = call;
  await cleanupDeployment(f.host, f.execution, old);
});

test("deployment cleanup refuses a changed address even when host ID and session ID match", async (t) => {
  const f = await fixture(t);
  const saved = await deployFiles(f.host, f.execution, new Map([["index.mjs", "code"]]), { label: "tunnelde-ai" });
  assert.equal(saved.address, f.execution.address);
  f.host.sessions[0].address = "test@changed:22";
  f.calls.length = 0;
  await assert.rejects(cleanupDeployment(f.host, f.execution, saved), /disconnected/);
  assert.deepEqual(f.calls.map(x => x.method), ["sessions.list"]);
  assert.equal(await readFile(f.local(saved.directory + "/index.mjs"), "utf8"), "code");
});

test("cleanup reconnects only to the captured address among a host's multiple sessions", async (t) => {
  const f = await fixture(t);
  const saved = await deployFiles(f.host, f.execution, new Map([["index.mjs", "code"]]), { label: "tunnelde-ai" });
  f.host.sessions = [
    { ...f.host.sessions[0], id: "wrong", address: "test@changed:22" },
    { ...f.host.sessions[0], id: "right" },
  ];
  f.calls.length = 0;
  await cleanupDeployment(f.host, f.execution, saved);
  const operations = f.calls.filter(x => x.method.startsWith("files.sftp."));
  assert.ok(operations.length > 0);
  assert.ok(operations.every(x => x.params.sessionId === "right"));
  assert.equal(await stat(f.local(saved.directory)).then(() => true, () => false), false);
});

test("legacy deployment identity review can be declined before any filesystem access", async (t) => {
  const f = await fixture(t);
  const saved = await deployFiles(f.host, f.execution, new Map([["index.mjs", "code"]]), { label: "tunnelde-ai" });
  delete saved.address;
  const original = f.host.call.bind(f.host);
  f.host.call = (method, params) => method === "ui.confirm" ? false : original(method, params);
  f.calls.length = 0;
  await assert.rejects(cleanupDeployment(f.host, f.execution, saved), /identity review was cancelled/);
  assert.deepEqual(f.calls.map(x => x.method), ["sessions.list"]);
  assert.equal(saved.address, undefined);
  assert.equal(await readFile(f.local(saved.directory + "/index.mjs"), "utf8"), "code");
});

test("legacy deployment requires explicit identity approval before verifying and cleaning files", async (t) => {
  const f = await fixture(t);
  const saved = await deployFiles(f.host, f.execution, new Map([["index.mjs", "code"]]), { label: "tunnelde-ai" });
  delete saved.address;
  f.calls.length = 0;
  await cleanupDeployment(f.host, f.execution, saved);
  assert.equal(saved.address, f.execution.address);
  const approval = f.calls.findIndex(x => x.method === "ui.confirm");
  const firstFilesystem = f.calls.findIndex(x => x.method.startsWith("files.sftp."));
  assert.ok(approval >= 0 && firstFilesystem > approval);
  assert.match(f.calls[approval].params.message, /test@server:22/);
  assert.equal(await stat(f.local(saved.directory)).then(() => true, () => false), false);
});

test("legacy deployment cannot choose between multiple addresses for the same host", async (t) => {
  const f = await fixture(t);
  const saved = await deployFiles(f.host, f.execution, new Map([["index.mjs", "code"]]), { label: "tunnelde-ai" });
  delete saved.address;
  f.host.sessions.push({ ...f.host.sessions[0], id: "other", address: "test@second:22" });
  f.calls.length = 0;
  await assert.rejects(cleanupDeployment(f.host, f.execution, saved), /original SSH destination/);
  assert.deepEqual(f.calls.map(x => x.method), ["sessions.list"]);
  assert.equal(saved.address, undefined);
});

test("cleanup rechecks the captured destination after legacy identity approval", async (t) => {
  const f = await fixture(t);
  const saved = await deployFiles(f.host, f.execution, new Map([["index.mjs", "code"]]), { label: "tunnelde-ai" });
  delete saved.address;
  const original = f.host.call.bind(f.host);
  f.host.call = async (method, params) => {
    if (method === "ui.confirm") {
      f.host.sessions[0].address = "test@changed:22";
      return true;
    }
    return original(method, params);
  };
  f.calls.length = 0;
  await assert.rejects(cleanupDeployment(f.host, f.execution, saved), /disconnected/);
  assert.ok(!f.calls.some(x => x.method.startsWith("files.sftp.")));
  assert.equal(await readFile(f.local(saved.directory + "/index.mjs"), "utf8"), "code");
});

test("matching source code never reuses a deployment on a changed destination", async (t) => {
  const f = await fixture(t);
  const files = new Map([["index.mjs", "code"]]);
  const old = await deployFiles(f.host, f.execution, files, { label: "tunnelde-ai" });
  const changed = { ...f.execution, address: "test@changed:22" };
  const next = await deployFiles(f.host, changed, files, { label: "tunnelde-ai", saved: old });
  assert.notEqual(next.directory, old.directory);
  assert.equal(next.address, changed.address);
  assert.equal(next.retired[0], old);
  assert.equal(await readFile(f.local(old.directory + "/index.mjs"), "utf8"), "code");
});

test("conversation deletion keeps history and ownership when its remote destination changed", async (t) => {
  const f = await fixture(t);
  const storage = new Map();
  const original = f.host.call.bind(f.host);
  f.host.call = async (method, params) => {
    if (method === "storage.get") return storage.get(params.key) ?? null;
    if (method === "storage.set") { storage.set(params.key, structuredClone(params.value)); return null; }
    return original(method, params);
  };
  const engine = new AiPlugin(f.host);
  await engine.initialize();
  const conversation = engine.newSession();
  conversation.execution = f.execution;
  conversation.remoteStdio = await deployFiles(f.host, f.execution, new Map([["index.mjs", "code"]]), { label: "tunnelde-ai" });
  f.host.sessions[0].address = "test@changed:22";
  f.calls.length = 0;
  await assert.rejects(engine.command("ai.session", { action: "delete", sessionId: conversation.id }), /disconnected/);
  assert.equal(engine.session(conversation.id), conversation);
  assert.ok(storage.get("ai.sessions").sessions.some(x => x.id === conversation.id && x.remoteStdio));
  assert.ok(!f.calls.some(x => x.method.startsWith("files.sftp.")));
  await engine.shutdown();
});

test("retired deployments retain independent destination identities during cleanup", async (t) => {
  const f = await fixture(t);
  const first = await deployFiles(f.host, f.execution, new Map([["index.mjs", "old"]]), { label: "tunnelde-ai" });
  const changed = { ...f.execution, sessionId: "second", address: "test@second:22" };
  f.host.sessions.push({ id: changed.sessionId, hostId: changed.hostId, address: changed.address });
  const next = await deployFiles(f.host, changed, new Map([["index.mjs", "new"]]), { label: "tunnelde-ai", saved: first });
  f.calls.length = 0;
  await cleanupDeployment(f.host, changed, next);
  for (const call of f.calls.filter(x => x.method === "files.sftp.delete")) {
    const original = call.params.path === first.directory || call.params.path.startsWith(first.directory + "/");
    assert.equal(call.params.sessionId, original ? "ssh" : "second");
  }
  assert.equal(await stat(f.local(first.directory)).then(() => true, () => false), false);
  assert.equal(await stat(f.local(next.directory)).then(() => true, () => false), false);
});
