const $=s=>document.querySelector(s);
chrome.storage.local.get('speechMode').then(s=>$('#engineMode').value=s.speechMode==='desktop'?'desktop':'browser');
$('#engineMode').onchange=()=>chrome.storage.local.set({speechMode:$('#engineMode').value});
const defaults={japaneseColor:"#ffffff",chineseColor:"#ffffff",fontSize:22,outlineWidth:1,captionOpacity:100,backgroundColor:"#000000",backgroundOpacity:60,position:6,holdSeconds:3,captionMode:'record'};
const send=m=>new Promise((resolve,reject)=>chrome.runtime.sendMessage(m,r=>chrome.runtime.lastError||!r?.ok?reject(new Error(r?.error||"無法連線")):resolve(r.text)));
const controls=["japaneseColor","chineseColor","fontSize","outlineWidth","position","holdSeconds","captionMode","backgroundColor","backgroundOpacity","captionOpacity"];
function values(){return Object.fromEntries(controls.map(id=>[id,["fontSize","outlineWidth","position","holdSeconds","backgroundOpacity","captionOpacity"].includes(id)?Number($("#"+id).value):$("#"+id).value]))}
function paintLabels(){const preview=$("#captionPreview");preview.style.backgroundColor=$("#backgroundColor").value+Math.round(Number($("#backgroundOpacity").value)*2.55).toString(16).padStart(2,"0");preview.style.opacity=Number($("#captionOpacity").value)/100;preview.style.fontSize=Math.min(26,Number($("#fontSize").value))+"px";$("#previewJa").style.color=$("#japaneseColor").value;$("#previewZh").style.color=$("#chineseColor").value;$("#captionOpacityValue").textContent=`${$("#captionOpacity").value}%`;$("#backgroundOpacityValue").textContent=`${$("#backgroundOpacity").value}%`;$("#holdSecondsValue").textContent=`${$("#holdSeconds").value} 秒`;$("#fontSizeValue").textContent=`${$("#fontSize").value} px`;$("#outlineWidthValue").textContent=`${$("#outlineWidth").value} px`}
async function saveSettings(){await chrome.storage.local.set({subtitleSettings:values()});paintLabels()}
async function loadSettings(){let {subtitleSettings={},captionStyleV34}=await chrome.storage.local.get(["subtitleSettings","captionStyleV34"]);if(!captionStyleV34){subtitleSettings={...subtitleSettings,fontSize:22,japaneseColor:"#ffffff",chineseColor:"#ffffff",outlineWidth:1,backgroundColor:"#000000",backgroundOpacity:60};await chrome.storage.local.set({subtitleSettings,captionStyleV34:true});}const value={...defaults,...subtitleSettings};controls.forEach(id=>$("#"+id).value=value[id]);paintLabels()}
function captureStatus(d){const x=d.diagnostics||{};if(!d.running)return '● 已就緒';if(!x.ready)return '● '+(d.modelStatus||'載入模型中');if(x.busy)return `● 正在辨識日文 · 排隊 ${x.queueDepth||0} 段`;if((x.probability||0)>=.15)return '● 偵測到人聲，收集中';if((x.level||0)>.001)return '● 有收到聲音，尚未判定為人聲';return '● 未收到明顯聲音';}
async function refresh(){try{const d=await send({type:"health"});$("#status").textContent=d.lastError?`提示：${d.lastError}`:captureStatus(d);$('#recordingStatus').textContent=`等待翻譯 ${d.recordingPending||0} 句 · 失敗 ${d.recordingFailed||0} 句`;const x=d.diagnostics||{};const metric=name=>{const m=x.metrics?.[name];return m?`${m.p50} / ${m.p95} ms`:'尚無資料';};$("#diagnostics").textContent=`音訊：${x.frames||0} 區塊\n音量 RMS：${(x.level||0).toFixed(5)}\nVAD 樣本（最多 120）：${x.metrics?.vadMs?.count||0}\n辨識模型：${x.model||"—"} ${x.dtype||""}\n人聲機率：${Math.round((x.probability||0)*100)}%\n模型：${x.ready?'就緒':'尚未就緒'}\n辨識：${x.decodeMs||0} ms\n翻譯：${x.translationMs||0} ms\n音訊結束到中文：${x.chineseLagMs||0} ms\n首段暫定文字 P50/P95：${metric('firstTokenMs')}\n首段完成辨識 P50/P95：${metric('firstJapaneseMs')}\n辨識 P50/P95：${metric('decodeMs')}\n排隊 P50/P95：${metric('queueMs')}\n待處理：${x.queueDepth||0}\n略過過期音訊：${x.dropped||0}\n不可靠結果：${x.rejected||0}\n音訊重同步：${x.overruns||0}`;$("#start").disabled=d.running;$("#stop").disabled=!d.running}catch(e){$("#status").textContent=e.message}}
controls.forEach(id=>$("#"+id).addEventListener("input",saveSettings));
$("#reset").onclick=async()=>{controls.forEach(id=>$("#"+id).value=defaults[id]);await saveSettings()};
$("#start").onclick=async()=>{const[tab]=await chrome.tabs.query({active:true,currentWindow:true});$("#status").textContent="正在擷取聲音…";try{await send({type:"subtitle-control",action:"start",tabId:tab.id});await refresh()}catch(e){$("#status").textContent=`提示：${e.message}`}};
$("#stop").onclick=async()=>{await send({type:"subtitle-control",action:"stop"});refresh()};
loadSettings();refresh();setInterval(refresh,1500);
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

$('#exportRecording').onclick=async()=>{const entries=await send({type:'recording-export'});const text=entries.map(e=>new Date(e.createdAt).toLocaleString()+'\n'+e.original+'\n'+(e.translated||'[尚未翻譯]')).join('\n\n');const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='字幕記錄.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#retryRecording').onclick=async()=>{await send({type:'recording-retry'});refresh();};

$('#desktopSettings').onclick=async()=>{try{await send({type:'desktop-settings'});}catch(e){$('#status').textContent=e.message;}};
