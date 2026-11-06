export type BentoSpan = 1 | 2
import { assignPlotSlots, placePanel } from './plotSlots'
export type BentoRowSpan = 1 | 2 | 3 | 4
export type SnapZone = 'left' | 'right' | 'top' | 'bottom'

export const DEFAULT_ROW_HEIGHT = 192
const MAX_PANEL_STREAMS = 7
export type GraphType = 'timeSeries' | 'histogram'
export type GraphConfig =
  | { type: 'timeSeries' }
  | {
      type: 'histogram'
      bins: number
      valueRange?: { min: number; max: number } | null
      orientation?: 'vertical' | 'horizontal'
      frequency?: 'count' | 'percent'
      frequencyMax?: number | null
    }

export interface Panel {
  id: number
  channelIds: string[]
  graph?: GraphConfig
  slot?: { row: number; col: 0 | 1 }
  colSpan?: BentoSpan
  rowSpan?: BentoRowSpan
  widthPct?: number
  height?: number
}

export interface Layout {
  panels: Panel[]
  activeId: number
  nextId: number
}

export type LayoutAction =
  | { type: 'toggleChannel'; channelId: string }
  | { type: 'removeChannel'; panelId: number; channelId: string }
  | { type: 'addPanel' }
  | { type: 'removePanel'; panelId: number }
  | { type: 'setActive'; panelId: number }
  | { type: 'setGraphType'; panelId: number; graphType: GraphType }
  | { type: 'setHistogramBins'; panelId: number; bins: number }
  | {
      type: 'updateHistogram'
      panelId: number
      changes: Partial<Extract<GraphConfig, { type: 'histogram' }>>
    }
  | { type: 'movePanel'; fromId: number; toId: number; snap?: SnapZone }
  | { type: 'movePanelToIndex'; panelId: number; index: number }
  | { type: 'placePanel'; panelId: number; row: number; col: 0 | 1 }
  | { type: 'togglePanelWidth'; panelId: number }
  | { type: 'togglePanelHeight'; panelId: number }
  | {
      type: 'resizePanel'
      panelId: number
      colSpan?: BentoSpan
      rowSpan?: BentoRowSpan
      widthPct?: number
      height?: number
    }
  | { type: 'setLayout'; layout: Layout }

const PLOT_LAYOUT_KEY = 'dawg.live-plots.v3'
const BENTO_LAYOUT_KEY = 'dawg.live-plots.v1'
const ROW_LAYOUT_KEY = 'dawg.live-plots.v2'

let currentPlotDrag: { id: number; index: number } | null = null

export function setPlotDrag(id: number, index: number) {
  currentPlotDrag = { id, index }
}

export function getPlotDrag() {
  return currentPlotDrag
}

export function clearPlotDrag() {
  currentPlotDrag = null
}

export function makeLayout(panels: string[][]): Layout {
  return {
    panels: assignPlotSlots(
      panels.map((channelIds, i) => ({
        id: i + 1,
        channelIds: channelIds.slice(0, MAX_PANEL_STREAMS),
      })),
    ),
    activeId: 1,
    nextId: panels.length + 1,
  }
}

export function panelColSpan(panel: Panel, totalPanels = 2): BentoSpan {
  if (panel.colSpan) return panel.colSpan
  if (panel.widthPct !== undefined) return panel.widthPct > 75 ? 2 : 1
  return totalPanels === 1 ? 2 : 1
}

export function panelWidthPct(panel: Panel, totalPanels = 2): number {
  if (panel.widthPct !== undefined) return panel.widthPct
  return panelColSpan(panel, totalPanels) === 2 ? 100 : 50
}

export function panelRowSpan(panel: Panel): BentoRowSpan {
  return panel.rowSpan ?? 1
}

export function panelHeightPx(panel: Panel): number | undefined {
  return panel.height
}

export interface EdgeResizeResult {
  colSpan?: BentoSpan
  rowSpan?: BentoRowSpan
  widthPct?: number
  height?: number
}

