import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {SpeechResultFilter,cleanText} from '../stream-core.mjs';
import {Agreement,DecodeQueue,Measurements} from '../streaming.mjs';

function harness(){
 let listener,capture;const speech=[],workers=[],messages=[],timers=[];
 class Worker{constructor(url){this.url=url;this.posts=[];workers.push(this);}postMessage(m){this.posts.push(m);}terminate(){this.terminated=true;}}
 class DesktopWorker extends Worker{constructor(){super('speech-desktop');speech.push(this);}}
 class AudioContext{constructor(){this.sampleRate=48000;this.audioWorklet={addModule:async()=>{}};}resume(){}createMediaStreamSource(){return {connect(){},disconnect(){}};}close(){return Promise.resolve();}}
 class AudioWorkletNode{constructor(){this.port={};capture=this;}connect(){}disconnect(){}}
 const track={stop(){}};
 const chrome={runtime:{sendMessage:async m=>{messages.push(m);return {ok:true};},onMessage:{addListener:f=>listener=f}}};
 const timeout=(fn,ms)=>{const timer={fn,ms,cleared:false};timers.push(timer);return timer;};
 const src=fs.readFileSync(new URL('../offscreen.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{chrome,Worker,DesktopWorker,AudioContext,AudioWorkletNode,navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})}},SpeechResultFilter,cleanText,Agreement,DecodeQueue,Measurements,Date,performance,setTimeout:timeout,clearTimeout:t=>{if(t)t.cleared=true;},setInterval:()=>1,clearInterval(){}});
 const call=m=>new Promise(r=>listener(m,{},r));
 const fire=ms=>{const t=timers.find(x=>x.ms===ms&&!x.cleared&&!x.fired);assert.ok(t,`missing ${ms} ms timer`);t.fired=true;t.fn();};
 return {call,fire,speech,workers,messages,get capture(){return capture;}};
}

test('two separated desktop deaths recover with backoff, a third stops, and manual Start resets the budget',async()=>{
 const h=harness();
 await h.call({type:'offscreen-start',session:'long',streamId:'test',recording:true,mode:'desktop'});
 const vad=h.workers.find(w=>w.url.startsWith('vad'));
 vad.onmessage({data:{type:'ready'}});
 const ready=worker=>worker.onmessage({data:{type:'ready',model:'local',dtype:'q4'}});
 const job=id=>({id,utteranceId:id,final:true,utteranceEnd:true,epoch:0,audio:new Float32Array(16000).fill(.1),audioEndAt:Date.now(),speechAt:Date.now()-500,speechSeconds:1,voicedSeconds:1,sampleCount:16000});

 ready(h.speech[0]);
 vad.onmessage({data:{type:'segment',job:job(1)}});
 const first=h.speech[0];
 first.onmessage({data:{type:'error',error:'第一次中斷'}});
 first.onmessage({data:{type:'result',id:1,text:'舊程序結果'}});
 assert.equal(h.messages.some(m=>m.text==='舊程序結果'),false,'a dead worker cannot publish a late result');
 h.fire(250);ready(h.speech[1]);
 assert.equal(h.speech[1].posts.at(-1).id,1,'accepted audio is retried after the first death');
 await h.speech[1].onmessage({data:{type:'result',id:1,text:'一回目の復旧'}});

 vad.onmessage({data:{type:'segment',job:job(2)}});
 h.speech[1].onmessage({data:{type:'error',error:'第二次中斷'}});
 h.fire(500);ready(h.speech[2]);
 assert.equal(h.speech[2].posts.at(-1).id,2,'accepted audio is retried after the second death');
 await h.speech[2].onmessage({data:{type:'result',id:2,text:'二回目の復旧'}});
 assert.equal(h.messages.some(m=>m.type==='speech-error'),false,'both allowed recoveries remain invisible to the user');

 vad.onmessage({data:{type:'segment',job:job(3)}});
 h.speech[2].onmessage({data:{type:'error',error:'第三次中斷'}});
 const terminal=h.messages.findLast(m=>m.type==='speech-error');
 assert.match(terminal.error,/自動復原已達上限/);
 assert.equal(h.speech.length,3,'a permanently failing host is not launched forever');

 await h.call({type:'offscreen-start',session:'manual',streamId:'test',recording:true,mode:'desktop'});
 const manual=h.speech.at(-1);ready(manual);
 manual.onmessage({data:{type:'error',error:'手動重開後中斷'}});
 h.fire(250);
 assert.equal(h.speech.length,5,'manual Start receives a fresh recovery budget');
 const stopped=await h.call({type:'offscreen-stop'});
 assert.equal(stopped.ok,true);
});

test('desktop recovery runs accepted finals and the newest preview before an interrupted stale preview',async()=>{
 const h=harness();
 await h.call({type:'offscreen-start',session:'ordering',streamId:'test',recording:true,mode:'desktop'});
 const vad=h.workers.find(w=>w.url.startsWith('vad'));
 vad.onmessage({data:{type:'ready'}});
 const ready=worker=>worker.onmessage({data:{type:'ready',model:'local',dtype:'q4'}});
 const job=(id,final,sampleCount)=>({id,utteranceId:id,final,utteranceEnd:final,epoch:0,audio:new Float32Array(16000).fill(.1),audioEndAt:Date.now(),speechAt:Date.now()-500,speechSeconds:1,voicedSeconds:1,sampleCount});

 ready(h.speech[0]);
 vad.onmessage({data:{type:'segment',job:job(1,false,100)}});
 vad.onmessage({data:{type:'segment',job:job(2,true,160)}});
 vad.onmessage({data:{type:'segment',job:job(3,false,200)}});
 h.speech[0].onmessage({data:{type:'error',error:'預覽期間中斷'}});
 h.fire(250);ready(h.speech[1]);
 assert.equal(h.speech[1].posts.at(-1).id,2,'accepted final is not blocked by the stale preview');
 await h.speech[1].onmessage({data:{type:'result',id:2,text:'完成した文'}});
 assert.equal(h.speech[1].posts.at(-1).id,3,'the newest rolling preview follows the final');
 assert.equal(h.speech[1].posts.some(post=>post.id===1),false,'obsolete interrupted preview is not decoded');
 await h.call({type:'offscreen-stop'});
});

test('desktop recovery retries an interrupted preview when no newer work exists',async()=>{
 const h=harness();
 await h.call({type:'offscreen-start',session:'preview-retry',streamId:'test',recording:true,mode:'desktop'});
 const vad=h.workers.find(w=>w.url.startsWith('vad'));
 vad.onmessage({data:{type:'ready'}});
 const job={id:1,utteranceId:1,final:false,epoch:0,audio:new Float32Array(16000).fill(.1),audioEndAt:Date.now(),speechAt:Date.now()-500,speechSeconds:1,voicedSeconds:1,sampleCount:16000};
 h.speech[0].onmessage({data:{type:'ready',model:'local',dtype:'q4'}});
 vad.onmessage({data:{type:'segment',job}});
 h.speech[0].onmessage({data:{type:'error',error:'預覽期間中斷'}});
 h.fire(250);h.speech[1].onmessage({data:{type:'ready',model:'local',dtype:'q4'}});
 assert.equal(h.speech[1].posts.at(-1).id,1,'the still-useful preview is retried');
 await h.call({type:'offscreen-stop'});
});
