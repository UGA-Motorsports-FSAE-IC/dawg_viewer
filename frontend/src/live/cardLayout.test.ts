import { beforeEach, expect, it } from 'vitest'
import { defaultCards, loadCards, moveCard, saveCards } from './cardLayout'

beforeEach(() => localStorage.clear())

const metas = {
  RPM: { pinned: true, large: true, order: 0 },
  VSS: { pinned: true, order: 1 },
  TPS1: { order: 2 },
}

it('uses profile defaults and saves separate layouts per profile', () => {
  expect(defaultCards(metas)).toEqual([
    { name: 'RPM', wide: true },
    { name: 'VSS', wide: false },
  ])
  saveCards('car-a', [{ name: 'TPS1', wide: true }])
  expect(loadCards('car-a', metas)).toEqual([{ name: 'TPS1', wide: true }])
  expect(loadCards('car-b', metas)).toEqual(defaultCards(metas))
  saveCards('car-b', [])
  expect(loadCards('car-b', metas)).toEqual([])
  expect(loadCards('car-a', metas)).toEqual([{ name: 'TPS1', wide: true }])
})

it('rejects malformed cards and moves a card to its drop target', () => {
  localStorage.setItem(
    'dawg.live-cards.v1',
    JSON.stringify({
      car: [
        { name: 'RPM', wide: false },
        { name: 'RPM', wide: true },
      ],
    }),
  )
  expect(loadCards('car', metas)).toEqual(defaultCards(metas))
  expect(
    moveCard(
      [
        { name: 'RPM', wide: false },
        { name: 'VSS', wide: false },
      ],
      'VSS',
      'RPM',
    ).map((card) => card.name),
  ).toEqual(['VSS', 'RPM'])
})
