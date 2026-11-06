import { memo, useEffect, useMemo, useRef, type Dispatch } from 'react'
import type uPlot from 'uplot'
import type { ChannelMeta } from '../../bindings/dawg_viewer/internal/config/models'
import { mountPlot } from '../plot/mountPlot'
import { Histogram } from '../plot/HistogramGraph'
import { GraphBody } from '../components/GraphBody'
import { useStreamColors } from '../data/streamColors'
import type { ViewSync } from '../plot/sync'
import { setPlotDrag, type LayoutAction, type Panel } from '../state/layout'
import { plotPanelClass } from '../ui'
import { PanelControls, type PanelContext } from '../components/PanelControls'
import { colorFor, store } from './connection'
import { formatValue } from './format'

interface Props {
  panel: Panel
  context: PanelContext
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

const histogramSources = new Map<
  string,
  { data: () => { time: Float64Array; values: Float64Array }; subscribe: typeof store.subscribe }
>()
function liveHistogramSource(name: string) {
  let source = histogramSources.get(name)
  if (!source) {
    source = {
      data: () => ({ time: store.times(), values: store.column(name) ?? new Float64Array(0) }),
      subscribe: (fn) => store.subscribe(fn),
    }
    histogramSources.set(name, source)
  }
  return source
}

export const LivePlotPanel = memo(function LivePlotPanel({
  panel,
  context,
  index,
  active,
  known,
  metas,
  sync,
  dispatch,
}: Props) {
  useStreamColors()
  const hostRef = useRef<HTMLDivElement>(null)
  const valueEls = useRef(new Map<string, HTMLSpanElement>())

  const namesKey = panel.channelIds.filter((n) => known.has(n)).join('\n')
  const names = useMemo(() => (namesKey ? namesKey.split('\n') : []), [namesKey])
  const waiting = panel.channelIds.filter((n) => !known.has(n))

  const colorsKey = names.map(colorFor).join(',')
  useEffect(() => {
    const host = hostRef.current
    if (!host || names.length === 0 || panel.graph?.type === 'histogram') return

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
  }, [names, metas, sync, panel.graph?.type, colorsKey])

  useEffect(() => {
    if (panel.graph?.type !== 'histogram' || names.length === 0) return
    const showLatest = () => {
      for (const name of names) {
        const el = valueEls.current.get(name)
        if (el) el.textContent = formatValue(store.latest(name), metas[name])
      }
    }
    showLatest()
    return store.subscribe(showLatest)
  }, [panel.graph?.type, names, metas])

  const blockDrag = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <section
      aria-label={`Plot ${index + 1}`}
      data-panel-id={panel.id}
      draggable
      onDragStart={(event) => {
        setPlotDrag(panel.id)
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
      }}
      className={plotPanelClass(active)}
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
          <PanelControls panelId={panel.id} index={index} context={context} dispatch={dispatch} />
        </div>
      </header>

      <GraphBody panel={panel} dispatch={dispatch}>
        <div
          draggable
          onDragStart={blockDrag}
          className="relative h-full min-h-0 min-w-0 overflow-hidden"
        >
          {names.length === 0 ? (
            <p className="absolute inset-0 grid place-items-center text-sm text-zinc-600">
              {waiting.length > 0
                ? `Waiting for ${waiting.join(', ')} from the device`
                : 'Pick channels from the list to plot them here'}
            </p>
          ) : panel.graph?.type === 'histogram' ? (
            <Histogram
              key={names[0]}
              source={liveHistogramSource(names[0])}
              sync={sync}
              bins={panel.graph.bins}
              name={metas[names[0]]?.label || names[0]}
              unit={metas[names[0]]?.unit || ''}
              color={colorFor(names[0])}
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
    </section>
  )
})
