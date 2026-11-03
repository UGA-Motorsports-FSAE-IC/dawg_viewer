import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ChannelMeta } from '../../bindings/dawg_viewer/internal/config/models'
import { ChannelList, type ListChannel } from '../components/ChannelList'
import { colorFor, startLive, useChannels, useInfo } from '../live/connection'
import { LivePlotPanel } from '../live/LivePlotPanel'
import { PinnedCards } from '../live/PinnedCards'
import { loadCards, saveCards, type CardItem } from '../live/cardLayout'
import { StatusHeader } from '../live/StatusHeader'
import { liveSync, resumeFollow, showWindow, useFollow } from '../live/follow'
import { layoutReducer, loadPlotLayout, makeLayout, savePlotLayout } from '../state/layout'
import { plotStack, toolbarButton, toolbarButtonActive } from '../ui'

const initialLayout = makeLayout([
  ['RPM', 'TPS1'],
  ['CLT1', 'OilTemp', 'RadTemp'],
  ['AccelX', 'AccelY'],
])

const WINDOWS: [number, string][] = [
  [10, '10 s'],
  [30, '30 s'],
  [60, '1 min'],
  [300, '5 min'],
  [Infinity, 'All'],
]

const NO_CHANNELS: string[] = []
const NO_METAS: Record<string, ChannelMeta | undefined> = {}

export function LiveView() {
  useEffect(startLive, [])
  const info = useInfo()
  const channels = useChannels()
  const metas = info?.channels ?? NO_METAS
  const profile = info?.active ?? ''
  const [cardState, setCardState] = useState<{ profile: string; cards: CardItem[] }>(() => ({
    profile,
    cards: loadCards(profile, metas),
  }))
  const cards = cardState.profile === profile ? cardState.cards : loadCards(profile, metas)
  const [editingCards, setEditingCards] = useState(false)
  const cardsRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLElement>(null)
  const [layout, dispatch] = useReducer(layoutReducer, profile, (p) =>
    loadPlotLayout(p, initialLayout),
  )
  const layoutProfileRef = useRef(profile)
  if (cardState.profile !== profile) {
    setCardState({ profile, cards: loadCards(profile, metas) })
    setEditingCards(false)
  }
  useEffect(() => {
    if (layoutProfileRef.current !== profile) {
      layoutProfileRef.current = profile
      dispatch({ type: 'setLayout', layout: loadPlotLayout(profile, initialLayout) })
      return
    }
    savePlotLayout(profile, layout)
  }, [profile, layout])
  useEffect(() => {
    if (!editingCards) return
    const finish = (event: PointerEvent) => {
      if (
        cardsRef.current?.contains(event.target as Node) ||
        listRef.current?.contains(event.target as Node)
      )
        return
      saveCards(profile, cards)
      setEditingCards(false)
    }
    document.addEventListener('pointerdown', finish)
    const finishKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || (event.key === 'Enter' && event.target === cardsRef.current)) {
        saveCards(profile, cards)
        setEditingCards(false)
      }
    }
    document.addEventListener('keydown', finishKey)
    return () => {
      document.removeEventListener('pointerdown', finish)
      document.removeEventListener('keydown', finishKey)
    }
  }, [editingCards, cards, profile])
  const updateCards = (next: CardItem[]) => {
    setCardState({ profile, cards: next })
    saveCards(profile, next)
  }
  const activePanel = layout.panels.find((p) => p.id === layout.activeId)

  const { follow, windowS } = useFollow()

  const known = useMemo(() => new Set(channels.map((c) => c.name)), [channels])
  const channelNames = useMemo(() => channels.map((c) => c.name), [channels])
  const listChannels = useMemo<ListChannel[]>(() => {
    const out: ListChannel[] = channels.map((c) => ({
      id: c.name,
      name: metas[c.name]?.label ? `${metas[c.name]?.label} (${c.name})` : c.name,
      group: c.id >= 0 ? 'From device' : 'Computed',
      unit: metas[c.name]?.unit ?? '',
      color: colorFor(c.name),
    }))
    for (const name of Object.keys(metas)) {
      if (known.has(name)) continue
      out.push({
        id: name,
        name: metas[name]?.label ? `${metas[name]?.label} (${name})` : name,
        group: 'From device',
        unit: metas[name]?.unit ?? '',
        color: colorFor(name),
      })
    }
    return out
  }, [channels, known, metas])

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <StatusHeader />
      <div className="flex min-h-0 flex-1">
        <ChannelList
          listRef={listRef}
          cardEditMode={editingCards}
          onSelectCard={(name) => {
            if (!cards.some((card) => card.name === name))
              updateCards([...cards, { name, wide: false }])
          }}
          channels={listChannels}
          selectedIds={activePanel?.channelIds ?? NO_CHANNELS}
          dispatch={dispatch}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <PinnedCards
            cardRef={cardsRef}
            metas={metas}
            channels={channelNames}
            cards={cards}
            editing={editingCards}
            onEdit={() => setEditingCards(true)}
            onCards={updateCards}
          />
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
            {WINDOWS.map(([s, label]) => (
              <button
                key={label}
                type="button"
                className={windowS === s ? toolbarButtonActive : toolbarButton}
                onClick={() => showWindow(s)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className={follow ? toolbarButtonActive : toolbarButton}
              title="Keep the plots on the newest data"
              onClick={resumeFollow}
            >
              {follow ? '● Live' : 'Resume live'}
            </button>
            <button
              type="button"
              className={`${toolbarButton} ml-auto`}
              onClick={() => dispatch({ type: 'addPanel' })}
            >
              Add plot
            </button>
          </div>
          <main className={plotStack}>
            {layout.panels.map((panel, i) => (
              <LivePlotPanel
                key={panel.id}
                panel={panel}
                panels={layout.panels}
                index={i}
                active={panel.id === layout.activeId}
                known={known}
                metas={metas}
                sync={liveSync}
                dispatch={dispatch}
              />
            ))}
          </main>
        </div>
      </div>
    </div>
  )
}
