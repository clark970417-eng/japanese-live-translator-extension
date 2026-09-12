import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
test('Silero input carries previous 64 samples and clears context on reset',async()=>{
 const inputs=[];const self={};const ort={env:{wasm:{}},Tensor:class{constructor(type,data,dims){this.data=data;this.dims=dims;}dispose(){}},InferenceSession:{create:async()=>({run:async({input})=>{inputs.push({data:Array.from(input.data),dims:input.dims});return{stateN:{dispose(){}},output:{data:[.9],dispose(){}}};}})}};
 const source=fs.readFileSync(new URL('../vad-worker.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',"'https://example.test/vad-worker.js'");
 vm.runInNewContext(source,{ort,self,URL,Float32Array,BigInt64Array,performance,postMessage(){},Resampler:class{push(x){return x;}},SpeechGain:class{push(x){return x;}},SpeechWindows:class{push(){return null;}}});
 const send=async(data)=>{self.onmessage({data});await new Promise(r=>setTimeout(r,0));};
 await send({type:'init',epoch:0,origin:0,rate:16000});await send({type:'audio',epoch:0,audio:new Float32Array(512).fill(.2)});await send({type:'audio',epoch:0,audio:new Float32Array(512).fill(.4)});
 assert.equal(inputs[0].data.length,576);assert.ok(inputs[0].data.slice(0,64).every(x=>x===0));assert.ok(inputs[1].data.slice(0,64).every(x=>Math.abs(x-.2)<1e-6));
 await send({type:'reset',epoch:1,origin:0,rate:16000});await send({type:'audio',epoch:1,audio:new Float32Array(512)});assert.ok(inputs[2].data.every(x=>x===0));
});

test('flush preserves voiced tail without requiring silence and ignores stale sessions',async()=>{
 const {SpeechWindows}=await import('../streaming.mjs');const messages=[],self={};
 const ort={env:{wasm:{}},Tensor:class{constructor(type,data,dims){this.data=data;}dispose(){}},InferenceSession:{create:async()=>({run:async()=>({stateN:{dispose(){}},output:{data:[.9],dispose(){}}})})}};
 const source=fs.readFileSync(new URL('../vad-worker.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',"'https://example.test/vad-worker.js'");
 vm.runInNewContext(source,{ort,self,URL,Float32Array,BigInt64Array,performance,postMessage:m=>messages.push(m),Resampler:class{push(x){return x;}},SpeechGain:class{push(x){return x;}},SpeechWindows});
 const send=async data=>{self.onmessage({data});await new Promise(r=>setTimeout(r,0));};
 await send({type:'init',epoch:4,origin:1000,rate:16000});
 await send({type:'audio',epoch:4,audio:new Float32Array(8192+128).fill(.1)});
 await send({type:'flush',epoch:3});assert.equal(messages.some(m=>m.type==='flushed'),false);
 await send({type:'flush',epoch:4});
 const finals=messages.filter(m=>m.type==='segment'&&m.job.final);assert.equal(finals.length,1);
 assert.equal(finals[0].job.audio.length,8704);assert.equal(finals[0].job.utteranceEnd,true);
 assert.equal(messages.at(-1).type,'flushed');assert.equal(messages.at(-1).epoch,4);
 await send({type:'flush',epoch:4});assert.equal(messages.filter(m=>m.type==='segment'&&m.job.final).length,1);
});
