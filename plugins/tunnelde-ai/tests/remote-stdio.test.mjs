import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AiPlugin } from "../lib/engine.mjs";
import { deployFiles } from "../lib/deployment.mjs";

test(
  "remote API runs in a separate stdio process with scoped callbacks and memory-only credentials",
  { timeout: 20000 },
  async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "tunnelde-remote-stdio-"),
    );
    const remoteDirectory = "/workspace/remote";
    const localPath = (value) => {
      assert.ok(
        value === remoteDirectory || value.startsWith(`${remoteDirectory}/`),
      );
      return path.join(directory, value.slice(remoteDirectory.length));
    };
    const calls = [],
      files = [],
      data = new Map(),
      queue = [];
    let child,
      seq = 0,
      requests = 0,
      status = "running",
      exitCode,
      exited;
    const secret = "test-remote-key-never-write-to-disk";
    const server = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      assert.equal(request.headers.authorization, `Bearer ${secret}`);
      assert.ok(child && child.pid !== process.pid);
      assert.equal(input.model, "test-model");
      requests++;
      if (requests === 3) return; // Keep the next provider stream pending until Stop.
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      const delta =
        requests === 1
          ? {
              tool_calls: [
                {
                  index: 0,
                  id: "list",
                  type: "function",
                  function: {
                    name: "list_directory",
                    arguments: '{"path":"."}',
                  },
                },
              ],
            }
          : { content: "Remote answer" };
      response.end(
        `data: ${JSON.stringify({ choices: [{ delta, finish_reason: requests === 1 ? "tool_calls" : "stop" }] })}\n\ndata: [DONE]\n\n`,
      );
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const host = {
      async call(method, params) {
        calls.push({ method, params: structuredClone(params) });
        if (method === "storage.get") return data.get(params.key) ?? null;
        if (method === "storage.set") {
          data.set(params.key, structuredClone(params.value));
          return null;
        }
        if (method === "sessions.list")
          return [
            {
              id: "ssh",
              hostId: "host",
              title: "Test SSH",
              address: "test:22",
            },
          ];
        if (method === "files.sftp.resolveDirectory")
          return { home: remoteDirectory, path: remoteDirectory };
        if (method === "files.sftp.mkdir") {
          await mkdir(localPath(params.path));
          return null;
        }
        if (method === "files.sftp.createFile") {
          await writeFile(localPath(params.path), "", { flag: "wx" });
          files.push(localPath(params.path));
          return null;
        }
        if (method === "files.sftp.writeText") {
          await writeFile(localPath(params.path), params.content);
          return null;
        }
        if (method === "ui.confirm") return true;
        if (method === "secrets.get") {
          assert.equal(params.key, "provider.api");
          return secret;
        }
        if (method === "events.publish") return true;
        if (method === "tools.invoke") {
          assert.equal(params.method, "files.sftp.list");
          assert.equal(params.params.sessionId, "ssh");
          assert.equal(params.params.path, remoteDirectory);
          assert.equal(params.mode, "ask");
          assert.deepEqual(params.scope, {
            localRoots: [],
            sessionIds: ["ssh"],
            remoteRoots: [{ sessionId: "ssh", path: remoteDirectory }],
          });
          return { path: remoteDirectory, entries: [] };
        }
        if (method === "tasks.start") {
          assert.equal(params.sessionId, "ssh");
          assert.equal(params.executable, process.execPath);
          assert.ok(!JSON.stringify(params).includes(secret));
          status = "running";
          exitCode = undefined;
          child = spawn(params.executable, params.args.includes("--eval") ? params.args : params.args.map(localPath), {
            cwd: localPath(params.cwd),
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"],
          });
          exited = once(child, "exit");
          for (const stream of ["stdout", "stderr"]) {
            child[stream].setEncoding("utf8");
            child[stream].on("data", (chunk) =>
              queue.push({ seq: ++seq, stream, data: chunk }),
            );
          }
          child.on("exit", (code) => {
            exitCode = code;
            status = code === 0 ? "completed" : "exited";
          });
          return { taskId: "remote-task" };
        }
        if (method === "tasks.write") {
          child.stdin.write(params.data);
          return true;
        }
        if (method === "tasks.readOutput")
          return { events: queue.splice(0), truncated: false };
        if (method === "tasks.status") return { status, exitCode };
        if (method === "tasks.cancel") {
          child.kill();
          await exited;
          return true;
        }
        throw new Error(`Unexpected ${method}`);
      },
    };
    const engine = new AiPlugin(host, {
      completion: async () => {
        throw new Error("API completion ran locally");
      },
    });
    try {
      await engine.command("ai.configure", {
        config: {
          profiles: [
            {
              id: "api",
              name: "API",
              protocol: "openai-chat",
              model: "test-model",
              baseUrl: `http://127.0.0.1:${server.address().port}`,
            },
          ],
          activeProfileId: "api",
          mode: "ask",
          scope: { localRoots: [], sessionIds: [], remoteRoots: [] },
        },
      });
      await engine.command("ai.target", {
        targetId: "ssh",
        runtime: process.execPath,
      });
      await engine.command("ai.prepare", {});
      await engine.preparationPromise;
      assert.equal(engine.block().readiness.status, "ready", engine.block().readiness.detail);
      assert.equal(requests, 0, "Initialization must not contact a paid provider");
      assert.equal(engine.block().messages.length, 0);
      assert.equal(calls.filter((item) => item.method === "secrets.get").length, 0);
      const result = await engine.send({
        message: "List the selected workspace",
      });
      await engine.runs.get(result.block.activeSessionId).done;
      assert.equal(
        engine.block().run.status,
        "done",
        JSON.stringify(engine.block().messages),
      );
      assert.equal(requests, 2);
      assert.ok(
        engine
          .block()
          .messages.some(
            (item) =>
              item.role === "assistant" && item.content === "Remote answer",
          ),
      );
      assert.equal(
        engine.block().messages.filter((item) => item.role === "user").length,
        1,
      );
      assert.ok(calls.some((item) => item.method === "tools.invoke"));
      for (const file of files)
        assert.ok(!(await readFile(file, "utf8")).includes(secret));
      await exited;
      status = "running";
      const second = await engine.send({ message: "Wait for cancellation" });
      const deadline = Date.now() + 5000;
      while (requests < 3 && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(requests, 3);
      await engine.command("ai.stop", {
        sessionId: second.block.activeSessionId,
        runId: second.runId,
      });
      await exited;
      assert.equal(engine.block().run.status, "cancelled");
      assert.equal(status, "exited");
    } finally {
      await engine.shutdown();
      if (child) {
        child.kill();
        await exited;
      }
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("denied remote deployment writes nothing and never starts a runtime", async () => {
  const calls = [];
  const host = {
    async call(method) {
      calls.push(method);
      return false;
    },
  };
  await assert.rejects(
    deployFiles(
      host,
      {
        kind: "remote",
        sessionId: "ssh",
        hostId: "host",
        title: "Host",
        home: "/home/test",
        platform: "posix",
      },
      new Map([["permission.mjs", "code"]]),
      { label: "test" },
    ),
    /cancelled/,
  );
  assert.deepEqual(calls, ["ui.confirm"]);
});

test("failed deployment only removes entries it created, without overwriting existing files", async () => {
  const calls = [];
  const host = {
    async call(method, params) {
      calls.push({ method, params });
      if (method === "ui.confirm") return true;
      if (method === "files.sftp.createFile") throw new Error("target exists");
      return null;
    },
  };
  await assert.rejects(
    deployFiles(
      host,
      {
        sessionId: "ssh",
        title: "Host",
        home: "/home/test",
        platform: "posix",
      },
      new Map([["permission.mjs", "code"]]),
      { label: "test" },
    ),
    /target exists/,
  );
  assert.ok(!calls.some(({ method }) => method === "files.sftp.writeText"));
  const removed = calls.filter(({ method }) => method === "files.sftp.delete");
  assert.equal(removed.length, 1);
  assert.equal(removed[0].params.isDir, true);
  assert.match(removed[0].params.path, /^\/home\/test\/\.TunneldeAI\/Chats\/test-/);
});
