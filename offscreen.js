import {SpeechResultFilter,cleanText} from './stream-core.mjs';
import {Agreement,DecodeQueue,Measurements} from './streaming.mjs';
let active=null;
const send=(s,type,extra={})=>{if(active===s)chrome.runtime.sendMessage({type,session:s.session,...extra}).catch(()=>{});};
function stop(){
 const s=active;active=null;if(!s)return;
 clearInterval(s.monitor);clearTimeout(s.timeout);clearTimeout(s.vadTimeout);
 s.worker?.terminate();s.vad?.terminate();s.node?.disconnect();s.source?.disconnect();
 s.stream?.getTracks().forEach(t=>t.stop());s.context?.close().catch(()=>{});
}
function resetAudio(s){
 s.epoch++;s.queue.clear();s.filter.reset();s.agreement.reset();s.vadQueue=[];s.lastId=null;s.previewId=null;s.origin=Date.now();
 s.vad?.postMessage({type:'reset',epoch:s.epoch,origin:s.origin,rate:s.context.sampleRate});
}
function decode(s,job){
 if(!s.ready||job.epoch!==s.epoch||(s.recording&&!job.final))return;
 if(s.busy){try{s.queue.push(job);}catch(error){send(s,'speech-error',{error:error.message});stop();}return;}
 if(!s.recording&&Date.now()-job.audioEndAt>4000){s.expired++;return;}
 s.busy=job;s.started=performance.now();s.metrics.add('queueMs',Date.now()-job.audioEndAt);
 s.timeout=setTimeout(()=>restartWorker(s,'辨識逾時'),15000);
 s.worker.postMessage({type:'decode',id:job.id,audio:job.audio},[job.audio.buffer]);
}
function drainVad(s){
 if(s.vadBusy||!s.vadReady)return;
 const audio=s.vadQueue.shift();if(!audio)return;
 s.vadBusy=true;s.vadTimeout=setTimeout(()=>{if(active===s){send(s,'speech-error',{error:'人聲偵測無回應，請重新開始'});stop();}},5000);
 s.vad.postMessage({type:'audio',audio,epoch:s.epoch,interval:Math.max(.55,Math.min(1.2,s.decodeMs/1000))},[audio.buffer]);
}
function sample(s,data){
 if(active!==s)return;
 s.frames++;let energy=0;for(const v of data)energy+=v*v;s.level=Math.sqrt(energy/data.length);
 if(!s.ready||!s.vadReady)return;
 if(s.nativeUntil){if(Date.now()<s.nativeUntil)return;s.nativeUntil=0;resetAudio(s);}
 if(!s.receiving){s.receiving=true;resetAudio(s);}
 if(s.vadQueue.length>=(s.recording?120:12)){if(s.recording){send(s,'speech-error',{error:'收音處理積壓，已停止收音；已辨識文字仍保留'});stop();return;}s.overruns++;resetAudio(s);}
 s.vadQueue.push(data);drainVad(s);
}
function restartWorker(s,reason){
 if(active!==s)return;
 if(s.recording&&s.busy){send(s,'speech-error',{error:reason+'；已停止收音，已辨識文字仍保留'});stop();return;}
 if(s.restarts++>=1){send(s,'speech-error',{error:reason+'，請重新開始'});stop();return;}
 clearTimeout(s.timeout);s.worker?.terminate();s.ready=false;s.busy=null;s.receiving=false;resetAudio(s);
 send(s,'model-status',{text:reason+'，正在重新載入…'});initializeWorker(s);
}
function initializeWorker(s){
 const worker=s.worker=new Worker('speech-worker.js?v=3.4.3',{type:'module'});
 worker.onerror=()=>restartWorker(s,'語音模型發生錯誤');
 s.timeout=setTimeout(()=>restartWorker(s,'模型載入逾時'),120000);
 worker.onmessage=({data})=>{
  if(active!==s||s.worker!==worker)return;
  if(data.type==='progress'){clearTimeout(s.timeout);s.timeout=setTimeout(()=>restartWorker(s,'模型載入逾時'),120000);if(Date.now()-(s.lastProgress||0)>1000){s.lastProgress=Date.now();send(s,'model-status',{text:'下載辨識模型 '+data.progress+'%…'});}return;}
  if(data.type==='ready'){clearTimeout(s.timeout);s.ready=true;s.model=data.model;s.dtype=data.dtype;send(s,'model-status',{text:data.model+' 已就緒，等待人聲'});return;}
  if(data.type==='error'){restartWorker(s,data.error);return;}
  if(data.type==='partial'){
   const job=s.busy;
   if(!job||data.id!==job.id||job.epoch!==s.epoch||s.nativeUntil||Date.now()-job.audioEndAt>=5000)return;
   const text=cleanText(data.text);
   if(!text||job.voicedSeconds<.4||/視聴|チャンネル登録/.test(text))return;
   const result=s.agreement.preview(text,job);if(!result)return;
   if(s.previewId!==job.id){s.previewId=job.id;s.metrics.add('firstTokenMs',Date.now()-job.speechAt);}
   send(s,'speech-result',{...result,id:s.epoch*1000000+job.id,partial:true,utteranceId:s.epoch*1000000+job.utteranceId,decodeMs:Math.round(performance.now()-s.started),speechAt:job.speechAt,audioEndAt:job.audioEndAt});
   return;
  }
  if(data.type!=='result')return;
  clearTimeout(s.timeout);s.decodeMs=performance.now()-s.started;s.metrics.add('decodeMs',s.decodeMs);
  const job=s.busy;s.busy=null;
  if(job&&job.epoch===s.epoch&&!s.nativeUntil&&(s.recording||Date.now()-job.audioEndAt<5000)){
   const text=s.filter.accept(data.text,job);
   const result=text?s.agreement.accept(text,job):null;
   if(result){
    if(s.lastId!==job.id){s.metrics.add('firstJapaneseMs',Date.now()-job.speechAt);s.lastId=job.id;}
    s.metrics.add('audioLagMs',Date.now()-job.audioEndAt);
    send(s,'speech-result',{...result,id:s.epoch*1000000+job.id,final:job.final,utteranceId:s.epoch*1000000+job.utteranceId,utteranceEnd:job.utteranceEnd,decodeMs:Math.round(s.decodeMs),speechAt:job.speechAt,audioEndAt:job.audioEndAt});
   }else s.rejected++;
  }
  const next=s.queue.takeFresh(Date.now(),s.epoch);if(next)decode(s,next);
 };
 worker.postMessage({type:'init'});
}
function initializeVad(s){
 s.vad=new Worker('vad-worker.js?v=3.4.3',{type:'module'});
 s.vadTimeout=setTimeout(()=>{if(active===s){send(s,'speech-error',{error:'人聲模型載入逾時'});stop();}},30000);
 s.vad.onerror=()=>{if(active===s){send(s,'speech-error',{error:'人聲模型載入失敗'});stop();}};
 s.vad.onmessage=({data:m})=>{
  if(active!==s)return;
  if(m.type==='ready'){clearTimeout(s.vadTimeout);s.vadReady=true;send(s,'model-status',{text:'人聲偵測已就緒'});return;}
  if(m.type==='error'){send(s,'speech-error',{error:'人聲偵測失敗：'+m.error});stop();return;}
  if(m.type==='processed'){clearTimeout(s.vadTimeout);s.vadBusy=false;s.probability=m.probability;s.metrics.add('vadMs',m.vadMs);drainVad(s);}
  if(m.type==='segment'&&m.job.epoch===s.epoch&&!s.nativeUntil)decode(s,m.job);
 };
 s.vad.postMessage({type:'init',epoch:s.epoch,origin:Date.now(),rate:s.context.sampleRate});
}
async function start(m){
 stop();const s=active={session:m.session,epoch:0,ready:false,vadReady:false,restarts:0,frames:0,level:0,decodeMs:650,recording:Boolean(m.recording),queue:new DecodeQueue({retainFinals:Boolean(m.recording)}),vadQueue:[],filter:new SpeechResultFilter(),agreement:new Agreement(),metrics:new Measurements(),expired:0,rejected:0,overruns:0};
 try{
  s.stream=await navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:m.streamId}},video:false});
  if(active!==s){s.stream.getTracks().forEach(t=>t.stop());return;}
  s.context=new AudioContext();await s.context.resume();s.source=s.context.createMediaStreamSource(s.stream);s.source.connect(s.context.destination);
  await s.context.audioWorklet.addModule('audio-worklet.js');if(active!==s)return;
  s.node=new AudioWorkletNode(s.context,'subtitle-capture');s.node.port.onmessage=e=>sample(s,e.data);s.source.connect(s.node);s.node.connect(s.context.destination);
  s.stream.getAudioTracks()[0].onended=()=>{if(active===s){send(s,'speech-error',{error:'分頁音訊已中斷，請重新開始'});stop();}};
  initializeVad(s);initializeWorker(s);
  s.monitor=setInterval(()=>send(s,'audio-health',{frames:s.frames,level:s.level,ready:s.ready&&s.vadReady,model:s.model,dtype:s.dtype,probability:s.probability||0,busy:Boolean(s.busy),decodeMs:Math.round(s.decodeMs),metrics:s.metrics.summary(),dropped:s.queue.dropped,expired:s.expired,rejected:s.rejected,overruns:s.overruns,queueDepth:s.queue.jobs.length}),1000);
  send(s,'model-status',{text:'正在載入人聲與辨識模型…'});
 }catch(error){send(s,'speech-error',{error:error.message});stop();throw error;}
}
chrome.runtime.onMessage.addListener((m,s,reply)=>{
 if(m.type==='offscreen-native'){
  if(active&&m.session===active.session){if(!active.nativeUntil)resetAudio(active);active.nativeUntil=Date.now()+1800;}
  reply({ok:true});return;
 }
 if(m.type==='offscreen-start'){start(m).then(()=>reply({ok:true}),e=>reply({ok:false,error:e.message}));return true;}
 if(m.type==='offscreen-reset'){if(active){active.session=m.session;active.nativeUntil=0;resetAudio(active);}reply({ok:Boolean(active)});return;}
 if(m.type==='offscreen-stop'){stop();reply({ok:true});}
});
