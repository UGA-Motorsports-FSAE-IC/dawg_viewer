import { useState, type Dispatch, type ReactNode } from 'react'
import { clearPlotDrag, getPlotDrag, panelColSpan, type LayoutAction, type Panel } from '../state/layout'
import { assignPlotSlots, plotRowCount, previewPlotPlacement, type PlotSlot } from '../state/plotSlots'
import { plotStack } from '../ui'

const GAP = 6
const ROW = 192

export function PlotStack({ panels, dispatch, renderPanel }: {
  panels: Panel[]
  dispatch: Dispatch<LayoutAction>
  renderPanel: (panel: Panel, index: number) => ReactNode
}) {
  const [sourceId, setSourceId] = useState<number | null>(null)
  const [hover, setHover] = useState<PlotSlot | null>(null)
  const placed = assignPlotSlots(panels)
  const preview = sourceId !== null && hover ? previewPlotPlacement(placed, sourceId, hover) : null
  const visible = preview ?? placed
  const maxRow = Math.max(2, ...placed.map((panel) => panel.slot!.row + plotRowCount(panel)),
    ...visible.map((panel) => panel.slot!.row + plotRowCount(panel)))

  const clear = () => { clearPlotDrag(); setSourceId(null); setHover(null) }
  const position = (event: React.DragEvent<HTMLElement>): PlotSlot => {
    const rect = event.currentTarget.getBoundingClientRect()
    const col = Math.max(0, Math.min(1, Math.floor((event.clientX - rect.left - GAP) / ((rect.width - GAP * 3) / 2 + GAP)))) as 0 | 1
    const row = Math.max(0, Math.floor((event.clientY - rect.top + event.currentTarget.scrollTop - GAP) / (ROW + GAP)))
    const source = placed.find((panel) => panel.id === sourceId)
    return { row, col: source && panelColSpan(source, panels.length) === 2 ? 0 : col }
  }

  return <main
    className={`${plotStack} relative`}
    onDragStart={() => {
      const drag = getPlotDrag()
      if (drag && panels.some((panel) => panel.id === drag.id)) {
        setSourceId(drag.id)
        setHover(null)
      }
    }}
    onDragOver={(event) => {
      if (sourceId === null) return
      event.preventDefault()
      const next = position(event)
      if (next.row !== hover?.row || next.col !== hover.col) setHover(next)
    }}
    onDrop={(event) => {
      if (sourceId === null) return
      event.preventDefault()
      if (preview && hover) dispatch({ type: 'placePanel', panelId: sourceId, ...hover })
      clear()
    }}
    onDragEnd={clear}
  >
    <div className="relative min-h-full" style={{ height: `${maxRow * (ROW + GAP)}px` }}>
      {panels.map((panel, index) => {
        const location = visible.find((item) => item.id === panel.id)!.slot!
        return <div key={panel.id} data-testid={sourceId === panel.id && preview ? 'plot-phantom' : undefined}
          className={sourceId === panel.id ? `absolute ${preview ? 'pointer-events-none opacity-60 ring-2 ring-red-400 ring-inset' : 'invisible'}` : 'absolute'}
          style={{ left: `calc(${location.col * 50}% + ${location.col * GAP / 2}px)`, top: `${location.row * (ROW + GAP)}px`, width: panelColSpan(panel, panels.length) === 2 ? '100%' : `calc(50% - ${GAP / 2}px)` }}>
          {renderPanel(panel, index)}
        </div>
      })}
    </div>
  </main>
}
