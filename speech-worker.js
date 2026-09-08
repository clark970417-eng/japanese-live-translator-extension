import { pipeline, env } from './whisper-runtime.js';
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL('./ort/', import.meta.url).href;
let model;
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'init') {
      const modelId=['whisper-tiny','whisper-base','whisper-small'].includes(data.model)?data.model:'whisper-small';
      model = await pipeline('automatic-speech-recognition', 'onnx-community/'+modelId, {device:'webgpu', dtype:'fp32',progress_callback:p=>{if(p.status==='progress')postMessage({type:'progress',progress:Math.round(p.progress||0)});}});
      postMessage({type:'ready',model:modelId,dtype:'fp32'});
    } else if (data.type === 'decode') {
      const result = await model(data.audio, {language:'japanese', task:'transcribe', max_new_tokens:128});
      postMessage({type:'result', id:data.id, text:result.text || ''});
    }
  } catch(error) { postMessage({type:'error', error:error.message}); }
};
