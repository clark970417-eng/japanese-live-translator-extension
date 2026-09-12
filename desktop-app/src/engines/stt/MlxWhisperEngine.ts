import { randomUUID } from 'crypto'
import { isImplausibleTranscript } from './transcript-guard'
import { execFileSync } from 'child_process'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { tmpdir, homedir } from 'os'
import type { STTEngine, STTResult, Language, SourceLanguage } from '../types'
import { ALL_LANGUAGES } from '../types'
import { SubprocessBridge, type SpawnConfig, type InitResult, getEnrichedPath, resolveBridgeScript } from '../SubprocessBridge'
import { MLX_MODULE_PROBE } from './mlx-module-probe'
import { MLX_WHISPER_TRANSCRIBE_TIMEOUT_MS, MLX_WHISPER_INIT_TIMEOUT_MS, PYTHON_IMPORT_CHECK_TIMEOUT_MS } from '../constants'

export class MlxWhisperEngine extends SubprocessBridge implements STTEngine {
  readonly id: string = 'mlx-whisper'
  readonly name: string = 'mlx-whisper (Apple Silicon)'
  readonly isOffline = true

  private language?: Language
  private model: string
  private onProgress?: (message: string) => void
  private lifecycle = 0
  private active = false
  private restartAfter = 0

  constructor(options?: {
    language?: Language
    model?: string
    onProgress?: (message: string) => void
  }) {
    super()
    this.language = options?.language
    this.model = options?.model ?? 'mlx-community/whisper-large-v3-turbo'
    this.onProgress = options?.onProgress
  }

  setLanguage(language: SourceLanguage): void {
    this.language = language === 'auto' ? undefined : language
  }

  protected getLogPrefix(): string {
    return '[mlx-whisper]'
  }

  protected getInitTimeout(): number {
    return MLX_WHISPER_INIT_TIMEOUT_MS
  }

  protected getCommandTimeout(): number {
    return MLX_WHISPER_TRANSCRIBE_TIMEOUT_MS
  }

  protected getSpawnConfig(): SpawnConfig {
    this.onProgress?.('Starting mlx-whisper bridge...')
    const python3 = findPython3WithMlxWhisper()
    this.onProgress?.(`Using Python: ${python3}`)
    return {
      command: python3,
      args: [resolveBridgeScript('mlx-whisper-bridge.py')],
      initMessage: {
        action: 'init',
        model: this.model
      }
    }
  }

  protected getSpawnError(): Error {
    return new Error(
      'Python 3 with mlx-whisper not found. Create a venv and install: python3 -m venv ~/mlx-env && ~/mlx-env/bin/pip install mlx-whisper'
    )
  }

  protected onInitComplete(_result: InitResult): void {
    this.onProgress?.('mlx-whisper ready')
  }

  async initialize(): Promise<void> {
    const lifecycle = this.lifecycle
    await super.initialize()
    if (lifecycle === this.lifecycle) this.active = true
    else await super.dispose()
  }

  async dispose(): Promise<void> {
    this.active = false
    this.lifecycle++
    await super.dispose()
  }

  async processAudio(audioChunk: Float32Array, sampleRate: number): Promise<STTResult | null> {
    if (!this.process) {
      if (!this.active || Date.now() < this.restartAfter) return null
      this.restartAfter = Date.now() + 5000
      this.onProgress?.('Speech recognition disconnected; reconnecting')
      try { await this.initialize() } catch (error) {
        this.log.error('Recognition reconnect failed:', error)
        return null
      }
      if (!this.active || !this.process) return null
    }

    const lifecycle = this.lifecycle
    const tempPath = join(tmpdir(), `mlx-whisper-${randomUUID()}.wav`)
    try {
      writeWav(tempPath, audioChunk, sampleRate)

      let result: Record<string, unknown>
      try {
        result = await this.sendCommand({
          action: 'transcribe',
          audio_path: tempPath,
          sample_rate: sampleRate,
          language: this.language
        })
      } catch (err) {
        // Timeout or bridge error — return null per interface contract
        this.log.error('Bridge error:', err instanceof Error ? err.message : err)
        if (err instanceof Error && err.message === 'Bridge command timed out' && lifecycle === this.lifecycle) {
          this.onProgress?.('Speech recognition stalled; restarting recognition')
          // A timed-out Python job keeps running unless its process is stopped.
          // Never queue the next audio behind that stale job.
          await super.dispose()
          if (lifecycle === this.lifecycle) {
            try { await this.initialize() } catch (error) {
              this.log.error('Recognition restart failed:', error)
              this.onProgress?.('Recognition restart failed; stop and start audio to retry')
            }
          }
        }
        return null
      }

      if (result.error) {
        this.log.error('Transcription error:', result.error)
        return null
      }

      if (!result.text || !(result.text as string).trim()) return null

      if (isImplausibleTranscript(result.text as string, audioChunk.length / sampleRate)) {
        this.log.warn('Rejected implausible short-window transcript; waiting for more audio')
        return null
      }
      return {
        text: result.text as string,
        language: (ALL_LANGUAGES.includes(result.language as Language) ? result.language : 'en') as Language,
        isFinal: true,
        timestamp: Date.now()
      }
    } finally {
      try { unlinkSync(tempPath) } catch (e) { this.log.warn('Failed to delete temp file:', e) }
    }
  }
}

/** Find a python3 binary that has mlx_whisper installed */
function findPython3WithMlxWhisper(): string {
  // Check package metadata, not a full MLX import. The bridge loads and validates
  // dependencies once, with its own longer initialization timeout.
  let timedOut = false
  const recordFailure = (error: unknown): void => {
    if ((error as NodeJS.ErrnoException)?.code === 'ETIMEDOUT') timedOut = true
  }
  // Check common venv locations first
  const venvPaths = [
    join(homedir(), 'Library/Application Support/JapaneseLiveCaption/venv/bin/python3'),
    join(homedir(), 'mlx-env', 'bin', 'python3'),
    join(homedir(), '.venv', 'bin', 'python3'),
    join(homedir(), 'venv', 'bin', 'python3')
  ]

  for (const p of venvPaths) {
    if (!existsSync(p)) continue
    try {
      execFileSync(p, ['-c', MLX_MODULE_PROBE], { stdio: 'ignore', timeout: PYTHON_IMPORT_CHECK_TIMEOUT_MS })
      return p
    } catch (error) { recordFailure(error) }
  }

  // Try versioned python binaries (prefer 3.12/3.13 over 3.14 due to native extension compatibility)
  // Use enriched PATH so packaged Electron can find Homebrew/pyenv Python
  const env = { ...process.env, PATH: getEnrichedPath() }
  for (const bin of ['python3.12', 'python3.13', 'python3']) {
    try {
      execFileSync(bin, ['-c', MLX_MODULE_PROBE], { stdio: 'ignore', timeout: PYTHON_IMPORT_CHECK_TIMEOUT_MS, env })
      return bin
    } catch (error) { recordFailure(error) }
  }

  if (timedOut) throw new Error('Python availability check timed out. Please retry starting speech recognition.')
  throw new Error('mlx-whisper not found')
}

/** Write Float32Array as a minimal WAV file */
function writeWav(path: string, samples: Float32Array, sampleRate: number): void {
  const numChannels = 1
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const dataSize = samples.length * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)

  // WAV header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16) // chunk size
  buffer.writeUInt16LE(1, 20) // PCM
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28)
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  // Convert Float32 [-1, 1] to Int16
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2)
  }

  writeFileSync(path, buffer)
}
