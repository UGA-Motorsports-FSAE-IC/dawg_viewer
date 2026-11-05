import { expect, it } from 'vitest'
import { buildHistogram } from './histogram'

it('bins finite samples in the selected time range including the maximum', () => {
  const result = buildHistogram(
    new Float64Array([0, 1, 2, 3, 4]),
    new Float64Array([0, 1, NaN, 2, 3]),
    { min: 1, max: 4 },
    5,
  )
  expect(result.total).toBe(3)
  expect(result.counts.reduce((sum, count) => sum + count, 0)).toBe(3)
  expect(result.counts[result.counts.length - 1]).toBe(1)
  expect(result.edges[0]).toBe(1)
})

it('handles empty and constant values', () => {
  expect(buildHistogram(new Float64Array([0]), new Float64Array([NaN]), null, 30).total).toBe(0)
  expect(
    buildHistogram(new Float64Array([0, 1]), new Float64Array([7, 7]), null, 30).counts,
  ).toEqual([2])
})
