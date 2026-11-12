import type { RuntimeResourcesDiscovery } from "../runtime/resources/discovery.mjs";
import type { ActivationDiscovery } from "../runtime/activation/discovery.mjs";
/** Experimental directory; discovery does not authorize calls or promise complete coverage. */
export interface ExtensionDirectory {
  runtime?: { resources?: RuntimeResourcesDiscovery; activation?: ActivationDiscovery };
  frontend?: {
    sdkVersion: string;
    stability: "experimental";
    trust: "host-context";
    permission: "ui.trusted";
    manifest: "frontend";
    runtime: "frontend";
    viewKind: "component";
    backgroundTasks?: {
      context: "backgroundTasks"; method: "run"; ownership: "runtime"; pendingLimit: number;
      cancellation: "cooperative-settlement"; hidden: "blocks-webview-suspension";
    };
    providers?: {
      manifest: "views[].provider";
      targets: ("hostList" | "workbench" | "fileBrowser" | "filePreview" | "terminal" | "history" | "forwarding" | "monitor" | "backgroundTasks" | "processes" | "quickAccess" | "preferences")[];
      selection: "explicit-user";
      hostListPermission: "hosts.read";
      fileBrowserPermissions: string[];
      fileBrowser: {
        context: "fileBrowser"; ownership: "host-pane"; pageSize: number;
        paging: "revision-bound"; recovery: "native-path-and-actions";
      };
      terminalPermissions: string[];
      historyPermissions: string[];
      forwardingPermissions?: string[];
      backgroundTasksPermissions?: string[];
      backgroundTasks?: {
        context: "backgroundTasks"; ownership: "host-panel"; presentations: ("floating" | "embedded")[];
        optionalSlot: "Entries"; pageSize: number; pageTextLimit: number; paging: "revision-bound";
        writePermission: "backgroundTasks.write"; visibility: "visible-tasks-only"; recovery: "native-toolbar-and-confirmation";
      };
      preferencesPermissions?: string[];
      preferences?: {
        context: "preferences"; ownership: "host-page"; optionalSlot: "Fields";
        schema: "preferences.schema"; read: "preferences.snapshot"; update: "preferences.update";
        writePermission: "settings.write"; concurrency: "persistent-revision";
        recovery: "native-search-navigation-and-trust";
      };
      quickAccessPermissions?: string[];
      quickAccess?: {
        context: "quickAccess"; ownership: "host-dialog"; optionalSlot: "Entries";
        pageSize: number; pageTextLimit: number; paging: "revision-bound";
        invokePermission: "workspace.write"; activation: "invoke-only-native-consent";
        recovery: "native-input-roots-and-dismissal";
      };
      processesPermissions?: string[];
      processes?: {
        context: "processes"; ownership: "host-dialog"; optionalSlot: "Entries";
        pageSize: number; pageTextLimit: number; paging: "revision-bound";
        writePermission: "monitor.write";
        termination: "native-confirmation-with-live-authorization-and-identity";
        sampling: "shared-visible-consumers"; query: "at-prefixed-filters";
      };
      monitorPermissions?: string[];
      monitor?: {
        context: "monitor"; ownership: "host-view"; presentations: ("page" | "panel")[]; optionalSlot: "Charts";
        sampleLimit: number; pageSize: number; paging: "revision-bound";
        sampling: "shared-visible-consumers"; refresh: "coalesced-existing-sampler";
      };
      forwarding?: {
        context: "forwarding"; ownership: "host-panel"; optionalSlot: "Entries";
        pageSize: number; pageTextLimit: number; paging: "revision-bound";
        writePermission: "forwards.write"; connection: "independent-host-confirmation";
        acceptedOwnership: "plugin-runtime"; recovery: "native-editor-and-confirmation";
      };
      history: {
        context: "history"; ownership: "host-panel"; optionalSlot: "Entries";
        pageSize: number; pageTextLimit: number; paging: "revision-bound";
        writePermission: "history.write"; executePermission: "ssh.exec";
        recovery: "native-search-and-confirmation";
      };
      terminal: {
        context: "terminal"; ownership: "host-session"; requiredSlot: "Screen";
        pageSize: number; pageTextLimit: number; lineTextLimit: number; inputTextLimit: number;
        subscriptions: number; notificationIntervalMs: number;
        paging: "revision-bound"; stream: "coalesced-dirty"; recovery: "native-toolbar-and-screen";
      };
      slots: string[];
      requiredSlot: "Workspace";
      limits: { perPlugin: number };
      fallback: "built-in";
    };
    components: string[];
    limits: { moduleBytes: number; totalBytes: number; owners: number };
  };
  version: 1;
  stability: "experimental";
  layers: Array<
    "contract" | "runtime" | "data" | "presentation" | "behavior" | "governance"
  >;
  domains: Array<{ id: string; namespaces: string[] }>;
  points: Array<{
    id: string;
    domain: string;
    layer: string;
    stability: string;
    composition: string;
    registration: { set: string; remove: string } | { manifest: string; read?: string; replace?: string };
    ownership: "runtime" | "manifest";
    permissions: string[];
    writePermissions?: string[];
    limits: Record<string, number>;
  }>;
}

export interface MethodDescription {
  name: string;
  permissions: string[];
  params: string;
  description: string;
  /** Missing on hosts released before stability metadata was introduced. */
  stability?: "stable" | "experimental" | "deprecated";
  since?: string | null;
  deprecated?: string | null;
  /** Optional machine-readable contract, absent on older hosts and experimental methods. */
  contract?: MethodContract;
}

export interface MethodContract {
  version: 1;
  /** JSON Schema draft-07; encoded byte limits are documented separately. */
  inputSchema: Record<string, unknown>;
  resultSchema: Record<string, unknown>;
  errorSchema: Record<string, unknown>;
  /** Optional schema of advisory input passed to a contribution's manifest command. */
  commandContextSchema?: Record<string, unknown>;
  /** Optional schema of the host-generated event envelope, not every custom payload. */
  eventSchema?: Record<string, unknown>;
  /** Stable application error messages; IO/internal error text remains platform-specific. */
  knownErrors: string[];
  /** Events emitted by this method; an empty list means snapshot/RPC behavior only. */
  events: string[];
}
