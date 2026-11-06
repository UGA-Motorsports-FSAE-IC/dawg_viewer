import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useStreamColors } from '../data/streamColors'
import { StreamColorPicker } from './StreamColorPicker'
import type { LayoutAction, Panel } from '../state/layout'

const input =
  'mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-red-500'
const heading = 'mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500'

function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
}: {
  label: string
  value: number
  onCommit: (n: number) => void
  min?: number
  max?: number
}) {
  const [draft, setDraft] = useState(String(value))
  const valid =
    draft.trim() !== '' &&
    Number.isFinite(Number(draft)) &&
    (min === undefined || Number(draft) >= min) &&
    (max === undefined || Number(draft) <= max)
  const commit = () => {
    if (valid) onCommit(Number(draft))
    else setDraft(String(value))
  }
  return (
    <label className="block text-xs text-zinc-400">
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        value={draft}
        className={`${input} ${valid ? '' : 'border-red-500'}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
            e.currentTarget.blur()
          }
          if (e.key === 'Escape') setDraft(String(value))
        }}
      />
    </label>
  )
}

export function GraphBody({
  panel,
  dispatch,
  children,
}: {
  panel: Panel
  dispatch: Dispatch<LayoutAction>
  children: ReactNode
}) {
  useStreamColors()
  const body = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const graph = panel.graph
  useLayoutEffect(() => {
    if (!anchor || !dialog.current) return
    const rect = dialog.current.getBoundingClientRect()
    setPosition({
      x: Math.max(8, Math.min(anchor.x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(anchor.y, window.innerHeight - rect.height - 8)),
    })
  }, [anchor, panel.channelIds.length, graph])
  useEffect(() => {
    if (!anchor) return
    const outside = (event: PointerEvent) => {
      if (!dialog.current?.contains(event.target as Node)) setAnchor(null)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAnchor(null)
    }
    const close = () => setAnchor(null)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [anchor])
  const update = (changes: Record<string, unknown>) =>
    dispatch({ type: 'updateHistogram', panelId: panel.id, changes })
  return (
    <div
      ref={body}
      tabIndex={0}
      aria-label={`Graph options for plot ${panel.id}`}
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden outline-none"
      onContextMenu={(e) => {
        e.preventDefault()
        setAnchor({ x: e.clientX, y: e.clientY })
      }}
      onKeyDown={(e) => {
        if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
          e.preventDefault()
          const rect = body.current?.getBoundingClientRect()
          if (rect) setAnchor({ x: rect.left + 16, y: rect.top + 16 })
        }
      }}
    >
      {children}
      {anchor &&
        createPortal(
          <div
            ref={dialog}
            role="dialog"
            aria-label="Plot settings"
            className="fixed z-50 max-h-[calc(100vh-16px)] w-80 max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-zinc-100 shadow-2xl"
            style={{ left: position.x, top: position.y }}
          >
            <h2 className="mb-3 text-sm font-semibold">Plot settings</h2>
            <section className="border-t border-zinc-800 py-3">
              <h3 className={heading}>Graph type</h3>
              <div className="flex gap-1">
                {(['timeSeries', 'histogram'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={(graph?.type ?? 'timeSeries') === type}
                    className={`flex-1 rounded border px-2 py-1 text-xs ${(graph?.type ?? 'timeSeries') === type ? 'border-red-500 bg-red-500/15' : 'border-zinc-700 hover:bg-zinc-800'}`}
                    onClick={() =>
                      dispatch({ type: 'setGraphType', panelId: panel.id, graphType: type })
                    }
                  >
                    {type === 'timeSeries' ? 'Time series' : 'Histogram'}
                  </button>
                ))}
              </div>
            </section>
            <section className="border-t border-zinc-800 py-3">
              <h3 className={heading}>Data streams</h3>
              {panel.channelIds.length === 0 && (
                <p className="text-xs text-zinc-500">No streams selected</p>
              )}
              {panel.channelIds.map((id) => (
                <StreamColorPicker key={id} id={id} />
              ))}
            </section>
            {graph?.type === 'histogram' && (
              <section className="space-y-3 border-t border-zinc-800 pt-3">
                <h3 className={heading}>Histogram</h3>
                <NumberField
                  label="Bins"
                  value={graph.bins}
                  min={5}
                  max={200}
                  onCommit={(bins) => {
                    if (Number.isInteger(bins)) update({ bins })
                  }}
                />
                <div>
                  <h4 className={heading}>Value range</h4>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={!!graph.valueRange}
                      onChange={(e) =>
                        update({ valueRange: e.target.checked ? { min: 0, max: 1 } : null })
                      }
                    />
                    Custom range
                  </label>
                  {graph.valueRange && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <NumberField
                        label="Minimum"
                        value={graph.valueRange.min}
                        onCommit={(min) =>
                          update({ valueRange: { min, max: graph.valueRange!.max } })
                        }
                      />
                      <NumberField
                        label="Maximum"
                        value={graph.valueRange.max}
                        onCommit={(max) =>
                          update({ valueRange: { min: graph.valueRange!.min, max } })
                        }
                      />
                    </div>
                  )}
                </div>
                <div>
                  <h4 className={heading}>Axes</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-zinc-400">
                      Orientation
                      <select
                        aria-label="Orientation"
                        value={graph.orientation ?? 'vertical'}
                        onChange={(e) => update({ orientation: e.target.value })}
                        className={input}
                      >
                        <option value="vertical">Values on X</option>
                        <option value="horizontal">Values on Y</option>
                      </select>
                    </label>
                    <label className="text-xs text-zinc-400">
                      Frequency
                      <select
                        aria-label="Frequency"
                        value={graph.frequency ?? 'count'}
                        onChange={(e) => update({ frequency: e.target.value })}
                        className={input}
                      >
                        <option value="count">Count</option>
                        <option value="percent">Percent</option>
                      </select>
                    </label>
                  </div>
                  <label className="mt-2 flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={graph.frequencyMax != null}
                      onChange={(e) => update({ frequencyMax: e.target.checked ? 100 : null })}
                    />
                    Custom frequency maximum
                  </label>
                  {graph.frequencyMax != null && (
                    <NumberField
                      label="Frequency maximum"
                      value={graph.frequencyMax}
                      min={0.001}
                      onCommit={(frequencyMax) => update({ frequencyMax })}
                    />
                  )}
                </div>
              </section>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
