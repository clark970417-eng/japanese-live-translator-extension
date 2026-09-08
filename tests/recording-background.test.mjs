import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
import {RecordingQueue} from '../recording-queue.mjs';import {ResultGate} from '../stream-core.mjs';import {CueCursor} from '../cue-cursor.mjs';import * as policy from '../translation-policy.mjs';
test('record mode receives following speech while translation waits and retains work after capture stops',async()=>{
 let hidden,listener,session,saved=[];const requests=[];
 const chrome={storage:{local:{get:async()=>({subtitleSettings:{captionMode:'record'},recordedCaptions:[]}),set:async v=>{saved=v.recordedCaptions||saved;if("captionsHidden" in v)hidden=v.captionsHidden;}}},tabs:{sendMessage:async()=>{},onRemoved:{addListener(){}}},offscreen:{hasDocument:async()=>true},tabCapture:{getMediaStreamId:async()=> 'stream'},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},sendMessage:async m=>{if(m.type==='offscreen-start'){session=m.session;assert.equal(m.recording,true);}return{ok:true};}}};
 const src=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{chrome,RecordingQueue,ResultGate,CueCursor,...policy,URLSearchParams,AbortSignal,AbortController,Date,fetch:()=>new Promise(resolve=>requests.push(()=>resolve({ok:true,json:async()=>[[['中文譯文']]]})))});
 const call=(m,s={})=>new Promise(resolve=>listener(m,s,resolve));const flush=()=>new Promise(r=>setTimeout(r,0));await call({type:'subtitle-control',action:'start',tabId:7});
 assert.equal(hidden,false);
 for(let id=1;id<=6;id++)listener({type:'speech-result',session,id,final:true,text:'テスト'+id},{url:'chrome-extension://test/offscreen.html'},()=>{});
 await flush();assert.equal(saved.length,6);assert.equal(requests.length,1);
 await call({type:'subtitle-control',action:'stop'});assert.equal(hidden,true);
 for(let i=0;i<6;i++){requests[i]();await flush();}
 assert.equal(saved.filter(e=>e.state==='done').length,6);assert.equal((await call({type:'recording-export'})).text.length,6);
});
