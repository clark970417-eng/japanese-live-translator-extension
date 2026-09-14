import { ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { stat } from 'node:fs/promises'
import ffmpegPath from 'ffmpeg-static'
import { isSupportedMediaFile } from '../../media-formats'
const MAX_PCM_BYTES = 16_000 * 4 * 60 * 60 * 6 // Six hours of mono float32 PCM.

export function registerMediaFileIpc(): void {
  ipcMain.handle('decode-media-file', async (_event, requestedPath: string) => {
    if (typeof requestedPath !== 'string' || requestedPath.length === 0) throw new Error('No media file was selected.')
    const inputPath = resolve(requestedPath)
    if (!isSupportedMediaFile(inputPath)) throw new Error('Unsupported media file type.')
    const info = await stat(inputPath)
    if (!info.isFile()) throw new Error('The selected media path is not a file.')
    return decodeWithFfmpeg(inputPath)
  })
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
