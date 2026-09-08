const $=s=>document.querySelector(s);
const defaults={japaneseColor:"#ffffff",chineseColor:"#ffffff",fontSize:25,outlineWidth:2,position:6};
const send=m=>new Promise((resolve,reject)=>chrome.runtime.sendMessage(m,r=>chrome.runtime.lastError||!r?.ok?reject(new Error(r?.error||"無法連線")):resolve(r.text)));
const controls=["japaneseColor","chineseColor","fontSize","outlineWidth","position"];
function values(){return Object.fromEntries(controls.map(id=>[id,["fontSize","outlineWidth","position"].includes(id)?Number($("#"+id).value):$("#"+id).value]))}
function paintLabels(){$("#fontSizeValue").textContent=`${$("#fontSize").value} px`;$("#outlineWidthValue").textContent=`${$("#outlineWidth").value} px`}
async function saveSettings(){await chrome.storage.local.set({subtitleSettings:values()});paintLabels()}
async function loadSettings(){const {subtitleSettings={}}=await chrome.storage.local.get("subtitleSettings");const value={...defaults,...subtitleSettings};controls.forEach(id=>$("#"+id).value=value[id]);paintLabels()}
async function refresh(){try{const d=await send({type:"health"});$("#status").textContent=d.lastError?`提示：${d.lastError}`:d.running?`● ${d.modelStatus || "等待聲音"}`:"● 已就緒";const x=d.diagnostics||{};const metric=name=>{const m=x.metrics?.[name];return m?`${m.p50} / ${m.p95} ms`:'尚無資料';};$("#diagnostics").textContent=`音訊：${x.frames||0} 區塊\n音量 RMS：${(x.level||0).toFixed(5)}\nVAD 次數：${x.metrics?.vadMs?.count||0}\n辨識模型：${x.model||"—"} ${x.dtype||""}\n人聲機率：${Math.round((x.probability||0)*100)}%\n模型：${x.ready?'就緒':'尚未就緒'}\n辨識：${x.decodeMs||0} ms\n翻譯：${x.translationMs||0} ms\n音訊結束到中文：${x.chineseLagMs||0} ms\n首段日文 P50/P95：${metric('firstJapaneseMs')}\n辨識 P50/P95：${metric('decodeMs')}\n排隊 P50/P95：${metric('queueMs')}\n待處理：${x.queueDepth||0}\n略過過期音訊：${x.dropped||0}\n不可靠結果：${x.rejected||0}\n音訊重同步：${x.overruns||0}`;$("#start").disabled=d.running;$("#stop").disabled=!d.running}catch(e){$("#status").textContent=e.message}}
controls.forEach(id=>$("#"+id).addEventListener("input",saveSettings));
$("#reset").onclick=async()=>{controls.forEach(id=>$("#"+id).value=defaults[id]);await saveSettings()};
$("#start").onclick=async()=>{const[tab]=await chrome.tabs.query({active:true,currentWindow:true});$("#status").textContent="正在擷取聲音…";try{await send({type:"subtitle-control",action:"start",tabId:tab.id});await refresh()}catch(e){$("#status").textContent=`提示：${e.message}`}};
$("#stop").onclick=async()=>{await send({type:"subtitle-control",action:"stop"});refresh()};
loadSettings();refresh();setInterval(refresh,1500);
