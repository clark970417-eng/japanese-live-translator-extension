document.querySelector('#run').onclick=async()=>{
 const out=document.querySelector('#result');out.textContent='Running…';
 const start=performance.now();
 const result=await chrome.runtime.sendMessage({type:'make-draft',text:'今天直播辛苦了！看到你玩得這麼開心，我也很開心。'});
 out.textContent=JSON.stringify(result,null,2)+'\n'+Math.round(performance.now()-start)+' ms including initialization';
};
