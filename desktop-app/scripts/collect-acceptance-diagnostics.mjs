/** Read-only diagnostics for the Opera acceptance run in OPERA-ACCEPTANCE.md.
 *
 * It never starts, stops, drives or modifies Opera, the installed extension or
 * the installed app. It reads versions, file hashes, memory counters, process
 * lists, crash report names and local logs, and writes them under
 * desktop-app/.test-out/opera-acceptance/<run>/, which git ignores: native host
 * logs can contain captions of whatever was watched. Review before sharing.
 *
 *   node scripts/collect-acceptance-diagnostics.mjs start [run]
 *   node scripts/collect-acceptance-diagnostics.mjs finish [run] [--health label=file.json ...]
 */
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { compareRuntime, freePercent, RELEVANT_CRASH, sessionLogEnded, summarizeHealth, swapouts } from './acceptance-diagnostics-lib.mjs'

const repo = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const home = homedir()
const INSTALLED_EXTENSION = join(home, 'Downloads/youtube-translator-extension')
const INSTALLED_APP = join(home, 'Applications/Japanese Live Translate.app')
const DESKTOP_LOGS = join(home, 'Library/Application Support/live-translate/logs')
const HOST_LOG = join(home, 'Library/Application Support/JapaneseLiveCaption/app.log')
const CRASH_DIR = join(home, 'Library/Logs/DiagnosticReports')

const [command, runArg, ...rest] = process.argv.slice(2)
if (!['start', 'finish'].includes(command)) throw new Error('Usage: start|finish [run] [--health label=file.json ...]')
const run = runArg && !runArg.startsWith('--') ? runArg : new Date().toISOString().slice(0, 10)
const out = join(repo, 'desktop-app/.test-out/opera-acceptance', run)
mkdirSync(out, { recursive: true })

const tryRun = (file, args) => { try { return execFileSync(file, args, { encoding: 'utf8' }) } catch { return '' } }
const readOrNull = path => existsSync(path) ? readFileSync(path) : null
const json = path => { try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return null } }

function snapshot() {
  const plist = tryRun('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(INSTALLED_APP, 'Contents/Info.plist')]).trim()
  const processes = tryRun('ps', ['-axo', 'pid=,rss=,comm=']).trim().split('\n')
    .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
    .filter(([, , , comm]) => /Japanese Live Translate|Opera|slm-worker|mlx-whisper-bridge|python3/.test(comm))
    .map(([, pid, rss, comm]) => ({ pid: Number(pid), rssMB: Math.round(Number(rss) / 1024), process: comm.split('/').at(-1) }))
  return {
    at: new Date().toISOString(),
    gitHead: tryRun('git', ['-C', repo, 'rev-parse', '--short', 'HEAD']).trim(),
    gitClean: tryRun('git', ['-C', repo, 'status', '--porcelain']).trim() === '',
    sourceVersions: { extension: json(join(repo, 'manifest.json'))?.version, desktop: json(join(repo, 'desktop-app/package.json'))?.version },
    installedVersions: { extension: json(join(INSTALLED_EXTENSION, 'manifest.json'))?.version ?? null, app: plist || null },
    installedExtensionVsSource: compareRuntime(file => readOrNull(join(repo, file)), file => readOrNull(join(INSTALLED_EXTENSION, file))),
    memory: { swapouts: swapouts(tryRun('vm_stat', [])), freePercent: freePercent(tryRun('memory_pressure', [])) },
    processes,
    crashReports: existsSync(CRASH_DIR) ? readdirSync(CRASH_DIR).filter(name => RELEVANT_CRASH.test(name)) : [],
    hostLogBytes: existsSync(HOST_LOG) ? statSync(HOST_LOG).size : 0,
    desktopSessionLogs: existsSync(DESKTOP_LOGS) ? readdirSync(DESKTOP_LOGS) : []
  }
}

if (command === 'start') {
  const start = snapshot()
  writeFileSync(join(out, 'start.json'), JSON.stringify(start, null, 2))
  console.log(`Recorded start for run "${run}" in ${out}`)
  if (!start.installedExtensionVsSource.identical) console.log('Note: the installed extension differs from source:', start.installedExtensionVsSource.differing.join(', '))
  if (start.installedVersions.app !== start.sourceVersions.desktop) console.log('Note: installed app version differs from source')
  process.exit(0)
}

const start = json(join(out, 'start.json'))
if (!start) throw new Error(`No start.json for run "${run}"; run "start" first`)
const finish = snapshot()
const health = []
for (let i = 0; i < rest.length; i++) {
  if (rest[i] !== '--health') continue
  const [label, file] = String(rest[++i]).split('=')
  health.push({ label, health: json(resolve(file)) })
}
const newSessionLogs = finish.desktopSessionLogs.filter(name => !start.desktopSessionLogs.includes(name))
const sessions = newSessionLogs.map(name => ({ name, ended: sessionLogEnded(readFileSync(join(DESKTOP_LOGS, name), 'utf8')) }))
let hostLogSince = ''
if (existsSync(HOST_LOG)) {
  const bytes = readFileSync(HOST_LOG)
  hostLogSince = bytes.subarray(Math.min(start.hostLogBytes, bytes.length)).toString('utf8')
}
const hostErrors = hostLogSince.split('\n').filter(line => /error|exception|fatal|timed out|disconnect/i.test(line))
const summary = {
  run, startedAt: start.at, finishedAt: finish.at,
  elapsedMinutes: Math.round((Date.parse(finish.at) - Date.parse(start.at)) / 60000),
  buildUnderTest: { gitHeadAtStart: start.gitHead, installedVersions: start.installedVersions, sourceVersions: start.sourceVersions,
    installedExtensionVsSource: start.installedExtensionVsSource },
  memory: { swapoutPagesDuringRun: finish.memory.swapouts - start.memory.swapouts, freePercentAtStart: start.memory.freePercent, freePercentAtFinish: finish.memory.freePercent },
  newCrashReports: finish.crashReports.filter(name => !start.crashReports.includes(name)),
  desktopSessions: { started: sessions.length, withoutEnd: sessions.filter(s => !s.ended).map(s => s.name) },
  nativeHostLog: { bytesSinceStart: hostLogSince.length, errorLines: hostErrors.length, lastErrorLines: hostErrors.slice(-20) },
  extensionHealth: summarizeHealth(health),
  processesAtFinish: finish.processes,
  verdict: 'Diagnostics only. Gate results are the checklist entries in OPERA-ACCEPTANCE.md, recorded by the person who ran them.'
}
writeFileSync(join(out, 'finish.json'), JSON.stringify(finish, null, 2))
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2))
writeFileSync(join(out, 'host-log-since-start.txt'), hostLogSince)
console.log(JSON.stringify(summary, null, 2))
