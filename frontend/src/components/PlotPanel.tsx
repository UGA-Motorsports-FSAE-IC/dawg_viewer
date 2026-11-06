import { memo, useEffect, useMemo, useRef, type Dispatch } from 'react'
import type { Session } from '../data/session'
import { mountPlot } from '../plot/mountPlot'
import { Histogram } from '../plot/HistogramGraph'
import { GraphBody } from './GraphBody'
import { streamColor, useStreamColors } from '../data/streamColors'
import type { ViewSync } from '../plot/sync'
import { setPlotDrag, type LayoutAction, type Panel } from '../state/layout'
import { plotPanelClass } from '../ui'
import { PanelControls, type PanelContext } from './PanelControls'

interface Props {
  panel: Panel
  context: PanelContext
  index: number
  active: boolean
  session: Session
  sync: ViewSync
  dispatch: Dispatch<LayoutAction>
}

const NO_VALUE = '–'

export const PlotPanel = memo(function PlotPanel({
  panel,
  context,
  index,
  active,
  session,
  sync,
  dispatch,
}: Props) {
  useStreamColors()
  const hostRef = useRef<HTMLDivElement>(null)
  const valueEls = useRef(new Map<string, HTMLSpanElement>())

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
          <PanelControls panelId={panel.id} index={index} context={context} dispatch={dispatch} />
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
    </section>
  )
})
