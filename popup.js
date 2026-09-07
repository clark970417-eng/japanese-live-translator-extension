const $=s=>document.querySelector(s);
const defaults={japaneseColor:"#ffffff",chineseColor:"#ffffff",fontSize:25,outlineWidth:2,position:6};
const send=m=>new Promise((resolve,reject)=>chrome.runtime.sendMessage(m,r=>chrome.runtime.lastError||!r?.ok?reject(new Error(r?.error||"無法連線")):resolve(r.text)));
const controls=["japaneseColor","chineseColor","fontSize","outlineWidth","position"];
function values(){return Object.fromEntries(controls.map(id=>[id,["fontSize","outlineWidth","position"].includes(id)?Number($("#"+id).value):$("#"+id).value]))}
function paintLabels(){$("#fontSizeValue").textContent=`${$("#fontSize").value} px`;$("#outlineWidthValue").textContent=`${$("#outlineWidth").value} px`}
async function saveSettings(){await chrome.storage.local.set({subtitleSettings:values()});paintLabels()}
async function loadSettings(){const {subtitleSettings={}}=await chrome.storage.local.get("subtitleSettings");const value={...defaults,...subtitleSettings};controls.forEach(id=>$("#"+id).value=value[id]);paintLabels()}
async function refresh(){try{const d=await send({type:"health"});$("#status").textContent=d.lastError?`提示：${d.lastError}`:d.running?"● 正在翻譯此分頁":"● 已就緒";$("#start").disabled=d.running;$("#stop").disabled=!d.running}catch(e){$("#status").textContent=e.message}}
controls.forEach(id=>$("#"+id).addEventListener("input",saveSettings));
$("#reset").onclick=async()=>{controls.forEach(id=>$("#"+id).value=defaults[id]);await saveSettings()};
$("#start").onclick=async()=>{const[tab]=await chrome.tabs.query({active:true,currentWindow:true});$("#status").textContent="正在擷取聲音…";try{await send({type:"subtitle-control",action:"start",tabId:tab.id});await refresh()}catch(e){$("#status").textContent=`提示：${e.message}`}};
$("#stop").onclick=async()=>{await send({type:"subtitle-control",action:"stop"});refresh()};
loadSettings();refresh();setInterval(refresh,1500);
