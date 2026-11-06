import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCli, insideRoot, codexPolicy, TaskConnection } from "../lib/cli.mjs";
import { canonicalWithin } from "../lib/pi-permissions.mjs";

test("large concurrent agent requests respect the host limit and keep frames intact", async () => {
  const chunks = [];
  const host = { async call(method, params) {
    if (method === "tasks.cancel") return true;
    if (method === "tasks.readOutput") return { status: "running", events: [] };
    if (method === "tasks.write") {
      assert.ok(Buffer.byteLength(params.data) <= 128 * 1024);
      assert.equal(Buffer.from(params.data).toString("utf8"), params.data);
      chunks.push(params.data);
      await new Promise((resolve) => setTimeout(resolve, 1));
      return true;
    }
    throw new Error(`Unexpected ${method}`);
  } };
  const connection = new TaskConnection(host, "task", { onRecord: async () => {} });
  const first = { id: 1, text: "界".repeat(32760) + "😀" + "界".repeat(17000) };
  const second = { id: 2, text: "second" };
  await Promise.all([connection.write(first), connection.write(second)]);
  assert.ok(chunks.length > 2);
  assert.deepEqual(chunks.join("").trimEnd().split("\n").map(JSON.parse), [first, second]);
  await connection.close();
  await connection.done;
});

test("a failed partial agent frame closes the task and rejects queued writes", async () => {
  let writes = 0, cancelled = 0;
  const host = { async call(method) {
    if (method === "tasks.readOutput") return { status: "running", events: [] };
    if (method === "tasks.cancel") { cancelled++; return true; }
    if (method === "tasks.write") {
      writes++;
      if (writes === 2) throw new Error("disconnected");
      return true;
    }
    throw new Error(`Unexpected ${method}`);
  } };
  const connection = new TaskConnection(host, "task", { onRecord: async () => {} });
  const [first, second] = await Promise.allSettled([
    connection.write({ text: "x".repeat(70000) }),
    connection.write({ text: "must not follow a partial frame" }),
  ]);
  assert.equal(first.status, "rejected");
  assert.equal(second.status, "rejected");
  assert.equal(writes, 2);
  assert.equal(cancelled, 1);
  await connection.done;
});

test("closing a task stops remaining fragments of an in-flight write", async () => {
  let release, started;
  const blocked = new Promise((resolve) => { release = resolve; });
  const firstWrite = new Promise((resolve) => { started = resolve; });
  let writes = 0;
  const host = { async call(method) {
    if (method === "tasks.readOutput") return { status: "running", events: [] };
    if (method === "tasks.cancel") return true;
    if (method === "tasks.write") { writes++; started(); await blocked; return true; }
    throw new Error(`Unexpected ${method}`);
  } };
  const connection = new TaskConnection(host, "task", { onRecord: async () => {} });
  const writing = connection.write({ text: "x".repeat(70000) });
  await firstWrite;
  await connection.close();
  release();
  await assert.rejects(writing, /task is closed/);
  assert.equal(writes, 1);
  await connection.done;
});

test("recovery never starts a new process when the saved task is gone", async () => {
  for (const result of [null, new Error("plugin.tasks.notFound")]) {
    const calls = [];
    const host = { async call(method) {
      calls.push(method);
      if (method !== "tasks.status") throw new Error(`Unexpected ${method}`);
      if (result instanceof Error) throw result;
      return result;
    } };
    await assert.rejects(runCli({
      host,
      profile: { protocol: "codex", executable: "codex", cwd: "/home/test", sessionId: "ssh" },
      config: { mode: "ask", scope: { sessionIds: ["ssh"], remoteRoots: [{ sessionId: "ssh", path: "/home/test" }] } },
      session: { cli: { taskId: "old-task" } }, message: "continue", recover: true,
      signal: new AbortController().signal, onDelta: () => {}, approve: async () => false,
    }), /previous agent process is no longer/);
    assert.deepEqual(calls, ["tasks.status"]);
  }
});

