import { checkRuntimeResources } from "./sdk/runtime/resources/discovery.mjs";
import { checkActivation } from "./sdk/runtime/activation/discovery.mjs";
import { syncRuntimeResourceContracts } from "./sdk/runtime/resources/contracts.mjs";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkUiContractFiles, loadUiContracts } from "./sdk/ui-contracts.mjs";
import { loadRpcDeclarations } from "./sdk/rpc/declarations.mjs";
import { syncPreferencesContracts } from "./sdk/settings/preferences.mjs";
import { syncEditorContracts } from "./sdk/editor/contracts.mjs";
import { syncConfigurationContracts } from "./sdk/configuration/contracts.mjs";
import { checkConfigurationPoint } from "./sdk/configuration/discovery.mjs";

import { loadRustCatalogue } from "./sdk/catalogue/load.mjs";
export { loadRustCatalogue } from "./sdk/catalogue/load.mjs";
export { parseRustCatalogue } from "./sdk/catalogue/parse.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function checkProviderTypes(types, targets) {
  for (const pattern of [/targets:\s*\(([^)]+)\)\[\]/, /provider\?:\s*([^;]+);/]) {
    const declaration = types.match(pattern)?.[1];
    assert.ok(declaration, "SDK provider target type was not found");
    const names = [...declaration.matchAll(/"([^"\r\n]+)"/g)].map(match => match[1]);
    assert.deepEqual(names, targets, "SDK provider targets differ from host discovery");
  }
}

export function checkMethodTypes(source, catalogue) {
  const composition = source.match(/^export interface HostMethodMap extends ([\w\s,]+)\{\}/m)?.[1];
  const maps = composition ? composition.split(",").map(name => name.trim()) : ["HostMethodMap"];
  assert.equal(new Set(maps).size, maps.length, "Duplicate SDK domain method map");
  if (composition) {
    const declared = [...source.matchAll(/^export interface (\w+MethodMap)\b/gm)].map(match => match[1]);
    assert.deepEqual(declared.sort(), ["HostMethodMap", ...maps].sort(), "Uncomposed or duplicate SDK domain method map");
  }
  const bodies = maps.map(name => {
    assert.match(name, /^\w+MethodMap$/);
    const matches = [...source.matchAll(new RegExp(`^export interface ${name} \\{\\s*$([\\s\\S]*?)^\\}`, "gm"))];
    assert.equal(matches.length, 1, `SDK ${name} was not found or is duplicated`);
    return matches[0][1];
  });
  const body = bodies.join("\n");
  const names = [];
  for (const line of body.split(/\r?\n/)) {
    if (!/^  \S/.test(line) || /^  \];\s*$/.test(line)) continue;
    const match = line.match(/^  (?:"([^"\r\n]+)"|([A-Za-z_$][\w$]*)):\s*\[/);
    assert.ok(match, `Unsupported HostMethodMap entry: ${line.trim()}`);
    names.push(match[1] ?? match[2]);
  }
  assert.equal(new Set(names).size, names.length, "Duplicate SDK method type");
  const actual = new Set(names);
  const expected = new Set(catalogue.methods.map(({ name }) => name));
  const missing = [...expected].filter((name) => !actual.has(name)).sort();
  const extra = [...actual].filter((name) => !expected.has(name)).sort();
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, "SDK method types differ from host catalogue");
}

const workspaceBegin = "// BEGIN GENERATED WORKSPACE V1 TYPES";
const workspaceEnd = "// END GENERATED WORKSPACE V1 TYPES";

function workspaceTypes(source) {
  assert.equal(source.split(workspaceBegin).length, 2, "Missing or duplicate workspace DTO start marker");
  assert.equal(source.split(workspaceEnd).length, 2, "Missing or duplicate workspace DTO end marker");
  const start = source.indexOf(workspaceBegin);
  const end = source.indexOf(workspaceEnd);
  assert.ok(end > start, "Invalid workspace DTO marker order");
  return source.slice(start, end + workspaceEnd.length).replaceAll("\r\n", "\n");
}

