import {ort} from './whisper-runtime.js';
import {Resampler,SpeechWindows,SpeechGain} from './streaming.mjs?v=3.4.4';
ort.env.wasm.wasmPaths=new URL('./ort/',import.meta.url).href;
ort.env.wasm.numThreads=1;
let session,state,sr,resampler,windows,gain,pending=[],epoch=0,origin=0;
function reset(m){
 epoch=m.epoch;origin=m.origin;pending=[];resampler=new Resampler(m.rate);windows=new SpeechWindows();gain=new SpeechGain();
 state?.dispose();state=new ort.Tensor('float32',new Float32Array(256),[2,1,128]);
}
let chain=Promise.resolve();
self.onmessage=({data:m})=>{
 chain=chain.then(async()=>{
  if(m.type==='init'){
   session=await ort.InferenceSession.create(new URL('./vendor/silero/silero_vad_v5.onnx',import.meta.url).href,{executionProviders:['wasm']});
   sr=new ort.Tensor('int64',BigInt64Array.from([16000n]),[]);reset(m);postMessage({type:'ready',epoch});return;
  }
  if(m.type==='reset'){reset(m);return;}
  if(m.type!=='audio'||m.epoch!==epoch){if(m.type==='audio')postMessage({type:'processed',epoch,probability:0,vadMs:0});return;}
  const began=performance.now();pending.push(...resampler.push(m.audio));
  let probability=0;
  while(pending.length>=512){
   const audio=gain.push(Float32Array.from(pending.splice(0,512)));
   const input=new ort.Tensor('float32',audio,[1,512]);
   const out=await session.run({input,state,sr});
   input.dispose();state.dispose();state=out.stateN;
   probability=Number(out.output.data[0]);out.output.dispose();
   const job=windows.push(audio,probability,m.interval);
   if(job){job.epoch=epoch;job.speechAt=origin+job.speechStartSample/16;job.audioEndAt=origin+job.endSample/16;postMessage({type:'segment',job},[job.audio.buffer]);}
  }
  postMessage({type:'processed',epoch,probability,vadMs:performance.now()-began});
 }).catch(error=>postMessage({type:'error',error:error.message,epoch}));
};