test("recovery drains a finished agent's retained output without restarting or sending", async () => {
  for (const [protocol, records] of [
    ["codex", [{ method: "item/agentMessage/delta", params: { delta: "answer" } }, { method: "turn/completed", params: { turn: { status: "completed" } } }]],
    ["claude-code", [{ type: "result", subtype: "success", result: "answer" }]],
    ["pi", [{ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "answer" } }, { type: "agent_settled" }]],
  ]) {
    const calls = [];
    let text = "";
    const host = { async call(method) {
      calls.push(method);
      if (method === "tasks.status") return { status: "completed", exitCode: 0 };
      if (method === "tasks.readOutput") return { status: "completed", events: records.map((record, i) => ({ seq: i + 1, stream: "stdout", data: JSON.stringify(record) + "\n" })) };
      throw new Error(`Unexpected ${method}`);
    } };
    const result = await runCli({
      host, profile: { name: protocol, protocol, executable: protocol, cwd: "/home/test", sessionId: "ssh", permissionExtension: "/home/test/ext.mjs" },
      config: { mode: "ask", scope: { sessionIds: ["ssh"], remoteRoots: [{ sessionId: "ssh", path: "/home/test" }] } },
      session: { cli: { taskId: "old-task" } }, message: "do not resend", recover: true,
      signal: new AbortController().signal, onDelta: (delta) => { text += delta; }, approve: async () => { throw new Error("unexpected approval"); },
    });
    assert.equal(result.text, "answer");
    assert.equal(text, "answer");
    assert.deepEqual(calls, ["tasks.status", "tasks.readOutput"]);
  }
});

test("finished agent recovery never approves stale requests or sends replies", async () => {
  const calls = [];
  let approvals = 0;
  const host = { async call(method) {
    calls.push(method);
    if (method === "tasks.status") return { status: "failed" };
    if (method === "tasks.readOutput") return { status: "failed", events: [{ seq: 1, stream: "stdout", data: JSON.stringify({ id: 12, method: "item/commandExecution/requestApproval", params: { command: "echo test" } }) + "\n" }] };
    throw new Error(`Unexpected ${method}`);
  } };
  await assert.rejects(runCli({
    host, profile: { name: "Codex", protocol: "codex", executable: "codex", cwd: "/home/test", sessionId: "ssh" },
    config: { mode: "ask", scope: { sessionIds: ["ssh"], remoteRoots: [{ sessionId: "ssh", path: "/home/test" }] } },
    session: { cli: { taskId: "old-task" } }, message: "do not resend", recover: true,
    signal: new AbortController().signal, onDelta: () => {}, approve: async () => { approvals++; return true; },
  }), /unanswered request/);
  assert.equal(approvals, 0);
  assert.deepEqual(calls, ["tasks.status", "tasks.readOutput"]);
});

test("agent reconnect restores a partial protocol line and its cursor together", async () => {
  const events = [
    { seq: 1, stream: "stdout", data: '{"message":"hel' },
    { seq: 2, stream: "stderr", data: "diagnostic" },
    { seq: 3, stream: "stdout", data: 'lo"}\n' },
  ];
  let save;
  const checkpoint = new Promise((resolve) => { save = resolve; });
  const host = {
    async call(method, params) {
      if (method === "tasks.cancel") return true;
      if (method === "tasks.readOutput") return { status: "running", events: events.filter((e) => e.seq > params.afterSeq && e.seq <= 2) };
      throw new Error(`Unexpected ${method}`);
    },
  };
  const first = new TaskConnection(host, "task", { onRecord: async () => {}, onCheckpoint: save });
  const saved = await checkpoint;
  await first.close();
  await first.done;
  assert.deepEqual(saved, { taskId: "task", afterSeq: 2, pendingOutput: '{"message":"hel', outputRecoveryUnavailable: false });
  const received = [];
  const second = new TaskConnection({
    async call(method, params) {
      if (method === "tasks.cancel") return true;
      if (method === "tasks.readOutput") return { status: "running", events: events.filter((e) => e.seq > params.afterSeq) };
      throw new Error(`Unexpected ${method}`);
    },
  }, "task", { ...saved, onRecord: async (record, channel) => { received.push(record); await channel.close(); } });
  await second.done;
  assert.equal(second.error, null);
  assert.deepEqual(received, [{ message: "hello" }]);
});

