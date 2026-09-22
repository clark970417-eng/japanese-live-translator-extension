import { ipcMain } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'
import { stat } from 'node:fs/promises'
import ffmpegPath from 'ffmpeg-static'
import { isSupportedMediaFile } from '../../media-formats'
import type { AppContext } from '../app-context'
import { findQuietSegmentEnd } from '../media-segmentation'
const MAX_PCM_BYTES = 16_000 * 4 * 60 * 60 * 6 // Six hours of mono float32 PCM.
const SAMPLE_RATE = 16_000
const MAX_SEGMENT_SAMPLES = SAMPLE_RATE * 24
const activeDecoders = new Map<string, ChildProcess>()

export function registerMediaFileIpc(ctx: AppContext): void {
  ipcMain.handle('decode-media-file', async (_event, requestedPath: string) => {
    if (typeof requestedPath !== 'string' || requestedPath.length === 0) throw new Error('No media file was selected.')
    const inputPath = resolve(requestedPath)
    if (!isSupportedMediaFile(inputPath)) throw new Error('Unsupported media file type.')
    const info = await stat(inputPath)
    if (!info.isFile()) throw new Error('The selected media path is not a file.')
    return decodeWithFfmpeg(inputPath)
  })

  ipcMain.handle('process-media-file', async (event, requestedPath: string, jobId: string) => {
    if (!ctx.pipeline?.running) throw new Error('Start the translation engine before importing a media file.')
    if (typeof jobId !== 'string' || !jobId) throw new Error('Invalid media import job.')
    const inputPath = await validatedMediaPath(requestedPath)
    if (activeDecoders.has(jobId)) throw new Error('This media import is already running.')
    return processMediaWithFfmpeg(ctx, event.sender, inputPath, jobId)
  })

  ipcMain.handle('cancel-media-file', (_event, jobId: string) => {
    const decoder = activeDecoders.get(jobId)
    if (!decoder) return { cancelled: false }
    decoder.kill('SIGKILL')
    return { cancelled: true }
  })
}

async function validatedMediaPath(requestedPath: string): Promise<string> {
  if (typeof requestedPath !== 'string' || requestedPath.length === 0) throw new Error('No media file was selected.')
  const inputPath = resolve(requestedPath)
  if (!isSupportedMediaFile(inputPath)) throw new Error('Unsupported media file type.')
  const info = await stat(inputPath)
  if (!info.isFile()) throw new Error('The selected media path is not a file.')
  return inputPath
}

export function executableFfmpegPath(): string {
  if (!ffmpegPath) throw new Error('The bundled FFmpeg decoder is unavailable.')
  return ffmpegPath.replace('app.asar', 'app.asar.unpacked')
}

async function decodeWithFfmpeg(inputPath: string): Promise<Uint8Array> {
  const decoder = spawn(executableFfmpegPath(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', inputPath,
    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1'
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  const chunks: Buffer[] = []
  const errors: Buffer[] = []
  let total = 0
  const timeout = setTimeout(() => decoder.kill('SIGKILL'), 10 * 60_000)

  decoder.stdout.on('data', (chunk: Buffer) => {
    total += chunk.length
    if (total > MAX_PCM_BYTES) decoder.kill('SIGKILL')
    else chunks.push(chunk)
  })
  decoder.stderr.on('data', (chunk: Buffer) => errors.push(chunk))

  const exitCode = await new Promise<number | null>((accept, reject) => {
    decoder.once('error', reject)
    decoder.once('close', accept)
  }).finally(() => clearTimeout(timeout))

  if (total > MAX_PCM_BYTES) throw new Error('The media file is longer than the six-hour import limit.')
  if (exitCode !== 0) {
    const detail = Buffer.concat(errors).toString('utf8').trim().slice(-500)
    throw new Error(detail || 'FFmpeg could not decode this media file.')
  }
  const pcm = Buffer.concat(chunks)
  return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
}

async function processMediaWithFfmpeg(
  ctx: AppContext,
  sender: Electron.WebContents,
  inputPath: string,
  jobId: string
): Promise<{ processedSeconds: number; cancelled: boolean }> {
  const decoder = spawn(executableFfmpegPath(), [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', inputPath,
    '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-c:a', 'pcm_f32le', '-f', 'f32le', 'pipe:1'
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  activeDecoders.set(jobId, decoder)
  let pending = Buffer.alloc(0)
  let totalBytes = 0
  let processedSamples = 0
  let cancelled = false
  const errors: Buffer[] = []
  let processing = Promise.resolve()
  const timeout = setTimeout(() => decoder.kill('SIGKILL'), 6 * 60 * 60_000)

  const processAvailable = async (final: boolean): Promise<void> => {
    while (pending.length >= MAX_SEGMENT_SAMPLES * 4 || (final && pending.length >= 4)) {
      const availableSamples = Math.floor(pending.length / 4)
      const candidateSamples = Math.min(availableSamples, MAX_SEGMENT_SAMPLES)
      const candidateBytes = candidateSamples * 4
      const candidateBuffer = pending.subarray(0, candidateBytes)
      const candidate = new Float32Array(candidateBuffer.buffer, candidateBuffer.byteOffset, candidateSamples)
      const segmentSamples = final && availableSamples <= MAX_SEGMENT_SAMPLES
        ? candidateSamples
        : findQuietSegmentEnd(candidate)
      const segmentBytes = segmentSamples * 4
      const segmentBuffer = Buffer.from(pending.subarray(0, segmentBytes))
      pending = pending.subarray(segmentBytes)
      const audio = new Float32Array(segmentBuffer.buffer, segmentBuffer.byteOffset, segmentSamples)
      await ctx.pipeline?.process(new Float32Array(audio), SAMPLE_RATE)
      processedSamples += segmentSamples
      sender.send('media-file-progress', { jobId, processedSeconds: processedSamples / SAMPLE_RATE })
    }
  }

  decoder.stdout.on('data', (chunk: Buffer) => {
    totalBytes += chunk.length
    if (totalBytes > MAX_PCM_BYTES) {
      decoder.kill('SIGKILL')
      return
    }
    pending = Buffer.concat([pending, chunk])
    if (pending.length >= MAX_SEGMENT_SAMPLES * 4) {
      decoder.stdout.pause()
      processing = processing.then(() => processAvailable(false)).finally(() => {
        if (!decoder.killed) decoder.stdout.resume()
      })
    }
  })
  decoder.stderr.on('data', (chunk: Buffer) => errors.push(chunk))
  decoder.once('error', () => {})
  const exitCode = await new Promise<number | null>((accept) => decoder.once('close', accept))
  clearTimeout(timeout)
  cancelled = decoder.killed && totalBytes <= MAX_PCM_BYTES
  try {
    await processing
    if (!cancelled && totalBytes <= MAX_PCM_BYTES) await processAvailable(true)
  } finally {
    activeDecoders.delete(jobId)
  }
  if (totalBytes > MAX_PCM_BYTES) throw new Error('The media file is longer than the six-hour import limit.')
  if (!cancelled && exitCode !== 0) {
    const detail = Buffer.concat(errors).toString('utf8').trim().slice(-500)
    throw new Error(detail || 'FFmpeg could not decode this media file.')
  }
  return { processedSeconds: processedSamples / SAMPLE_RATE, cancelled }
}
