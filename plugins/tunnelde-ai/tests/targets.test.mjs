import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  resolveExecution,
  executionConfig,
  executionProfile,
} from "../lib/targets.mjs";
import { toolInvocation, invokeTool, availableTools } from "../lib/tools.mjs";
import { AiPlugin } from "../lib/engine.mjs";

const config = {
  profiles: [
    { id: "api", name: "API", protocol: "openai-chat", model: "test" },
  ],
  activeProfileId: "api",
  mode: "ask",
  scope: { localRoots: [], sessionIds: [], remoteRoots: [] },
};
const sessions = [
  { id: "one", hostId: "host-one", title: "First host", address: "one:22" },
  { id: "two", hostId: "host-two", title: "Second host", address: "two:22" },
];
function fixture() {
  const calls = [],
    storage = new Map();
  return {
    calls,
    sessions: structuredClone(sessions),
    async call(method, params) {
      calls.push({ method, params: structuredClone(params) });
      if (method === "sessions.list") return this.sessions;
      if (method === "files.sftp.resolveDirectory") {
        const home = `/home/${params.sessionId}`;
        return {
          home,
          path: path.posix.resolve(
            home,
            (params.path || ".").replace(/^~\/?/, `${home}/`),
          ),
        };
      }
      if (method === "files.local.home")
        return process.platform === "win32" ? "C:\\Users\\test" : "/home/local";
      if (method === "storage.get") return storage.get(params.key) ?? null;
      if (method === "storage.set") {
        storage.set(params.key, params.value);
        return null;
      }
      if (method === "events.publish") return true;
      if (method === "tools.invoke") return params;
      throw new Error(`Unexpected ${method}`);
    },
  };
}

test("target selection discovers home, normalizes ~ and binds only the selected machine", async () => {
  const host = fixture();
  const one = await resolveExecution(
    host,
    { kind: "remote", sessionId: "one", cwd: "~/project" },
    config,
    {},
  );
  assert.equal(one.cwd, "/home/one/project");
  const scoped = executionConfig(config, one);
  assert.deepEqual(scoped.scope, {
    localRoots: [],
    sessionIds: ["one"],
    remoteRoots: [{ sessionId: "one", path: "/home/one/project" }],
  });
  assert.deepEqual(toolInvocation("list_directory", { path: "." }, one), {
    method: "files.sftp.list",
    params: { sessionId: "one", path: "/home/one/project" },
  });
  assert.equal(
    toolInvocation("read_file", { path: "~/notes" }, one).params.path,
    "/home/one/notes",
  );
  assert.throws(
    () =>
      toolInvocation("read_file", { path: "/home/two", sessionId: "two" }, one),
    /outside/,
  );
  const two = await resolveExecution(
    host,
    { kind: "remote", sessionId: "two" },
    config,
    {},
  );
  assert.equal(
    toolInvocation("run_command", { command: "pwd" }, two).params.sessionId,
    "two",
  );
  assert.match(
    toolInvocation("run_command", { command: "pwd" }, two).params.command,
    /^cd '\/home\/two' && pwd$/,
  );
  assert.ok(
    !host.calls.some(({ method }) => /tasks.start|sessions.exec/.test(method)),
  );
});

test("reconnect binds by saved host identity; disconnected targets never fall back to local", async () => {
  const host = fixture();
  const saved = await resolveExecution(
    host,
    { kind: "remote", sessionId: "one" },
    config,
    {},
  );
  host.sessions[0].id = "reconnected";
  assert.equal(
    (await resolveExecution(host, saved, config, {})).sessionId,
    "reconnected",
  );
  host.sessions = [host.sessions[1]];
  await assert.rejects(
    resolveExecution(host, saved, config, {}),
    /disconnected/,
  );
});

test("a remote CLI uses its own installed binary and never the local executable path", async () => {
  const remote = await resolveExecution(
    fixture(),
    { kind: "remote", sessionId: "one" },
    config,
    {},
  );
  for (const protocol of ["codex", "claude-code", "pi"]) {
    const profile = executionProfile(
      { protocol, executable: "C:\\local\\agent.exe", cwd: "C:\\work" },
      remote,
    );
    assert.equal(
      profile.executable,
      { codex: "codex", "claude-code": "claude", pi: "pi" }[protocol],
    );
    assert.equal(profile.sessionId, "one");
    assert.equal(profile.cwd, "/home/one");
    const migrated = executionProfile(
      { ...profile, remote: { sessionId: "old" }, helperBinary: "old-helper" },
      remote,
    );
    assert.equal(migrated.remote, undefined);
    assert.equal(migrated.helperBinary, undefined);
  }
});

test("Windows SSH directory mappings fail explicitly before starting any process", async () => {
  for (const home of ["C:/Users/test", "/C:/Users/test"]) {
    const host = fixture();
    const original = host.call.bind(host);
    host.call = (method, params) =>
      method === "files.sftp.resolveDirectory"
        ? { home, path: home }
        : original(method, params);
    await assert.rejects(
      resolveExecution(host, { kind: "remote", sessionId: "one" }, config, {}),
      /POSIX SSH/,
    );
    assert.ok(
      !host.calls.some(({ method }) =>
        /tasks.start|sessions.exec/.test(method),
      ),
    );
  }
});

test("workspace discovery is available in ReadOnly and normal tool scope remains enforced", async () => {
  const host = fixture();
  const execution = await resolveExecution(
    host,
    { kind: "remote", sessionId: "one" },
    config,
    {},
  );
  const scoped = { ...executionConfig(config, execution), mode: "readOnly" };
  assert.ok(
    availableTools("readOnly").some(({ name }) => name === "workspace_context"),
  );
  const context = await invokeTool(host, scoped, { name: "workspace_context" });
  assert.equal(context.execution.cwd, "/home/one");
  const result = await invokeTool(host, scoped, { name: "list_sessions" });
  assert.equal(result.method, "sessions.list");
  assert.deepEqual(result.scope.sessionIds, ["one"]);
  await assert.rejects(
    invokeTool(host, scoped, {
      name: "run_command",
      arguments: { command: "pwd" },
    }),
    /ReadOnly/,
  );
});

test("switching machines preserves conversations, target memory and model selection", async () => {
  const engine = new AiPlugin(fixture());
  await engine.command("ai.configure", { config });
  await engine.command("ai.target", {
    targetId: "one",
    modelId: "api",
    mode: "full",
  });
  const first = engine.session();
  first.history.push({ id: "message", role: "user", content: "Keep this" });
  await engine.command("ai.target", {
    targetId: "two",
    sessionId: first.id,
    modelId: "api",
  });
  assert.notEqual(engine.session().id, first.id);
  assert.equal(first.execution.sessionId, "one");
  assert.equal(engine.block().execution.sessionId, "two");
  assert.equal(engine.block().mode, "full");
  await engine.command("ai.session", { action: "new" });
  assert.equal(engine.block().execution.sessionId, "two");
  assert.equal(engine.block().mode, "full");
  assert.equal(engine.block().modelId, "api");
  await engine.command("ai.session", { action: "select", sessionId: first.id });
  assert.equal(engine.block().execution.sessionId, "one");
  await engine.shutdown();
});
