import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../social-content.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

function setup(hostname,japaneseOverride){
 const requests=[];
 const translationLines=[];
 const controls=[];
 const japanese=japaneseOverride||{textContent:'配信ありがとう',innerText:'配信ありがとう',isConnected:true,
  querySelector(){return null;},querySelectorAll(){return [];},
  closest:selector=>selector.includes('.jtl-social-')?null:null,
  parentElement:{querySelector:()=>translationLines.find(x=>x.isConnected)},
  insertAdjacentElement(_,line){line.isConnected=true;translationLines.push(line);}};
 const composerHost={append(node){node.isConnected=true;controls.push(node);}};
 const box={value:'今天也很可愛',isConnected:true,focus(){},dispatchEvent(){},
  closest(){return composerHost;},parentElement:composerHost};
 const makeElement=tag=>({tagName:tag.toUpperCase(),children:[],isConnected:false,className:'',textContent:'',dataset:{},style:{setProperty(){}},
  classList:{add(){}},setAttribute(){},addEventListener(name,fn){this['on'+name]=fn;},append(...kids){this.children.push(...kids);},
  querySelector(){return null;},remove(){this.isConnected=false;}});
 const document={documentElement:{},body:{append(node){node.isConnected=true;if(node.className==='jtl-social-controls')controls.push(node);}},
  querySelectorAll(selector){
   if(selector.includes('danmaku-content')||selector.includes('chat-message'))return [japanese];
   if(selector.includes('chat-input textarea')||selector.includes('comment-input"] textarea'))return [box];
   return [];
  },
  createElement:makeElement,addEventListener(){},createRange:()=>({selectNodeContents(){}})};
 const window={innerWidth:1200,innerHeight:800,getSelection:()=>({removeAllRanges(){},addRange(){}}),JtlCaptionWindow:class{constructor(){} render(){} apply(){}}};window.top=window;
 const chrome={runtime:{lastError:null,onMessage:{addListener(){}},sendMessage(message,reply){requests.push({message,reply});}},
  storage:{local:{get:()=>Promise.resolve({websiteTextEnabled:true})},onChanged:{addListener(){}}}};
 vm.runInNewContext(source,{window,document,location:{hostname},chrome,MutationObserver:class{observe(){}},setTimeout:fn=>{fn();return 1;},setInterval(){},Event:class{},InputEvent:class{}});
 return {requests,translationLines,controls,box};
}

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
