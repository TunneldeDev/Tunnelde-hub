import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import test from "node:test";
import { prepareAgent } from "../lib/readiness.mjs";
import { runCli } from "../lib/cli.mjs";

// Explicit opt-in only: no discovery of user agents or reuse of login credentials.
test("native Claude distinguishes signed-out state, initializes and reports provider retries", {
  skip: !process.env.TUNNELDE_TEST_CLAUDE,
  timeout: 120000,
}, async () => {
  const executable = path.resolve(process.env.TUNNELDE_TEST_CLAUDE);
  await mkdir(".tmp/qa", { recursive: true });
  const root = (await mkdtemp(path.resolve(".tmp/qa/claude-native-"))).replaceAll("\\", "/");
  for (const directory of ["workspace", "home", "config", "roaming", "local"])
    await mkdir(`${root}/${directory}`);
  const tasks = new Map();
  let sequence = 0, requests = 0, withKey = false;
  const server = createServer((request, response) => {
    requests++;
    request.resume();
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ type: "error", error: {
      type: "authentication_error", message: "QA loopback rejected synthetic credentials",
    } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const host = { async call(method, params = {}) {
    if (method === "tasks.start") {
      assert.equal(params.executable, executable);
      const env = { ...process.env };
      for (const name of Object.keys(env))
        if (/API_KEY|TOKEN|CREDENTIAL|SSH_AUTH_SOCK|^CLAUDE_|^ANTHROPIC_/i.test(name)) delete env[name];
      Object.assign(env, {
        HOME: `${root}/home`, USERPROFILE: `${root}/home`, APPDATA: `${root}/roaming`,
        LOCALAPPDATA: `${root}/local`, CLAUDE_CONFIG_DIR: `${root}/config`,
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", CLAUDE_CODE_MAX_RETRIES: "1",
        DISABLE_AUTOUPDATER: "1", DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1",
        ANTHROPIC_BASE_URL: `http://127.0.0.1:${server.address().port}`,
        HTTP_PROXY: "http://127.0.0.1:9", HTTPS_PROXY: "http://127.0.0.1:9",
        ALL_PROXY: "http://127.0.0.1:9", NO_PROXY: "127.0.0.1,localhost",
        GIT_CONFIG_GLOBAL: `${root}/home/gitconfig`, GIT_CONFIG_NOSYSTEM: "1",
      });
      if (process.env.TUNNELDE_TEST_GIT_BASH)
        env.CLAUDE_CODE_GIT_BASH_PATH = process.env.TUNNELDE_TEST_GIT_BASH;
      if (withKey) env.ANTHROPIC_API_KEY = "sk-ant-qa-synthetic-never-valid";
      const child = spawn(executable, params.args, {
        cwd: `${root}/workspace`, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      });
      const task = { child, events: [], status: "running", exitCode: null };
      const taskId = `native-claude-${tasks.size}`;
      tasks.set(taskId, task);
      for (const stream of ["stdout", "stderr"])
        child[stream].on("data", bytes => task.events.push({ seq: ++sequence, stream, data: bytes.toString() }));
      child.on("error", error => { task.status = "failed"; task.error = error.message; });
      child.on("close", code => { task.status = "completed"; task.exitCode = code; });
      return { taskId };
    }
    const task = tasks.get(params.taskId);
    assert.ok(task, "unknown task");
    if (method === "tasks.readOutput") return {
      events: task.events.filter(event => event.seq > params.afterSeq), truncated: false,
      status: task.status, exitCode: task.exitCode, error: task.error,
    };
    if (method === "tasks.status") return { status: task.status, exitCode: task.exitCode, error: task.error };
    if (method === "tasks.write")
      return new Promise((resolve, reject) => task.child.stdin.write(params.data, error => error ? reject(error) : resolve(true)));
    if (method === "tasks.cancel") {
      if (task.status === "running") {
        task.child.kill();
        await new Promise(resolve => task.child.once("close", resolve));
      }
      return true;
    }
    throw new Error(`Unexpected host call ${method}`);
  } };
  const execution = { kind: "local", title: "isolated native test", cwd: `${root}/workspace` };
  const profile = { protocol: "claude-code", name: "Claude Code QA", executable, cwd: execution.cwd };
  const activities = [];
  try {
    await assert.rejects(prepareAgent(host, profile, execution, {}, AbortSignal.timeout(35000), { approved: true }),
      /Claude Code is not signed in/);
    assert.equal(requests, 0);
    withKey = true;
    await prepareAgent(host, profile, execution, {}, AbortSignal.timeout(35000), { approved: true });
    await prepareAgent(host, profile, execution, {}, AbortSignal.timeout(35000), { approved: true, mode: "full" });
    const beforeReadOnly = tasks.size;
    await assert.rejects(prepareAgent(host, profile, execution, {}, AbortSignal.timeout(35000), { approved: true, mode: "readOnly" }), /ReadOnly CLI execution requires/);
    assert.equal(tasks.size, beforeReadOnly, "unsupported read-only mode must not start an agent");
    assert.equal(requests, 0, "initialization must not submit a model prompt");
    await assert.rejects(runCli({ host, profile,
      config: { mode: "ask", scope: { localRoots: [execution.cwd], remoteRoots: [], sessionIds: [] } },
      session: {}, message: "QA loopback authentication failure only", signal: AbortSignal.timeout(45000),
      onDelta() {}, onActivity: item => activities.push(item), approve: async () => false,
    }), /401|QA loopback rejected/);
    assert.ok(requests > 0);
    assert.ok(activities.some(item => item.id === "claude:provider-retry" && item.status === "running"));
    assert.equal(activities.at(-1)?.status, "error");
  } finally {
    for (const [taskId] of tasks) await host.call("tasks.cancel", { taskId });
    await new Promise(resolve => server.close(resolve));
    await writeFile(`${root}/result.json`, JSON.stringify({
      requests, activities, processesStopped: [...tasks.values()].every(task => task.status !== "running"),
    }, null, 2));
  }
});
