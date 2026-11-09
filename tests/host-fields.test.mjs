import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateManifest } from "../scripts/validate.mjs";
import { syncSdk } from "../scripts/sync-sdk.mjs";

const manifest = {
  id:"host-metadata",name:"Host metadata",description:"Optional metadata",author:"Example",version:"1.0.0",apiVersion:1,
  runtime:"node",main:"index.mjs",readme:"README.md",permissions:["hosts.read"],
  hostFields:{version:1,fields:[
    {id:"owner",label:"Owner",type:"text",maxLength:120},
    {id:"cost",label:"Cost",type:"number",minimum:0,maximum:100},
    {id:"managed",label:"Managed",type:"boolean"},
    {id:"tier",label:"Tier",type:"select",options:[{value:"prod",label:"Production"},{value:"dev",label:"Development"}]},
  ]},
};

test("host field schemas validate all scalar types, bounds and Unicode lengths", () => {
  validateManifest(manifest,manifest.id);
  const unicode = structuredClone(manifest); unicode.hostFields.fields[0].label="😀".repeat(120);
  validateManifest(unicode,unicode.id);
  for (const mutate of [
    m => {m.permissions=[];},
    m => {m.hostFields.version=0;},
    m => {m.hostFields.extra=true;},
    m => {m.hostFields.fields=[];},
    m => {m.hostFields.fields=Array.from({length:33},(_,n)=>({id:`f${n}`,label:"Field",type:"text"}));},
    m => {m.hostFields.fields[0].id="space id";},
    m => {m.hostFields.fields[1].id="owner";},
    m => {m.hostFields.fields[0].label="😀".repeat(121);},
    m => {m.hostFields.fields[0].label="\u202espoof";},
    m => {m.hostFields.fields[0].label="\ufeff";},
    m => {m.hostFields.fields[0].secret=true;},
    m => {m.hostFields.fields[0].maxLength=4097;},
    m => {m.hostFields.fields[0].minimum=0;},
    m => {m.hostFields.fields[1].maximum=-1;},
    m => {m.hostFields.fields[1].maximum=Infinity;},
    m => {m.hostFields.fields[2].type="password";},
    m => {m.hostFields.fields[2].options=null;},
    m => {m.hostFields.fields[3].options=[];},
    m => {m.hostFields.fields[3].options[1].value="prod";},
    m => {m.hostFields.fields[3].options[0].extra=true;},
  ]) {
    const bad=structuredClone(manifest);mutate(bad);assert.throws(()=>validateManifest(bad,bad.id));
  }
});

test("host fields synchronize independent DTOs and reject stale types or permissions", async () => {
  const root=await mkdtemp(join(tmpdir(),"tunnelde-host-fields-"));
  const app=join(root,"app"),sdk=join(root,"sdk"),native=join(app,"src-tauri/src/plugins");
  try {
    await mkdir(native,{recursive:true});await mkdir(sdk);await mkdir(join(app,"src/lib/hosts"),{recursive:true});
    await writeFile(join(app,"package.json"),'{"version":"0.34.0"}');
    await writeFile(join(native,"api.rs"),'pub const METHODS: &[ApiMethod] = &[\n method!("extensions.describe", [], "{}", "Describe."),\n method!("hosts.getFields", ["hosts.read"], "{}", "Get."),\n method!("hosts.setFields", ["hosts.read", "hosts.write"], "{}", "Set."),\n];');
    await writeFile(join(sdk,"tunnelde-plugin.d.mts"),'export interface HostMethodMap {\n  "extensions.describe": [Record<string, never>, unknown];\n  "hosts.getFields": [unknown, unknown];\n  "hosts.setFields": [unknown, unknown];\n}\n');
    const point={id:"hosts.fields",stability:"experimental",ownership:"manifest",permissions:["hosts.read"],writePermissions:["hosts.read","hosts.write"],registration:{manifest:"hostFields",read:"hosts.getFields",replace:"hosts.setFields"},concurrency:"revision-and-schema-digest"};
    await writeFile(join(native,"extensions.json"),JSON.stringify({version:1,stability:"experimental",points:[point]}));
    const contract='// BEGIN GENERATED HOST FIELDS V1 TYPES\nexport interface HostFieldsSchema { version: number }\n// END GENERATED HOST FIELDS V1 TYPES';
    await writeFile(join(app,"src/lib/hosts/fields.ts"),contract);
    await syncSdk(app,{sdkDirectory:sdk});await syncSdk(app,{sdkDirectory:sdk,check:true});
    const types=await readFile(join(sdk,"tunnelde-plugin.d.mts"),"utf8");
    assert.ok(types.includes(contract));
    await writeFile(join(sdk,"tunnelde-plugin.d.mts"),types.replace('version: number','version: string'));
    await assert.rejects(syncSdk(app,{sdkDirectory:sdk,check:true}),/Host fields DTOs differ/);
    point.writePermissions=[];
    await writeFile(join(native,"extensions.json"),JSON.stringify({version:1,stability:"experimental",points:[point]}));
    await assert.rejects(syncSdk(app,{sdkDirectory:sdk}),/deep-equal/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test("the frontend example uses the selected host and one revision-checked replacement", async () => {
  const example = JSON.parse(await readFile(new URL("../examples/host-metadata/tunnelde-plugin.json",import.meta.url),"utf8"));
  validateManifest(example,example.id);
  const {activate}=await import("../examples/host-metadata/ui/index.mjs");
  const commands=new Map(),calls=[];
  let conflict=false;
  activate({commands:{register(id,handler){commands.set(id,handler);}},api:{async call(method,params){
    calls.push({method,params});
    if(method==="hosts.getFields")return{document:{revision:4,schemaDigest:"digest",schemaChanged:false,values:{owner:"Team",managed:false}}};
    if(conflict)throw new Error("hostFields.conflict");
    return {document:{values:params.values}};
  }}});
  assert.deepEqual(await commands.get("toggle-managed")({host:{id:"selected",name:"Selected"}}),{text:"Selected: managed = true"});
  assert.deepEqual(calls,[{method:"hosts.getFields",params:{hostId:"selected"}},{method:"hosts.setFields",params:{hostId:"selected",expectedRevision:4,schemaDigest:"digest",values:{owner:"Team",managed:true}}}]);
  calls.length=0;conflict=true;
  await assert.rejects(commands.get("toggle-managed")({host:{id:"selected",name:"Selected"}}),/hostFields.conflict/);
  assert.equal(calls.length,2);
});
