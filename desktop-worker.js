// Worker-compatible adapter: audio never leaves the browser's native messaging pipe.
export class DesktopWorker {
 constructor(){this.token=crypto.randomUUID();this.listener=m=>{if(m.type==='desktop-partial'&&m.workerToken===this.token&&m.decodeId===this.id&&!this.closed)this.onmessage?.({data:{type:'partial',id:this.id,text:m.text}});};chrome.runtime.onMessage.addListener(this.listener);}
 postMessage(data){
  this.id=data.id;
  const fields={segment:data.segment,utterance:data.utterance,final:data.final,speechAt:data.speechAt,audioEndAt:data.audioEndAt};
  if(data.type==='decode'){
   const bytes=new Uint8Array(data.audio.buffer,data.audio.byteOffset,data.audio.byteLength);
   let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
   fields.audio=btoa(binary);
  }
  chrome.runtime.sendMessage({type:'desktop-request',op:data.type,decodeId:data.id,workerToken:this.token,...fields}).then(reply=>{
   if(this.closed)return;
   if(!reply?.ok)throw new Error(reply?.error||'桌面程式無法連線');
   this.onmessage?.({data:data.type==='init'?{type:'ready',...reply.text}:{type:'result',id:data.id,text:reply.text.text}});
  }).catch(error=>{if(!this.closed)this.onmessage?.({data:{type:'error',error:error.message}});});
 }
 terminate(){this.closed=true;chrome.runtime.onMessage.removeListener(this.listener);}
}
