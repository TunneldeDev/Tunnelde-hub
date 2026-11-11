import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createFileContentClient } from "../sdk/files/content/client.mjs";
import { bytes, observation } from "../sdk/files/content/data/reply.mjs";

const input={source:{kind:"local"},path:"/isolated/content.bin"};
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return{promise,resolve}};
function fixture(intercept=()=>undefined) {
  const calls=[],entries=new Map(),data=Uint8Array.from({length:100000},(_,i)=>i%251);
  const host={async call(method,params,options) {
    calls.push({method,params,options});
    const custom=intercept(method,params,options);
    if(custom!==undefined)return custom;
    const entry=entries.get(params.contentId);
    switch(method) {
      case "files.content.prepare": {
        const contentId=randomUUID();entries.set(contentId,{state:"prepared"});return{version:1,contentId,leaseMs:20000};
      }
      case "files.content.open":
        assert(entry&&entry.state==="prepared");entry.state="open";
        return{version:1,contentId:params.contentId,state:"open",size:data.length,chunkBytes:49152,leaseMs:60000};
      case "files.content.read":{
        assert.equal(entry?.state,"open");const result=data.slice(params.offset,params.offset+params.length);
        return{version:1,contentId:params.contentId,offset:params.offset,bytes:result.length,data:Buffer.from(result).toString("base64"),eof:params.offset+result.length>=data.length};
      }
      case "files.content.observe":return{version:1,contentId:params.contentId,state:entry?entry.state:"closed",size:entry?.state==="open"?data.length:null,chunkBytes:49152,leaseMs:entry?60000:0};
      case "files.content.close":entries.delete(params.contentId);return{version:1,closed:true};
      default:throw Error(method);
    }
  }};
  return{host,calls,entries,data,client:createFileContentClient(host)};
}