test("oversized partial agent output marks its saved cursor unrecoverable", async () => {
  let save;
  const checkpoint = new Promise((resolve) => { save = resolve; });
  const connection = new TaskConnection({
    async call(method) {
      if (method === "tasks.cancel") return true;
      if (method === "tasks.readOutput") return { status: "running", events: [{ seq: 1, stream: "stdout", data: "x".repeat(8193) }] };
      throw new Error(`Unexpected ${method}`);
    },
  }, "task", { onRecord: async () => {}, onCheckpoint: save });
  const saved = await checkpoint;
  await connection.close();
  await connection.done;
  assert.equal(saved.outputRecoveryUnavailable, true);
  assert.equal(saved.pendingOutput, "");
});

test("agent refuses to resume an incomplete oversized record rather than parsing a corrupted stream", async () => {
  const calls = [];
  const host = { async call(method) { calls.push(method); if (method === "tasks.status") return { status: "running" }; throw new Error(`Unexpected ${method}`); } };
  await assert.rejects(runCli({
    host,
    profile: { protocol: "codex", executable: "codex", cwd: "/home/test", sessionId: "ssh" },
    config: { mode: "ask", scope: { sessionIds: ["ssh"], remoteRoots: [{ sessionId: "ssh", path: "/home/test" }] } },
    session: { cli: { taskId: "task", afterSeq: 1, outputRecoveryUnavailable: true } },
    message: "hello", recover: true, signal: new AbortController().signal,
    onDelta: () => {}, approve: async () => false,
  }), /incomplete protocol message exceeded the recovery limit/);
  assert.deepEqual(calls, ["tasks.status"]);
});

test("agent output drains after process exit without losing split final records", async () => {
  let reads = 0;
  const records = [];
  const host = {
    async call(method) {
      if (method === "tasks.cancel") return true;
      if (method === "tasks.status") return { status: "completed", exitCode: 0 };
      if (method !== "tasks.readOutput") throw new Error(`Unexpected ${method}`);
      reads++;
      if (reads === 1) return { events: [], status: "running" };
      if (reads === 2) return { events: [{ seq: 1, stream: "stdout", data: '{"text":' }], status: "completed", exitCode: 0 };
      return { events: [{ seq: 2, stream: "stdout", data: '"finished"}\n' }], status: "completed", exitCode: 0 };
    },
  };
  const connection = new TaskConnection(host, "task", {
    onRecord: async (record, channel) => { records.push(record); await channel.close(); },
  });
  await connection.done;
  assert.equal(connection.error, null);
  assert.deepEqual(records, [{ text: "finished" }]);
  assert.equal(reads, 3);
});

