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
