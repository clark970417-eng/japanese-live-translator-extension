import {RecordingQueue} from '../recording-queue.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {CueCursor} from '../cue-cursor.mjs';
import {ResultGate} from '../stream-core.mjs';
import {phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,TranslationMemo,firstTranslation,polishChinese} from '../translation-policy.mjs';
test('capture messages require active session and correct offscreen sender; stop clears subtitles',async()=>{
 let listener,session;const updates=[];
 const chrome={storage:{local:{get:async()=>({subtitleSettings:{captionMode:'realtime'}}),set:async()=>{}}},tabs:{sendMessage:async(id,m)=>updates.push(m),onRemoved:{addListener(){}}},offscreen:{hasDocument:async()=>true},tabCapture:{getMediaStreamId:async()=> 'stream'},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},sendMessage:async m=>{if(m.type==='offscreen-start')session=m.session;return{ok:true};}}};
 const src=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{RecordingQueue,chrome,ResultGate,CueCursor,phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,TranslationMemo,firstTranslation,polishChinese,URLSearchParams,AbortSignal,AbortController,Date,console,fetch:async()=>({ok:true,json:async()=>([[['大家好','こんにちは']]])})});
 const call=(m,s={})=>new Promise(resolve=>listener(m,s,resolve));
 await call({type:'subtitle-control',action:'start',tabId:7});
 listener({type:'speech-result',session,id:1,text:'こんにちは'},{url:'https://evil.example'},()=>{});
 assert.equal((await call({type:'subtitles'},{tab:{id:7}})).text.items.length,0);
 listener({type:'speech-result',session,id:1,text:'こんにちは'},{url:'chrome-extension://test/offscreen.html'},()=>{});
 await new Promise(r=>setTimeout(r,20));
 assert.equal((await call({type:'subtitles'},{tab:{id:7}})).text.items[0].translated,'你好！');
 assert.equal((await call({type:'subtitles'},{tab:{id:8}})).text.items.length,0);
 const sender={tab:{id:7},frameId:0,url:'https://www.youtube.com/watch?v=test'};
 await call({type:'native-caption',text:'今日はいい天気ですね'},sender);
 await new Promise(r=>setTimeout(r,0));
 listener({type:'speech-result',session,id:2,text:'古い音声結果'},{url:'chrome-extension://test/offscreen.html'},()=>{});
 assert.equal((await call({type:'subtitles'},{tab:{id:7}})).text.items[0].original,'今日はいい天気ですね');
 await call({type:'native-caption',text:'別のタブ'}, {...sender,tab:{id:8}});
 assert.equal((await call({type:'subtitles'},{tab:{id:7}})).text.items[0].original,'今日はいい天気ですね');
 await call({type:'native-caption',text:''},sender);
 listener({type:'speech-result',session,id:3,text:'音声に戻りました'},{url:'chrome-extension://test/offscreen.html'},()=>{});
 await new Promise(r=>setTimeout(r,0));
 assert.equal((await call({type:'subtitles'},{tab:{id:7}})).text.items[0].original,'音声に戻りました');
 await call({type:'subtitle-control',action:'stop'});
 assert.equal(updates.at(-1).item,null);
 listener({type:'speech-result',session,id:2,text:'古い'},{url:'chrome-extension://test/offscreen.html'},()=>{});
 assert.equal((await call({type:'subtitles'},{tab:{id:7}})).text.items.length,0);
});

test('failed capture startup cleans up and exposes an actionable error, then can retry',async()=>{
 let listener,fail=true;const stopped=[];
 const chrome={storage:{local:{get:async()=>({subtitleSettings:{captionMode:'realtime'}}),set:async()=>{}}},tabs:{sendMessage:async()=>{},onRemoved:{addListener(){}}},offscreen:{hasDocument:async()=>true},tabCapture:{getMediaStreamId:async()=>{if(fail)throw Error('Extension has not been invoked (activeTab)');return 'stream';}},runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:f=>listener=f},sendMessage:async m=>{stopped.push(m.type);return{ok:true};}}};
 const src=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{RecordingQueue,chrome,ResultGate,CueCursor,phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,TranslationMemo,firstTranslation,polishChinese,URLSearchParams,AbortSignal,AbortController,Date,console});
 const call=m=>new Promise(resolve=>listener(m,{},resolve));
 const failure=await call({type:'subtitle-control',action:'start',tabId:7});
 assert.equal(failure.ok,false);assert.match(failure.error,/影片分頁/);
 const health=(await call({type:'health'})).text;
 assert.equal(health.running,false);assert.equal(health.captureTabId,null);assert.equal(health.lastError,failure.error);
 assert.equal(stopped.filter(t=>t==='offscreen-stop').length,2);
 fail=false;assert.equal((await call({type:'subtitle-control',action:'start',tabId:7})).ok,true);
 assert.equal((await call({type:'health'})).text.lastError,'');
 await call({type:'subtitle-control',action:'stop'});
});

test('frequent chat cheers bypass both desktop inference and network translation',async()=>{
 let listener,inference=0,network=0;
 const chrome={storage:{local:{get:async()=>({speechMode:'desktop'}),set:async()=>{}}},tabs:{onRemoved:{addListener(){}}},runtime:{onMessage:{addListener:f=>listener=f}}};
 class NativeClient{request(){inference++;throw Error('Unexpected inference');}}
 const src=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 vm.runInNewContext(src,{NativeClient,RecordingQueue,chrome,ResultGate,CueCursor,phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,TranslationMemo,firstTranslation,polishChinese,URLSearchParams,AbortSignal,AbortController,Date,console,fetch:async()=>{network++;throw Error('Unexpected network');}});
 const replies=await Promise.all(Array.from({length:40},(_,i)=>new Promise(resolve=>listener({type:'translate',text:['ないすー','頑張れー！','ファイト','おしい'][i%4],direction:'ja-zh'}, {},resolve))));
 assert(replies.every(r=>r.ok));assert.deepEqual([...new Set(replies.map(r=>r.text))],['漂亮！','加油！','可惜了！']);
 assert.equal(inference,0);assert.equal(network,0);
});
