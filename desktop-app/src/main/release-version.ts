export function versionParts(value: string): number[] {
  const clean = value.replace(/^beta-v|^v/, '').split('-')[0]
  return clean.split('.').map((part) => Number.parseInt(part, 10) || 0)
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const a = versionParts(candidate)
  const b = versionParts(current)
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}
