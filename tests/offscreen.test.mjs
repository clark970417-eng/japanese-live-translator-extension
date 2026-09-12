import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {SpeechResultFilter,cleanText} from '../stream-core.mjs';
import {Agreement,DecodeQueue,Measurements} from '../streaming.mjs';
test('real controller forwards partial before final and rejects partial after seek/reset',async()=>{
 let listener;const workers=[],messages=[];
 class Worker{constructor(url){this.url=url;workers.push(this);}postMessage(){}terminate(){}}
 class AudioContext{constructor(){this.sampleRate=48000;this.audioWorklet={addModule:async()=>{}};}resume(){}createMediaStreamSource(){return {connect(){},disconnect(){}};}close(){return Promise.resolve();}}
 class AudioWorkletNode{constructor(){this.port={};}connect(){}disconnect(){}}
 const track={stop(){}};
 const chrome={runtime:{sendMessage:async m=>messages.push(m),onMessage:{addListener:f=>listener=f}}};
 const src=fs.readFileSync(new URL('../offscreen.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{chrome,Worker,AudioContext,AudioWorkletNode,navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})}},SpeechResultFilter,cleanText,Agreement,DecodeQueue,Measurements,Date,performance,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});
 const call=m=>new Promise(r=>listener(m,{},r));
 await call({type:'offscreen-start',session:'one',streamId:'test'});
 const asr=workers.find(w=>w.url.startsWith('speech')),vad=workers.find(w=>w.url.startsWith('vad'));
 asr.onmessage({data:{type:'ready',model:'test',dtype:'fp32'}});vad.onmessage({data:{type:'ready'}});
 const job={id:1,epoch:0,audio:new Float32Array(16000),audioEndAt:Date.now(),speechAt:Date.now()-1000,voicedSeconds:1,sampleCount:16000};
 vad.onmessage({data:{type:'segment',job}});
 asr.onmessage({data:{type:'partial',id:1,text:'こんにちは皆さん'}});
 assert.equal(messages.at(-1).type,'speech-result');assert.equal(messages.at(-1).partial,true);
 const count=messages.filter(m=>m.type==='speech-result').length;
 await call({type:'offscreen-reset',session:'two'});
 asr.onmessage({data:{type:'partial',id:1,text:'古い字幕です'}});
 asr.onmessage({data:{type:'result',id:1,text:'古い字幕です'}});
 assert.equal(messages.filter(m=>m.type==='speech-result').length,count);
 await call({type:'offscreen-stop'});
});

for(const mode of ['browser','desktop']) test(`recording retries retained audio across decoder recovery (${mode})`,async()=>{
 let listener,capture;const workers=[],messages=[],timers=[];
 class Worker{constructor(url){this.url=url;workers.push(this);}postMessage(m){this.sent=m;}terminate(){}}
 class AudioContext{constructor(){this.sampleRate=48000;this.audioWorklet={addModule:async()=>{}};}resume(){}createMediaStreamSource(){return {connect(){},disconnect(){}};}close(){return Promise.resolve();}}
 class AudioWorkletNode{constructor(){this.port={};capture=this;}connect(){}disconnect(){}}
 const track={stop(){}};
 const chrome={runtime:{sendMessage:async m=>messages.push(m),onMessage:{addListener:f=>listener=f}}};
 const src=fs.readFileSync(new URL('../offscreen.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{chrome,Worker,DesktopWorker:class extends Worker{constructor(){super('speech-desktop');}},AudioContext,AudioWorkletNode,navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})}},SpeechResultFilter,cleanText,Agreement,DecodeQueue,Measurements,Date,performance,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},setInterval:()=>1,clearInterval(){}});
 const call=m=>new Promise(r=>listener(m,{},r));
 await call({type:'offscreen-start',session:'one',streamId:'test',recording:true,mode});
 const asr=workers.find(w=>w.url.startsWith('speech')),vad=workers.find(w=>w.url.startsWith('vad'));
 asr.onmessage({data:{type:'ready',model:'test',dtype:'fp32'}});vad.onmessage({data:{type:'ready'}});
 capture.port.onmessage({data:new Float32Array(1024).fill(.1)});
 vad.onmessage({data:{type:'processed',probability:.9,vadMs:1}});
 const job={id:1,utteranceId:1,final:true,epoch:1,audio:new Float32Array(16000).fill(.1),audioEndAt:Date.now(),speechAt:Date.now()-1000,voicedSeconds:1,sampleCount:16000};
 vad.onmessage({data:{type:'segment',job}});
 timers.filter(t=>t.ms===(mode==='desktop'?60000:15000)).at(-1).fn();
 const replacement=workers.filter(w=>w.url.startsWith('speech')).at(-1);assert.notEqual(replacement,asr);
 capture.port.onmessage({data:new Float32Array(1024).fill(.1)});
 assert.equal(vad.sent.type,'audio');
 vad.onmessage({data:{type:'processed',probability:.9,vadMs:1}});
 vad.onmessage({data:{type:'segment',job:{...job,id:2,audio:job.audio.slice()}}});
 replacement.onmessage({data:{type:'ready',model:'test',dtype:'fp32'}});
 assert.equal(replacement.sent.id,1);assert.equal(replacement.sent.audio.length,16000);
 // Real audio keeps arriving during recovery, including before the retry completes.
 capture.port.onmessage({data:new Float32Array(1024).fill(.1)});
 await replacement.onmessage({data:{type:'result',id:1,text:'こんにちは皆さん'}});
 assert.equal(replacement.sent.id,2);assert.equal(messages.some(m=>m.type==='speech-error'),false);
 if(mode==='desktop'){
  vad.onmessage({data:{type:'segment',job:{...job,id:3,utteranceId:3,final:false,sampleCount:20000}}});
  assert.equal(replacement.sent.id,2);
  await replacement.onmessage({data:{type:'result',id:2,text:'次の文です'}});
  // No new VAD tick is required: the waiting preview starts on decoder completion.
  assert.equal(replacement.sent.id,3);
 }
 await call({type:'offscreen-stop'});
});

for(const failedDelivery of [false,true]) test(`stop drains queued speech and final audio before acknowledging (delivery failure: ${failedDelivery})`,async()=>{
 let listener,capture,releaseDelivery;const workers=[],messages=[];let stopped=0,delivering=0;
 class Worker{constructor(url){this.url=url;this.posts=[];workers.push(this);}postMessage(m){this.posts.push(m);}terminate(){this.terminated=true;}}
 class AudioContext{constructor(){this.sampleRate=48000;this.audioWorklet={addModule:async()=>{}};}resume(){}createMediaStreamSource(){return {connect(){},disconnect(){}};}close(){return Promise.resolve();}}
 class AudioWorkletNode{constructor(){this.port={postMessage:m=>{this.command=m;}};capture=this;}connect(){}disconnect(){}}
 const track={stop(){stopped++;}};
 const chrome={runtime:{sendMessage:async m=>{messages.push(m);if(m.type==='speech-result'&&m.final){delivering++;if(delivering===3){await new Promise(r=>releaseDelivery=r);if(failedDelivery)throw new Error('connection lost');}}return {ok:true};},onMessage:{addListener:f=>listener=f}}};
 const src=fs.readFileSync(new URL('../offscreen.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{chrome,Worker,AudioContext,AudioWorkletNode,navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})}},SpeechResultFilter,cleanText,Agreement,DecodeQueue,Measurements,Date,performance,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});
 const call=m=>new Promise(r=>listener(m,{},r));
 await call({type:'offscreen-start',session:'drain',streamId:'test',recording:true});
 const asr=workers[1],vad=workers[0];
 await asr.onmessage({data:{type:'ready',model:'test'}});vad.onmessage({data:{type:'ready'}});
 capture.port.onmessage({data:new Float32Array(1024).fill(.1)});
 vad.onmessage({data:{type:'processed',epoch:1,probability:.9,vadMs:1}});
 const job=id=>({id,utteranceId:id,final:true,utteranceEnd:true,epoch:1,audio:new Float32Array(16000).fill(.1),audioEndAt:Date.now(),speechAt:Date.now()-1000,voicedSeconds:1,sampleCount:16000});
 vad.onmessage({data:{type:'segment',job:job(1)}});vad.onmessage({data:{type:'segment',job:job(2)}});
 let done=false;const stopping=call({type:'offscreen-stop',drain:true}).then(r=>{done=true;return r;});
 assert.ok(stopped>0);assert.equal(asr.terminated,undefined);assert.equal(capture.command.type,'flush');
 capture.port.onmessage({data:new Float32Array(128).fill(.1)});
 capture.port.onmessage({data:{type:'flushed'}});
 assert.equal(vad.posts.at(-1).type,'audio');
 vad.onmessage({data:{type:'processed',epoch:1,probability:.9,vadMs:1}});
 assert.equal(vad.posts.at(-1).type,'flush');
 vad.onmessage({data:{type:'segment',job:job(3)}});vad.onmessage({data:{type:'flushed',epoch:1}});
 await asr.onmessage({data:{type:'result',id:1,text:'今日はいい天気ですね'}});
 assert.equal(asr.posts.at(-1).id,2);assert.equal(done,false);
 await asr.onmessage({data:{type:'result',id:2,text:'明日は学校に行きます'}});
 assert.equal(asr.posts.at(-1).id,3);
 const final=asr.onmessage({data:{type:'result',id:3,text:'また来週会いましょう'}});
 await Promise.resolve();assert.equal(done,false);assert.equal(asr.terminated,undefined);
 releaseDelivery();await final;const result=await stopping;
 assert.equal(result.ok,!failedDelivery);assert.equal(asr.terminated,true);assert.equal(delivering,3);
 if(failedDelivery)assert.match(result.error,/傳送失敗/);
});
