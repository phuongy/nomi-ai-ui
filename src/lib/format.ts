// Relative time, mono-styled in the UI (SPEC §8). Mirrors the prototype's fmt.
export function relativeTime(ts: number): string {
  if (!ts) return ''
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}
