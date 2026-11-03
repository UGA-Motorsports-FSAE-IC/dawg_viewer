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

  // Drag Plot 2 onto Plot 1 to snap them side-by-side in the bento grid
  fireEvent.dragStart(plot2, { dataTransfer: { effectAllowed: '' } })
  fireEvent.dragOver(screen.getByLabelText('Plot 1'))
  expect(screen.getByLabelText('Plot 1')).toHaveAttribute('data-snap', 'left')
  fireEvent.drop(screen.getByLabelText('Plot 1'))

  // Both plots snap to 1-col side-by-side and swap order
  expect(screen.getByLabelText('Plot 1').className).toContain('col-span-1')
  expect(screen.getByLabelText('Plot 2').className).toContain('col-span-1')
  expect(screen.getByLabelText('Plot 1')).toHaveTextContent('CLT1')
  expect(screen.getByLabelText('Plot 2')).toHaveTextContent('RPM')
})
