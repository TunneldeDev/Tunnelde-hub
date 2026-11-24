import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { createServer } from "node:http";
import {
  probeCli,
  checkedTask,
} from "../plugins/tunnelde-ai/lib/readiness.mjs";
import { runCli } from "../plugins/tunnelde-ai/lib/cli.mjs";

// Explicit opt-in: never discover or run a user's agent automatically.
test(
  "native Codex initializes, streams, resumes and reports provider errors",
  {
    skip: !process.env.TUNNELDE_TEST_CODEX,
    timeout: 120000,
  },
  async () => {
    const executable = path.resolve(process.env.TUNNELDE_TEST_CODEX);
    const qa = path.resolve(".tmp/qa");
    await mkdir(qa, { recursive: true });
    const root = (await mkdtemp(path.join(qa, "codex-native-"))).replaceAll(
      "\\",
      "/",
    );
    await mkdir(root + "/workspace", { recursive: true });
    await mkdir(root + "/home", { recursive: true });
    await mkdir(root + "/roaming", { recursive: true });
    await mkdir(root + "/local", { recursive: true });
    const tasks = new Map();
    const calls = [];
    let sequence = 0;
    const host = {
      async call(method, params = {}) {
        calls.push({
          method,
          ...(method === "tasks.start" ? { args: params.args } : {}),
        });
        if (method === "tasks.start") {
          assert.equal(params.executable, executable);
          const env = { ...process.env };
          for (const key of Object.keys(env))
            if (/API_KEY|TOKEN|CREDENTIAL|SSH_AUTH_SOCK|^CODEX_/i.test(key))
              delete env[key];
          Object.assign(env, {
            HOME: root + "/home",
            USERPROFILE: root + "/home",
            CODEX_HOME: root + "/home",
            APPDATA: root + "/roaming",
            LOCALAPPDATA: root + "/local",
            HTTP_PROXY: "http://127.0.0.1:9",
            HTTPS_PROXY: "http://127.0.0.1:9",
            ALL_PROXY: "http://127.0.0.1:9",
            NO_PROXY: "127.0.0.1,localhost",
            GIT_CONFIG_GLOBAL: root + "/home/gitconfig",
            GIT_CONFIG_NOSYSTEM: "1",
            OTEL_SDK_DISABLED: "true",
          });
          const child = spawn(executable, params.args, {
            cwd: root + "/workspace",
            env,
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"],
          });
          const task = { child, events: [], status: "running", exitCode: null };
          const taskId = "native-codex-" + tasks.size;
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
        assert.ok(task, "unknown task");
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
          if (task.status === "running") {
            const ended = new Promise((resolve) =>
              task.child.once("close", resolve),
            );
            task.child.kill();
            await ended;
          }
          return true;
        }
        throw new Error("Unexpected method " + method);
      },
    };
    const execution = {
      kind: "local",
      cwd: root + "/workspace",
      title: "isolated QA workspace",
    };
    let failure;
    try {
      const version = (
        await checkedTask(
          host,
          execution,
          executable,
          ["--version"],
          30000,
          AbortSignal.timeout(35000),
        )
      ).trim();
      assert.match(version, /codex-cli /);
      try {
        await probeCli(
          host,
          { name: "Codex QA", protocol: "codex", executable },
          execution,
          AbortSignal.timeout(30000),
        );
      } catch (error) {
        failure = error.message;
      }
      const records = [...tasks.values()].flatMap((task) =>
        task.events
          .filter((event) => event.stream === "stdout")
          .map((event) => event.data)
          .join("")
          .split("\n")
          .filter(Boolean)
          .flatMap((line) => {
            try {
              return [JSON.parse(line)];
            } catch {
              return [];
            }
          }),
      );
      assert.match(failure, /Codex is not signed in/);
      assert.ok(records.some((record) => record.result?.userAgent));
      assert.ok(
        records.some(
          (record) =>
            record.result?.account === null &&
            record.result.requiresOpenaiAuth === true,
        ),
      );
      assert.equal(
        calls.filter((call) => call.method === "tasks.start").length,
        2,
      );
      assert.ok([...tasks.values()].every((task) => task.status !== "running"));
      const result = {
        version,
        failure,
        initialized: true,
        signInRequired: true,
        noPromptSent: true,
        processesStopped: true,
        requests: calls.filter((call) => call.method === "tasks.start"),
        records,
      };
      await writeFile(root + "/result.json", JSON.stringify(result, null, 2));

      const requests = [],
        serverErrors = [];
      const server = createServer(async (request, response) => {
        try {
          let raw = "";
          for await (const chunk of request) raw += chunk;
          const body = JSON.parse(raw);
          requests.push(body);
          const content = body.input
            .filter((item) => item.role === "user")
            .at(-1)?.content;
          const message = Array.isArray(content)
            ? content
                .filter((item) => item.type === "input_text")
                .map((item) => item.text)
                .join("")
            : content;
          if (message === "reject-provider") {
            response.writeHead(401, { "Content-Type": "application/json" });
            response.end(
              JSON.stringify({
                error: {
                  message: "QA loopback rejected test credentials",
                  type: "authentication_error",
                },
              }),
            );
            return;
          }
          response.writeHead(200, { "Content-Type": "text/event-stream" });
          const event = (value) =>
            response.write(
              `event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`,
            );
          const id = `codex-qa-${requests.length}`;
          event({ type: "response.created", response: { id } });
          event({
            type: "response.output_item.added",
            item: {
              type: "message",
              role: "assistant",
              id: `msg-${id}`,
              content: [],
            },
          });
          event({
            type: "response.output_text.delta",
            delta: "Codex native stream ✓",
          });
          event({
            type: "response.output_item.done",
            item: {
              type: "message",
              role: "assistant",
              id: `msg-${id}`,
              content: [{ type: "output_text", text: "Codex native stream ✓" }],
            },
          });
          event({
            type: "response.completed",
            response: {
              id,
              usage: {
                input_tokens: 1,
                input_tokens_details: null,
                output_tokens: 1,
                output_tokens_details: null,
                total_tokens: 2,
              },
            },
          });
          response.end();
        } catch (error) {
          serverErrors.push(String(error));
          response.writeHead(500);
          response.end("Invalid QA request");
        }
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      try {
        await writeFile(
          root + "/home/config.toml",
          `model = "qa-model"\nmodel_provider = "qa"\n[model_providers.qa]\nname = "QA loopback only"\nbase_url = "http://127.0.0.1:${server.address().port}/v1"\nwire_api = "responses"\nrequires_openai_auth = false\nrequest_max_retries = 0\nstream_max_retries = 0\n`,
        );
        let restrictedFailure;
        try {
          await probeCli(
            host,
            { name: "Codex QA", protocol: "codex", executable },
            execution,
            AbortSignal.timeout(30000),
          );
        } catch (error) {
          restrictedFailure = error.message;
        }
        if (restrictedFailure) {
          assert.match(restrictedFailure, /Access was not widened/);
          assert.doesNotMatch(
            restrictedFailure,
            /unknown variant|no longer supported|Unknown permission/,
          );
        }
        await probeCli(
          host,
          { name: "Codex QA", protocol: "codex", executable },
          execution,
          AbortSignal.timeout(30000),
          "full",
        );
        assert.equal(
          requests.length,
          0,
          "initialization must not contact a model provider",
        );
        let fullError;
        try {
          await runCli({
            host,
            profile: {
              name: "Codex QA",
              protocol: "codex",
              executable,
              cwd: execution.cwd,
            },
            config: {
              mode: "full",
              scope: {
                localRoots: [execution.cwd],
                remoteRoots: [],
                sessionIds: [],
              },
            },
            session: {},
            message: "reject-provider",
            signal: AbortSignal.timeout(45000),
            onDelta() {},
            approve: async () => false,
          });
        } catch (error) {
          fullError = error.message;
        }
        assert.ok(requests.length > 0);
        assert.match(fullError, /401|QA loopback rejected/);
        const profile = {
          name: "Codex QA",
          protocol: "codex",
          executable,
          cwd: execution.cwd,
          model: "qa-model",
        };
        const config = {
          mode: "full",
          scope: {
            localRoots: [execution.cwd],
            remoteRoots: [],
            sessionIds: [],
          },
        };
        const session = {},
          deltas = [];
        const first = await runCli({
          host,
          profile,
          config,
          session,
          message: "stream",
          signal: AbortSignal.timeout(45000),
          onDelta: (delta) => deltas.push(delta),
          approve: async () => {
            throw new Error("No tool expected");
          },
        });
        assert.equal(first.text, "Codex native stream ✓");
        assert.equal(deltas.join(""), first.text);
        const threadId = session.cli.threadId;
        assert.ok(threadId);
        const beforeResume = requests.length;
        const second = await runCli({
          host,
          profile,
          config,
          session,
          message: "continue",
          signal: AbortSignal.timeout(45000),
          onDelta() {},
          approve: async () => {
            throw new Error("No tool expected");
          },
        });
        assert.equal(second.text, first.text);
        assert.equal(session.cli.threadId, threadId);
        assert.equal(
          requests.length,
          beforeResume + 1,
          "resume must submit exactly one new request",
        );
        assert.ok(
          requests
            .at(-1)
            .input.some(
              (item) =>
                item.role === "assistant" &&
                JSON.stringify(item.content).includes(first.text),
            ),
        );
        const userMessages = requests
          .at(-1)
          .input.filter((item) => item.role === "user")
          .map((item) => JSON.stringify(item.content));
        assert.equal(
          userMessages.filter((item) => item.includes("stream")).length,
          1,
        );
        assert.equal(
          userMessages.filter((item) => item.includes("continue")).length,
          1,
        );
        assert.deepEqual(serverErrors, []);
        const full = {
          fullError,
          loopbackRequests: requests.length,
          restrictedFailure: restrictedFailure ?? null,
          unicodeStream: first.text,
          threadResumed: true,
          noPromptReplay: true,
          serverErrors,
        };
        await writeFile(
          root + "/full-turn-result.json",
          JSON.stringify(full, null, 2),
        );
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    } finally {
      for (const [taskId] of tasks) await host.call("tasks.cancel", { taskId });
    }
  },
);
