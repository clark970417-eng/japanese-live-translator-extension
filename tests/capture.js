let started=0,last='';
document.querySelector('#full-test').onclick=async event=>{
 const status=document.querySelector('#test-status'),video=document.querySelector('video');
 event.target.disabled=true;
 try{
  document.querySelector('#events').replaceChildren();last='';started=0;
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
  status.textContent='播放音檔並記錄字幕';video.currentTime=0;await video.play();
  await new Promise(resolve=>video.addEventListener('ended',resolve,{once:true}));
  status.textContent='檢查播放結束後 12 秒的字幕清空';await new Promise(r=>setTimeout(r,12000));
  const visible=document.querySelector('#jtl-subtitles')?.classList.contains('jtl-visible');
  const count=document.querySelectorAll('#events tr').length;
  status.textContent=`音檔完成；字幕更新 ${count} 次；結束後字幕${visible?'仍顯示（需檢查）':'已清空'}。`;
 }catch(error){status.textContent='測試未通過：'+error.message;}
 finally{video.pause();await chrome.runtime.sendMessage({type:'subtitle-control',action:'stop'});event.target.disabled=false;}
};
document.querySelector('video').addEventListener('play',()=>{started=performance.now();});
setInterval(()=>{
 chrome.runtime.sendMessage({type:'health'},reply=>{if(reply?.ok)document.querySelector('#health').textContent=reply.text.modelStatus+' / '+JSON.stringify(reply.text.diagnostics?.metrics||{});});
 const overlay=document.querySelector('#jtl-subtitles');
 if(!started||!overlay?.classList.contains('jtl-visible'))return;
 const ja=overlay.querySelector('.jtl-spoken').textContent,zh=overlay.querySelector('.jtl-chinese').textContent,key=ja+'|'+zh;
 if(key===last)return;last=key;
 const row=document.createElement('tr');for(const text of [((performance.now()-started)/1000).toFixed(2),ja,zh]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}document.querySelector('#events').append(row);
},150);
