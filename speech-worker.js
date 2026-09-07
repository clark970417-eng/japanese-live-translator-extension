import { pipeline, env } from './whisper-runtime.js';
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL('./ort/', import.meta.url).href;
let model;
self.onmessage = async ({data}) => {
  try {
    if (data.type === 'init') {
      model = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny', {device:'webgpu', dtype:'q4'});
      postMessage({type:'ready'});
    } else if (data.type === 'decode') {
      const result = await model(data.audio, {language:'japanese', task:'transcribe', max_new_tokens:48});
      postMessage({type:'result', id:data.id, text:result.text || ''});
    }
  } catch(error) { postMessage({type:'error', error:error.message}); }
};
