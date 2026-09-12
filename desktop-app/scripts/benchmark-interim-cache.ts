/** Isolated post-recognition latency probe. No microphone, browser, or messages. */
import { app } from 'electron'
import { EventEmitter } from 'events'
import { appendFileSync, writeFileSync } from 'fs'
import { HunyuanMT15Translator } from '../src/engines/translator/HunyuanMT15Translator'
import { StreamingProcessor, type StreamingDeps } from '../src/pipeline/StreamingProcessor'
import { LocalAgreement } from '../src/pipeline/LocalAgreement'
import { ContextBuffer } from '../src/pipeline/ContextBuffer'
if (!process.env.COMPARE_PROFILE || !process.env.COMPARE_REPORT) throw new Error('Set isolated profile/report')
app.setPath('userData', process.env.COMPARE_PROFILE)
app.whenReady().then(async () => {
 const engine = new HunyuanMT15Translator()
 const report = process.env.COMPARE_REPORT!
 writeFileSync(report, JSON.stringify({type:'metadata',purpose:'Repeated exact final translations reused in interim; mocked recognition, not end-to-end latency'})+'\n')
 try {
  await engine.initialize()
  for (const [index, source] of ['まだ終わっていません。','今日は先に寝ます。','左から二番目の箱です。','もう一回だけ試します。','無理して来なくても大丈夫です。','昨日は買えませんでした。'].entries()) {
   const completed = await engine.translate(source,'ja','zh')
   for (const mode of index % 2 ? ['streamed','cached','baseline'] : ['baseline','cached','streamed']) {
    const emitter = new EventEmitter()
    let inference: Promise<string> | undefined
    const processor = new StreamingProcessor({
     emitter, agreement:new LocalAgreement(),contextBuffer:new ContextBuffer(),
     getSTTEngine:()=>({processAudio:async()=>({text:source,language:'ja'})}),
     getTranslator:()=>({translate:(text,from,to,ctx)=>{inference=engine.translate(text,from,to,{...ctx,previousSegments:[],onPartial:mode==='streamed'?ctx?.onPartial:undefined});return inference}}),getCachedTranslation:()=>mode==='cached'?completed:undefined,
     getGlossary:()=>[],getSimulMtConfig:()=>({enabled:false,waitK:3}),resolveTargetLanguage:()=> 'zh',
     incrementProcessing(){},decrementProcessing(){}
    } as unknown as StreamingDeps)
    let timeout: ReturnType<typeof setTimeout>
    const output = new Promise<any>((resolve,reject)=>{
     timeout=setTimeout(()=>reject(new Error('Interim timeout')),20000)
     emitter.on('interim-result',r=>{if(r.translatedText)resolve(r)})
    })
    const began=performance.now()
    try {
     await processor.processStreaming(new Float32Array(16000),16000)
     const result=await output
     const firstMs=performance.now()-began
     const final=inference?await inference:completed
     appendFileSync(report,JSON.stringify({type:'trial',mode,source,translated:result.translatedText,ms:firstMs,finalMs:performance.now()-began,final,sameAsCompleted:final===completed})+'\n')
    } finally {clearTimeout(timeout!);processor.reset()}
   }
  }
 } catch(error) {appendFileSync(report,JSON.stringify({type:'error',error:String(error)})+'\n');process.exitCode=1}
 finally {await engine.dispose();app.quit()}
})
