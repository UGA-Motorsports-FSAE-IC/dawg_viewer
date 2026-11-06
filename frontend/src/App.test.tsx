import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { openLog } from './viewer/openLog'
import App from './App'

vi.mock('./live/connection', () => ({ useInfo: () => null }))
vi.mock('./viewer/openLog', () => ({ openLog: vi.fn(), pickAndOpenLog: vi.fn() }))
vi.mock('./views/LiveView', () => ({
  LiveView: ({ plotLayoutMode }: { plotLayoutMode: string }) => (
    <div>Live dashboard: {plotLayoutMode}</div>
  ),
}))
vi.mock('./views/LogsView', () => ({
  LogsView: ({ onOpen }: { onOpen: (path: string) => void }) => (
    <button onClick={() => onOpen('run.csv')}>Open downloaded log</button>
  ),
}))
vi.mock('./views/ViewerView', () => ({
  ViewerView: ({ session, error }: { session: { name: string } | null; error: string }) => (
    <div>
      {session?.name ?? 'No log open'}
      {error && <p>{error}</p>}
    </div>
  ),
}))

beforeEach(() => {
  vi.mocked(openLog).mockReset()
  localStorage.clear()
})

describe('App navigation', () => {
  it('opens a downloaded log in the viewer', async () => {
    const user = userEvent.setup()
    vi.mocked(openLog).mockResolvedValue({
      name: 'run.csv',
      path: 'run.csv',
      note: '',
      sampleRate: 0,
      time: new Float64Array(),
      channels: [],
      byId: new Map(),
    })
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Logs' }))
    await user.click(screen.getByRole('button', { name: 'Open downloaded log' }))
    expect(await screen.findByText('run.csv')).toBeInTheDocument()
    expect(openLog).toHaveBeenCalledWith('run.csv')
  })

  it('defaults to full-size plots and saves the bento preference', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('radio', { name: /Full-size plots/ })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: /Bento grid/ }))
    expect(screen.getByRole('radio', { name: /Bento grid/ })).toBeChecked()
    expect(localStorage.getItem('dawg.plot-layout-mode.v1')).toBe('bento')
    await user.click(screen.getByRole('button', { name: 'Live' }))
    expect(screen.getByText('Live dashboard: bento')).toBeInTheDocument()
  })

  it('loads the saved bento preference', async () => {
    localStorage.setItem('dawg.plot-layout-mode.v1', 'bento')
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('radio', { name: /Bento grid/ })).toBeChecked()
  })
})
