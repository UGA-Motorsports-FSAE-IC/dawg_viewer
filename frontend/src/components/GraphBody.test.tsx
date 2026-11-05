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
  expect(screen.getByRole('button', { name: 'Time series' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  fireEvent.click(screen.getByRole('button', { name: 'Histogram' }))
  expect(dispatch).toHaveBeenCalledWith({
    type: 'setGraphType',
    panelId: 1,
    graphType: 'histogram',
  })
  expect(screen.getByRole('dialog', { name: 'Plot settings' })).toBeInTheDocument()
})

it('measures and clamps the settings popover within the viewport', () => {
  const original = HTMLElement.prototype.getBoundingClientRect
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.getAttribute('role') === 'dialog')
      return { width: 320, height: 280, left: 0, top: 0, right: 320, bottom: 280 } as DOMRect
    return original.call(this)
  }
  try {
    render(
      <GraphBody panel={{ id: 1, channelIds: ['RPM'] }} dispatch={vi.fn()}>
        Graph
      </GraphBody>,
    )
    const target = screen.getByLabelText('Graph options for plot 1')
    fireEvent.contextMenu(target, {
      clientX: window.innerWidth - 1,
      clientY: window.innerHeight - 1,
    })
    const dialog = screen.getByRole('dialog', { name: 'Plot settings' })
    expect(Number.parseInt(dialog.style.left) + 320).toBeLessThanOrEqual(window.innerWidth - 8)
    expect(Number.parseInt(dialog.style.top) + 280).toBeLessThanOrEqual(window.innerHeight - 8)
    expect(dialog.parentElement).toBe(document.body)
  } finally {
    HTMLElement.prototype.getBoundingClientRect = original
  }
})
