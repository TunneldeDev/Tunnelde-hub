import path from "node:path";
import { boundedString, CLI_PROTOCOLS } from "./config.mjs";

export async function connectedTargets(host) {
  const sessions = await host.call("sessions.list", {});
  if (!Array.isArray(sessions))
    throw new Error("Unable to read connected SSH hosts");
  return sessions.slice(0, 64).map(({ id, hostId, title, address }) => ({
    id: boundedString(id, "SSH session", 128),
    hostId: boundedString(hostId, "host ID", 128),
    title: String(title || address || id).slice(0, 256),
    address: String(address || "").slice(0, 256),
  }));
}

export function resolvePath(value, execution, base = execution.cwd) {
  const paths = execution.platform === "windows" ? path.win32 : path.posix;
  const input = boundedString(value || ".", "workspace path");
  if (input === "~") return execution.home;
  if (input.startsWith("~/") || input.startsWith("~\\"))
    return paths.resolve(execution.home, input.slice(2));
  return paths.resolve(base, input);
}

/** Target selection is explicit; session IDs and home directories come from the host. */
export async function resolveExecution(host, selected, config, profile) {
  const selection =
    selected ??
    (profile.sessionId
      ? { kind: "remote", sessionId: profile.sessionId }
      : { kind: "local" });
  let execution;
  if (selection.kind === "remote") {
    const sessions = await connectedTargets(host);
    const matches = sessions.filter((item) => item.hostId === selection.hostId);
    const session =
      sessions.find((item) => item.id === selection.sessionId) ??
      (selection.hostId && matches.length === 1 ? matches[0] : null);
    if (!session)
      throw new Error(
        "The selected SSH host is disconnected. Connect it in Hosts, then select it again.",
      );
    const requested =
      selection.cwd ||
      (profile.sessionId === session.id ? profile.cwd : "") ||
      config.scope.remoteRoots.find((root) => root.sessionId === session.id)
        ?.path;
    const directory = await host.call("files.sftp.resolveDirectory", {
      sessionId: session.id,
      ...(requested ? { path: requested } : {}),
    });
    const home = boundedString(directory?.home, "remote home directory");
    if (/^\/?[A-Za-z]:[\\/]/.test(home))
      throw new Error(
        "The execution-location selector currently supports POSIX SSH hosts. Windows SSH directory mappings are not supported yet; choose Local on Windows or a POSIX SSH host.",
      );
    const platform = /^[A-Za-z]:[\\/]/.test(home) ? "windows" : "posix";
    execution = {
      kind: "remote",
      sessionId: session.id,
      hostId: session.hostId,
      title: session.title,
      address: session.address,
      home,
      cwd: boundedString(directory?.path, "remote working directory"),
      platform,
    };
  } else if (selection.kind === "local") {
    const home = boundedString(
      await host.call("files.local.home", {}),
      "local home directory",
    );
    execution = {
      kind: "local",
      title: "Local",
      home,
      cwd: home,
      platform:
        host.machine?.platform ??
        (process.platform === "win32" ? "windows" : "posix"),
    };
  } else throw new Error("Invalid execution target");
  const configuredRoot =
    execution.kind === "remote"
      ? config.scope.remoteRoots.find(
          (root) => root.sessionId === execution.sessionId,
        )?.path
      : config.scope.localRoots[0];
  if (execution.kind === "local")
    execution.cwd = resolvePath(
      selection.cwd ||
        (profile.sessionId === execution.sessionId ? profile.cwd : "") ||
        configuredRoot ||
        execution.home,
      execution,
      execution.home,
    );
  if (selection.executable)
    execution.executable = boundedString(
      selection.executable,
      "agent executable",
    );
  if (selection.runtime)
    execution.runtime = boundedString(
      selection.runtime,
      "remote Node executable",
    );
  return execution;
}

export function executionConfig(config, execution) {
  const next = structuredClone(config);
  next.execution = execution;
  // A conversation targets one machine. Switching machines never expands its scope.
  next.scope =
    execution.kind === "remote"
      ? {
          localRoots: [],
          sessionIds: [execution.sessionId],
          remoteRoots: [
            { sessionId: execution.sessionId, path: execution.cwd },
          ],
        }
      : { localRoots: [execution.cwd], sessionIds: [], remoteRoots: [] };
  return next;
}

export function executionProfile(profile, execution) {
  const result = { ...profile };
  // Explicit target selection takes precedence over a legacy durable profile.
  // Legacy sends without a selected execution target bypass this function.
  delete result.remote;
  delete result.helperBinary;
  delete result.sessionId;
  if (CLI_PROTOCOLS.has(result.protocol)) {
    result.cwd = execution.cwd;
    if (execution.kind === "remote") {
      result.sessionId = execution.sessionId;
      result.platform = execution.platform;
      result.executable =
        execution.executable ||
        (profile.sessionId === execution.sessionId ? profile.executable : "") ||
        { codex: "codex", "claude-code": "claude", pi: "pi" }[profile.protocol];
    } else if (execution.executable) result.executable = execution.executable;
  }
  return result;
}

export function workspaceContext(config) {
  return {
    execution: config.execution ?? null,
    runtimeMachine: config.machine ?? config.execution ?? null,
    authorizedScope: config.scope,
    instructions:
      "Use workspace_context and list_sessions to inspect the current target. File paths and command cwd default to the selected workspace. Missing sessionId uses this target, not an arbitrary local machine. Errors about paths do not indicate an absence of SSH sessions. Only selected, authorized machines may be accessed.",
  };
}
