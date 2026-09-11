let started=0,last='',lastExpiry=0,hideDrift=null,lastUpdateAt=0,maxGroups=0,hasChinese=false;
let originalSettings;
async function continuousFixture(cycles){
 const context=new AudioContext();
 try{
  const buffer=await context.decodeAudioData(await (await fetch('japanese-fixture.wav')).arrayBuffer());
  const gap=Math.round(buffer.sampleRate*2.5),frames=(buffer.length+gap)*cycles;
  const bytes=new ArrayBuffer(44+frames*2),view=new DataView(bytes);
  const text=(offset,value)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
  text(0,'RIFF');view.setUint32(4,36+frames*2,true);text(8,'WAVE');text(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*2,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,frames*2,true);
  const audio=buffer.getChannelData(0);
  for(let cycle=0;cycle<cycles;cycle++)for(let i=0;i<audio.length;i++)view.setInt16(44+2*(cycle*(buffer.length+gap)+i),Math.max(-1,Math.min(1,audio[i]))*32767,true);
  return URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
 }finally{await context.close();}
}
document.querySelector('#full-test').onclick=async event=>{
 const status=document.querySelector('#test-status'),video=document.querySelector('video');
 event.target.disabled=true;
 try{
  document.querySelector('#events').replaceChildren();last='';started=0;lastExpiry=0;hideDrift=null;lastUpdateAt=0;maxGroups=0;hasChinese=false;
  const cycles=Number(document.querySelector('#test-cycles').value);
  video.src=await continuousFixture(cycles);video.load();
  const saved=await chrome.storage.local.get('subtitleSettings');originalSettings=saved.subtitleSettings;
  await chrome.storage.local.set({subtitleSettings:{...saved.subtitleSettings,captionMode:document.querySelector('#test-mode').value}});
  const tab=await chrome.tabs.getCurrent();
  const reply=await chrome.runtime.sendMessage({type:'subtitle-control',action:'start',tabId:tab.id});
  if(!reply?.ok)throw Error(reply?.error||'啟動失敗');
  status.textContent='等待模型就緒';
  const deadline=Date.now()+90000;
  for(;;){
   const health=await chrome.runtime.sendMessage({type:'health'});
   if(health?.text?.lastError)throw Error(health.text.lastError);
   if(health?.text?.diagnostics?.ready)break;
   if(Date.now()>deadline)throw Error('模型載入逾時');
   await new Promise(r=>setTimeout(r,500));
  }
  status.textContent='連續播放 '+cycles+' 段音檔（中間保留停頓，不跳轉）';
  await video.play();
  await new Promise((resolve,reject)=>{const done=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{video.removeEventListener('ended',done);reject(Error('音檔播放未完成（可能已暫停）'));},cycles*16000+15000);video.addEventListener('ended',done,{once:true});});
  status.textContent='等待辨識與翻譯完成（最多 60 秒）';
  const drainStart=Date.now();
  while(Date.now()-drainStart<60000){
   await new Promise(r=>setTimeout(r,500));
   const health=await chrome.runtime.sendMessage({type:'health'});
   if(health?.text?.lastError)throw Error(health.text.lastError);
   if(Date.now()-drainStart>15000&&Date.now()-lastUpdateAt>8000&&!health?.text?.recordingPending)break;
  }
  if(!document.querySelectorAll('#events tr').length)throw Error('沒有收到任何字幕');
  if(maxGroups>4)throw Error('字幕超過四組');
  const mode=(await chrome.runtime.sendMessage({type:'health'})).text.captionMode;
  const visible=document.querySelector('#jtl-subtitles')?.classList.contains('jtl-visible');
  const count=document.querySelectorAll('#events tr').length;
  if(!hasChinese)throw Error('沒有收到中文翻譯');
  if(mode==='record'&&Number(document.querySelector('#test-cycles').value)>=6&&document.querySelectorAll('.jtl-pair').length!==4)throw Error('六次播放後應保留四組字幕，目前只有 '+document.querySelectorAll('.jtl-pair').length+' 組');
  status.textContent=mode==='record'?`完整模式：音檔結束，顯示 ${document.querySelectorAll('.jtl-pair').length} 組記錄（最多四組），不按秒數消失。`:`音檔完成；字幕更新 ${count} 次；結束後字幕${visible?'仍顯示（需檢查）':'已清空'}；自動隱藏與截止時間相差 ${hideDrift===null?'未測得':hideDrift+' ms'}。`;
 }catch(error){status.textContent='測試未通過：'+error.message;}
 finally{video.pause();if(video.src.startsWith('blob:'))URL.revokeObjectURL(video.src);await chrome.runtime.sendMessage({type:'subtitle-control',action:'stop'});if(originalSettings)await chrome.storage.local.set({subtitleSettings:originalSettings});event.target.disabled=false;}
};
document.querySelector('video').addEventListener('play',()=>{if(!started)started=performance.now();});
setInterval(()=>{
 chrome.runtime.sendMessage({type:'health'},reply=>{if(reply?.ok)document.querySelector('#health').textContent=reply.text.modelStatus+' / '+JSON.stringify(reply.text.diagnostics?.metrics||{});});
 const overlay=document.querySelector('#jtl-subtitles');
 if(!started)return;
 if(!overlay?.classList.contains('jtl-visible')){if(lastExpiry){hideDrift=Math.round(Date.now()-lastExpiry*1000);lastExpiry=0;}return;}
 lastExpiry=Number(overlay.dataset.expiresAt)||0;
 const ja=[...overlay.querySelectorAll('.jtl-spoken')].map(e=>e.textContent).join(' / '),zh=[...overlay.querySelectorAll('.jtl-chinese')].map(e=>e.textContent).join(' / '),key=ja+'|'+zh;
 if(zh.trim())hasChinese=true;
 if(key===last)return;last=key;lastUpdateAt=Date.now();maxGroups=Math.max(maxGroups,overlay.querySelectorAll('.jtl-pair').length);
 const row=document.createElement('tr');for(const text of [((performance.now()-started)/1000).toFixed(2),ja,zh]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}document.querySelector('#events').append(row);
},150);
