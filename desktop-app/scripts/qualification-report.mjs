import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const root = path.resolve(import.meta.dirname, '..')
const output = path.resolve(process.argv[2] || path.join(root, '.test-out/qualification.json'))
const ffmpeg = require('ffmpeg-static')?.replace('app.asar', 'app.asar.unpacked')
const probe = ffmpeg ? spawnSync(ffmpeg, ['-hide_banner', '-formats'], { encoding: 'utf8' }) : null
const formatsText = `${probe?.stdout || ''}\n${probe?.stderr || ''}`
const requiredFormats = ['mp3', 'wav', 'flac', 'ogg', 'matroska', 'mov,mp4,m4a', 'mpegts', 'avi', 'webm']
const formats = Object.fromEntries(requiredFormats.map(format => [format, formatsText.toLowerCase().includes(format)]))
let virtualMicNative = false
try { require.resolve('naudiodon'); virtualMicNative = true } catch {}
const report = {
  generatedAt: new Date().toISOString(),
  system: {
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    cpu: os.cpus()[0]?.model || 'unknown',
    cpuCores: os.cpus().length,
    memoryGB: Math.round(os.totalmem() / 107374182.4) / 10,
    node: process.version
  },
  capabilities: {
    bundledFfmpeg: Boolean(ffmpeg && fs.existsSync(ffmpeg) && probe?.status === 0),
    formats,
    nativeVirtualMicBackend: virtualMicNative,
    browserAudioRouting: true,
    translationEngines: ['automatic fallback', 'HY-MT 1.5', 'HY-MT 2', 'HY-MT', 'Apple Translation', 'OPUS-MT', 'Google', 'DeepL', 'Gemini', 'Microsoft', 'OpenAI Realtime'],
    ttsLanguages: ['English', 'Japanese', 'Chinese', 'French', 'Spanish', 'Italian', 'Portuguese']
  },
  release: {
    appleSigningConfigured: Boolean(process.env.CSC_LINK && process.env.CSC_KEY_PASSWORD),
    appleNotarizationConfigured: Boolean(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)
  }
}
report.passed = report.capabilities.bundledFfmpeg && Object.values(formats).every(Boolean) && report.system.memoryGB >= 4
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (!report.passed) process.exitCode = 1
