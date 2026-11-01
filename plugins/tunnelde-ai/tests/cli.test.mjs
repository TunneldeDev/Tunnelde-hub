import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli, insideRoot, codexPolicy } from "../lib/cli.mjs";
import { canonicalWithin } from "../lib/pi-permissions.mjs";

function fixture(protocol, { truncated = false } = {}) {
  const queue = [],
    writes = [],
    calls = [];
  let seq = 0;
  const push = (record) =>
    queue.push({ seq: ++seq, stream: "stdout", data: JSON.stringify(record) + "\n" });
  const host = {
    async call(method, params) {
      calls.push({ method, params });
      if (method === "tasks.start") return { taskId: "task" };
      if (method === "tasks.status") return { taskId: "task", status: "running" };
      if (method === "tasks.cancel") return true;
      if (method === "tasks.readOutput") return { events: queue.splice(0), truncated };
      if (method === "tasks.write") {
        const record = JSON.parse(params.data);
        writes.push(record);
        if (protocol === "codex") {
          if (record.method === "initialize") push({ jsonrpc: "2.0", id: record.id, result: {} });
          if (["thread/start", "thread/resume"].includes(record.method))
            push({ jsonrpc: "2.0", id: record.id, result: { thread: { id: "thread" } } });
          if (record.method === "turn/start") {
            push({ jsonrpc: "2.0", id: record.id, result: { turn: { id: "turn" } } });
            push({ method: "item/agentMessage/delta", params: { delta: "answer" } });
            push({
              jsonrpc: "2.0",
              id: 99,
              method: "item/commandExecution/requestApproval",
              params: { command: "echo hello" },
            });
          }
          if (record.id === 99 && record.result)
            push({
              method: "turn/completed",
              params: { turn: { id: "turn", status: "completed" } },
            });
        } else if (protocol === "claude-code") {
          if (record.type === "user") {
            push({ type: "system", session_id: "vendor-session" });
            push({
              type: "stream_event",
              event: { type: "content_block_delta", delta: { type: "text_delta", text: "answer" } },
            });
            push({
              type: "control_request",
              request_id: "approve",
              request: { subtype: "can_use_tool", tool_name: "Write", input: { path: "a" } },
            });
          }
          if (record.type === "control_response")
            push({ type: "result", subtype: "success", result: "answer", is_error: false });
        } else {
          if (record.type === "get_state")
            push({
              type: "response",
              command: "get_state",
              success: true,
              data: { sessionFile: "/work/session.jsonl" },
            });
          if (record.type === "prompt") {
            push({
              type: "message_update",
              assistantMessageEvent: { type: "text_delta", delta: "answer" },
            });
            push({
              type: "extension_ui_request",
              id: "approve",
              method: "confirm",
              title: "tool",
              message: '{"tool":"write","input":{"path":"a"}}',
            });
          }
          if (record.type === "extension_ui_response") push({ type: "agent_settled" });
        }
        return true;
      }
      throw new Error(`Unexpected ${method}`);
    },
  };
  return { host, writes, calls };
}
for (const protocol of ["codex", "claude-code", "pi"]) {
  test(`${protocol}: structured initialization, deltas, approval and task cleanup`, async () => {
    const { host, writes, calls } = fixture(protocol),
      controller = new AbortController();
    const profile = {
      id: "p",
      name: "CLI",
      protocol,
      executable: "/bin/explicit-cli",
      cwd: "C:\\work",
    };
    const session = {},
      approvals = [];
    let delta = "";
    const result = await runCli({
      host,
      profile,
      config: { mode: "ask", scope: { localRoots: ["C:\\work"], remoteRoots: [], sessionIds: [] } },
      session,
      message: "hello",
      signal: controller.signal,
      onDelta: (part) => {
        delta += part;
      },
      approve: async (request) => {
        approvals.push(request);
        return true;
      },
    });
    assert.equal(result.text, "answer");
    assert.equal(delta, "answer");
    assert.equal(approvals.length, 1);
    assert.ok(calls.some((item) => item.method === "tasks.cancel"));
    if (protocol === "codex") {
      assert.equal(writes[0].method, "initialize");
      assert.equal(session.cli.threadId, "thread");
      assert.equal(writes.find((record) => record.id === 99).result.decision, "accept");
    }
    if (protocol === "claude-code") {
      assert.equal(session.cli.sessionId, "vendor-session");
      assert.equal(
        writes.find((record) => record.type === "control_response").response.response.behavior,
        "allow",
      );
    }
    if (protocol === "pi")
      assert.equal(
        writes.find((record) => record.type === "extension_ui_response").confirmed,
        true,
      );
  });
}
test("CLI read-only refuses unsupported sandbox modes before spawning", async () => {
  for (const protocol of ["claude-code", "pi"]) {
    const { host, calls } = fixture(protocol);
    await assert.rejects(
      runCli({
        host,
        profile: { protocol, executable: "cli", cwd: "C:\\work" },
        config: { mode: "readOnly", scope: { localRoots: ["C:\\work"] } },
        session: {},
        signal: new AbortController().signal,
      }),
      /restricted read sandbox/,
    );
    assert.equal(calls.length, 0);
  }
  assert.equal(
    codexPolicy("readOnly", "/work").sandboxPolicy.access.includePlatformDefaults,
    false,
  );
});
test("CLI truncated transport rejects and cancels, without hanging handshake", async () => {
  const { host, calls } = fixture("codex", { truncated: true });
  await assert.rejects(
    runCli({
      host,
      profile: { protocol: "codex", executable: "cli", cwd: "C:\\work" },
      config: { mode: "ask", scope: { localRoots: ["C:\\work"] } },
      session: {},
      signal: new AbortController().signal,
      onDelta() {},
      approve: async () => false,
    }),
    /truncated/,
  );
  assert.ok(calls.some((item) => item.method === "tasks.cancel"));
});
test("lexical scope rejects sibling prefixes and parent traversals", () => {
  assert.equal(insideRoot("/work-other/a", "/work", false), false);
  assert.equal(insideRoot("/work/../secret", "/work", false), false);
  assert.equal(insideRoot("C:\\Work\\a", "c:\\work", true), true);
});
test("Pi canonical path guard rejects symlink escape and missing outside writes", async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tunnelde-ai-path-"));
  try {
    const root = path.join(directory, "root"),
      outside = path.join(directory, "outside");
    await mkdir(root);
    await mkdir(outside);
    await writeFile(path.join(root, "file"), "ok");
    assert.equal(await canonicalWithin("file", root), true);
    assert.equal(await canonicalWithin("../outside/new", root, { allowMissing: true }), false);
    try {
      await symlink(
        outside,
        path.join(root, "link"),
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (["EPERM", "EACCES"].includes(error.code)) {
        context.diagnostic("Symlink creation unavailable; direct traversal checks passed");
        return;
      }
      throw error;
    }
    assert.equal(await canonicalWithin("link", root), false);
    assert.equal(await canonicalWithin("link/new", root, { allowMissing: true }), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
