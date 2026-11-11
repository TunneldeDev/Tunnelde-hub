import { createFileBrowserClient } from "../../../sdk/files/browser/client.mjs";
import type { Host, FileBrowserCatalogue, FileBrowserReadRequest } from "../../../sdk/tunnelde-plugin.mjs";
declare const host: Host;
const client = createFileBrowserClient(host);
const owner = new AbortController();
const subscription = client.subscribe((catalogue: FileBrowserCatalogue) => {
  for (const browser of catalogue.items) void client.read({ paneId: browser.paneId, revision: browser.revision });
}, { signal: owner.signal, limit: 16 });
subscription.stop();
const request: FileBrowserReadRequest = { paneId: "pane", revision: "frame" };
void host.call("fileBrowser.read", request);
void client.action({ paneId: "pane", revision: "frame", action: "open", path: "/a", mode: "preview" });
// @ts-expect-error An action is bound to a revision.
void client.action({ paneId: "pane", action: "refresh" });
// @ts-expect-error No raw file mutation in the live browser domain.
void client.action({ paneId: "pane", revision: "frame", action: "delete", path: "/a" });
