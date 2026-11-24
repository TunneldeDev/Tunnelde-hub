import { readFile, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { connectedTargets, resolveExecution } from "./targets.mjs";

export function assistantDirectories(execution) {
  const paths = execution.platform === "windows" ? path.win32 : path.posix;
  const root = paths.join(execution.home, ".TunneldeAI");
  return { paths, root, chats: paths.join(root, "Chats") };
}

async function ensureDirectory(host, sessionId, directory, signal) {
  try {
    await host.call("files.sftp.mkdir", { sessionId, path: directory }, { signal });
  } catch (error) {
    signal?.throwIfAborted();
    // An existing shared parent is expected. Other errors must remain visible.
    const listing = await host.call("files.sftp.list", { sessionId, path: directory }, { signal });
    if (!Array.isArray(listing?.entries)) throw error;
  }
}

const digest = (content) => createHash("sha256").update(content).digest("hex");

/** Delete only the exact, unchanged files recorded by a successful deployment. */
export async function cleanupDeployment(host, execution, saved) {
  if (!saved) return;
  for (const previous of saved.retired ?? []) await cleanupDeployment(host, execution, previous);
  if (Array.isArray(saved.created) && saved.created.length === 0) return;
  if (!saved.hostId)
    throw new Error("The saved remote deployment is missing its host identity; its files were preserved");
  if (!saved.address) {
    const matches = (await connectedTargets(host)).filter(item => item.hostId === saved.hostId);
    if (new Set(matches.map(item => item.address)).size !== 1 || !matches[0]?.address)
      throw new Error("Reconnect the original SSH destination before reviewing this older deployment; its files were preserved");
    const address = matches[0].address;
    const allowed = await host.call("ui.confirm", {
      message: `This older remote deployment did not record its destination address.\n\nConfirm that ${address} is the original machine that owns these assistant files:\n${saved.directory}\n\nContinue only if this is the original destination. Cleanup will still verify the recorded files. Cancel preserves the files and conversation.`,
    }, { timeoutMs: 120000 });
    if (allowed !== true)
      throw new Error("Remote deployment identity review was cancelled; files and conversation were preserved");
    saved.address = address;
  }
  execution = await resolveExecution(host, {
    kind: "remote", hostId: saved.hostId, address: saved.address,
    sessionId: execution?.hostId === saved.hostId ? execution.sessionId : "",
  }, { scope: { remoteRoots: [] } }, {});
  const { paths, chats } = assistantDirectories(execution);
  const legacy = new RegExp("^\\.tunnelde-[a-z0-9-]+-[a-f0-9-]{36}$");
  if (saved.hostId !== execution.hostId || saved.address !== execution.address ||
      (paths.dirname(saved.directory) !== chats &&
       !(paths.dirname(saved.directory) === execution.home && legacy.test(paths.basename(saved.directory)))))
    throw new Error("Cannot verify ownership of the remote assistant directory");
  const params = { sessionId: execution.sessionId };
  const created = saved.created ?? [];
  if (!created.length) return;
  const known = new Set(created.map((entry) => entry.path));
  if (!known.has(saved.directory) || created.some((entry) => {
    const relative = paths.relative(saved.directory, entry.path);
    return relative === ".." || relative.startsWith(".." + paths.sep) || paths.isAbsolute(relative);
  }))
    throw new Error("Remote assistant cleanup is missing its ownership record");
  const content = [];
  for (const entry of created) {
    if (entry.isDir) {
      const listing = await host.call("files.sftp.list", { ...params, path: entry.path });
      if (!Array.isArray(listing?.entries) || listing.entries.some((item) => !known.has(item.path)))
        throw new Error("Remote assistant directory contains unrecognized files; cleanup was stopped");
    } else {
      const name = paths.relative(saved.directory, entry.path).replaceAll("\\", "/");
      const expected = saved.hashes?.[name];
      const file = await host.call("files.sftp.readText", { ...params, path: entry.path });
      const actual = typeof file?.content === "string" ? digest(file.content) : null;
      if (actual === null || (saved.hashes && actual !== expected && actual !== saved.pendingWrites?.[name]))
        throw new Error("Remote assistant files changed or lack checksums; cleanup was stopped");
      content.push([name, file.content]);
    }
  }
  if (!saved.hashes && digest(JSON.stringify(content)) !== saved.fingerprint)
    throw new Error("Remote assistant files changed; cleanup was stopped");
  saved.hashes = Object.fromEntries(content.map(([name, value]) => [name, digest(value)]));
  for (const entry of [...created].reverse()) {
    if (entry.isDir) {
      const listing = await host.call("files.sftp.list", { ...params, path: entry.path });
      if (listing?.entries?.length !== 0) throw new Error("Remote assistant directory is not empty; cleanup was stopped");
    }
    await host.call("files.sftp.delete", { ...params, ...entry });
    // Keep cleanup retryable if the connection drops between files.
    saved.created = saved.created.filter((item) => item.path !== entry.path);
  }
}

export async function runtimeFiles({ piOnly = false } = {}) {
  if (piOnly)
    return new Map([
      [
        "pi-permissions.mjs",
        await readFile(
          new URL("./pi-permissions.mjs", import.meta.url),
          "utf8",
        ),
      ],
    ]);
  const files = new Map();
  for (const name of ["index.mjs", "stdio-entry.mjs"])
    files.set(
      name,
      await readFile(new URL(`../${name}`, import.meta.url), "utf8"),
    );
  for (const name of (await readdir(new URL("./", import.meta.url)))
    .filter((name) => name.endsWith(".mjs"))
    .sort())
    files.set(
      `lib/${name}`,
      await readFile(new URL(`./${name}`, import.meta.url), "utf8"),
    );
  return files;
}

/** Only write newly created plugin-owned directories; never replace remote user files. */
export async function deployFiles(
  host,
  execution,
  files,
  { signal, label, saved, onCheckpoint } = {},
) {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([...files]))
    .digest("hex");
  if (!/^[a-z0-9-]{1,80}$/.test(label ?? "")) throw new Error("Invalid deployment label");
  if (!execution?.hostId || !execution.address || !execution.sessionId)
    throw new Error("Select a connected SSH destination before deploying assistant files");
  const { paths, root, chats } = assistantDirectories(execution);
  if (saved?.incomplete) {
    const previous = saved.retired?.[0] ?? null;
    await cleanupDeployment(host, execution, { ...saved, retired: [] });
    saved = previous;
    await onCheckpoint?.(saved);
  }
  if (
    saved &&
    saved.fingerprint === fingerprint &&
    saved.hostId === execution.hostId && saved.address === execution.address &&
    paths.dirname(saved.directory) === chats
  )
    return saved;
  signal?.throwIfAborted();
  const directory = paths.join(
    chats,
    `${label}-${randomUUID()}`,
  );
  const allowed = await host.call(
    "ui.confirm",
    {
      message: `Run ${label} on ${execution.title}?\n\nUpload ${files.size} plugin files into this new directory:\n${directory}\n\nNo existing files or services will be changed. The selected runtime will be used only after this approval.`,
    },
    { signal, timeoutMs: 120000 },
  );
  if (allowed !== true)
    throw new Error("Remote runtime deployment was cancelled");
  const params = { sessionId: execution.sessionId };
  const created = [];
  const record = { directory, fingerprint, hostId: execution.hostId, address: execution.address, created,
    hashes: {}, pendingWrites: {}, incomplete: true, retired: saved ? [saved] : [] };
  try {
    await ensureDirectory(host, execution.sessionId, root, signal);
    await ensureDirectory(host, execution.sessionId, chats, signal);
    // Migrate only directories tied to this conversation's ownership record.
    // Unknown old directories are never swept from the user's home.
    if (saved && saved.hostId === execution.hostId && saved.address === execution.address &&
        paths.dirname(saved.directory) === execution.home &&
        new RegExp(`^\\.tunnelde-${label}-[a-f0-9-]{36}$`).test(paths.basename(saved.directory)) &&
        saved.created?.some((entry) => entry.path === saved.directory && entry.isDir)) {
      const previous = saved.directory;
      const migrated = paths.join(chats, paths.basename(previous).slice(".tunnelde-".length));
      await host.call("files.sftp.rename", { ...params, from: previous, to: migrated, overwrite: false }, { signal });
      for (const entry of saved.created) entry.path = migrated + entry.path.slice(previous.length);
      saved.directory = migrated;
      await onCheckpoint?.(saved);
      if (saved.fingerprint === fingerprint) return saved;
    }
    await host.call(
      "files.sftp.mkdir",
      { ...params, path: directory },
      { signal },
    );
    created.push({ path: directory, isDir: true });
    await onCheckpoint?.(record);
    if ([...files.keys()].some((name) => name.startsWith("lib/"))) {
      const folder = paths.join(directory, "lib");
      await host.call(
        "files.sftp.mkdir",
        { ...params, path: folder },
        { signal },
      );
      created.push({ path: folder, isDir: true });
      await onCheckpoint?.(record);
    }
    for (const [name, content] of files) {
      signal?.throwIfAborted();
      const target = paths.join(directory, name);
      await host.call(
        "files.sftp.createFile",
        { ...params, path: target },
        { signal },
      );
      created.push({ path: target, isDir: false });
      record.hashes[name] = digest("");
      record.pendingWrites[name] = digest(content);
      await onCheckpoint?.(record);
      await host.call(
        "files.sftp.writeText",
        { ...params, path: target, content },
        { signal },
      );
      record.hashes[name] = digest(content);
      delete record.pendingWrites[name];
      await onCheckpoint?.(record);
    }
    record.incomplete = false;
    await onCheckpoint?.(record);
    return record;
  } catch (error) {
    record.incomplete = true;
    // Failed replacement must preserve the previous reusable deployment.
    const partial = { ...record, retired: [] };
    try {
      await cleanupDeployment(host, execution, partial);
      await onCheckpoint?.(saved ?? null);
    } catch (cleanupError) {
      record.created = partial.created;
      record.hashes = partial.hashes;
      await onCheckpoint?.(record);
      throw new Error(`${error.message} Remote deployment cleanup is pending; reconnect this host and retry or delete the conversation. ${cleanupError.message}`, { cause: error });
    }
    throw error;
  }
}
