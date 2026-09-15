import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../social-content.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

function setup(hostname,japaneseOverride,composerDistractor,semanticOnly=false){
 const requests=[];
 const translationLines=[];
 const controls=[];
 const japanese=japaneseOverride||{textContent:'配信ありがとう',innerText:'配信ありがとう',children:[],isConnected:true,
  querySelector(){return null;},querySelectorAll(){return [];},
  closest:selector=>selector.includes('.jtl-social-')?null:null,
  parentElement:{querySelector:()=>translationLines.find(x=>x.isConnected)},
  insertAdjacentElement(_,line){line.isConnected=true;translationLines.push(line);}};
 const composerHost={append(node){node.isConnected=true;controls.push(node);}};
 const box={value:'今天也很可愛',isConnected:true,focus(){},dispatchEvent(){},
  matches(){return false;},getBoundingClientRect(){return {width:300,height:40};},
  closest(){return composerHost;},parentElement:composerHost};
 const makeElement=tag=>({tagName:tag.toUpperCase(),children:[],isConnected:false,className:'',textContent:'',dataset:{},style:{setProperty(){}},
  classList:{add(){}},setAttribute(){},addEventListener(name,fn){this['on'+name]=fn;},append(...kids){this.children.push(...kids);},
  querySelector(){return null;},remove(){this.isConnected=false;}});
 const document={documentElement:{},body:{append(node){node.isConnected=true;if(node.className==='jtl-social-controls')controls.push(node);}},
  querySelectorAll(selector){
   if(!semanticOnly&&(selector.includes('danmaku-content')||selector.includes('chat-message')))return Array.isArray(japanese)?japanese:[japanese];
   if(semanticOnly&&selector.includes('[role="log"]'))return [{querySelectorAll:()=>Array.isArray(japanese)?japanese:[japanese]}];
   if(selector.includes('chat-input textarea')||selector.includes('comment-input"] textarea'))return [box];
   if(composerDistractor&&selector.includes('textarea:not([disabled])'))return [composerDistractor];
   return [];
  },
  createElement:makeElement,addEventListener(){},createRange:()=>({selectNodeContents(){}})};
 const window={innerWidth:1200,innerHeight:800,getSelection:()=>({removeAllRanges(){},addRange(){}}),JtlCaptionWindow:class{constructor(){} render(){} apply(){}}};window.top=window;
 const chrome={runtime:{lastError:null,onMessage:{addListener(){}},sendMessage(message,reply){requests.push({message,reply});}},
  storage:{local:{get:()=>Promise.resolve({websiteTextEnabled:true})},onChanged:{addListener(){}}}};
 vm.runInNewContext(source,{window,document,location:{hostname},chrome,MutationObserver:class{observe(){}},setTimeout:fn=>{fn();return 1;},setInterval(){},Event:class{},InputEvent:class{}});
 return {requests,translationLines,controls,box};
}

test('social live chat limits restored history and starts newest messages first',async()=>{
 const nodes=Array.from({length:40},(_,index)=>({textContent:`新しいコメント${index}です`,innerText:`新しいコメント${index}です`,isConnected:true,
  querySelector(){return null;},querySelectorAll(){return [];},closest:()=>null,
  parentElement:{querySelector(){return null;}},insertAdjacentElement(){}}));
 const t=setup('live.bilibili.com',nodes);await settle();
 const translated=t.requests.filter(request=>request.message.type==='translate');
 assert.equal(translated.length,3);
 assert.deepEqual(translated.map(request=>request.message.text),[
  '新しいコメント39です','新しいコメント38です','新しいコメント37です'
 ]);
});

test('semantic live region keeps chat translation working after site selectors change',async()=>{
 const t=setup('www.tiktok.com',null,null,true);await settle();
 const request=t.requests.find(x=>x.message.type==='translate');
 assert.equal(request.message.text,'配信ありがとう');
 request.reply({ok:true,text:'謝謝直播'});await settle();
 assert.equal(t.translationLines[0].textContent,'中：謝謝直播');
});

test('social live chat exposes retry progress and retries a transient failure once',async()=>{
 const t=setup('www.tiktok.com');await settle();
 assert.equal(t.translationLines[0].textContent,'中：翻譯中…');
 t.requests[0].reply({ok:false,error:'temporary'});await settle();
 assert.equal(t.requests.filter(x=>x.message.type==='translate').length,2);
 assert.equal(t.translationLines[0].textContent,'中：第一次失敗，正在重試…');
 t.requests[1].reply({ok:true,text:'謝謝直播'});await settle();
 assert.equal(t.translationLines[0].textContent,'中：謝謝直播');
});

