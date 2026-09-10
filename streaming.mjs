// PCM sample positions, rather than timer cadence, define every audio boundary.
export class Resampler {
 constructor(rate){this.ratio=rate/16000;this.reset();}
 reset(){this.sum=0;this.weight=0;this.remaining=this.ratio;}
 push(input){
  const out=[];
  for(const value of input){
   let left=1;
   while(left>1e-8){
    const take=Math.min(left,this.remaining);
    this.sum+=value*take;this.weight+=take;this.remaining-=take;left-=take;
    if(this.remaining<1e-8){out.push(this.sum/this.weight);this.sum=0;this.weight=0;this.remaining=this.ratio;}
   }
  }
  return Float32Array.from(out);
 }
}
export class SpeechGain {
 constructor(){this.gain=1;}
 push(frame){
  let energy=0;for(const x of frame)energy+=x*x;
  const rms=Math.sqrt(energy/frame.length);
  const target=rms>1e-5?Math.max(1,Math.min(12,.06/rms)):1;
  this.gain+=.2*(target-this.gain);
  return frame.map(x=>Math.max(-1,Math.min(1,x*this.gain)));
 }
}
export class SpeechWindows {
 constructor(){this.reset();}
 reset(){this.pre=[];this.parts=[];this.samples=0;this.clock=0;this.onset=0;this.silent=0;this.voiced=0;this.active=false;this.id=0;this.lastEmission=0;this.overlap=false;this.utterance=0;}
 push(frame,probability,interval=.65){
  const n=frame.length;this.clock+=n;
  const speech=probability>=(this.active?.15:.30);
  this.onset=speech?this.onset+n:0;
  if(!this.active){
   this.pre.push(frame);while(this.pre.length>16)this.pre.shift();
   if(this.onset<1024)return null;
   this.active=true;this.id++;this.utterance++;this.parts=this.pre.slice();this.samples=this.parts.reduce((a,b)=>a+b.length,0);
   this.start=this.clock-this.samples;this.speechStart=this.clock-this.onset;this.voiced=this.onset;this.silent=0;this.lastEmission=this.clock;this.overlap=false;
   return null;
  }
  this.parts.push(frame);this.samples+=n;
  if(speech)this.voiced+=n;
  this.silent=speech?0:this.silent+n;
  const ended=this.silent>=10240, cut=this.samples>=(this.maxSamples||80000);
  let job=null;
  if(this.voiced>=3584 && ((ended||cut) || (this.samples>=12800&&this.clock-this.lastEmission>=interval*16000))){
   const audio=new Float32Array(this.samples);let at=0;for(const part of this.parts){audio.set(part,at);at+=part.length;}
   job={id:this.id,utteranceId:this.utterance,utteranceEnd:ended,audio,final:ended||cut,overlap:this.overlap,voicedSeconds:this.voiced/16000,sampleCount:this.clock,startSample:this.start,endSample:this.clock,speechStartSample:this.speechStart};
   this.lastEmission=this.clock;
  }
  if(ended){this.active=false;this.parts=[];this.samples=0;this.pre=[];this.onset=0;}
  else if(cut){
   this.parts=this.parts.slice(-(this.overlapFrames||32));this.samples=this.parts.reduce((a,b)=>a+b.length,0);
   this.start=this.clock-this.samples;this.id++;this.overlap=true;this.voiced=0;this.speechStart=this.clock;
  }
  return job;
 }
}
export function commonPrefix(a,b){let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;return a.slice(0,i);}
export function trimOverlap(previous,text){
 const normalized=previous.replace(/[\p{P}\s]/gu,'');
 let prefix='';const ends=[];
 for(let i=0;i<text.length;i++){if(!/[\p{P}\s]/u.test(text[i])){prefix+=text[i];ends.push(i+1);}}
 for(let n=Math.min(normalized.length,prefix.length,80);n>=3;n--)if(normalized.endsWith(prefix.slice(0,n)))return text.slice(ends[n-1]).replace(/^[、。\s]+/u,'');
 return text;
}
export class Agreement {
 constructor(){this.reset();}
 reset(){this.id=null;this.previous='';this.stable='';this.tail='';this.prefixTail='';this.lastSample=-1;}
 preview(text,job){
  if(this.id!==null&&job.id<this.id)return null;
  const tail=this.id===job.id?this.prefixTail:job.overlap?this.tail:'';
  text=tail?trimOverlap(tail,text):text;
  if(!text)return null;
  if(this.id===job.id&&text.length<=this.previous.length)return null;
  if(this.id===job.id){
   const boundary=Math.max(this.previous.lastIndexOf('。'),this.previous.lastIndexOf('！'),this.previous.lastIndexOf('？'));
   if(boundary>=0){
    const prefix=this.previous.slice(0,boundary+1).replace(/[\p{P}\s]/gu,'');
    let normalized='',end=0;
    for(let i=0;i<text.length&&normalized.length<prefix.length;i++){if(!/[\p{P}\s]/u.test(text[i]))normalized+=text[i];end=i+1;}
    if(normalized===prefix)text=text.slice(end).replace(/^[\p{P}\s]+/u,'');
    // A changed earlier sentence cannot be aligned safely during generation.
    // Wait for the completed decode instead of redisplaying old sentences.
    else return null;
   }
  }
  if(!text)return null;
  return {text,stableText:'',provisional:true,revision:job.sampleCount};
 }
 accept(text,job){
  if(this.id!==null&&job.id<this.id)return null;
  if(this.id!==job.id){this.prefixTail=job.overlap?this.tail:'';this.id=job.id;this.previous='';this.stable='';this.lastSample=-1;}
  if(job.sampleCount<=this.lastSample)return null;
  this.lastSample=job.sampleCount;
  text=this.prefixTail?trimOverlap(this.prefixTail,text):text;
  if(!text)return null;
  const common=commonPrefix(this.previous,text);
  // Only advertise a prefix as stable if the current hypothesis still supports it.
  this.stable=job.final?text:common;
  this.previous=text;this.tail=text.slice(-100);
  return {text,stableText:this.stable,provisional:!job.final,revision:job.sampleCount};
 }
}
export class DecodeQueue {
 constructor({retainFinals=false}={}){this.jobs=[];this.dropped=0;this.retainFinals=retainFinals;}
 clear(){this.jobs=[];}
 push(job){
  if(this.retainFinals&&!job.final)return;
  if(this.retainFinals&&this.jobs.length>=60)throw new Error('辨識積壓超過上限，已停止收音以保護已記錄內容');
  this.jobs=this.jobs.filter(x=>x.id!==job.id);
  this.jobs.push(job);
  // Keep one final and the newest revision. Never accumulate an unbounded delay.
  while(!this.retainFinals&&this.jobs.length>2){this.jobs.shift();this.dropped++;}
 }
 shift(){return this.jobs.shift();}
 takeFresh(now,epoch){
  while(this.jobs.length){const job=this.shift();if(job.epoch===epoch&&(this.retainFinals||now-job.audioEndAt<=4000))return job;this.dropped++;}
  return null;
 }
}
export class Measurements {
 constructor(){this.values={};}
 add(name,value){if(!Number.isFinite(value))return;const a=this.values[name]??=[];a.push(Math.max(0,value));if(a.length>120)a.shift();}
 summary(){return Object.fromEntries(Object.entries(this.values).map(([name,a])=>{const s=[...a].sort((a,b)=>a-b);return[name,{count:s.length,p50:Math.round(s[Math.floor((s.length-1)*.5)]),p95:Math.round(s[Math.floor((s.length-1)*.95)])}];}));}
}
