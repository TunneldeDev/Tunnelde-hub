import assert from 'node:assert/strict';
import { readFile,readdir,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateEntry } from '@tunnelde/plugin-sdk/tools';
export const root=resolve(import.meta.dirname,'..');
export function validateRecord(record,id) {
 assert.ok(record&&Object.keys(record).every(key=>['repository','channel','entry'].includes(key)),'Unknown record field');
 assert.match(record.repository,/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9_.-]+$/);
 assert.ok(record.repository.split('/').every(part=>part!=='.'&&part!=='..'),'Invalid repository segment');
 assert.ok(['stable','prerelease'].includes(record.channel));
 validateEntry(record.entry);assert.equal(record.entry.id,id);
 const fields=['id','name','version','description','author','runtime','apiVersion','dependencies','engines','tags','readme','url','sha256'];
 assert.ok(Object.keys(record.entry).every(key=>fields.includes(key)),'Unknown catalogue field');
 assert.equal(new URL(record.entry.url).host,'github.com');
 assert.ok(Buffer.byteLength(record.entry.readme)<=2*1024*1024,'README exceeds limit');
 const owner=new URL(record.entry.url).pathname.split('/').slice(1,3).join('/');
 assert.ok(owner.toLowerCase()===record.repository.toLowerCase()||(owner.toLowerCase()==='tunneldedev/tunnelde-hub' && record.repository.toLowerCase()===`tunneldedev/tunnelde-plugin-${id}`),'Download must belong to registered repository');
 return record;
}
export async function loadRecords(directory=join(root,'catalogue')) {
 const records=[];const repositories=new Set();
 for(const file of (await readdir(directory)).sort()) {
  assert.match(file,/^[a-z0-9][a-z0-9_-]{0,63}\.json$/,'Unexpected catalogue file');
  const record=validateRecord(JSON.parse(await readFile(join(directory,file),'utf8')),file.slice(0,-5));
  assert.ok(!repositories.has(record.repository.toLowerCase()),'Duplicate plugin repository');repositories.add(record.repository.toLowerCase());records.push(record);
 }
 return records;
}
export function registryText(records) {
 const entries=records.map(record=>record.entry).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
 assert.equal(new Set(entries.map(entry=>entry.id)).size,entries.length,'Duplicate plugin id');
 return JSON.stringify({version:1,plugins:entries},null,2)+'\n';
}
export async function validateRegistry({write=false,directory=join(root,'catalogue'),target=join(root,'registry.json')}={}) {
 const text=registryText(await loadRecords(directory));
 if(write)await writeFile(target,text);
 else assert.equal(await readFile(target,'utf8'),text,'Registry drift: npm run registry');
 return JSON.parse(text);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`Validated ${(await validateRegistry({write:process.argv.includes('--write')})).plugins.length} external plugin records.`);
