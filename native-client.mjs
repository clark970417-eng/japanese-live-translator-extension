export class NativeClient {
 constructor(runtime){this.runtime=runtime;this.pending=new Map();this.sequence=0;}
 connect(){
  if(this.port)return;
  const port=this.port=this.runtime.connectNative('org.jtl.companion');
  port.onMessage.addListener(message=>{
   // A replaced port can still deliver messages queued before its host died.
   // They belong to the old session: never surface them or settle new work.
   if(this.port!==port)return;
   if(message.event)this.onEvent?.(message);
   const job=this.pending.get(message.id);if(!job)return;
   if(message.event){job.progress?.(message);return;}
   clearTimeout(job.timer);this.pending.delete(message.id);
   message.ok?job.resolve(message.result):job.reject(new Error(message.error||'Desktop inference failed'));
  });
  port.onDisconnect.addListener(()=>{
   if(this.port!==port)return;
   const error=this.runtime.lastError?.message||'Desktop companion disconnected';
   this.port=null;this.rejectAll(error);
  });
 }
 rejectAll(error){for(const job of this.pending.values()){clearTimeout(job.timer);job.reject(new Error(error));}this.pending.clear();}
 request(op,fields={},timeout=60000,progress){
  if(this.pending.size>=16)return Promise.reject(new Error('Desktop queue is full'));
  this.connect();const id=++this.sequence;
  return new Promise((resolve,reject)=>{
   // A slow recognition request must not tear down the shared native port:
   // page translation and later audio use the same connection.  Forget only
   // this request; a late host reply is safely ignored by the pending lookup.
   const timer=setTimeout(()=>{
    if(!this.pending.delete(id))return;
    reject(new Error(`${op} timed out`));
   },timeout);
   this.pending.set(id,{resolve,reject,timer,progress});
   try{this.port.postMessage({id,op,...fields});}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}
  });
 }
 close(){const port=this.port;this.port=null;this.rejectAll('Desktop companion stopped');port?.disconnect();}
}
