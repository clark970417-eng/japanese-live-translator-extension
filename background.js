import {RecordingQueue} from './recording-queue.mjs';
import {ResultGate} from './stream-core.mjs';
import {CueCursor} from './cue-cursor.mjs';
import {phraseTranslation,viewerPrompt,chinesePrompt,validateTranslation,TranslationMemo,firstTranslation,polishChinese} from './translation-policy.mjs';
const OPENROUTER="https://openrouter.ai/api/v1",NVIDIA="https://integrate.api.nvidia.com/v1";
let captionMode='record',captionHold=3;
const setHold=value=>{captionHold=Math.max(1,Math.min(6,Number(value)||3));};
chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes.subtitleSettings)setHold(changes.subtitleSettings.newValue?.holdSeconds);});
const fresh=item=>item&&!item.expired&&Date.now()/1000<(item.expiresAt??item.updatedAt+3);
const items=[];let running=false,lastError="",captureTabId=null;
const settings=()=>chrome.storage.local.get(["openrouterKey","nvidiaKey","speechMode","subtitleSettings"]);
const deadline=(signal,ms)=>signal?AbortSignal.any([signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);
async function request(url,key,body,signal){const r=await fetch(url,{signal:deadline(signal,10000),method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok){const error=new Error(`API ${r.status}`);error.status=r.status;throw error;}return d}
async function nvidia(text,from,to,signal){const {nvidiaKey}=await settings();if(!nvidiaKey)throw new Error("請先儲存 NVIDIA Key");const d=await request(`${NVIDIA}/chat/completions`,nvidiaKey,{model:"nvidia/riva-translate-4b-instruct-v2",messages:[{role:"system",content:`${from}-${to}`},{role:"user",content:text}],temperature:0,max_tokens:300},signal);return(d.choices?.[0]?.message?.content||"").trim()}
async function freeTranslate(text,from,to,signal){
 const q=new URLSearchParams({client:'gtx',sl:from,tl:to,dt:'t',q:text});
 const r=await fetch(`https://translate.googleapis.com/translate_a/single?${q}`,{signal:deadline(signal,4000)});
 if(!r.ok)throw new Error(`翻譯服務 ${r.status}`);
 const d=await r.json();const result=(d[0]||[]).map(x=>x[0]||'').join('').trim();
 if(!result)throw new Error('翻譯回應為空');return result;
}
const textMemo=new TranslationMemo();
async function makeDraft(text){
 if(typeof text!=='string'||!text.trim()||text.length>3000)throw new Error('請輸入 1–3000 字的中文');
 text=text.trim();
 const phrase=phraseTranslation(text,'zh-ja');if(phrase)return {draft:phrase,mode:'校對短句'};
 try{return {draft:await textMemo.run('styled:'+text,()=>styledTranslation(text,'zh-ja')),mode:'可愛禮貌'};}
 catch(_error){return {draft:validateTranslation(await freeTranslate(text,'zh-TW','ja'),'zh-ja',text),mode:'一般機翻：語氣模型目前無法使用，請檢查措辭'};}
}
async function styledTranslation(text,direction,signal){
 const {openrouterKey,nvidiaKey}=await settings();
 const messages=[{role:'system',content:direction==='zh-ja'?viewerPrompt:chinesePrompt},{role:'user',content:text}];
 const providers=[];
 if(nvidiaKey){
  for(const model of ['nvidia/nemotron-3.5-lightning-30b-a3b'])providers.push(async()=>{
   const result=await request(`${NVIDIA}/chat/completions`,nvidiaKey,{model,messages,temperature:0.2,max_tokens:600,chat_template_kwargs:{enable_thinking:false}},signal);
   return result;
  });
 }
 if(openrouterKey)providers.push(()=>request(`${OPENROUTER}/chat/completions`,openrouterKey,{model:'google/gemma-4-31b-it:free',messages,temperature:0.2,max_tokens:600},signal));
 for(const run of providers){try{const d=await run();if(d.choices?.[0]?.finish_reason==='length')throw new Error('翻譯被截斷');return validateTranslation(d.choices?.[0]?.message?.content,direction,text);}catch(error){if(signal?.aborted)throw error;}}
 throw new Error(direction==='zh-ja'?'可愛禮貌語氣翻譯目前無法使用，請確認 NVIDIA／OpenRouter Key 或稍後重試':'情境翻譯目前無法使用');
}
async function translate(text,direction,priority=false){
 if(!['ja-zh','zh-ja'].includes(direction)||typeof text!=='string'||!text.trim()||text.length>3000)throw new Error('請輸入 1–3000 字的日文或中文');
 text=text.trim();
 return textMemo.run(direction+':'+priority+':'+text,async()=>{
  const phrase=phraseTranslation(text,direction);if(phrase)return phrase;
  if(direction==='zh-ja')return (await makeDraft(text)).draft;
  if(priority){try{return await styledTranslation(text,direction);}catch(_error){}}
  return translateCaption(text);
 });
}
let recordingReady,recordingPreview=null;
const recording=new RecordingQueue({
 save:entries=>chrome.storage.local.set({recordedCaptions:entries}),
 translate:text=>textMemo.run('record:'+text,async()=>{const phrase=phraseTranslation(text,'ja-zh');if(phrase)return phrase;try{return await styledTranslation(text,'ja-zh');}catch(_){return translateCaption(text);}}),
 onChange:()=>{if(captionMode==='record'&&running)pushSubtitle(recordingItem());},
 onError:()=>{lastError='字幕記錄無法儲存，請匯出記錄並檢查儲存空間';if(running)stopCapture();}
});
function initRecording(){return recordingReady??=chrome.storage.local.get('recordedCaptions').then(s=>recording.restore(Array.isArray(s.recordedCaptions)?s.recordedCaptions:[]));}
function recordingItem(){const rows=recording.rows(gate.session);if(recordingPreview?.session===gate.session){const existing=rows.find(r=>r.id===recordingPreview.group);if(existing)existing.original+=' '+recordingPreview.original;else rows.push({id:recordingPreview.group,original:recordingPreview.original,translated:''});}return {id:'recording',recordingRows:rows.slice(-4),original:'',translated:'',updatedAt:Date.now()/1000};}
function recordTranscript(m){
 if(m.source!=='native'&&!m.final){if(m.partial&&m.text){recordingPreview={session:gate.session,group:gate.session+':'+m.utteranceId,original:m.text};pushSubtitle(recordingItem());}return;}
 recordingPreview=null;
 const text=String(m.text||'').replace(/\s+/g,' ').trim();if(!text)return;
 const key=gate.session+':'+(m.source==='native'?'native-'+(++outputSequence):m.id);
 recording.add({key,session:gate.session,group:gate.session+':'+(m.utteranceId??key),original:text,createdAt:Date.now()}).catch(()=>{});
}
const gate=new ResultGate();
const cueCursor=new CueCursor();
let nativeUntil=0, nativeText='', outputSequence=0, lastSpeechId=-1;
let diagnostics={}, modelStatus='', controlBusy=false, translationPending=null, publishedId=-1;
const captionRequests=new Map();
function cancelTranslations(){translationPending=null;publishedId=-1;for(const controller of captionRequests.values())controller.abort();captionRequests.clear();}
async function translateCaption(text,signal){
 const phrase=phraseTranslation(text,'ja-zh');if(phrase)return phrase;
 const primary=async s=>validateTranslation(polishChinese(text,await freeTranslate(text,'ja','zh-TW',s)),'ja-zh',text);
 const {nvidiaKey}=await settings();
 if(!nvidiaKey)return primary(deadline(signal,3000));
 return firstTranslation(primary,async s=>validateTranslation(polishChinese(text,await styledTranslation(text,'ja-zh',s)),'ja-zh',text),deadline(signal,3000),400);
}
const translationCache=new Map();
function pushSubtitle(item){if(captureTabId)chrome.tabs.sendMessage(captureTabId,{type:'subtitle-update',item}).catch(()=>{});}
async function translateItem(job){
 // Finish useful work; keep only the newest waiting revision. Repeatedly
 // aborting the oldest request starves subtitles on slower connections.
 if(Date.now()-job.started>3000||job.item.expired)return;
 if(captionRequests.size>=2){translationPending=job;return;}
 const controller=new AbortController();captionRequests.set(job,controller);
 try {
  const key='ja-zh-TW:'+job.item.original;
  const result=translationCache.get(key)||await translateCaption(job.item.original,controller.signal);
  if(controller.signal.aborted)return;
  translationCache.set(key,result);if(translationCache.size>200)translationCache.delete(translationCache.keys().next().value);
  if(gate.session===job.session&&job.item.id>publishedId&&!job.item.expired&&Date.now()-job.started<3000){
   publishedId=job.item.id;job.item.translated=result;job.item.expiresAt=Date.now()/1000+captionHold;items.length=0;items.push(job.item);
   lastError='';diagnostics.translationMs=Date.now()-job.started;diagnostics.chineseLagMs=job.item.audioEndAt?Date.now()-job.item.audioEndAt:diagnostics.translationMs;pushSubtitle(job.item);
  }
 } catch(e){if(!controller.signal.aborted&&gate.latest===job.item && gate.session===job.session)lastError='翻譯失敗：'+e.message;}
 finally{captionRequests.delete(job);if(translationPending&&captionRequests.size<2){const next=translationPending;translationPending=null;if(next.session===gate.session)translateItem(next);}}
}
function addTranscript(m){
 m={...m,text:String(m.text||'').trim()};
 if(captionMode==='record'){if(m.source!=='native'&&Date.now()<nativeUntil)return;recordTranscript(m);return;}
 if(m.source!=='native'&&(Date.now()<nativeUntil||m.id<lastSpeechId))return;
 // Translate exactly the short source cue displayed, retaining the full ASR
 // hypothesis in the worker for agreement and overlap alignment.
 if(m.source!=='native'){
  m.text=cueCursor.select(m.text,m.id);
  // Keep the whole clause for translation; CSS controls visible line length.
  // Cutting the last 44 characters here discarded subjects and negation.
 }
 if(m.source!=='native'){
  if(Date.now()<nativeUntil || m.id<lastSpeechId)return;
  lastSpeechId=m.id;
 }
 if(gate.latest?.original===m.text && gate.latest.speechId===m.id && gate.latest.source===m.source){gate.latest.provisional=Boolean(m.provisional);return;}
 const item=gate.accept(m.session,++outputSequence,m.text);if(!item)return;
 item.source=m.source;item.speechId=m.id;item.expiresAt=Date.now()/1000+captionHold;item.provisional=Boolean(m.provisional);item.audioEndAt=m.audioEndAt;item.stableText=m.stableText||'';
 if(!items[0]?.translated||!fresh(items[0])){items.length=0;items.push(item);pushSubtitle(item);}
 diagnostics.lastRecognition=Date.now();diagnostics.decodeMs=m.decodeMs;modelStatus='已辨識日文';
 translateItem({session:m.session,item,started:Date.now()});
}
async function ensureOffscreen(){if(await chrome.offscreen.hasDocument())return;await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['USER_MEDIA'],justification:'擷取目前分頁音訊以產生字幕'});}
async function stopCapture(){
 if(captionMode==='record'&&nativeText){const text=nativeText;nativeText='';recordTranscript({text,source:'native'});}
 cueCursor.reset();
 cancelTranslations();
 nativeUntil=0;nativeText='';lastSpeechId=-1;
 running=false;gate.reset();items.length=0;translationPending=null;pushSubtitle(null);
 await chrome.storage.local.set({captionsHidden:true});
 await chrome.runtime.sendMessage({type:'offscreen-stop'}).catch(()=>{});
 modelStatus='已停止';return{running};
}
async function resetCapture(){
 cueCursor.reset();
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
 await stopCapture();const prefs=(await settings()).subtitleSettings;setHold(prefs?.holdSeconds);captionMode=prefs?.captionMode==='realtime'?'realtime':'record';if(captionMode==='record')await initRecording();captureTabId=tabId;diagnostics={};lastError='';
 await ensureOffscreen();
 const streamId=await chrome.tabCapture.getMediaStreamId({targetTabId:tabId});
 running=true;modelStatus='正在擷取分頁聲音';
 const reply=await chrome.runtime.sendMessage({type:'offscreen-start',streamId,mode:'browser',recording:captionMode==='record',session:gate.session});
 if(!reply?.ok){running=false;throw new Error(reply?.error||'無法擷取分頁聲音');}
 await chrome.storage.local.set({captionsHidden:false});
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
   if(text!==nativeText){if(captionMode==='record'){if(nativeText&&!text.startsWith(nativeText))recordTranscript({text:nativeText,source:'native'});nativeText=text;}else{if(!nativeText){cancelTranslations();items.length=0;pushSubtitle(null);}nativeText=text;addTranscript({session:gate.session,text,source:'native'});}}
   if(gate.latest?.source==='native')gate.latest.expiresAt=Date.now()/1000+1.8;
   modelStatus='使用 YouTube 日文字幕';
  } else {if(captionMode==='record'&&nativeText)recordTranscript({text:nativeText,source:'native'});nativeUntil=0;nativeText='';if(gate.latest?.source==='native')gate.latest.expired=true;for(const [job,controller] of captionRequests){if(job.item.source==='native'){job.item.expired=true;controller.abort();}}if(translationPending?.item.source==='native')translationPending=null;if(items[0]?.source==='native'){items[0].expired=true;items.length=0;pushSubtitle(null);}}
  send({ok:true,text:{running}});return;
 }
 else if(m.type==='recording-export')task=initRecording().then(()=>recording.entries);
 else if(m.type==='recording-retry')task=initRecording().then(()=>recording.retry()).then(()=>({pending:recording.pending}));
 else if(m.type==='make-draft')task=makeDraft(m.text);
 else if(m.type==='translate')task=translate(m.text,m.direction,Boolean(m.priority));
 else if(m.type==='subtitles')task=Promise.resolve({running:running&&s.tab?.id===captureTabId,items:s.tab?.id===captureTabId?(captionMode==='record'?[recordingItem()]:items.filter(fresh)):[]});
 else if(m.type==='health')task=Promise.resolve({running,lastError,modelStatus,diagnostics,captureTabId,captionMode,recordingPending:recording.pending,recordingFailed:recording.failed});
 else if(m.type==='subtitle-reset'){
  if(s.tab?.id!==captureTabId)return;
  task=resetCapture();
 } else if(m.type==='subtitle-control'){
  if(controlBusy){send({ok:false,error:'正在切換，請稍候'});return;}
  controlBusy=true;task=(m.action==='stop'?stopCapture():startCapture(m.tabId||s.tab?.id)).finally(()=>{controlBusy=false;});
 } else return;
 Promise.resolve(task).then(text=>send({ok:true,text}),e=>send({ok:false,error:e.message}));return true;
});
