import type { FileMenuContribution } from "../files/menu.mjs";

export interface PluginCommand {
  /** Dispatch in the approved frontend module of a combined runtime. */
  frontend?: boolean;
  id: string;
  title: string;
  keybindings?: string[];
  macKeybindings?: string[];
  /** Receive the matching document as input.source; return {text:string}. */
  editor?: { extensions: string[]; format?: boolean };
  /** Offer this command for a user-selected file or directory. */
  fileMenu?: FileMenuContribution;
  /** Offer this command on saved hosts; requires hosts.read. At most 16 per plugin. */
  hostMenu?: boolean;
}
