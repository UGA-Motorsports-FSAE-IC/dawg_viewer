import { memo, useEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import type uPlot from 'uplot'
import type { ChannelMeta } from '../../bindings/dawg_viewer/internal/config/models'
import { mountPlot } from '../plot/mountPlot'
import type { ViewSync } from '../plot/sync'
import {
  DEFAULT_ROW_HEIGHT,
  clearPlotDrag,
  computeEdgeResize,
  detectSnapZone,
  getPlotDrag,
  panelColSpan,
  panelHeightPx,
  panelRowSpan,
  panelWidthPct,
  setPlotDrag,
  type LayoutAction,
  type Panel,
  type SnapZone,
} from '../state/layout'
import { bentoPanelClass, panelWidthStyle } from '../ui'
import { colorFor, store } from './connection'
import { formatValue } from './format'

type ResizeEdge = 'left' | 'right' | 'bottom' | 'corner'

interface Props {
  panel: Panel
  panels?: Panel[]
  index: number
  active: boolean
  known: ReadonlySet<string>
  metas: Record<string, ChannelMeta | undefined>
  sync: ViewSync
  dispatch: Dispatch<LayoutAction>
}

function plotData(names: string[]): uPlot.AlignedData {
  return [store.times(), ...names.map((n) => store.column(n) ?? new Float64Array(store.length))]
}

export const LivePlotPanel = memo(function LivePlotPanel({
  panel,
  panels,
  index,
  active,
  known,
  metas,
  sync,
  dispatch,
}: Props) {
  const sectionRef = useRef<HTMLElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const valueEls = useRef(new Map<string, HTMLSpanElement>())
  const [isDragging, setIsDragging] = useState(false)
  const [snapZone, setSnapZone] = useState<SnapZone | null>(null)
  const [activeEdge, setActiveEdge] = useState<ResizeEdge | null>(null)

  const totalPanels = panels?.length ?? 2
  const colSpan = panelColSpan(panel, totalPanels)
  const widthPct = panelWidthPct(panel, totalPanels)
  const rowSpan = panelRowSpan(panel)
  const heightPx = panelHeightPx(panel) ?? rowSpan * DEFAULT_ROW_HEIGHT
  const prevId = panels && index > 0 ? panels[index - 1]?.id : undefined
  const nextId = panels && index < panels.length - 1 ? panels[index + 1]?.id : undefined

  const namesKey = panel.channelIds.filter((n) => known.has(n)).join('\n')
  const names = useMemo(() => (namesKey ? namesKey.split('\n') : []), [namesKey])
  const waiting = panel.channelIds.filter((n) => !known.has(n))

  useEffect(() => {
    const host = hostRef.current
    if (!host || names.length === 0) return

    let cursorIdx: number | null = null
    const showValues = () => {
      const i = cursorIdx ?? store.length - 1
      for (const n of names) {
        const el = valueEls.current.get(n)
        if (el) el.textContent = formatValue(i >= 0 ? store.column(n)?.[i] : undefined, metas[n])
      }
    }

    const plot = mountPlot(host, {
      series: names.map((n) => ({
        name: metas[n]?.label || n,
        unit: metas[n]?.unit || n,
        color: colorFor(n),
      })),
      data: plotData(names),
      sync,
      bounds: () => store.bounds(),
      minSpan: 0.05,
      onCursor: (idx) => {
        cursorIdx = idx
        showValues()
      },
    })
    showValues()
    const off = store.subscribe(() => {
      plot.u.setData(plotData(names), false)
      showValues()
    })
    return () => {
      off()
      plot.destroy()
    }
  }, [names, metas, sync])

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
    const containerWidthPx = sectionRef.current?.parentElement?.clientWidth ?? 0

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
          sectionRef.current.style.width = panelWidthStyle(next.widthPct)
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
      data-snap={snapZone ?? undefined}
      draggable={activeEdge === null}
      style={{
        width: panelWidthStyle(widthPct),
        height: `${heightPx}px`,
      }}
      onDragStart={(event) => {
        if (activeEdge !== null) {
          event.preventDefault()
          return
        }
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
        <span className="shrink-0 cursor-grab text-zinc-500" title="Drag to move plot">
          Plot {index + 1}
        </span>
        <ul className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1">
          {panel.channelIds.map((n) => (
            <li key={n} className="group flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: colorFor(n) }} />
              <span className={known.has(n) ? 'text-zinc-300' : 'text-zinc-600'}>
                {metas[n]?.label || n}
              </span>
              <span
                ref={(el) => {
                  if (el) valueEls.current.set(n, el)
                  else valueEls.current.delete(n)
                }}
                className="min-w-12 text-right text-zinc-100 tabular-nums"
              >
                --
              </span>
              {metas[n]?.unit && <span className="text-zinc-500">{metas[n]?.unit}</span>}
              <button
                type="button"
                aria-label={`Remove ${n}`}
                className="text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-zinc-200 focus-visible:opacity-100"
                onClick={() => dispatch({ type: 'removeChannel', panelId: panel.id, channelId: n })}
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
            aria-pressed={rowSpan >= 2}
            className={`rounded px-1 text-[11px] ${
              rowSpan >= 2 ? 'bg-red-500/20 text-red-300' : 'text-zinc-500 hover:text-zinc-200'
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

      <div
        draggable
        onDragStart={blockDrag}
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        {names.length === 0 ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-zinc-600">
            {waiting.length > 0
              ? `Waiting for ${waiting.join(', ')} from the device`
              : 'Pick channels from the list to plot them here'}
          </p>
        ) : (
          <div ref={hostRef} className="absolute inset-0" />
        )}
      </div>

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
    </section>
  )
})
