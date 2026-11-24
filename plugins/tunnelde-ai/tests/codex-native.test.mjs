import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, unlink, writeFile } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import { createServer } from 'node:http';
import { probeCli, checkedTask } from '../lib/readiness.mjs';
import { runCli } from '../lib/cli.mjs';

// Explicit opt-in: never discover or run a user's agent automatically.
test('native Codex initializes, validates sandbox and reports provider errors', {
  skip: !process.env.TUNNELDE_TEST_CODEX,
  timeout: 120000,
}, async () => {
const executable = path.resolve(process.env.TUNNELDE_TEST_CODEX);
const qa = path.resolve('.tmp/qa');
await mkdir(qa, { recursive: true });
const root = (await mkdtemp(path.join(qa, 'codex-native-'))).replaceAll('\\', '/');
await mkdir(root + '/workspace', { recursive: true });
await mkdir(root + '/home', { recursive: true });
const tasks = new Map();
const calls = [];
let sequence = 0;
const host = { async call(method, params = {}) {
  calls.push({ method, ...(method === 'tasks.start' ? { args: params.args } : {}) });
  if (method === 'tasks.start') {
    assert.equal(params.executable, executable);
    const env = { ...process.env, CODEX_HOME: root + '/home', HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', ALL_PROXY: 'http://127.0.0.1:9' };
    for (const key of Object.keys(env)) if (/API_KEY|AUTH_TOKEN|ACCESS_TOKEN|BEARER_TOKEN|CREDENTIAL|SSH_AUTH_SOCK/i.test(key)) delete env[key];
    const child = spawn(executable, params.args, { cwd: root + '/workspace', env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const task = { child, events: [], status: 'running', exitCode: null };
    const taskId = 'native-codex-' + tasks.size;
    tasks.set(taskId, task);
    for (const stream of ['stdout', 'stderr']) child[stream].on('data', data => task.events.push({ seq: ++sequence, stream, data: data.toString() }));
    child.on('error', error => { task.status = 'failed'; task.error = error.message; });
    child.on('close', code => { task.status = 'completed'; task.exitCode = code; });
    return { taskId };
  }
  const task = tasks.get(params.taskId);
  assert.ok(task, 'unknown task');
  if (method === 'tasks.readOutput') return { events: task.events.filter(event => event.seq > params.afterSeq), truncated: false, status: task.status, exitCode: task.exitCode, error: task.error };
  if (method === 'tasks.status') return { status: task.status, exitCode: task.exitCode, error: task.error };
  if (method === 'tasks.write') return new Promise((resolve, reject) => task.child.stdin.write(params.data, error => error ? reject(error) : resolve(true)));
  if (method === 'tasks.cancel') {
    if (task.status === 'running') {
      task.child.kill();
      await new Promise(resolve => task.child.once('close', resolve));
    }
    return true;
  }
  throw new Error('Unexpected method ' + method);
} };
const execution = { kind: 'local', cwd: root + '/workspace', title: 'isolated QA workspace' };
let failure;
try {
  const version = (await checkedTask(host, execution, executable, ['--version'], 30000, AbortSignal.timeout(35000))).trim();
  assert.match(version, /codex-cli /);
  try {
    await probeCli(host, { name: 'Codex QA', protocol: 'codex', executable }, execution, AbortSignal.timeout(30000));
  } catch (error) { failure = error.message; }
  const records = [...tasks.values()].flatMap(task => task.events.filter(event => event.stream === 'stdout').map(event => event.data).join('').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }));
  assert.match(failure, /Codex is not signed in/);
  assert.ok(records.some(record => record.result?.userAgent));
  assert.ok(records.some(record => record.result?.account === null && record.result.requiresOpenaiAuth === true));
  assert.equal(calls.filter(call => call.method === 'tasks.start').length, 2);
  assert.ok([...tasks.values()].every(task => task.status !== 'running'));
  const result = { version, failure, initialized: true, signInRequired: true, noPromptSent: true, processesStopped: true, requests: calls.filter(call => call.method === 'tasks.start'), records };
  await writeFile(root + '/result.json', JSON.stringify(result, null, 2));
  
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    request.resume();
    response.writeHead(401, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'QA loopback rejected test credentials', type: 'authentication_error' } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await writeFile(root + '/home/config.toml', `model = "qa-model"\nmodel_provider = "qa"\n[model_providers.qa]\nname = "QA loopback only"\nbase_url = "http://127.0.0.1:${server.address().port}/v1"\nwire_api = "responses"\nrequires_openai_auth = false\nrequest_max_retries = 0\nstream_max_retries = 0\n`);
    let restrictedFailure;
    try { await probeCli(host, { name: 'Codex QA', protocol: 'codex', executable }, execution, AbortSignal.timeout(30000)); } catch (error) { restrictedFailure = error.message; }
    if (restrictedFailure) {
      assert.match(restrictedFailure, /Access was not widened/);
      assert.doesNotMatch(restrictedFailure, /unknown variant|no longer supported|Unknown permission/);
    }
    await probeCli(host, { name: 'Codex QA', protocol: 'codex', executable }, execution, AbortSignal.timeout(30000), 'full');
    assert.equal(requests, 0, 'initialization must not contact a model provider');
    let fullError;
    try {
      await runCli({ host, profile: { name: 'Codex QA', protocol: 'codex', executable, cwd: execution.cwd }, config: { mode: 'full', scope: { localRoots: [execution.cwd], remoteRoots: [], sessionIds: [] } }, session: {}, message: 'QA loopback authentication error test only', signal: AbortSignal.timeout(45000), onDelta() {}, approve: async () => false });
    } catch (error) { fullError = error.message; }
    const full = { fullError, loopbackRequests: requests, restrictedFailure: restrictedFailure ?? null };
    await writeFile(root + '/full-turn-result.json', JSON.stringify(full, null, 2));
    
    assert.ok(requests > 0);
    assert.match(fullError, /401|QA loopback rejected/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
} finally {
  for (const [taskId] of tasks) await host.call('tasks.cancel', { taskId });
}

});
