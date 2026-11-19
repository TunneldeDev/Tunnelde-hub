import type { Host, HostMethodMap, HostTransferImport } from "../../../sdk/tunnelde-plugin.mjs";

declare const host: Host;
const snapshot = await host.call("bus.snapshot", {});
for (const channel of snapshot.channels) {
  const memberIds: string[] = channel.members;
  const callerTopics: string[] = channel.topics;
  if (memberIds.length && !callerTopics.includes("bus.membersChanged"))
    await host.call("bus.subscribe", { busId: channel.busId, topic: "bus.membersChanged" });
}
const invites = await host.call("bus.invitations", {});
if (invites.length) await host.call("bus.decline", { invitationId: invites[0].invitationId });
const document = await host.call("hosts.transfer.export", { ids: ["remote"] });
const preview = await host.call("hosts.transfer.preview", { document });
const request: HostTransferImport = { document, revision: preview.revision, selected: document.roots };
declare const confirmed: boolean;
if (confirmed) await host.call("hosts.transfer.apply", { request });
// @ts-expect-error Portable records must not expose credentials or identity files.
document.hosts[0].keyPath;
const group = await host.call("forwards.groups.save", { hostId: "remote", name: "web" });
const moved = await host.call("forwards.move", { id: "http", expectedRevision: "r1", groupId: group.id });
const results = await host.call("forwards.startManyManaged", { items: [{ id: moved.id, expectedRevision: moved.revision }] });
for (const item of results) if (item.status === "failed") item.error.message.toUpperCase();
// @ts-expect-error Renames must carry the exact reviewed revision.
const stale: HostMethodMap["forwards.groups.save"][0] = {hostId: "remote", id: "id", name: "new"};
void stale;
