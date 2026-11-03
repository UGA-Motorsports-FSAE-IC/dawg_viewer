import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LiveView } from './LiveView'

vi.mock('../live/connection', () => ({
  startLive: vi.fn(),
  useInfo: () => ({
    active: 'car',
    channels: { RPM: { pinned: true, order: 0 }, VSS: { order: 1 } },
  }),
  useChannels: () => [
    { name: 'RPM', id: 1 },
    { name: 'VSS', id: 2 },
  ],
  colorFor: () => '#fff',
  status: { get: () => ({ startedAt: 0 }) },
  store: {
    length: 0,
    times: () => new Float64Array(),
    column: () => null,
    bounds: () => null,
    latest: () => undefined,
    lastUpdate: () => undefined,
    subscribe: () => () => {},
  },
}))
vi.mock('../live/StatusHeader', () => ({ StatusHeader: () => <div>Status</div> }))
vi.mock('../plot/mountPlot', () => ({
  mountPlot: () => ({ u: { setData: vi.fn() }, destroy: vi.fn() }),
}))
vi.mock('../live/follow', () => ({
  liveSync: {},
  resumeFollow: vi.fn(),
  showWindow: vi.fn(),
  useFollow: () => ({ follow: true, windowS: 30 }),
}))

beforeEach(() => localStorage.clear())

it('adds a stream in card edit mode and saves when clicking outside', async () => {
  const user = userEvent.setup()
  render(<LiveView />)
  expect(screen.queryByTitle('VSS')).not.toBeInTheDocument()
  fireEvent.doubleClick(screen.getByLabelText('Live value cards'))
  await user.click(screen.getByRole('button', { name: 'VSS' }))
  expect(screen.getByTitle('VSS')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'VSS' }))
  expect(screen.getAllByTitle('VSS')).toHaveLength(1)
  fireEvent.pointerDown(screen.getByText('Status'))
  expect(JSON.parse(localStorage.getItem('dawg.live-cards.v1') ?? '{}').car).toEqual([
    { name: 'RPM', wide: false },
    { name: 'VSS', wide: false },
  ])
  expect(screen.getByRole('button', { name: 'Double click to edit' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'VSS' })).toHaveAttribute('aria-pressed', 'false')
})

it('searches to add any data point to the top and snaps plots in a bento layout', async () => {
  const user = userEvent.setup()
  render(<LiveView />)

  // Search to add a data point directly to the top cards
  const search = screen.getByLabelText('Search data points')
  await user.type(search, 'OilPres')
  await user.click(screen.getByRole('button', { name: 'Add OilPres card' }))
  expect(screen.getByTitle('OilPres')).toBeInTheDocument()

  // Toggle plot 1 to wide and tall in the bento grid
  const plot1 = screen.getByLabelText('Plot 1')
  const plot2 = screen.getByLabelText('Plot 2')
  expect(plot1.className).toContain('col-span-1')
  await user.click(screen.getByRole('button', { name: 'Toggle plot 1 width' }))
  expect(screen.getByLabelText('Plot 1').className).toContain('col-span-2')
  await user.click(screen.getByRole('button', { name: 'Toggle plot 1 height' }))
  expect(screen.getByLabelText('Plot 1').className).toContain('row-span-2')

  // Drag Plot 2 into the open right slot of the third row.
  vi.spyOn(screen.getByRole('main'), 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, width: 1000, height: 600,
  } as DOMRect)
  fireEvent.dragStart(plot2, { dataTransfer: { effectAllowed: '' } })
  const dragOver = new Event('dragover', { bubbles: true, cancelable: true })
  Object.defineProperties(dragOver, { clientX: { value: 750 }, clientY: { value: 430 } })
  fireEvent(screen.getByRole('main'), dragOver)
  expect(screen.getByTestId('plot-phantom')).toBeInTheDocument()
  expect(screen.getByTestId('plot-phantom')).toContainElement(plot2)
  fireEvent.drop(screen.getByRole('main'))

  // The original plot sizes remain after the drop
  expect(screen.getByLabelText('Plot 1').className).toContain('col-span-2')
  expect(screen.getByLabelText('Plot 2').className).toContain('col-span-1')
  expect(screen.getByLabelText('Plot 1')).toHaveTextContent('RPM')
  expect(screen.getByLabelText('Plot 2')).toHaveTextContent('CLT1')

  // Drag right edge of Plot 1 to dynamically resize width, and bottom edge of Plot 2 to dynamically resize height
  await user.click(screen.getByRole('button', { name: 'Toggle plot 1 width' }))
  const rightEdge = screen.getByLabelText('Drag right edge of plot 1')
  fireEvent.pointerDown(rightEdge, { clientX: 100, clientY: 100 })
  fireEvent.pointerMove(document, { clientX: 120, clientY: 100 })
  expect(screen.getByLabelText('Plot 1').style.width).toBe('100%')
  fireEvent.pointerMove(document, { clientX: 180, clientY: 100 })
  fireEvent.pointerUp(document)
  expect(screen.getByLabelText('Plot 1').className).toContain('col-span-2')

  const bottomEdge = screen.getByLabelText('Drag bottom edge of plot 2')
  fireEvent.pointerDown(bottomEdge, { clientX: 100, clientY: 100 })
  fireEvent.pointerMove(document, { clientX: 100, clientY: 135 })
  expect(screen.getByLabelText('Plot 2').style.height).toBe('227px')
  fireEvent.pointerMove(document, { clientX: 100, clientY: 450 })
  fireEvent.pointerUp(document)
  expect(screen.getByLabelText('Plot 2').className).toContain('row-span-3')
})
