export function cleanText(value) {
  const text=String(value).replace(/\s+/g,' ').trim();
  // Reject pathological generation; never rewrite genuine double repetitions.
  if (text.length>220 || /(.{2,24})[、,\s]*(?:\1[、,\s]*){3,}/u.test(text)) return '';
  return text;
}
export class ResultGate {
  constructor() { this.reset(); }
  reset() { this.session=crypto.randomUUID(); this.latest=null; }
  accept(session,id,text) {
    if(session!==this.session || (this.latest && id<this.latest.id)) return null;
    if(this.latest?.id===id && this.latest.original===text) return null;
    return this.latest={id,original:text,translated:'',updatedAt:Date.now()/1000};
  }
  finish(session,item,text) {
    if(session!==this.session || this.latest!==item) return false;
    item.translated=text; return true;
  }
}

// Fixed-size PCM frames make segmentation deterministic and testable.
export class Segmenter {
 constructor(rate=16000){this.rate=rate;this.reset();}
 reset(){this.pre=[];this.parts=[];this.length=0;this.silence=0;this.elapsed=0;this.active=false;this.id=0;this.voicedSeconds=0;}
 push(data,rms,interval=.8){
  const duration=data.length/this.rate;
  const voiced=rms>=.0012;
  if(voiced&&!this.active){this.active=true;this.voicedSeconds=0;this.id++;this.parts=this.pre.slice();this.length=this.parts.reduce((n,a)=>n+a.length,0);}
  this.pre.push(data);while(this.pre.reduce((n,a)=>n+a.length,0)>this.rate*.25)this.pre.shift();
  if(!this.active)return null;
  this.parts.push(data);this.length+=data.length;this.elapsed+=duration;
  if(voiced)this.voicedSeconds+=duration;
  this.silence=voiced?0:this.silence+duration;
  const seconds=this.length/this.rate,final=this.silence>=.30||seconds>=3.8;
  let job=null;
  if(seconds>=.65&&(final||(seconds>=.85&&this.elapsed>=interval))){
   const audio=new Float32Array(this.length);let at=0;for(const part of this.parts){audio.set(part,at);at+=part.length;}
   job={id:this.id,audio,final,voicedSeconds:this.voicedSeconds,sampleCount:this.length};this.elapsed=0;
  }
  if(final){this.active=false;this.parts=[];this.length=0;this.elapsed=0;this.silence=0;}
  return job;
 }
}

// Common Whisper silence hallucinations need independent revisions in one segment.
export class SpeechResultFilter {
 constructor(){this.reset();}
 reset(){this.candidate=null;}
 accept(text,job){
  text=cleanText(text);
  if(!text || job.voicedSeconds<.24)return '';
  const suspect=/^(?:ご?視聴ありがとうございました|ご?視聴ありがとうございます|チャンネル登録(?:を)?お願いします)[。！!\s]*$/u.test(text);
  if(!suspect){this.candidate=null;return text;}
  const previous=this.candidate;
  this.candidate={id:job.id,text,samples:job.sampleCount};
  return previous?.id===job.id && previous.text===text && job.sampleCount>previous.samples && job.voicedSeconds>=.8 ? text : '';
 }
}
