/** Long-session soak over the companion socket.
 *
 * Owns the companion host process so a real restart can be exercised, and
 * cycles speech, pauses, music, rapid utterances, typed drafts and Stop/Start
 * through the production protocol. Browser capture, VAD, tab navigation and
 * extension reload are outside this path and are not covered.
 *
 * Usage: node scripts/soak-companion.mjs <minutes> <reportPath>
 */
import { spawn } from 'child_process'
import { connect } from 'net'
import { readFileSync, writeFileSync, appendFileSync, existsSync, rmSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { execFileSync } from 'child_process'

const minutes = Number(process.argv[2] || 60)
const reportPath = process.argv[3]
if (!reportPath) throw new Error('Usage: <minutes> <reportPath>')

const root = resolve(import.meta.dirname, '..')
const profile = join(root, '.test-out/profile')
const companionDir = '/tmp/jtl-soak'
const socketPath = join(companionDir, 'desktop.sock')
const speechDir = join(root, '.test-out/soak-clips')
const nonSpeechDir = join(root, '.test-out/stage2-conditions')

const WINDOWS = [0.8, 1.6, 2.8, 4.5, 6.5, 8.5]
const DRAFTS = [
  '今天的直播很好看，謝謝你',
  '這段我可能沒辦法看完，晚點看存檔',
  '不要太累了喔，記得休息'
]
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)))
writeFileSync(reportPath, '')
const emit = row => { appendFileSync(reportPath, JSON.stringify({ atSeconds: Math.round((Date.now() - began) / 1000), ...row }) + '\n') }
const began = Date.now()

function wav(dir, id) {
  const buffer = readFileSync(join(dir, id + '.wav'))
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32LE(offset + 4)
    if (buffer.toString('ascii', offset, offset + 4) === 'data') {
      return Float32Array.from({ length: size / 2 }, (_, i) => buffer.readInt16LE(offset + 8 + i * 2) / 32768)
    }
    offset += 8 + size + (size % 2)
  }
  throw new Error('Missing WAV data for ' + id)
}

const speech = JSON.parse(readFileSync(join(root, '../tests/corpus/soak.json'), 'utf8')).map(row => row.id)
const encode = samples => Buffer.from(new Float32Array(samples).buffer).toString('base64')

/** Resident memory of the host and every descendant, in MB. */
function residentMB(pid) {
  try {
    const lines = execFileSync('ps', ['-ax', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n')
    const rows = lines.map(line => line.trim().split(/\s+/).map(Number))
    const wanted = new Set([pid])
    let changed = true
    while (changed) {
      changed = false
      for (const [child, parent] of rows) {
        if (wanted.has(parent) && !wanted.has(child)) { wanted.add(child); changed = true }
      }
    }
    return Math.round(rows.filter(([p]) => wanted.has(p)).reduce((total, [, , rss]) => total + rss, 0) / 1024)
  } catch { return null }
}

let host = null
function startHost() {
  rmSync(socketPath, { force: true })
  host = spawn(join(root, 'node_modules/.bin/electron'), [join(root, 'out/main/verify-companion-host.cjs')], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, COMPARE_PROFILE: profile, COMPANION_DIR: companionDir }
  })
  hostLog = ''
  host.stdout.on('data', d => { hostLog += d })
  host.stderr.on('data', d => { hostLog += d })
  return host
}
let hostLog = ''
async function waitForSocket(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (existsSync(socketPath)) return true
    await sleep
      ? await sleep(500) : null
  }
  return false
}

let socket = null, buffer = '', sequence = 0
const pending = new Map()
let captions = []
const request = (op, fields = {}) => new Promise((resolve, reject) => {
  if (!socket || socket.destroyed) return reject(new Error('socket closed'))
  const id = ++sequence
  pending.set(id, resolve)
  setTimeout(() => { if (pending.delete(id)) reject(new Error('request timed out: ' + op)) }, 120000)
  socket.write(JSON.stringify({ id, op, ...fields }) + '\n')
})

async function openSocket() {
  socket = connect(socketPath)
  socket.setEncoding('utf8')
  buffer = ''
  socket.on('data', data => {
    buffer += data
    let newline
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const message = JSON.parse(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
      if (message.event === 'caption') { captions.push({ at: Date.now(), ...message.result }); continue }
      if (message.event) continue
      const job = pending.get(message.id)
      if (job) { pending.delete(message.id); job(message) }
    }
  })
  socket.on('error', () => {})
  await new Promise((res, rej) => { socket.once('connect', res); socket.once('error', rej) })
}

mkdirSync(companionDir, { recursive: true })
startHost()
if (!await waitForSocket()) { emit({ type: 'fatal', error: 'host socket never appeared', log: hostLog.slice(-500) }); process.exit(1) }
await openSocket()

const stats = { utterances: 0, drafts: 0, restarts: 0, sessionCycles: 0, blank: 0, missingFinal: 0, duplicates: 0, staleAfterStop: 0, reconnects: 0, errors: [] }
const queueAges = [], finalDelays = []

