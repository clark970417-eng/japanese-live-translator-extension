/** Find the lowest-energy 20ms window near the end of a recognition segment. */
export function findQuietSegmentEnd(
  samples: Float32Array,
  sampleRate = 16_000,
  maxSeconds = 24,
  searchSeconds = 4
): number {
  const maximum = Math.min(samples.length, sampleRate * maxSeconds)
  if (maximum < sampleRate * maxSeconds) return maximum
  const windowSamples = Math.max(1, Math.floor(sampleRate * 0.02))
  const searchStart = Math.max(0, maximum - sampleRate * searchSeconds)
  let bestEnd = maximum
  let bestEnergy = Number.POSITIVE_INFINITY
  for (let i = searchStart; i + windowSamples <= maximum; i += windowSamples) {
    let energy = 0
    for (let j = i; j < i + windowSamples; j++) energy += Math.abs(samples[j]!)
    if (energy < bestEnergy) {
      bestEnergy = energy
      bestEnd = i + windowSamples
    }
  }
  return bestEnd
}
