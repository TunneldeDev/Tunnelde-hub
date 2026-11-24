import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import ts from "typescript";
import { validateConfiguration } from "../scripts/plugins/configuration/manifest.mjs";
import { createConfigurationClient } from "../sdk/configuration/client.mjs";

const schema=()=>({version:1,groups:[{id:"general",title:"General"}],fields:[{id:"enabled",group:"general",title:"Enabled",schema:{type:"boolean"},default:false},{id:"name",group:"general",title:"Name",schema:{type:"string",maxLength:1},default:"😀"}]});

test("marketplace accepts bounded configuration data and rejects unknown schema and unsafe defaults",()=>{
  validateConfiguration(schema());validateConfiguration(undefined);validateConfiguration(null);
  const original=schema();const cases=[];
  for (const invalid of [{type:"boolean",unknown:true},{type:"string",maxLength:1,minLength:2},{type:"string",maxLength:2,enum:["x","x"]},
    {type:"object",properties:JSON.parse('{"__proto__":{"type":"boolean"}}'),required:[],additionalProperties:false},
    {type:"array",items:{type:"boolean"},maxItems:257},{type:"number",minimum:1,maximum:0},{type:"integer",minimum:0,maximum:Number.MAX_SAFE_INTEGER+1}]) {
    const bad=structuredClone(original);bad.fields[0].schema=invalid;cases.push(bad);
  }
  let bad=structuredClone(original);bad.fields[1].default="😀😀";cases.push(bad);
  bad=structuredClone(original);bad.fields[1].id="enabled";cases.push(bad);
  bad=structuredClone(original);bad.fields[0].group="missing";cases.push(bad);
  bad=structuredClone(original);bad.unknown=true;cases.push(bad);
  bad=structuredClone(original);bad.migrations=[{fromVersion:2,fromDigest:"a".repeat(64),toVersion:1,toDigest:"b".repeat(64),operations:[]}];cases.push(bad);
  for (const bad of cases) assert.throws(()=>validateConfiguration(bad),JSON.stringify(bad));
});

test("configuration migrations are exact version/digest declarations with data-only operations",()=>{
  const valid=schema();valid.version=2;valid.migrations=[{fromVersion:1,fromDigest:"a".repeat(64),toVersion:2,toDigest:"b".repeat(64),operations:[{op:"rename",from:"name",to:"label"},{op:"setDefault",key:"extra",value:0},{op:"remove",key:"old"}]}];
  validateConfiguration(valid);
  for (const operation of [{op:"execute",command:"pwd"},{op:"rename",from:"name",to:"name"},{op:"remove",key:"constructor"},{op:"setDefault",key:"x"}]) {
    const bad=structuredClone(valid);bad.migrations[0].operations=[operation];assert.throws(()=>validateConfiguration(bad));
  }
});

test("strict configuration facade forwards the CAS envelope unchanged through the existing owner transport",async()=>{
  const calls=[];const host={call:async(method,params)=>{calls.push([method,params]);return method;}};const client=createConfigurationClient(host);
  const expected={expectedRevision:"revision",schemaDigest:"digest"};
  assert.equal(await client.schema(),"configuration.schema");await client.snapshot();await client.backups();
  const update={...expected,values:{name:"custom",enabled:false}};await client.update(update);await client.migrate(expected);
  const backup={...expected,backupId:"backup"};await client.restore(backup);await client.deleteBackup(backup);
  assert.deepEqual(calls.map(([name])=>name),["configuration.schema","configuration.snapshot","configuration.backups","configuration.update","configuration.migrate","configuration.restore","configuration.deleteBackup"]);
  assert.equal(calls[3][1],update);assert.equal(calls[4][1],expected);assert.equal(calls[6][1],backup);assert(Object.isFrozen(client));
});

test("configuration domain client rejects missing CAS and incorrect calls without a fallback overload",()=>{
  const program=ts.createProgram([resolve("tests/fixtures/configuration/consumer.mts")],{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,strict:true,noEmit:true,skipLibCheck:false,types:["node"]});
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
