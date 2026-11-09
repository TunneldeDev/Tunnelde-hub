import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  checkedTask,
  probeCli,
} from "../plugins/tunnelde-ai/lib/readiness.mjs";
import { runCli } from "../plugins/tunnelde-ai/lib/cli.mjs";

// Explicitly selected native binary; never discover agents or user credentials.
test(
  "native Pi initializes, streams and enforces its tool approval extension",
  {
    skip: !process.env.TUNNELDE_TEST_PI,
    timeout: 120000,
  },
  async () => {
    const executable = path.resolve(process.env.TUNNELDE_TEST_PI);
    const qa = path.resolve(".tmp/qa");
    await mkdir(qa, { recursive: true });
    const root = await mkdtemp(path.join(qa, "pi-native-"));
    const cwd = path.join(root, "workspace");
    const agent = path.join(root, "agent");
    await mkdir(cwd);
    await mkdir(agent);
    const tasks = new Map();
    const requests = [];
    const approvals = [];
    let sequence = 0;
    const server = createServer(async (request, response) => {
      try {
        let text = "";
        for await (const chunk of request) text += chunk;
        const body = JSON.parse(text);
        requests.push(body);
        const content = body.messages
          .filter((item) => item.role === "user")
          .at(-1)?.content;
        const user = Array.isArray(content)
          ? content.map((item) => item.text ?? "").join("")
          : content;
        const tool = body.messages.at(-1)?.role === "tool";
        if (user === "reject-provider") {
          response.writeHead(401, { "Content-Type": "application/json" });
          response.end(
            JSON.stringify({
              error: { message: "Pi QA loopback rejected credentials" },
            }),
          );
          return;
        }
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        const chunk = (delta, finish_reason = null) =>
          response.write(
            `data: ${JSON.stringify({
              id: "pi-qa",
              object: "chat.completion.chunk",
              created: 1,
              model: "qa-model",
              choices: [{ index: 0, delta, finish_reason }],
            })}\n\n`,
          );
        if (!tool && ["allow-write", "deny-write"].includes(user)) {
          chunk({
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: "qa-write",
                type: "function",
                function: {
                  name: "write",
                  arguments: JSON.stringify({
                    path: `${user}.txt`,
                    content: "Pi native approval ✓",
                  }),
                },
              },
            ],
          });
          chunk({}, "tool_calls");
        } else {
          chunk({
            role: "assistant",
            content: tool ? "tool finished ✓" : "Pi native stream ✓",
          });
          chunk({}, "stop");
        }
        response.end("data: [DONE]\n\n");
      } catch (error) {
        response.writeHead(500);
        response.end(String(error));
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    await writeFile(
      path.join(agent, "models.json"),
      JSON.stringify({
        providers: {
          qa: {
            baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
            api: "openai-completions",
            apiKey: "qa-loopback-only",
            models: [
              {
                id: "qa-model",
                name: "Isolated test model",
                reasoning: false,
                input: ["text"],
                contextWindow: 32000,
                maxTokens: 1024,
              },
            ],
          },
        },
      }),
    );
    await writeFile(
      path.join(agent, "settings.json"),
      JSON.stringify({
        defaultProvider: "qa",
        defaultModel: "qa-model",
        retry: { enabled: false },
      }),
    );
    const host = {
      async call(method, params = {}) {
        if (method === "tasks.start") {
          assert.equal(params.executable, executable);
          assert.equal(params.cwd, cwd);
          const env = { ...process.env };
          for (const key of Object.keys(env))
            if (/API_KEY|TOKEN|CREDENTIAL|SSH_AUTH_SOCK|^PI_/i.test(key))
              delete env[key];
          Object.assign(env, {
            PI_CODING_AGENT_DIR: agent,
            PI_CODING_AGENT_SESSION_DIR: path.join(root, "sessions"),
            PI_OFFLINE: "1",
            PI_TELEMETRY: "0",
            HTTP_PROXY: "http://127.0.0.1:9",
            HTTPS_PROXY: "http://127.0.0.1:9",
            ALL_PROXY: "http://127.0.0.1:9",
            NO_PROXY: "127.0.0.1,localhost",
          });
          const child = spawn(executable, params.args, {
            cwd,
            env,
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"],
          });
          const task = { child, events: [], status: "running", exitCode: null };
          const taskId = `native-pi-${tasks.size}`;
          tasks.set(taskId, task);
          for (const stream of ["stdout", "stderr"])
            child[stream]
              .setEncoding("utf8")
              .on("data", (data) =>
                task.events.push({ seq: ++sequence, stream, data }),
              );
          child.on("error", (error) => {
            task.status = "failed";
            task.error = error.message;
          });
          child.on("close", (code) => {
            task.status = "completed";
            task.exitCode = code;
          });
          return { taskId };
        }
        const task = tasks.get(params.taskId);
        assert.ok(task, `Unexpected host call ${method}`);
        if (method === "tasks.readOutput")
          return {
            events: task.events.filter((event) => event.seq > params.afterSeq),
            truncated: false,
            status: task.status,
            exitCode: task.exitCode,
            error: task.error,
          };
        if (method === "tasks.status")
          return {
            status: task.status,
            exitCode: task.exitCode,
            error: task.error,
          };
        if (method === "tasks.write")
          return new Promise((resolve, reject) =>
            task.child.stdin.write(params.data, (error) =>
              error ? reject(error) : resolve(true),
            ),
          );
        if (method === "tasks.cancel") {
          if (task.child.exitCode === null && task.child.signalCode === null) {
            const ended = new Promise((resolve) =>
              task.child.once("close", resolve),
            );
            task.child.kill();
            await ended;
          }
          return true;
        }
        throw new Error(`Unexpected host call ${method}`);
      },
    };
    const execution = { kind: "local", title: "isolated Pi QA", cwd };
    const profile = {
      name: "Pi QA",
      protocol: "pi",
      executable,
      cwd,
      model: "qa-model",
      provider: "qa",
    };
    const config = {
      mode: "ask",
      scope: { localRoots: [cwd], remoteRoots: [], sessionIds: [] },
    };
    const report = {
      checks: [],
      scope:
        "Explicit native Pi, isolated configuration and loopback model only; no real provider authentication or desktop/SSH claim",
    };
    try {
      report.version = (
        await checkedTask(host, execution, executable, ["--version"])
      ).trim();
      await probeCli(host, profile, execution, AbortSignal.timeout(30000));
      assert.equal(
        requests.length,
        0,
        "preflight must not send a model prompt",
      );
      report.checks.push("native RPC readiness without a model request");
      let firstSession;
      for (const message of ["stream", "allow-write", "deny-write"]) {
        const activity = [];
        let streamed = "";
        const session = {};
        const result = await runCli({
          host,
          profile,
          config,
          session,
          message,
          signal: AbortSignal.timeout(25000),
          onDelta: (delta) => {
            streamed += delta;
          },
          onActivity: (item) => activity.push(item),
          approve: async (request) => {
            approvals.push(request);
            return message === "allow-write";
          },
        });
        assert.equal(result.text, streamed);
        assert.ok(
          result.session.sessionPath,
          "completed Pi turns must retain their native session file for continuation",
        );
        if (message === "stream") firstSession = session;
        assert.match(
          result.text,
          message === "stream" ? /Pi native stream ✓/ : /tool finished ✓/,
        );
        if (message === "allow-write")
          assert.equal(
            await readFile(path.join(cwd, "allow-write.txt"), "utf8"),
            "Pi native approval ✓",
          );
        if (message === "deny-write")
          await assert.rejects(access(path.join(cwd, "deny-write.txt")), {
            code: "ENOENT",
          });
        report.checks.push(
          `${message}: streamed completion and expected filesystem outcome`,
        );
      }
      assert.equal(
        approvals.length,
        2,
        "each actual write must reach Tunnelde approval",
      );
      const beforeResume = requests.length;
      const resumed = await runCli({
        host,
        profile,
        config,
        session: firstSession,
        message: "continue",
        signal: AbortSignal.timeout(25000),
        onDelta() {},
        approve: async () => false,
      });
      assert.match(resumed.text, /Pi native stream ✓/);
      const resumedMessages = requests[beforeResume].messages;
      assert.ok(
        resumedMessages.some(
          (item) =>
            item.role === "assistant" &&
            JSON.stringify(item.content).includes("Pi native stream"),
        ),
      );
      assert.equal(resumed.session.sessionPath, firstSession.cli.sessionPath);
      report.checks.push(
        "next process resumes native conversation history without replaying its previous prompt",
      );
      await assert.rejects(
        runCli({
          host,
          profile,
          config,
          session: {},
          message: "reject-provider",
          signal: AbortSignal.timeout(25000),
          onDelta() {},
          approve: async () => false,
        }),
        /401|Pi QA loopback rejected/,
      );
      report.checks.push(
        "provider rejection fails rather than reporting an empty successful turn",
      );
      report.pass = true;
    } catch (error) {
      report.error = String(error.stack ?? error);
      throw error;
    } finally {
      for (const [taskId] of tasks) await host.call("tasks.cancel", { taskId });
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      report.processesStopped = [...tasks.values()].every(
        (task) => task.status !== "running",
      );
      await writeFile(
        path.join(root, "result.json"),
        JSON.stringify(report, null, 2),
      );
    }
  },
);
