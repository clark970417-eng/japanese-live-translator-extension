import {test} from 'node:test';
import {DecodeQueue} from '../streaming.mjs';
import assert from 'node:assert/strict';
import {ResultGate,cleanText} from '../stream-core.mjs';
test('old translation cannot overwrite revised Japanese',()=>{const g=new ResultGate(),s=g.session;const a=g.accept(s,1,'こんにちは');const b=g.accept(s,1,'こんにちは皆さん');assert.equal(g.finish(s,a,'你好'),false);assert.equal(g.finish(s,b,'大家好'),true);});
test('stop/restart rejects old callbacks',()=>{const g=new ResultGate(),s=g.session;const a=g.accept(s,1,'ありがとう');g.reset();assert.equal(g.accept(s,2,'古い'),null);assert.equal(g.finish(s,a,'謝謝'),false);});
test('same words spoken in separate segments remain valid',()=>{const g=new ResultGate(),s=g.session;assert.ok(g.accept(s,1,'ありがとう'));assert.ok(g.accept(s,2,'ありがとう'));assert.equal(g.accept(s,1,'古い'),null);});
test('duplicate revision ignored, real double repetition preserved',()=>{const g=new ResultGate(),s=g.session;g.accept(s,1,'はいはい');assert.equal(g.accept(s,1,'はいはい'),null);assert.equal(cleanText('はいはい'),'はいはい');assert.equal(cleanText('このように、このように、このように、このように、'),'');});
import {Segmenter} from '../stream-core.mjs';
test('quiet voice captured; silence does not create subtitles',()=>{const s=new Segmenter(1000);for(let i=0;i<30;i++)assert.equal(s.push(new Float32Array(100),0),null);let result;for(let i=0;i<15;i++){const j=s.push(new Float32Array(100).fill(.0015),.0015);if(j)result=j;}assert.ok(result);});
test('short phrase flushed on silence even before regular decode interval',()=>{const s=new Segmenter(1000);let result;for(let i=0;i<4;i++)s.push(new Float32Array(100),.02,3);for(let i=0;i<5;i++){const j=s.push(new Float32Array(100),0,3);if(j)result=j;}assert.ok(result.final);assert.equal(result.id,1);});
test('continuous audio bounded and final decode never lost to interval',()=>{const s=new Segmenter(1000);const jobs=[];for(let i=0;i<100;i++){const j=s.push(new Float32Array(100),.03,3);if(j)jobs.push(j);}assert.ok(jobs.some(x=>x.final));assert.ok(jobs.every(x=>x.audio.length<=4000));assert.ok(jobs.at(-1).id>1);});

import {SpeechResultFilter} from '../stream-core.mjs';
test('silence hallucination needs independent evidence; genuine speech is retained',()=>{
 const f=new SpeechResultFilter();
 const j={id:1,voicedSeconds:1,sampleCount:16000};
 assert.equal(f.accept('ご視聴ありがとうございました',j),'');
 assert.equal(f.accept('ご視聴ありがとうございました',j),'');
 assert.equal(f.accept('ご視聴ありがとうございました',{...j,sampleCount:24000}),'ご視聴ありがとうございました');
 f.reset();assert.equal(f.accept('ご視聴ありがとうございました',{...j,id:2}),'');
 assert.equal(f.accept('こんにちは',{...j,voicedSeconds:.1}),'');
 assert.equal(f.accept('こんにちは',j),'こんにちは');
});

test('desktop recording retains the latest preview without displacing accepted finals',()=>{
 const q=new DecodeQueue({retainFinals:true,retainInterim:true});
 q.push({id:1,final:true,sampleCount:100});
 q.push({id:2,final:false,sampleCount:120});
 q.push({id:2,final:false,sampleCount:140});
 q.push({id:2,final:false,sampleCount:130});
 assert.deepEqual(q.jobs.map(x=>[x.id,x.sampleCount]),[[1,100],[2,140]]);
 q.push({id:2,final:true,sampleCount:160});
 q.push({id:2,final:false,sampleCount:180});
 q.push({id:3,final:false,sampleCount:200});
 assert.deepEqual(q.jobs.map(x=>[x.id,x.final]),[[1,true],[2,true],[3,false]]);
 assert.equal(q.shift().id,1);
 assert.equal(q.shift().id,2);
 assert.equal(q.shift().id,3);
});

test('desktop recording can start a waiting preview immediately when busy work finishes',()=>{
 const q=new DecodeQueue({retainFinals:true,retainInterim:true});
 q.push({id:2,epoch:3,final:false,sampleCount:100,audioEndAt:1000});
 assert.equal(q.takeFresh(1300,3)?.id,2);
 assert.equal(q.jobs.length,0);
});
