let started=0,last='';
document.querySelector('video').addEventListener('play',()=>{started=performance.now();});
setInterval(()=>{
 chrome.runtime.sendMessage({type:'health'},reply=>{if(reply?.ok)document.querySelector('#health').textContent=reply.text.modelStatus+' / '+JSON.stringify(reply.text.diagnostics?.metrics||{});});
 const overlay=document.querySelector('#jtl-subtitles');
 if(!started||!overlay?.classList.contains('jtl-visible'))return;
 const ja=overlay.querySelector('.jtl-spoken').textContent,zh=overlay.querySelector('.jtl-chinese').textContent,key=ja+'|'+zh;
 if(key===last)return;last=key;
 const row=document.createElement('tr');for(const text of [((performance.now()-started)/1000).toFixed(2),ja,zh]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}document.querySelector('#events').append(row);
},150);
