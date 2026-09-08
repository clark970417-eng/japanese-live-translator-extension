import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

test('website toggle removes translations, rejects late results and leaves voice control alone',async()=>{
 let change,reply;const messages=[],lines=[];
 const title={textContent:'今日は楽しかったです',isConnected:true,closest(){return this;},parentElement:{querySelector(){return lines.find(x=>!x.removed);}},insertAdjacentElement(_,line){lines.push(line);}};
 const document={documentElement:{},querySelector:s=>s.includes('ytd-watch-metadata')?title:null,querySelectorAll:s=>s.includes('.jtl-title')?lines.filter(x=>!x.removed):[],createElement:()=>({remove(){this.removed=true;}}),addEventListener(){}};
 const window={};window.top=window;
 const chrome={storage:{local:{get:()=>Promise.resolve({websiteTextEnabled:false})},onChanged:{addListener:f=>change=f}},runtime:{onMessage:{addListener(){}},sendMessage:(m,cb)=>{messages.push(m);reply=cb;}}};
 const src=fs.readFileSync(new URL('../content.js',import.meta.url),'utf8');
 vm.runInNewContext(src,{chrome,window,document,MutationObserver:class{observe(){}},setInterval(){},setTimeout(){},clearTimeout(){},console});
 await Promise.resolve();assert.equal(messages.length,0);
 change({websiteTextEnabled:{newValue:true}},'local');assert.equal(messages.length,1);
 change({websiteTextEnabled:{newValue:false}},'local');reply({ok:true,text:'今天玩得很開心'});await Promise.resolve();assert.equal(lines.length,0);
 change({websiteTextEnabled:{newValue:true}},'local');await Promise.resolve();await Promise.resolve();assert.equal(lines.length,1);
 change({websiteTextEnabled:{newValue:false}},'local');assert.equal(lines[0].removed,true);
 assert.ok(messages.every(m=>m.type==='translate'),'text switch must not start or stop capture');
});
