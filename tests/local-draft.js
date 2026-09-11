document.querySelector('#start').onclick=async event=>{
 event.target.disabled=true;const output=document.querySelector('#result');output.textContent='翻譯中';
 try{
  const before=await chrome.runtime.sendMessage({type:'health'}),start=performance.now();
  const result=await chrome.runtime.sendMessage({type:'make-draft',text:'今天沒辦法看到最後，明天再來看！'});
  const elapsed=Math.round(performance.now()-start),after=await chrome.runtime.sendMessage({type:'health'});
  if(!result.ok)throw Error(result.error);
  if(after.text.running!==before.text.running)throw Error('打字翻譯改變了收音狀態');
  output.textContent=JSON.stringify({passed:true,elapsedMs:elapsed,voiceRunning:after.text.running,...result.text},null,2);
 }catch(error){output.textContent='未通過：'+error.message;}finally{event.target.disabled=false;}
};
