export interface HostDetailsContribution {
  id: string;
  title: string;
  viewId: string;
  kind?: "mounts";
}

export interface HostDetailsManifest {
  hostDetails?: HostDetailsContribution[];
}
