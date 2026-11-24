import type { Host as OldHost, HostMethodMap as OldMap, PluginEvent as OldEvent } from "./contract.mjs";
import type { Host as NewHost, HostMethodMap as NewMap, PluginEvent as NewEvent } from "../../../sdk/tunnelde-plugin.mjs";
import type { EditorDocument } from "../../../sdk/rpc/editor/contract.mjs";
import type { ForwardRule } from "../../../sdk/rpc/forwarding/contract.mjs";
import { createPlugin } from "../../../sdk/tunnelde-plugin.mjs";

declare const oldEvent: OldEvent<{ path: string }>;
declare const newEvent: NewEvent<{ path: string }>;
const eventToNew: NewEvent<{ path: string }> = oldEvent;
const eventToOld: OldEvent<{ path: string }> = newEvent;
declare const oldHost: OldHost;
declare const newHost: NewHost;
const hostToNew: NewHost = oldHost;
const hostToOld: OldHost = newHost;
declare const originalInput: OldMap["forwards.save"][0];
const newInput: NewMap["forwards.save"][0] = originalInput;
const rule: ForwardRule = newInput.rule;
const plugin = createPlugin({ run: async (_, __, host) => {
  const document: EditorDocument | null = await host.call("editor.active");
  return { text: document?.path ?? "" };
} });
void [eventToNew, eventToOld, hostToNew, hostToOld, rule, plugin];
