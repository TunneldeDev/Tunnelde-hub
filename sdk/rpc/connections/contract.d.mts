export interface SshSession {
  id: string;
  hostId: string;
  title: string;
  address: string;
  cols: number;
  rows: number;
  /** Unix epoch milliseconds; internal connection-purpose fields are not exposed. */
  connectedAt: number;
}

/** Experimental: 8 pending/live connections per plugin, 64 total; released with this runtime. */
export interface SshConnectRequest {
  hostId: string;
  /** Opens a transport without requesting a PTY or shell. Still runtime-owned. */
  background?: boolean;
  purpose?: "forwarding";
  jumpCredentials?: Record<string, { password?: string; passphrase?: string }>;
  password?: string | null;
  passphrase?: string | null;
  cols?: number;
  rows?: number;
}
