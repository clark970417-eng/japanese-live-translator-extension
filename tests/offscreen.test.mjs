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

test('recording restarts timed-out decoder and retries preserved audio before following segment',async()=>{
 let listener;const workers=[],messages=[],timers=[];
 class Worker{constructor(url){this.url=url;workers.push(this);}postMessage(m){this.sent=m;}terminate(){}}
 class AudioContext{constructor(){this.sampleRate=48000;this.audioWorklet={addModule:async()=>{}};}resume(){}createMediaStreamSource(){return {connect(){},disconnect(){}};}close(){return Promise.resolve();}}
 class AudioWorkletNode{constructor(){this.port={};}connect(){}disconnect(){}}
 const track={stop(){}};
 const chrome={runtime:{sendMessage:async m=>messages.push(m),onMessage:{addListener:f=>listener=f}}};
 const src=fs.readFileSync(new URL('../offscreen.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{chrome,Worker,AudioContext,AudioWorkletNode,navigator:{mediaDevices:{getUserMedia:async()=>({getTracks:()=>[track],getAudioTracks:()=>[track]})}},SpeechResultFilter,cleanText,Agreement,DecodeQueue,Measurements,Date,performance,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},setInterval:()=>1,clearInterval(){}});
 const call=m=>new Promise(r=>listener(m,{},r));
 await call({type:'offscreen-start',session:'one',streamId:'test',recording:true});
 const asr=workers.find(w=>w.url.startsWith('speech')),vad=workers.find(w=>w.url.startsWith('vad'));
 asr.onmessage({data:{type:'ready',model:'test',dtype:'fp32'}});vad.onmessage({data:{type:'ready'}});
 const job={id:1,utteranceId:1,final:true,epoch:0,audio:new Float32Array(16000).fill(.1),audioEndAt:Date.now(),speechAt:Date.now()-1000,voicedSeconds:1,sampleCount:16000};
 vad.onmessage({data:{type:'segment',job}});
 timers.filter(t=>t.ms===15000).at(-1).fn();
 const replacement=workers.filter(w=>w.url.startsWith('speech')).at(-1);assert.notEqual(replacement,asr);
 vad.onmessage({data:{type:'segment',job:{...job,id:2,audio:job.audio.slice()}}});
 replacement.onmessage({data:{type:'ready',model:'test',dtype:'fp32'}});
 assert.equal(replacement.sent.id,1);assert.equal(replacement.sent.audio.length,16000);
 replacement.onmessage({data:{type:'result',id:1,text:'こんにちは皆さん'}});
 assert.equal(replacement.sent.id,2);assert.equal(messages.some(m=>m.type==='speech-error'),false);
 await call({type:'offscreen-stop'});
});
