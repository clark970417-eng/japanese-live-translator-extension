import {ResultGate} from './stream-core.mjs';
const OPENROUTER="https://openrouter.ai/api/v1",NVIDIA="https://integrate.api.nvidia.com/v1";
const items=[];let running=false,lastError="",captureTabId=null;
const settings=()=>chrome.storage.local.get(["openrouterKey","nvidiaKey","speechMode"]);
async function request(url,key,body){const r=await fetch(url,{signal:AbortSignal.timeout(10000),method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error?.message||d.detail||`API ${r.status}`);return d}
async function nvidia(text,from,to){const {nvidiaKey}=await settings();if(!nvidiaKey)throw new Error("請先儲存 NVIDIA Key");const d=await request(`${NVIDIA}/chat/completions`,nvidiaKey,{model:"nvidia/riva-translate-4b-instruct-v2",messages:[{role:"system",content:`${from}-${to}`},{role:"user",content:text}],temperature:0,max_tokens:300});return(d.choices?.[0]?.message?.content||"").trim()}
async function freeTranslate(text,from,to){
 const q=new URLSearchParams({client:'gtx',sl:from,tl:to,dt:'t',q:text});
 const r=await fetch(`https://translate.googleapis.com/translate_a/single?${q}`,{signal:AbortSignal.timeout(6000)});
 if(!r.ok)throw new Error(`翻譯服務 ${r.status}`);
 const d=await r.json();const result=(d[0]||[]).map(x=>x[0]||'').join('').trim();
 if(!result)throw new Error('翻譯回應為空');return result;
}
async function translate(text,direction,allowFree=true){if(direction==="ja-zh"){if(allowFree){try{const result=await freeTranslate(text,"ja","zh-TW");if(/[\u3400-\u9fff]/.test(result))return result}catch(_error){}}const result=await nvidia(text,"ja","zh-tw");if(!/[\u3400-\u9fff]/.test(result))throw new Error("翻譯服務未回傳中文");return result}const {openrouterKey}=await settings();if(!openrouterKey)return freeTranslate(text,"zh-TW","ja");try{const d=await request(`${OPENROUTER}/chat/completions`,openrouterKey,{model:"google/gemma-4-31b-it:free",messages:[{role:"system",content:"將中文翻成適合對日本 VTuber 留言的自然日文。親切、柔和、有一點可愛並保持禮貌；忠實保留原意，不擅自增加稱呼、告白或表情。只輸出可直接貼出的日文。"},{role:"user",content:text}],temperature:0,max_tokens:300});return(d.choices?.[0]?.message?.content||"").trim()}catch(_error){return freeTranslate(text,"zh-TW","ja")}}
const gate=new ResultGate();
let diagnostics={}, modelStatus='', controlBusy=false, translationJob=null, translationPending=null;
const translationCache=new Map();
function pushSubtitle(item){if(captureTabId)chrome.tabs.sendMessage(captureTabId,{type:'subtitle-update',item}).catch(()=>{});}
async function translateItem(job){
 if(translationJob){translationPending=job;return;}
 translationJob=job;
 try {
  const key='ja-zh-TW:'+job.item.original;
  const result=translationCache.get(key)||await translate(job.item.original,'ja-zh');
  translationCache.set(key,result);if(translationCache.size>200)translationCache.delete(translationCache.keys().next().value);
  if(gate.finish(job.session,job.item,result)){lastError='';diagnostics.translationMs=Date.now()-job.started;pushSubtitle(job.item);}
 } catch(e){if(gate.latest===job.item && gate.session===job.session)lastError='翻譯失敗：'+e.message;}
 finally{translationJob=null;const next=translationPending;translationPending=null;if(next&&next.session===gate.session)translateItem(next);}
}
function addTranscript(m){
 const item=gate.accept(m.session,m.id,m.text);if(!item)return;
 items.length=0;items.push(item);diagnostics.lastRecognition=Date.now();diagnostics.decodeMs=m.decodeMs;modelStatus='已辨識日文';pushSubtitle(item);
 translateItem({session:m.session,item,started:Date.now()});
}
async function ensureOffscreen(){if(await chrome.offscreen.hasDocument())return;await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['USER_MEDIA'],justification:'擷取目前分頁音訊以產生字幕'});}
async function stopCapture(){
 running=false;gate.reset();items.length=0;translationPending=null;pushSubtitle(null);
 await chrome.runtime.sendMessage({type:'offscreen-stop'}).catch(()=>{});
 modelStatus='已停止';return{running};
}
async function resetCapture(){
 if(!running)return {running:false};
 gate.reset();items.length=0;translationPending=null;pushSubtitle(null);
 const response=await chrome.runtime.sendMessage({type:'offscreen-reset',session:gate.session});
 if(!response?.ok){await stopCapture();lastError='音訊連線已中斷，請重新開始';}
 return {running};
}
async function startCapture(tabId){
 if(!Number.isInteger(tabId))throw new Error('請先選擇影片分頁');
 await stopCapture();captureTabId=tabId;diagnostics={};lastError='';
 await ensureOffscreen();
 const streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:tabId});
 running=true;modelStatus='正在擷取分頁聲音';
 const reply=await chrome.runtime.sendMessage({type:'offscreen-start',streamId,mode:'browser',session:gate.session});
 if(!reply?.ok){running=false;throw new Error(reply?.error||'無法擷取分頁聲音');}
 return{running};
}
chrome.tabs.onRemoved.addListener(id=>{if(id===captureTabId)stopCapture();});
chrome.runtime.onMessage.addListener((m,s,send)=>{
 if(['speech-result','model-status','speech-error','audio-health'].includes(m.type)){
  if(s.url!==chrome.runtime.getURL('offscreen.html')||!running||m.session!==gate.session)return;
  if(m.type==='speech-result')addTranscript(m);
  if(m.type==='model-status')modelStatus=m.text;
  if(m.type==='audio-health')diagnostics={...diagnostics,...m,lastHeartbeat:Date.now()};
  if(m.type==='speech-error'){lastError=m.error;stopCapture();}
  return;
 }
 let task;
 if(m.type==='translate')task=translate(m.text,m.direction,true);
 else if(m.type==='subtitles')task=Promise.resolve({running:running&&s.tab?.id===captureTabId,items:s.tab?.id===captureTabId?items:[]});
 else if(m.type==='health')task=Promise.resolve({running,lastError,modelStatus,diagnostics,captureTabId});
 else if(m.type==='subtitle-reset'){
  if(s.tab?.id!==captureTabId)return;
  task=resetCapture();
 } else if(m.type==='subtitle-control'){
  if(controlBusy){send({ok:false,error:'正在切換，請稍候'});return;}
  controlBusy=true;task=(m.action==='stop'?stopCapture():startCapture(m.tabId||s.tab?.id)).finally(()=>{controlBusy=false;});
 } else return;
 Promise.resolve(task).then(text=>send({ok:true,text}),e=>send({ok:false,error:e.message}));return true;
});
