import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { GraphBody } from './GraphBody'

it('opens graph types on right click and selects histogram', () => {
  const dispatch = vi.fn()
  render(
    <GraphBody panel={{ id: 1, channelIds: ['RPM', 'TPS1'] }} dispatch={dispatch}>
      <div>Graph</div>
    </GraphBody>,
  )
  fireEvent.contextMenu(screen.getByLabelText('Graph options for plot 1'))
  expect(screen.getByRole('menuitemradio', { name: /Time series/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Histogram/ }))
  expect(dispatch).toHaveBeenCalledWith({
    type: 'setGraphType',
    panelId: 1,
    graphType: 'histogram',
  })
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})
