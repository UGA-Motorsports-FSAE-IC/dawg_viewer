import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PlotStack } from './PlotStack'
import { clearPlotDrag, setPlotDrag, type Panel } from '../state/layout'
import { previewPlotPlacement } from '../state/plotSlots'

const panels: Panel[] = [
  { id: 1, channelIds: [], slot: { row: 0, col: 0 } },
  { id: 2, channelIds: [], slot: { row: 0, col: 1 } },
]

it('renders the original sequential layout in full-size mode', () => {
  const dispatch = vi.fn()
  render(
    <PlotStack
      panels={panels}
      mode="full"
      dispatch={dispatch}
      renderPanel={(panel) => <section>Plot {panel.id}</section>}
    />,
  )
  expect(screen.getByRole('main')).toHaveTextContent('Plot 1Plot 2')
  expect(screen.queryByTestId('plot-phantom')).not.toBeInTheDocument()
})

function dragOver(target: Element, clientX: number, clientY: number) {
  const event = new Event('dragover', { bubbles: true, cancelable: true })
  Object.defineProperties(event, { clientX: { value: clientX }, clientY: { value: clientY } })
  fireEvent(target, event)
}

function setup() {
  const dispatch = vi.fn()
  const view = render(
    <PlotStack
      panels={panels}
      mode="bento"
      dispatch={dispatch}
      renderPanel={(panel) => <section data-panel-id={panel.id}>Plot {panel.id}</section>}
    />,
  )
  const main = screen.getByRole('main')
  vi.spyOn(main, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 1000,
    height: 600,
  } as DOMRect)
  const source = view.container.querySelector('[data-panel-id="1"]')!
  setPlotDrag(1, 0)
  fireEvent.dragStart(source)
  return { dispatch, main, source, view }
}

it('previews a swap at a stable slot and commits it on drop', () => {
  expect(previewPlotPlacement(panels, 1, { row: 0, col: 1 })).not.toBeNull()
  const { dispatch, main, view } = setup()
  dragOver(main, 750, 50)
  const phantom = screen.getByTestId('plot-phantom')
  expect(phantom).toContainElement(view.container.querySelector('[data-panel-id="1"]'))
  expect(phantom.style.left).toBe('calc(50% + 3px)')
  expect(view.container.querySelector('[data-panel-id="2"]')!.parentElement!.style.left).toBe(
    'calc(0% + 0px)',
  )
  dragOver(main, 760, 60)
  expect(screen.getByTestId('plot-phantom').style.left).toBe('calc(50% + 3px)')
  fireEvent.drop(main)
  expect(dispatch).toHaveBeenCalledWith({ type: 'placePanel', panelId: 1, row: 0, col: 1 })
  expect(screen.queryByTestId('plot-phantom')).not.toBeInTheDocument()
  clearPlotDrag()
})

it('moves the plot into empty grey space', () => {
  const { dispatch, main } = setup()
  dragOver(main, 750, 430)
  expect(screen.getByTestId('plot-phantom')).toHaveStyle({ top: '396px' })
  fireEvent.drop(main)
  expect(dispatch).toHaveBeenCalledWith({ type: 'placePanel', panelId: 1, row: 2, col: 1 })
  clearPlotDrag()
})

it('previews a tall plot replacing two stacked short plots', () => {
  const tallPanels: Panel[] = [
    { id: 1, channelIds: [], rowSpan: 2, slot: { row: 0, col: 0 } },
    { id: 2, channelIds: [], slot: { row: 0, col: 1 } },
    { id: 3, channelIds: [], slot: { row: 1, col: 1 } },
  ]
  const dispatch = vi.fn()
  const view = render(
    <PlotStack
      panels={tallPanels}
      mode="bento"
      dispatch={dispatch}
      renderPanel={(panel) => <section data-panel-id={panel.id}>Plot {panel.id}</section>}
    />,
  )
  const main = screen.getByRole('main')
  vi.spyOn(main, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 1000,
    height: 600,
  } as DOMRect)
  setPlotDrag(1, 0)
  fireEvent.dragStart(view.container.querySelector('[data-panel-id="1"]')!)
  dragOver(main, 750, 250)
  expect(screen.getByTestId('plot-phantom')).toHaveStyle({ left: 'calc(50% + 3px)', top: '0px' })
  expect(view.container.querySelector('[data-panel-id="2"]')!.parentElement).toHaveStyle({
    top: '0px',
    left: 'calc(0% + 0px)',
  })
  expect(view.container.querySelector('[data-panel-id="3"]')!.parentElement).toHaveStyle({
    top: '198px',
    left: 'calc(0% + 0px)',
  })
  fireEvent.drop(main)
  expect(dispatch).toHaveBeenCalledWith({ type: 'placePanel', panelId: 1, row: 1, col: 1 })
  clearPlotDrag()
})

it('restores the plot when a drag is cancelled', () => {
  const { dispatch, source } = setup()
  fireEvent.dragEnd(source)
  expect(screen.queryByTestId('plot-phantom')).not.toBeInTheDocument()
  expect(dispatch).not.toHaveBeenCalled()
  clearPlotDrag()
})