/** Stable wire types come from the host projection, never its internal store. */
async function syncWorkspaceTypes(applicationDirectory, sdkSource, catalogue, check) {
  if (!catalogue.methods.some(({ name, stability }) => name === "workspace.snapshot" && stability === "stable"))
    return sdkSource;
  const host = await readFile(join(applicationDirectory, "src/lib/plugins/workspace.ts"), "utf8");
  const expected = workspaceTypes(host);
  assert.match(sdkSource, /"workspace\.snapshot":\s*\[\s*Record<string,\s*never>,\s*PluginWorkspaceSnapshot,?\s*\]/, "Stable workspace.snapshot must return PluginWorkspaceSnapshot");
  if (check) {
    assert.equal(workspaceTypes(sdkSource), expected, "Workspace DTOs differ from the selected host; run npm run sdk:sync");
    return sdkSource;
  }
  if (!sdkSource.includes(workspaceBegin) && !sdkSource.includes(workspaceEnd))
    return sdkSource.replace(/^export interface HostMethodMap \{/m, `${expected}\n\nexport interface HostMethodMap {`);
  const previous = workspaceTypes(sdkSource);
  return sdkSource.replaceAll("\r\n", "\n").replace(previous, expected);
}

export async function syncSdk(applicationDirectory, { check = false, sdkDirectory = join(root, "sdk") } = {}) {
  const source = resolve(applicationDirectory);
  const catalogue = await loadRustCatalogue(source);
  if (catalogue.methods.some(({ name }) => name === "editor.observe"))
    await syncEditorContracts(source, sdkDirectory, check);
  if (catalogue.methods.some(({ name }) => name === "resources.snapshot"))
    await syncRuntimeResourceContracts(source, sdkDirectory, check);
  if (catalogue.methods.some(({name}) => name === "configuration.schema"))
    await syncConfigurationContracts(source,sdkDirectory,check);
  if (catalogue.methods.some(({ name }) => name === "preferences.schema"))
    await syncPreferencesContracts(source, sdkDirectory, check);
  const declarations = await loadRpcDeclarations(sdkDirectory);
  const types = declarations.source;
  let projectedTypes = await syncWorkspaceTypes(source, types, catalogue, check);
  const { version } = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  const json = JSON.stringify(catalogue, null, 2) + "\n";
  const escape = (value) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
  const rows = catalogue.methods.map(
    (method) =>
      `| \`${method.name}\` | ${method.permissions.map((permission) => `\`${permission}\``).join(", ") || "Approved execution"} | \`${escape(method.params)}\` | \`${method.stability}\` | ${method.since ?? ""} | ${method.deprecated ?? ""} | ${escape(method.description)} |`,
  );
  const markdown = `# Host API v1\n\nGenerated from the host method catalogue for Tunnelde ${version}. All calls require an approved executable plugin, including calls without domain permissions. \`host.describe()\` reports the running version. Regenerate with \`npm run sdk:sync -- ../Tunnelde\`.\n\nStability is part of the compatibility contract: \`stable\` methods include their first host version in \`since\`; \`experimental\` methods may evolve; \`deprecated\` methods include migration guidance.\n\n| Method | Permissions | Parameters | Stability | Since | Deprecated | Behavior |\n| --- | --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n`;
  const artifacts = [
    ["api.json", json],
    ["api.md", markdown],
  ];
  // Only advertise UI declarations when the chosen host implements the loader.
  // Older hosts remain valid synchronization targets and do not require this file.
  const extensionPath = join(source, "src-tauri/src/plugins/extensions.json");
  if (catalogue.methods.some(({ name }) => name === "extensions.describe")) {
    const directory = JSON.parse(await readFile(extensionPath, "utf8"));
    await checkActivation(directory, source);
    if (catalogue.methods.some(({ name }) => name === "resources.snapshot")) checkRuntimeResources(directory,catalogue);
    if (directory.frontend) {
      const publicContracts = await loadUiContracts(source);
      const uiTypes = publicContracts.declarations;
      assert.match(uiTypes, /readonly version: "0\.1\.0"/, "Unexpected UI SDK contract version");
      assert.equal(directory.frontend.sdkVersion, "0.1.0", "UI SDK version differs from host discovery");
      if (directory.frontend.providers) {
        const providers = directory.frontend.providers;
        assert.equal(providers.manifest, "views[].provider");
        assert.deepEqual(providers.targets, ["hostList", "workbench", "fileBrowser", "terminal", "history", "forwarding", "monitor", "backgroundTasks", "processes", "quickAccess", "preferences"]);
        assert.deepEqual(providers.fileBrowserPermissions, ["fs.read", "sftp.read", "workspace.write"]);
        assert.deepEqual(providers.terminalPermissions, ["sessions.read", "ssh.exec"]);
        assert.deepEqual(providers.forwardingPermissions, ["hosts.read", "forwards.read"]);
        assert.deepEqual(providers.backgroundTasksPermissions, ["backgroundTasks.read"]);
        assert.equal(providers.backgroundTasks.writePermission, "backgroundTasks.write");
        assert.equal(providers.backgroundTasks.pageSize, 128);
        assert.equal(providers.backgroundTasks.pageTextLimit, 65536);
        assert.equal(directory.frontend.backgroundTasks.pendingLimit, 8);
        assert.equal(directory.frontend.backgroundTasks.cancellation, "cooperative-settlement");
        assert.deepEqual(providers.quickAccessPermissions, ["hosts.read", "sessions.read", "fs.read", "sftp.read", "workspace.read", "editor.read"]);
        assert.deepEqual(providers.preferencesPermissions, ["settings.read"]);
        assert.equal(providers.preferences.optionalSlot, "Fields");
        assert.equal(providers.preferences.writePermission, "settings.write");
        assert.equal(providers.preferences.concurrency, "persistent-revision");
        assert.equal(providers.quickAccess.optionalSlot, "Entries");
        assert.equal(providers.quickAccess.pageSize, 128);
        assert.equal(providers.quickAccess.pageTextLimit, 65536);
        assert.equal(providers.quickAccess.invokePermission, "workspace.write");
        assert.equal(providers.quickAccess.activation, "invoke-only-native-consent");
        assert.deepEqual(providers.processesPermissions, ["sessions.read", "monitor.read"]);
        assert.equal(providers.processes.optionalSlot, "Entries");
        assert.equal(providers.processes.pageSize, 128);
        assert.equal(providers.processes.pageTextLimit, 65536);
        assert.equal(providers.processes.writePermission, "monitor.write");
        assert.equal(providers.processes.termination, "native-confirmation-with-live-authorization-and-identity");
        assert.deepEqual(providers.monitorPermissions, ["sessions.read", "monitor.read"]);
        assert.equal(providers.monitor.ownership, "host-view");
        assert.deepEqual(providers.monitor.presentations, ["page", "panel"]);
        assert.equal(providers.monitor.sampleLimit, 240);
        assert.equal(providers.monitor.pageSize, 128);
        assert.equal(providers.monitor.optionalSlot, "Charts");
        assert.equal(providers.monitor.sampling, "shared-visible-consumers");
        assert.equal(providers.monitor.refresh, "coalesced-existing-sampler");
        assert.equal(providers.forwarding.pageSize, 128);
        assert.equal(providers.forwarding.pageTextLimit, 65536);
        assert.equal(providers.forwarding.optionalSlot, "Entries");
        assert.equal(providers.forwarding.writePermission, "forwards.write");
        assert.equal(providers.forwarding.acceptedOwnership, "plugin-runtime");
        assert.deepEqual(providers.historyPermissions, ["sessions.read", "history.read"]);
        assert.equal(providers.history.pageSize, 128);
        assert.equal(providers.history.pageTextLimit, 65536);
        assert.equal(providers.history.paging, "revision-bound");
        assert.equal(providers.history.writePermission, "history.write");
        assert.equal(providers.history.executePermission, "ssh.exec");
        assert.equal(providers.terminal.pageSize, 128);
        assert.equal(providers.terminal.requiredSlot, "Screen");
        assert.equal(providers.terminal.pageTextLimit, 65536);
        assert.equal(providers.terminal.subscriptions, 16);
        assert.equal(providers.terminal.stream, "coalesced-dirty");
        assert.equal(providers.fileBrowser.pageSize, 256);
        assert.equal(providers.fileBrowser.paging, "revision-bound");
        for (const type of ["FrontendFileBrowser", "FrontendFileBrowserSnapshot", "FrontendFileEntry", "FrontendTerminal", "FrontendTerminalSnapshot", "FrontendTerminalChange", "FrontendHistory", "FrontendHistorySnapshot", "FrontendHistoryEntry", "FrontendForwarding", "FrontendForwardingSnapshot", "FrontendForwardingEntry", "FrontendMonitor", "FrontendMonitorSnapshot", "FrontendMonitorReading", "FrontendMonitorSample", "FrontendBackgroundTaskEntry", "FrontendTaskProgress", "FrontendBackgroundTasks", "FrontendBackgroundTasksSnapshot", "FrontendBackgroundTaskRunner", "FrontendBackgroundTaskOptions", "FrontendBackgroundTaskContext", "FrontendProcessEntry", "FrontendProcessSort", "FrontendProcesses", "FrontendProcessesSnapshot"])
          assert.match(uiTypes, new RegExp(`export interface ${type}\\b`));
        checkProviderTypes(types, providers.targets);
        assert.equal(providers.selection, "explicit-user");
        assert.equal(providers.fallback, "built-in");
        assert.deepEqual(providers.slots, ["Workspace", "Navigation", "Inspector", "StatusBar"]);
        assert.equal(providers.requiredSlot, "Workspace");
        assert.equal(providers.limits.perPlugin, 8);
        for (const slot of providers.slots) assert.match(uiTypes, new RegExp(`${slot}: React.ComponentType`));
      }
      await checkUiContractFiles(sdkDirectory, publicContracts.artifacts);
      artifacts.push(...publicContracts.artifacts);
    }
  }
  if (catalogue.methods.some(({ name }) => name === "extensions.describe")) {
    const extensions = JSON.parse(
      await readFile(
        join(source, "src-tauri/src/plugins/extensions.json"),
        "utf8",
      ),
    );
    assert.equal(
      extensions.version,
      1,
      "Unsupported extension directory version",
    );
    assert.equal(
      extensions.stability,
      "experimental",
      "Extension directory stability changed",
    );
    const ids = new Set();
    if (catalogue.methods.some(method => method.name === "hosts.setSource")) {
      assert.ok(extensions.points.some(point => point.id === "hosts.sources"), "Missing host sources extension point");
      assert.match(projectedTypes, /"hosts\.setSource":\s*\[HostSource,\s*null\]/);
      assert.match(projectedTypes, /"hosts\.removeSource":\s*\[\{\s*id:\s*string\s*\},\s*boolean\]/);
      assert.match(projectedTypes, /"hosts\.sourcesSnapshot":\s*\[\{ offset\?: number; revision\?: number \},\s*HostSourcesPage\]/);
      const begin = "// BEGIN GENERATED HOST SOURCES V1 TYPES", end = "// END GENERATED HOST SOURCES V1 TYPES";
      const block = text => {
        assert.equal(text.split(begin).length, 2, "Missing host sources DTO start");
        assert.equal(text.split(end).length, 2, "Missing host sources DTO end");
        assert.ok(text.indexOf(end) > text.indexOf(begin));
        return text.slice(text.indexOf(begin), text.indexOf(end) + end.length).replaceAll("\r\n", "\n");
      };
      const expected = block(await readFile(join(source, "src/lib/hosts/sources.ts"), "utf8"));
      assert.ok(!expected.includes("@/") && !/\bimport\b/.test(expected), "Host sources expose private types");
      if (check) assert.equal(block(projectedTypes), expected, "Host source DTOs differ; run npm run sdk:sync");
      else if (!projectedTypes.includes(begin) && !projectedTypes.includes(end)) projectedTypes = projectedTypes.replace(/^export interface HostMethodMap \{/m, `${expected}\n\nexport interface HostMethodMap {`);
      else projectedTypes = projectedTypes.replaceAll("\r\n", "\n").replace(block(projectedTypes), expected);
    }
    if (catalogue.methods.some(method => method.name === "hostList.setColumn")) {
      assert.ok(extensions.points.some(point => point.id === "hostList.columns"), "Missing host columns extension point");
      assert.match(projectedTypes, /"hostList\.setColumn":\s*\[HostColumn,\s*null\]/, "hostList.setColumn must accept HostColumn and return null");
      assert.match(projectedTypes, /"hostList\.removeColumn":\s*\[\{\s*id:\s*string\s*\},\s*boolean\]/, "hostList.removeColumn must return boolean");
      const begin = "// BEGIN GENERATED HOST COLUMNS V1 TYPES", end = "// END GENERATED HOST COLUMNS V1 TYPES";
      const block = text => {
        assert.equal(text.split(begin).length, 2, "Missing or duplicate host columns DTO start");
        assert.equal(text.split(end).length, 2, "Missing or duplicate host columns DTO end");
        assert.ok(text.indexOf(end) > text.indexOf(begin), "Invalid host columns DTO marker order");
        return text.slice(text.indexOf(begin), text.indexOf(end) + end.length).replaceAll("\r\n", "\n");
      };
      const expected=block(await readFile(join(source,"src/lib/hosts/columns.ts"),"utf8"));
      assert.ok(!expected.includes("@/")&&!/\bimport\b/.test(expected),"Host columns DTO exposes private types");
      if(check)assert.equal(block(projectedTypes),expected,"Host columns DTOs differ; run npm run sdk:sync");
      else if(!projectedTypes.includes(begin)&&!projectedTypes.includes(end))projectedTypes=projectedTypes.replace(/^export interface HostMethodMap \{/m,`${expected}\n\nexport interface HostMethodMap {`);
      else projectedTypes=projectedTypes.replaceAll("\r\n","\n").replace(block(projectedTypes),expected);
    }
    for (const point of extensions.points) {
      assert.ok(!ids.has(point.id), `Duplicate extension point: ${point.id}`);
      ids.add(point.id);
      if (point.registration.manifest !== undefined) {
        if (point.id === "hosts.fields") {
          assert.equal(point.registration.manifest, "hostFields");
          assert.equal(point.ownership, "manifest");
          assert.equal(point.stability, "experimental");
          assert.equal(point.concurrency, "revision-and-schema-digest");
          for (const [key, permissions] of [["read",point.permissions],["replace",point.writePermissions]]) {
            const method = catalogue.methods.find(method => method.name === point.registration[key]);
            assert.ok(method, `Missing host field method: ${key}`);
            assert.deepEqual(method.permissions, permissions);
            assert.equal(method.stability, "experimental");
          }
          const begin = "// BEGIN GENERATED HOST FIELDS V1 TYPES", end = "// END GENERATED HOST FIELDS V1 TYPES";
          const block = (text) => {
            assert.equal(text.split(begin).length,2,"Missing or duplicate host fields DTO start");
            assert.equal(text.split(end).length,2,"Missing or duplicate host fields DTO end");
            assert.ok(text.indexOf(end) > text.indexOf(begin));
            return text.slice(text.indexOf(begin),text.indexOf(end)+end.length).replaceAll("\r\n","\n");
          };
          const expected = block(await readFile(join(source,"src/lib/hosts/fields.ts"),"utf8"));
          assert.ok(!expected.includes("@/") && !/\bimport\b/.test(expected),"Host fields DTO exposes private types");
          if (check) assert.equal(block(projectedTypes),expected,"Host fields DTOs differ; run npm run sdk:sync");
          else if (!projectedTypes.includes(begin) && !projectedTypes.includes(end)) projectedTypes = projectedTypes.replace(/^export interface HostMethodMap \{/m, `${expected}\n\nexport interface HostMethodMap {`);
          else projectedTypes = projectedTypes.replaceAll("\r\n","\n").replace(block(projectedTypes),expected);
          continue;
        }
        if (point.id === "plugin.configuration") {checkConfigurationPoint(point,catalogue);continue;}
        assert.equal(point.id, "hostList.menu", "Unknown manifest extension point");
        assert.equal(point.registration.manifest, "commands[].hostMenu");
        assert.deepEqual(Object.keys(point.registration), ["manifest"]);
        assert.equal(point.stability, "experimental");
        assert.equal(point.ownership, "manifest");
        assert.deepEqual(point.permissions, ["hosts.read"]);
        assert.deepEqual(point.limits, { perPlugin: 16, total: 128 });
        const begin = "// BEGIN GENERATED HOST MENU V1 TYPES";
        const end = "// END GENERATED HOST MENU V1 TYPES";
        const block = (text) => {
          assert.equal(text.split(begin).length, 2, "Missing or duplicate host menu DTO start");
          assert.equal(text.split(end).length, 2, "Missing or duplicate host menu DTO end");
          assert.ok(text.indexOf(end) > text.indexOf(begin), "Invalid host menu DTO order");
          return text.slice(text.indexOf(begin), text.indexOf(end) + end.length).replaceAll("\r\n", "\n");
        };
        const expected = block(await readFile(join(source, "src/lib/plugins/hostMenu.ts"), "utf8"));
        assert.ok(!expected.includes("@/") && !/\bimport\b/.test(expected), "Host menu DTO exposes private types");
        if (check) {
          assert.equal(block(projectedTypes), expected, "Host menu DTOs differ; run npm run sdk:sync");
        } else if (!projectedTypes.includes(begin) && !projectedTypes.includes(end)) {
          projectedTypes = projectedTypes.replace(/^export interface HostMethodMap \{/m, `${expected}\n\nexport interface HostMethodMap {`);
        } else {
          projectedTypes = projectedTypes.replaceAll("\r\n", "\n").replace(block(projectedTypes), expected);
        }
        continue;
      }
      for (const [action, name] of Object.entries(point.registration)) {
        const method = catalogue.methods.find((method) => method.name === name);
        assert.ok(method, `Unknown registration method: ${name}`);
        assert.deepEqual(
          method.permissions,
          action === "read" ? (point.readPermissions ?? point.permissions) : point.permissions,
          `Extension permissions differ: ${point.id}`,
        );
        assert.equal(
          method.stability,
          point.stability,
          `Extension stability differs: ${point.id}`,
        );
      }
    }
    artifacts.push([
      "extensions.json",
      JSON.stringify(extensions, null, 2) + "\n",
    ]);
  }
  if (!check && projectedTypes !== types) artifacts.push(...declarations.project(projectedTypes));
  for (const [name, expected] of artifacts) {
    const path = join(sdkDirectory, name);
    if (check) {
      assert.ok(
        (await readFile(path, "utf8")) === expected,
        `${name} differs from the selected host; run npm run sdk:sync`,
      );
    } else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, expected);
    }
  }
  if (check) {
    checkMethodTypes(types, catalogue);
  }
  return catalogue;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const catalogue = await syncSdk(resolve(root, args.find((arg) => arg !== "--check") ?? "../Tunnelde"), { check });
  console.log(`${check ? "Checked" : "Synchronized"} ${catalogue.methods.length} host API methods.`);
}
