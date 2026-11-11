import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createHostStorageClient } from "../sdk/storage/locations/client.mjs";
import { syncLocationContracts } from "../scripts/sdk/storage/locations.mjs";
import ts from "typescript";
import { resolve } from "node:path";

test("location facade narrows immutable DTOs and independent metadata methods",()=>{
  const program=ts.createProgram([resolve("tests/fixtures/storage-locations/consumer.mts")],{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,
    strict:true,noEmit:true,skipLibCheck:false,types:["node"],
  });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(item=>ts.flattenDiagnosticMessageText(item.messageText,"\n")),[]);
});

const categories = ["database", "plugins", "pluginData", "keys", "runtimes", "cache", "logs", "runners"];
const snapshot = revision => ({ version:1, revision, locations:categories.map(category => ({ category, path:`C:/数据/${category}`, defaultPath:`/home/data/${category}`, overridden:false })), pending:null, recoveryRequired:false });
const observed = revision => ({ version:1, revision, changed:true, snapshot:snapshot(revision) });
const plan = () => ({ revision:"before", changes:[{ category:"keys", target:"/new/keys", migrate:true }] });
const flush = async () => { for (let n=0;n<20;n++) await Promise.resolve(); };

test("location observations validate and deeply freeze metadata without granting contents", async () => {
  const raw = observed("r"), client = createHostStorageClient({ call:async (method, args) => { assert.equal(method,"storage.locations.observe"); assert.deepEqual(args,{}); return raw; } });
  const result = await client.observe(); assert.deepEqual(result,raw);
  raw.snapshot.locations[0].path="/changed";
  assert.equal(result.snapshot.locations[0].path,"C:/数据/database");
  assert.throws(() => { result.snapshot.locations[0].path="/forged"; }, TypeError);
  assert(Object.isFrozen(client) && Object.isFrozen(result.snapshot.locations));
});

test("malformed selectors and plans never invoke transport or request accessors", async () => {
  let calls=0;
  const client=createHostStorageClient({call:async()=>{calls++;assert.fail();}});
  for(const bad of [null,[],{revision:null},{revision:undefined},{revision:""},{revision:"😀".repeat(33)},
    {revision:"\ud800"},{revision:"bad\n"},{path:"/"},{get revision(){assert.fail();}}, {[Symbol()]:true}])
    await assert.rejects(client.observe(bad),/Invalid host storage/);
  for(const mutate of [p=>p.changes=[],p=>p.changes[0].target="relative",p=>p.changes[0].target="/bad\n",
    p=>p.changes[0].target="/"+"x".repeat(4096),p=>p.changes[0].migrate=null,
    p=>p.changes.push({...p.changes[0]}),p=>p.changes[0].category="unknown",p=>p.changes[0].extra=true,
    p=>Object.defineProperty(p.changes,0,{get(){assert.fail();}})]){
    const input=plan();mutate(input);await assert.rejects(client.schedule(input),/Invalid host storage/);
  }
  await assert.rejects(client.cancel({revision:"a",id:"other"}),/Invalid host storage/);
  assert.equal(calls,0);
});

test("native mutations snapshot caller inputs and allow the full confirmation deadline", async () => {
  let resolve;const pending=new Promise(done=>{resolve=done;});
  const calls=[],client=createHostStorageClient({call:async(...args)=>{calls.push(args);return pending;}});
  const input=plan(),result=client.schedule(input);input.changes[0].target="/later";
  const state=snapshot("new");state.pending={changes:plan().changes};resolve({version:1,outcome:"scheduled",snapshot:state});
  assert.equal((await result).outcome,"scheduled");
  assert.deepEqual(calls,[["storage.locations.schedule",plan(),{timeoutMs:70000}]]);
  assert(Object.isFrozen(calls[0][1].changes[0]));
  const dismiss=createHostStorageClient({call:async()=>({version:1,outcome:"dismissed",snapshot:snapshot("latest")})});
  assert.equal((await dismiss.cancel({revision:"old"})).snapshot.revision,"latest");
});

