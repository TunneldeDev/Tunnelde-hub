import type { Host } from "../../../sdk/rpc/transport/host.mjs";
import { createFileContentClient } from "../../../sdk/files/content/client.mjs";
declare const host: Host;
const owner = new AbortController();
const client = createFileContentClient(host);
const file = await client.open({source:{kind:"remote",sessionId:"session"},path:"/file.bin"},{signal:owner.signal});
const bytes: Uint8Array = await file.read({offset:0,length:49152});
const state = await file.observe();
const observation = file.subscribe(value => { const nullable: number | null = value.size; void nullable; });
void bytes; void state; observation.stop(); await file.close();
// @ts-expect-error A lifetime owner is mandatory.
await client.open({source:{kind:"local"},path:"/x"});
// @ts-expect-error A remote endpoint always requires a session ID.
await client.open({source:{kind:"remote"},path:"/x"},{signal:owner.signal});
// @ts-expect-error Content resources cannot mutate paths or overwrite files.
await file.write({data:bytes});
// @ts-expect-error IDs never grant a caller-selected owner.
await file.read({offset:0,length:1,owner:"other"});
