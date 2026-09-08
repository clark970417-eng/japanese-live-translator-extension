chrome.storage.local.get(['nvidiaKey','openrouterKey']).then(value=>{
 const status=document.createElement('p');status.textContent=`設定：NVIDIA ${value.nvidiaKey?'已儲存':'未設定'}；OpenRouter ${value.openrouterKey?'已儲存':'未設定'}`;document.querySelector('h1').after(status);
});
document.querySelector('#probe').onclick=async event=>{
 event.target.disabled=true;
 const output=document.querySelector('#probe-result');output.textContent='檢查中';
 try{
  const {nvidiaKey}=await chrome.storage.local.get('nvidiaKey');
  if(!nvidiaKey)throw Error('尚未設定');
  const headers={Authorization:`Bearer ${nvidiaKey}`,'Content-Type':'application/json'};
  const models=await fetch('https://integrate.api.nvidia.com/v1/models',{headers,signal:AbortSignal.timeout(15000)});
  const data=await models.json();
  output.textContent=`模型清單 HTTP ${models.status}\n`+(data.data||[]).map(x=>x.id).filter(x=>/gemma-4|gemma-3-12|riva-translate/.test(x)).join('\n');
  const {viewerPrompt}=await import('../translation-policy.mjs');
  for(const model of ['nvidia/nemotron-3.5-lightning-30b-a3b']){
   try{
    const start=performance.now();
    const reply=await fetch('https://integrate.api.nvidia.com/v1/chat/completions',{method:'POST',headers,signal:AbortSignal.timeout(25000),body:JSON.stringify({model,messages:[{role:'system',content:viewerPrompt},{role:'user',content:'今天謝謝你的直播！我明天要早起，先去睡了。明天可能沒辦法來看，但我會看直播存檔，不要勉強自己喔。'}],max_tokens:600,temperature:0.2,chat_template_kwargs:{enable_thinking:false}})});
    const data=await reply.json();
    const row=document.createElement('p');row.textContent=`${model} HTTP ${reply.status} ${Math.round(performance.now()-start)} ms / ${data.choices?.[0]?.finish_reason||''} / ${data.choices?.[0]?.message?.content||''}`;output.after(row);
   }catch(error){const row=document.createElement('p');row.textContent=model+' '+error.name;output.after(row);}
  }

 }catch(error){output.textContent+='\n'+error.name;}
};
document.querySelector('#run').onclick=async event=>{
 event.target.disabled=true;document.querySelector('#rows').replaceChildren();
 const cases=[['ja-zh','来てくれてありがとうございます'],['ja-zh','まだクリアできていないけど、もう一回やってみます。'],['ja-zh','今日は配信をお休みします。アーカイブで会いましょう。'],['zh-ja','我先去睡覺了'],['zh-ja','今天謝謝你的直播！我明天要早起，先去睡了'],['zh-ja','明天可能沒辦法來看，但我會看直播存檔，不要勉強自己喔']];
 for(const [direction,text] of cases){
  const start=performance.now();const reply=await chrome.runtime.sendMessage({type:direction==='zh-ja'?'make-draft':'translate',text,direction,priority:false});
  const row=document.createElement('tr');for(const value of [text,reply.ok?(typeof reply.text==='string'?reply.text:reply.text.draft+' ['+reply.text.mode+']'):'失敗：'+reply.error,Math.round(performance.now()-start)]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}document.querySelector('#rows').append(row);
 }
 event.target.disabled=false;
};
