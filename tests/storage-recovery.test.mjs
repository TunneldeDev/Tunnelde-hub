import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { test } from "node:test";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";
import { createHostStorageRecoveryClient } from "../sdk/storage/recovery/client.mjs";
import { syncRecoveryContracts } from "../scripts/sdk/storage/recovery.mjs";
const categories=["database","plugins","pluginData","keys","runtimes","cache","logs","runners"];
const snapshot=revision=>({version:1,revision,locations:categories.map(category=>({category,path:`C:/数据/${category}`,defaultPath:`/home/${category}`,overridden:false})),pending:{action:"cancel",restartRequested:false,changes:[{category:"keys",target:"/keys",migrate:true}]},recordedCopies:[{category:"keys",kind:"archive",path:"/not-probed"}],hasError:true});
const observed=revision=>({version:1,revision,changed:true,snapshot:snapshot(revision)});
const flush=async()=>{for(let n=0;n<20;n++)await Promise.resolve();};

test("recovery facade types distinguish public metadata and irreversible deferred requests",()=>{
 const program=ts.createProgram([resolve("tests/fixtures/storage-recovery/consumer.mts")],{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,strict:true,noEmit:true,skipLibCheck:false,types:["node"]});
 assert.deepEqual(ts.getPreEmitDiagnostics(program).map(item=>ts.flattenDiagnosticMessageText(item.messageText,"\n")),[]);
});
test("recovery observations snapshot and freeze recorded metadata without probing it",async()=>{
 const raw=observed("r"),calls=[],client=createHostStorageRecoveryClient({call:async(...args)=>{calls.push(args);return raw;}});
 const result=await client.observe();assert.deepEqual(result,raw);assert.equal(calls[0][0],"storage.recovery.observe");
 raw.snapshot.recordedCopies[0].path="/changed";assert.equal(result.snapshot.recordedCopies[0].path,"/not-probed");
 assert.throws(()=>{result.snapshot.pending.changes[0].migrate=false;},TypeError);assert(Object.isFrozen(client));
});
test("malformed requests and accessors cannot invoke transport",async()=>{
 let calls=0;const client=createHostStorageRecoveryClient({call:async()=>{calls++;assert.fail();}});
 for(const bad of [null,[],{revision:null},{revision:undefined},{revision:""},{revision:"\ud800"},{revision:"😀".repeat(33)},{revision:"bad\n"},{id:"private"},{get revision(){assert.fail();}},{[Symbol()]:true}])await assert.rejects(client.observe(bad),/Invalid host storage recovery/);
 for(const bad of [{revision:"r",action:"apply"},{revision:"r",action:"retry",path:"/"},{revision:"r"},{revision:"r",get action(){assert.fail();}}])await assert.rejects(client.request(bad),/Invalid host storage recovery/);
 assert.equal(calls,0);
});
test("requests retain native consent timeout and immutable input with no implicit retry",async()=>{
 let complete;const pending=new Promise(resolve=>{complete=resolve;}),calls=[],input={revision:"r",action:"cancel"};
 const client=createHostStorageRecoveryClient({call:async(...args)=>{calls.push(args);return pending;}});
 const result=client.request(input);input.action="retry";const state=snapshot("new");state.pending.restartRequested=true;
 complete({version:1,outcome:"restartScheduled",snapshot:state});assert.equal((await result).snapshot.pending.action,"cancel");
 assert.deepEqual(calls,[["storage.recovery.request",{revision:"r",action:"cancel"},{timeoutMs:70000}]]);
 let failures=0;const failed=createHostStorageRecoveryClient({call:async()=>{failures++;throw Error("lost reply");}});
 await assert.rejects(failed.request({revision:"r",action:"retry"}),/lost reply/);assert.equal(failures,1);
 const dismissed=createHostStorageRecoveryClient({call:async()=>({version:1,outcome:"dismissed",snapshot:{...snapshot("latest"),pending:null}})});
 assert.equal((await dismissed.request({revision:"old",action:"retry"})).outcome,"dismissed");
});
test("invalid responses cannot claim recovery success, ordered copies or conditional identity",async()=>{
 const invalid=[null,[],{version:1,revision:"r",changed:false}];
 for(const mutate of [s=>s.locations.reverse(),s=>s.locations[0].overridden=true,s=>s.locations[0].path="relative",s=>s.pending.restartRequested="yes",s=>s.pending.action="retry",s=>s.pending.changes.push({...s.pending.changes[0]}),s=>s.hasError=0,s=>s.lastError="private",s=>s.recordedCopies.push({...s.recordedCopies[0]}),s=>s.recordedCopies.unshift({category:"runners",kind:"previous",path:"/x"}),s=>s.recordedCopies[0].path="/bad\n",s=>Object.defineProperty(s.recordedCopies,0,{get(){assert.fail();}})]){const raw=observed("r");mutate(raw.snapshot);invalid.push(raw);}
 for(const raw of invalid)await assert.rejects(createHostStorageRecoveryClient({call:async()=>raw}).observe(),/Invalid host storage recovery/);
 for(const raw of [observed("r"),{version:1,revision:"other",changed:false},{...observed("r"),changed:false}])await assert.rejects(createHostStorageRecoveryClient({call:async()=>raw}).observe({revision:"r"}),/Invalid host storage recovery/);
 for(const mutate of [s=>s.pending=null,s=>s.pending.restartRequested=false,s=>s.pending.action="apply"]){const state=snapshot("r");state.pending.restartRequested=true;mutate(state);await assert.rejects(createHostStorageRecoveryClient({call:async()=>({version:1,outcome:"restartScheduled",snapshot:state})}).request({revision:"r",action:"cancel"}),/Invalid host storage recovery/);}
});
test("owner-bound recovery subscriptions coalesce revisions and abort without further reads",async t=>{
 t.mock.timers.enable({apis:["setTimeout"]});const owner=new AbortController(),received=[],calls=[],replies=[observed("a"),{version:1,revision:"a",changed:false},observed("b")];
 const client=createHostStorageRecoveryClient({call:async(...args)=>{calls.push(args);return replies.shift();}});
 const subscription=client.subscribe(value=>received.push(value.revision),{signal:owner.signal,intervalMs:1000});
 await flush();t.mock.timers.tick(1000);await flush();t.mock.timers.tick(1000);await flush();
 assert.deepEqual(received,["a","b"]);assert.deepEqual(calls[1][1],{revision:"a"});owner.abort();assert.deepEqual(await subscription.done,{reason:"aborted"});
 t.mock.timers.tick(10000);await flush();assert.equal(calls.length,3);
});
test("recovery schema and DTO checks detect drift without rewriting check targets",async()=>{
 const root=await mkdtemp(join(tmpdir(),"tunnelde-recovery-")),app=join(root,"app"),sdk=join(root,"sdk");
 try {const source=join(app,"src/lib/extensions/contracts/storage/recovery"),schema=join(app,"src-tauri/src/plugins/api/domains/storage/recovery");await mkdir(source,{recursive:true});await mkdir(schema,{recursive:true});await writeFile(join(source,"snapshot.ts"),'export interface Snapshot {readonly version:1;}\n');await writeFile(join(schema,"schema.json"),"{}");
 await syncRecoveryContracts(app,sdk,false);await syncRecoveryContracts(app,sdk,true);const target=join(sdk,"storage/recovery/schema.json");await writeFile(target,"outdated");await assert.rejects(syncRecoveryContracts(app,sdk,true),/Recovery schema differs/);assert.equal(await readFile(target,"utf8"),"outdated");
 } finally {await rm(root,{recursive:true,force:true});}
});
test("actual native recovery metadata and deferred publication satisfy the SDK",{skip:!process.env.TUNNELDE_RECOVERY_CONTRACT_OUTPUT},async()=>{
 const fixture=JSON.parse(await readFile(process.env.TUNNELDE_RECOVERY_CONTRACT_OUTPUT,"utf8"));let response=fixture.initial;
 const client=createHostStorageRecoveryClient({call:async()=>response});assert.deepEqual(await client.observe(),fixture.initial);response=fixture.idle;
 assert.deepEqual(await client.observe({revision:fixture.initial.revision}),fixture.idle);response=fixture.scheduled;assert.deepEqual(await client.request(fixture.request),fixture.scheduled);
});
