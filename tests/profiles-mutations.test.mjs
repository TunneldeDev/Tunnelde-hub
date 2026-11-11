import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createProfilesClient} from "../sdk/profiles/client.mjs";
import schema from "../sdk/preferences/schema.mjs";

const revision=`pc1:${"a".repeat(64)}`, next=`pc1:${"b".repeat(64)}`;
const owner=()=>({signal:new AbortController().signal});
const minimal=rule=>rule.enum?rule.enum[0]:rule.anyOf?minimal(rule.anyOf[0]):({
  string:()=>"",boolean:()=>false,integer:()=>rule.minimum??0,number:()=>rule.minimum??0,
  null:()=>null,array:()=>[],object:()=>Object.fromEntries((rule.required??[]).map(key=>[key,minimal(rule.properties[key])])),
})[rule.type]();
const values=()=>Object.fromEntries(Object.entries(schema.groups).map(([id,rule])=>[id,minimal(rule)]));
const request=()=>({name:" Work ",revision,values:values()});
const deferred=()=>{let resolve;return {promise:new Promise(done=>{resolve=done}),resolve:value=>resolve(value)}};
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
function server(override) {
  const calls=[], parts=[];let offset=0,total=0;
  return {calls,parts,call:async(method,params,options)=>{
    calls.push({method,params,options});
    if(override){const value=await override(method,params,options);if(value!==undefined)return value;}
    if(method==="profiles.drafts.prepare"){total=params.totalBytes;return {version:1,draftId:"draft-one",totalBytes:total,offset:0};}
    if(method==="profiles.drafts.append"){
      assert.equal(params.offset,offset);parts.push(params.text);offset+=Buffer.byteLength(params.text);
      return {version:1,draftId:"draft-one",totalBytes:total,offset};
    }
    if(method==="profiles.drafts.discard")return {version:1};
    if(method==="profiles.activate")return {version:1,id:params.id,revision:params.revision,preferencesRevision:"new-pref"};
    return {version:1,id:params.id??"new-profile",revision:next,private:"do-not-export"};
  }};
}

test("large full values upload in bounded UTF-8 chunks without one-shot RPC or input races",async()=>{
  const host=server(),client=createProfilesClient(host),input=request();
  input.values.appearance.userCss="\u0001".repeat(190000)+"中😀".repeat(500);
  const original=structuredClone(input.values);
  const result=client.save(input,owner());input.name="changed";input.revision=next;input.values.appearance.userCss="changed";
  assert.deepEqual(await result,{version:1,id:"new-profile",revision:next});
  assert.deepEqual(JSON.parse(host.parts.join("")),original);
  assert(host.parts.length>30);assert(host.calls.every(call=>Buffer.byteLength(JSON.stringify(call.params))<=256*1024));
  const save=host.calls.filter(call=>call.method==="profiles.save");assert.equal(save.length,1);
  assert.deepEqual(save[0].params,{name:"Work",revision,draftId:"draft-one"});
  assert.equal(host.calls.filter(call=>call.method==="profiles.drafts.discard").length,0);
  assert(host.calls.every(call=>call.options.signal&&call.options.timeoutMs>0&&call.options.timeoutMs<=90000));
});

test("invalid inputs/owners never allocate a server draft",async()=>{
  const host=server(),client=createProfilesClient(host);
  for(const bad of [{...request(),id:null},{...request(),values:{}},{...request(),name:"x\n"},{...request(),extra:1},{...request(),revision:revision+"\n"}])
    await assert.rejects(client.save(bad,owner()));
  for(const options of [undefined,{}, {signal:1}, {...owner(),timeoutMs:0},{...owner(),timeoutMs:120001},{...owner(),unknown:1}])
    await assert.rejects(client.save(request(),options));
  const aborted=new AbortController();aborted.abort(new Error("retired"));
  await assert.rejects(client.save(request(),{signal:aborted.signal}),/retired/);
  assert.equal(host.calls.length,0);
});

test("an uncertain save is not retried and triggers independent bounded cleanup",async()=>{
  const host=server(method=>{if(method==="profiles.save")throw new Error("transport lost after commit")});
  await assert.rejects(createProfilesClient(host).save(request(),owner()),/transport lost/);
  assert.equal(host.calls.filter(call=>call.method==="profiles.save").length,1);
  const discarded=host.calls.at(-1);assert.equal(discarded.method,"profiles.drafts.discard");
  assert.equal(discarded.options.timeoutMs,1000);
});

test("cancel after prepare response retains allocated ID for cleanup without uploading",async()=>{
  const controller=new AbortController();
  const host=server(method=>{if(method==="profiles.drafts.prepare"){
    controller.abort(new Error("owner stopped"));return {version:1,draftId:"allocated",totalBytes:Buffer.byteLength(JSON.stringify(values())),offset:0};
  }});
  await assert.rejects(createProfilesClient(host).save(request(),{signal:controller.signal}),/owner stopped/);
  assert.deepEqual(host.calls.map(v=>v.method),["profiles.drafts.prepare","profiles.drafts.discard"]);
  assert.equal(host.calls.at(-1).params.draftId,"allocated");
  assert.notEqual(host.calls.at(-1).options.signal,controller.signal);
});

