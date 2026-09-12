/** Isolated real-model cancellation/recovery probe; never targets an installed app. */
import { app } from 'electron'
import { writeFileSync, appendFileSync, readFileSync } from 'fs'
import { HunyuanMT15Translator } from '../src/engines/translator/HunyuanMT15Translator'
import { workerPool } from '../src/main/worker-pool'
if (!process.env.COMPARE_PROFILE || !process.env.COMPARE_REPORT) throw new Error('Set isolated profile/report')
app.setPath('userData', process.env.COMPARE_PROFILE)
app.whenReady().then(async () => {
 const engine = new HunyuanMT15Translator(), report=process.env.COMPARE_REPORT!
 const emit=(row:unknown)=>{appendFileSync(report,JSON.stringify(row)+'\n');console.log(JSON.stringify(row))}
 writeFileSync(report,'')
 try {
  await engine.initialize()
  const source='今日は先に寝ます。'
  const reference=await engine.translate(source,'ja','zh')
  emit({type:'metadata',scope:'Real local translation worker; excludes audio and recognition',source,reference})
  for(let cycle=0;cycle<12;cycle++) {
   const controller=new AbortController()
   let partials=0
   const start=performance.now()
   const interrupted=engine.translate('今日は配信に来てくれてありがとうございます。明日は少し早い時間から始める予定です。','ja','zh',{
    signal:controller.signal,onPartial:()=>{partials++;controller.abort()}
   }).then(text=>({unexpectedSuccess:text}),error=>({error:String(error)}))
   const result=await interrupted
   const recovered=await engine.translate(source,'ja','zh')
   emit({type:'recovery',cycle,partials,result,recovered,same:recovered===reference,ms:performance.now()-start})
   if(!('error' in result)||!partials||recovered!==reference)throw new Error('Cancellation or output regression')
  }
  if (process.env.RECOVERY_CASES) {
   const cases=JSON.parse(readFileSync(process.env.RECOVERY_CASES,'utf8')) as Array<{id:string,text:string}>
   let mismatches=0
   for (const row of cases) {
    const expected=await engine.translate(row.text,'ja','zh')
    const controller=new AbortController()
    await engine.translate('来週は北海道へ旅行に行きます。飛行機の予約はまだ取っていません。','ja','zh',{
     signal:controller.signal,onPartial:()=>controller.abort()
    }).catch(()=>{})
    const translated=await engine.translate(row.text,'ja','zh')
    const same=translated===expected
    if(!same)mismatches++
    emit({type:'content-check',id:row.id,source:row.text,expected,translated,same})
   }
   if(mismatches)throw new Error('Post-cancellation output differences: '+mismatches)
  }
  // Deliberately freeze ONLY this benchmark's own child to exercise native-hang recovery.
  const child=(workerPool as unknown as {worker:Electron.UtilityProcess}).worker
  if(!child?.pid)throw new Error('Missing isolated worker PID')
  process.kill(child.pid,'SIGSTOP')
  const controller=new AbortController(),start=performance.now()
  const stopped=engine.translate(source,'ja','zh',{signal:controller.signal}).catch(error=>String(error))
  await new Promise(resolve=>setTimeout(resolve,50))
  controller.abort()
  const failure=await stopped
  const cancellationMs=performance.now()-start
  const restored=await engine.translate(source,'ja','zh')
  emit({type:'hard-recovery',failure,cancellationMs,totalMs:performance.now()-start,restored,same:restored===reference})
  if(!String(failure).includes('cancelled')||restored!==reference)throw new Error('Hard recovery failed')
  emit({type:'complete'})
 }catch(error){emit({type:'fatal',error:String(error)});process.exitCode=1}
 finally{await engine.dispose();app.quit()}
})
