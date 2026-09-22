import {captureStatus} from "./capture-status.mjs";
const $=s=>document.querySelector(s);
const languageOptions=[['ja','日本語'],['en','English'],['zh','繁體中文'],['ko','한국어'],['es','Español'],['fr','Français'],['de','Deutsch'],['pt','Português'],['it','Italiano'],['ru','Русский'],['th','ไทย'],['vi','Tiếng Việt'],['id','Bahasa Indonesia'],['ar','العربية']];
const languageDefaults={readSource:'ja',readTarget:'zh',typeSource:'zh',typeTarget:'ja',speechSource:'ja',speechTarget:'zh',syncTextLanguages:true};
const languageIds=Object.keys(languageDefaults);
for(const id of languageIds.filter(id=>id!=='syncTextLanguages')){const select=$('#'+id);for(const [value,label] of languageOptions)select.add(new Option(label,value));}
async function loadLanguages(){const saved=(await chrome.storage.local.get('languageSettings')).languageSettings||{};const value={...languageDefaults,...saved};for(const id of languageIds){if(id==='syncTextLanguages')$('#'+id).checked=Boolean(value[id]);else $('#'+id).value=value[id];}applySync();}
function applySync(){const synced=$('#syncTextLanguages').checked;$('#typeSource').disabled=synced;$('#typeTarget').disabled=synced;if(synced){$('#typeSource').value=$('#readTarget').value;$('#typeTarget').value=$('#readSource').value;}}
async function saveLanguages(){applySync();const value={};for(const id of languageIds)value[id]=id==='syncTextLanguages'?$('#'+id).checked:$('#'+id).value;if(value.readSource===value.readTarget||value.typeSource===value.typeTarget||value.speechSource===value.speechTarget){$('#languageStatus').textContent='來源和目標語言不能相同。';return;}await chrome.storage.local.set({languageSettings:value});$('#languageStatus').textContent='已套用；網站文字立即更新，語音設定於下次開始時生效。';}
for(const id of languageIds)$('#'+id).addEventListener('change',saveLanguages);
$('#extensionVersion').textContent='v'+chrome.runtime.getManifest().version;
chrome.storage.local.get('speechMode').then(s=>$('#engineMode').value=s.speechMode==='desktop'?'desktop':'browser');
$('#engineMode').onchange=()=>chrome.storage.local.set({speechMode:$('#engineMode').value});
const defaults={japaneseColor:"#ffffff",chineseColor:"#ffffff",fontSize:22,showOutline:true,outlineColor:"#000000",outlineWidth:1,captionOpacity:100,backgroundColor:"#000000",backgroundOpacity:60,position:6,holdSeconds:3,captionMode:'realtime'};
const send=m=>new Promise((resolve,reject)=>chrome.runtime.sendMessage(m,r=>chrome.runtime.lastError||!r?.ok?reject(new Error(r?.error||"無法連線")):resolve(r.text)));
const controls=["japaneseColor","chineseColor","fontSize","showOutline","outlineColor","outlineWidth","position","holdSeconds","captionMode","backgroundColor","backgroundOpacity","captionOpacity"];
function values(){return Object.fromEntries(controls.map(id=>[id,id==="showOutline"?$("#"+id).checked:["fontSize","outlineWidth","position","holdSeconds","backgroundOpacity","captionOpacity"].includes(id)?Number($("#"+id).value):$("#"+id).value]))}
function paintLabels(){const preview=$("#captionPreview"),outline=$("#showOutline").checked&&Number($("#outlineWidth").value)>0,color=$("#outlineColor").value;preview.style.backgroundColor=$("#backgroundColor").value+Math.round(Number($("#backgroundOpacity").value)*2.55).toString(16).padStart(2,"0");$("#outlineColor").disabled=!$("#showOutline").checked;$("#outlineWidth").disabled=!$("#showOutline").checked;preview.style.webkitTextStroke=outline?`0.4px ${color}`:"0 transparent";preview.style.textShadow=outline?`0 0 2px ${color}`:"none";preview.style.opacity=Number($("#captionOpacity").value)/100;preview.style.fontSize=Math.min(26,Number($("#fontSize").value))+"px";$("#previewJa").style.color=$("#japaneseColor").value;$("#previewZh").style.color=$("#chineseColor").value;$("#captionOpacityValue").textContent=`${$("#captionOpacity").value}%`;$("#backgroundOpacityValue").textContent=`${$("#backgroundOpacity").value}%`;$("#holdSecondsValue").textContent=`${$("#holdSeconds").value} 秒`;$("#fontSizeValue").textContent=`${$("#fontSize").value} px`;$("#outlineWidthValue").textContent=`${$("#outlineWidth").value} px`}
async function saveSettings(){await chrome.storage.local.set({subtitleSettings:values()});paintLabels()}
async function loadSettings(){let {subtitleSettings={},captionStyleV34}=await chrome.storage.local.get(["subtitleSettings","captionStyleV34"]);if(!captionStyleV34){subtitleSettings={...subtitleSettings,fontSize:22,japaneseColor:"#ffffff",chineseColor:"#ffffff",outlineWidth:1,backgroundColor:"#000000",backgroundOpacity:60};await chrome.storage.local.set({subtitleSettings,captionStyleV34:true});}const value={...defaults,...subtitleSettings};controls.forEach(id=>{if(id==="showOutline")$("#"+id).checked=Boolean(value[id]);else $("#"+id).value=value[id]});paintLabels()}

