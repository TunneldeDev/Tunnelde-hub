const string = { type: "string", minLength: 1, maxLength: 32768 };
const bool = { type: "boolean" };
const integer = { type: "integer" };
const object = (properties = {}, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const entries = [];
function tool(method, description, properties, required, readOnly = false) {
  entries.push(
    Object.freeze({
      name: `tunnelde_${method.replaceAll(".", "_")}`,
      method,
      description,
      inputSchema: object(properties, required),
      annotations: {
        readOnlyHint: readOnly,
        destructiveHint: !readOnly,
        idempotentHint: readOnly,
        openWorldHint: true,
      },
    }),
  );
}
tool("hosts.snapshot", "List saved hosts and groups without credentials.", {}, [], true);
tool("sessions.list", "List active SSH sessions without credentials.", {}, [], true);
tool(
  "sessions.connect",
  "Connect a saved host using normal host-key verification. Never auto-trust a new server.",
  {
    request: object(
      {
        hostId: string,
        cols: { ...integer, minimum: 1, maximum: 1000 },
        rows: { ...integer, minimum: 1, maximum: 1000 },
      },
      ["hostId"],
    ),
  },
);
tool("sessions.disconnect", "Disconnect an explicitly scoped active SSH session.", {
  sessionId: string,
});
tool(
  "sessions.exec",
  "Execute a remote shell command in a separate SSH channel. Output is bounded; never available in read-only mode.",
  {
    sessionId: string,
    command: string,
    timeoutMs: { ...integer, minimum: 100, maximum: 60000 },
  },
  ["sessionId", "command"],
);
tool("files.local.home", "Read the local home directory path.", {}, [], true);
tool(
  "files.local.list",
  "List a directory inside an approved local root. Use an absolute path.",
  { path: string },
  undefined,
  true,
);
tool(
  "files.local.readText",
  "Read bounded UTF-8 text inside an approved local root.",
  { path: string },
  undefined,
  true,
);
tool("files.local.writeText", "Replace an existing UTF-8 file inside an approved local root.", {
  path: string,
  content: { type: "string", maxLength: 250000 },
});
tool("files.local.createFile", "Create an empty file without replacing an existing file.", {
  path: string,
});
tool("files.local.mkdir", "Create a directory inside an approved local root.", { path: string });
for (const operation of ["rename", "copy"])
  tool(
    `files.local.${operation}`,
    `${operation === "copy" ? "Copy" : "Rename"} a file or directory. Source and destination must remain inside approved roots.`,
    { from: string, to: string, overwrite: bool },
    ["from", "to"],
  );
tool(
  "files.local.delete",
  "Permanently delete a local file or directory inside an approved root.",
  { path: string, isDir: bool },
);
tool(
  "files.sftp.list",
  "List a remote directory inside an approved remote root. Use an absolute path.",
  { sessionId: string, path: string },
  undefined,
  true,
);
tool(
  "files.sftp.readText",
  "Read bounded remote UTF-8 text inside an approved root.",
  { sessionId: string, path: string },
  undefined,
  true,
);
tool("files.sftp.writeText", "Replace existing remote UTF-8 text inside an approved root.", {
  sessionId: string,
  path: string,
  content: { type: "string", maxLength: 250000 },
});
tool("files.sftp.createFile", "Create an empty remote file without replacing an existing file.", {
  sessionId: string,
  path: string,
});
tool("files.sftp.mkdir", "Create a remote directory inside an approved root.", {
  sessionId: string,
  path: string,
});
for (const operation of ["rename", "copy"])
  tool(
    `files.sftp.${operation}`,
    `${operation === "copy" ? "Copy" : "Rename"} a remote file or directory inside approved roots.`,
    { sessionId: string, from: string, to: string, overwrite: bool },
    ["sessionId", "from", "to"],
  );
tool(
  "files.sftp.delete",
  "Permanently delete a remote file or directory inside an approved root.",
  { sessionId: string, path: string, isDir: bool },
);
tool(
  "files.upload",
  "Upload a local file or directory. Return transferId; poll transferStatus for completion. Both local and remote roots must be approved.",
  { sessionId: string, localPath: string, remotePath: string, overwrite: bool },
  ["sessionId", "localPath", "remotePath"],
);
tool(
  "files.download",
  "Download a remote file or directory. Return transferId; poll transferStatus for completion. Both roots must be approved.",
  { sessionId: string, remotePath: string, localPath: string, overwrite: bool },
  ["sessionId", "remotePath", "localPath"],
);
tool(
  "files.cancelTransfer",
  "Cancel this client's transfer; completed transfers cannot be undone.",
  { transferId: string },
);
tool(
  "files.transferStatus",
  "Read progress or final state of a transfer started by this client.",
  { transferId: string },
  undefined,
  true,
);
tool(
  "tasks.start",
  "Start an explicit local executable or remote background process. Shell execution is not read-only. An absolute approved working directory is required. Return taskId; use status and readOutput to follow it.",
  {
    executable: string,
    args: { type: "array", items: { type: "string", maxLength: 32768 }, maxItems: 256 },
    cwd: string,
    sessionId: string,
    platform: { type: "string", enum: ["posix", "windows"] },
    timeoutMs: { ...integer, minimum: 100, maximum: 86400000 },
  },
  ["executable", "cwd"],
);
tool("tasks.list", "List background processes started by this MCP client.", {}, [], true);
tool(
  "tasks.status",
  "Read the status and exit code of this client's background process.",
  { taskId: string },
  undefined,
  true,
);
tool(
  "tasks.readOutput",
  "Read this client's sequenced stdout/stderr. afterSeq is an exclusive cursor; truncated signals an output gap.",
  { taskId: string, afterSeq: { ...integer, minimum: 0 } },
  ["taskId"],
  true,
);
tool(
  "tasks.cancel",
  "Stop this client's background process; already completed effects cannot be rolled back.",
  { taskId: string },
);

export const TOOLS = Object.freeze(entries);
export const TOOL_BY_NAME = new Map(TOOLS.map((entry) => [entry.name, entry]));
export function toolsFor(mode) {
  return TOOLS.filter((entry) => mode !== "readOnly" || entry.annotations.readOnlyHint).map(
    ({ method, ...entry }) => entry,
  );
}
export function validate(schema, value, path = "arguments") {
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`${path} must be an object`);
    for (const name of schema.required ?? [])
      if (!Object.hasOwn(value, name)) throw new Error(`${path}.${name} is required`);
    for (const name of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties, name))
        throw new Error(`${path}.${name} is not supported`);
      validate(schema.properties[name], value[name], `${path}.${name}`);
    }
  } else if (schema.type === "string") {
    if (
      typeof value !== "string" ||
      value.length < (schema.minLength ?? 0) ||
      value.length > (schema.maxLength ?? Infinity) ||
      value.includes("\0")
    )
      throw new Error(`${path} is invalid`);
    if (schema.enum && !schema.enum.includes(value))
      throw new Error(`${path} is not a supported value`);
  } else if (schema.type === "array") {
    if (!Array.isArray(value) || value.length > schema.maxItems)
      throw new Error(`${path} must be a bounded array`);
    value.forEach((item, index) => validate(schema.items, item, `${path}[${index}]`));
  } else if (schema.type === "boolean") {
    if (typeof value !== "boolean") throw new Error(`${path} must be boolean`);
  } else if (schema.type === "integer") {
    if (
      !Number.isSafeInteger(value) ||
      value < (schema.minimum ?? -Infinity) ||
      value > (schema.maximum ?? Infinity)
    )
      throw new Error(`${path} must be an integer in range`);
  }
}
