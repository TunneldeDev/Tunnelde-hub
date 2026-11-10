export interface StorageMethodMap {
  "secrets.get": [{ key: string }, string | null];
  "secrets.set": [{ key: string; value: string }, null];
  "secrets.delete": [{ key: string }, null];
  "storage.get": [{ key: string }, unknown];
  "storage.set": [{ key: string; value: unknown }, null];
  "storage.delete": [{ key: string }, null];
}
