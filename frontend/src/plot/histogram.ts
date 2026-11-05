import type { Range } from './sync'

export function buildHistogram(
  time: Float64Array,
  values: Float64Array,
  range: Range | null,
  requestedBins: number,
  valueRange: { min: number; max: number } | null = null,
  frequency: 'count' | 'percent' = 'count',
) {
  const samples: number[] = []
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < Math.min(time.length, values.length); i++) {
    if ((!range || (time[i] >= range.min && time[i] <= range.max)) && Number.isFinite(values[i])) {
      samples.push(values[i])
      min = Math.min(min, values[i])
      max = Math.max(max, values[i])
    }
  }
  if (!samples.length) return { centers: [], counts: [], edges: [], total: 0, outside: 0 }
  const total = samples.length
  if (valueRange) {
    min = valueRange.min
    max = valueRange.max
  }
  const bins =
    min === max
      ? 1
      : Math.min(samples.length, Math.max(5, Math.min(200, Math.trunc(requestedBins))))
  const width = min === max ? Math.max(Math.abs(min) * 0.01, 1) : (max - min) / bins
  const start = min === max ? min - width / 2 : min
  const counts = Array<number>(bins).fill(0)
  let outside = 0
  for (const value of samples) {
    if (value < min || value > max) {
      outside++
      continue
    }
    counts[Math.min(bins - 1, Math.floor((value - start) / width))]++
  }
  const edges = Array.from({ length: bins + 1 }, (_, i) => start + i * width)
  return {
    centers: counts.map((_, i) => (edges[i] + edges[i + 1]) / 2),
    counts: frequency === 'percent' ? counts.map((n) => (n / (total - outside)) * 100) : counts,
    edges,
    total: total - outside,
    outside,
  }
}
