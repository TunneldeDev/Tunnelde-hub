export interface HistoryMethodMap {
  "history.list": [{ hostId: string; limit?: number }, unknown];
  "history.record": [
    { hostId: string; command: string },
    Record<string, unknown> | null,
  ];
  "history.delete": [{ id: number }, null];
  "history.clear": [{ hostId: string }, null];
}
