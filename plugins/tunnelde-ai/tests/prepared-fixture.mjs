import { preparationKey } from "../lib/readiness.mjs";
import { resolveExecution } from "../lib/targets.mjs";

// Transport/approval tests supply a synthetic, already-initialized agent.
// readiness.test.mjs separately exercises real initialization and denial paths.
export async function preparedRuntime(engine) {
  const session = engine.session() ?? engine.newSession();
  const profile = engine.config.profiles.find((item) => item.id === engine.config.activeProfileId);
  const execution = profile.remote && !session.execution ? null :
    await resolveExecution(engine.host, session.execution, engine.config, profile);
  session.execution = execution;
  engine.preparations.set(preparationKey(profile, execution, engine.configRevision), {
    status: "ready", profileId: profile.id, detail: "Test fixture initialized",
  });
}
