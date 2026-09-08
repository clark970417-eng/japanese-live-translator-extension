import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
test('drag and edge resize stay within player and save proportional position',async()=>{
 const handlers={};let saved;
 const node=()=>({classList:{add(){}},style:{setProperty(){}},dataset:{},append(){},replaceChildren(){}});
 const root={...node(),parentElement:{getBoundingClientRect:()=>({left:0,top:0,width:1000,height:600})},getBoundingClientRect:()=>({left:100,top:100,width:500,height:300}),addEventListener:(name,fn)=>handlers[name]=fn,removeEventListener:name=>delete handlers[name],setPointerCapture(){}};
 const window={};const chrome={storage:{local:{get:async()=>({}),set:async v=>saved=v}}};
 vm.runInNewContext(fs.readFileSync(new URL('../caption-window.js',import.meta.url),'utf8'),{window,chrome,document:{createElement:node}});
 const panel=new window.JtlCaptionWindow(root,'rect');await Promise.resolve();
 const pointer=(side='')=>({button:0,pointerId:1,clientX:100,clientY:100,target:{dataset:{side}},preventDefault(){},stopPropagation(){}});
 panel.begin(pointer());handlers.pointermove({clientX:2000,clientY:2000});handlers.pointerup();
 assert.equal(saved.rect.x,.5);assert.equal(saved.rect.y,.5);assert.equal(root.style.left,'50%');
 panel.begin(pointer('se'));handlers.pointermove({clientX:500,clientY:250});handlers.pointerup();assert.equal(saved.rect.w,.9);assert.equal(saved.rect.h,.75);
 panel.place(saved.rect);assert.equal(root.style.width,'90%');assert.equal(root.style.height,'75%');
});
