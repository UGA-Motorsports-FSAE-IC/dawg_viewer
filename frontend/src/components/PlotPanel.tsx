import { memo, useEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import type { Session } from '../data/session'
import { mountPlot } from '../plot/mountPlot'
import type { ViewSync } from '../plot/sync'
import {
  clearPlotDrag,
  detectSnapZone,
  getPlotDrag,
  panelColSpan,
  panelRowSpan,
  setPlotDrag,
  type BentoSpan,
  type LayoutAction,
  type Panel,
  type SnapZone,
} from '../state/layout'
import { bentoPanelClass } from '../ui'

interface Props {
  panel: Panel
  panels?: Panel[]
  index: number
  active: boolean
  session: Session
  sync: ViewSync
  dispatch: Dispatch<LayoutAction>
}

const NO_VALUE = '–'

export const PlotPanel = memo(function PlotPanel({
  panel,
  panels,
  index,
  active,
  session,
  sync,
  dispatch,
}: Props) {
  const sectionRef = useRef<HTMLElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const valueEls = useRef(new Map<string, HTMLSpanElement>())
  const [isDragging, setIsDragging] = useState(false)
  const [snapZone, setSnapZone] = useState<SnapZone | null>(null)

  const totalPanels = panels?.length ?? 2
  const colSpan = panelColSpan(panel, totalPanels)
  const rowSpan = panelRowSpan(panel)
  const prevId = panels && index > 0 ? panels[index - 1]?.id : undefined
  const nextId = panels && index < panels.length - 1 ? panels[index + 1]?.id : undefined

  const channels = useMemo(
    () => panel.channelIds.flatMap((id) => session.byId.get(id) ?? []),
    [panel.channelIds, session],
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host || channels.length === 0) return
    const { time } = session
    const plot = mountPlot(host, {
      series: channels,
      data: [time, ...channels.map((ch) => ch.data)],
      sync,
      bounds: () => [time[0], time[time.length - 1]],
      minSpan: (time[1] - time[0]) * 10,
      onCursor: (idx) => {
        for (const ch of channels) {
          const el = valueEls.current.get(ch.id)
          if (el) el.textContent = idx == null ? NO_VALUE : ch.data[idx].toFixed(ch.precision)
        }
      },
    })
    return plot.destroy
  }, [channels, session, sync])

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      let nextCol: BentoSpan | undefined
      let nextRow: BentoSpan | undefined
      if (dx > 40) nextCol = 2
      else if (dx < -40) nextCol = 1
      if (dy > 40) nextRow = 2
      else if (dy < -40) nextRow = 1
      if (nextCol !== undefined || nextRow !== undefined) {
        dispatch({ type: 'resizePanel', panelId: panel.id, colSpan: nextCol, rowSpan: nextRow })
      }
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  return (
    <section
      ref={sectionRef}
      aria-label={`Plot ${index + 1}`}
      data-snap={snapZone ?? undefined}
      draggable
      onDragStart={(event) => {
        setPlotDrag(panel.id, index)
        setIsDragging(true)
        setSnapZone(null)
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={(event) => {
        const drag = getPlotDrag()
        if (!drag || drag.id === panel.id) return
        event.preventDefault()
        const rect = sectionRef.current?.getBoundingClientRect() ?? {
          left: 0,
          top: 0,
          width: 0,
          height: 0,
        }
        const zone = detectSnapZone(event.clientX, event.clientY, rect, drag.index, index)
        if (snapZone !== zone) setSnapZone(zone)
      }}
      onDragLeave={() => setSnapZone(null)}
      onDrop={(event) => {
        event.preventDefault()
        const drag = getPlotDrag()
        if (drag && drag.id !== panel.id) {
          const rect = sectionRef.current?.getBoundingClientRect() ?? {
            left: 0,
            top: 0,
            width: 0,
            height: 0,
          }
          const zone =
            snapZone ?? detectSnapZone(event.clientX, event.clientY, rect, drag.index, index)
          dispatch({ type: 'movePanel', fromId: drag.id, toId: panel.id, snap: zone })
        }
        setSnapZone(null)
        setIsDragging(false)
        clearPlotDrag()
      }}
      onDragEnd={() => {
        setSnapZone(null)
        setIsDragging(false)
        clearPlotDrag()
      }}
      className={bentoPanelClass(active, colSpan, rowSpan, isDragging, snapZone)}
      onPointerDown={() => dispatch({ type: 'setActive', panelId: panel.id })}
    >
      <header className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1 text-xs">
        <span className="shrink-0 cursor-grab text-zinc-500" title="Drag to move and snap plot">
          Plot {index + 1}
        </span>
        <ul className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1">
          {channels.map((ch) => (
            <li key={ch.id} className="group flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: ch.color }} />
              <span className="text-zinc-300">{ch.name}</span>
              <span
                ref={(el) => {
                  if (el) valueEls.current.set(ch.id, el)
                  else valueEls.current.delete(ch.id)
                }}
                className="min-w-12 text-right text-zinc-100 tabular-nums"
              >
                {NO_VALUE}
              </span>
              <span className="text-zinc-500">{ch.unit}</span>
              <button
                type="button"
                aria-label={`Remove ${ch.name}`}
                className="text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-zinc-200 focus-visible:opacity-100"
                onClick={() =>
                  dispatch({ type: 'removeChannel', panelId: panel.id, channelId: ch.id })
                }
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="flex shrink-0 items-center gap-1.5">
          {panels && panels.length > 1 && (
            <>
              <button
                type="button"
                aria-label={`Move plot ${index + 1} left`}
                disabled={prevId === undefined}
                className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                onClick={() =>
                  prevId !== undefined &&
                  dispatch({ type: 'movePanel', fromId: panel.id, toId: prevId })
                }
              >
                ←
              </button>
              <button
                type="button"
                aria-label={`Move plot ${index + 1} right`}
                disabled={nextId === undefined}
                className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                onClick={() =>
                  nextId !== undefined &&
                  dispatch({ type: 'movePanel', fromId: panel.id, toId: nextId })
                }
              >
                →
              </button>
            </>
          )}
          <button
            type="button"
            aria-label={`Toggle plot ${index + 1} width`}
            aria-pressed={colSpan === 2}
            className={`rounded px-1 text-[11px] ${
              colSpan === 2 ? 'bg-red-500/20 text-red-300' : 'text-zinc-500 hover:text-zinc-200'
            }`}
            onClick={() => dispatch({ type: 'togglePanelWidth', panelId: panel.id })}
          >
            Wide
          </button>
          <button
            type="button"
            aria-label={`Toggle plot ${index + 1} height`}
            aria-pressed={rowSpan === 2}
            className={`rounded px-1 text-[11px] ${
              rowSpan === 2 ? 'bg-red-500/20 text-red-300' : 'text-zinc-500 hover:text-zinc-200'
            }`}
            onClick={() => dispatch({ type: 'togglePanelHeight', panelId: panel.id })}
          >
            Tall
          </button>
          <button
            type="button"
            aria-label={`Close plot ${index + 1}`}
            className="text-zinc-600 hover:text-zinc-200"
            onClick={() => dispatch({ type: 'removePanel', panelId: panel.id })}
          >
            ✕
          </button>
        </div>
      </header>

      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        {channels.length === 0 ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-zinc-600">
            Pick channels from the list to plot them here
          </p>
        ) : (
          <div ref={hostRef} className="absolute inset-0" />
        )}
      </div>
      <div
        role="separator"
        aria-label={`Resize plot ${index + 1}`}
        title="Drag to snap plot size"
        onPointerDown={startResize}
        onDoubleClick={() => dispatch({ type: 'togglePanelWidth', panelId: panel.id })}
        className="absolute right-0 bottom-0 z-10 size-3 cursor-nwse-resize border-r-2 border-b-2 border-zinc-700 hover:border-red-500"
      />
    </section>
  )
})
