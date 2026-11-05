import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import type { Range, ViewSync } from './sync'
import { buildHistogram } from './histogram'

export function Histogram({
  source,
  sync,
  bins,
  name,
  unit,
  color,
}: {
  source: {
    data: () => { time: Float64Array; values: Float64Array }
    subscribe?: (fn: () => void) => () => void
  }
  sync: ViewSync
  bins: number
  name: string
  unit: string
  color: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const info = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return
    let range: Range | null = sync.range()
    const calculate = () => {
      const { time, values } = source.data()
      return buildHistogram(time, values, range, bins)
    }
    const initial = calculate()
    let current = initial
    const plot = new uPlot(
      {
        width: el.clientWidth || 300,
        height: el.clientHeight || 150,
        legend: { show: false },
        scales: { x: { time: false }, y: { range: (u, min, max) => [0, Math.max(1, max ?? 0)] } },
        series: [
          {},
          {
            label: name,
            stroke: color,
            fill: color,
            paths: uPlot.paths.bars!({ size: [0.9, Infinity, 1] }),
          },
        ],
        axes: [
          { label: unit || name, stroke: '#a1a1aa' },
          { label: 'Samples', stroke: '#a1a1aa' },
        ],
        hooks: {
          setCursor: [
            (u) => {
              const i = u.cursor.idx
              if (info.current)
                info.current.textContent =
                  i == null || !current.counts[i]
                    ? `${current.total} samples`
                    : `${current.edges[i].toPrecision(4)}–${current.edges[i + 1].toPrecision(4)}: ${current.counts[i]} samples`
            },
          ],
        },
      },
      [initial.centers, initial.counts],
      el,
    )
    let pending = false
    let frame = 0
    const update = () => {
      if (pending) return
      pending = true
      frame = requestAnimationFrame(() => {
        pending = false
        current = calculate()
        plot.setData([current.centers, current.counts])
        if (info.current) info.current.textContent = `${current.total} samples`
      })
    }
    if (info.current) info.current.textContent = `${initial.total} samples`
    const offRange = sync.onRange((next) => {
      range = next
      update()
    })
    const offData = source.subscribe?.(update)
    const resize = new ResizeObserver(() => {
      if (el.clientWidth && el.clientHeight)
        plot.setSize({ width: el.clientWidth, height: el.clientHeight })
    })
    resize.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      offRange()
      offData?.()
      resize.disconnect()
      plot.destroy()
    }
  }, [source, sync, bins, name, unit, color])
  return (
    <>
      <div ref={host} className="absolute inset-0" />
      <span
        ref={info}
        className="absolute top-1 right-3 rounded bg-zinc-900/80 px-1 text-xs text-zinc-300"
      />
    </>
  )
}
