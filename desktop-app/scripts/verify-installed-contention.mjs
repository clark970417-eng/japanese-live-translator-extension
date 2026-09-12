/** Installed-path verification for worker contention and non-speech audio.
 *
 * Speaks the companion socket protocol exactly as background.js does, against a
 * running companion host with the production pipeline, engines and settings.
 * Chrome/Opera and tab capture are not involved, so this is not a substitute
 * for the browser smoke test; it does cover the native companion, the real
 * pipeline, both engines, caption events, ordering and stop/drain.
 *
 * Usage: node scripts/verify-installed-contention.mjs <audioDir> <reportPath>
 */
import { connect } from 'net'
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const [audioDir, reportPath, companionDir] = process.argv.slice(2)
if (!audioDir || !reportPath) throw new Error('Usage: <audioDir> <reportPath> [companionDir]')
const socketPath = join(companionDir || join(homedir(), 'Library/Application Support/JapaneseLiveCaption'), 'desktop.sock')
if (!existsSync(socketPath)) throw new Error('Companion socket not found at ' + socketPath + '; start the companion host first')

const WINDOWS = [0.8, 1.6, 2.8, 4.5, 6.5, 8.5]
const DRAFT_REPAIR = '明天可能沒辦法來看，但我會看直播存檔，不要勉強自己喔'
// A longer comment maximizes the first, deliberately uninterruptible generation.
const DRAFT_LONG = '今天的直播真的太好笑了，我從頭看到尾都在笑，可能是因為你反應太快了，下次也請繼續加油喔'
const CONTENTION_TRIALS = 3

const sleep = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))
writeFileSync(reportPath, '')
const emit = row => { appendFileSync(reportPath, JSON.stringify(row) + '\n'); console.log(JSON.stringify(row)) }

function wav(id) {
  const buffer = readFileSync(join(audioDir, id + '.wav'))
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

const socket = connect(socketPath)
socket.setEncoding('utf8')
const pending = new Map()
const captions = []
let sequence = 0, buffer = ''
let clock = 0

socket.on('data', data => {
  buffer += data
  let newline
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const message = JSON.parse(buffer.slice(0, newline))
    buffer = buffer.slice(newline + 1)
    if (message.event === 'caption') {
      captions.push({ atMs: Math.round(performance.now() - clock), segment: message.segment, ...message.result })
      continue
    }
    if (message.event) continue
    const job = pending.get(message.id)
    if (!job) continue
    pending.delete(message.id)
    job(message)
  }
})

const request = (op, fields = {}) => new Promise(resolve => {
  const id = ++sequence
  pending.set(id, resolve)
  socket.write(JSON.stringify({ id, op, ...fields }) + '\n')
})

const encode = samples => Buffer.from(new Float32Array(samples).buffer).toString('base64')

await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject) })

