import React, { useCallback, useEffect, useState } from 'react'
import { Section } from './Section'
import { selectStyle, errorContainerStyle, warningContainerStyle } from './shared'

interface VirtualMicSettingsProps { disabled: boolean }

const VIRTUAL_DEVICE_PATTERNS = [
  'blackhole', 'soundflower', 'loopback', 'virtual cable', 'vb-cable',
  'vb-audio', 'voicemeeter', 'roc virtual', 'existential audio'
]

export function isVirtualAudioDevice(label: string): boolean {
  const normalized = label.toLowerCase()
  return VIRTUAL_DEVICE_PATTERNS.some((pattern) => normalized.includes(pattern))
}

/** Route TTS through Chromium/CoreAudio, avoiding unsafe native PortAudio on macOS 26. */
export function VirtualMicSettings({ disabled }: VirtualMicSettingsProps): React.JSX.Element {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [activeDeviceId, setActiveDeviceId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDevices = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [allDevices, settings] = await Promise.all([
        navigator.mediaDevices.enumerateDevices(), window.api.ttsGetSettings()
      ])
      const virtualDevices = allDevices.filter(
        (device) => device.kind === 'audiooutput' && isVirtualAudioDevice(device.label)
      )
      setDevices(virtualDevices)
      setActiveDeviceId(virtualDevices.some((d) => d.deviceId === settings.outputDevice) ? settings.outputDevice : '')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Unable to enumerate virtual audio devices: ${message}`)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void loadDevices()
    navigator.mediaDevices.addEventListener?.('devicechange', loadDevices)
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', loadDevices)
  }, [loadDevices])

  const selectDevice = useCallback(async (deviceId: string) => {
    setLoading(true)
    setError(null)
    try {
      await window.api.ttsSetOutputDevice(deviceId)
      setActiveDeviceId(deviceId)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Unable to route translated speech: ${message}`)
    } finally { setLoading(false) }
  }, [])

  const enabled = activeDeviceId !== ''
  const activeDevice = devices.find((device) => device.deviceId === activeDeviceId)

  return (
    <Section label="Virtual Microphone (Meeting Sharing)" helpText="Routes translated speech directly to BlackHole through macOS CoreAudio.">
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#94a3b8', cursor: disabled || loading ? 'default' : 'pointer', marginBottom: '8px' }}>
        <input type="checkbox" checked={enabled}
          onChange={(event) => void selectDevice(event.target.checked ? (devices[0]?.deviceId ?? '') : '')}
          disabled={disabled || loading || devices.length === 0} aria-label="Enable virtual microphone output" />
        <span>{loading ? 'Detecting virtual audio devices...' : enabled
          ? `Virtual microphone ready: ${activeDevice?.label ?? 'virtual device'}`
          : 'Route translated speech to a virtual microphone'}</span>
      </label>

      {error && <div role="alert" style={errorContainerStyle}>{error}</div>}

      {devices.length > 1 && (
        <select value={activeDeviceId} onChange={(event) => void selectDevice(event.target.value)}
          style={{ ...selectStyle, marginBottom: '8px' }} disabled={disabled || loading} aria-label="Virtual audio device">
          <option value="">Disabled</option>
          {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
        </select>
      )}

      {enabled && <div style={{ fontSize: '12px', color: '#4ade80', marginBottom: '6px' }}>
        ● Ready — select &quot;{activeDevice?.label ?? 'BlackHole 2ch'}&quot; as the microphone in Discord, OBS, Zoom or Meet.
      </div>}

      {!loading && devices.length === 0 && <div style={warningContainerStyle}>
        No virtual output is visible. Allow microphone access, then press Refresh Devices.
      </div>}

      <button onClick={() => void loadDevices()} disabled={disabled || loading}
        style={{ fontSize: '12px', color: '#94a3b8', background: 'transparent', border: '1px solid #334155', borderRadius: '4px', padding: '4px 10px', cursor: disabled || loading ? 'default' : 'pointer', marginBottom: '6px' }}>
        Refresh Devices
      </button>
      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
        Uses Chromium audio routing instead of PortAudio, including on macOS 26.
      </div>
    </Section>
  )
}
