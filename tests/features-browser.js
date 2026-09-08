const wait=ms=>new Promise(r=>setTimeout(r,ms));
const health=()=>chrome.runtime.sendMessage({type:'health'});
document.querySelector('#test').onclick=async e=>{
 e.target.disabled=true;const out=document.querySelector('#result');out.textContent='測試中…';
 const prior=await chrome.storage.local.get('websiteTextEnabled');const before=await health();
 try{
  await chrome.storage.local.set({websiteTextEnabled:true});
  for(let i=0;i<30&&!document.querySelector('.jtl-translation');i++)await wait(200);
  if(document.querySelector('.jtl-title')?.textContent!=='中：你好！'||document.querySelector('.jtl-translation')?.textContent!=='中：好可愛！')throw Error('標題或聊天室未翻譯');
  await chrome.storage.local.set({websiteTextEnabled:false});await wait(400);
  if(document.querySelector('.jtl-title,.jtl-translation'))throw Error('關閉後未清除');
  await chrome.storage.local.set({websiteTextEnabled:true});await wait(600);
  if(document.querySelectorAll('.jtl-title').length!==1||document.querySelectorAll('.jtl-translation').length!==1)throw Error('重新開啟未恢復或重複');
  const after=await health();if(before.text.running!==after.text.running)throw Error('文字開關改變了語音狀態');
  out.textContent='通過：標題與聊天翻成繁中；關閉即清除；重開各一份；語音狀態不受影響。';
 }catch(err){out.textContent='失敗：'+err.message;}
 finally{if(Object.hasOwn(prior,'websiteTextEnabled'))await chrome.storage.local.set(prior);else await chrome.storage.local.remove('websiteTextEnabled');e.target.disabled=false;}
};
