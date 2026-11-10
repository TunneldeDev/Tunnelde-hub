import type { Host, HostMethodMap, RunnerState } from "../../../sdk/tunnelde-plugin.mjs";

declare const host: Host;
const target = { sessionId: "ssh", runnerId: "runner" };

function describe(state: RunnerState): string {
  switch (state.status) {
    case "notFound": return "The runner is unavailable; inspect before starting another run";
    case "starting":
    case "running":
    case "stopping":
    case "stopped":
    case "failed":
    case "unresponsive": return state.error ?? state.status;
    default: {
      const exhaustive: never = state.status;
      return exhaustive;
    }
  }
}

const missing: RunnerState = { status: "notFound" };
const review: { reviewed: boolean } = await host.call("runners.review", { ...target, directory: "/tasks/original", kind: "destination" });
void review;
// @ts-expect-error An already known destination cannot be replaced by force.
const invalidReview: HostMethodMap["runners.review"][0] = { ...target, directory: "/tasks/original", kind: "force" };
void invalidReview;
describe(missing);
describe(await host.call("runners.status", target));
describe((await host.call("runners.poll", { ...target, afterSeq: 0 })).state);
// @ts-expect-error Unknown states must not become accepted through a string fallback.
describe({ status: "unknown" });
