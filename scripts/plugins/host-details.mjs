import assert from "node:assert/strict";

const id = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const mountsView = view => view?.kind === "sharedMounts";

export function validateHostDetails(manifest) {
  const { permissions, runtime = "node", views = [], hostDetails = [] } = manifest;
  const has = (...required) => required.every(permission => permissions.includes(permission));
  for (const view of views.filter(mountsView)) {
    assert.ok(view.provider === undefined && ["node", "declarative"].includes(runtime) &&
      has("hosts.read", "mounts.read"), "Invalid sharedMounts view or missing permissions");
  }
  assert.ok(Array.isArray(hostDetails) && hostDetails.length <= 8, "Invalid hostDetails contributions");
  const ids = new Set();
  for (const item of hostDetails) {
    assert.ok(item && typeof item === "object" && !Array.isArray(item) &&
      Object.keys(item).every(key => ["id", "viewId", "title", "kind"].includes(key)) &&
      typeof item.id === "string" && id.test(item.id) && !ids.has(item.id) &&
      typeof item.title === "string" && item.title.trim() &&
      Buffer.byteLength(item.title, "utf8") <= 120 && !/\p{Cc}/u.test(item.title) &&
      (item.kind === undefined || item.kind === "mounts"), "Invalid hostDetails contribution");
    const view = views.find(view => view.id === item.viewId);
    assert.ok(view && view.provider === undefined &&
      (mountsView(view) ? item.kind === "mounts" :
        view.kind === "component" && manifest.frontend && has("hosts.read", "ui.trusted")) &&
      (item.kind !== "mounts" || has("mounts.read", "mounts.hostDetails")),
    "Invalid hostDetails view or missing permissions");
    ids.add(item.id);
  }
}