export function computeEdgeResize(
  edge: 'left' | 'right' | 'bottom' | 'corner',
  dx: number,
  dy: number,
  startCol: BentoSpan,
  startRow: BentoRowSpan,
  opts?: {
    startWidthPct?: number
    startHeightPx?: number
    containerWidthPx?: number
  },
): EdgeResizeResult {
  const result: EdgeResizeResult = {}
  const containerW =
    opts?.containerWidthPx && opts.containerWidthPx > 0 ? opts.containerWidthPx : 160
  const startPct = opts?.startWidthPct ?? (startCol === 2 ? 100 : 50)

  if (edge === 'right' || edge === 'left' || edge === 'corner') {
    const hDelta = edge === 'left' ? -dx : dx
    const deltaPct = (hDelta / containerW) * 100
    const nextPct = Math.max(20, Math.min(100, Number((startPct + deltaPct).toFixed(2))))
    result.widthPct = nextPct
    result.colSpan = nextPct > 75 ? 2 : 1
  }

  if (edge === 'bottom' || edge === 'corner') {
    const startH =
      opts?.startHeightPx && opts.startHeightPx > 0
        ? opts.startHeightPx
        : startRow * DEFAULT_ROW_HEIGHT
    const nextH = Math.max(120, Math.round(startH + dy))
    result.height = nextH
    if (dy >= 30) {
      const addRows = Math.max(1, Math.floor(dy / 160))
      result.rowSpan = Math.min(4, startRow + addRows) as BentoRowSpan
    } else if (dy <= -30) {
      const subRows = Math.max(1, Math.floor(Math.abs(dy) / 160))
      result.rowSpan = Math.max(1, startRow - subRows) as BentoRowSpan
    } else {
      result.rowSpan = startRow
    }
  }

  return result
}

export function detectSnapZone(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  sourceIndex: number,
  targetIndex: number,
): SnapZone {
  if (rect.width <= 0 || rect.height <= 0) {
    return sourceIndex < targetIndex ? 'right' : 'left'
  }
  const rx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  const ry = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
  const distLeft = rx
  const distRight = 1 - rx
  const distTop = ry
  const distBottom = 1 - ry
  const min = Math.min(distLeft, distRight, distTop, distBottom)
  if (min === distLeft) return 'left'
  if (min === distRight) return 'right'
  if (min === distTop) return 'top'
  return 'bottom'
}

function updatePanel(layout: Layout, panelId: number, fn: (ids: string[]) => string[]): Layout {
  return {
    ...layout,
    panels: layout.panels.map((p) =>
      p.id === panelId ? { ...p, channelIds: fn(p.channelIds) } : p,
    ),
  }
}

export function movePanels(
  panels: Panel[],
  fromId: number,
  toId: number,
  snap?: SnapZone,
): Panel[] {
  const sourceIndex = panels.findIndex((p) => p.id === fromId)
  const targetIndex = panels.findIndex((p) => p.id === toId)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return panels

  const next = [...panels]
  const [moved] = next.splice(sourceIndex, 1)

  if (!snap) {
    next.splice(targetIndex, 0, moved)
    return next
  }

  const newTargetIndex = next.findIndex((p) => p.id === toId)
  const insertAt = snap === 'left' || snap === 'top' ? newTargetIndex : newTargetIndex + 1
  const snappedMoved: Panel =
    snap === 'left' || snap === 'right' ? { ...moved, colSpan: 1, widthPct: 50 } : moved
  next.splice(insertAt, 0, snappedMoved)

  if (snap === 'left' || snap === 'right') {
    return next.map((p) => (p.id === toId ? { ...p, colSpan: 1, widthPct: 50 } : p))
  }
  return next
}

