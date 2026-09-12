import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {SpeechWindows} from '../streaming.mjs';

test('missing audio input delivers silence and separates successive utterances',()=>{
 let Processor;const frames=[];
 vm.runInNewContext(fs.readFileSync(new URL('../audio-worklet.js',import.meta.url),'utf8'),{
  AudioWorkletProcessor:class {constructor(){this.port={postMessage:frame=>frames.push(frame.slice())};}},
  Float32Array,registerProcessor:(_name,implementation)=>Processor=implementation
 });
 const capture=new Processor();
 const speech=[ [new Float32Array(128).fill(.1)] ];
 for(let i=0;i<160;i++)capture.process(speech);
 for(let i=0;i<160;i++)capture.process([]);
 for(let i=0;i<160;i++)capture.process(speech);
 for(let i=0;i<160;i++)capture.process([]);
 assert.ok(frames.some(frame=>frame.every(x=>x===0)));
 const windows=new SpeechWindows(),finals=[];
 for(const frame of frames){const job=windows.push(frame,frame.some(x=>x!==0)?.9:0);if(job?.utteranceEnd)finals.push(job);}
 assert.equal(finals.length,2);
 assert.notEqual(finals[0].utteranceId,finals[1].utteranceId);
});

test('stop flushes the partial worklet block once and stops accepting samples',()=>{
 let Processor;const messages=[];
 vm.runInNewContext(fs.readFileSync(new URL('../audio-worklet.js',import.meta.url),'utf8'),{
  AudioWorkletProcessor:class{constructor(){this.port={postMessage:m=>messages.push(m)};}},
  Float32Array,registerProcessor:(_name,implementation)=>Processor=implementation
 });
 const capture=new Processor();
 capture.process([[new Float32Array(128).fill(.2)]]);
 capture.port.onmessage({data:{type:'flush'}});
 assert.equal(messages[0].length,128);
 assert.ok(messages[0].every(x=>Math.abs(x-.2)<1e-6));
 assert.equal(messages[1].type,'flushed');
 assert.equal(capture.process([[new Float32Array(128).fill(.3)]]),false);
 capture.port.onmessage({data:{type:'flush'}});
 assert.equal(messages.length,2);
});

test('manual speech boundary retains the spoken tail without waiting for silence',()=>{
 const windows=new SpeechWindows();
 for(let i=0;i<16;i++)windows.push(new Float32Array(512).fill(.1),.9);
 const final=windows.finish();
 assert.equal(final.final,true);assert.equal(final.utteranceEnd,true);
 assert.equal(final.audio.length,8192);assert.equal(final.endSample,8192);
 assert.equal(windows.finish(),null);
 const quiet=new SpeechWindows();for(let i=0;i<20;i++)quiet.push(new Float32Array(512),0);
 assert.equal(quiet.finish(),null);
});