test("prepare precedes IO; binary ranges validate, clamp at EOF and close once",async()=>{
  const f=fixture(),owner=new AbortController();const handle=await f.client.open(input,{signal:owner.signal});
  assert.deepEqual(f.calls.slice(0,2).map(v=>v.method),["files.content.prepare","files.content.open"]);
  assert.equal(handle.size,100000);assert.deepEqual(await handle.read({offset:3,length:49152}),f.data.slice(3,49155));
  assert.deepEqual(await handle.read({offset:99997,length:10}),f.data.slice(99997));
  assert.deepEqual(await handle.read({offset:100000,length:1}),new Uint8Array());
  assert.equal((await handle.observe()).state,"open");
  await Promise.all([handle.close(),handle.close()]);assert(handle.closed);assert.equal(f.entries.size,0);
  assert.equal(f.calls.filter(v=>v.method==="files.content.close").length,1);
  await assert.rejects(handle.read({offset:0,length:1}),/closed/);
});
test("explicit endpoints and an owner are mandatory before transport",async()=>{
  const f=fixture();
  for(const bad of [{path:"/x"},{source:{kind:"remote"},path:"/x"},{source:{kind:"local"},path:"relative"},{...input,owner:"other"},{source:{kind:"local",sessionId:"hidden"},path:"/x"}])
    await assert.rejects(f.client.open(bad,{signal:new AbortController().signal}));
  await assert.rejects(f.client.open(input),/owner/);assert.equal(f.calls.length,0);
  const owner=new AbortController();owner.abort();await assert.rejects(f.client.open(input,{signal:owner.signal}));assert.equal(f.calls.length,0);
});
test("abort after reservation sends independent close before a late open can install",async()=>{
  const owner=new AbortController(),gate=defer();let openSignal;
  const f=fixture((method,_params,options)=>{
    if(method==="files.content.open"){openSignal=options.signal;return gate.promise;}
  });
  const pending=f.client.open(input,{signal:owner.signal});
  while(!openSignal)await new Promise(setImmediate);
  const id=f.calls[1].params.contentId;owner.abort();
  await new Promise(setImmediate);assert.equal(f.entries.has(id),false);assert(openSignal.aborted);
  const closeCall=f.calls.find(v=>v.method==="files.content.close");assert(!closeCall.options.signal.aborted);
  gate.resolve({version:1,contentId:id,state:"open",size:100000,chunkBytes:49152,leaseMs:60000});
  await assert.rejects(pending);assert.equal(f.entries.size,0);
});
test("an owner abort closes a live handle and suppresses a late read",async()=>{
  const owner=new AbortController(),gate=defer();let reading=false;
  const f=fixture(method=>method==="files.content.read"?(reading=true,gate.promise):undefined);
  const handle=await f.client.open(input,{signal:owner.signal});const pending=handle.read({offset:0,length:1});
  while(!reading)await new Promise(setImmediate);owner.abort();await new Promise(setImmediate);assert(handle.closed);assert.equal(f.entries.size,0);
  gate.resolve({version:1,contentId:handle.contentId,offset:0,bytes:1,data:"AA==",eof:false});await assert.rejects(pending);
});
test("malformed open results are retired; unknown prepare replies never start IO",async()=>{
  const f=fixture(method=>method==="files.content.open"?{version:1,contentId:randomUUID(),state:"open",size:1,chunkBytes:49152,leaseMs:60000}:undefined);
  await assert.rejects(f.client.open(input,{signal:new AbortController().signal}),/observation/);assert.equal(f.entries.size,0);
  const invalid=fixture(method=>method==="files.content.prepare"?{version:1,contentId:"wrong",leaseMs:20000}:undefined);
  await assert.rejects(invalid.client.open(input,{signal:new AbortController().signal}),/prepared/);assert.equal(invalid.calls.length,1);
});
test("range replies reject mismatched IDs, EOF, unsafe sizes and noncanonical base64",()=>{
  const id=randomUUID(),request={offset:0,length:1};const base={version:1,contentId:id,offset:0,bytes:1,data:"AA==",eof:false};
  for(const patch of [{contentId:randomUUID()},{offset:1},{bytes:2},{data:"AB=="},{data:"AA"},{eof:true},{data:"A".repeat(65537)}])
    assert.throws(()=>bytes({...base,...patch},id,request,100));
  assert.throws(()=>observation({version:1,contentId:id,state:"open",size:Number.MAX_SAFE_INTEGER+1,chunkBytes:49152,leaseMs:60000},id));
});
test("handles and unsettled transports remain bounded",async()=>{
  const owner=new AbortController(),f=fixture(),handles=[];
  for(let i=0;i<8;i++)handles.push(await f.client.open(input,{signal:owner.signal}));
  await assert.rejects(f.client.open(input,{signal:owner.signal}),/Too many/);
  await handles[0].close();const next=await f.client.open(input,{signal:owner.signal});
  await Promise.all([...handles.slice(1),next].map(v=>v.close()));
  const gate=defer();let started=0;
  const delayed=fixture(method=>method==="files.content.read"?(started++,gate.promise):undefined);
  const h=await delayed.client.open(input,{signal:owner.signal});
  const requests=Array.from({length:8},()=>h.read({offset:0,length:1}).catch(e=>e));
  while(started<8)await new Promise(setImmediate);
  await assert.rejects(h.read({offset:0,length:1}),/Too many/);
  owner.abort();await new Promise(setImmediate);gate.resolve({});await Promise.all(requests);
});
test("subscription reports lifetime changes without renewing or overlapping calls",async()=>{
  const owner=new AbortController(),f=fixture(),handle=await f.client.open(input,{signal:owner.signal});const seen=[];
  const sub=handle.subscribe(value=>seen.push(value),{signal:owner.signal});
  while(!seen.length)await new Promise(setImmediate);assert.equal(seen[0].state,"open");
  sub.stop();assert.equal((await sub.done).reason,"stopped");await handle.close();owner.abort();
});
