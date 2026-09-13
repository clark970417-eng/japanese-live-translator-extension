/** Cold large-model draft followed by caption init and decode.
 *
 * Each trial starts a fresh companion host, so no model is loaded. A written
 * draft is sent first; caption init and a decode stream follow shortly after.
 * Real engines, real socket protocol; browser capture is not involved.
 *
 * Usage: node scripts/measure-cold-draft.mjs <trials> <reportPath>
 */
import { spawn } from 'child_process'
import { connect } from 'net'
import { readFileSync, writeFileSync, appendFileSync, existsSync, rmSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

const trials = Number(process.argv[2] || 3)
const reportPath = process.argv[3]
if (!reportPath) throw new Error('Usage: <trials> <reportPath>')
const root = resolve(import.meta.dirname, '..')
const dir = '/tmp/jtl-cold'
const socketPath = join(dir, 'desktop.sock')
// Spawn the real binary so a kill reaches the process that owns the models.
const electron = join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
const WINDOWS = [0.8, 1.6, 2.8, 4.5]
const DELAY_BEFORE_CAPTIONS_MS = Number(process.env.CAPTION_DELAY_MS || 300)
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)))
writeFileSync(reportPath, '')
const emit = row => { appendFileSync(reportPath, JSON.stringify(row) + '\n'); console.log(JSON.stringify(row)) }

function wav(id) {
  const buffer = readFileSync(join(root, '.test-out/corpus', id + '.wav'))
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32LE(offset + 4)
    if (buffer.toString('ascii', offset, offset + 4) === 'data') return Float32Array.from({ length: size / 2 }, (_, i) => buffer.readInt16LE(offset + 8 + i * 2) / 32768)
    offset += 8 + size + (size % 2)
  }
  throw new Error('no data')
}
const encode = s => Buffer.from(new Float32Array(s).buffer).toString('base64')

emit({ type: 'configuration', trials, skipDraft: !!process.env.SKIP_DRAFT, captionDelayMs: DELAY_BEFORE_CAPTIONS_MS, draftEngine: process.env.DRAFT_ENGINE || 'offline-hymt2', label: process.env.COMPARE_LABEL || 'baseline' })

for (let trial = 0; trial < trials; trial++) {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  const host = spawn(electron, [join(root, 'out/main/verify-companion-host.cjs')], {
    cwd: root, stdio: 'ignore',
    env: { ...process.env, COMPARE_PROFILE: join(root, '.test-out/profile'), COMPANION_DIR: dir }
  })
  const deadline = Date.now() + 90000
  while (!existsSync(socketPath) && Date.now() < deadline) await sleep(200)
  if (!existsSync(socketPath)) { emit({ type: 'fatal', trial, error: 'no socket' }); host.kill('SIGKILL'); break }

  const socket = connect(socketPath); socket.setEncoding('utf8')
  const pending = new Map(); const captions = []; let buffer = '', seq = 0, t0 = 0
  socket.on('data', data => {
    buffer += data; let nl
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const m = JSON.parse(buffer.slice(0, nl)); buffer = buffer.slice(nl + 1)
      if (m.event === 'caption') { captions.push({ at: performance.now() - t0, ...m.result }); continue }
      if (m.event) continue
      const job = pending.get(m.id); if (job) { pending.delete(m.id); job({ ...m, at: performance.now() - t0 }) }
    }
  })
  await new Promise((res, rej) => { socket.once('connect', res); socket.once('error', rej) })
  const request = (op, fields = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); socket.write(JSON.stringify({ id, op, ...fields }) + '\n') })

  t0 = performance.now()
  // Control runs skip the draft to isolate the cost of a cold caption start.
  const draft = process.env.SKIP_DRAFT
    ? Promise.resolve({ ok: true, at: 0, result: { text: '' } })
    : request('translate', { text: '明天可能沒辦法來看，但我會看直播存檔，不要勉強自己喔', direction: 'zh-ja' })
  await sleep(DELAY_BEFORE_CAPTIONS_MS)
  const initSent = performance.now() - t0
  const init = request('init')
  const pcm = wav('BASIC5000_4506')
  const decodes = []
  const captionStart = performance.now()
  for (const seconds of WINDOWS.filter(s => s < pcm.length / 16000)) {
    await sleep(seconds * 1000 - (performance.now() - captionStart))
    const sentAt = performance.now() - t0
    decodes.push(request('decode', { audio: encode(pcm.slice(0, Math.round(seconds * 16000))), segment: `c${trial}:${decodes.length}`, final: false })
      .then(r => ({ sentAt, at: r.at, ok: !!r.ok, error: r.error })))
  }
  const [initResult, windowResults, draftResult] = await Promise.all([init, Promise.all(decodes), draft])
  const firstCaption = captions.find(c => c.text)
  const firstChinese = captions.find(c => c.translated)
  emit({
    type: 'trial', trial,
    draftMs: Math.round(draftResult.at), draftOk: !!draftResult.ok,
    initSentMs: Math.round(initSent), initDoneMs: Math.round(initResult.at), initWaitMs: Math.round(initResult.at - initSent), initOk: !!initResult.ok,
    firstDecodeWaitMs: Math.round(windowResults[0].at - windowResults[0].sentAt),
    maxDecodeWaitMs: Math.round(Math.max(...windowResults.map(w => w.at - w.sentAt))),
    firstCaptionAfterInitMs: firstCaption ? Math.round(firstCaption.at - initSent) : null,
    firstChineseAfterInitMs: firstChinese ? Math.round(firstChinese.at - initSent) : null,
    decodeErrors: windowResults.filter(w => !w.ok).map(w => w.error),
    draftText: draftResult.result?.text
  })
  try { await request('stop') } catch {}
  socket.destroy(); host.kill('SIGKILL')
  await new Promise(r => host.once('exit', r))
  await sleep(1500)
}
rmSync(dir, { recursive: true, force: true })