export function movePanelToIndex(panels: Panel[], panelId: number, index: number): Panel[] {
  const source = panels.findIndex((panel) => panel.id === panelId)
  if (
    source < 0 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= panels.length ||
    source === index
  )
    return panels
  const next = [...panels]
  next.splice(index, 0, ...next.splice(source, 1))
  return next
}

export function layoutReducer(layout: Layout, action: LayoutAction): Layout {
  switch (action.type) {
    case 'toggleChannel':
      return updatePanel(layout, layout.activeId, (ids) =>
        ids.includes(action.channelId)
          ? ids.filter((id) => id !== action.channelId)
          : layout.panels.find((p) => p.id === layout.activeId)?.graph?.type === 'histogram'
            ? [action.channelId]
            : ids.length < MAX_PANEL_STREAMS
              ? [...ids, action.channelId]
              : ids,
      )
    case 'setGraphType':
      return {
        ...layout,
        panels: layout.panels.map((p) => {
          if (p.id !== action.panelId || (p.graph?.type ?? 'timeSeries') === action.graphType)
            return p
          return action.graphType === 'histogram'
            ? {
                ...p,
                channelIds: p.channelIds.slice(0, 1),
                graph: {
                  type: 'histogram' as const,
                  bins: 30,
                  valueRange: null,
                  orientation: 'vertical' as const,
                  frequency: 'count' as const,
                  frequencyMax: null,
                },
              }
            : { ...p, graph: { type: 'timeSeries' as const } }
        }),
      }
    case 'setHistogramBins':
      if (!Number.isInteger(action.bins) || action.bins < 5 || action.bins > 200) return layout
      return {
        ...layout,
        panels: layout.panels.map((p) =>
          p.id === action.panelId && p.graph?.type === 'histogram'
            ? { ...p, graph: { ...p.graph, bins: action.bins } }
            : p,
        ),
      }
    case 'updateHistogram':
      return {
        ...layout,
        panels: layout.panels.map((p) => {
          if (p.id !== action.panelId || p.graph?.type !== 'histogram') return p
          const next = { ...p.graph, ...action.changes }
          if (!Number.isInteger(next.bins) || next.bins < 5 || next.bins > 200) return p
          if (
            next.valueRange &&
            (!Number.isFinite(next.valueRange.min) ||
              !Number.isFinite(next.valueRange.max) ||
              next.valueRange.min >= next.valueRange.max)
          )
            return p
          if (
            next.frequencyMax != null &&
            (!Number.isFinite(next.frequencyMax) || next.frequencyMax <= 0)
          )
            return p
          if (
            next.orientation &&
            next.orientation !== 'vertical' &&
            next.orientation !== 'horizontal'
          )
            return p
          if (next.frequency && next.frequency !== 'count' && next.frequency !== 'percent') return p
          return { ...p, graph: next }
        }),
      }
    case 'removeChannel':
      return updatePanel(layout, action.panelId, (ids) =>
        ids.filter((id) => id !== action.channelId),
      )
    case 'addPanel':
      return {
        panels: assignPlotSlots([...layout.panels, { id: layout.nextId, channelIds: [] }]),
        activeId: layout.nextId,
        nextId: layout.nextId + 1,
      }
    case 'removePanel': {
      if (layout.panels.length === 1) return updatePanel(layout, action.panelId, () => [])
      const remaining = layout.panels.filter((p) => p.id !== action.panelId)
      const panels = assignPlotSlots(
        remaining.length === 1 ? [{ ...remaining[0], slot: undefined }] : remaining,
      )
      const activeId = layout.activeId === action.panelId ? panels[0].id : layout.activeId
      return { ...layout, panels, activeId }
    }
    case 'setActive':
      return layout.activeId === action.panelId ? layout : { ...layout, activeId: action.panelId }
    case 'movePanel': {
      const panels = movePanels(layout.panels, action.fromId, action.toId, action.snap)
      return panels === layout.panels ? layout : { ...layout, panels }
    }
    case 'movePanelToIndex': {
      const panels = movePanelToIndex(layout.panels, action.panelId, action.index)
      return panels === layout.panels ? layout : { ...layout, panels }
    }
    case 'placePanel': {
      const panels = placePanel(layout.panels, action.panelId, action.row, action.col)
      return panels === layout.panels ? layout : { ...layout, panels }
    }
    case 'togglePanelWidth':
      return {
        ...layout,
        panels: assignPlotSlots(
          layout.panels.map((p) => {
            if (p.id !== action.panelId) return p
            const nextSpan: BentoSpan = (p.colSpan ?? 1) === 2 ? 1 : 2
            return {
              ...p,
              colSpan: nextSpan,
              widthPct: nextSpan === 2 ? 100 : 50,
            }
          }),
        ),
      }
    case 'togglePanelHeight':
      return {
        ...layout,
        panels: assignPlotSlots(
          layout.panels.map((p) => {
            if (p.id !== action.panelId) return p
            const nextRow: BentoRowSpan = (p.rowSpan ?? 1) >= 2 ? 1 : 2
            return {
              ...p,
              rowSpan: nextRow,
              height: nextRow * DEFAULT_ROW_HEIGHT,
            }
          }),
        ),
      }
    case 'resizePanel':
      return {
        ...layout,
        panels: assignPlotSlots(
          layout.panels.map((p) =>
            p.id === action.panelId
              ? {
                  ...p,
                  colSpan: action.colSpan ?? p.colSpan,
                  rowSpan: action.rowSpan ?? p.rowSpan,
                  widthPct: action.widthPct ?? p.widthPct,
                  height: action.height ?? p.height,
                }
              : p,
          ),
        ),
      }
    case 'setLayout':
      return action.layout
  }
}

