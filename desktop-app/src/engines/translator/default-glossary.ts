import type { GlossaryEntry } from '../types'

/** REJECTED EXPERIMENT, retained as the input that produced its evidence.
 *
 * Candidate Japanese to Traditional Chinese terminology for livestream and game
 * speech. It is deliberately NOT wired into the production glossary: injecting
 * terminology into HY-MT1.5 made one holdout sentence come back in Japanese
 * instead of Chinese. See RETEST-ACCURACY.md and
 * tests/results/holdout-glossary-filtered.jsonl. Only the benchmark imports it.
 *
 * The original intent was: These are the loanwords and stream-specific nouns that a general
 * translation model renders as something else entirely: `アーカイブ` as a future
 * version, `クールタイム` as a validity period, `リスポーン地点` as a return
 * point. They reach the model as terminology in the prompt, so a term inside a
 * sentence is translated in context rather than substituted literally.
 *
 * This is vocabulary, not sentence replacement. A user's own glossary and an
 * organization glossary both override any entry here.
 */
export const DEFAULT_JA_ZH_GLOSSARY: GlossaryEntry[] = [
  // Stream structure
  { source: 'アーカイブ', target: '直播存檔' },
  { source: '切り抜き', target: '精華剪輯' },
  { source: 'コメント欄', target: '留言區' },
  { source: 'スパチャ', target: '超級留言' },
  { source: 'チャンネル登録', target: '訂閱頻道' },
  { source: '高評価', target: '按讚' },
  { source: '待機所', target: '等待室' },
  { source: '同時視聴', target: '同步觀看' },
  { source: '初見', target: '初次觀看' },
  { source: 'ネタバレ', target: '劇透' },

  // Game systems
  { source: 'リスポーン地点', target: '重生點' },
  { source: 'リスポーン', target: '重生' },
  { source: 'クールタイム', target: '冷卻時間' },
  { source: 'クールダウン', target: '冷卻時間' },
  { source: 'ラグ', target: '延遲' },
  { source: 'バフ', target: '增益效果' },
  { source: 'デバフ', target: '減益效果' },
  { source: 'ヒール', target: '治療' },
  { source: 'ダメージ', target: '傷害' },
  { source: 'ガチャ', target: '轉蛋' },
  { source: '周回', target: '刷關' },
  { source: '実績', target: '成就' },
  { source: '縛りプレイ', target: '限制玩法' },
  { source: '引き継ぎ', target: '繼承存檔' },
  { source: 'ステータス', target: '屬性數值' }
]
