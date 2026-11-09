/** Explicit host menu command. A conflict is surfaced instead of silently retried. */
export function activate(context) {
  context.commands.register("toggle-managed", async ({ host }) => {
    const { document } = await context.api.call("hosts.getFields", { hostId: host.id });
    if (document.schemaChanged) throw new Error("Review the changed host field schema before editing.");
    const { document: saved } = await context.api.call("hosts.setFields", {
      hostId: host.id,
      expectedRevision: document.revision,
      schemaDigest: document.schemaDigest,
      values: { ...document.values, managed: !document.values.managed },
    });
    return { text: `${host.name}: managed = ${saved.values.managed}` };
  });
}
