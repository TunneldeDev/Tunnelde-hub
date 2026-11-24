import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadRecords,registryText,validateRecord,validateRegistry } from '../scripts/validate.mjs';
import { selectRelease,proposedUpdate,updateCatalogue } from '../scripts/update.mjs';
import { readFile,mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const record=(await loadRecords())[0];
test('catalogue generates the unchanged application wire format offline',async()=>{
 const registry=await validateRegistry();assert.equal(registry.version,1);assert.ok(registry.plugins.length>=19);
 assert.equal(registryText(await loadRecords()),await readFile(new URL('../registry.json',import.meta.url),'utf8'));
 assert.throws(()=>registryText([record,record]),/Duplicate/);
});
test('source records reject moved URLs, duplicate ids, malformed hashes and mutable tags',()=>{
 for(const patch of [{entry:{...record.entry,id:'../escape'}},{entry:{...record.entry,sha256:'fake'}},{entry:{...record.entry,url:record.entry.url.replace(/(?:plugins-)?v[\d.]+/,'latest')}},{repository:'other/repository'},{unexpected:true}])assert.throws(()=>validateRecord({...record,...patch},record.entry.id));
});
test('directory identity is checked before registry generation',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'tunnelde-catalogue-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 await writeFile(join(directory,'other.json'),JSON.stringify(record));await assert.rejects(loadRecords(directory));
});
test('version discovery sorts numerically and respects stable/draft selection',()=>{
 const releases=[{tag_name:'v1.9.0'},{tag_name:'v1.10.0'},{tag_name:'v2.0.0',prerelease:true},{tag_name:'v3.0.0',draft:true}];
 assert.equal(selectRelease(releases,record).tag_name,'v1.10.0');assert.equal(selectRelease(releases,{...record,channel:'prerelease'}).tag_name,'v2.0.0');
});
test('update verifies metadata version, registered release identity and archive before accepting',async()=>{
 const version='99.0.0',url=`https://github.com/${record.repository}/releases/download/v${version}/${record.entry.id}-${version}.zip`;
 const next={...record.entry,version,url};const assetUrl=`https://github.com/${record.repository}/releases/download/v${version}/marketplace.json`;
 const releases=[{tag_name:'v'+version,assets:[{name:'marketplace.json',browser_download_url:assetUrl}]}];let audited=false;
 const result=await proposedUpdate(record,{releases,download:async()=>Buffer.from(JSON.stringify(next)),audit:async entry=>{audited=true;assert.deepEqual(entry,next);}});assert.equal(result.entry.version,version);assert.ok(audited);
 await assert.rejects(proposedUpdate(record,{releases,download:async()=>Buffer.from(JSON.stringify({...next,version:'98.0.0'})),audit:async()=>{}}));
 await assert.rejects(proposedUpdate(record,{releases,download:async()=>Buffer.from(JSON.stringify(next)),audit:async()=>{throw new Error('checksum mismatch');}}),/checksum/);
 assert.equal(await proposedUpdate(record,{releases:[]}),null);
});

test('a failed archive audit leaves the entire catalogue and registry unchanged',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'tunnelde-updates-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const records=(await loadRecords()).slice(0,2);for(const r of records)await writeFile(join(directory,r.entry.id+'.json'),JSON.stringify(r));
 const target=join(directory,'../'+directory.split('/').at(-1)+'-registry.json');t.after(()=>rm(target,{force:true}));await writeFile(target,'original registry');
 const before=await Promise.all(records.map(r=>readFile(join(directory,r.entry.id+'.json'),'utf8')));
 let audits=0;
 const discover=async repository=>[{tag_name:'v99.0.0',assets:[{name:'marketplace.json',browser_download_url:`https://github.com/${repository}/releases/download/v99.0.0/marketplace.json`}]}];
 const download=async url=>{const r=records.find(r=>url.includes(r.repository+'/'));return Buffer.from(JSON.stringify({...r.entry,version:'99.0.0',url:`https://github.com/${r.repository}/releases/download/v99.0.0/${r.entry.id}-99.0.0.zip`}));};
 await assert.rejects(updateCatalogue({directory,target,discover,download,audit:async()=>{if(++audits===2)throw new Error('corrupted second archive');}}),/corrupted/);
 assert.deepEqual(await Promise.all(records.map(r=>readFile(join(directory,r.entry.id+'.json'),'utf8'))),before);assert.equal(await readFile(target,'utf8'),'original registry');
});
