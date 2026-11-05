import { expect, it } from 'vitest'
import { setStreamColor, streamColor } from './streamColors'

it('overrides and resets a channel color globally', () => {
  const original = streamColor('RPM')
  setStreamColor('RPM', '#abcdef')
  expect(streamColor('RPM')).toBe('#abcdef')
  expect(JSON.parse(localStorage.getItem('dawg.stream-colors.v1') ?? '{}').RPM).toBe('#abcdef')
  setStreamColor('RPM', null)
  expect(streamColor('RPM')).toBe(original)
})
