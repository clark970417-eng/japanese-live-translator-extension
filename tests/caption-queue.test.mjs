import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';

/** Headless caption window with a DOM stub that records what render() builds. */
function panel(){
 const styles={};
 const make=()=>({className:'',classList:{add(){}},style:{setProperty(k,v){styles[k]=v;}},dataset:{},
  children:[],textContent:'',append(...kids){this.children.push(...kids);},
  replaceChildren(...kids){this.children=[...kids];}});
 const root={...make(),parentElement:{getBoundingClientRect:()=>({left:0,top:0,width:1000,height:600})},
  getBoundingClientRect:()=>({left:0,top:0,width:500,height:300}),
  addEventListener(){},removeEventListener(){},setPointerCapture(){}};
 const window={innerWidth:1000,innerHeight:600,jtlCompactCaption:text=>text};
 const chrome={storage:{onChanged:{addListener(){}},local:{get:async()=>({}),set:async()=>{}}}};
 vm.runInNewContext(fs.readFileSync(new URL('../caption-window.js',import.meta.url),'utf8'),
  {window,chrome,document:{createElement:make}});
 return {panel:new window.JtlCaptionWindow(root,'rect'),root,styles};
}

const row=n=>({original:`日本語${n}`,translated:`中文${n}`});
const pairs=root=>root.children.flatMap(child=>child.children ?? []).length ? root.children : [];

test('four-entry mode keeps the newest four, oldest at the top, Japanese above Chinese',async()=>{
 const t=panel();await Promise.resolve();
 t.panel.render([row(1),row(2),row(3),row(4)]);
 const lines=t.root.children[0];
 assert.equal(lines.children.length,4);
 const texts=lines.children.map(pair=>pair.children.map(line=>line.children[0]?.textContent));
 assert.deepEqual(texts,[['日本語1','中文1'],['日本語2','中文2'],['日本語3','中文3'],['日本語4','中文4']]);
 // A fifth utterance drops the oldest and the rest move up.
 t.panel.render([row(1),row(2),row(3),row(4),row(5)]);
 const after=t.root.children[0].children.map(pair=>pair.children[0].children[0]?.textContent);
 assert.deepEqual(after,['日本語2','日本語3','日本語4','日本語5']);
});

test('single-caption mode renders one pair with the same style tokens',async()=>{
 const t=panel();await Promise.resolve();
 t.panel.render([row(9)]);
 assert.equal(t.root.children[0].children.length,1);
 t.panel.apply({fontSize:30,japaneseColor:'#ffcc00',chineseColor:'#00ccff',outlineWidth:3,
  showOutline:true,outlineColor:'#ff00aa',backgroundColor:'#000000',backgroundOpacity:40,captionOpacity:80});
 assert.equal(t.styles['--jtl-size'],'30px');
 assert.equal(t.styles['--jtl-ja'],'#ffcc00');
 assert.equal(t.styles['--jtl-zh'],'#00ccff');
 assert.equal(t.styles['--jtl-outline'],'3px');
 assert.equal(t.styles['--jtl-outline-color'],'#ff00aa');
 assert.equal(t.styles['--jtl-bg'],'rgba(0,0,0,0.4)');
 assert.equal(t.styles.opacity,'0.8');
});

test('caption text outline can be fully disabled without removing its background',async()=>{
 const t=panel();await Promise.resolve();
 t.panel.apply({showOutline:false,outlineWidth:3,backgroundColor:'#123456',backgroundOpacity:70});
 assert.equal(t.styles['--jtl-outline'],'0px');
 assert.equal(t.styles['--jtl-stroke'],'0px');
 assert.equal(t.styles['--jtl-bg'],'rgba(18,52,86,0.7)');
 t.panel.apply({showOutline:true,outlineWidth:3});
 assert.equal(t.styles['--jtl-outline'],'3px');
 assert.equal(t.styles['--jtl-stroke'],'.4px');
 t.panel.apply({showOutline:true,outlineColor:'invalid',outlineWidth:2});
 assert.equal(t.styles['--jtl-outline-color'],'#000000');
 t.panel.apply({showOutline:true,outlineWidth:0});
 assert.equal(t.styles['--jtl-outline'],'0px');
 assert.equal(t.styles['--jtl-stroke'],'0px');
});

test('an empty render hides the panel so stopping audio closes the overlay',async()=>{
 const t=panel();await Promise.resolve();
 t.panel.render([row(1)]);assert.equal(t.styles.visibility,'visible');
 t.panel.render([]);assert.equal(t.styles.visibility,'hidden');
});

test('layout rules stay in the stylesheet: half-line group spacing and wrap-when-needed',()=>{
 const css=fs.readFileSync(new URL('../caption-window.css',import.meta.url),'utf8');
 // line-height 1.35 with .675em between groups is exactly half a line.
 assert.match(css,/line-height:1\.35/);
 assert.match(css,/\.jtl-pair\+\.jtl-pair\{margin-top:\.675em\}/);
 assert.match(css,/white-space:normal!important/);
 assert.match(css,/overflow-wrap:anywhere/);
});
