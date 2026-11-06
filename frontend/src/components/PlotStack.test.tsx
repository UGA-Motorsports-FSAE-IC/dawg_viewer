import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PlotStack } from './PlotStack'
import { clearPlotDrag, makeLayout, setPlotDrag } from '../state/layout'

afterEach(() => {
  clearPlotDrag()
  vi.restoreAllMocks()
})

function dragOver(target: Element, clientX: number, clientY: number) {
  const event = new Event('dragover', { bubbles: true, cancelable: true })
  Object.defineProperties(event, { clientX: { value: clientX }, clientY: { value: clientY } })
  fireEvent(target, event)
}

function setup() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: 500,
    bottom: 200,
    width: 500,
    height: 200,
  } as DOMRect)
  const dispatch = vi.fn()
  const view = render(
    <PlotStack
      layout={makeLayout([[], []])}
      dispatch={dispatch}
      renderPanel={(panel) => <section data-panel-id={panel.id}>Plot {panel.id}</section>}
    />,
  )
  setPlotDrag(1)
  return { dispatch, target: view.container.querySelector('[data-panel-id="2"]')! }
}

it('shows a side indicator and pairs plots on drop', () => {
  const { dispatch, target } = setup()
  dragOver(target, 10, 100)
  expect(screen.getByTestId('drop-indicator')).toBeInTheDocument()
  fireEvent.drop(screen.getByRole('main'))
  expect(dispatch).toHaveBeenCalledWith({
    type: 'dropPanel',
    panelId: 1,
    targetId: 2,
    zone: 'left',
  })
  expect(screen.queryByTestId('drop-indicator')).not.toBeInTheDocument()
})

it('stacks below a plot when dropped on its bottom edge', () => {
  const { dispatch, target } = setup()
  dragOver(target, 250, 195)
  fireEvent.drop(screen.getByRole('main'))
  expect(dispatch).toHaveBeenCalledWith({
    type: 'dropPanel',
    panelId: 1,
    targetId: 2,
    zone: 'bottom',
  })
})

it('does nothing when a drag is cancelled', () => {
  const { dispatch, target } = setup()
  dragOver(target, 250, 100)
  fireEvent.dragEnd(screen.getByRole('main'))
  expect(screen.queryByTestId('drop-indicator')).not.toBeInTheDocument()
  expect(dispatch).not.toHaveBeenCalled()
})

it('commits the row height once, when the resize ends', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    height: 192,
  } as DOMRect)
  const dispatch = vi.fn()
  render(
    <PlotStack layout={makeLayout([[]])} dispatch={dispatch} renderPanel={() => <section />} />,
  )
  fireEvent.pointerDown(screen.getAllByRole('separator')[0], { clientY: 100 })
  fireEvent.pointerMove(document, { clientY: 137 })
  expect(dispatch).not.toHaveBeenCalled()
  fireEvent.pointerUp(document)
  expect(dispatch).toHaveBeenCalledWith({ type: 'setRowHeight', rowId: 1, height: 229 })
})
