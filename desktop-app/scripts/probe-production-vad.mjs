/** Replays a WAV through the extension's own VAD stages: SpeechGain, Silero V5
 * with 64 samples of context, and SpeechWindows. Reports what would be sent. */
import { createRequire } from 'module'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
const root = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '')
const require = createRequire(root + '/desktop-app/package.json')
const ort = require('onnxruntime-node')
const { SpeechWindows, SpeechGain } = await import(root + '/streaming.mjs')
const session = await ort.InferenceSession.create(root + '/vendor/silero/silero_vad_v5.onnx')
const sr = new ort.Tensor('int64', BigInt64Array.from([16000n]), [])

function wav(path) {
  const b = readFileSync(path); let o = 12
  while (o + 8 <= b.length) { const s = b.readUInt32LE(o + 4); if (b.toString('ascii', o, o + 4) === 'data') return Float32Array.from({ length: s / 2 }, (_, i) => b.readInt16LE(o + 8 + i * 2) / 32768); o += 8 + s + (s % 2) }
}
for (const path of process.argv.slice(2)) {
  const audio = wav(path)
  const windows = new SpeechWindows(); windows.maxSamples = 320000; windows.overlapFrames = 0
  const gain = new SpeechGain()
  let state = new ort.Tensor('float32', new Float32Array(256), [2, 1, 128]), context = new Float32Array(64)
  let jobs = 0, voicedFrames = 0, maxProbability = 0, frames = 0
  // Trailing silence lets an utterance end the way live capture would.
  const padded = new Float32Array(audio.length + 16000); padded.set(audio)
  for (let i = 0; i + 512 <= padded.length; i += 512) {
    const frame = gain.push(padded.slice(i, i + 512))
    const input = new Float32Array(576); input.set(context); input.set(frame, 64); context = frame.slice(-64)
    const out = await session.run({ input: new ort.Tensor('float32', input, [1, 576]), state, sr })
    state = out.stateN
    const p = Number(out.output.data[0]); frames++
    maxProbability = Math.max(maxProbability, p)
    if (p >= 0.30) voicedFrames++
    if (windows.push(frame, p, 0.65)) jobs++
  }
  if (windows.finish?.()) jobs++
  console.log(JSON.stringify({ file: path.split('/').at(-1), jobsSentToCompanion: jobs, voicedSecondsAtOnsetThreshold: +(voicedFrames * 512 / 16000).toFixed(2), maxProbability: +maxProbability.toFixed(3) }))
}
