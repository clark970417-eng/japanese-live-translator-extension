import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {SpeechWindows} from '../streaming.mjs';
import {RecordingQueue} from '../recording-queue.mjs';
import {ResultGate} from '../stream-core.mjs';
import {CueCursor} from '../cue-cursor.mjs';
import * as policy from '../translation-policy.mjs';

/** Speech evidence for the companion's outro check: seconds of a job the VAD
 * scored at the 0.30 onset probability, carried with that job's audio. */
const frame=()=>new Float32Array(512).fill(.2);

test('speech seconds count only onset-probability frames of the job they describe',()=>{
 const w=new SpeechWindows(),jobs=[];
 const push=p=>{const j=w.push(frame(),p);if(j)jobs.push(j);};
 for(let i=0;i<4;i++)push(.9);          // onset: 2 frames start the utterance, 2 more voiced
 for(let i=0;i<30;i++)push(.2);         // active speech below onset probability
 for(let i=0;i<25;i++)push(.01);        // silence ends the utterance
 const final=jobs.find(j=>j.final);
 assert.equal(final.speechSeconds,4*512/16000);
 assert.ok(final.voicedSeconds>final.speechSeconds,'the active threshold counts more than the onset one');
 for(let i=0;i<3;i++)push(.9);
 for(let i=0;i<6;i++)push(.2);          // enough voiced audio for the window to be sent
 for(let i=0;i<25;i++)push(.01);
 const next=jobs.filter(j=>j.final).at(-1);
 assert.notEqual(next.utteranceId,final.utteranceId);
 assert.equal(next.speechSeconds,3*512/16000,'a new utterance starts its own count');
});

test('a cut long utterance restarts the count for the next window',()=>{
 const w=new SpeechWindows();w.maxSamples=16000;w.overlapFrames=0;const jobs=[];
 for(let i=0;i<60;i++){const j=w.push(frame(),.9);if(j)jobs.push(j);}
 const cut=jobs.find(j=>j.final),after=jobs.find(j=>j.id===cut.id+1);
 assert.ok(cut.speechSeconds<=cut.audio.length/16000+1e-9);
 assert.ok(after.speechSeconds<=after.audio.length/16000+1e-9,'the count never exceeds its own audio');
});

test('offscreen and the desktop worker forward speech seconds with each decode',async()=>{
 let sent;
 const chrome={runtime:{onMessage:{addListener(){},removeListener(){}},sendMessage:async m=>{sent=m;return {ok:true,text:{text:''}};}}};
 const src=fs.readFileSync(new URL('../desktop-worker.js',import.meta.url),'utf8').replace(/^export /m,'');
 const context={chrome,crypto:globalThis.crypto,btoa,Uint8Array,String};
 vm.runInNewContext(src+'\nthis.DesktopWorker=DesktopWorker;',context);
 const worker=new context.DesktopWorker();
 worker.postMessage({type:'decode',id:1,audio:new Float32Array(4),segment:'1:1',final:true,speechSeconds:1.5});
 assert.equal(sent.speechSeconds,1.5);
 const offscreen=fs.readFileSync(new URL('../offscreen.js',import.meta.url),'utf8');
 assert.match(offscreen,/type:'decode'[^}]*speechSeconds:job\.speechSeconds/);
});

test('background forwards only a non-negative finite speech value to the companion',async()=>{
 let listener;const requests=[];
 class NativeClient{async request(op,fields){requests.push({op,fields});return op==='decode'?{text:'',translated:'',pending:true}:{};}}
 const chrome={storage:{local:{get:async()=>({speechMode:'desktop',subtitleSettings:{captionMode:'realtime'},recordedCaptions:[]}),set:async()=>{}}},tabs:{sendMessage:async()=>{},onRemoved:{addListener(){}}},offscreen:{hasDocument:async()=>true},tabCapture:{getMediaStreamId:async()=>'stream'},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},sendMessage:async()=>({ok:true})}};
 const source=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(source,{chrome,NativeClient,RecordingQueue,ResultGate,CueCursor,...policy,URLSearchParams,AbortSignal,AbortController,Date});
 const call=(m,s={})=>new Promise(resolve=>listener(m,s,resolve));
 await call({type:'subtitle-control',action:'start',tabId:7});
 const offscreen={url:'chrome-extension://test/offscreen.html'};
 const values=[1.25,0,undefined,-1,'2',null,Infinity];
 for(const [i,speechSeconds] of values.entries())await call({type:'desktop-request',op:'decode',segment:String(i),utterance:String(i),final:true,audio:'test',speechSeconds,speechAt:Date.now(),audioEndAt:Date.now()},offscreen);
 const forwarded=requests.filter(r=>r.op==='decode').map(r=>'speechSeconds' in r.fields?r.fields.speechSeconds:'absent');
 assert.deepEqual(forwarded,[1.25,0,'absent','absent','absent','absent','absent']);
 await call({type:'subtitle-control',action:'stop'});
});
