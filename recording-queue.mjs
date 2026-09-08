// Persist recognized text before translating it. Display order is capture order,
// independent of API latency. Failed entries remain available for explicit retry.
export class RecordingQueue {
 constructor({save,translate,onChange=()=>{},onError=()=>{},timeoutMs=15000}){this.timeoutMs=timeoutMs;this.save=save;this.translate=translate;this.onChange=onChange;this.onError=onError;this.entries=[];this.busy=false;this.writes=Promise.resolve();}
 async restore(entries=[]){this.entries=entries.map(e=>({...e,state:e.state==='working'?'pending':e.state}));this.onChange();this.pump();}
 persist(){const snapshot=this.entries.map(e=>({...e}));const operation=this.writes.catch(()=>{}).then(()=>this.save(snapshot));this.writes=operation;return operation;}
 async add(entry){
  if(this.entries.some(e=>e.key===entry.key))return;
  this.entries.push({...entry,state:'pending',translated:''});
  try{await this.persist();}catch(error){this.onError(error);throw error;}
  this.onChange();this.pump();
 }
 async pump(){
  if(this.busy)return;this.busy=true;
  try{
   for(;;){
    const entry=this.entries.find(e=>e.state==='pending');if(!entry)break;
    entry.state='working';this.onChange();
    let timer;
    try{entry.translated=await Promise.race([this.translate(entry.original),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('翻譯逾時，可重試')),this.timeoutMs);})]);entry.state='done';delete entry.error;}
    catch(error){entry.state='failed';entry.error=String(error.message||error);}
    finally{clearTimeout(timer);}
    try{await this.persist();}catch(error){this.onError(error);break;}
    this.onChange();
   }
  }finally{this.busy=false;}
 }
 async retry(){for(const e of this.entries)if(e.state==='failed')e.state='pending';await this.persist();this.pump();}
 rows(session){
  const groups=new Map();
  for(const e of this.entries){if(e.session!==session)continue;let row=groups.get(e.group);if(!row){row={id:e.group,original:'',translated:'',pending:0};groups.set(e.group,row);}row.original+=(row.original?' ':'')+e.original;row.translated+=(row.translated&&e.translated?' ':'')+e.translated;if(e.state!=='done')row.pending++;}
  return [...groups.values()].slice(-4);
 }
 get pending(){return this.entries.filter(e=>e.state==='pending'||e.state==='working').length;}
 get failed(){return this.entries.filter(e=>e.state==='failed').length;}
}