test("invalid responses cannot masquerade as successful migrations or conditional reads", async () => {
  const invalid=[null,[],{...observed("r"),changed:0},{...observed("r"),revision:"other"},
    {version:1,revision:"r",changed:false}];
  for(const mutate of [s=>s.locations.reverse(),s=>s.locations.pop(),s=>s.locations[0].path="relative",
    s=>s.locations[0].overridden=true,s=>s.pending={changes:[]},s=>s.recoveryRequired=0,s=>s.id="private"]){
    const raw=observed("r");mutate(raw.snapshot);invalid.push(raw);
  }
  for(const raw of invalid)await assert.rejects(createHostStorageClient({call:async()=>raw}).observe(),/Invalid host storage/);
  for(const raw of [{...observed("r"),changed:false},observed("r"),{version:1,revision:"other",changed:false}])
    await assert.rejects(createHostStorageClient({call:async()=>raw}).observe({revision:"r"}),/Invalid host storage/);
  await assert.rejects(createHostStorageClient({call:async()=>({version:1,outcome:"scheduled",snapshot:snapshot("r")})}).schedule(plan()),/Invalid host storage/);
});

test("location subscriptions serialize changes and abort through the owner signal",async t=>{
  t.mock.timers.enable({apis:["setTimeout"]});const owner=new AbortController(),calls=[],received=[];
  const replies=[observed("a"),{version:1,revision:"a",changed:false},observed("b")];
  const client=createHostStorageClient({call:async(...args)=>{calls.push(args);return replies.shift();}});
  const sub=client.subscribe(value=>received.push(value.revision),{signal:owner.signal,intervalMs:1000});
  await flush();t.mock.timers.tick(1000);await flush();t.mock.timers.tick(1000);await flush();
  assert.deepEqual(received,["a","b"]);assert.deepEqual(calls[1][1],{revision:"a"});
  owner.abort();assert.deepEqual(await sub.done,{reason:"aborted"});assert(sub.closed);
  t.mock.timers.tick(10000);await flush();assert.equal(calls.length,3);
});

test("location DTO/schema mirroring detects drift without repairing check mode",async()=>{
  const {mkdtemp,mkdir,writeFile,rm}=await import("node:fs/promises");
  const {tmpdir}=await import("node:os");const {join}=await import("node:path");
  const root=await mkdtemp(join(tmpdir(),"tunnelde-locations-")),app=join(root,"app"),sdk=join(root,"sdk");
  try{
    const source=join(app,"src/lib/extensions/contracts/storage/locations");await mkdir(source,{recursive:true});
    await writeFile(join(source,"snapshot.ts"),"export interface HostStorageSnapshot { readonly version:1; }\n");
    const schema=join(app,"src-tauri/src/plugins/api/domains/storage/locations");await mkdir(schema,{recursive:true});await writeFile(join(schema,"schema.json"),"{}");
    await syncLocationContracts(app,sdk,false);await syncLocationContracts(app,sdk,true);
    const target=join(sdk,"storage/locations/schema.json");await writeFile(target,"outdated");
    await assert.rejects(syncLocationContracts(app,sdk,true),/Location schema differs/);assert.equal(await readFile(target,"utf8"),"outdated");
  }finally{await rm(root,{recursive:true,force:true});}
});

test("actual native location producer satisfies the SDK",{skip:!process.env.TUNNELDE_LOCATION_CONTRACT_OUTPUT},async()=>{
  const fixture=JSON.parse(await readFile(process.env.TUNNELDE_LOCATION_CONTRACT_OUTPUT,"utf8"));
  let response=fixture.initial;const client=createHostStorageClient({call:async()=>response});
  assert.deepEqual(await client.observe(),fixture.initial);response=fixture.idle;
  assert.deepEqual(await client.observe({revision:fixture.initial.revision}),fixture.idle);
  response=fixture.scheduled;assert.deepEqual(await client.schedule(fixture.scheduleRequest),fixture.scheduled);
  response=fixture.cancelled;assert.deepEqual(await client.cancel(fixture.cancelRequest),fixture.cancelled);
});
