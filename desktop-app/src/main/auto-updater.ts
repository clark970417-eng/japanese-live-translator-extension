import { autoUpdater } from 'electron-updater'
import type { UpdateInfo, ProgressInfo } from 'electron-updater'
import { app, ipcMain, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { createLogger } from './logger'
import type { AppContext } from './app-context'
import { store } from './store'
import { isNewerVersion } from './release-version'

const log = createLogger('auto-updater')

/** Check interval: 4 hours */
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  progress?: number
  error?: string
  currentVersion?: string
  channel?: 'stable' | 'beta'
  installMode?: 'automatic' | 'browser'
  releaseUrl?: string
}

let currentStatus: UpdateStatus = { state: 'idle' }
let checkTimer: ReturnType<typeof setInterval> | null = null
let automaticUpdaterAvailable = false

const RELEASES_API = 'https://api.github.com/repos/clark970417-eng/japanese-live-translator-extension/releases'

interface GitHubRelease {
  tag_name: string
  html_url: string
  prerelease: boolean
  draft: boolean
}

async function checkGitHubRelease(ctx: AppContext): Promise<void> {
  const channel = store.get('updateChannel') || 'stable'
  sendStatus(ctx, { state: 'checking', currentVersion: app.getVersion(), channel, installMode: 'browser' })
  const response = await fetch(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Japanese-Live-Translate' }
  })
  if (!response.ok) throw new Error(`GitHub update check returned ${response.status}`)
  const releases = await response.json() as GitHubRelease[]
  const release = releases.find((item) => !item.draft && (channel === 'beta' || !item.prerelease))
  if (!release) {
    sendStatus(ctx, { state: 'not-available', version: app.getVersion(), currentVersion: app.getVersion(), channel, installMode: 'browser' })
    return
  }
  const version = release.tag_name.replace(/^beta-v|^v/, '')
  if (isNewerVersion(version, app.getVersion())) {
    sendStatus(ctx, {
      state: 'available', version, currentVersion: app.getVersion(), channel,
      installMode: 'browser', releaseUrl: release.html_url
    })
  } else {
    sendStatus(ctx, { state: 'not-available', version: app.getVersion(), currentVersion: app.getVersion(), channel, installMode: 'browser' })
  }
}

async function checkForUpdates(ctx: AppContext): Promise<void> {
  if (automaticUpdaterAvailable && store.get('updateChannel') !== 'beta') {
    await autoUpdater.checkForUpdates()
    return
  }
  await checkGitHubRelease(ctx)
}

function sendStatus(ctx: AppContext, status: UpdateStatus): void {
  currentStatus = status
  ctx.mainWindow?.webContents.send('update-status', status)
}

/**
 * Initialize auto-updater with event handlers and periodic checks.
 * Must be called after app.whenReady() and window creation.
 */
export function initAutoUpdater(ctx: AppContext): void {
  autoUpdater.autoDownload = false
  // Skip auto-updater for unsigned/local builds — app-update.yml won't exist
  if (!app.isPackaged) {
    log.info('Dev mode — skipping auto-updater')
    return
  }
  automaticUpdaterAvailable = existsSync(join(process.resourcesPath, 'app-update.yml'))
  if (!automaticUpdaterAvailable) log.info('Unsigned build — using browser-based verified release updates')

  // Disable auto-download — let user decide when to install
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...')
    sendStatus(ctx, { state: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info('Update available:', info.version)
    sendStatus(ctx, { state: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    log.info('Up to date:', info.version)
    sendStatus(ctx, { state: 'not-available', version: info.version })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    sendStatus(ctx, {
      state: 'downloading',
      progress: Math.round(progress.percent)
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log.info('Update downloaded:', info.version)
    sendStatus(ctx, { state: 'downloaded', version: info.version })
  })

  autoUpdater.on('error', (err: Error) => {
    log.error('Update error:', err.message)
    sendStatus(ctx, { state: 'error', error: err.message })
  })

  // Check on launch (with a small delay to not block startup)
  setTimeout(() => {
    checkForUpdates(ctx).catch((err) => {
      log.warn('Initial update check failed:', err.message)
    })
  }, 10_000)

  // Periodic check
  checkTimer = setInterval(() => {
    checkForUpdates(ctx).catch((err) => {
      log.warn('Periodic update check failed:', err.message)
    })
  }, CHECK_INTERVAL_MS)
}

/** Register IPC handlers for update actions */
export function registerUpdateHandlers(ctx: AppContext): void {
  ipcMain.handle('update-check', async () => {
    try {
      await checkForUpdates(ctx)
      return { success: true }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('update-download', async () => {
    try {
      if (currentStatus.installMode === 'browser' && currentStatus.releaseUrl) {
        await shell.openExternal(currentStatus.releaseUrl)
        return { success: true, openedBrowser: true }
      }
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('update-install', () => {
    // Quit and install — deferred if pipeline is running
    if (ctx.pipeline?.running) {
      log.info('Pipeline is running, deferring restart until quit')
      // autoInstallOnAppQuit is true, so it will install on next quit
      return { deferred: true }
    }
    autoUpdater.quitAndInstall()
    return { success: true }
  })

  ipcMain.handle('update-get-status', () => {
    return {
      ...currentStatus,
      currentVersion: app.getVersion(),
      channel: store.get('updateChannel') || 'stable',
      installMode: currentStatus.installMode || (automaticUpdaterAvailable ? 'automatic' : 'browser')
    }
  })

  ipcMain.handle('update-set-channel', async (_event, channel: unknown) => {
    if (channel !== 'stable' && channel !== 'beta') return { error: 'Invalid update channel' }
    store.set('updateChannel', channel)
    currentStatus = { state: 'idle', currentVersion: app.getVersion(), channel, installMode: channel === 'beta' ? 'browser' : undefined }
    try {
      await checkForUpdates(ctx)
      return { success: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendStatus(ctx, { ...currentStatus, state: 'error', error: message })
      return { error: message }
    }
  })
}

/** Clean up timer and listeners on app quit */
export function disposeAutoUpdater(): void {
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
  autoUpdater.removeAllListeners()
}
