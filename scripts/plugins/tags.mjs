// Catalogue-only metadata keeps previously published archive hashes immutable.
const officialTags = {
  "json-formatter": ["json", "formatting", "developer-tools"],
  timestamp: ["time", "conversion", "developer-tools"],
  uuid: ["uuid", "generator", "developer-tools"],
  "studio-themes": ["themes", "appearance"],
  sshfs: ["sshfs", "files", "remote"],
  "sshfs-lite": ["sshfs", "files", "remote", "no-node"],
  "tunnelde-ai": ["ai", "chat", "remote"],
  "tunnelde-codex": ["ai", "codex", "remote"],
  "tunnelde-claude-code": ["ai", "claude", "remote"],
  "tunnelde-pi": ["ai", "pi", "remote"],
  "tunnelde-mcp": ["mcp", "automation", "remote"],
};
export function catalogueTags(manifest) {
  return manifest.tags ?? officialTags[manifest.id] ?? [];
}
