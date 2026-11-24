export interface FileEntry {
  isHidden: boolean;
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modified: number | null;
  permissions: number | null;
}

export interface Listing {
  path: string;
  entries: FileEntry[];
}
