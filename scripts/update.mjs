import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadBytes } from '@tunnelde/plugin-sdk/tools';
import { loadRecords,validateRecord,validateRegistry,root } from './validate.mjs';
import { auditEntry } from './audit.mjs';
import { checkRegistryChanges } from './ci/registry-policy.mjs';
export function compareVersions(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]-y[i];}return 0;}
export function selectRelease(releases,record){return releases.filter(r=>!r.draft&&(record.channel==='prerelease'||!r.prerelease)&&/^v\d+\.\d+\.\d+$/.test(r.tag_name)).sort((a,b)=>compareVersions(b.tag_name.slice(1),a.tag_name.slice(1)))[0]??null;}
async function releasesFor(repository,{fetcher=fetch}={}){
 const releases=[];
 for(let page=1;page<=20;page++){
  const response=await fetcher(`https://api.github.com/repos/${repository}/releases?per_page=100&page=${page}`,{headers:{Accept:'application/vnd.github+json',...(process.env.GH_TOKEN?{Authorization:`Bearer ${process.env.GH_TOKEN}`}:{})},signal:AbortSignal.timeout(30000)});
  assert.ok(response.ok,`${repository}: GitHub API HTTP ${response.status}`);const data=await response.json();assert.ok(Array.isArray(data));releases.push(...data);if(data.length<100)return releases;
 }
 throw new Error('Too many releases; refusing incomplete version discovery');
}
export async function proposedUpdate(record,{releases,download=downloadBytes,audit=auditEntry}={}){
 const release=selectRelease(releases??await releasesFor(record.repository),record);
 if(!release||compareVersions(release.tag_name.slice(1),record.entry.version)<=0)return null;
 const asset=release.assets.find(a=>a.name==='marketplace.json');assert.ok(asset,'Published release lacks marketplace.json');
 assert.equal(asset.browser_download_url,`https://github.com/${record.repository}/releases/download/${release.tag_name}/marketplace.json`);
 const bytes=await download(asset.browser_download_url);assert.ok(bytes.length<=2*1024*1024,'Metadata limit');
 const entry=JSON.parse(bytes);const next=validateRecord({...record,entry},record.entry.id);
 assert.equal(entry.version,release.tag_name.slice(1));assert.equal(new URL(entry.url).pathname.split('/').slice(1,3).join('/').toLowerCase(),record.repository.toLowerCase());
 checkRegistryChanges({plugins:[record.entry]},{plugins:[entry]});await audit(entry,{download});return next;
}
export async function updateCatalogue({directory=join(root,'catalogue'),target=join(root,'registry.json'),discover=releasesFor,download=downloadBytes,audit=auditEntry}={}){
 const updates=[];
 // Complete every download and verification before writing any catalogue record.
 for(const record of await loadRecords(directory)){const next=await proposedUpdate(record,{releases:await discover(record.repository),download,audit});if(next)updates.push(next);}
 for(const record of updates)await writeFile(join(directory,`${record.entry.id}.json`),JSON.stringify(record,null,2)+'\n');
 await validateRegistry({write:true,directory,target});return updates;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(`Updated ${(await updateCatalogue()).length} plugin records.`);
