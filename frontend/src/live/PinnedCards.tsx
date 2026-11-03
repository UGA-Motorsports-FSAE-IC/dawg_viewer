import { memo, useEffect, useRef, useState } from 'react'
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
  cards,
  editing,
  onEdit,
  onCards,
  cardRef,
}: {
  metas: Record<string, ChannelMeta | undefined>
  cards: CardItem[]
  editing: boolean
  onEdit: () => void
  onCards: (cards: CardItem[]) => void
  cardRef: React.Ref<HTMLDivElement>
}) {
  const els = useRef(new Map<string, CardEls>())
  const dragged = useRef<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const clearDrag = () => {
    dragged.current = null
    setDropTarget(null)
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
      <div className="mt-1 text-right text-[10px] text-zinc-500">
        {editing ? (
          'Click outside to save · Double click a card to resize'
        ) : (
          <button type="button" onClick={onEdit}>
            Double click to edit
          </button>
        )}
      </div>
    </div>
  )
})
