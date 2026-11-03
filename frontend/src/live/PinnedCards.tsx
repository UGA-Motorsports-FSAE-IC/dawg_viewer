import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { ChannelMeta } from '../../bindings/dawg_viewer/internal/config/models'
import { status, store } from './connection'
import { ageColor, formatValue, level } from './format'
import { moveCard, type CardItem } from './cardLayout'

const LEVEL_BG = {
  ok: 'rgb(24 24 27)',
  warn: 'rgb(120 83 9)',
  crit: 'rgb(127 29 29)',
}

interface CardEls {
  root: HTMLDivElement
  value: HTMLSpanElement
}

export const PinnedCards = memo(function PinnedCards({
  metas,
  channels,
  cards,
  editing,
  onEdit,
  onCards,
  cardRef,
}: {
  metas: Record<string, ChannelMeta | undefined>
  channels?: string[]
  cards: CardItem[]
  editing: boolean
  onEdit: () => void
  onCards: (cards: CardItem[]) => void
  cardRef: React.Ref<HTMLDivElement>
}) {
  const els = useRef(new Map<string, CardEls>())
  const dragged = useRef<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const clearDrag = () => {
    dragged.current = null
    setDropTarget(null)
  }

  const pinned = useMemo(() => new Set(cards.map((c) => c.name)), [cards])

  const allCandidates = useMemo(() => {
    const names = new Set<string>([...(channels ?? []), ...Object.keys(metas)])
    return [...names].sort(
      (a, b) => (metas[a]?.order ?? 999) - (metas[b]?.order ?? 999) || a.localeCompare(b),
    )
  }, [channels, metas])

  const matches = useMemo(() => {
    const trimmed = query.trim()
    if (!trimmed) return []
    const q = trimmed.toLowerCase()
    const filtered = allCandidates.filter((name) => {
      if (pinned.has(name)) return false
      const meta = metas[name]
      return (
        name.toLowerCase().includes(q) ||
        (meta?.label ?? '').toLowerCase().includes(q) ||
        (meta?.unit ?? '').toLowerCase().includes(q)
      )
    })
    if (
      !pinned.has(trimmed) &&
      !filtered.some((name) => name.toLowerCase() === q) &&
      !Array.from(pinned).some((name) => name.toLowerCase() === q)
    ) {
      filtered.push(trimmed)
    }
    return filtered
  }, [allCandidates, metas, pinned, query])

  const addCard = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || pinned.has(trimmed)) return
    onCards([...cards, { name: trimmed, wide: false }])
    setQuery('')
  }

  useEffect(() => {
    const update = () => {
      const startedAt = status.get().startedAt
      const now = startedAt ? (Date.now() - startedAt) / 1000 : undefined
      for (const { name } of cards) {
        const meta = metas[name]
        const el = els.current.get(name)
        if (!el) continue
        const v = store.latest(name)
        const at = store.lastUpdate(name)
        el.value.textContent = formatValue(v, meta)
        el.root.style.background = LEVEL_BG[level(v, meta)]
        el.root.style.borderColor = ageColor(
          now !== undefined && at !== undefined ? now - at : undefined,
        )
      }
    }
    update()
    const off = store.subscribe(update)
    const timer = setInterval(update, 500)
    return () => {
      off()
      clearInterval(timer)
    }
  }, [cards, metas])

  return (
    <div
      ref={cardRef}
      aria-label="Live value cards"
      onDoubleClick={onEdit}
      className={`shrink-0 border-b border-zinc-800 p-2 ${editing ? 'ring-1 ring-red-500 ring-inset' : ''}`}
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
        {cards.map(({ name, wide }, index) => {
          const meta = metas[name]
          const sourceIndex = cards.findIndex((card) => card.name === dragged.current)
          const dropSide =
            dropTarget === name && sourceIndex !== -1
              ? sourceIndex < index
                ? 'right'
                : 'left'
              : null
          return (
            <div
              key={name}
              draggable={editing}
              onDragStart={(event) => {
                dragged.current = name
                setDropTarget(null)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(event) => {
                if (editing && dragged.current && dragged.current !== name) {
                  event.preventDefault()
                  if (dropTarget !== name) setDropTarget(name)
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragged.current) onCards(moveCard(cards, dragged.current, name))
                clearDrag()
              }}
              onDragEnd={clearDrag}
              onDoubleClick={(event) => {
                if (!editing) return
                event.stopPropagation()
                onCards(
                  cards.map((card) => (card.name === name ? { ...card, wide: !card.wide } : card)),
                )
              }}
              ref={(root) => {
                const value = root?.querySelector<HTMLSpanElement>('[data-value]')
                if (root && value) els.current.set(name, { root, value })
                else els.current.delete(name)
              }}
              className={`relative flex min-w-0 flex-col rounded-lg border-2 px-3 py-1.5 transition-colors ${
                wide ? 'col-span-2' : ''
              } ${editing && dragged.current === name ? 'opacity-40' : ''} ${
                dropSide === 'left'
                  ? 'after:pointer-events-none after:absolute after:top-0 after:-left-1.5 after:h-full after:w-1 after:rounded-full after:bg-red-500'
                  : dropSide === 'right'
                    ? 'after:pointer-events-none after:absolute after:top-0 after:-right-1.5 after:h-full after:w-1 after:rounded-full after:bg-red-500'
                    : ''
              }`}
              style={{ borderColor: ageColor(undefined), background: LEVEL_BG.ok }}
              title={name}
            >
              <span className="flex items-center justify-between gap-1 text-xs text-zinc-400">
                <span className="truncate">{meta?.label || name}</span>
                {editing && (
                  <button
                    type="button"
                    aria-label={`Remove ${name} card`}
                    onClick={() => onCards(cards.filter((card) => card.name !== name))}
                  >
                    ×
                  </button>
                )}
              </span>
              <span className="flex items-baseline gap-1">
                <span
                  data-value
                  className={`font-semibold text-zinc-50 tabular-nums ${wide ? 'text-4xl' : 'text-2xl'}`}
                >
                  --
                </span>
                {meta?.unit && <span className="text-sm text-zinc-500">{meta.unit}</span>}
              </span>
              {editing && (
                <div className="flex gap-2 text-xs text-zinc-400">
                  <button
                    type="button"
                    aria-label={`Move ${name} left`}
                    disabled={index === 0}
                    onClick={() => onCards(moveCard(cards, name, cards[index - 1].name))}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${name} right`}
                    disabled={index === cards.length - 1}
                    onClick={() => onCards(moveCard(cards, name, cards[index + 1].name))}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    aria-label={`Toggle ${name} width`}
                    onClick={() =>
                      onCards(
                        cards.map((card) =>
                          card.name === name ? { ...card, wide: !card.wide } : card,
                        ),
                      )
                    }
                  >
                    Width
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          <input
            type="search"
            aria-label="Search data points"
            placeholder="Search data points to add…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && matches.length > 0) {
                event.preventDefault()
                event.stopPropagation()
                addCard(matches[0])
              } else if (event.key === 'Escape' && query) {
                event.stopPropagation()
                setQuery('')
              }
            }}
            className="w-48 max-w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-red-500"
            autoComplete="off"
            spellCheck={false}
          />
          {query.trim() !== '' &&
            (matches.length > 0 ? (
              <div
                role="listbox"
                aria-label="Matching data points"
                className="flex flex-wrap items-center gap-1"
              >
                {matches.map((name) => {
                  const meta = metas[name]
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-label={`Add ${name} card`}
                      onClick={() => addCard(name)}
                      className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-200 hover:border-red-500 hover:bg-zinc-800"
                    >
                      <span>{meta?.label ? `${meta.label} (${name})` : `+ ${name}`}</span>
                      {meta?.unit && <span className="text-zinc-500">{meta.unit}</span>}
                    </button>
                  )
                })}
              </div>
            ) : (
              <span className="text-xs text-zinc-500">Already pinned</span>
            ))}
        </div>
        <div className="text-right text-[10px] text-zinc-500">
          {editing ? (
            'Click outside to save · Double click a card to resize'
          ) : (
            <button type="button" onClick={onEdit}>
              Double click to edit
            </button>
          )}
        </div>
      </div>
    </div>
  )
})
