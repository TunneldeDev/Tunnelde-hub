import type { FrontendContext, UiResourceScope } from "../../../sdk/tunnelde-ui.mjs";
import type { UiChildResourceOptions } from "../../../sdk/ui/runtime/resources.mjs";

declare const context: FrontendContext;
const options: UiChildResourceOptions = { limit: 8, signal: new AbortController().signal };
const child: UiResourceScope | undefined = context.resources.child?.(options);
if (child) {
  const value: string = await child.run(async (signal) => signal.aborted ? "closed" : "ready");
  void value;
  child.use(() => Promise.resolve());
  const nested: UiResourceScope | undefined = child.child?.({ limit: 1 });
  nested?.dispose();
  child.dispose();
}
// Historical structural scope implementations need not add the optional method.
const older: UiResourceScope = {
  signal: new AbortController().signal,
  size: 0,
  use: () => () => {},
  acquire: async (start) => start(new AbortController().signal),
  run: async (start) => start(new AbortController().signal),
  dispose: () => {},
};
void older;
// @ts-expect-error Limits have a numeric contract, not an auto or string sentinel.
const invalid: UiChildResourceOptions = { limit: "8" };
void invalid;
