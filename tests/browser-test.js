const log=x=>{const line=document.createElement('div');line.textContent=x;document.querySelector('#log').append(line);};
document.querySelector('#run').onclick=async()=>{
 document.querySelector('#run').disabled=true;
 const runId=Date.now();const vad=new Worker('../vad-worker.js?test='+runId,{type:'module'}),asr=new Worker('../speech-worker.js?test='+runId,{type:'module'});
 const wait=(worker,type,send)=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{worker.removeEventListener('message',handler);reject(new Error(type+' timeout'));},300000);
  const handler=e=>{if(e.data.type==='error'||e.data.type===type){clearTimeout(timer);worker.removeEventListener('message',handler);e.data.type==='error'?reject(new Error(e.data.error)):resolve(e.data);}};
  worker.addEventListener('message',handler);worker.addEventListener('error',e=>reject(new Error(e.message)),{once:true});send();
 });
 try{
  log('載入 Silero V5…');await wait(vad,'ready',()=>vad.postMessage({type:'init',rate:16000,epoch:1,origin:Date.now()}));log('Silero V5 已就緒');
  const jobs=[];vad.addEventListener('message',e=>{if(e.data.type==='segment')jobs.push(e.data.job);});
  for(let i=0;i<80;i++)await wait(vad,'processed',()=>vad.postMessage({type:'audio',epoch:1,audio:new Float32Array(2048),interval:.65}));
  log('10 秒靜音字幕數：'+jobs.length);if(jobs.length)throw new Error('靜音觸發辨識');
  const context=new AudioContext();const buffer=await context.decodeAudioData(await(await fetch('japanese-fixture.wav')).arrayBuffer());
  const offline=new OfflineAudioContext(1,Math.ceil(buffer.duration*16000),16000);const source=offline.createBufferSource();source.buffer=buffer;source.connect(offline.destination);source.start();const rendered=await offline.startRendering();await context.close();
  const pcm=rendered.getChannelData(0);log('日文測試音訊：'+buffer.duration.toFixed(1)+' 秒');
  for(let i=0;i<pcm.length;i+=2048)await wait(vad,'processed',()=>vad.postMessage({type:'audio',epoch:1,audio:pcm.slice(i,i+2048),interval:.65}));
  for(let i=0;i<8;i++)await wait(vad,'processed',()=>vad.postMessage({type:'audio',epoch:1,audio:new Float32Array(2048),interval:.65}));
  log('人聲切片：'+jobs.length+'；完整片段：'+jobs.filter(j=>j.final).length);
  if(!jobs.length)throw new Error('人聲未觸發辨識');
  const finalJobs=jobs.filter(j=>j.final);
  for(const gain of [.1,.01]){
   const before=jobs.length;vad.postMessage({type:'reset',epoch:1,rate:16000,origin:Date.now()});
   for(let i=0;i<pcm.length;i+=2048)await wait(vad,'processed',()=>vad.postMessage({type:'audio',epoch:1,audio:pcm.slice(i,i+2048).map(x=>x*gain),interval:.65}));
   log('低音量 '+gain+' 人聲切片：'+(jobs.length-before));
  }
  log('載入 WebGPU Whisper…');const ready=await wait(asr,'ready',()=>asr.postMessage({type:'init'}));log('Whisper 已就緒 '+JSON.stringify(ready));
  const fullStart=performance.now();const full=await wait(asr,'result',()=>asr.postMessage({type:'decode',id:0,audio:pcm}));log('完整音訊基準 '+Math.round(performance.now()-fullStart)+' ms：'+full.text);
  for(const stream of [false,true,false,true]){
   const began=performance.now();let first=null,count=0;
   const onPartial=e=>{if(e.data.type==='partial'){first??=performance.now()-began;count++;}};
   asr.addEventListener('message',onPartial);
   const result=await wait(asr,'result',()=>asr.postMessage({type:'decode',id:100,audio:pcm,stream}));
   asr.removeEventListener('message',onPartial);
   log(`${stream?'逐步輸出':'等整段完成'}：首次文字 ${Math.round(first??performance.now()-began)} ms；完成 ${Math.round(performance.now()-began)} ms；更新 ${count} 次；${result.text}`);
  }
  for(const job of finalJobs.slice(0,5)){
   const start=performance.now();const result=await wait(asr,'result',()=>asr.postMessage({type:'decode',id:job.id,audio:job.audio}));
   log(Math.round(performance.now()-start)+' ms / '+(job.audio.length/16000).toFixed(2)+' 秒音訊：'+result.text);
  }
  log('測試完成：模型實際執行成功；此測試不是直播端到端延遲。');
 }catch(e){log('失敗：'+e.message);}finally{vad.terminate();asr.terminate();document.querySelector('#run').disabled=false;}
};
