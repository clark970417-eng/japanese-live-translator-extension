/** Pure helpers for the Opera acceptance diagnostics collector, kept separate so
 * they can be tested without a machine, an app or a browser. */
import { createHash } from 'crypto'

/** Extension files Opera actually loads, as installed by the Stage 9 procedure. */
export const EXTENSION_RUNTIME = [
  'manifest.json', 'background.js', 'content.js', 'x-content.js', 'social-content.js', 'caption-window.js', 'caption-window.css',
  'content.css', 'x-content.css', 'social-content.css', 'offscreen.js', 'offscreen.html', 'popup.html', 'popup.js', 'popup.css',
  'audio-worklet.js', 'vad-worker.js', 'speech-worker.js', 'desktop-worker.js', 'streaming.mjs', 'stream-core.mjs',
  'token-stream.mjs', 'cue-cursor.mjs', 'native-client.mjs', 'recording-queue.mjs', 'translation-policy.mjs',
  'capture-status.mjs', 'whisper-runtime.js'
]

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

/** Compare installed extension files to source. `read` returns bytes or null. */
export function compareRuntime(readSource, readInstalled, files = EXTENSION_RUNTIME) {
  const missing = [], differing = []
  for (const file of files) {
    const installed = readInstalled(file)
    if (!installed) { missing.push(file); continue }
    const source = readSource(file)
    if (!source || sha256(source) !== sha256(installed)) differing.push(file)
  }
  return { checked: files.length, missing, differing, identical: !missing.length && !differing.length }
}

/** A session log that never recorded its end means that session died. */
export function sessionLogEnded(text) {
  return /^Session ended:/m.test(text)
}

export const swapouts = vmStat => Number(/Swapouts:\s+(\d+)/.exec(vmStat)?.[1] ?? NaN)
export const freePercent = pressure => Number(/free percentage: (\d+)%/.exec(pressure)?.[1] ?? NaN)

/** Only crash reports from processes this run can involve, by file name. The
 * report contents are never read. */
export const RELEVANT_CRASH = /^(Japanese Live Translate|Electron|Opera|node|python3?|slm-worker)/i

/** Summarize pasted popup health dumps: each is the JSON the extension returns
 * for `{ type: 'health' }`. */
export function summarizeHealth(dumps) {
  return dumps.map(({ label, health }) => {
    const d = health?.diagnostics || {}
    const metric = name => d.metrics?.[name] ? { p50: d.metrics[name].p50, p95: d.metrics[name].p95, count: d.metrics[name].count } : null
    return {
      label, running: !!health?.running, lastError: health?.lastError || '',
      audioEndToChineseMs: d.chineseLagMs ?? null, queueMs: metric('queueMs'), decodeMs: metric('decodeMs'),
      firstJapaneseMs: metric('firstJapaneseMs'), pending: d.queueDepth ?? null,
      droppedAudio: d.dropped ?? null, audioResyncs: d.overruns ?? null, rejectedResults: d.rejected ?? null,
      recordingPending: health?.recordingPending ?? null, recordingFailed: health?.recordingFailed ?? null
    }
  })
}
