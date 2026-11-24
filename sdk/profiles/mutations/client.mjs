import { MAX_CONTENT_BYTES } from "../content/limits.mjs";
import { profileValues } from "../content/values.mjs";
import { MAX_APPEND_BYTES } from "./limits.mjs";
import { fields, name, validId, contentRevision, draft, changed } from "./validation.mjs";
import { ownedOperations, discard } from "./owner.mjs";

/** No implicit mutation retries. Lost commit responses require reconciliation. */
export function createMutationClient(host) {
  const run = ownedOperations();
  const save = (input, options) => run(options, async operation => {
    if (!fields(input,["id","name","revision","values"]) || !name(input.name) || !contentRevision(input.revision) ||
      Object.hasOwn(input,"id") && !validId(input.id)) throw new TypeError("Invalid profile save request");
    // Snapshot all caller-owned input before the first await.
    const request = {revision:input.revision,name:input.name.trim(),...(Object.hasOwn(input,"id")?{id:input.id}:{})};
    let text;
    try { text = JSON.stringify(input.values); profileValues(text); }
    catch { throw new TypeError("Invalid complete public profile values"); }
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > MAX_CONTENT_BYTES) throw new TypeError("Profile content exceeds its byte limit");
    operation.check();
    let draftId;
    try {
      // Retain the server ID even when cancellation wins after transport return,
      // so this client's independent cleanup can discard an allocated upload.
      const response = await operation.call({call:async (...args)=>{
        const raw=await host.call(...args);
        draftId=draft(raw,bytes.length,0); return raw;
      }},"profiles.drafts.prepare",{revision:request.revision,totalBytes:bytes.length});
      draftId=draft(response,bytes.length,0,draftId);
      let offset=0;
      for(let pages=0;offset<bytes.length&&pages<1024;pages++) {
        let end=Math.min(offset+MAX_APPEND_BYTES,bytes.length);
        while(end<bytes.length&&(bytes[end]&0xc0)===0x80)end--;
        const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes.slice(offset,end));
        const response=await operation.call(host,"profiles.drafts.append",{draftId,offset,text});
        draft(response,bytes.length,end,draftId);offset=end;
      }
      if(offset!==bytes.length)throw new Error("Profile upload page limit exceeded");
      const result=changed(await operation.call(host,"profiles.save",{...request,draftId}),request);
      draftId=undefined;return result;
    } finally { if(draftId!==undefined)await discard(host,draftId); }
  });
  const simple = (method, allowed, activated=false) => (input,options) => run(options, async operation=>{
    if(!fields(input,allowed)||!validId(input.id)||!contentRevision(input.revision)||
      method==="profiles.rename"&&!name(input.name)||activated&&!validId(input.preferencesRevision))
      throw new TypeError("Invalid profile mutation request");
    const request={id:input.id,revision:input.revision,...(method==="profiles.rename"?{name:input.name.trim()}:{}),...(activated?{preferencesRevision:input.preferencesRevision}:{})};
    return changed(await operation.call(host,method,request),request,activated);
  });
  return {save,rename:simple("profiles.rename",["id","revision","name"]),remove:simple("profiles.delete",["id","revision"]),activate:simple("profiles.activate",["id","revision","preferencesRevision"],true)};
}
