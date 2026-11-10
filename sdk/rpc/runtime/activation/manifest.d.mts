/** Experimental required runtime dependency, declared in tunnelde-plugin.json.
 * Uses Rust semver::VersionReq syntax, not npm union or hyphen range syntax. */
export interface PluginDependency {
  id: string;
  version: string;
}

/** Manifest admission v2 changes required-dependency semantics. RPC remains v1.
 * A v1-only host must reject these packages instead of ignoring dependencies. */
export interface PluginDependencyDeclaration {
  apiVersion: 2;
  dependencies: PluginDependency[];
}
