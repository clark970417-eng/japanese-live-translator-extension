import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

/** Live chat and comment translation with a recyclable node, as a virtualized
 * list gives us: the same element object is reused for a different message. */
function setup(){
 const chat=[], requests=[]; let change, navigate;
 const makeLine=()=>({className:'',textContent:'',dataset:{},children:[],isConnected:false,
  classList:{add(){},remove(){},toggle(){}},style:{setProperty(){}},
  setAttribute(){},append(...kids){this.children.push(...kids);},replaceChildren(...kids){this.children=kids;},
  addEventListener(){},insertAdjacentElement(){},remove(){this.removed=true;}});
 const makeNode=text=>{
  const lines=[];
  const node={textContent:text,isConnected:true,lines,
   closest(){return node;},
   parentElement:{querySelector:selector=>selector.includes('jtl-translation')?lines.find(l=>!l.removed):null},
   insertAdjacentElement(_,line){lines.push(line);}};
  return node;
 };
 const document={documentElement:{},
  querySelector:()=>null,
  // Match the live-chat message selector only; the composer selector also
  // mentions yt-live-chat and must not receive these nodes.
  querySelectorAll:selector=>selector.includes('yt-live-chat-text-message-renderer')?chat:[],
  createElement:()=>makeLine(),
  addEventListener:(name,fn)=>{if(name==='yt-navigate-start')navigate=fn;}};
 const window={};window.top=window;
 const chrome={storage:{local:{get:()=>Promise.resolve({websiteTextEnabled:true})},
   onChanged:{addListener:f=>change=f}},
  runtime:{onMessage:{addListener(){}},sendMessage:(message,reply)=>requests.push({message,reply})}};
 let scan;
 vm.runInNewContext(fs.readFileSync(new URL('../content.js',import.meta.url),'utf8'),
  {chrome,window,document,MutationObserver:class{constructor(fn){scan=fn;}observe(){}},
   setInterval(){},setTimeout(fn){fn();return 0;},clearTimeout(){},console});
 return {chat,requests,makeNode,scan:()=>scan(),navigate:()=>navigate?.(),
  toggle:v=>change({websiteTextEnabled:{newValue:v}},'local')};
}

const settle=async()=>{for(let i=0;i<4;i++)await Promise.resolve();};

test('an unchanged message is translated once however often the page mutates',async()=>{
 const t=setup();await settle();
 const node=t.makeNode('こんばんは、配信ありがとう');
 t.chat.push(node);
 t.scan();await settle();
 assert.equal(t.requests.length,1);
 t.requests[0].reply({ok:true,text:'晚安，謝謝你的直播'});await settle();
 assert.equal(node.lines.length,1);
 assert.equal(node.lines[0].textContent,'中：晚安，謝謝你的直播');
 // Repeated scans must not re-request or add a second line.
 t.scan();t.scan();await settle();
 assert.equal(t.requests.length,1);
 assert.equal(node.lines.length,1);
});

test('a recycled node discards the late result and translates its new message',async()=>{
 const t=setup();await settle();
 const node=t.makeNode('最初のコメントです');
 t.chat.push(node);
 t.scan();await settle();
 assert.equal(t.requests.length,1);
 // The virtualized list reuses this element for a different message.
 node.textContent='別のコメントになりました';
 t.requests[0].reply({ok:true,text:'這是第一則留言'});await settle();
 assert.equal(node.lines.length,0,'a result for text that is gone must not be written');
 t.scan();await settle();
 assert.equal(t.requests.length,2);
 t.requests[1].reply({ok:true,text:'變成另一則留言了'});await settle();
 assert.equal(node.lines.length,1);
 assert.equal(node.lines[0].textContent,'中：變成另一則留言了');
});

test('an existing translation line is reused rather than duplicated',async()=>{
 const t=setup();await settle();
 const node=t.makeNode('一回目のコメント');
 t.chat.push(node);
 t.scan();await settle();t.requests[0].reply({ok:true,text:'第一次'});await settle();
 node.textContent='二回目です';
 t.scan();await settle();
 t.requests[1].reply({ok:true,text:'第二次'});await settle();
 assert.equal(node.lines.length,1);
 assert.equal(node.lines[0].textContent,'中：第二次');
});

test('turning website text off drops a result that is already in flight',async()=>{
 const t=setup();await settle();
 const node=t.makeNode('途中で切ります');
 t.chat.push(node);
 t.scan();await settle();
 t.toggle(false);
 t.requests.at(-1).reply({ok:true,text:'中途關閉'});await settle();
 assert.equal(node.lines.length,0);
});

test('a restored chat backlog is bounded and newest messages are translated first',async()=>{
 const t=setup();await settle();
 for(let i=0;i<40;i++)t.chat.push(t.makeNode(`新しいコメント${i}です`));
 t.scan();await settle();
 assert.equal(t.requests.length,3,'only a small number of translations may run concurrently');
 assert.deepEqual(t.requests.map(r=>r.message.text),[
  '新しいコメント39です','新しいコメント38です','新しいコメント37です'
 ]);
 t.requests[0].reply({ok:true,text:'最新'});await settle();
 assert.equal(t.requests.length,4);
 assert.equal(t.requests[3].message.text,'新しいコメント36です');
});
