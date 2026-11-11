const encoder = new TextEncoder();
const levels = ["trace", "debug", "info", "warn", "error"];
function list(value, maximum) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > maximum ||
    Reflect.ownKeys(value).some(
      (key) =>
        key !== "length" &&
        (typeof key !== "string" ||
          !/^(0|[1-9][0-9]*)$/.test(key) ||
          Number(key) >= value.length ||
          !("value" in Object.getOwnPropertyDescriptor(value, key))),
    ) ||
    Object.keys(value).length !== value.length
  )
    throw new TypeError("Invalid log array");
  return value;
}
export function object(value, allowed, required = []) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).some(
      (key) =>
        typeof key !== "string" ||
        !allowed.includes(key) ||
        !("value" in Object.getOwnPropertyDescriptor(value, key)),
    ) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    throw new TypeError("Invalid log object");
}
function text(value, maximum, identifier = false) {
  if (
    typeof value !== "string" ||
    encoder.encode(value).length > maximum ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(value) ||
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
      value,
    ) ||
    (identifier && !/^[A-Za-z0-9._:-]+$/.test(value))
  )
    throw new TypeError("Invalid log text");
  return value;
}
function cursor(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,2048}$/.test(value))
    throw new TypeError("Invalid log cursor");
  return value;
}
export function request(input = {}) {
  object(input, ["source", "cursor", "filter", "limit"]);
  const value = {};
  if (Object.hasOwn(input, "source")) {
    if (!["diagnostics", "operations"].includes(input.source))
      throw new TypeError("Invalid log source");
    value.source = input.source;
  }
  if (Object.hasOwn(input, "cursor")) value.cursor = cursor(input.cursor);
  if (Object.hasOwn(input, "limit")) {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 200)
      throw new TypeError("Invalid log limit");
    value.limit = input.limit;
  }
  if (Object.hasOwn(input, "filter")) {
    const filter = input.filter;
    object(filter, ["domains", "plugins", "levels", "text"]);
    value.filter = {};
    for (const [key, max, size] of [
      ["domains", 16, 256],
      ["plugins", 16, 128],
      ["levels", 5, 5],
    ]) {
      if (!Object.hasOwn(filter, key)) continue;
      const values = Array.from(list(filter[key], max), (item) =>
        text(item, size, true),
      ).sort();
      if (
        new Set(values).size !== values.length ||
        (key === "levels" && values.some((item) => !levels.includes(item)))
      )
        throw new TypeError("Invalid log filter");
      value.filter[key] = values;
    }
    if (Object.hasOwn(filter, "text"))
      value.filter.text = text(filter.text, 256);
  }
  return value;
}
function context(value, depth = 0, state = { nodes: 0 }) {
  if (depth > 8 || ++state.nodes > 512)
    throw new TypeError("Oversized log fields");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return text(value, 32768);
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (!Number.isInteger(value) || Number.isSafeInteger(value))
  )
    return value;
  if (Array.isArray(value))
    return Object.freeze(
      Array.from(list(value, 512), (item) => context(item, depth + 1, state)),
    );
  if (value && typeof value === "object") {
    object(value, Object.keys(value));
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          text(key, 64, true),
          context(item, depth + 1, state),
        ]),
      ),
    );
  }
  throw new TypeError("Invalid log fields");
}
export function page(input, query = {}) {
  const keys = [
    "version",
    "source",
    "entries",
    "cursor",
    "hasMore",
    "reset",
    "gap",
  ];
  object(input, keys, keys);
  if (
    input.version !== 1 ||
    input.source !== (query.source ?? "diagnostics") ||
    !Array.isArray(input.entries) ||
    input.entries.length > (query.limit ?? 100) ||
    [input.hasMore, input.reset, input.gap].some((v) => typeof v !== "boolean")
  )
    throw new TypeError("Invalid log page");
  const entries = Array.from(
    list(input.entries, query.limit ?? 100),
    (value) => {
      const keys = [
        "timestamp",
        "level",
        "domain",
        "pluginId",
        "message",
        "fields",
        "truncated",
      ];
      object(value, keys, keys);
      if (!levels.includes(value.level) || typeof value.truncated !== "boolean")
        throw new TypeError("Invalid log entry");
      if (value.timestamp !== null) {
        text(value.timestamp, 64);
        if (
          !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(
            value.timestamp,
          ) ||
          !Number.isFinite(Date.parse(value.timestamp))
        )
          throw new TypeError("Invalid log timestamp");
      }
      object(value.fields, Object.keys(value.fields ?? {}));
      const entry = Object.freeze({
        ...value,
        domain: text(value.domain, 256, true),
        pluginId:
          value.pluginId === null ? null : text(value.pluginId, 128, true),
        message: text(value.message, 16384),
        fields: context(value.fields),
      });
      if (encoder.encode(JSON.stringify(entry)).length > 65536)
        throw new TypeError("Oversized log entry");
      return entry;
    },
  );
  const result = Object.freeze({
    ...input,
    cursor: cursor(input.cursor),
    entries: Object.freeze(entries),
  });
  // Rust JSON is bounded to128KiB. JS expands small decimals; bound decoded
  // work separately so re-encoding does not reject an otherwise valid page.
  if (encoder.encode(JSON.stringify(result)).length > 262144)
    throw new TypeError("Oversized log page");
  return result;
}