async function refresh(){try{const d=await send({type:"health"});$("#status").textContent=d.lastError?`提示：${d.lastError}`:captureStatus(d);$('#recordingStatus').textContent=`等待翻譯 ${d.recordingPending||0} 句 · 失敗 ${d.recordingFailed||0} 句`;const x=d.diagnostics||{};const metric=name=>{const m=x.metrics?.[name];return m?`${m.p50} / ${m.p95} ms`:'尚無資料';};$("#diagnostics").textContent=`音訊：${x.frames||0} 區塊\n音量 RMS：${(x.level||0).toFixed(5)}\nVAD 樣本（最多 120）：${x.metrics?.vadMs?.count||0}\n辨識模型：${x.model||"—"} ${x.dtype||""}\n人聲機率：${Math.round((x.probability||0)*100)}%\n模型：${x.ready?'就緒':'尚未就緒'}\n單段處理（桌面模式含翻譯）：${x.decodeMs||0} ms\n翻譯：${x.translationMs||0} ms\n音訊結束到中文：${x.chineseLagMs||0} ms\n首段暫定文字 P50/P95：${metric('firstTokenMs')}\n首段處理完成 P50/P95：${metric('firstJapaneseMs')}\n單段處理 P50/P95：${metric('decodeMs')}\n排隊 P50/P95：${metric('queueMs')}\n待處理：${x.queueDepth||0}\n略過過期音訊：${x.dropped||0}\n不可靠結果：${x.rejected||0}\n音訊重同步：${x.overruns||0}`;$("#start").disabled=d.running||d.controlBusy||d.draining;$("#stop").disabled=!d.running||d.controlBusy}catch(e){$("#status").textContent=e.message}}
controls.forEach(id=>$("#"+id).addEventListener("input",saveSettings));
$("#reset").onclick=async()=>{controls.forEach(id=>{if(id==="showOutline")$("#"+id).checked=defaults[id];else $("#"+id).value=defaults[id]});await saveSettings()};
$("#start").onclick=async()=>{$("#status").textContent="正在擷取聲音…";$("#start").disabled=true;try{const[tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw new Error("請先選擇影片分頁");await send({type:"subtitle-control",action:"start",tabId:tab.id});await refresh()}catch(e){$("#status").textContent=`提示：${e.message}`}};
$("#stop").onclick=async()=>{await send({type:"subtitle-control",action:"stop"});refresh()};
loadSettings();loadLanguages();refresh();setInterval(refresh,1500);
async function loadTranslationStatus(){
 const values=await chrome.storage.local.get(['nvidiaKey','openrouterKey']);
 for(const id of ['nvidiaKey','openrouterKey'])$('#'+id).placeholder=values[id]?'已儲存（留空保留）':'尚未設定';
}
$('#saveTranslation').onclick=async()=>{
 const values={};for(const id of ['nvidiaKey','openrouterKey']){const value=$('#'+id).value.trim();if(value)values[id]=value;}
 await chrome.storage.local.set(values);
 for(const id of ['nvidiaKey','openrouterKey'])$('#'+id).value='';
 $('#translationStatus').textContent='已儲存。下一次翻譯會使用新設定。';await loadTranslationStatus();
};
loadTranslationStatus();

chrome.storage.local.get('websiteTextEnabled').then(s=>$('#websiteText').checked=s.websiteTextEnabled!==false);
$('#websiteText').onchange=()=>chrome.storage.local.set({websiteTextEnabled:$('#websiteText').checked});

const dedicatedHosts=['youtube.com','x.com','twitter.com','bilibili.com','tiktok.com','twitch.tv','facebook.com','instagram.com'];
const isDedicatedHost=host=>dedicatedHosts.some(domain=>host===domain||host.endsWith('.'+domain));
let currentSiteHost='';
async function loadCurrentSiteAccess(){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 let url;
 try{url=new URL(tab?.url||'');}catch{return;}
 if(!['http:','https:'].includes(url.protocol))return;
 currentSiteHost=url.hostname.toLowerCase();
 const section=$('#currentSiteSection'),toggle=$('#currentSiteTranslation');section.hidden=false;
 if(isDedicatedHost(currentSiteHost)){
  $('#currentSiteLabel').textContent='此網站使用專用翻譯規則';
  $('#currentSiteHint').textContent='主要影音與社群網站會自動啟用。';
  toggle.checked=true;toggle.disabled=true;
  return;
 }
 const {genericSiteAccess={}}=await chrome.storage.local.get('genericSiteAccess');
 $('#currentSiteLabel').textContent=`在 ${currentSiteHost} 啟用文字翻譯`;
 $('#currentSiteHint').textContent='一般網站預設關閉，避免聊天、文件或搜尋頁被自動翻譯。';
 toggle.checked=genericSiteAccess[currentSiteHost]===true;
}
$('#currentSiteTranslation').onchange=async()=>{
 if(!currentSiteHost||isDedicatedHost(currentSiteHost))return;
 const {genericSiteAccess={}}=await chrome.storage.local.get('genericSiteAccess');
 const next={...genericSiteAccess};
 if($('#currentSiteTranslation').checked)next[currentSiteHost]=true;else delete next[currentSiteHost];
 await chrome.storage.local.set({genericSiteAccess:next});
};
loadCurrentSiteAccess();

$('#exportRecording').onclick=async()=>{const entries=await send({type:'recording-export'});const text=entries.map(e=>new Date(e.createdAt).toLocaleString()+'\n'+e.original+'\n'+(e.translated||'[尚未翻譯]')).join('\n\n');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='字幕記錄.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#retryRecording').onclick=async()=>{await send({type:'recording-retry'});refresh();};

$('#desktopSettings').onclick=async()=>{try{await send({type:'desktop-settings'});}catch(e){$('#status').textContent=e.message;}};
