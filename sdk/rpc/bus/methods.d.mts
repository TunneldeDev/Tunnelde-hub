import type { PluginStorageJson } from "../storage/pluginData/json.mjs";

export interface BusProvider { pluginId: string; version: number }
export interface BusInvitation { invitationId: string; fromPluginId: string }
export interface BusTopic { busId?: string; topic: string }
export interface BusMessage {
  busId: string;
  topic: string;
  sender: { pluginId: string; generation: number } | null;
  payload: PluginStorageJson;
}
export interface BusChannelSnapshot {
  busId: string;
  ownerPluginId: string;
  members: string[];
  /** Only the caller's exact subscriptions, never other members' subscriptions. */
  topics: string[];
}
export interface BusSnapshot { publicTopics: string[]; channels: BusChannelSnapshot[] }
export interface BusBatch { messages: BusMessage[]; lost: number }

type BusNoParams = Record<string, never>;
export interface BusMethodMap {
  "bus.advertise": [{ capability: string; version?: number }, null];
  "bus.discover": [{ capability: string }, BusProvider[]];
  "bus.create": [BusNoParams, string];
  "bus.invite": [{ busId: string; pluginId: string }, string];
  "bus.invitations": [BusNoParams, BusInvitation[]];
  "bus.snapshot": [BusNoParams, BusSnapshot];
  "bus.decline": [{ invitationId: string }, null];
  "bus.join": [{ invitationId: string }, string];
  "bus.leave": [{ busId: string }, null];
  "bus.close": [{ busId: string }, null];
  "bus.subscribe": [BusTopic, null];
  "bus.unsubscribe": [BusTopic, null];
  "bus.publish": [BusTopic & { payload?: PluginStorageJson }, { recipients: number }];
  "bus.receive": [BusNoParams, BusBatch];
}
