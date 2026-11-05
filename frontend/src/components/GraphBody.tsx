import { useEffect, useRef, useState, type Dispatch, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { LayoutAction, Panel } from '../state/layout'

const TYPES = [
  { type: 'timeSeries', label: 'Time series' },
  { type: 'histogram', label: 'Histogram' },
] as const

export function GraphBody({
  panel,
  dispatch,
  children,
}: {
  panel: Panel
  dispatch: Dispatch<LayoutAction>
  children: ReactNode
}) {
  const body = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!position) return
    const close = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setPosition(null)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPosition(null)
    }
    const dismiss = () => setPosition(null)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [position])
  return (
    <div
      ref={body}
      tabIndex={0}
      aria-label={`Graph options for plot ${panel.id}`}
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden outline-none"
      onContextMenu={(event) => {
        event.preventDefault()
        setPosition({ x: event.clientX, y: event.clientY })
      }}
      onKeyDown={(event) => {
        if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
          event.preventDefault()
          const rect = body.current?.getBoundingClientRect()
          if (rect) setPosition({ x: rect.left + 16, y: rect.top + 16 })
        }
      }}
    >
      {children}
      {position &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label="Graph type"
            className="fixed z-50 min-w-40 rounded border border-zinc-700 bg-zinc-900 p-1 text-sm text-zinc-100 shadow-xl"
            style={{
              left: Math.max(0, Math.min(position.x, window.innerWidth - 180)),
              top: Math.max(
                0,
                Math.min(
                  position.y,
                  window.innerHeight - (panel.graph?.type === 'histogram' ? 200 : 100),
                ),
              ),
            }}
          >
            {TYPES.map(({ type, label }) => (
              <button
                key={type}
                type="button"
                role="menuitemradio"
                aria-checked={(panel.graph?.type ?? 'timeSeries') === type}
                className="block w-full rounded px-2 py-1 text-left hover:bg-zinc-700"
                onClick={() => {
                  dispatch({ type: 'setGraphType', panelId: panel.id, graphType: type })
                  setPosition(null)
                }}
              >
                {(panel.graph?.type ?? 'timeSeries') === type ? '✓ ' : '　'}
                {label}
              </button>
            ))}
            {panel.graph?.type === 'histogram' && (
              <div className="mt-1 border-t border-zinc-700 p-1">
                <label className="flex items-center gap-2">
                  Bins
                  <input
                    aria-label="Histogram bins"
                    type="number"
                    min={5}
                    max={200}
                    value={panel.graph.bins}
                    className="w-16 rounded bg-zinc-800 px-1"
                    onChange={(event) =>
                      dispatch({
                        type: 'setHistogramBins',
                        panelId: panel.id,
                        bins: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
