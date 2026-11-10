import type { RuntimeResourcesMethodMap } from "../runtime/resources/methods.mjs";
import type { ApplicationMethodMap } from "../application/methods.mjs";
import type { ClipboardMethodMap } from "../clipboard/methods.mjs";
import type { ConnectionsMethodMap } from "../connections/methods.mjs";
import type { DiscoveryMethodMap } from "../discovery/methods.mjs";
import type { EditorMethodMap } from "../editor/methods.mjs";
import type { EventsMethodMap } from "../events/methods.mjs";
import type { ExecutionMethodMap } from "../execution/methods.mjs";
import type { FilesMethodMap } from "../files/methods.mjs";
import type { ForwardingMethodMap } from "../forwarding/methods.mjs";
import type { HistoryMethodMap } from "../history/methods.mjs";
import type { HostsMethodMap } from "../hosts/methods.mjs";
import type { LoggingMethodMap } from "../logging/methods.mjs";
import type { MonitorMethodMap } from "../monitor/methods.mjs";
import type { MountsMethodMap } from "../mounts/methods.mjs";
import type { SettingsMethodMap } from "../settings/methods.mjs";
import type { PreferencesMethodMap } from "../settings/preferences/methods.mjs";
import type { ConfigurationMethodMap } from "../configuration/methods.mjs";
import type { StorageMethodMap } from "../storage/methods.mjs";
import type { TerminalMethodMap } from "../terminal/methods.mjs";
import type { ToolsMethodMap } from "../tools/methods.mjs";
import type { WorkbenchMethodMap } from "../workbench/methods.mjs";

export interface HostMethodMap extends RuntimeResourcesMethodMap, HostsMethodMap, DiscoveryMethodMap, WorkbenchMethodMap, ForwardingMethodMap, MountsMethodMap, EditorMethodMap, EventsMethodMap, StorageMethodMap, ExecutionMethodMap, ToolsMethodMap, FilesMethodMap, MonitorMethodMap, HistoryMethodMap, ApplicationMethodMap, SettingsMethodMap, PreferencesMethodMap, ConfigurationMethodMap, ConnectionsMethodMap, TerminalMethodMap, ClipboardMethodMap, LoggingMethodMap {}
