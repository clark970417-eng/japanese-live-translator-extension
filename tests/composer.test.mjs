import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../content.js',import.meta.url),'utf8');
function setup(){
 const boxes=[], controls=[], replies=[];let focus,change,scan;
 const makeBox=()=>{const host={append(c){c.isConnected=true;controls.push(c);}};const box={textContent:'都好好聽啊',isConnected:true,closest:()=>host,parentElement:host,focus(){focus=box;}};boxes.push(box);return box;};
 const document={documentElement:{},querySelector:()=>null,querySelectorAll:s=>s.includes('#contenteditable-root')?boxes:s.includes('.jtl-composer-controls')?controls:[],createElement:()=>({children:[],setAttribute(){},append(...c){this.children.push(...c);},addEventListener(_,fn){this.click=fn;},remove(){this.isConnected=false;}}),addEventListener(){},execCommand(cmd,_,text){if(cmd==='insertText')focus.textContent=text;}};
 const chrome={storage:{local:{get:async()=>({websiteTextEnabled:true})},onChanged:{addListener:f=>change=f}},runtime:{onMessage:{addListener(){}},sendMessage:(message,reply)=>replies.push({message,reply})}};
 vm.runInNewContext(source,{document,window:{top:{}},chrome,MutationObserver:class{constructor(fn){scan=fn;}observe(){}},setTimeout(fn){fn();return 0;},clearTimeout(){},setInterval(){},InputEvent:class{}});
 return {boxes,controls,replies,makeBox,scan:()=>scan(),toggle:v=>change({websiteTextEnabled:{newValue:v}},'local')};
}
test('separate comment and reply editors get independent controls; dynamic replacements are discovered',async()=>{
 const t=setup();await Promise.resolve();const a=t.makeBox(),b=t.makeBox();a.dispatchEvent=b.dispatchEvent=()=>{};t.scan();t.scan();assert.equal(t.controls.length,2);
 const pending=t.controls[1].children[0].click();assert.equal(t.replies[0].message.type,'make-draft');t.replies[0].reply({ok:true,text:{draft:'どれも素敵です！',mode:'本機草稿'}});await pending;
 assert.equal(a.textContent,'都好好聽啊');assert.equal(b.textContent,'どれも素敵です！');
 t.controls[0].remove();t.scan();assert.equal(t.controls.length,3);
});
test('late drafts cannot overwrite edits, removed editors, or disabled website translation',async()=>{
 const t=setup();await Promise.resolve();const box=t.makeBox();box.dispatchEvent=()=>{};t.scan();const button=t.controls[0].children[0];
 let p=button.click();box.textContent='我修改了原文';t.replies.at(-1).reply({ok:true,text:{draft:'wrong'}});await p;assert.equal(box.textContent,'我修改了原文');
 p=button.click();t.toggle(false);t.replies.at(-1).reply({ok:true,text:{draft:'wrong'}});await p;assert.equal(box.textContent,'我修改了原文');assert.equal(button.disabled,false);
});
