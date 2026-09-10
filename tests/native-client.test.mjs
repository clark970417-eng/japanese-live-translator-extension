import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NativeClient} from '../native-client.mjs';
test('native responses correlate by ID; disconnect rejects pending work',async()=>{
 let response,disconnected;const sent=[];
 const port={onMessage:{addListener:f=>response=f},onDisconnect:{addListener:f=>disconnected=f},postMessage:m=>sent.push(m),disconnect(){}};
 const runtime={connectNative:()=>port},client=new NativeClient(runtime);
 const a=client.request('decode'),b=client.request('translate');
 response({id:sent[0].id,event:'source',text:'日本語'});
 assert.equal(client.pending.size,2);
 response({id:sent[1].id,ok:true,result:{text:'中文'}});
 response({id:sent[0].id,ok:true,result:{text:'日本語'}});
 assert.equal((await a).text,'日本語');assert.equal((await b).text,'中文');
 const c=client.request('decode');const rejection=assert.rejects(c,/disconnected/);
 disconnected();await rejection;assert.equal(client.pending.size,0);
});