test("invalid acknowledgement or public response fails without automatic retries",async()=>{
  for(const failure of ["append","commit"]){
    const host=server((method,params)=>{
      if(failure==="append"&&method==="profiles.drafts.append")return {version:1,draftId:"draft-one",totalBytes:999,offset:1};
      if(failure==="commit"&&method==="profiles.save")return {version:1,id:"new-profile",revision};
    });
    await assert.rejects(createProfilesClient(host).save(request(),owner()),/Invalid profile/);
    assert.equal(host.calls.at(-1).method,"profiles.drafts.discard");
    assert(host.calls.filter(v=>v.method==="profiles.save").length<=1);
  }
});

test("unsettled aborted transports retain all four slots until actual cleanup settles",async()=>{
  const waiting=[];
  const host=server(method=>{
    if(method==="profiles.drafts.prepare"){const value=deferred();waiting.push(value);return value.promise;}
  });
  const client=createProfilesClient(host),controller=new AbortController();
  const tasks=Array.from({length:4},()=>client.save(request(),{signal:controller.signal}).catch(e=>e));
  await flush();controller.abort(new Error("stop"));
  await assert.rejects(client.save(request(),owner()),/Too many/);
  waiting.forEach(value=>value.resolve(undefined));
  const settled=await Promise.all(tasks);assert(settled.every(value=>String(value).includes("stop")));
  assert.equal(host.calls.filter(v=>v.method==="profiles.save").length,0);
  const done=client.save(request(),owner());await flush();waiting.at(-1).resolve(undefined);
  assert.equal((await done).id,"new-profile");
});

test("rename/delete/activate bind IDs and revisions, strip extra fields and do not retry consent",async()=>{
  const host=server(),client=createProfilesClient(host);
  const renamed=await client.rename({id:"existing",revision,name:" Renamed "},owner());
  assert.deepEqual(renamed,{version:1,id:"existing",revision:next});assert(Object.isFrozen(renamed));
  assert.equal((await client.remove({id:"existing",revision},owner())).id,"existing");
  assert.deepEqual(await client.activate({id:"existing",revision,preferencesRevision:"old-pref"},owner()),{version:1,id:"existing",revision,preferencesRevision:"new-pref"});
  const denial=server(method=>{if(method==="profiles.activate")throw new Error("profiles.activation.denied")});
  await assert.rejects(createProfilesClient(denial).activate({id:"existing",revision,preferencesRevision:"old-pref"},owner()),/denied/);
  assert.equal(denial.calls.length,1);
});

test("one elapsed deadline covers upload and independently bounded cleanup without committing",async t=>{
  let elapsed=0;
  t.mock.method(performance,"now",()=>elapsed);
  t.mock.timers.enable({apis:["setTimeout"]});
  const host=server(async(method,params,options)=>{
    if(method==="profiles.drafts.prepare") {elapsed=20;t.mock.timers.tick(20);}
    if(method==="profiles.drafts.append") {
      // Deliberately noncooperative transport: the SDK must retain its slot and
      // recheck the total deadline when this real outstanding call settles.
      elapsed=120;t.mock.timers.tick(100);
      assert.equal(options.signal.aborted,true);
    }
  });
  await assert.rejects(createProfilesClient(host).save(request(),{...owner(),timeoutMs:80}),error=>error.name==="TimeoutError");
  const append=host.calls.find(value=>value.method==="profiles.drafts.append");
  assert.equal(append.options.timeoutMs,60);
  assert.equal(host.calls.filter(value=>value.method==="profiles.save").length,0);
  assert.equal(host.calls.at(-1).method,"profiles.drafts.discard");
  assert.equal(host.calls.at(-1).options.timeoutMs,1000);
  assert.equal(host.calls.at(-1).options.signal.aborted,false);
});

test("owner abort while upload is pending suppresses later chunks and commit",async()=>{
  const controller=new AbortController(),gate=deferred();
  const host=server(method=>method==="profiles.drafts.append"?gate.promise:undefined);
  const client=createProfilesClient(host),task=client.save(request(),{signal:controller.signal});
  await flush();assert.equal(host.calls.at(-1).method,"profiles.drafts.append");
  controller.abort(new Error("view disposed"));gate.resolve(undefined);
  await assert.rejects(task,/view disposed/);
  assert.equal(host.calls.filter(value=>value.method==="profiles.drafts.append").length,1);
  assert.equal(host.calls.filter(value=>value.method==="profiles.save").length,0);
  assert.equal(host.calls.at(-1).method,"profiles.drafts.discard");
});

test("actual native profile mutation producer is consumed by current SDK",{skip:!process.env.TUNNELDE_PROFILE_MUTATION_OUTPUT},async()=>{
  const fixture=JSON.parse(await readFile(process.env.TUNNELDE_PROFILE_MUTATION_OUTPUT,"utf8"));
  const expected=[...fixture.upload,{method:"profiles.save",request:fixture.saveRequest,result:fixture.saveResult},
    {method:"profiles.rename",request:fixture.renameRequest,result:fixture.renameResult},
    {method:"profiles.delete",request:fixture.deleteRequest,result:fixture.deleteResult}];
  const client=createProfilesClient({call:async(method,request)=>{
    const step=expected.shift();assert(step);assert.equal(method,step.method);assert.deepEqual(request,step.request);return step.result;
  }});
  assert.deepEqual(await client.save({name:"SDK Work 中文😀",revision:fixture.revision,values:fixture.values},owner()),fixture.saveResult);
  assert.deepEqual(await client.rename(fixture.renameRequest,owner()),fixture.renameResult);
  assert.deepEqual(await client.remove(fixture.deleteRequest,owner()),fixture.deleteResult);
  assert.equal(expected.length,0);
});
