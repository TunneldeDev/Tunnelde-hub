import type { Listing } from "./contract.mjs";
import type { TransferEvent } from "./transfers.mjs";
import type { FileBrowserObservationRequest, FileBrowserObservation, FileBrowserReadRequest, FileBrowserPage } from "./browser/data.mjs";
import type { FileBrowserAction, FileBrowserActionResult } from "./browser/actions.mjs";

export interface FilesMethodMap {
  "fileBrowser.observe": [FileBrowserObservationRequest, FileBrowserObservation];
  "fileBrowser.read": [FileBrowserReadRequest, FileBrowserPage];
  "fileBrowser.action": [FileBrowserAction, FileBrowserActionResult];
  "files.transferStatus": [{ transferId: string }, TransferEvent | null];
  "files.upload": [
    {
      sessionId: string;
      localPath: string;
      remotePath: string;
      overwrite?: boolean;
    },
    string,
  ];
  "files.download": [
    {
      sessionId: string;
      localPath: string;
      remotePath: string;
      overwrite?: boolean;
    },
    string,
  ];
  "files.cancelTransfer": [{ transferId: string }, boolean];
  "files.local.home": [Record<string, never>, string];
  "files.local.list": [{ path?: string }, Listing];
  "files.local.readText": [{ path: string }, { content: string; size: number }];
  "files.local.writeText": [
    { path: string; content: string; baseline?: string },
    null,
  ];
  "files.local.createFile": [{ path: string }, null];
  "files.local.mkdir": [{ path: string }, null];
  "files.local.rename": [
    { from: string; to: string; overwrite?: boolean },
    null,
  ];
  "files.local.copy": [{ from: string; to: string; overwrite?: boolean }, null];
  "files.local.delete": [{ path: string; isDir: boolean }, null];
  "files.sftp.list": [{ sessionId: string; path?: string }, Listing];
  "files.sftp.resolveDirectory": [
    { sessionId: string; path?: string },
    { home: string; path: string },
  ];
  "files.sftp.readText": [
    { sessionId: string; path: string },
    { content: string; size: number },
  ];
  "files.sftp.writeText": [
    { sessionId: string; path: string; content: string; baseline?: string },
    null,
  ];
  "files.sftp.createFile": [{ sessionId: string; path: string }, null];
  "files.sftp.mkdir": [{ sessionId: string; path: string }, null];
  "files.sftp.rename": [
    { sessionId: string; from: string; to: string; overwrite?: boolean },
    null,
  ];
  "files.sftp.copy": [
    { sessionId: string; from: string; to: string; overwrite?: boolean },
    null,
  ];
  "files.sftp.delete": [
    { sessionId: string; path: string; isDir: boolean },
    null,
  ];
}
