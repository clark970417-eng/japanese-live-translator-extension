import type { GlossaryEntry } from '../engines/types'

/** Platform vocabulary for written Chinese to Japanese drafts.
 *
 * A general model renders these as descriptions instead of the words a Japanese
 * viewer writes: `存檔` as `配信の記録` or `保存ファイル` rather than
 * `アーカイブ`, and `停更` as "stop moving". Entries are nouns and set phrases
 * with one obvious platform meaning; ambiguous words such as `卡` and `關` are
 * deliberately absent.
 *
 * These reach the model as terminology in the prompt, and `slm-worker.ts` keeps
 * only the entries whose source term is present in the comment being drafted.
 */
export const DRAFT_ZH_JA_GLOSSARY: GlossaryEntry[] = [
  { source: '直播存檔', target: 'アーカイブ' },
  { source: '存檔', target: 'アーカイブ' },
  { source: '直播', target: '配信' },
  { source: '開台', target: '配信開始' },
  { source: '停更', target: '更新停止' },
  { source: '留言', target: 'コメント' },
  { source: '訂閱', target: 'チャンネル登録' },
  { source: '超級留言', target: 'スーパーチャット' },
  { source: '剪輯', target: '切り抜き' }
]
