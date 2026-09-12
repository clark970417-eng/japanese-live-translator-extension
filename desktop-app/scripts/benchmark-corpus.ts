/** Matched real-engine corpus replay. Inputs stay local; no capture/VAD/UI claims. */
import { app, powerSaveBlocker } from 'electron'
import { readFileSync, appendFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { TranslationPipeline } from '../src/pipeline/TranslationPipeline'
import { MlxWhisperEngine } from '../src/engines/stt/MlxWhisperEngine'
import { HunyuanMT15Translator } from '../src/engines/translator/HunyuanMT15Translator'
import { HunyuanMT2Translator } from '../src/engines/translator/HunyuanMT2Translator'
const env = process.env
for (const key of ['COMPARE_PROFILE','CORPUS_MANIFEST','CORPUS_AUDIO_DIR','COMPARE_REPORT']) if (!env[key]) throw new Error('Missing '+key)
app.setPath('userData',env.COMPARE_PROFILE!)
function recognizerMemory(stt: MlxWhisperEngine): number | null {
 const pid = (stt as unknown as {process?: {pid?:number}}).process?.pid
 if (!pid) return null
 try { return Number(execFileSync('/bin/ps',['-o','rss=','-p',String(pid)],{encoding:'utf8',timeout:1000}).trim()) || null } catch { return null }
}
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
app.whenReady().then(async()=>{
 const pipeline=new TranslationPipeline(), began=performance.now()
 const hold=powerSaveBlocker.start('prevent-app-suspension')
 const report=env.COMPARE_REPORT!, rows=JSON.parse(readFileSync(env.CORPUS_MANIFEST!,'utf8')) as Array<{id:string,reference:string}>
 let source='', firstJa:number|null=null, firstZh:number|null=null, trialStart=0, index=0
 const emit=(row:unknown)=>{appendFileSync(report,JSON.stringify(row)+'\n');console.log(JSON.stringify(row))}
 writeFileSync(report,'')
 pipeline.on('interim-result',r=>{
  if(r.sourceText && firstJa===null) firstJa=performance.now()-trialStart
  if(r.translatedText && firstZh===null) firstZh=performance.now()-trialStart
  source=r.sourceText
 })
 pipeline.on('error',e=>emit({type:'error',index,error:String(e)}))
 const translator=env.COMPARE_TRANSLATOR==='hunyuan-mt-2' ? new HunyuanMT2Translator({variant:'7B-Q4_K_M'}) : new HunyuanMT15Translator()
 const stt=new MlxWhisperEngine({language:'ja'})
 pipeline.registerSTT('mlx-whisper',()=>stt)
 pipeline.registerTranslator('corpus-translator',()=>translator)
 const config={mode:'cascade' as const,sttEngineId:'mlx-whisper',translatorEngineId:'corpus-translator'}
 try {
  emit({type:'configuration',model:env.COMPARE_TRANSLATOR || 'hunyuan-mt-15',label:env.COMPARE_LABEL,manifestHash:createHash('sha256').update(readFileSync(env.CORPUS_MANIFEST!)).digest('hex'),capture:false,sourceLanguage:'ja',cache:'evaluation set previously used in development; repeated replay, not unseen speech',windows:[.8,1.6,2.8,4.5,6.5,8.5],durationTargetSeconds:Number(env.COMPARE_DURATION || 0)})
  await pipeline.switchEngine(config); pipeline.setLanguageConfig('ja','zh'); pipeline.start()
  await translator.translate('準備ができました。','ja','zh')
  // Warm with a separate synthetic control, never the evaluation utterance.
  if(env.CORPUS_WARMUP) { const wav=readFileSync(env.CORPUS_WARMUP); let o=12; while(wav.toString('ascii',o,o+4)!=='data')o+=8+wav.readUInt32LE(o+4);const pcm=Float32Array.from({length:wav.readUInt32LE(o+4)/2},(_,i)=>wav.readInt16LE(o+8+i*2)/32768);await stt.processAudio(pcm,16000) }
  const testStart=performance.now()
  do {
   const row=rows[index%rows.length],pcm=audio(row.id)
   trialStart=performance.now(); firstJa=null;firstZh=null;source=''
   for(const seconds of [.8,1.6,2.8,4.5,6.5,8.5].filter(s=>s<pcm.length/16000)) {
    await sleep(seconds*1000-(performance.now()-trialStart))
    const r=await pipeline.processStreaming(pcm.slice(0,Math.round(seconds*16000)),16000)
    if(r?.sourceText && firstJa===null)firstJa=performance.now()-trialStart
    if(r?.translatedText && firstZh===null)firstZh=performance.now()-trialStart
   }
   await sleep(pcm.length/16-(performance.now()-trialStart))
   const final=await pipeline.finalizeStreaming(pcm,16000)
   const end=performance.now()
   if(final?.sourceText && firstJa===null)firstJa=end-trialStart
   if(final?.translatedText && firstZh===null)firstZh=end-trialStart
   emit({type:'trial',index,id:row.id,reference:row.reference,source:final?.sourceText || source,translated:final?.translatedText,firstJaMs:firstJa,firstZhMs:firstZh,finalDelayMs:end-trialStart-pcm.length/16,audioSeconds:pcm.length/16000,recognizerRSSKB:recognizerMemory(stt),elapsedSeconds:(end-testStart)/1000,processes:app.getAppMetrics().map(p=>({type:p.type,workingSetKB:p.memory.workingSetSize})),missing:!final?.sourceText || !final?.translatedText})
   if(!final?.sourceText || !final?.translatedText)throw new Error('Missing final '+row.id)
   index++
   if(index%10===0) {
    const silent=await pipeline.finalizeStreaming(new Float32Array(16000),16000)
    emit({type:'silence',index,result:silent})
    await pipeline.stop(); await pipeline.switchEngine(config);pipeline.start()
    emit({type:'restart',index,state:pipeline.state})
   }
   await sleep(250)
  } while(env.COMPARE_DURATION ? performance.now()-testStart<Number(env.COMPARE_DURATION)*1000 : index<rows.length)
  emit({type:'complete',trials:index,seconds:(performance.now()-began)/1000})
 }catch(error){emit({type:'fatal',error:String(error)});process.exitCode=1}
 finally{await pipeline.dispose();powerSaveBlocker.stop(hold);app.quit()}
})
