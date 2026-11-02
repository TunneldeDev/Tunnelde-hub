import { readFile, readdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";

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
  if (
    saved &&
    saved.fingerprint === fingerprint &&
    saved.hostId === execution.hostId
  )
    return saved;
  signal?.throwIfAborted();
  const paths = execution.platform === "windows" ? path.win32 : path.posix;
  const directory = paths.join(
    execution.home,
    `.tunnelde-${label}-${randomUUID()}`,
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
    return { directory, fingerprint, hostId: execution.hostId, created };
  } catch (error) {
    // Only clean entries this deployment successfully created, in reverse order.
    for (const entry of created.reverse())
      await host
        .call("files.sftp.delete", { ...params, ...entry })
        .catch(() => {});
    throw error;
  }
}
