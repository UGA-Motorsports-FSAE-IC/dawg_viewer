import type { ChannelMeta } from '../../bindings/dawg_viewer/internal/config/models'

export interface CardItem {
  name: string
  wide: boolean
}

export type CardDropPosition = 'before' | 'after'

const KEY = 'dawg.live-cards.v1'

export function defaultCards(metas: Record<string, ChannelMeta | undefined>): CardItem[] {
  return Object.entries(metas)
    .filter((entry): entry is [string, ChannelMeta] => !!entry[1]?.pinned)
    .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
    .map(([name, meta]) => ({ name, wide: !!meta.large }))
}

export function loadCards(
  profile: string,
  metas: Record<string, ChannelMeta | undefined>,
): CardItem[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaultCards(metas)
    const cards = (saved as Record<string, unknown>)[profile]
    if (!Array.isArray(cards)) return defaultCards(metas)
    const names = new Set<string>()
    if (
      !cards.every((card) => {
        if (!card || typeof card !== 'object') return false
        const item = card as Record<string, unknown>
        if (
          typeof item.name !== 'string' ||
          !item.name ||
          typeof item.wide !== 'boolean' ||
          names.has(item.name)
        )
          return false
        names.add(item.name)
        return true
      })
    )
      return defaultCards(metas)
    return cards as CardItem[]
  } catch {
    return defaultCards(metas)
  }
}

export function saveCards(profile: string, cards: CardItem[]) {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    const layouts =
      saved && typeof saved === 'object' && !Array.isArray(saved)
        ? (saved as Record<string, unknown>)
        : {}
    localStorage.setItem(KEY, JSON.stringify({ ...layouts, [profile]: cards }))
  } catch {
    localStorage.setItem(KEY, JSON.stringify({ [profile]: cards }))
  }
}

export function moveCard(cards: CardItem[], from: string, to: string): CardItem[] {
  const source = cards.findIndex((card) => card.name === from)
  const target = cards.findIndex((card) => card.name === to)
  if (source < 0 || target < 0 || source === target) return cards
  const next = [...cards]
  next.splice(target, 0, ...next.splice(source, 1))
  return next
}

export function previewCardMove(
  cards: CardItem[],
  from: string,
  to: string,
  position: CardDropPosition,
): CardItem[] {
  if (from === to) return cards
  const source = cards.findIndex((card) => card.name === from)
  if (source < 0 || !cards.some((card) => card.name === to)) return cards

  const next = cards.filter((card) => card.name !== from)
  const target = next.findIndex((card) => card.name === to)
  next.splice(target + (position === 'after' ? 1 : 0), 0, cards[source])
  return next
}
