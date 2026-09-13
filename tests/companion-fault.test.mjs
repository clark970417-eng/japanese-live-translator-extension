import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NativeClient} from '../native-client.mjs';
import {DesktopWorker} from '../desktop-worker.js';

/** A native host whose process can be killed and restarted between messages. */
function fakeRuntime(){
 const ports=[];
 const runtime={lastError:null,connectNative(){
  const port={sent:[],onMessage:null,onDisconnect:null,disconnected:false,
   onMessageAdd:null,
   postMessage(m){this.sent.push(m);},disconnect(){this.disconnected=true;}};
  port.onMessage={addListener:f=>{port.receive=f;}};
  port.onDisconnect={addListener:f=>{port.die=()=>{runtime.lastError={message:'Native host has exited.'};f();runtime.lastError=null;};}};
  ports.push(port);return port;
 }};
 return {runtime,ports};
}

test('companion death rejects in-flight work and the next request reconnects to a fresh host',async()=>{
 const {runtime,ports}=fakeRuntime();const client=new NativeClient(runtime);
 const init=client.request('init');ports[0].receive({id:ports[0].sent[0].id,ok:true,result:{model:'m'}});await init;
 const decode=client.request('decode',{segment:'1:3'});
 const rejected=assert.rejects(decode,/exited/);
 ports[0].die();await rejected;
 assert.equal(client.pending.size,0);
 const again=client.request('init');
 assert.equal(ports.length,2,'a new native port is opened after the death');
 ports[1].receive({id:ports[1].sent[0].id,ok:true,result:{model:'m'}});
 assert.deepEqual(await again,{model:'m'});
});

test('captions continue on the new host and a clean stop leaves nothing pending',async()=>{
 const {runtime,ports}=fakeRuntime();const client=new NativeClient(runtime);const events=[];client.onEvent=e=>events.push(e);
 client.request('init').catch(()=>{});ports[0].die();
 const init=client.request('init');ports[1].receive({id:ports[1].sent.at(-1).id,ok:true,result:{}});await init;
 const decode=client.request('decode',{segment:'1:9'});
 ports[1].receive({event:'caption',segment:'1:9',result:{text:'再開',translated:'重新開始'}});
 ports[1].receive({id:ports[1].sent.at(-1).id,ok:true,result:{text:'再開'}});
 assert.equal((await decode).text,'再開');
 assert.deepEqual(events.map(e=>e.segment),['1:9']);
 const stop=client.request('stop');ports[1].receive({id:ports[1].sent.at(-1).id,ok:true,result:{stopped:true}});
 assert.deepEqual(await stop,{stopped:true});
 assert.equal(client.pending.size,0);
});

test('a message the dead host delivers after reconnection is not accepted',async()=>{
 const {runtime,ports}=fakeRuntime();const client=new NativeClient(runtime);const events=[];client.onEvent=e=>events.push(e);
 const old=client.request('decode',{segment:'1:4'});old.catch(()=>{});
 const oldId=ports[0].sent[0].id;
 ports[0].die();
 const fresh=client.request('decode',{segment:'1:5'});
 // The browser can still hand over messages that were queued on the old port.
 ports[0].receive({event:'caption',segment:'1:4',result:{text:'古い',translated:'舊的'}});
 ports[0].receive({id:oldId,ok:true,result:{text:'古い'}});
 ports[0].receive({id:ports[1].sent[0].id,ok:true,result:{text:'偽物'}});
 assert.equal(events.length,0,'a pre-crash caption must not reach the extension');
 assert.equal(client.pending.size,1,'the new request must not be resolved by the old host');
 ports[1].receive({id:ports[1].sent[0].id,ok:true,result:{text:'新しい'}});
 assert.equal((await fresh).text,'新しい');
});

test('a desktop worker terminated for restart ignores its late reply',async()=>{
 const listeners=[];let replyTo;
 globalThis.chrome={runtime:{onMessage:{addListener:f=>listeners.push(f),removeListener(){}},
  sendMessage:()=>new Promise(resolve=>{replyTo=resolve;})}};
 globalThis.crypto??=(await import('node:crypto')).webcrypto;
 try{
  const worker=new DesktopWorker();const seen=[];worker.onmessage=e=>seen.push(e.data);
  worker.postMessage({type:'decode',id:7,segment:'7',audio:new Float32Array([.1])});
  worker.terminate();
  replyTo({ok:true,text:{text:'再起動前'}});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.deepEqual(seen,[]);
 }finally{delete globalThis.chrome;}
});

test('one timed out request does not disconnect chat and later work',async()=>{
 const {runtime,ports}=fakeRuntime();const client=new NativeClient(runtime);
 const slow=client.request('decode',{segment:'slow'},5);
 await assert.rejects(slow,/decode timed out/);
 assert.equal(ports[0].disconnected,false);
 const text=client.request('translate',{text:'こんにちは'});
 const sent=ports[0].sent.at(-1);
 ports[0].receive({id:sent.id,ok:true,result:{text:'你好'}});
 assert.deepEqual(await text,{text:'你好'});
});
