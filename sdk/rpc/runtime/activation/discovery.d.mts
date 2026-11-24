export interface ActivationDiscovery {
  stability: "experimental";
  manifest: "dependencies";
  manifestApiVersion: 2;
  rpcApiVersion: 1;
  declaration: "required-installed-runtime";
  ordering: "dependencies-first";
  preflight: "whole-graph-before-engines";
  approval: "per-package-fingerprint-and-generation";
  sharing: "per-runtime-with-independent-waiters";
  retirement: "reverse-dependents";
  readyDependencies: "retained-after-root-failure";
  automaticInstallation: false;
  limits: {
    catalogue: number; dependencies: number; packages: number; edges: number;
    depth: number; rangeBytes: number; requests: number; blockingWorkers: number;
    preflightTimeoutMs: number;
  };
}