function fixture(protocol, { truncated = false, handled = false } = {}) {
  const queue = [],
    writes = [],
    calls = [];
  let seq = 0;
  const push = (record) =>
    queue.push({
      seq: ++seq,
      stream: "stdout",
      data: JSON.stringify(record) + "\n",
    });
  const host = {
    async call(method, params) {
      calls.push({ method, params });
      if (method === "tasks.start") return { taskId: "task" };
      if (method === "tasks.status")
        return { taskId: "task", status: "running" };
      if (method === "tasks.cancel") return true;
      if (method === "tasks.readOutput")
        return { events: queue.splice(0), truncated };
      if (method === "tasks.write") {
        const record = JSON.parse(params.data);
        writes.push(record);
        if (protocol === "codex") {
          if (record.method === "initialize")
            push({ jsonrpc: "2.0", id: record.id, result: {} });
          if (["thread/start", "thread/resume"].includes(record.method))
            push({
              jsonrpc: "2.0",
              id: record.id,
              result: { thread: { id: "thread" } },
            });
          if (record.method === "turn/start") {
            push({
              method: "item/reasoning/summaryTextDelta",
              params: { itemId: "thinking", delta: "Checking the directory" },
            });
            push({
              method: "item/started",
              params: {
                item: {
                  id: "tool-one",
                  type: "commandExecution",
                  command: "ls",
                },
              },
            });
            push({
              method: "item/commandExecution/outputDelta",
              params: { itemId: "tool-one", delta: "file.txt" },
            });
            push({
              method: "item/completed",
              params: {
                item: {
                  id: "tool-one",
                  type: "commandExecution",
                  command: "ls",
                  aggregatedOutput: "file.txt",
                  status: "completed",
                },
              },
            });
            push({
              jsonrpc: "2.0",
              id: record.id,
              result: { turn: { id: "turn" } },
            });
            push({
              method: "item/agentMessage/delta",
              params: { delta: "answer" },
            });
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
          if (
            record.type === "control_request" &&
            record.request.subtype === "initialize"
          )
            push({
              type: "control_response",
              response: {
                subtype: "success",
                request_id: record.request_id,
                response: {},
              },
            });
          if (record.type === "user") {
            push({
              type: "stream_event",
              event: { type: "message_start", message: { id: "msg" } },
            });
            push({
              type: "stream_event",
              event: {
                type: "content_block_delta",
                index: 0,
                delta: {
                  type: "thinking_delta",
                  thinking: "Checking the directory",
                },
              },
            });
            push({
              type: "assistant",
              message: {
                content: [
                  {
                    type: "tool_use",
                    id: "tool-one",
                    name: "Read",
                    input: { path: "file.txt" },
                  },
                ],
              },
            });
            push({
              type: "user",
              message: {
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: "tool-one",
                    content: "file.txt",
                  },
                ],
              },
            });
            push({ type: "system", session_id: "vendor-session" });
            push({
              type: "stream_event",
              event: {
                type: "content_block_delta",
                delta: { type: "text_delta", text: "answer" },
              },
            });
            push({
              type: "control_request",
              request_id: "approve",
              request: {
                subtype: "can_use_tool",
                tool_name: "Write",
                input: { path: "a" },
              },
            });
          }
          if (record.type === "control_response")
            push({
              type: "result",
              subtype: "success",
              result: "answer",
              is_error: false,
            });
        } else {
          if (record.type === "get_state")
            push({
              type: "response",
              command: "get_state",
              success: true,
              data: { sessionFile: "/work/session.jsonl" },
            });
          if (record.type === "prompt") {
            if (handled) {
              push({
                type: "response",
                command: "prompt",
                success: true,
                data: { disposition: "handled" },
              });
              return true;
            }
            push({
              type: "message_update",
              assistantMessageEvent: {
                type: "thinking_delta",
                contentIndex: 0,
                delta: "Checking the directory",
              },
            });
            push({
              type: "tool_execution_start",
              toolCallId: "tool-one",
              toolName: "read",
              args: { path: "file.txt" },
            });
            push({
              type: "tool_execution_end",
              toolCallId: "tool-one",
              result: "file.txt",
              isError: false,
            });
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
          if (record.type === "extension_ui_response")
            push({ type: "agent_settled" });
        }
        return true;
      }
      throw new Error(`Unexpected ${method}`);
    },
  };
  return { host, writes, calls };
}

for (const protocol of ["codex", "claude-code", "pi"]) {
  test(`${protocol}: remote structured transport selects SSH stdin/stdout and remote paths`, async () => {
    const { host, calls } = fixture(protocol);
    const profile = {
      id: "remote",
      name: "Remote agent",
      protocol,
      executable: { codex: "codex", "claude-code": "claude", pi: "pi" }[
        protocol
      ],
      sessionId: "ssh-target",
      platform: "posix",
      cwd: "/home/test/project",
      ...(protocol === "pi"
        ? {
            permissionExtension: "/home/test/.tunnelde-test/pi-permissions.mjs",
          }
        : {}),
    };
    await runCli({
      host,
      profile,
      session: {},
      message: "hello",
      config: {
        mode: "ask",
        scope: {
          localRoots: [],
          sessionIds: ["ssh-target"],
          remoteRoots: [
            { sessionId: "ssh-target", path: "/home/test/project" },
          ],
        },
      },
      signal: new AbortController().signal,
      onDelta: () => {},
      approve: async () => false,
    });
    const start = calls.find(({ method }) => method === "tasks.start").params;
    assert.equal(start.sessionId, "ssh-target");
    assert.equal(start.platform, "posix");
    assert.equal(start.cwd, "/home/test/project");
    assert.equal(start.executable, profile.executable);
    if (protocol === "pi")
      assert.equal(
        start.args[start.args.indexOf("--extension") + 1],
        profile.permissionExtension,
      );
  });
}