try {
  const started = await request('init')
  emit({ type: 'init', ok: !!started.ok, model: started.result?.model, error: started.error })
  if (!started.ok) throw new Error('init failed: ' + started.error)

  for (let trial = 0; trial < CONTENTION_TRIALS; trial++) {
    const id = 'BASIC5000_450' + (trial + 1)
    const pcm = wav(id)
    const epoch = 100 + trial
    captions.length = 0
    clock = performance.now()
    let draft = null, draftSentAt = 0, draftSource = ''
    const decodes = []

    let index = 0
    for (const seconds of WINDOWS.filter(s => s < pcm.length / 16000)) {
      await sleep(seconds * 1000 - (performance.now() - clock))
      const segment = `${epoch}:${index++}`
      const sentAt = performance.now() - clock
      decodes.push(request('decode', { audio: encode(pcm.slice(0, Math.round(seconds * 16000))), segment, final: false })
        .then(response => ({ segment, sentAt, tookMs: performance.now() - clock - sentAt, ok: !!response.ok, text: response.result?.text || '' })))
      if (!draft) {
        // A typed comment arrives while captions are running; alternate sources.
        draftSource = trial % 2 === 0 ? DRAFT_REPAIR : DRAFT_LONG
        draftSentAt = performance.now() - clock
        // Timestamp when the response actually lands, not when it is awaited.
        draft = request('translate', { text: draftSource, direction: 'zh-ja' })
          .then(response => ({ response, atMs: performance.now() - clock }))
      }
    }

    await sleep(pcm.length / 16 - (performance.now() - clock))
    const audioEndAt = performance.now() - clock
    const finalSegment = `${epoch}:${index}`
    const final = await request('decode', { audio: encode(pcm), segment: finalSegment, final: true })
    const finalAt = performance.now() - clock
    const { response: draftResponse, atMs: draftAt } = await draft
    const windows = await Promise.all(decodes)

    const firstChinese = captions.find(caption => caption.translated)
    const texts = captions.map(caption => caption.text).filter(Boolean)
    emit({
      type: 'contention-trial', trial, id, draftSource,
      draftSentAtMs: Math.round(draftSentAt),
      draftTookMs: Math.round(draftAt - draftSentAt),
      draftOk: !!draftResponse.ok,
      draftText: draftResponse.result?.text,
      draftRepaired: !!draftResponse.result?.repaired,
      draftReviewWarning: !!draftResponse.result?.reviewWarning,
      windowRoundTripMaxMs: Math.round(Math.max(...windows.map(w => w.tookMs))),
      windowRoundTripMedianMs: Math.round([...windows.map(w => w.tookMs)].sort((a, b) => a - b)[Math.floor((windows.length - 1) / 2)]),
      audioEndMs: Math.round(audioEndAt),
      finalResponseMs: Math.round(finalAt),
      audioEndToChineseMs: firstChinese ? Math.round(firstChinese.atMs - audioEndAt) : null,
      finalOk: !!final.ok,
      finalText: final.result?.text || '',
      finalTranslated: final.result?.translated || '',
      captionCount: captions.length,
      blankCaptions: captions.filter(caption => !caption.text).length,
      duplicateCaptions: texts.length - new Set(texts).size,
      // Growing windows must never shorten; a shorter successor means reordering.
      reordered: texts.some((text, at) => at > 0 && text.length < texts[at - 1].length),
      captions: captions.map(caption => ({ atMs: caption.atMs, segment: caption.segment, text: caption.text, translated: caption.translated, final: caption.final }))
    })
    await sleep(700)
  }

  for (const id of ['music-only-control', 'silence-control']) {
    const pcm = wav(id)
    captions.length = 0
    clock = performance.now()
    const responses = []
    let index = 0
    for (const seconds of WINDOWS.filter(s => s < pcm.length / 16000)) {
      await sleep(seconds * 1000 - (performance.now() - clock))
      responses.push(await request('decode', { audio: encode(pcm.slice(0, Math.round(seconds * 16000))), segment: `200:${index++}`, final: false }))
    }
    const final = await request('decode', { audio: encode(pcm), segment: `200:${index}`, final: true })
    responses.push(final)
    emit({
      type: 'non-speech-trial', id,
      texts: responses.map(response => response.result?.text || ''),
      captionTexts: captions.map(caption => caption.text).filter(Boolean),
      producedText: responses.some(response => (response.result?.text || '').trim())
        || captions.some(caption => (caption.text || '').trim())
    })
    await sleep(500)
  }

  captions.length = 0
  const stop = await request('stop')
  await sleep(2500)
  emit({ type: 'stop', ok: !!stop.ok, lateCaptions: captions.length, error: stop.error })
  const retry = await request('init')
  emit({ type: 'restart-after-stop', ok: !!retry.ok, error: retry.error })
  await request('stop')
  emit({ type: 'complete' })
} catch (error) {
  emit({ type: 'fatal', error: String(error) })
  process.exitCode = 1
} finally {
  socket.destroy()
}
