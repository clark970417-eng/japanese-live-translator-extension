/** Local text-quality probe; records outputs for human review, never posts messages. */
import { app } from 'electron'
import { writeFileSync } from 'fs'
import { HunyuanMT15Translator } from '../src/engines/translator/HunyuanMT15Translator'
if (!process.env.COMPARE_PROFILE || !process.env.COMPARE_REPORT) throw new Error('Set isolated COMPARE_PROFILE and COMPARE_REPORT')
app.setPath('userData',process.env.COMPARE_PROFILE)
const cases = [
  ['zh','ja','都好好聽呀～！'],
  ['zh','ja','以前和現在的歌聲都很好聽，我都很喜歡！'],
  ['zh','ja','晚安啊，REC加油～'],
  ['zh','ja','睡飽飽補精神喔🤎✨'],
  ['zh','ja','謝謝排程，了解🫡'],
  ['zh','ja','鹿乃chan，今天也辛苦了！'],
  ['zh','ja','如果有不懂的漢字和功能，可以問我ww'],
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
  ['zh','ja','今天沒辦法看到最後，明天再來看！'],
  ['zh','ja','等一下要出門，今天不能待到結束。'],
  ['zh','ja','昨天太忙，沒能看完直播。'],
  ['zh','ja','明天也不一定能來，請不要等我。'],
  ['ja','zh','今日はもう遊べませんが、昨日は最後まで遊べました。'],
  ['zh','ja','我明天晚上還會來看，今天先去睡了。'],
  ['zh','ja','我昨天沒能來，今天終於趕上了！'],
  ['zh','ja','謝謝你整理下週的時間表，我知道了。'],
  ['zh','ja','希望你今晚能睡飽，明天精神好一點。'],
  ['zh','ja','剛才那首歌真好聽，不用再唱一次也沒關係喔。'],
  ['ja','zh','明日も来られるかはまだ分かりません。待たなくて大丈夫です。'],
  ['ja','zh','昨日じゃなくて、来週の金曜日に変更になりました。'],
  ['ja','zh','あと三回と言いましたが、今日はもう一回だけにします。']
] as const
app.whenReady().then(async()=>{
 const engine = new HunyuanMT15Translator({ variant: process.env.COMPARE_VARIANT || 'Q4_K_M' })
 const results: unknown[]=[]
 try {
  await engine.initialize()
  for(const [from,to,text] of cases){
   const start=performance.now()
   const translated=await engine.translate(text,from,to)
   const result={variant:process.env.COMPARE_VARIANT || 'Q4_K_M',from,to,source:text,translated,ms:Math.round(performance.now()-start)}
   results.push(result);console.log(JSON.stringify(result))
   if(!translated.trim())throw new Error('Empty translation')
  }
 }catch(error){results.push({error:String(error)});process.exitCode=1}
 finally{await engine.dispose();writeFileSync(process.env.COMPARE_REPORT!,JSON.stringify(results,null,2));app.quit()}
})
