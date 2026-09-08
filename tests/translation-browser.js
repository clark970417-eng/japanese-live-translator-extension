chrome.storage.local.get(['nvidiaKey','openrouterKey']).then(value=>{
 const status=document.createElement('p');status.textContent=`設定：NVIDIA ${value.nvidiaKey?'已儲存':'未設定'}；OpenRouter ${value.openrouterKey?'已儲存':'未設定'}`;document.querySelector('h1').after(status);
});
document.querySelector('#run').onclick=async event=>{
 event.target.disabled=true;document.querySelector('#rows').replaceChildren();
 const cases=[['ja-zh','来てくれてありがとうございます'],['ja-zh','まだクリアできていないけど、もう一回やってみます。'],['ja-zh','今日は配信をお休みします。アーカイブで会いましょう。'],['zh-ja','我先去睡覺了'],['zh-ja','今天謝謝你的直播！我明天要早起，先去睡了'],['zh-ja','明天可能沒辦法來看，但我會看直播存檔，不要勉強自己喔']];
 for(const [direction,text] of cases){
  const start=performance.now();const reply=await chrome.runtime.sendMessage({type:direction==='zh-ja'?'make-draft':'translate',text,direction,priority:false});
  const row=document.createElement('tr');for(const value of [text,reply.ok?(typeof reply.text==='string'?reply.text:reply.text.draft+' ['+reply.text.mode+']'):'失敗：'+reply.error,Math.round(performance.now()-start)]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}document.querySelector('#rows').append(row);
 }
 event.target.disabled=false;
};
