/** Use the production translator worker, with a frozen external case manifest. */
import { app, powerSaveBlocker } from 'electron'
import { readFileSync, writeFileSync, appendFileSync } from 'fs'
import { createHash } from 'crypto'
import { HunyuanMT15Translator } from '../src/engines/translator/HunyuanMT15Translator'
import { HunyuanMT2Translator } from '../src/engines/translator/HunyuanMT2Translator'
import { translateWrittenDraft } from '../src/main/draft-fidelity'
import type { Language } from '../src/engines/types'
const {COMPARE_PROFILE,COMPARE_REPORT,FIDELITY_CASES,COMPARE_TRANSLATOR}=process.env
if(!COMPARE_PROFILE||!COMPARE_REPORT||!FIDELITY_CASES)throw new Error('Set profile, report and cases')
app.setPath('userData',COMPARE_PROFILE)
app.whenReady().then(async()=>{
 const hold=powerSaveBlocker.start('prevent-app-suspension')
 const engine=COMPARE_TRANSLATOR==='7b'?new HunyuanMT2Translator({variant:'7B-Q4_K_M'}):COMPARE_TRANSLATOR==='mt2-small'?new HunyuanMT2Translator():new HunyuanMT15Translator()
 const input=readFileSync(FIDELITY_CASES,'utf8')
 const manifest=JSON.parse(input)
 const cases: Array<{id:string,from:Language,to:Language,text:string}> = Array.isArray(manifest) ? manifest : manifest.samples.map((item: {id:string,direction:string,text:string})=>({id:item.id,text:item.text,from:item.direction.split('-')[0],to:item.direction.split('-')[1]}))
 const emit=(row:unknown)=>{appendFileSync(COMPARE_REPORT,JSON.stringify(row)+'\n');console.log(JSON.stringify(row))}
 writeFileSync(COMPARE_REPORT,'')
 try{
  emit({type:'metadata',model:engine.id,draftRepair:process.env.COMPARE_DRAFT==='1',variant:COMPARE_TRANSLATOR||'1.5-small',manifestHash:createHash('sha256').update(input).digest('hex'),scope:'Actual desktop worker text translation; no audio, browser capture, or blind human quality score'})
  await engine.initialize()
  await engine.translate('準備ができました。','ja','zh')
  for(const item of cases){
   const start=performance.now()
   try{
    const draft = process.env.COMPARE_DRAFT === '1' && item.from === 'zh' && item.to === 'ja' ? await translateWrittenDraft(item.text, (text, signal) => engine.translate(text, item.from, item.to, {signal, previousSegments: []})) : {text: await engine.translate(item.text,item.from,item.to)}
    const translated=draft.text
    emit({type:'trial',...item,translated,...('repaired' in draft ? {repaired:draft.repaired}:{}),...('reviewWarning' in draft ? {reviewWarning:draft.reviewWarning}:{}),ms:performance.now()-start})
    if(!translated.trim())throw new Error('Empty output')
   }catch(error){emit({type:'error',id:item.id,error:String(error)});process.exitCode=1}
  }
  emit({type:'complete'})
 }finally{await engine.dispose();powerSaveBlocker.stop(hold);app.quit()}
})
