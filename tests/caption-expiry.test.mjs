import {RecordingQueue} from '../recording-queue.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {CueCursor} from '../cue-cursor.mjs';
import {ResultGate} from '../stream-core.mjs';
import * as policy from '../translation-policy.mjs';
test('identical ASR does not extend expiry; later utterance can repeat; native end clears pending results',async()=>{
 let listener,session,now=Date.now(),finish;const updates=[];
 class Clock extends Date{static now(){return now;}}
 const chrome={storage:{local:{set:async()=>{},get:async()=>({subtitleSettings:{holdSeconds:3,captionMode:'realtime'}})}},tabs:{sendMessage:async(id,m)=>updates.push(m),onRemoved:{addListener(){}}},offscreen:{hasDocument:async()=>true},tabCapture:{getMediaStreamId:async()=> 'stream'},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},sendMessage:async m=>{if(m.type==='offscreen-start')session=m.session;return{ok:true};}}};
 const fetch=()=>new Promise(resolve=>finish=()=>resolve({ok:true,json:async()=>[[['今天的天氣']]]}));
 const src=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{RecordingQueue,chrome,ResultGate,CueCursor,...policy,URLSearchParams,AbortSignal,AbortController,Date:Clock,console,fetch});
 const call=(m,s={})=>new Promise(resolve=>listener(m,s,resolve));const flush=()=>new Promise(r=>setTimeout(r,0));
 const say=id=>listener({type:'speech-result',session,id,text:'こんにちは'},{url:'chrome-extension://test/offscreen.html'},()=>{});
 const current=async()=> (await call({type:'subtitles'},{tab:{id:7}})).text.items;
 await call({type:'subtitle-control',action:'start',tabId:7});say(1);await flush();
 const first=(await current())[0];assert.equal(first.expiresAt,now/1000+3);
 now+=2000;say(1);await flush();assert.equal((await current())[0].expiresAt,first.expiresAt);
 now+=1100;assert.equal((await current()).length,0,'silence clears after three seconds');
 say(2);await flush();assert.equal((await current()).length,1,'a new utterance may repeat the same word');
 const sender={tab:{id:7},frameId:0,url:'https://www.youtube.com/watch?v=test'};
 await call({type:'native-caption',text:'今日の天気ですね'},sender);await flush();
 await call({type:'native-caption',text:''},sender);finish();await flush();
 assert.equal((await current()).length,0,'late translation cannot resurrect ended native cue');
});
