/** Count redundant caption events over the real companion socket.
 *
 * A redundant event repeats, for the same segment, exactly what the previous
 * event for that segment already said: the same Japanese, Chinese, language,
 * speaker and interim or final state. Only its timestamp may differ. The same
 * words in a different segment are legitimate and counted separately.
 *
 * Usage: node scripts/measure-caption-repeats.mjs <reportPath>
 */
import { spawn } from 'child_process'
import { connect } from 'net'
import { readFileSync, writeFileSync, appendFileSync, existsSync, rmSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

const reportPath = process.argv[2]
const root = resolve(import.meta.dirname, '..')
const electron = join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
const dir = '/tmp/jtl-repeat'
const socketPath = join(dir, 'desktop.sock')
const WINDOWS = [0.8, 1.6, 2.8, 4.5, 6.5, 8.5]
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)))
writeFileSync(reportPath, '')
const emit = row => { appendFileSync(reportPath, JSON.stringify(row) + '\n'); console.log(JSON.stringify(row)) }
function wav(dir, id) {
  const b = readFileSync(join(dir, id + '.wav')); let o = 12
  while (o + 8 <= b.length) { const s = b.readUInt32LE(o + 4); if (b.toString('ascii', o, o + 4) === 'data') return Float32Array.from({ length: s / 2 }, (_, i) => b.readInt16LE(o + 8 + i * 2) / 32768); o += 8 + s + (s % 2) }
}
const encode = s => Buffer.from(new Float32Array(s).buffer).toString('base64')

rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
const host = spawn(electron, [join(root, 'out/main/verify-companion-host.cjs')], { cwd: root, stdio: 'ignore',
  env: { ...process.env, COMPARE_PROFILE: join(root, '.test-out/profile'), COMPANION_DIR: dir, DRAFT_ENGINE: 'offline-hymt15' } })
while (!existsSync(socketPath)) await sleep(200)
const socket = connect(socketPath); socket.setEncoding('utf8')
const pending = new Map(); const events = []; let buf = '', seq = 0
socket.on('data', d => { buf += d; let n; while ((n = buf.indexOf('\n')) >= 0) {
  const line = buf.slice(0, n); buf = buf.slice(n + 1); const m = JSON.parse(line)
  if (m.event === 'caption') { events.push({ at: performance.now(), raw: line, m }); continue }
  if (m.event) continue
  const j = pending.get(m.id); if (j) { pending.delete(m.id); j(m) } } })
await new Promise(r => socket.once('connect', r))
const request = (op, f = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); socket.write(JSON.stringify({ id, op, ...f }) + '\n') })
await request('init')

// Speech, including one clip replayed as two separate segments so legitimate
// cross-segment repetition exists to be preserved.
const plan = ['BASIC5000_4510', 'BASIC5000_4511', 'soak-h', 'soak-h', 'BASIC5000_4512', 'soak-c', 'soak-c']
for (const [index, id] of plan.entries()) {
  const source = id.startsWith('soak') ? join(root, '.test-out/soak-clips') : join(root, '.test-out/corpus')
  const pcm = wav(source, id)
  const start = performance.now()
  const sent = []
  let w = 0
  for (const seconds of WINDOWS.filter(s => s < pcm.length / 16000)) {
    await sleep(seconds * 1000 - (performance.now() - start))
    sent.push(request('decode', { audio: encode(pcm.slice(0, Math.round(seconds * 16000))), segment: `u${index}:${w++}`, final: false }))
  }
  await sleep(pcm.length / 16 - (performance.now() - start))
  sent.push(request('decode', { audio: encode(pcm), segment: `u${index}:${w}`, final: true }))
  await Promise.all(sent)
  await sleep(1500)
}
await request('stop'); await sleep(1000)

const signature = m => { const { timestamp, ...rest } = m.result; return JSON.stringify([m.segment, rest]) }
const lastBySegment = new Map()
let byteIdentical = 0, contentRepeat = 0
const gaps = []
for (const [i, e] of events.entries()) {
  const previous = lastBySegment.get(e.m.segment)
  if (previous) {
    if (previous.raw === e.raw) byteIdentical++
    if (signature(previous.m) === signature(e.m)) { contentRepeat++; gaps.push(Math.round(e.at - previous.at)) }
  }
  lastBySegment.set(e.m.segment, e)
}
const pairKey = m => JSON.stringify([m.result.text, m.result.translated])
const segmentsByPair = new Map()
for (const e of events) { if (!e.m.result.text) continue; const k = pairKey(e.m); if (!segmentsByPair.has(k)) segmentsByPair.set(k, new Set()); segmentsByPair.get(k).add(e.m.segment) }
const crossSegment = [...segmentsByPair.values()].filter(s => s.size > 1).length
gaps.sort((a, b) => a - b)
emit({ type: 'summary', label: process.env.COMPARE_LABEL || 'baseline', captionEvents: events.length, segments: lastBySegment.size,
  byteIdenticalRepeats: byteIdentical, contentRepeatsSameSegment: contentRepeat,
  repeatGapMedianMs: gaps[Math.floor(gaps.length / 2)] ?? null, repeatGapMaxMs: gaps.at(-1) ?? null,
  captionPairsSeenInMoreThanOneSegment: crossSegment })
for (const e of events) emit({ type: 'event', at: Math.round(e.at), segment: e.m.segment, result: e.m.result })
socket.destroy(); host.kill('SIGKILL'); await new Promise(r => host.once('exit', r))
rmSync(dir, { recursive: true, force: true })
