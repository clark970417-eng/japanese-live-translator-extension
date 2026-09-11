import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RecordingQueue} from '../recording-queue.mjs';
test('streamed revisions replace their row; new groups remove the oldest visible group',async()=>{
 let calls=0;const q=new RecordingQueue({save:async()=>{},translate:async()=>{calls++;return '';}});
 for(let i=0;i<5;i++)await q.updateExternal({key:String(i),session:'s',group:String(i),original:'日文'+i,translated:'',state:'streaming'});
 await q.updateExternal({key:'4',session:'s',group:'4',original:'新的日文',translated:'中文',state:'done'});
 assert.equal(q.entries.length,5);assert.deepEqual(q.rows('s').map(r=>r.id),['1','2','3','4']);
 assert.equal(q.rows('s')[3].translated,'中文');assert.equal(calls,0);assert.equal(q.pending,4);
});
