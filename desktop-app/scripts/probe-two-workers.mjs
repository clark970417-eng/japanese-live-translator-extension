/** Memory and caption latency with the large model resident in a second process.
 *
 * Stands in for a dedicated draft worker: one process runs live captions on the
 * small model, another loads and generates with the large model at the same
 * time. Samples combined resident memory, swap-outs and memory pressure.
 *
 * Usage: node scripts/probe-two-workers.mjs <reportPath>
 */
import { spawn, execFileSync } from 'child_process'
import { connect } from 'net'
import { readFileSync, writeFileSync, appendFileSync, existsSync, rmSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

const reportPath = process.argv[2]
const root = resolve(import.meta.dirname, '..')
const electron = join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
const dir = '/tmp/jtl-two'
const socketPath = join(dir, 'desktop.sock')
const sleep = ms => new Promise(r => setTimeout(r, Math.max(0, ms)))
writeFileSync(reportPath, '')
const emit = row => { appendFileSync(reportPath, JSON.stringify(row) + '\n'); console.log(JSON.stringify(row)) }

const treeMB = pid => {
  const rows = execFileSync('ps', ['-ax', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n').map(l => l.trim().split(/\s+/).map(Number))
  const want = new Set([pid]); let grew = true
  while (grew) { grew = false; for (const [c, p] of rows) if (want.has(p) && !want.has(c)) { want.add(c); grew = true } }
  return Math.round(rows.filter(([p]) => want.has(p)).reduce((t, [, , r]) => t + r, 0) / 1024)
}
const swapouts = () => Number(execFileSync('vm_stat', { encoding: 'utf8' }).match(/Swapouts:\s+(\d+)/)[1])
const pressure = () => { try { return Number(execFileSync('memory_pressure', { encoding: 'utf8' }).match(/free percentage: (\d+)%/)[1]) } catch { return null } }
function wav(id) {
  const b = readFileSync(join(root, '.test-out/corpus', id + '.wav')); let o = 12
  while (o + 8 <= b.length) { const s = b.readUInt32LE(o + 4); if (b.toString('ascii', o, o + 4) === 'data') return Float32Array.from({ length: s / 2 }, (_, i) => b.readInt16LE(o + 8 + i * 2) / 32768); o += 8 + s + (s % 2) }
}
const encode = s => Buffer.from(new Float32Array(s).buffer).toString('base64')

rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
const swap0 = swapouts()
emit({ type: 'start', freePercent: pressure(), swapouts: swap0 })

// 1. Caption process on the small model.
const captionHost = spawn(electron, [join(root, 'out/main/verify-companion-host.cjs')], { cwd: root, stdio: 'ignore',
  env: { ...process.env, COMPARE_PROFILE: join(root, '.test-out/profile'), COMPANION_DIR: dir, DRAFT_ENGINE: 'offline-hymt15' } })
while (!existsSync(socketPath)) await sleep(200)
const socket = connect(socketPath); socket.setEncoding('utf8')
const pending = new Map(); let buf = '', seq = 0
socket.on('data', d => { buf += d; let n; while ((n = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, n)); buf = buf.slice(n + 1); if (m.event) continue; const j = pending.get(m.id); if (j) { pending.delete(m.id); j(m) } } })
await new Promise(r => socket.once('connect', r))
const request = (op, f = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); socket.write(JSON.stringify({ id, op, ...f }) + '\n') })
await request('init')

async function captionRound(label) {
  const ids = ['BASIC5000_4507', 'BASIC5000_4508', 'BASIC5000_4509']
  const waits = []
  for (const id of ids) {
    const pcm = wav(id)
    for (const seconds of [0.8, 1.6, 2.8, 4.5].filter(s => s < pcm.length / 16000)) {
      const t = performance.now()
      await request('decode', { audio: encode(pcm.slice(0, Math.round(seconds * 16000))), segment: `${label}:${id}:${seconds}`, final: false })
      waits.push(performance.now() - t)
    }
  }
  waits.sort((a, b) => a - b)
  return { median: Math.round(waits[Math.floor(waits.length / 2)]), max: Math.round(waits.at(-1)), n: waits.length }
}

const alone = await captionRound('alone')
emit({ type: 'captions-small-only', ...alone, captionTreeMB: treeMB(captionHost.pid), freePercent: pressure(), swapoutsDelta: swapouts() - swap0 })

// 2. Large model in a second process, generating repeatedly.
const largeHost = spawn(electron, [join(root, 'out/main/benchmark-holdout.cjs')], { cwd: root, stdio: 'ignore',
  env: { ...process.env, COMPARE_PROFILE: join(root, '.test-out/profile'), HOLDOUT_MANIFEST: join(root, '../tests/corpus/translation-holdout.json'),
    COMPARE_REPORT: '/tmp/jtl-two/large.jsonl', COMPARE_TRANSLATOR: 'hunyuan-mt-2', COMPARE_LABEL: 'probe' } })
let peak = 0, minFree = 100
const sampler = setInterval(() => {
  const total = treeMB(captionHost.pid) + treeMB(largeHost.pid)
  peak = Math.max(peak, total)
  const f = pressure(); if (f !== null) minFree = Math.min(minFree, f)
}, 1000)
// Wait until the large model is actually generating.
while (!existsSync('/tmp/jtl-two/large.jsonl') || !readFileSync('/tmp/jtl-two/large.jsonl', 'utf8').includes('"type":"trial"')) await sleep(500)
const contended = await captionRound('contended')
emit({ type: 'captions-while-large-generates', ...contended, combinedPeakMB: peak, minFreePercent: minFree, swapoutsDelta: swapouts() - swap0 })

clearInterval(sampler)
largeHost.kill('SIGKILL'); captionHost.kill('SIGKILL'); socket.destroy()
await sleep(1500)
emit({ type: 'end', freePercent: pressure(), swapoutsDelta: swapouts() - swap0 })
rmSync(dir, { recursive: true, force: true })