function readLayouts(key: string): Record<string, unknown> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '{}')
    return saved && typeof saved === 'object' && !Array.isArray(saved)
      ? (saved as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function migrateRowLayout(entry: unknown): unknown {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry
  const raw = entry as Record<string, unknown>
  if (!Array.isArray(raw.panels) || !Array.isArray(raw.rows)) return entry
  const byId = new Map<number, Record<string, unknown>>()
  for (const value of raw.panels) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const panel = value as Record<string, unknown>
      if (typeof panel.id === 'number') byId.set(panel.id, panel)
    }
  }
  const panels: Record<string, unknown>[] = []
  raw.rows.forEach((value, row) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    const source = value as Record<string, unknown>
    if (!Array.isArray(source.panelIds)) return
    const panelIds = source.panelIds
    panelIds.forEach((id, col) => {
      if (typeof id !== 'number' || col > 1) return
      const panel = byId.get(id)
      if (!panel) return
      const paired = panelIds.length > 1
      const height =
        typeof source.height === 'number'
          ? Math.max(120, Math.min(1200, source.height))
          : DEFAULT_ROW_HEIGHT
      panels.push({
        ...panel,
        slot: { row, col },
        colSpan: paired ? 1 : 2,
        widthPct: paired ? 50 : 100,
        height,
        rowSpan: Math.max(1, Math.min(4, Math.round(height / DEFAULT_ROW_HEIGHT))),
      })
    })
  })
  return panels.length === byId.size ? { ...raw, panels } : entry
}

