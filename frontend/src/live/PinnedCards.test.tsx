import { expect, it, vi } from 'vitest'
import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
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

function dragOverAt(element: Element, clientX: number) {
  const event = createEvent.dragOver(element)
  Object.defineProperty(event, 'clientX', { value: clientX })
  fireEvent(element, event)
}

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
  const rpm = screen.getByTitle('RPM')
  vi.spyOn(rpm, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width: 100,
  } as DOMRect)
  dragOverAt(rpm, 10)
  const phantom = screen.getByTestId('card-drop-phantom')
  expect(phantom).toHaveAttribute('data-card-name', 'VSS')
  expect(phantom.className).toContain('col-span-1')
  expect(
    [...view.container.querySelectorAll('[data-card-name]')].map((card) =>
      card.getAttribute('data-card-name'),
    ),
  ).toEqual(['VSS', 'RPM'])
  fireEvent.drop(phantom)
  expect(cards.map((card) => card.name)).toEqual(['VSS', 'RPM'])
  expect(screen.queryByTestId('card-drop-phantom')).not.toBeInTheDocument()

  fireEvent.dragStart(screen.getByTitle('VSS'), { dataTransfer: { effectAllowed: '' } })
  const nextRpm = screen.getByTitle('RPM')
  vi.spyOn(nextRpm, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width: 100,
  } as DOMRect)
  dragOverAt(nextRpm, 90)
  expect(
    [...view.container.querySelectorAll('[data-card-name]')].map((card) =>
      card.getAttribute('data-card-name'),
    ),
  ).toEqual(['RPM', 'VSS'])
  fireEvent.dragEnd(screen.getByTestId('card-drop-phantom'))
  expect(screen.queryByTestId('card-drop-phantom')).not.toBeInTheDocument()
  expect(cards.map((card) => card.name)).toEqual(['VSS', 'RPM'])

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

it('keeps a wide card wide in its phantom and clears the preview when leaving the grid', () => {
  const cards: CardItem[] = [
    { name: 'RPM', wide: true },
    { name: 'VSS', wide: false },
  ]
  render(
    <PinnedCards
      cardRef={{ current: null }}
      metas={{}}
      cards={cards}
      editing
      onEdit={vi.fn()}
      onCards={vi.fn()}
    />,
  )

  fireEvent.dragStart(screen.getByTitle('RPM'), { dataTransfer: { effectAllowed: '' } })
  const target = screen.getByTitle('VSS')
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width: 100,
  } as DOMRect)
  dragOverAt(target, 10)
  const phantom = screen.getByTestId('card-drop-phantom')
  expect(phantom).toHaveClass('col-span-2')
  fireEvent.dragLeave(phantom.parentElement!, { relatedTarget: null })
  expect(screen.queryByTestId('card-drop-phantom')).not.toBeInTheDocument()
  expect(screen.getByTitle('RPM')).toHaveClass('opacity-40')
  fireEvent.dragEnd(screen.getByTitle('RPM'))
  expect(screen.getByTitle('RPM')).not.toHaveClass('opacity-40')
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
