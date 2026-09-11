/** Local text-quality probe; records outputs for human review, never posts messages. */
import { app } from 'electron'
import { writeFileSync } from 'fs'
import { HunyuanMT15Translator } from '../src/engines/translator/HunyuanMT15Translator'
if (!process.env.COMPARE_PROFILE || !process.env.COMPARE_REPORT) throw new Error('Set isolated COMPARE_PROFILE and COMPARE_REPORT')
app.setPath('userData',process.env.COMPARE_PROFILE)
const cases = [
  ['ja','zh','今日は配信しません。明日の夜八時に会いましょう。'],
  ['ja','zh','あと二回だけ挑戦します。まだクリアしていません。'],
  ['ja','zh','右じゃなくて、左の扉を開けてください。'],
  ['ja','zh','ちょっと待って。魚が逃げちゃった！'],
  ['ja','zh','来てくれてありがとうございます。'],
  ['ja','zh','やばい、やばい！ああー！'],
  ['zh','ja','今天的直播很開心，謝謝你！請好好休息喔。'],
  ['zh','ja','這套衣服好可愛！也很適合你。'],
  ['zh','ja','不好意思，我還不太懂日文，請問明天幾點開始呢？'],
  ['zh','ja','不用勉強自己喔，我會慢慢等的。'],
  ['zh','ja','不是右邊，是左邊喔。'],
  ['zh','ja','今天沒辦法看到最後，明天再來看！']
] as const
app.whenReady().then(async()=>{
 const engine = new HunyuanMT15Translator()
 const results: unknown[]=[]
 try {
  await engine.initialize()
  for(const [from,to,text] of cases){
   const start=performance.now()
   const translated=await engine.translate(text,from,to)
   const result={from,to,source:text,translated,ms:Math.round(performance.now()-start)}
   results.push(result);console.log(JSON.stringify(result))
   if(!translated.trim())throw new Error('Empty translation')
  }
 }catch(error){results.push({error:String(error)});process.exitCode=1}
 finally{await engine.dispose();writeFileSync(process.env.COMPARE_REPORT!,JSON.stringify(results,null,2));app.quit()}
})
