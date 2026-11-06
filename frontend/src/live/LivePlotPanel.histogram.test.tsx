import { act, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { LivePlotPanel } from './LivePlotPanel'

const state = vi.hoisted(() => ({ value: 13.9, listeners: new Set<() => void>() }))
vi.mock('./connection', () => ({
  colorFor: () => '#a3e635',
  store: {
    length: 1,
    times: () => new Float64Array([0]),
    column: () => new Float64Array([state.value]),
    latest: () => state.value,
    subscribe: (fn: () => void) => {
      state.listeners.add(fn)
      return () => {
        state.listeners.delete(fn)
      }
    },
  },
}))
vi.mock('../plot/HistogramGraph', () => ({ Histogram: () => <div>Histogram</div> }))
vi.mock('../plot/mountPlot', () => ({ mountPlot: vi.fn() }))

it('keeps the histogram header marker on the newest channel value', () => {
  const panel = { id: 1, channelIds: ['AFR'], graph: { type: 'histogram' as const, bins: 30 } }
  render(
    <LivePlotPanel
      panel={panel}
      context={{ paired: false, canJoin: false }}
      index={0}
      active
      known={new Set(['AFR'])}
      metas={{ AFR: { order: 0, precision: 1 } }}
      sync={{} as never}
      dispatch={vi.fn()}
    />,
  )
  expect(screen.getByLabelText('Plot 1')).toHaveTextContent('13.9')
  act(() => {
    state.value = 14.2
    for (const listener of state.listeners) listener()
  })
  expect(screen.getByLabelText('Plot 1')).toHaveTextContent('14.2')
})
