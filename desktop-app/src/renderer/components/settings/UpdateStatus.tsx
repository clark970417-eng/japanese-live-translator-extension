import React, { useCallback, useEffect, useState } from 'react'
import { Section } from './Section'
import { buttonStyle } from './shared'

interface UpdateState {
  state: string
  version?: string
  progress?: number
  error?: string
  currentVersion?: string
  channel?: 'stable' | 'beta'
  installMode?: 'automatic' | 'browser'
  releaseUrl?: string
}

export function UpdateStatus(): React.JSX.Element {
  const [update, setUpdate] = useState<UpdateState>({ state: 'idle' })

  useEffect(() => {
    // Load current status on mount
    window.api.updateGetStatus().then(setUpdate).catch((err: unknown) => {
      const e = err instanceof Error ? err : new Error(String(err))
      console.warn('[update-status] Failed to fetch update status:', e.message)
    })

    // Listen for status changes from main process
    const unsub = window.api.onUpdateStatus(setUpdate)
    return () => unsub()
  }, [])

  const handleCheck = useCallback(async () => {
    const result = await window.api.updateCheck()
    if (result.error) {
      setUpdate({ state: 'error', error: result.error })
    }
  }, [])

  const handleDownload = useCallback(async () => {
    const result = await window.api.updateDownload()
    if (result.error) {
      setUpdate({ state: 'error', error: result.error })
    }
  }, [])

  const handleInstall = useCallback(async () => {
    const result = await window.api.updateInstall()
    if (result.deferred) {
      setUpdate((prev) => ({
        ...prev,
        state: 'downloaded',
        error: 'Update will install when you quit the app'
      }))
    }
  }, [])

  const handleChannelChange = useCallback(async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const channel = event.target.value as 'stable' | 'beta'
    setUpdate((previous) => ({ ...previous, channel, state: 'checking' }))
    const result = await window.api.updateSetChannel(channel)
    if (result.error) setUpdate((previous) => ({ ...previous, state: 'error', error: result.error }))
  }, [])

  const channelControl = (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
      <label htmlFor="update-channel" style={{ fontSize: '12px', color: '#94a3b8' }}>Update channel</label>
      <select id="update-channel" value={update.channel ?? 'beta'} onChange={handleChannelChange}
        style={{ background: '#0f172a', color: '#e2e8f0', border: '1px solid #475569', borderRadius: '6px', padding: '6px' }}>
        <option value="stable">Stable</option>
        <option value="beta">Beta</option>
      </select>
      {update.currentVersion && <span style={{ fontSize: '12px', color: '#64748b' }}>Current v{update.currentVersion}</span>}
    </div>
  )

  // Don't render anything when idle and no update info
  if (update.state === 'idle' || update.state === 'not-available') {
    return (
      <Section label="App Updates">
        {channelControl}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>
            {update.state === 'not-available' && update.version
              ? `Up to date (v${update.version})`
              : 'No update info'}
          </span>
          <button
            onClick={handleCheck}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              background: '#334155',
              color: '#e2e8f0',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              minHeight: '44px'
            }}
          >
            Check for Updates
          </button>
        </div>
      </Section>
    )
  }

  return (
    <Section label="App Updates">
      {channelControl}
      <div style={{
        background: '#1e293b',
        borderRadius: '8px',
        padding: '12px 16px',
        border: update.state === 'available' || update.state === 'downloaded'
          ? '1px solid #3b82f6'
          : '1px solid #334155'
      }}>
        {update.state === 'checking' && (
          <div style={{ fontSize: '13px', color: '#94a3b8' }}>
            Checking for updates...
          </div>
        )}

        {update.state === 'available' && (
          <>
            <div style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '8px' }}>
              Version {update.version} is available
            </div>
            <button
              onClick={handleDownload}
              style={{
                ...buttonStyle,
                background: '#3b82f6',
                fontSize: '13px',
                padding: '8px',
                marginTop: 0
              }}
            >
              {update.installMode === 'browser' ? 'Open Verified Download Page' : 'Download Update'}
            </button>
          </>
        )}

        {update.state === 'downloading' && (
          <div>
            <div style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '8px' }}>
              Downloading update... {update.progress !== undefined ? `${update.progress}%` : ''}
            </div>
            <div style={{
              width: '100%',
              height: '6px',
              background: '#334155',
              borderRadius: '3px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${update.progress ?? 0}%`,
                height: '100%',
                background: '#3b82f6',
                borderRadius: '3px',
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        )}

        {update.state === 'downloaded' && (
          <>
            <div style={{ fontSize: '13px', color: '#e2e8f0', marginBottom: '8px' }}>
              Version {update.version} is ready to install
            </div>
            {update.error && (
              <div style={{ fontSize: '12px', color: '#f59e0b', marginBottom: '8px' }}>
                {update.error}
              </div>
            )}
            <button
              onClick={handleInstall}
              style={{
                ...buttonStyle,
                background: '#16a34a',
                fontSize: '13px',
                padding: '8px',
                marginTop: 0
              }}
            >
              Restart &amp; Install
            </button>
          </>
        )}

        {update.state === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '100%' }}>
            <span style={{ fontSize: '12px', color: '#ef4444', wordBreak: 'break-word', minWidth: 0 }}>
              Update check failed{update.error ? `: ${update.error}` : ''}
            </span>
            <button
              onClick={handleCheck}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                background: '#334155',
                color: '#e2e8f0',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                minHeight: '44px'
              }}
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </Section>
  )
}
