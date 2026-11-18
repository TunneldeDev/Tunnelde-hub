import { setTimeout as delay } from "node:timers/promises";

const readers = new WeakMap();
const LIMIT = 16;

/** Share the runtime's single receive slot among local observers. */
export function watchBus(host, receive, { signal } = {}) {
  if (typeof receive !== "function") throw new TypeError("Bus observer must be a function");
  if (!signal || typeof signal.aborted !== "boolean" ||
      typeof signal.addEventListener !== "function" || typeof signal.removeEventListener !== "function")
    throw new TypeError("Bus observation requires an owner AbortSignal");
  if (signal.aborted) return Object.freeze({
    stop() {}, closed: true, done: Promise.resolve(Object.freeze({ reason: "aborted" })),
  });
  let reader = readers.get(host);
  if (!reader) {
    reader = { observers: new Set(), controller: null, restarting: false };
    readers.set(host, reader);
  }
  if (reader.observers.size >= LIMIT) throw new Error("Too many bus observers");
  let active = true;
  let settle;
  const done = new Promise(resolve => { settle = resolve; });
  const observer = { receive, finish, delivery: null };
  function finish(result) {
    if (!active) return;
    active = false;
    signal.removeEventListener("abort", abort);
    reader.observers.delete(observer);
    if (!reader.observers.size) reader.controller?.abort();
    if (observer.delivery) void observer.delivery.finally(() => settle(Object.freeze(result)));
    else settle(Object.freeze(result));
  }
  const abort = () => finish({ reason: "aborted" });
  reader.observers.add(observer);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  start(host, reader);
  return Object.freeze({ stop: () => finish({ reason: "stopped" }), done, get closed() { return !active; } });
}

function start(host, reader) {
  if (reader.controller || !reader.observers.size) return;
  const controller = new AbortController();
  reader.controller = controller;
  const retryDelays = reader.restarting ? [20, 80, 200] : [];
  reader.restarting = false;
  void Promise.resolve().then(async () => {
    try {
      while (!controller.signal.aborted) {
        let batch;
        try {
          batch = await host.call("bus.receive", {}, { signal: controller.signal, timeoutMs: 20000 });
          retryDelays.length = 0;
        } catch (error) {
          // Stdio cancellation settles locally before the host drops the old receive lease.
          if (error?.message !== "plugin.bus.receiveBusy" || !retryDelays.length) throw error;
          await delay(retryDelays.shift(), undefined, { signal: controller.signal });
          continue;
        }
        if (controller.signal.aborted) break;
        if (!batch.lost && !batch.messages.length) continue;
        // Give each handler its own payload and bound queued work to one batch.
        await Promise.all([...reader.observers].map(observer => {
          const delivery = Promise.resolve().then(async () => {
            if (reader.observers.has(observer)) await observer.receive(structuredClone(batch));
          }).catch(error => observer.finish({ reason: "failed", error }))
            .finally(() => { observer.delivery = null; });
          observer.delivery = delivery;
          return delivery;
        }));
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        for (const observer of [...reader.observers]) observer.finish({ reason: "failed", error });
      }
    } finally {
      reader.controller = null;
      if (controller.signal.aborted) reader.restarting = true;
      if (reader.observers.size) start(host, reader);
    }
  });
}
