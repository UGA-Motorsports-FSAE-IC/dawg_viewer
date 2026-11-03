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
  store: { latest: () => undefined, lastUpdate: () => undefined, subscribe: () => () => {} },
}))
vi.mock('../live/StatusHeader', () => ({ StatusHeader: () => <div>Status</div> }))
vi.mock('../live/LivePlotPanel', () => ({ LivePlotPanel: () => <div>Plot</div> }))
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
