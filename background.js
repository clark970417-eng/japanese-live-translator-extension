import {ResultGate} from './stream-core.mjs';
const OPENROUTER="https://openrouter.ai/api/v1",NVIDIA="https://integrate.api.nvidia.com/v1";
const items=[];let running=false,lastError="",captureTabId=null;
const settings=()=>chrome.storage.local.get(["openrouterKey","nvidiaKey","speechMode"]);
const deadline=(signal,ms)=>signal?AbortSignal.any([signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);
async function request(url,key,body,signal){const r=await fetch(url,{signal:deadline(signal,10000),method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error?.message||d.detail||`API ${r.status}`);return d}
async function nvidia(text,from,to,signal){const {nvidiaKey}=await settings();if(!nvidiaKey)throw new Error("請先儲存 NVIDIA Key");const d=await request(`${NVIDIA}/chat/completions`,nvidiaKey,{model:"nvidia/riva-translate-4b-instruct-v2",messages:[{role:"system",content:`${from}-${to}`},{role:"user",content:text}],temperature:0,max_tokens:300},signal);return(d.choices?.[0]?.message?.content||"").trim()}
async function freeTranslate(text,from,to,signal){
 const q=new URLSearchParams({client:'gtx',sl:from,tl:to,dt:'t',q:text});
 const r=await fetch(`https://translate.googleapis.com/translate_a/single?${q}`,{signal:deadline(signal,4000)});
 if(!r.ok)throw new Error(`翻譯服務 ${r.status}`);
 const d=await r.json();const result=(d[0]||[]).map(x=>x[0]||'').join('').trim();
 if(!result)throw new Error('翻譯回應為空');return result;
}
async function translate(text,direction,allowFree=true){if(direction==="ja-zh"){if(allowFree){try{const result=await freeTranslate(text,"ja","zh-TW");if(/[\u3400-\u9fff]/.test(result))return result}catch(_error){}}const result=await nvidia(text,"ja","zh-tw");if(!/[\u3400-\u9fff]/.test(result))throw new Error("翻譯服務未回傳中文");return result}const {openrouterKey}=await settings();if(!openrouterKey)return freeTranslate(text,"zh-TW","ja");try{const d=await request(`${OPENROUTER}/chat/completions`,openrouterKey,{model:"google/gemma-4-31b-it:free",messages:[{role:"system",content:"將中文翻成適合對日本 VTuber 留言的自然日文。親切、柔和、有一點可愛並保持禮貌；忠實保留原意，不擅自增加稱呼、告白或表情。只輸出可直接貼出的日文。"},{role:"user",content:text}],temperature:0,max_tokens:300});return(d.choices?.[0]?.message?.content||"").trim()}catch(_error){return freeTranslate(text,"zh-TW","ja")}}
const gate=new ResultGate();
let nativeUntil=0, nativeText='', outputSequence=0, lastSpeechId=-1;
let diagnostics={}, modelStatus='', controlBusy=false, translationPending=null, publishedId=-1;
const captionRequests=new Map();
function cancelTranslations(){translationPending=null;publishedId=-1;for(const controller of captionRequests.values())controller.abort();captionRequests.clear();}
async function translateCaption(text,signal){
 const validate=result=>{if(!/[\u3400-\u9fff]/.test(result)||/[\u3040-\u30ff]/.test(result))throw new Error('翻譯服務未回傳中文');return result;};
 try{return validate(await freeTranslate(text,'ja','zh-TW',signal));}
 catch(error){if(signal.aborted)throw error;return validate(await nvidia(text,'ja','zh-tw',signal));}
}
const translationCache=new Map();
function pushSubtitle(item){if(captureTabId)chrome.tabs.sendMessage(captureTabId,{type:'subtitle-update',item}).catch(()=>{});}
async function translateItem(job){
 // Finish useful work; keep only the newest waiting revision. Repeatedly
 // aborting the oldest request starves subtitles on slower connections.
 if(captionRequests.size>=2){translationPending=job;return;}
 const controller=new AbortController();captionRequests.set(job,controller);
 try {
  const key='ja-zh-TW:'+job.item.original;
  const result=translationCache.get(key)||await translateCaption(job.item.original,controller.signal);
  if(controller.signal.aborted)return;
  translationCache.set(key,result);if(translationCache.size>200)translationCache.delete(translationCache.keys().next().value);
  if(gate.session===job.session&&job.item.id>publishedId&&Date.now()/1000-job.item.updatedAt<8){
   publishedId=job.item.id;job.item.translated=result;items.length=0;items.push(job.item);
   lastError='';diagnostics.translationMs=Date.now()-job.started;diagnostics.chineseLagMs=job.item.audioEndAt?Date.now()-job.item.audioEndAt:diagnostics.translationMs;pushSubtitle(job.item);
  }
 } catch(e){if(!controller.signal.aborted&&gate.latest===job.item && gate.session===job.session)lastError='翻譯失敗：'+e.message;}
 finally{captionRequests.delete(job);if(translationPending&&captionRequests.size<2){const next=translationPending;translationPending=null;if(next.session===gate.session)translateItem(next);}}
}
function addTranscript(m){
 m={...m,text:String(m.text||'').trim()};
 // Translate exactly the short source cue displayed, retaining the full ASR
 // hypothesis in the worker for agreement and overlap alignment.
 if(m.source!=='native'){
  const clauses=m.text.match(/[^。！？!?]+[。！？!?]?/gu)||[m.text];
  m.text=clauses.at(-1).trim();
  if(m.text.length<4&&clauses.length>1)m.text=clauses.at(-2).trim()+m.text;
  if(m.text.length>44)m.text=m.text.slice(-44);
 }
 if(m.source!=='native'){
  if(Date.now()<nativeUntil || m.id<lastSpeechId)return;
  lastSpeechId=m.id;
 }
 if(gate.latest?.original===m.text && Date.now()/1000-gate.latest.updatedAt<2){gate.latest.provisional=Boolean(m.provisional);gate.latest.updatedAt=Date.now()/1000;if(items[0]===gate.latest)pushSubtitle(gate.latest);return;}
 const item=gate.accept(m.session,++outputSequence,m.text);if(!item)return;
 item.provisional=Boolean(m.provisional);item.audioEndAt=m.audioEndAt;item.stableText=m.stableText||'';
 if(!items[0]?.translated||Date.now()/1000-items[0].updatedAt>=8){items.length=0;items.push(item);pushSubtitle(item);}
 diagnostics.lastRecognition=Date.now();diagnostics.decodeMs=m.decodeMs;modelStatus='已辨識日文';
 translateItem({session:m.session,item,started:Date.now()});
}
async function ensureOffscreen(){if(await chrome.offscreen.hasDocument())return;await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['USER_MEDIA'],justification:'擷取目前分頁音訊以產生字幕'});}
async function stopCapture(){
 cancelTranslations();
 nativeUntil=0;nativeText='';lastSpeechId=-1;
 running=false;gate.reset();items.length=0;translationPending=null;pushSubtitle(null);
 await chrome.runtime.sendMessage({type:'offscreen-stop'}).catch(()=>{});
 modelStatus='已停止';return{running};
}
async function resetCapture(){
 if(!running)return {running:false};
 cancelTranslations();
 nativeUntil=0;nativeText='';lastSpeechId=-1;
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
 if(m.type==='native-caption'){
  if(!running || s.tab?.id!==captureTabId || s.frameId!==0 || !/^https:\/\/www\.youtube\.com\//.test(s.url||'')){send({ok:false});return;}
  const text=typeof m.text==='string'?m.text.trim().slice(0,500):'';
  if(text && /[\u3040-\u30ff]/.test(text)){
   nativeUntil=Date.now()+1800;
   chrome.runtime.sendMessage({type:'offscreen-native',session:gate.session}).catch(()=>{});
   if(text!==nativeText){nativeText=text;addTranscript({session:gate.session,text,source:'native'});}
   modelStatus='使用 YouTube 日文字幕';
  } else {nativeUntil=0;nativeText='';}
  send({ok:true,text:{running}});return;
 }
 else if(m.type==='translate')task=translate(m.text,m.direction,true);
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
