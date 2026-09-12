export type EngineMode = 'auto' | 'rotation' | 'online' | 'online-deepl' | 'online-gemini' | 'offline-hymt15' | 'offline-hymt2' | 'offline-hunyuan-mt' | 'offline-apple'
export type SttEngineType = 'whisper-local' | 'mlx-whisper' | 'kotoba-whisper' | 'qwen3-asr' | 'sensevoice-sherpa' | 'apple-speech-transcriber'

/** Resolve 'auto' engine mode to a concrete mode based on available keys and GPU */
export function resolveEngineMode(
  mode: EngineMode,
  apiKeys: { apiKey: string; deeplApiKey: string; geminiApiKey: string; microsoftApiKey: string; microsoftRegion: string },
  gpuInfo: { hasGpu: boolean } | null
): EngineMode {
  if (mode !== 'auto') return mode
  const hasKeys = !!(apiKeys.apiKey || apiKeys.deeplApiKey || apiKeys.geminiApiKey || (apiKeys.microsoftApiKey && apiKeys.microsoftRegion))
  if (hasKeys) return 'rotation'
  if (gpuInfo?.hasGpu) return 'offline-hunyuan-mt'
  return 'offline-hymt15'
}

/** Build pipeline config from resolved engine mode and settings */
export function buildEngineConfig(
  resolvedMode: EngineMode,
  sttEngine: SttEngineType,
  apiKeys: {
    apiKey: string
    deeplApiKey: string
    geminiApiKey: string
    microsoftApiKey: string
    microsoftRegion: string
    openaiApiKey?: string
    geminiLiveApiKey?: string
  },
  /**
   * Realtime cloud toggles. An object rather than positional booleans: these route
   * where a user's audio is sent, and two adjacent same-typed flags are swappable
   * at a call site without any type error.
   */
  realtime: { cloudRealtimeEnabled?: boolean; geminiLiveEnabled?: boolean } = {}
): Record<string, unknown> {
  // #722/#723: Cloud realtime interpretation is a separate capability axis, not an
  // extra translation engine — when enabled (with the matching BYOK key) it
  // overrides the cascade engine selection and runs a speech-native e2e path.
  // Both default off, keeping the local-first cascade as Core Value ①.
  //
  // Only ONE e2e path can own a session. gpt-realtime-translate outranks Gemini
  // Live, whose model is Preview and may change or break without notice, so its
  // toggle is checked first and owns the decision outright: a cloudRealtime user
  // whose OpenAI key is missing falls back to the LOCAL cascade, never sideways to
  // the other vendor. "Enabled but unusable" is a misconfiguration, not consent to
  // ship audio to a cloud the user did not choose.
  if (realtime.cloudRealtimeEnabled) {
    if (apiKeys.openaiApiKey) {
      return {
        mode: 'e2e' as const,
        e2eEngineId: 'cloud-realtime-e2e',
        openaiApiKey: apiKeys.openaiApiKey
      }
    }
  } else if (realtime.geminiLiveEnabled && apiKeys.geminiLiveApiKey) {
    return {
      mode: 'e2e' as const,
      e2eEngineId: 'gemini-live-e2e',
      geminiLiveApiKey: apiKeys.geminiLiveApiKey
    }
  }

  const base = { mode: 'cascade' as const, sttEngineId: sttEngine }

  switch (resolvedMode) {
    case 'rotation':
      return {
        ...base,
        translatorEngineId: 'rotation-controller',
        ...(apiKeys.apiKey && { apiKey: apiKeys.apiKey }),
        ...(apiKeys.deeplApiKey && { deeplApiKey: apiKeys.deeplApiKey }),
        ...(apiKeys.geminiApiKey && { geminiApiKey: apiKeys.geminiApiKey }),
        ...(apiKeys.microsoftApiKey && apiKeys.microsoftRegion && { microsoftApiKey: apiKeys.microsoftApiKey, microsoftRegion: apiKeys.microsoftRegion })
      }
    case 'online':
      return { ...base, translatorEngineId: 'google-translate', apiKey: apiKeys.apiKey }
    case 'online-deepl':
      return { ...base, translatorEngineId: 'deepl-translate', deeplApiKey: apiKeys.deeplApiKey }
    case 'online-gemini':
      return { ...base, translatorEngineId: 'gemini-translate', geminiApiKey: apiKeys.geminiApiKey }
    case 'offline-hymt2':
      return { ...base, translatorEngineId: 'hunyuan-mt-2' }
    case 'offline-hunyuan-mt':
      return { ...base, translatorEngineId: 'hunyuan-mt' }
    case 'offline-apple':
      return { ...base, translatorEngineId: 'apple-translate' }
    case 'offline-hymt15':
    default:
      // 'offline-hymt15' is the fast offline default; any unknown legacy ID falls back here.
      return { ...base, translatorEngineId: 'hunyuan-mt-15' }
  }
}
