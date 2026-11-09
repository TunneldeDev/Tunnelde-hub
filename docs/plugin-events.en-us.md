# Plugin event contract

[简体中文](plugin-events.zh-cn.md)

`host.call("events.publish", { event: "progress", payload: { completed: 3 } })`
emits an advisory event to the application. The method has a stable v1 contract and
has existed since host 0.21.0. Older hosts may not expose its schema; discover capabilities
before relying on contract metadata. No additional permission is required, but approval,
restricted mode and current runtime authorization still apply.

Names accept 1–128 ASCII letters, digits, `.`, `_`, `:` and `-`. Payloads may be any
JSON value; omission means `null`. Additional fields cannot override the host-supplied
identity. Requests share the 256 KiB serialized UTF-8 quota, including JSON overhead.

The host emits `{pluginId, generation, event, payload}` on `plugin://event`. Consumers
must check identity and the current generation; queued events from a stopped runtime
may still arrive. Chat consumers also check view/session/run/sequence. This envelope
is described by `contract.eventSchema`; individual payloads and the task API remain
independently versioned or experimental. Ignore unknown envelope fields.

Success returns `null` for transport acceptance, not subscriber processing, persistence,
replay or exactly-once delivery. Concurrent calls have no completion-order guarantee.
Recoverable operations need retained state and a query/snapshot. Publishing cannot
grant permissions. Do not send secrets. Invalid names return `plugin.api.invalidEvent`;
missing or mistyped names return `plugin.api.missing:event` or `plugin.api.invalid:event`.
Malformed or oversized parameter objects return `plugin.api.invalidParams`. Transport
errors reject the call; IO error text can vary by platform.

The SDK frames messages strictly on LF, bounds unfinished frames to 1 MiB and rejoins
split UTF-8 before decoding. U+2028/U+2029 remain ordinary JSON string content; outgoing
frames escape them for historical readers. Already installed archives keep their SDK;
new SDK sources do not silently modify or republish those archives. Host-side escaping
provides compatibility for existing plugins.
