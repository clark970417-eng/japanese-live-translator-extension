import {test} from 'node:test';import assert from 'node:assert/strict';
import {RecordingQueue} from '../recording-queue.mjs';
import {DecodeQueue,SpeechWindows} from '../streaming.mjs';
const tick=()=>new Promise(r=>setTimeout(r,0));
test('recording persists before translating, keeps new speech during slow API, rotates four in translation order',async()=>{
 let saved=[],pending=[];const q=new RecordingQueue({save:async entries=>saved=entries,translate:text=>new Promise(resolve=>pending.push({text,resolve}))});
 for(let i=1;i<=6;i++)await q.add({key:''+i,group:''+i,session:'s',original:'句'+i});
 assert.equal(saved.length,6);assert.equal(pending.length,1);assert.deepEqual(q.rows('s').map(e=>e.original),['句3','句4','句5','句6']);
 for(let i=0;i<6;i++){assert.equal(pending[i].text,'句'+(i+1));pending[i].resolve('譯'+(i+1));await tick();}
 assert.deepEqual(q.rows('s').map(e=>e.original),['句3','句4','句5','句6']);assert.ok(saved.every(e=>e.state==='done'));
 await q.add({key:'6',group:'6',session:'s',original:'句6'});assert.equal(q.entries.length,6);
});
test('failed translations persist and can retry; continued acoustic chunks share one pause-delimited row',async()=>{
 let fail=true;const q=new RecordingQueue({save:async()=>{},translate:async()=>{if(fail)throw Error('offline');return '中文';}});
 await q.add({key:'1',group:'one-breath',session:'s',original:'前半'});await tick();assert.equal(q.failed,1);
 fail=false;await q.retry();await tick();await q.add({key:'2',group:'one-breath',session:'s',original:'後半'});await tick();
 assert.equal(q.rows('s').length,1);assert.equal(q.rows('s')[0].original,'前半 後半');
 const recovered=new RecordingQueue({save:async()=>{},translate:async()=> '恢復'});await recovered.restore([{key:'3',group:'g',session:'s',original:'待翻',state:'working'}]);await tick();assert.equal(recovered.entries[0].translated,'恢復');
});
test('recording audio queue retains old final jobs rather than dropping them for latency',()=>{
 const q=new DecodeQueue({retainFinals:true});for(let id=1;id<=8;id++)q.push({id,final:true,epoch:1,audioEndAt:0});
 q.push({id:9,final:false,epoch:1,audioEndAt:0});assert.equal(q.jobs.length,8);assert.equal(q.takeFresh(90000,1).id,1);assert.equal(q.dropped,0);
});
test('continuous speech chunks share an utterance, pause starts the next utterance',()=>{
 const windows=new SpeechWindows();const jobs=[];for(let i=0;i<800;i++){const job=windows.push(new Float32Array(512),.9);if(job?.final)jobs.push(job);}assert.ok(jobs.length>=2);assert.equal(jobs[0].utteranceId,jobs[1].utteranceId);
 for(let i=0;i<22;i++)windows.push(new Float32Array(512),0);
 let next;for(let i=0;i<45;i++){const job=windows.push(new Float32Array(512),.9);if(job)next=job;}assert.ok(next.utteranceId>jobs[0].utteranceId);
});

test('stalled translation times out and new speech still rotates the visible four',async()=>{
 const q=new RecordingQueue({save:async()=>{},timeoutMs:15,translate:text=>text==='1'?new Promise(()=>{}):Promise.resolve('中'+text)});
 for(let i=1;i<=5;i++)await q.add({key:String(i),group:String(i),session:'s',original:String(i)});
 assert.deepEqual(q.rows('s').map(e=>e.original),['2','3','4','5']);
 await new Promise(r=>setTimeout(r,40));assert.equal(q.entries[0].state,'failed');assert.equal(q.entries[4].translated,'中5');assert.equal(q.pending,0);
});
