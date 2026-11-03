import { expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PinnedCards } from './PinnedCards'
import type { CardItem } from './cardLayout'

const mockState = {
  status: { startedAt: 0, state: 'listening' },
  latest: new Map<string, number>(),
  lastUpdate: new Map<string, number>(),
  listeners: new Set<() => void>(),
}

vi.mock('./connection', () => ({
  status: {
    get: () => mockState.status,
    subscribe: (fn: () => void) => {
      mockState.listeners.add(fn)
      return () => mockState.listeners.delete(fn)
    },
  },
  store: {
    latest: (name: string) => mockState.latest.get(name),
    lastUpdate: (name: string) => mockState.lastUpdate.get(name),
    subscribe: (fn: () => void) => {
      mockState.listeners.add(fn)
      return () => mockState.listeners.delete(fn)
    },
  },
}))

it('edits width, order, and visibility while keeping the edit hint', () => {
  let cards: CardItem[] = [
    { name: 'RPM', wide: false },
    { name: 'VSS', wide: false },
  ]
  const onEdit = vi.fn()
  const onCards = vi.fn((next: CardItem[]) => {
    cards = next
    view.rerender(renderCards())
  })
  const renderCards = () => (
    <PinnedCards
      cardRef={{ current: null }}
      metas={{}}
      cards={cards}
      editing
      onEdit={onEdit}
      onCards={onCards}
    />
  )
  const view = render(renderCards())

  fireEvent.dragStart(screen.getByTitle('VSS'), { dataTransfer: { effectAllowed: '' } })
  fireEvent.dragOver(screen.getByTitle('RPM'))
  expect(screen.getByTitle('RPM').className).toContain('after:-left-1.5')
  fireEvent.drop(screen.getByTitle('RPM'))
  expect(cards.map((card) => card.name)).toEqual(['VSS', 'RPM'])
  expect(screen.getByTitle('RPM').className).not.toContain('after:-left-1.5')

  fireEvent.dragStart(screen.getByTitle('VSS'), { dataTransfer: { effectAllowed: '' } })
  fireEvent.dragOver(screen.getByTitle('RPM'))
  expect(screen.getByTitle('RPM').className).toContain('after:-right-1.5')
  fireEvent.dragEnd(screen.getByTitle('VSS'))
  expect(screen.getByTitle('RPM').className).not.toContain('after:-right-1.5')

  fireEvent.doubleClick(screen.getByTitle('RPM'))
  expect(cards[1].wide).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Move RPM left' }))
  expect(cards.map((card) => card.name)).toEqual(['RPM', 'VSS'])
  fireEvent.click(screen.getByRole('button', { name: 'Remove RPM card' }))
  expect(cards).toEqual([{ name: 'VSS', wide: false }])
  expect(screen.getByText(/Click outside to save/)).toBeInTheDocument()
})

it('searches and adds any data point to the top cards by label, name, or custom query', async () => {
  const user = userEvent.setup()
  let cards: CardItem[] = [{ name: 'RPM', wide: false }]
  const metas = {
    RPM: { label: 'RPM', order: 0 },
    CLT1: { label: 'Coolant Temp', unit: '°F', order: 1 },
    BatV: { label: 'Battery', unit: 'V', order: 2 },
  }
  const renderCards = () => (
    <PinnedCards
      cardRef={{ current: null }}
      metas={metas}
      channels={['RPM', 'CLT1', 'AccelX']}
      cards={cards}
      editing={false}
      onEdit={vi.fn()}
      onCards={(next) => {
        cards = next
        view.rerender(renderCards())
      }}
    />
  )
  const view = render(renderCards())

  const search = screen.getByLabelText('Search data points')
  await user.type(search, 'Coolant')
  await user.click(screen.getByRole('button', { name: 'Add CLT1 card' }))
  expect(cards.map((c) => c.name)).toEqual(['RPM', 'CLT1'])
  expect(search).toHaveValue('')

  // Search by unit and press Enter to add
  await user.type(search, 'V{Enter}')
  expect(cards.map((c) => c.name)).toEqual(['RPM', 'CLT1', 'BatV'])

  // Search for a custom/unlisted data point and press Enter to add
  await user.type(search, 'FuelPress{Enter}')
  expect(cards.map((c) => c.name)).toEqual(['RPM', 'CLT1', 'BatV', 'FuelPress'])
})

it('transitions card border color from green when live to red when disconnected', () => {
  const nowMs = Date.now()
  mockState.status = { startedAt: nowMs - 5000, state: 'receiving' }
  mockState.latest.set('RPM', 8500)
  mockState.lastUpdate.set('RPM', 5)

  render(
    <PinnedCards
      cardRef={{ current: null }}
      metas={{ RPM: { label: 'RPM', precision: 0, order: 0 } }}
      cards={[{ name: 'RPM', wide: true }]}
      editing={false}
      onEdit={vi.fn()}
      onCards={vi.fn()}
    />,
  )

  const card = screen.getByTitle('RPM')
  expect(card).toHaveTextContent('8500')
  expect(card.style.borderColor).toBe('rgb(13, 242, 13)')

  act(() => {
    mockState.status = { startedAt: 0, state: 'stopped' }
    for (const fn of mockState.listeners) fn()
  })
  expect(card.style.borderColor).toBe('rgb(182, 10, 10)')
})
