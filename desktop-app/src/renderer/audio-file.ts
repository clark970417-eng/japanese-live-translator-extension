export const FILE_AUDIO_SAMPLE_RATE = 16_000

/** Mix every channel into one mono buffer without clipping. */
export function mixAudioChannels(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel)
    for (let i = 0; i < samples.length; i++) mono[i] += samples[i] / buffer.numberOfChannels
  }
  return mono
}

/** Decode any format supported by Chromium and normalize it for the STT engines. */
export async function decodeAudioFile(file: File): Promise<Float32Array> {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer())
    const mono = mixAudioChannels(decoded)
    if (decoded.sampleRate === FILE_AUDIO_SAMPLE_RATE) return mono

    const frames = Math.ceil(decoded.duration * FILE_AUDIO_SAMPLE_RATE)
    const offline = new OfflineAudioContext(1, frames, FILE_AUDIO_SAMPLE_RATE)
    const sourceBuffer = offline.createBuffer(1, mono.length, decoded.sampleRate)
    sourceBuffer.getChannelData(0).set(mono)
    const source = offline.createBufferSource()
    source.buffer = sourceBuffer
    source.connect(offline.destination)
    source.start()
    return new Float32Array((await offline.startRendering()).getChannelData(0))
  } finally {
    await context.close()
  }
}

/**
 * Split long recordings near quiet points so recognition does not cut words at
 * rigid boundaries. Segments remain short enough for every local STT engine.
 */
export function splitAudioNearSilence(
  audio: Float32Array,
  sampleRate = FILE_AUDIO_SAMPLE_RATE,
  maxSeconds = 24,
  searchSeconds = 4
): Float32Array[] {
  const max = Math.floor(maxSeconds * sampleRate)
  const search = Math.floor(searchSeconds * sampleRate)
  const window = Math.max(1, Math.floor(0.02 * sampleRate))
  const minimum = Math.floor(0.5 * sampleRate)
  const segments: Float32Array[] = []
  let start = 0

  while (audio.length - start > max) {
    const idealEnd = start + max
    const searchStart = Math.max(start + minimum, idealEnd - search)
    let bestEnd = idealEnd
    let bestEnergy = Number.POSITIVE_INFINITY
    for (let i = searchStart; i + window <= idealEnd; i += window) {
      let energy = 0
      for (let j = i; j < i + window; j++) energy += Math.abs(audio[j])
      if (energy < bestEnergy) {
        bestEnergy = energy
        bestEnd = i + window
      }
    }
    segments.push(audio.slice(start, bestEnd))
    start = bestEnd
  }
  if (audio.length - start >= minimum) segments.push(audio.slice(start))
  return segments
}
