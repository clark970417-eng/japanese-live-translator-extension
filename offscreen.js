import {cleanText,Segmenter} from './stream-core.mjs';
let active=null;
const send=(s,type,extra={})=>{if(active===s) chrome.runtime.sendMessage({type,session:s.session,...extra}).catch(()=>{});};
function stop() {
 const s=active; active=null; if(!s)return;
 clearInterval(s.monitor); clearTimeout(s.timeout);
 s.worker?.terminate(); s.node?.disconnect(); s.source?.disconnect();
 s.stream?.getTracks().forEach(t=>t.stop()); s.context?.close().catch(()=>{});
}
function decode(s,job) {
 if(!s.ready)return;
 job.epoch=s.epoch;
 if(s.busy){s.queued=job;return;}
 s.busy=job; s.started=performance.now();
 s.timeout=setTimeout(()=>restartWorker(s,'辨識逾時'),20000);
 s.worker.postMessage({type:'decode',id:job.id,audio:job.audio},[job.audio.buffer]);
}
function sample(s,data) {
 s.frames++; let energy=0; for(const v of data)energy+=v*v;
 const rms=Math.sqrt(energy/data.length); s.level=rms;
 const duration=data.length/s.context.sampleRate;
 if(!s.ready)return;
 const job=s.segmenter.push(data,rms,Math.max(.65,Math.min(1.5,s.decodeMs/1000)));
 if(!job)return;
 const ratio=s.context.sampleRate/16000;
 const audio=new Float32Array(Math.floor(job.audio.length/ratio));
 for(let i=0;i<audio.length;i++){let sum=0;const begin=Math.floor(i*ratio),end=Math.floor((i+1)*ratio);for(let j=begin;j<end;j++)sum+=job.audio[j];audio[i]=sum/Math.max(1,end-begin);}
 decode(s,{...job,audio});
}
function restartWorker(s,reason) {
 if(active!==s)return;
 if(s.restarts++>=1){send(s,'speech-error',{error:reason+'，自動重試失敗，請重新開始'});stop();return;}
 clearTimeout(s.timeout);s.worker?.terminate();s.ready=false;s.busy=null;s.queued=null;s.epoch++;
 s.segmenter.reset();send(s,'model-status',{text:reason+'，正在重新載入模型…'});initializeWorker(s);
}
function initializeWorker(s) {
 const worker=s.worker=new Worker('speech-worker.js',{type:'module'});
 worker.onerror=()=>restartWorker(s,'語音模型發生錯誤');
 s.timeout=setTimeout(()=>restartWorker(s,'模型載入逾時'),120000);
 worker.onmessage=({data})=>{
  if(active!==s||s.worker!==worker)return;
  if(data.type==='ready'){clearTimeout(s.timeout);s.ready=true;send(s,'model-status',{text:'模型就緒，等待聲音'});}
  if(data.type==='error'){restartWorker(s,data.error);return;}
  if(data.type==='result'){
   clearTimeout(s.timeout);s.decodeMs=performance.now()-s.started;
   const job=s.busy;s.busy=null;
   if(job && job.epoch===s.epoch){
    const text=cleanText(data.text);
    if(text)send(s,'speech-result',{text,id:s.epoch*1000000+job.id,final:job.final,decodeMs:Math.round(s.decodeMs)});
    else send(s,'model-status',{text:'收到音訊，尚未辨識出可靠文字'});
   }
   const next=s.queued;s.queued=null;if(next)decode(s,next);
  }
 };
 worker.postMessage({type:'init'});
}
async function start(m) {
 stop(); const s=active={session:m.session,ready:false,epoch:0,restarts:0,frames:0,level:0,parts:[],pre:[],length:0,elapsed:0,id:0,decodeMs:800,lastSound:0};
 try {
  s.stream=await navigator.mediaDevices.getUserMedia({audio:{mandatory:{chromeMediaSource:'tab',chromeMediaSourceId:m.streamId}},video:false});
  if(active!==s){s.stream.getTracks().forEach(t=>t.stop());return;}
  s.context=new AudioContext(); s.segmenter=new Segmenter(s.context.sampleRate); await s.context.resume();
  s.source=s.context.createMediaStreamSource(s.stream);s.source.connect(s.context.destination);
  await s.context.audioWorklet.addModule('audio-worklet.js');
  if(active!==s)return;
  s.node=new AudioWorkletNode(s.context,'subtitle-capture');s.node.port.onmessage=e=>sample(s,e.data);
  s.source.connect(s.node);s.node.connect(s.context.destination);
  s.stream.getAudioTracks()[0].onended=()=>{send(s,'speech-error',{error:'分頁音訊已中斷，請重新開始'});stop();};
  initializeWorker(s);
  s.monitor=setInterval(()=>send(s,'audio-health',{frames:s.frames,level:s.level,ready:s.ready,busy:Boolean(s.busy),decodeMs:Math.round(s.decodeMs)}),1000);
  send(s,'model-status',{text:'正在載入語音模型…'});
 } catch(e){send(s,'speech-error',{error:e.message});stop();throw e;}
}
chrome.runtime.onMessage.addListener((m,s,reply)=>{
 if(m.type==='offscreen-start'){start(m).then(()=>reply({ok:true}),e=>reply({ok:false,error:e.message}));return true;}
 if(m.type==='offscreen-reset'){
  if(active){active.session=m.session;active.epoch++;active.segmenter?.reset();active.queued=null;}
  reply({ok:Boolean(active)});return;
 }
 if(m.type==='offscreen-stop'){stop();reply({ok:true});}
});
