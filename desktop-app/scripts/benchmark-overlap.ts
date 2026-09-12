/** Matched real-engine corpus replay. Inputs stay local; no capture/VAD/UI claims. */
import { app, powerSaveBlocker } from 'electron'
import { readFileSync, appendFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { TranslationPipeline } from '../src/pipeline/TranslationPipeline'
import { MlxWhisperEngine } from '../src/engines/stt/MlxWhisperEngine'
import { HunyuanMT15Translator } from '../src/engines/translator/HunyuanMT15Translator'
import { HunyuanMT2Translator } from '../src/engines/translator/HunyuanMT2Translator'
const env = process.env
for (const key of ['COMPARE_PROFILE','CORPUS_MANIFEST','CORPUS_AUDIO_DIR','COMPARE_REPORT']) if (!env[key]) throw new Error('Missing '+key)
app.setPath('userData',env.COMPARE_PROFILE!)
const sleep = (ms:number) => new Promise(r=>setTimeout(r,Math.max(0,ms)))
function audio(id:string):Float32Array {
 const wav=readFileSync(join(env.CORPUS_AUDIO_DIR!,id+'.wav'))
 let offset=12
 while(offset+8<=wav.length) {
  const size=wav.readUInt32LE(offset+4),kind=wav.toString('ascii',offset,offset+4)
  if(kind==='fmt ' && (wav.readUInt16LE(offset+8)!==1 || wav.readUInt16LE(offset+10)!==1 || wav.readUInt32LE(offset+12)!==16000 || wav.readUInt16LE(offset+22)!==16))throw new Error('Expected mono PCM16 16kHz')
  if(kind==='data') {
   if(offset+8+size>wav.length)throw new Error('Truncated WAV')
   return Float32Array.from({length:size/2},(_,i)=>wav.readInt16LE(offset+8+i*2)/32768)
  }
  offset+=8+size+(size%2)
 }
 throw new Error('Missing WAV data')
}
app.whenReady().then(async () => {
 const pipeline = new TranslationPipeline()
 const hold = powerSaveBlocker.start('prevent-app-suspension')
 const emit = (row: unknown) => { appendFileSync(env.COMPARE_REPORT!, JSON.stringify(row)+'\n'); console.log(JSON.stringify(row)) }
 writeFileSync(env.COMPARE_REPORT!, '')
 const rows = JSON.parse(readFileSync(env.CORPUS_MANIFEST!, 'utf8')) as Array<{id:string,reference:string}>
 const translator = new HunyuanMT15Translator()
 const stt = new MlxWhisperEngine({language:'ja'})
 pipeline.registerSTT('mlx-whisper',()=>stt)
 pipeline.registerTranslator('overlap-translator',()=>translator)
 const config = {mode:'cascade' as const,sttEngineId:'mlx-whisper',translatorEngineId:'overlap-translator'}
 pipeline.on('error',error=>emit({type:'error',error:String(error)}))
 try {
  emit({type:'configuration',mode:env.COMPARE_MODE,pendingLimit:Number(env.COMPARE_PENDING || 4),description:'Burst of completed audio segments, 300ms apart; stress scheduling, not live onset latency',capture:false,manifestHash:createHash('sha256').update(readFileSync(env.CORPUS_MANIFEST!)).digest('hex')})
  await pipeline.switchEngine(config);pipeline.setLanguageConfig('ja','zh');pipeline.start()
  await translator.translate('準備ができました。','ja','zh')
  await stt.processAudio(new Float32Array(16000),16000)
  const started = performance.now(), pending = new Set<Promise<void>>()
  for (const [index,row] of rows.entries()) {
   const due = started + index * 300
   await sleep(due-performance.now())
   if(pending.size>=Number(env.COMPARE_PENDING || 4))await Promise.race(pending)
   const prepareStart=performance.now()
   const prepared=await pipeline.prepareFinalStreaming(audio(row.id),16000)
   const recognized=performance.now()
   if(!prepared){emit({type:'missing',index,id:row.id});continue}
   let done:Promise<void>
   done=prepared.completion.then(result=>{emit({type:'trial',index,id:row.id,reference:row.reference,source:prepared.sourceText,translated:result?.translatedText,recognizeMs:recognized-prepareStart,sourceDelayMs:recognized-due,finalDelayMs:performance.now()-due,missing:!result?.translatedText})}).finally(()=>{pending.delete(done)})
   pending.add(done)
   if(env.COMPARE_MODE==='serial')await done
  }
  await Promise.all(pending)
  emit({type:'silence',result:await pipeline.finalizeStreaming(new Float32Array(16000),16000)})
  emit({type:'complete',seconds:(performance.now()-started)/1000})
 } catch(error){emit({type:'fatal',error:String(error)});process.exitCode=1}
 finally {await pipeline.dispose();powerSaveBlocker.stop(hold);app.quit()}
})
