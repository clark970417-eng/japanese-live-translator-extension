import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {CueCursor} from '../cue-cursor.mjs';
import {ResultGate} from '../stream-core.mjs';
import * as policy from '../translation-policy.mjs';
test('draft mode exposes plain fallback and uses the viewer prompt when a provider succeeds',async()=>{
 let listener,configured=false,body;
 const chrome={storage:{local:{get:async()=>configured?{openrouterKey:'test-only'}:{}}},tabs:{onRemoved:{addListener(){}}},runtime:{onMessage:{addListener:f=>listener=f}}};
 const fetch=async(url,options)=>{
  if(String(url).includes('chat/completions')){body=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'明日は見に来られないかもしれません。'}}]})};}
  return {ok:true,json:async()=>[[['明日は来られないかもしれません。']]]};
 };
 const src=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{chrome,ResultGate,CueCursor,...policy,URLSearchParams,AbortSignal,AbortController,Date,fetch});
 const call=text=>new Promise(resolve=>listener({type:'make-draft',text},{},resolve));
 const fallback=await call('我明天可能沒辦法來看');assert.equal(fallback.ok,true);assert.match(fallback.text.mode,/一般機翻/);
 configured=true;
 const styled=await call('我明天可能沒辦法來看');assert.equal(styled.text.mode,'可愛禮貌');
 assert.equal(body.messages[0].content,policy.viewerPrompt);assert.equal(body.messages[1].content,'我明天可能沒辦法來看');
 assert.equal((await call('我先去睡覺了')).text.mode,'校對短句');
});
test('NVIDIA draft uses supported non-thinking model and never exposes truncated reasoning',async()=>{
 let listener,bad=false;const bodies=[];
 const chrome={storage:{local:{get:async()=>({nvidiaKey:'test-only'})}},tabs:{onRemoved:{addListener(){}}},runtime:{onMessage:{addListener:f=>listener=f}}};
 const fetch=async(url,options)=>{
  if(String(url).includes('chat/completions')){bodies.push(JSON.parse(options.body));return {ok:true,json:async()=>({choices:[{finish_reason:bad?'length':'stop',message:{content:bad?'Thinking...':'明日も楽しみにしていますね！'}}]})};}
  return {ok:true,json:async()=>[[['また明日。']]]};
 };
 const src=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{chrome,ResultGate,CueCursor,...policy,URLSearchParams,AbortSignal,AbortController,Date,fetch});
 const call=text=>new Promise(resolve=>listener({type:'make-draft',text},{},resolve));
 assert.equal((await call('明天也很期待你的新遊戲直播')).text.mode,'可愛禮貌');
 assert.equal(bodies[0].model,'nvidia/nemotron-3.5-lightning-30b-a3b');
 assert.equal(bodies[0].chat_template_kwargs.enable_thinking,false);
 bad=true;const result=await call('明天也想繼續看新的遊戲');assert.match(result.text.mode,/一般機翻/);assert.doesNotMatch(result.text.draft,/Thinking/);
});
