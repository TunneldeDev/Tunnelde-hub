export type AuthMethod = "password" | "key" | "agent" | "keyboardInteractive";

export interface Group {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface SavedHost {
  id: string;
  groupId: string | null;
  name: string;
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  keyPath: string | null;
  favorite: boolean;
  color: string | null;
  tags: string[];
  note: string | null;
  sortOrder: number;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface HostInput {
  name: string;
  groupId?: string | null;
  host: string;
  port?: number;
  username?: string;
  authMethod?: AuthMethod;
  keyPath?: string | null;
  favorite?: boolean;
  color?: string | null;
  tags?: string[];
  note?: string | null;
}
