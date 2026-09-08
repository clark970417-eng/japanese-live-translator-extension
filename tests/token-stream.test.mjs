import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CaptionTokenStream} from '../token-stream.mjs';
import {Agreement,DecodeQueue} from '../streaming.mjs';
test('Japanese tokens emit before end, skip prompt, throttle and avoid broken characters',()=>{
 let clock=0;const output=[];
 const tokenizer={decode:tokens=>tokens.map(n=>({1:'こんに',2:'ちは',3:'、皆',4:'さん',5:'\ufffd'})[n]).join('')};
 const s=new CaptionTokenStream(tokenizer,t=>output.push(t),()=>clock);
 s.put([[999]]);s.put([[1]]);assert.equal(output.length,0);
 s.put([[2]]);assert.deepEqual(output,['こんにちは']);
 s.put([[3]]);assert.equal(output.length,1);
 clock=301;s.put([[4]]);assert.equal(output.at(-1),'こんにちは、皆さん');
 s.put([[5]]);s.end();assert.equal(output.length,2);
});
test('partial output does not confirm itself or rewind the previous decode',()=>{
 const a=new Agreement();const job={id:1,sampleCount:16000,final:false};
 assert.equal(a.preview('こんにちは',job).provisional,true);
 assert.equal(a.accept('こんにちは',job).stableText,'');
 assert.equal(a.preview('こんに',{...job,sampleCount:32000}),null);
 assert.equal(a.preview('こんにちは皆さん',{...job,sampleCount:32000}).text,'こんにちは皆さん');
 assert.equal(a.accept('こんにちは皆さん',{...job,sampleCount:32000}).stableText,'こんにちは');
});
test('expired queued audio cannot block the fresh job behind it',()=>{
 const q=new DecodeQueue();q.push({id:1,epoch:1,audioEndAt:0});q.push({id:2,epoch:1,audioEndAt:4900});
 assert.equal(q.takeFresh(5000,1).id,2);assert.equal(q.dropped,1);
});
test('token preview removes already decoded sentences even when punctuation changes',()=>{
 const a=new Agreement();a.accept('皆さん、こんにちは。今日は晴れです。',{id:1,sampleCount:16000});
 assert.equal(a.preview('皆さんこんにちは今日は晴れです。また遊びましょう',{id:1,sampleCount:32000}).text,'また遊びましょう');
 assert.equal(a.preview('みなさんこんにちは今日は晴れですまた遊びましょう',{id:1,sampleCount:32000}),null);
});