test("Pi handled prompts complete without waiting for a run that was never started", async () => {
  const { host } = fixture("pi", { handled: true });
  const result = await runCli({
    host,
    profile: { protocol: "pi", executable: "pi", cwd: "C:\\work" },
    config: {
      mode: "ask",
      scope: { localRoots: ["C:\\work"], sessionIds: [], remoteRoots: [] },
    },
    session: {},
    message: "/command",
    signal: new AbortController().signal,
    onDelta: () => {},
    approve: async () => false,
  });
  assert.equal(result.text, "");
});

test("failed remote startup reports stderr and cancels the task instead of hanging initialization", async () => {
  const calls = [];
  const host = {
    async call(method) {
      calls.push(method);
      if (method === "tasks.start") return { taskId: "failed" };
      if (method === "tasks.readOutput")
        return {
          events: [
            { seq: 1, stream: "stderr", data: "codex: command not found" },
          ],
        };
      if (method === "tasks.status") return { status: "failed", exitCode: 127 };
      return true;
    },
  };
  await assert.rejects(
    runCli({
      host,
      profile: {
        protocol: "codex",
        executable: "codex",
        cwd: "/home/test",
        sessionId: "ssh",
      },
      config: {
        mode: "ask",
        scope: {
          sessionIds: ["ssh"],
          remoteRoots: [{ sessionId: "ssh", path: "/home/test" }],
        },
      },
      session: {},
      message: "hello",
      signal: new AbortController().signal,
      onDelta: () => {},
      approve: async () => false,
    }),
    /codex: command not found/,
  );
  assert.ok(calls.includes("tasks.cancel"));
});
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
    const activities = [];
    const session = {},
      approvals = [];
    let delta = "";
    const result = await runCli({
      host,
      profile,
      config: {
        mode: "ask",
        scope: { localRoots: ["C:\\work"], remoteRoots: [], sessionIds: [] },
      },
      session,
      message: "hello",
      signal: controller.signal,
      onDelta: (part) => {
        delta += part;
      },
      onActivity: (event) => activities.push(event),
      approve: async (request) => {
        approvals.push(request);
        return true;
      },
    });
    assert.equal(result.text, "answer");
    assert.equal(delta, "answer");
    assert.ok(
      activities.some(
        (item) =>
          item.kind === "reasoning" && item.delta === "Checking the directory",
      ),
    );
    assert.ok(
      activities.some(
        (item) => item.kind === "tool" && item.content === "file.txt",
      ),
    );
    assert.equal(approvals.length, 1);
    assert.ok(calls.some((item) => item.method === "tasks.cancel"));
    if (protocol === "codex") {
      assert.equal(writes[0].method, "initialize");
      assert.equal(session.cli.threadId, "thread");
      assert.equal(
        writes.find((record) => record.id === 99).result.decision,
        "accept",
      );
    }
    if (protocol === "claude-code") {
      assert.equal(writes[0].request.subtype, "initialize");
      assert.equal(session.cli.sessionId, "vendor-session");
      assert.equal(
        writes.find((record) => record.type === "control_response").response
          .response.behavior,
        "allow",
      );
    }
    if (protocol === "pi")
      assert.equal(
        writes.find((record) => record.type === "extension_ui_response")
          .confirmed,
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
    codexPolicy("readOnly", "/work").sandboxPolicy.access
      .includePlatformDefaults,
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
    assert.equal(
      await canonicalWithin("../outside/new", root, { allowMissing: true }),
      false,
    );
    try {
      await symlink(
        outside,
        path.join(root, "link"),
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (["EPERM", "EACCES"].includes(error.code)) {
        context.diagnostic(
          "Symlink creation unavailable; direct traversal checks passed",
        );
        return;
      }
      throw error;
    }
    assert.equal(await canonicalWithin("link", root), false);
    assert.equal(
      await canonicalWithin("link/new", root, { allowMissing: true }),
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
