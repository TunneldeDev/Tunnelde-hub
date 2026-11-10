/** Strict domain facade: no generic fallback overload. Ownership comes from host transport. */
export function createConfigurationClient(host) {
  const empty = method => () => host.call(method,{});
  const request = method => params => host.call(method,params);
  return Object.freeze({
    schema:empty("configuration.schema"),snapshot:empty("configuration.snapshot"),
    update:request("configuration.update"),migrate:request("configuration.migrate"),
    backups:empty("configuration.backups"),restore:request("configuration.restore"),deleteBackup:request("configuration.deleteBackup"),
  });
}