test('social live chat stops after its bounded retry fails',async()=>{
 const t=setup('live.bilibili.com');await settle();
 t.requests[0].reply({ok:false,error:'first'});await settle();
 t.requests[1].reply({ok:false,error:'second'});await settle();
 assert.equal(t.translationLines[0].textContent,'中：翻譯失敗，請稍後重新整理再試');
 assert.equal(t.requests.filter(x=>x.message.type==='translate').length,2);
});

test('long social chat is translated once instead of being silently skipped',async()=>{
 const source='今日は長い話をします。'.repeat(45);
 const t=setup('live.bilibili.com',{textContent:source,innerText:source,children:[],isConnected:true,
  querySelector(){return null;},querySelectorAll(){return [];},closest:()=>null,
  parentElement:{querySelector:()=>t?.translationLines?.find(x=>x.isConnected)},insertAdjacentElement(_,line){line.isConnected=true;t.translationLines.push(line);}});
 await settle();
 const request=t.requests.find(x=>x.message.type==='translate');
 assert.equal(request.message.text,source);
 request.reply({ok:true,text:'今天要說一段很長的話。'});await settle();
 assert.equal(t.translationLines.length,1);
 assert.equal(t.translationLines[0].textContent,'中：今天要說一段很長的話。');
});

test('Bilibili page scans cannot steal the button from the focused live composer',async()=>{
 const distractor={value:'',isConnected:true,focus(){},dispatchEvent(){},matches(){return false;},
  getBoundingClientRect(){return {width:300,height:40};},closest(){return null;},parentElement:{append(){}}};
 const t=setup('live.bilibili.com',null,distractor);await settle();
 const original=t.controls[0];
 // Repeated mutation scans discover the same composer but must retain the
 // existing control and its bound Chinese source.
 await settle();
 assert.equal(t.controls.filter(control=>control.isConnected).length,1);
 assert.equal(t.controls[0],original);
 const button=original.children[0];
 button.onclick({preventDefault(){},stopPropagation(){}});await settle();
 assert.equal(t.requests.find(x=>x.message.type==='make-draft').message.text,'今天也很可愛');
});

test('TikTok fallback chat containers translate the message without nickname metadata',async()=>{
 const lines=[];
 const messageLeaf={textContent:'今日も声きれい',innerText:'今日も声きれい',children:[],isConnected:true,closest:()=>null,
  parentElement:{querySelector:()=>lines.find(x=>x.isConnected)},insertAdjacentElement(_,line){line.isConnected=true;lines.push(line);}};
 const nickname={textContent:'カールじい〜 No.2',innerText:'カールじい〜 No.2',children:[],closest:()=>({})};
 const container={textContent:'カールじい〜 No.2 今日も声きれい',innerText:'カールじい〜 No.2 今日も声きれい',isConnected:true,
  children:[nickname,messageLeaf],closest:()=>null,querySelector:()=>null,querySelectorAll:()=>[nickname,messageLeaf]};
 const t=setup('www.tiktok.com',container);await settle();
 const request=t.requests.find(x=>x.message.type==='translate');
 assert.equal(request.message.text,'今日も声きれい');
 request.reply({ok:true,text:'今天的聲音也很好聽'});await settle();
 assert.equal(lines[0].textContent,'中：今天的聲音也很好聽');
});

for(const [site,hostname] of [['Bilibili','live.bilibili.com'],['TikTok','www.tiktok.com']]){
 test(`${site} translates Japanese page text and installs a CH/JP composer`,async()=>{
  const t=setup(hostname);await settle();
  const ja=t.requests.find(x=>x.message.type==='translate');
  assert.ok(ja,`${site} Japanese text was discovered`);
  ja.reply({ok:true,text:'謝謝直播'});await settle();
  assert.equal(t.translationLines[0].textContent,'中：謝謝直播');
  assert.equal(t.controls.length,1);
  const button=t.controls[0].children[0];
  button.onclick({preventDefault(){},stopPropagation(){}});await settle();
  const draft=t.requests.find(x=>x.message.type==='make-draft');
  assert.equal(draft.message.text,'今天也很可愛');
  draft.reply({ok:true,text:{draft:'今日もとても可愛いですね！',mode:'可愛禮貌'}});await settle();
  assert.equal(t.box.value,'今日もとても可愛いですね！');
 });
}
