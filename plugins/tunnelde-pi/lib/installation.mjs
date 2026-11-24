import path from "node:path";
import { checkedTask, probeNode } from "./readiness.mjs";
import { CLI_PROTOCOLS } from "./config.mjs";

export const AGENT_PACKAGES = Object.freeze({
  codex: "@openai/codex",
  "claude-code": "@anthropic-ai/claude-code",
  pi: "@mariozechner/pi-coding-agent",
});
const COMMANDS = { codex: "codex", "claude-code": "claude", pi: "pi" };
export const shellQuote = (value) => `'${String(value).replaceAll("'", `'"'"'`)}'`;

async function officialText(fetchImpl, url, limit, signal) {
  const response = await fetchImpl(url, { redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Runtime download metadata failed: HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > limit) throw new Error("Runtime download metadata exceeded its limit");
  return text;
}

/** Keep private runtimes in the assistant's application directory. */
export function nodeInstallScript(home, archive, digest) {
  if (!/^https:\/\/nodejs\.org\/dist\/v\d+\.\d+\.\d+\/node-v\d+\.\d+\.\d+-(linux|darwin)-(x64|arm64)\.tar\.gz$/.test(archive) || !/^[a-f0-9]{64}$/.test(digest))
    throw new Error("Invalid official runtime archive");
  return `set -eu
umask 077
command -v curl >/dev/null || { echo 'Install curl to download the runtime' >&2; exit 1; }
command -v tar >/dev/null || { echo 'Install tar to unpack the runtime' >&2; exit 1; }
app_dir=${shellQuote(`${home}/.TunneldeAI`)}
runtime_root="$app_dir/Runtimes"
[ ! -L "$app_dir" ] && [ ! -L "$runtime_root" ] || { echo 'Assistant runtime directory must not be a symlink' >&2; exit 1; }
mkdir -p -- "$runtime_root"
runtime_dir=$(mktemp -d "$runtime_root/node-XXXXXX")
complete=no
cleanup() {
  if [ "$complete" != yes ]; then
    case "$runtime_dir" in "$runtime_root"/node-*) rm -rf -- "$runtime_dir" ;; esac
  fi
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM
curl --proto '=https' --tlsv1.2 --fail --location --silent --show-error ${shellQuote(archive)} -o "$runtime_dir/archive.tar.gz"
if command -v sha256sum >/dev/null; then actual=$(sha256sum "$runtime_dir/archive.tar.gz"); else actual=$(shasum -a 256 "$runtime_dir/archive.tar.gz"); fi
[ "\${actual%% *}" = ${shellQuote(digest)} ] || { echo 'Runtime checksum verification failed' >&2; exit 1; }
tar -xzf "$runtime_dir/archive.tar.gz" -C "$runtime_dir" --strip-components=1
rm -f -- "$runtime_dir/archive.tar.gz"
"$runtime_dir/bin/node" --version
complete=yes
printf '\\n__TUNNELDE_RUNTIME__%s/bin/node\\n' "$runtime_dir"
`;
}

export async function installAgent(host, profile, execution, fetchImpl = fetch, signal) {
  if (execution.kind !== "remote" || execution.platform !== "posix")
    throw new Error("Automatic installation currently supports POSIX SSH hosts. Install the local agent using its official installer, select its executable in Execution settings, then Initialize.");
  const cli = CLI_PROTOCOLS.has(profile.protocol);
  const allowed = await host.call("ui.confirm", {
    message: `Install ${profile.name} on ${execution.title}?\n\nDownload an official Node.js LTS runtime from nodejs.org and${cli ? ` install ${AGENT_PACKAGES[profile.protocol]} from the npm registry into` : " unpack it in"} a new private directory under ${execution.home}/.TunneldeAI/Runtimes. The Node archive SHA-256 will be verified. Existing system Node, services and files will not be changed. Agent login remains your own account on this machine.`,
  }, { signal, timeoutMs: 120000 });
  if (allowed !== true) throw new Error("Installation was cancelled");
  const platform = (await checkedTask(host, execution, "/bin/sh", ["-c", "uname -s; uname -m"], 30000, signal)).trim().split(/\r?\n/);
  const os = { Linux: "linux", Darwin: "darwin" }[platform[0]];
  const arch = { x86_64: "x64", amd64: "x64", aarch64: "arm64", arm64: "arm64" }[platform[1]];
  if (!os || !arch) throw new Error("Automatic installation supports Linux/macOS x64 and arm64 SSH hosts");
  const versions = JSON.parse(await officialText(fetchImpl, "https://nodejs.org/dist/index.json", 4 * 1024 * 1024, signal));
  const platformFile = os === "darwin" ? `osx-${arch}-tar` : `${os}-${arch}`;
  const version = versions.find((item) => item.lts && /^v\d+\.\d+\.\d+$/.test(item.version) && Number(item.version.slice(1).split(".")[0]) >= 22 && item.files?.includes(platformFile))?.version;
  if (!version) throw new Error("No supported official Node.js LTS runtime was found");
  const file = `node-${version}-${os}-${arch}.tar.gz`;
  const base = `https://nodejs.org/dist/${version}`;
  const checksums = await officialText(fetchImpl, `${base}/SHASUMS256.txt`, 1024 * 1024, signal);
  const digest = checksums.split(/\r?\n/).map((line) => line.trim().split(/\s+/)).find(([, name]) => name === file)?.[0];
  const output = await checkedTask(host, execution, "/bin/sh", ["-c", nodeInstallScript(execution.home, `${base}/${file}`, digest)], 300000, signal);
  const runtime = output.split(/\r?\n/).findLast((line) => line.startsWith("__TUNNELDE_RUNTIME__"))?.slice("__TUNNELDE_RUNTIME__".length);
  const runtimeDirectory = runtime ? path.posix.dirname(path.posix.dirname(runtime)) : "";
  if (!runtime || path.posix.dirname(runtimeDirectory) !== path.posix.join(execution.home, ".TunneldeAI", "Runtimes") ||
      !/^node-[A-Za-z0-9]{6}$/.test(path.posix.basename(runtimeDirectory)) ||
      runtime !== path.posix.join(runtimeDirectory, "bin", "node") || /[\0\r\n]/.test(runtime))
    throw new Error("Installer did not return its private runtime path");
  execution.runtime = runtime;
  await probeNode(host, execution, signal);
  if (cli) {
    const directory = path.posix.dirname(path.posix.dirname(runtime));
    const agent = COMMANDS[profile.protocol];
    const prefix = `${directory}/agent`;
    const wrapper = `${directory}/run-agent`;
    const script = `set -eu
umask 077
export PATH=${shellQuote(`${directory}/bin`)}:"$PATH"
export npm_config_cache=${shellQuote(`${directory}/npm-cache`)}
export npm_config_userconfig=${shellQuote(`${directory}/npmrc`)}
export npm_config_globalconfig=${shellQuote(`${directory}/global-npmrc`)}
touch "$npm_config_userconfig" "$npm_config_globalconfig"
${shellQuote(runtime)} ${shellQuote(`${directory}/lib/node_modules/npm/bin/npm-cli.js`)} install --global --prefix ${shellQuote(prefix)} --cache "$npm_config_cache" --registry=https://registry.npmjs.org --no-audit --no-fund ${shellQuote(AGENT_PACKAGES[profile.protocol])}
printf '%s\\n' '#!/bin/sh' ${shellQuote(`export PATH=${shellQuote(`${directory}/bin`)}:"$PATH"`)} ${shellQuote(`exec ${shellQuote(`${prefix}/bin/${agent}`)} "$@"`)} > ${shellQuote(wrapper)}
chmod 700 ${shellQuote(wrapper)}
`;
    await checkedTask(host, execution, "/bin/sh", ["-c", script], 300000, signal);
    execution.executable = wrapper;
  }
  return execution;
}