try {
  const first = await request('init')
  emit({ type: 'start', minutes, ok: !!first.ok, model: first.result?.model, rssMB: residentMB(host.pid) })
  if (!first.ok) throw new Error('init failed: ' + first.error)

  const until = began + minutes * 60000
  let cycle = 0
  while (Date.now() < until) {
    cycle++
    const id = speech[cycle % speech.length]
    const pcm = wav(speechDir, id)
    captions = []
    const trialStart = performance.now()
    let index = 0
    const sent = []
    for (const seconds of WINDOWS.filter(s => s < pcm.length / 16000)) {
      await sleep(seconds * 1000 - (performance.now() - trialStart))
      const enqueued = performance.now()
      sent.push(request('decode', { audio: encode(pcm.slice(0, Math.round(seconds * 16000))), segment: `${cycle}:${index++}`, final: false })
        .then(() => queueAges.push(performance.now() - enqueued)).catch(error => stats.errors.push(String(error.message))))
    }
    await sleep(pcm.length / 16 - (performance.now() - trialStart))
    const audioEnd = performance.now()
    let final = null
    try { final = await request('decode', { audio: encode(pcm), segment: `${cycle}:${index}`, final: true }) } catch (error) { stats.errors.push(String(error.message)) }
    finalDelays.push(performance.now() - audioEnd)
    await Promise.all(sent)
    stats.utterances++
    if (captions.some(caption => !caption.text)) stats.blank++
    if (!final?.result?.text) stats.missingFinal++
    const pairs = captions.filter(caption => caption.text)
      .map(caption => `${caption.text}\u0000${caption.translated || ''}`)
    stats.duplicates += pairs.length - new Set(pairs).size

    // A pause, then a non-speech control every fourth cycle.
    if (cycle % 4 === 0) {
      const control = cycle % 8 === 0 ? 'music-only-control' : 'silence-control'
      const quiet = wav(nonSpeechDir, control)
      captions = []
      try {
        const response = await request('decode', { audio: encode(quiet), segment: `q${cycle}:0`, final: true })
        emit({ type: 'non-speech', cycle, control, text: response.result?.text || '', captions: captions.filter(c => c.text).length })
      } catch (error) { stats.errors.push(String(error.message)) }
    }

    // A typed draft every third cycle, while captions are running.
    if (cycle % 3 === 0) {
      try {
        const draft = await request('translate', { text: DRAFTS[stats.drafts % DRAFTS.length], direction: 'zh-ja' })
        stats.drafts++
        emit({ type: 'draft', cycle, ok: !!draft.ok, text: draft.result?.text, warning: !!draft.result?.reviewWarning })
      } catch (error) { stats.errors.push(String(error.message)) }
    }

    // Stop and start the caption session every fifth cycle.
    if (cycle % 5 === 0) {
      captions = []
      try {
        await request('stop')
        await sleep(2000)
        stats.staleAfterStop += captions.length
        await request('init')
        stats.sessionCycles++
      } catch (error) { stats.errors.push(String(error.message)) }
    }

    // Restart the companion process twice during the run.
    const elapsed = Date.now() - began
    const third = minutes * 60000 / 3
    if (stats.restarts === 0 && elapsed > third || stats.restarts === 1 && elapsed > third * 2) {
      emit({ type: 'restarting-host', cycle, rssMB: residentMB(host.pid) })
      socket?.destroy()
      host.kill('SIGKILL')
      await sleep(3000)
      startHost()
      const back = await waitForSocket()
      if (!back) { emit({ type: 'fatal', error: 'host did not come back', log: hostLog.slice(-500) }); break }
      await openSocket()
      const again = await request('init')
      stats.restarts++
      stats.reconnects++
      emit({ type: 'host-restarted', cycle, ok: !!again.ok, model: again.result?.model, rssMB: residentMB(host.pid) })
    }

    emit({
      type: 'cycle', cycle, id,
      queueAgeMaxMs: Math.round(Math.max(0, ...queueAges.slice(-6))),
      finalDelayMs: Math.round(finalDelays.at(-1)),
      finalText: final?.result?.text || '',
      rssMB: residentMB(host.pid),
      modelReloads: (hostLog.match(/Prefix cache session created/g) || []).length
    })
    await sleep(800)
  }

  const percentile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b)
    return Math.round(sorted[Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1)))] || 0)
  }
  emit({
    type: 'summary', minutes, ...stats,
    queueAgeP50: percentile(queueAges, .5), queueAgeP95: percentile(queueAges, .95), queueAgeMax: percentile(queueAges, 1),
    finalDelayP50: percentile(finalDelays, .5), finalDelayP95: percentile(finalDelays, .95), finalDelayMax: percentile(finalDelays, 1),
    rssMB: residentMB(host.pid)
  })
} catch (error) {
  emit({ type: 'fatal', error: String(error), log: hostLog.slice(-800) })
  process.exitCode = 1
} finally {
  try { await request('stop') } catch {}
  socket?.destroy()
  host?.kill('SIGKILL')
  rmSync(companionDir, { recursive: true, force: true })
}
