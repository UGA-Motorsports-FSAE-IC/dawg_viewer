import { memo, useEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import type { Session } from '../data/session'
import { mountPlot } from '../plot/mountPlot'
import { Histogram } from '../plot/HistogramGraph'
import { GraphBody } from './GraphBody'
import { streamColor, useStreamColors } from '../data/streamColors'
import type { ViewSync } from '../plot/sync'
import {
  DEFAULT_ROW_HEIGHT,
  computeEdgeResize,
  panelColSpan,
  panelHeightPx,
  panelRowSpan,
  panelWidthPct,
  setPlotDrag,
  type LayoutAction,
  type Panel,
} from '../state/layout'
import { bentoPanelClass, fullSizePanelClass, panelWidthStyle } from '../ui'
import type { PlotLayoutMode } from '../settings/plotLayout'

type ResizeEdge = 'left' | 'right' | 'bottom' | 'corner'

interface Props {
  panel: Panel
  panels?: Panel[]
  slotted?: boolean
  layoutMode: PlotLayoutMode
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
  slotted = false,
  layoutMode,
  index,
  active,
  session,
  sync,
  dispatch,
}: Props) {
  useStreamColors()
  const sectionRef = useRef<HTMLElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const valueEls = useRef(new Map<string, HTMLSpanElement>())
  const [activeEdge, setActiveEdge] = useState<ResizeEdge | null>(null)

  const totalPanels = panels?.length ?? 2
  const colSpan = panelColSpan(panel, totalPanels)
  const widthPct = panelWidthPct(panel, totalPanels)
  const rowSpan = panelRowSpan(panel)
  const heightPx = panelHeightPx(panel) ?? rowSpan * DEFAULT_ROW_HEIGHT
  const prevId = panels && index > 0 ? panels[index - 1]?.id : undefined
  const nextId = panels && index < panels.length - 1 ? panels[index + 1]?.id : undefined

  const channels = useMemo(
    () => panel.channelIds.flatMap((id) => session.byId.get(id) ?? []),
    [panel.channelIds, session],
  )
  const histogramSource = useMemo(
    () => (channels[0] ? { data: () => ({ time: session.time, values: channels[0].data }) } : null),
    [channels, session],
  )

  const colorsKey = panel.channelIds.map(streamColor).join(',')
  useEffect(() => {
    const host = hostRef.current
    if (!host || channels.length === 0 || panel.graph?.type === 'histogram') return
    const { time } = session
    const plot = mountPlot(host, {
      series: channels.map((ch) => ({ ...ch, color: streamColor(ch.id) })),
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
  }, [channels, session, sync, panel.graph?.type, colorsKey])

  const startEdgeResize = (edge: ResizeEdge) => (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const startCol = colSpan
    const startRow = rowSpan
    const startWidthPct = widthPct
    const rect = sectionRef.current?.getBoundingClientRect()
    const startHeightPx = rect && rect.height > 0 ? rect.height : heightPx
    const containerWidthPx =
      (slotted
        ? sectionRef.current?.parentElement?.parentElement
        : sectionRef.current?.parentElement
      )?.clientWidth ?? 0

    setActiveEdge(edge)

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX
      const dy = moveEvent.clientY - startY
      const next = computeEdgeResize(edge, dx, dy, startCol, startRow, {
        startWidthPct,
        startHeightPx,
        containerWidthPx,
      })
      if (sectionRef.current) {
        if (next.widthPct !== undefined) {
          sectionRef.current.style.width = slotted ? '100%' : panelWidthStyle(next.widthPct)
        }
        if (next.height !== undefined) {
          sectionRef.current.style.height = `${next.height}px`
        }
      }
      dispatch({
        type: 'resizePanel',
        panelId: panel.id,
        colSpan: next.colSpan,
        rowSpan: next.rowSpan,
        widthPct: next.widthPct,
        height: next.height,
      })
    }
    const onUp = () => {
      setActiveEdge(null)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  const blockDrag = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <section
      ref={sectionRef}
      aria-label={`Plot ${index + 1}`}
      data-panel-id={panel.id}
      draggable={layoutMode === 'bento' && activeEdge === null}
      style={
        layoutMode === 'bento'
          ? {
              width: slotted ? '100%' : panelWidthStyle(widthPct),
              height: `${heightPx}px`,
            }
          : undefined
      }
      onDragStart={(event) => {
        if (layoutMode !== 'bento' || activeEdge !== null) {
          event.preventDefault()
          return
        }
        setPlotDrag(panel.id, index)
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
      }}
      className={
        layoutMode === 'bento'
          ? bentoPanelClass(active, colSpan, rowSpan)
          : fullSizePanelClass(active)
      }
      onPointerDown={() => dispatch({ type: 'setActive', panelId: panel.id })}
    >
      <header className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1 text-xs">
        <span
          className={`shrink-0 text-zinc-500 ${layoutMode === 'bento' ? 'cursor-grab' : ''}`}
          title={layoutMode === 'bento' ? 'Drag to move plot' : undefined}
        >
          Plot {index + 1}
        </span>
        <ul className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1">
          {channels.map((ch) => (
            <li key={ch.id} className="group flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: streamColor(ch.id) }} />
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
          {layoutMode === 'bento' && panels && panels.length > 1 && (
            <>
              <button
                type="button"
                aria-label={`Move plot ${index + 1} left`}
                disabled={prevId === undefined}
                className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                onClick={() => {
                  const slot = panels?.[index - 1]?.slot
                  if (slot) dispatch({ type: 'placePanel', panelId: panel.id, ...slot })
                }}
              >
                ←
              </button>
              <button
                type="button"
                aria-label={`Move plot ${index + 1} right`}
                disabled={nextId === undefined}
                className="text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                onClick={() => {
                  const slot = panels?.[index + 1]?.slot
                  if (slot) dispatch({ type: 'placePanel', panelId: panel.id, ...slot })
                }}
              >
                →
              </button>
            </>
          )}
          {layoutMode === 'bento' && (
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
          )}
          {layoutMode === 'bento' && (
            <button
              type="button"
              aria-label={`Toggle plot ${index + 1} height`}
              aria-pressed={rowSpan >= 2}
              className={`rounded px-1 text-[11px] ${
                rowSpan >= 2 ? 'bg-red-500/20 text-red-300' : 'text-zinc-500 hover:text-zinc-200'
              }`}
              onClick={() => dispatch({ type: 'togglePanelHeight', panelId: panel.id })}
            >
              Tall
            </button>
          )}
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

      <GraphBody panel={panel} dispatch={dispatch}>
        <div
          draggable
          onDragStart={blockDrag}
          className="relative h-full min-h-0 min-w-0 overflow-hidden"
        >
          {channels.length === 0 ? (
            <p className="absolute inset-0 grid place-items-center text-sm text-zinc-600">
              Pick channels from the list to plot them here
            </p>
          ) : panel.graph?.type === 'histogram' && histogramSource ? (
            <Histogram
              key={channels[0].id}
              source={histogramSource}
              sync={sync}
              bins={panel.graph.bins}
              name={channels[0].name}
              unit={channels[0].unit}
              color={streamColor(channels[0].id)}
              valueRange={panel.graph.valueRange}
              orientation={panel.graph.orientation}
              frequency={panel.graph.frequency}
              frequencyMax={panel.graph.frequencyMax}
            />
          ) : (
            <div ref={hostRef} className="absolute inset-0" />
          )}
        </div>
      </GraphBody>

      {layoutMode === 'bento' && (
        <>
          {/* Left edge drag handle */}
          <div
            role="separator"
            aria-label={`Drag left edge of plot ${index + 1}`}
            data-edge="left"
            title="Drag edge to dynamically resize width"
            draggable
            onDragStart={blockDrag}
            onPointerDown={startEdgeResize('left')}
            onDoubleClick={() => dispatch({ type: 'togglePanelWidth', panelId: panel.id })}
            className={`absolute top-0 bottom-2 left-0 z-10 w-2 cursor-ew-resize transition-colors hover:bg-red-500/40 ${
              activeEdge === 'left' ? 'bg-red-500/60' : ''
            }`}
          />

          {/* Right edge drag handle */}
          <div
            role="separator"
            aria-label={`Drag right edge of plot ${index + 1}`}
            data-edge="right"
            title="Drag edge to dynamically resize width"
            draggable
            onDragStart={blockDrag}
            onPointerDown={startEdgeResize('right')}
            onDoubleClick={() => dispatch({ type: 'togglePanelWidth', panelId: panel.id })}
            className={`absolute top-0 right-0 bottom-2 z-10 w-2 cursor-ew-resize transition-colors hover:bg-red-500/40 ${
              activeEdge === 'right' ? 'bg-red-500/60' : ''
            }`}
          />

          {/* Bottom edge drag handle */}
          <div
            role="separator"
            aria-label={`Drag bottom edge of plot ${index + 1}`}
            data-edge="bottom"
            title="Drag edge to dynamically resize height"
            draggable
            onDragStart={blockDrag}
            onPointerDown={startEdgeResize('bottom')}
            onDoubleClick={() => dispatch({ type: 'togglePanelHeight', panelId: panel.id })}
            className={`absolute right-2 bottom-0 left-0 z-10 h-2 cursor-ns-resize transition-colors hover:bg-red-500/40 ${
              activeEdge === 'bottom' ? 'bg-red-500/60' : ''
            }`}
          />

          {/* Bottom-right corner drag handle */}
          <div
            role="separator"
            aria-label={`Resize plot ${index + 1}`}
            data-edge="corner"
            title="Drag corner to dynamically resize plot"
            draggable
            onDragStart={blockDrag}
            onPointerDown={startEdgeResize('corner')}
            onDoubleClick={() => dispatch({ type: 'togglePanelWidth', panelId: panel.id })}
            className={`absolute right-0 bottom-0 z-20 size-3.5 cursor-nwse-resize border-r-2 border-b-2 transition-colors hover:border-red-500 ${
              activeEdge === 'corner' ? 'border-red-500 bg-red-500/30' : 'border-zinc-600'
            }`}
          />
        </>
      )}
    </section>
  )
})
