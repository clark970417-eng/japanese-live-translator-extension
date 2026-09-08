import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Resampler,SpeechWindows,SpeechGain,Agreement,DecodeQueue,Measurements,trimOverlap} from '../streaming.mjs';
test('gain preserves digital silence and bounds low-volume amplification',()=>{
 const gain=new SpeechGain();assert.ok(gain.push(new Float32Array(512)).every(x=>x===0));
 let out;for(let i=0;i<30;i++)out=gain.push(new Float32Array(512).fill(.001));
 assert.ok(out[0]>.01&&out[0]<=.012001);
 assert.ok(gain.push(new Float32Array(512).fill(.9)).every(x=>Math.abs(x)<=1));
});
test('resampling across arbitrary block boundaries preserves clock and amplitude',()=>{
 for(const rate of [44100,48000]){
  const r=new Resampler(rate);let out=[];
  for(let i=0;i<rate;i+=2048)out.push(...r.push(new Float32Array(Math.min(2048,rate-i)).fill(.12)));
  assert.equal(out.length,16000);assert.ok(out.every(x=>Math.abs(x-.12)<1e-6));
 }
});
test('non-speech never emits, including loud non-speech; short speech ends promptly',()=>{
 const w=new SpeechWindows(),frame=new Float32Array(512).fill(.8);
 for(let i=0;i<1000;i++)assert.equal(w.push(frame,.01),null);
 const jobs=[];for(let i=0;i<15;i++){const j=w.push(frame,.9);if(j)jobs.push(j);}
 for(let i=0;i<20;i++){const j=w.push(frame,.01);if(j)jobs.push(j);}
 assert.ok(jobs.at(-1).final);assert.ok(jobs.at(-1).voicedSeconds>=.4);
});
test('continuous speech bounded with real overlapping samples and increasing times',()=>{
 const w=new SpeechWindows(),jobs=[];
 for(let i=0;i<600;i++){const j=w.push(new Float32Array(512).fill(i),.9);if(j)jobs.push(j);}
 assert.ok(jobs.every(j=>j.audio.length<=192512));
 const final=jobs.find(j=>j.final),next=jobs.find(j=>j.id===final.id+1);
 assert.ok(next.overlap);assert.ok(next.startSample<final.endSample);
 assert.equal(next.audio[0],final.audio[final.audio.length-32768]);
});
test('local agreement confirms prefixes and rejects out-of-order revisions',()=>{
 assert.equal(trimOverlap('ありがとうございます。','ありがとうございます、またね'),'またね');
 const a=new Agreement();
 assert.equal(a.accept('今日はみんな',{id:1,sampleCount:10}).stableText,'');
 assert.equal(a.accept('今日はみんな来てくれて',{id:1,sampleCount:20}).stableText,'今日はみんな');
 assert.equal(a.accept('古い',{id:1,sampleCount:10}),null);
 assert.equal(a.accept('今日はありがとう',{id:1,sampleCount:30,final:true}).provisional,false);
 assert.equal(a.accept('ありがとうまたね',{id:2,sampleCount:40,overlap:true}).text,'またね');
 assert.equal(a.accept('ありがとう',{id:3,sampleCount:50}).text,'ありがとう');
});
test('decode queue retains final followed by latest partial with bounded overload',()=>{
 const q=new DecodeQueue();q.push({id:1,final:true});q.push({id:2});q.push({id:2,revision:2});
 assert.equal(q.shift().id,1);assert.equal(q.shift().revision,2);
 for(let i=0;i<100;i++)q.push({id:i});assert.equal(q.jobs.length,2);assert.equal(q.dropped,98);
});
test('latency measurements are bounded and report distributions',()=>{
 const m=new Measurements();for(let i=0;i<200;i++)m.add('decode',i);
 assert.equal(m.summary().decode.count,120);assert.ok(m.summary().decode.p95>180);
});
