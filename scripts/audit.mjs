import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyArchive,downloadBytes } from '@tunnelde/plugin-sdk/tools';
import { validateRegistry } from './validate.mjs';
export async function auditEntry(entry,{download=downloadBytes}={}) {
 return verifyArchive(await download(entry.url),entry);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 for(const entry of (await validateRegistry()).plugins){await auditEntry(entry);console.log(`${entry.id}@${entry.version}: verified`);}
}
