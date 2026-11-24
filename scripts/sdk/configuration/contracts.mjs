import assert from "node:assert/strict";
import { mkdir,readFile,writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function syncConfigurationContracts(application,sdk,check) {
  for (const name of ["schema","document","migration"]) {
    const source = (await readFile(join(application,"src/lib/extensions/contracts/configuration",name+".ts"),"utf8")).replaceAll("\r\n","\n");
    assert.ok(!/@\/|\bnamespace\b/.test(source));
    for (const match of source.matchAll(/from "([^"]+)"/g)) assert.match(match[1],/^\.\/[a-z]+\.js$/);
    const expected = source.replace(/from "([^"]+)\.js"/g,'from "$1.mjs"');
    const path = join(sdk,"rpc/configuration/data",name+".d.mts");
    if (check) assert.equal((await readFile(path,"utf8")).replaceAll("\r\n","\n"),expected,`Configuration contract differs: ${name}`);
    else {await mkdir(join(sdk,"rpc/configuration/data"),{recursive:true});await writeFile(path,expected);}
  }
}
