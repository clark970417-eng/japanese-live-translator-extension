/** Source-aware guidance and conservative output repairs for Japanese captions.
 *
 * HY-MT 1.5 is fast enough for live captions, but its small model sometimes
 * treats stream/game loanwords literally or drops grammatical evidence such as
 * hearsay and double negation.  Rules here only activate when that evidence is
 * present in the Japanese source.  They never add a topic or action that cannot
 * be recovered from the source.
 */

const TERM_GUIDANCE: Array<[RegExp, string]> = [
  [/アーカイブ/, 'アーカイブ是直播存檔'],
  [/アーカイブに残さない/, 'アーカイブに残さない是「不保留直播存檔」'],
  [/アーカイブ公開後/, 'アーカイブ公開後是「直播存檔公開後」'],
  [/切り抜き/, '切り抜き是直播精華剪輯'],
  [/音がずれ/, '音がずれる是聲音不同步'],
  [/クールタイム/, 'クールタイム是冷卻時間'],
  [/リスポーン地点/, 'リスポーン地点是重生點'],
  [/回線落ち/, '回線落ち是網路斷線'],
  [/マッチ/, 'マッチ是遊戲對戰'],
  [/むず(?:い|く)/, 'むずい是困難，不是真假'],
  [/早めに終わ/, '早めに終わる是早點結束，不是盡快處理事情'],
  [/帰っていい/, '帰っていい是允許對方可以回去'],
  [/課金しなくても/, '課金しなくても是「不課金也可以」，不要寫成「不付課金」'],
]

export function buildJaZhFidelityGuidance(source: string): string {
  const rules = TERM_GUIDANCE.filter(([pattern]) => pattern.test(source)).map(([, rule]) => rule)
  if (/(?:らしい|そうです(?:よ)?|とのこと(?:です)?)(?:[。！？!?]|$)/.test(source)) {
    rules.push('句尾是傳聞語氣，譯文要明確保留「聽說」或「據說」')
  }
  if (/ないわけじゃない/.test(source)) {
    rules.push('「ないわけじゃない」是雙重否定，要保留「也不是不能」的意思')
  }
  if (/というか$|そろそろ$|だったら[………。]*$/.test(source)) {
    rules.push('原句尚未說完，譯文也要停在同一處，不可猜測後續動作')
  }
  return rules.length ? `本句注意：${rules.join('；')}。` : ''
}

const hasHearsay = (text: string): boolean => /聽說|據說|據了解|傳聞|消息/.test(text)

export function finishJaZhTranslation(source: string, output: string): string {
  let result = output.trim()

  if (/リスポーン地点/.test(source)) {
    result = result.replace(/リスポーン(?:地点|地點|點)?|回程(?:的)?(?:地点|地點|點)|復活(?:的)?(?:地点|地點)|重生(?:的)?(?:地点|地點)/g, '重生點')
  }
  if (/クールタイム/.test(source)) {
    result = result.replace(/(?:技能的)?有效時間/g, '冷卻時間')
  }
  if (/アーカイブ公開後/.test(source)) {
    result = result.replace(/(?:資源)?被?歸檔後|(?:資源|檔案)(?:被)?公開(?:之)?後/g, '直播存檔公開後')
  } else if (/アーカイブ/.test(source)) {
    result = result.replace(/檔案館|歸檔檔案|(?<!直播)存檔|檔案/g, '直播存檔')
  }
  if (/切り抜き/.test(source)) {
    result = result.replace(/切り抜き(?:處理)?|切斷處理|切斷|裁切處理/g, '剪輯')
  }
  if (/音がずれ/.test(source)) {
    result = result.replace(/(?:音訊|音頻|聲音)(?:就)?(?:出現了)?(?:錯誤|顆粒感)/g, '聲音不同步')
  }
  if (/回線落ち/.test(source)) {
    result = result.replace(/電話線(?:路)?(?:斷了|中斷了)?|電話線路/g, '斷線')
    if (/マッチから切断/.test(source) && !/對戰|比賽|遊戲/.test(result)) {
      result = result.replace(/(?:通訊|連線)(?:已經)?中斷(?:了)?/, '被踢出對戰')
    }
  }
  if (/終わったとは言ってない/.test(source) && /還沒有說完|還沒說完/.test(result)) {
    result = result.replace(/還沒有說完(?:呢|喔)?|還沒說完(?:呢|喔)?/, '我還沒說已經結束了喔')
  }
  if (/勝てないわけじゃない/.test(source)) {
    result = result.replace(/^雖然(?:無法|不能)(?:勝利|獲勝|贏)/, '也不是不能贏')
  }
  if (/早めに終わ/.test(source)) {
    result = result.replace(/盡快結束(?:這件事)?/g, '早點結束')
  }
  if (/課金しなくても/.test(source)) {
    result = result.replace(/不(?:付|支付)課金/g, '不課金')
  }
  if (/帰っていい/.test(source) && !/可以|能夠|能先/.test(result)) {
    result = result.replace(/(?:那麼)?(?:就)?先回去吧[。！]?/, '可以先回去喔。')
  }
  if (/(?:らしい|そうです(?:よ)?|とのこと(?:です)?)(?:[。！？!?]|$)/.test(source) && !hasHearsay(result)) {
    result = `聽說${result.replace(/似乎/g, '').replace(/真的/g, '')}`
  }
  if (/そろそろ$/.test(source)) {
    result = result.replace(/(?:所以|因此)[，,]?差不多該.+$/, '所以差不多該……')
  }
  if (/というか$/.test(source) && !/[………]$/.test(result)) {
    result = `${result.replace(/[。！？!?吧]+$/, '')}，該怎麼說……`
  }

  return result
}
