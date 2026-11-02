import { start } from "./index.mjs";

// All state and secrets are provided through SSH stdio by the desktop bridge.
// The remote runtime writes no configuration or credentials to disk.
start({
  longWaitMethods: ["ui.confirm", "tools.invoke"],
  configureHost: (host) => {
    const remote = {
      ...host,
      remote: true,
      machine: null,
      initialize: async (params) => {
        remote.machine = params.execution ?? null;
      },
    };
    return remote;
  },
});
