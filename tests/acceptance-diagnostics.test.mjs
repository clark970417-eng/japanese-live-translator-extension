import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareRuntime,sessionLogEnded,swapouts,freePercent,RELEVANT_CRASH,summarizeHealth,EXTENSION_RUNTIME} from '../desktop-app/scripts/acceptance-diagnostics-lib.mjs';

test('runtime comparison names missing and differing files and nothing else',()=>{
 const source={'a.js':Buffer.from('1'),'b.js':Buffer.from('2'),'c.js':Buffer.from('3')};
 const installed={'a.js':Buffer.from('1'),'b.js':Buffer.from('changed')};
 const result=compareRuntime(f=>source[f]||null,f=>installed[f]||null,['a.js','b.js','c.js']);
 assert.deepEqual(result,{checked:3,missing:['c.js'],differing:['b.js'],identical:false});
 assert.equal(compareRuntime(f=>source[f],f=>source[f],['a.js']).identical,true);
});

test('the runtime list covers every file the extension manifest and pages load',()=>{
 for(const file of ['manifest.json','background.js','native-client.mjs','offscreen.js','caption-window.js','x-content.js','social-content.js','social-content.css'])assert.ok(EXTENSION_RUNTIME.includes(file),file);
});

test('a session log without its end line is reported as a session that died',()=>{
 assert.equal(sessionLogEnded('=== live-translate Session Log ===\nDate: 2026/9/13 1:03:26\n'),false);
 assert.equal(sessionLogEnded('=== log ===\n========\nSession ended: 1:03:10\nDuration: 0m 40s\n'),true);
});

test('memory counters parse from vm_stat and memory_pressure output',()=>{
 assert.equal(swapouts('Pages free: 1.\nSwapouts:                        6449199.\n'),6449199);
 assert.equal(freePercent('System-wide memory free percentage: 47%'),47);
 assert.ok(Number.isNaN(swapouts('nothing here')));
});

test('only crash reports from involved processes are listed, by name',()=>{
 assert.ok(RELEVANT_CRASH.test('Japanese Live Translate-2026-09-13-010203.ips'));
 assert.ok(RELEVANT_CRASH.test('Opera-2026-09-13.ips'));
 assert.equal(RELEVANT_CRASH.test('Discord-2026-09-13.ips'),false);
});

test('pasted health dumps become the gate-relevant numbers',()=>{
 const [row]=summarizeHealth([{label:'draft-during-captions',health:{running:true,lastError:'',recordingPending:1,recordingFailed:0,
  diagnostics:{chineseLagMs:8412,queueDepth:2,dropped:0,overruns:0,rejected:3,metrics:{queueMs:{p50:109,p95:926,count:40},decodeMs:{p50:868,p95:1868,count:40}}}}}]);
 assert.equal(row.audioEndToChineseMs,8412);
 assert.deepEqual(row.queueMs,{p50:109,p95:926,count:40});
 assert.equal(row.firstJapaneseMs,null);
 assert.equal(row.pending,2);
});
