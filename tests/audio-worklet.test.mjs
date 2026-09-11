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