function parseLayout(entry: unknown, fallback: Layout): Layout {
  try {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return fallback
    const raw = entry as Record<string, unknown>
    if (!Array.isArray(raw.panels) || raw.panels.length === 0) return fallback
    const ids = new Set<number>()
    const panels: Panel[] = []
    for (const item of raw.panels) {
      if (!item || typeof item !== 'object') return fallback
      const p = item as Record<string, unknown>
      if (
        typeof p.id !== 'number' ||
        ids.has(p.id) ||
        !Array.isArray(p.channelIds) ||
        !p.channelIds.every((c) => typeof c === 'string')
      )
        return fallback
      if (p.colSpan !== undefined && p.colSpan !== 1 && p.colSpan !== 2) return fallback
      if (
        p.rowSpan !== undefined &&
        p.rowSpan !== 1 &&
        p.rowSpan !== 2 &&
        p.rowSpan !== 3 &&
        p.rowSpan !== 4
      )
        return fallback
      ids.add(p.id)
      const panel: Panel = {
        id: p.id,
        channelIds: (p.channelIds as string[]).slice(0, MAX_PANEL_STREAMS),
      }
      if (p.graph && typeof p.graph === 'object' && !Array.isArray(p.graph)) {
        const graph = p.graph as Record<string, unknown>
        if (graph.type === 'histogram') {
          panel.graph = {
            type: 'histogram',
            bins:
              Number.isInteger(graph.bins) &&
              (graph.bins as number) >= 5 &&
              (graph.bins as number) <= 200
                ? (graph.bins as number)
                : 30,
            valueRange:
              graph.valueRange &&
              typeof graph.valueRange === 'object' &&
              Number.isFinite((graph.valueRange as { min: number }).min) &&
              Number.isFinite((graph.valueRange as { max: number }).max) &&
              (graph.valueRange as { min: number }).min < (graph.valueRange as { max: number }).max
                ? (graph.valueRange as { min: number; max: number })
                : null,
            orientation: graph.orientation === 'horizontal' ? 'horizontal' : 'vertical',
            frequency: graph.frequency === 'percent' ? 'percent' : 'count',
            frequencyMax:
              typeof graph.frequencyMax === 'number' &&
              Number.isFinite(graph.frequencyMax) &&
              graph.frequencyMax > 0
                ? graph.frequencyMax
                : null,
          }
          panel.channelIds = panel.channelIds.slice(0, 1)
        } else if (graph.type === 'timeSeries') panel.graph = { type: 'timeSeries' }
      }
      if (p.slot !== undefined) {
        if (!p.slot || typeof p.slot !== 'object' || Array.isArray(p.slot)) return fallback
        const slot = p.slot as Record<string, unknown>
        if (
          !Number.isInteger(slot.row) ||
          (slot.row as number) < 0 ||
          (slot.col !== 0 && slot.col !== 1)
        )
          return fallback
        panel.slot = { row: slot.row as number, col: slot.col as 0 | 1 }
      }
      if (p.colSpan) panel.colSpan = p.colSpan
      if (p.rowSpan) panel.rowSpan = p.rowSpan
      if (typeof p.widthPct === 'number' && p.widthPct >= 20 && p.widthPct <= 100) {
        panel.widthPct = p.widthPct
      }
      if (typeof p.height === 'number' && p.height >= 120 && p.height <= 1200) {
        panel.height = p.height
      }
      panels.push(panel)
    }
    const maxId = Math.max(...panels.map((p) => p.id))
    const activeId =
      typeof raw.activeId === 'number' && ids.has(raw.activeId) ? raw.activeId : panels[0].id
    const nextId = typeof raw.nextId === 'number' && raw.nextId > maxId ? raw.nextId : maxId + 1
    return { panels: assignPlotSlots(panels), activeId, nextId }
  } catch {
    return fallback
  }
}

export function loadPlotLayout(profile: string, fallback: Layout): Layout {
  const current = readLayouts(PLOT_LAYOUT_KEY)
  if (profile in current) return parseLayout(current[profile], fallback)
  const rows = readLayouts(ROW_LAYOUT_KEY)
  if (profile in rows) return parseLayout(migrateRowLayout(rows[profile]), fallback)
  const bento = readLayouts(BENTO_LAYOUT_KEY)
  return profile in bento ? parseLayout(bento[profile], fallback) : fallback
}

export function savePlotLayout(profile: string, layout: Layout) {
  try {
    const layouts = readLayouts(PLOT_LAYOUT_KEY)
    localStorage.setItem(PLOT_LAYOUT_KEY, JSON.stringify({ ...layouts, [profile]: layout }))
  } catch {
    return
  }
}
