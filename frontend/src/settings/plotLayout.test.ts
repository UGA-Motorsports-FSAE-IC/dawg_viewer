import { beforeEach, expect, it } from 'vitest'
import { loadPlotLayoutMode, savePlotLayoutMode } from './plotLayout'

beforeEach(() => localStorage.clear())

it('uses full-size mode by default and for invalid values', () => {
  expect(loadPlotLayoutMode()).toBe('full')
  localStorage.setItem('dawg.plot-layout-mode.v1', 'rows')
  expect(loadPlotLayoutMode()).toBe('full')
})

it('round-trips the bento preference', () => {
  savePlotLayoutMode('bento')
  expect(loadPlotLayoutMode()).toBe('bento')
})
