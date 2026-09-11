import React from 'react'
import { colors, fontSize } from '../../theme'

/** Supported language codes — must match Language type in types.ts */
export type Language = 'ja' | 'en' | 'zh' | 'ko' | 'fr' | 'de' | 'es' | 'pt' | 'ru' | 'it' | 'nl' | 'pl' | 'ar' | 'th' | 'vi' | 'id'
export type SourceLanguage = 'auto' | Language

export const LANGUAGE_LABELS: Record<Language, string> = {
  ja: 'Japanese',
  en: 'English',
  zh: 'Chinese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  pt: 'Portuguese',
  ru: 'Russian',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  ar: 'Arabic',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian'
}

export const ALL_LANGUAGES = Object.keys(LANGUAGE_LABELS) as Language[]

export type { EngineMode } from '../../../engine-selection'
import type { EngineMode } from '../../../engine-selection'

/** Legacy engine mode IDs removed from the UI in #702.
 *  Persisted store values matching these IDs are migrated to 'auto' on startup. */
export const LEGACY_TRANSLATION_ENGINES: readonly string[] = [
  'offline-lfm2',
  'offline-plamo',
  'offline-hybrid',
  'offline-opus'
] as const

export type { SttEngineType } from '../../../engine-selection'
import type { SttEngineType } from '../../../engine-selection'
export type WhisperVariantType = 'kotoba-v2.0' | 'large-v3-turbo' | 'distil-large-v3' | 'base' | 'small'
export type SubtitlePositionType = 'top' | 'bottom'

export interface DisplayInfo {
  id: number
  label: string
}

/** Wrap a promise with a timeout to prevent UI freezes when main process hangs */
export function withIpcTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
  })
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer))
}

// Shared styles used across settings sub-components
export const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: fontSize.md,
  background: colors.bg.secondary,
  color: colors.text.primary,
  border: `1px solid ${colors.border.default}`,
  borderRadius: '6px'
}

export const inputStyle: React.CSSProperties = {
  ...selectStyle,
  fontFamily: 'monospace'
}

export const radioLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '8px',
  fontSize: fontSize.md,
  color: colors.text.primary,
  cursor: 'pointer',
  padding: '6px 0'
}

export const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px',
  fontSize: '15px',
  fontWeight: 700,
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  color: '#fff',
  marginTop: '8px',
  minHeight: '44px'
}

export const sliderLabelStyle: React.CSSProperties = {
  fontSize: fontSize.base,
  color: colors.text.muted,
  marginBottom: '4px'
}

export const colorInputStyle: React.CSSProperties = {
  width: '100%',
  height: '2rem',
  padding: '2px',
  background: colors.bg.secondary,
  border: `1px solid ${colors.border.default}`,
  borderRadius: '6px',
  cursor: 'pointer'
}

export const errorContainerStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: fontSize.base,
  color: '#fca5a5',
  background: colors.bg.secondary,
  border: `1px solid ${colors.accent.error}`,
  borderRadius: '6px',
  marginBottom: '8px'
}

export const warningContainerStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: fontSize.base,
  color: '#fde68a',
  background: colors.bg.secondary,
  border: `1px solid ${colors.accent.warning}`,
  borderRadius: '6px',
  marginBottom: '8px'
}

export const disclosureToggleStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: colors.text.secondary,
  fontSize: fontSize.sm,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  cursor: 'pointer',
  padding: '4px 0',
  display: 'flex',
  alignItems: 'center',
  gap: '6px'
}

export const disclosureArrowStyle = (isOpen: boolean): React.CSSProperties => ({
  transform: isOpen ? 'rotate(90deg)' : 'none',
  transition: 'transform 0.2s',
  fontSize: fontSize.xs
})

// --- Engine mode utilities ---

/** API-based engine modes that require at least one API key */
export const API_ENGINE_MODES: EngineMode[] = ['rotation', 'online', 'online-deepl', 'online-gemini']

/** LLM-based engine modes that support KV cache / SimulMT options */
export const LLM_ENGINE_MODES: EngineMode[] = ['offline-hymt15', 'offline-hunyuan-mt']

/** Display name for each engine mode */
export function getEngineDisplayName(mode: EngineMode): string {
  switch (mode) {
    case 'offline-apple': return 'Apple Translate (Built-in)'
    case 'offline-hymt15': return 'HY-MT 1.5 (Recommended)'
    case 'offline-hunyuan-mt': return 'Hunyuan-MT 7B (High Quality)'
    case 'rotation': return 'API Auto Rotation'
    case 'online': return 'Google Translation'
    case 'online-deepl': return 'DeepL'
    case 'online-gemini': return 'Gemini 2.5 Flash'
    case 'auto': return 'Auto'
    default: return mode
  }
}

/** Display name for STT engine + variant */
export function getSttDisplayName(sttEngine: SttEngineType, whisperVariant: WhisperVariantType): string {
  switch (sttEngine) {
    case 'apple-speech-transcriber': return 'Apple Speech (Zero Setup)'
    case 'sensevoice-sherpa': return 'SenseVoice Small (Ultra-fast, Offline)'
    case 'qwen3-asr': return 'Qwen3-ASR 0.6B (Apple Silicon)'
    case 'kotoba-whisper': return 'Kotoba-Whisper v2.0 (JA-optimized)'
    case 'mlx-whisper': return 'mlx-whisper (Apple Silicon)'
    case 'whisper-local': {
      const variantLabels: Record<string, string> = {
        'kotoba-v2.0': 'kotoba-v2.0',
        'large-v3-turbo': 'large-v3-turbo',
        'distil-large-v3': 'distil-large-v3',
        'small': 'small, fast',
        'base': 'base, fastest'
      }
      return `Whisper (${variantLabels[whisperVariant] || whisperVariant})`
    }
    default: return sttEngine
  }
}

export { resolveEngineMode, buildEngineConfig } from '../../../engine-selection'
