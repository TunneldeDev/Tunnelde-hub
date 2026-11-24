import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncSdk } from "../scripts/sync-sdk.mjs";

test("host column DTO and extension checks reject stale types, missing permissions and invalid markers", async () => {
  const root=await mkdtemp(join(tmpdir(),"tunnelde-host-columns-"));
  const app=join(root,"app"),sdk=join(root,"sdk"),native=join(app,"src-tauri/src/plugins");
  try {
    await mkdir(native,{recursive:true});await mkdir(sdk);await mkdir(join(app,"src/lib/hosts"),{recursive:true});
    await writeFile(join(app,"package.json"),'{"version":"0.34.0"}');
    await writeFile(join(native,"api.rs"),'pub const METHODS: &[ApiMethod] = &[\n method!("extensions.describe", [], "{}", "Describe."),\n method!("hostList.setColumn", ["hosts.read", "workspace.write"], "{}", "Set."),\n method!("hostList.removeColumn", ["hosts.read", "workspace.write"], "{}", "Remove."),\n];');
    const types='export interface HostMethodMap {\n  "extensions.describe": [Record<string, never>, unknown];\n  "hostList.setColumn": [HostColumn, null];\n  "hostList.removeColumn": [{ id: string }, boolean];\n}\n';
    const path=join(sdk,"tunnelde-plugin.d.mts"),dto=join(app,"src/lib/hosts/columns.ts");
    const point={id:"hostList.columns",stability:"experimental",ownership:"runtime",permissions:["hosts.read","workspace.write"],registration:{set:"hostList.setColumn",remove:"hostList.removeColumn"}};
    const extension=()=>writeFile(join(native,"extensions.json"),JSON.stringify({version:1,stability:"experimental",points:[point]}));
    await extension();await writeFile(path,types);
    const contract='// BEGIN GENERATED HOST COLUMNS V1 TYPES\nexport interface HostColumn { label: string }\n// END GENERATED HOST COLUMNS V1 TYPES';
    await writeFile(dto,contract+'\nexport function privateImplementation() {}');
    await syncSdk(app,{sdkDirectory:sdk});await syncSdk(app,{sdkDirectory:sdk,check:true});
    const expected=await readFile(path,"utf8");assert(expected.includes(contract));assert(!expected.includes('privateImplementation'));
    for(const bad of [expected.replace('label: string','label: number'),expected.replace('HostColumn, null','unknown, null'),expected.replace('}, boolean','}, unknown')]){
      await writeFile(path,bad);await assert.rejects(syncSdk(app,{sdkDirectory:sdk,check:true}),/Host columns DTOs differ|must accept|must return/);
      assert.equal(await readFile(path,"utf8"),bad);
    }
    await writeFile(path,expected);
    for(const bad of [contract.replace('END GENERATED','BROKEN'),contract+'\n'+contract,contract.replace('label: string','label: import("@/internal").Secret')]){
      await writeFile(dto,bad);await assert.rejects(syncSdk(app,{sdkDirectory:sdk}),/DTO|private types/);assert.equal(await readFile(path,"utf8"),expected);
    }
    await writeFile(dto,contract);point.permissions=[];await extension();
    await assert.rejects(syncSdk(app,{sdkDirectory:sdk}),/Extension permissions differ/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test("host metadata example publishes zero and unset values for the selected host without starting Node",async()=>{
  const {activate}=await import("../examples/host-metadata/ui/index.mjs");
  const commands=new Map(),calls=[];let values={cost:0};
  activate({commands:{register:(id,handler)=>commands.set(id,handler)},api:{async call(method,params){calls.push({method,params});return method==="hosts.getFields"?{document:{values}}:null;}}});
  await commands.get("show-budget-column")({host:{id:"selected"}});
  assert.deepEqual(calls.at(-1),{method:"hostList.setColumn",params:{id:"budget",label:"Monthly budget",type:"number",width:140,cells:[{hostId:"selected",value:0}]}});
  values={};await commands.get("show-budget-column")({host:{id:"selected"}});
  assert.deepEqual(calls.at(-1).params.cells,[]);
});
