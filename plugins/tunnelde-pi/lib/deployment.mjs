import { readFile, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

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
  if (saved.hostId !== execution?.hostId) {
    const sessions = await host.call("sessions.list", {});
    const target = sessions.find((item) => item.hostId === saved.hostId);
    if (!target) throw new Error("Reconnect the SSH host that owns these assistant files before cleanup");
    const directory = await host.call("files.sftp.resolveDirectory", { sessionId: target.id });
    execution = { hostId: saved.hostId, sessionId: target.id, home: directory.home, platform: "posix" };
  }
  const { paths, chats } = assistantDirectories(execution);
  const legacy = new RegExp("^\\.tunnelde-[a-z0-9-]+-[a-f0-9-]{36}$");
  if (saved.hostId !== execution.hostId ||
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
      if (typeof file?.content !== "string" || (saved.hashes && digest(file.content) !== expected))
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
  { signal, label, saved } = {},
) {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([...files]))
    .digest("hex");
  if (!/^[a-z0-9-]{1,80}$/.test(label ?? "")) throw new Error("Invalid deployment label");
  const { paths, root, chats } = assistantDirectories(execution);
  if (
    saved &&
    saved.fingerprint === fingerprint &&
    saved.hostId === execution.hostId && paths.dirname(saved.directory) === chats
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
  try {
    await ensureDirectory(host, execution.sessionId, root, signal);
    await ensureDirectory(host, execution.sessionId, chats, signal);
    // Migrate only directories tied to this conversation's ownership record.
    // Unknown old directories are never swept from the user's home.
    if (saved && saved.hostId === execution.hostId &&
        paths.dirname(saved.directory) === execution.home &&
        new RegExp(`^\\.tunnelde-${label}-[a-f0-9-]{36}$`).test(paths.basename(saved.directory)) &&
        saved.created?.some((entry) => entry.path === saved.directory && entry.isDir)) {
      const previous = saved.directory;
      const migrated = paths.join(chats, paths.basename(previous).slice(".tunnelde-".length));
      await host.call("files.sftp.rename", { ...params, from: previous, to: migrated, overwrite: false }, { signal });
      for (const entry of saved.created) entry.path = migrated + entry.path.slice(previous.length);
      saved.directory = migrated;
      if (saved.fingerprint === fingerprint) return saved;
    }
    await host.call(
      "files.sftp.mkdir",
      { ...params, path: directory },
      { signal },
    );
    created.push({ path: directory, isDir: true });
    if ([...files.keys()].some((name) => name.startsWith("lib/"))) {
      const folder = paths.join(directory, "lib");
      await host.call(
        "files.sftp.mkdir",
        { ...params, path: folder },
        { signal },
      );
      created.push({ path: folder, isDir: true });
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
      await host.call(
        "files.sftp.writeText",
        { ...params, path: target, content },
        { signal },
      );
    }
    return { directory, fingerprint, hostId: execution.hostId, created,
      hashes: Object.fromEntries([...files].map(([name, content]) => [name, digest(content)])),
      retired: saved ? [saved] : [] };
  } catch (error) {
    // Only clean entries this deployment successfully created, in reverse order.
    for (const entry of created.reverse())
      await host
        .call("files.sftp.delete", { ...params, ...entry })
        .catch(() => {});
    throw error;
  }
}
