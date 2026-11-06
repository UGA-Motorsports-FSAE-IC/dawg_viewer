import { useRef, useState, type Dispatch, type ReactNode } from 'react'
import {
  clampHeight,
  clearPlotDrag,
  detectDropZone,
  getDrag,
  joinTarget,
  setRowDrag,
  type DropZone,
  type Layout,
  type LayoutAction,
  type Panel,
} from '../state/layout'
import { plotStack } from '../ui'
import type { PanelContext } from './PanelControls'

type Indicator =
  | {
      kind: 'plot'
      targetId: number
      zone: DropZone
      left: number
      top: number
      width: number
      height: number
    }
  | { kind: 'row'; insertAt: number; top: number }

const BAR = 6

function sameIndicator(a: Indicator | null, b: Indicator | null): boolean {
  if (!a || !b) return a === b
  if (a.kind === 'row' && b.kind === 'row') return a.insertAt === b.insertAt
  if (a.kind === 'plot' && b.kind === 'plot') return a.targetId === b.targetId && a.zone === b.zone
  return false
}

export function PlotStack({
  layout,
  dispatch,
  renderPanel,
}: {
  layout: Layout
  dispatch: Dispatch<LayoutAction>
  renderPanel: (panel: Panel, index: number, context: PanelContext) => ReactNode
}) {
  const innerRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<Indicator | null>(null)
  const byId = new Map(layout.panels.map((p) => [p.id, p]))
  let index = 0

  const clear = () => {
    clearPlotDrag()
    setIndicator(null)
  }

  const relative = (rect: DOMRect) => {
    const origin = innerRef.current?.getBoundingClientRect()
    return {
      left: rect.left - (origin?.left ?? 0),
      top: rect.top - (origin?.top ?? 0),
      width: rect.width,
      height: rect.height,
    }
  }

  const update = (next: Indicator | null) => {
    setIndicator((prev) => (sameIndicator(prev, next) ? prev : next))
  }

  const startResize = (event: React.PointerEvent<HTMLDivElement>, rowId: number) => {
    const rowEl = event.currentTarget.previousElementSibling as HTMLElement | null
    if (!rowEl) return
    event.preventDefault()
    const startY = event.clientY
    const startH =
      rowEl.getBoundingClientRect().height || layout.rows.find((r) => r.id === rowId)!.height
    let height = startH
    let frame = 0
    const onMove = (e: PointerEvent) => {
      height = clampHeight(startH + e.clientY - startY)
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0
          rowEl.style.height = `${height}px`
        })
    }
    const onUp = () => {
      if (frame) cancelAnimationFrame(frame)
      rowEl.style.height = `${height}px`
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      dispatch({ type: 'setRowHeight', rowId, height })
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  const onDragOver = (event: React.DragEvent<HTMLElement>) => {
    const drag = getDrag()
    if (!drag) return
    event.preventDefault()
    const target = event.target as Element
    if (drag.kind === 'plot') {
      const panelEl = target.closest?.('[data-panel-id]')
      if (!panelEl) return
      const targetId = Number(panelEl.getAttribute('data-panel-id'))
      if (targetId === drag.id) return update(null)
      const rect = panelEl.getBoundingClientRect()
      const rx = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5
      const ry = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5
      const zone = detectDropZone(Math.max(0, Math.min(1, rx)), Math.max(0, Math.min(1, ry)))
      const row = layout.rows.find((r) => r.panelIds.includes(targetId))
      const effective =
        (zone === 'left' || zone === 'right') && row?.panelIds.length === 2 ? 'swap' : zone
      const box = relative(rect)
      if (effective === 'top' || effective === 'bottom') {
        const rowEl = panelEl.closest('[data-row-id]') ?? panelEl
        const rowBox = relative(rowEl.getBoundingClientRect())
        const top =
          effective === 'top' ? rowBox.top - BAR / 2 : rowBox.top + rowBox.height + BAR / 2
        return update({
          kind: 'plot',
          targetId,
          zone: effective,
          left: rowBox.left,
          top: top - 2,
          width: rowBox.width,
          height: 4,
        })
      }
      if (effective === 'left' || effective === 'right') {
        const half = box.width / 2
        return update({
          kind: 'plot',
          targetId,
          zone: effective,
          left: box.left + (effective === 'right' ? half : 0),
          top: box.top,
          width: half,
          height: box.height,
        })
      }
      return update({ kind: 'plot', targetId, zone: 'swap', ...box })
    }
    const rowEls = Array.from(
      innerRef.current?.querySelectorAll<HTMLElement>('[data-row-id]') ?? [],
    )
    let insertAt = rowEls.length
    for (let i = 0; i < rowEls.length; i++) {
      const rect = rowEls[i].getBoundingClientRect()
      if (event.clientY < rect.top + rect.height / 2) {
        insertAt = i
        break
      }
    }
    const edge =
      rowEls[insertAt]?.getBoundingClientRect() ?? rowEls[insertAt - 1]?.getBoundingClientRect()
    const origin = innerRef.current?.getBoundingClientRect()
    const top = edge ? (insertAt < rowEls.length ? edge.top : edge.bottom) - (origin?.top ?? 0) : 0
    update({ kind: 'row', insertAt, top })
  }

  const onDrop = (event: React.DragEvent<HTMLElement>) => {
    const drag = getDrag()
    if (!drag || !indicator) return clear()
    event.preventDefault()
    if (drag.kind === 'plot' && indicator.kind === 'plot') {
      dispatch({
        type: 'dropPanel',
        panelId: drag.id,
        targetId: indicator.targetId,
        zone: indicator.zone,
      })
    } else if (drag.kind === 'row' && indicator.kind === 'row') {
      const from = layout.rows.findIndex((r) => r.id === drag.id)
      const toIndex = indicator.insertAt > from ? indicator.insertAt - 1 : indicator.insertAt
      dispatch({ type: 'moveRow', rowId: drag.id, toIndex })
    }
    clear()
  }

  return (
    <main
      className={`${plotStack} relative`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={clear}
    >
      <div ref={innerRef} className="relative">
        {layout.rows.map((row) => {
          const paired = row.panelIds.length === 2
          return (
            <div key={row.id}>
              <div data-row-id={row.id} className="flex gap-1.5" style={{ height: row.height }}>
                {paired && (
                  <div
                    draggable
                    title="Drag to move both plots"
                    aria-label="Drag row"
                    onDragStart={(event) => {
                      setRowDrag(row.id)
                      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
                    }}
                    className="w-2 shrink-0 cursor-grab rounded bg-zinc-800 hover:bg-red-500/50"
                  />
                )}
                {row.panelIds.map((id) => {
                  const panel = byId.get(id)
                  if (!panel) return null
                  const i = index++
                  return (
                    <div key={id} className="h-full min-w-0 flex-1">
                      {renderPanel(panel, i, {
                        paired,
                        canJoin: joinTarget(layout.rows, id) !== undefined,
                      })}
                    </div>
                  )
                })}
              </div>
              <div
                role="separator"
                aria-label="Resize row"
                title="Drag to change height"
                onPointerDown={(event) => startResize(event, row.id)}
                className="cursor-ns-resize hover:bg-red-500/40"
                style={{ height: BAR }}
              />
            </div>
          )
        })}
        {indicator && (
          <div
            data-testid="drop-indicator"
            className="pointer-events-none absolute z-30 rounded bg-red-500/30 ring-2 ring-red-400"
            style={
              indicator.kind === 'plot'
                ? {
                    left: indicator.left,
                    top: indicator.top,
                    width: indicator.width,
                    height: indicator.height,
                  }
                : { left: 0, right: 0, top: indicator.top - 2, height: 4 }
            }
          />
        )}
      </div>
    </main>
  )
}
