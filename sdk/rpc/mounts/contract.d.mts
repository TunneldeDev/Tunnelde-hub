export interface MountInfo {
  id: string;
  owner: string;
  sessionId: string;
  remotePath: string;
  mountPoint: string;
  readOnly: boolean;
  cleanupError: string | null;
}

export interface MountDependencies {
  available: boolean;
  executable: string | null;
  platform: string;
  instructions: string;
  documentation: string;
  transport: string | null;
}
