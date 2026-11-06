export const DEFAULT_ROW_HEIGHT = 192
export const MIN_ROW_HEIGHT = 120
export const MAX_ROW_HEIGHT = 1200

export type DropZone = 'top' | 'bottom' | 'left' | 'right' | 'swap'

export interface Panel {
  id: number
  channelIds: string[]
}

export interface Row {
  id: number
  panelIds: number[]
  height: number
}

export interface Layout {
  panels: Panel[]
  rows: Row[]
  activeId: number
  nextId: number
  nextRowId: number
}

export type LayoutAction =
  | { type: 'toggleChannel'; channelId: string }
  | { type: 'removeChannel'; panelId: number; channelId: string }
  | { type: 'addPanel' }
  | { type: 'removePanel'; panelId: number }
  | { type: 'setActive'; panelId: number }
  | { type: 'dropPanel'; panelId: number; targetId: number; zone: DropZone }
  | { type: 'moveRow'; rowId: number; toIndex: number }
  | { type: 'setRowHeight'; rowId: number; height: number }
  | { type: 'splitPanel'; panelId: number }
  | { type: 'joinPanel'; panelId: number }
  | { type: 'setLayout'; layout: Layout }

const PLOT_LAYOUT_KEY = 'dawg.live-plots.v2'
const LEGACY_PLOT_LAYOUT_KEY = 'dawg.live-plots.v1'
const EDGE_BAND = 0.25

type Drag = { kind: 'plot' | 'row'; id: number }
let currentDrag: Drag | null = null

export function setPlotDrag(id: number) {
  currentDrag = { kind: 'plot', id }
}

export function setRowDrag(id: number) {
  currentDrag = { kind: 'row', id }
}

export function getDrag(): Drag | null {
  return currentDrag
}

export function clearPlotDrag() {
  currentDrag = null
}

export function clampHeight(height: number): number {
  if (!Number.isFinite(height)) return DEFAULT_ROW_HEIGHT
  return Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, Math.round(height)))
}

export function makeLayout(panels: string[][]): Layout {
  return {
    panels: panels.map((channelIds, i) => ({ id: i + 1, channelIds })),
    rows: panels.map((_, i) => ({ id: i + 1, panelIds: [i + 1], height: DEFAULT_ROW_HEIGHT })),
    activeId: 1,
    nextId: panels.length + 1,
    nextRowId: panels.length + 1,
  }
}

export function orderedPanels(layout: Layout): Panel[] {
  const byId = new Map(layout.panels.map((p) => [p.id, p]))
  return layout.rows.flatMap((row) => row.panelIds.flatMap((id) => byId.get(id) ?? []))
}

export function joinTarget(rows: Row[], panelId: number): number | undefined {
  const at = rows.findIndex((r) => r.panelIds.includes(panelId))
  if (at < 0 || rows[at].panelIds.length !== 1) return undefined
  if (at > 0 && rows[at - 1].panelIds.length === 1) return rows[at - 1].id
  if (at < rows.length - 1 && rows[at + 1].panelIds.length === 1) return rows[at + 1].id
  return undefined
}

export function detectDropZone(rx: number, ry: number): DropZone {
  const dx = Math.min(rx, 1 - rx)
  const dy = Math.min(ry, 1 - ry)
  if (dx >= EDGE_BAND && dy >= EDGE_BAND) return 'swap'
  if (dy <= dx) return ry < 0.5 ? 'top' : 'bottom'
  return rx < 0.5 ? 'left' : 'right'
}

function updatePanel(layout: Layout, panelId: number, fn: (ids: string[]) => string[]): Layout {
  return {
    ...layout,
    panels: layout.panels.map((p) =>
      p.id === panelId ? { ...p, channelIds: fn(p.channelIds) } : p,
    ),
  }
}

function withoutPanel(rows: Row[], panelId: number): Row[] {
  return rows
    .map((r) =>
      r.panelIds.includes(panelId)
        ? { ...r, panelIds: r.panelIds.filter((id) => id !== panelId) }
        : r,
    )
    .filter((r) => r.panelIds.length > 0)
}

function rowIndexOf(rows: Row[], panelId: number): number {
  return rows.findIndex((r) => r.panelIds.includes(panelId))
}

function dropPanel(layout: Layout, panelId: number, targetId: number, zone: DropZone): Layout {
  if (panelId === targetId) return layout
  const sourceRow = layout.rows[rowIndexOf(layout.rows, panelId)]
  const targetRow = layout.rows[rowIndexOf(layout.rows, targetId)]
  if (!sourceRow || !targetRow) return layout

  if (
    zone === 'swap' ||
    ((zone === 'left' || zone === 'right') && targetRow.panelIds.length === 2)
  ) {
    const rows = layout.rows.map((r) => ({
      ...r,
      panelIds: r.panelIds.map((id) =>
        id === panelId ? targetId : id === targetId ? panelId : id,
      ),
    }))
    return { ...layout, rows }
  }

  const remaining = withoutPanel(layout.rows, panelId)
  const at = rowIndexOf(remaining, targetId)
  if (zone === 'left' || zone === 'right') {
    const rows = remaining.map((r, i) =>
      i === at
        ? { ...r, panelIds: zone === 'left' ? [panelId, targetId] : [targetId, panelId] }
        : r,
    )
    return { ...layout, rows }
  }
  const row: Row = { id: layout.nextRowId, panelIds: [panelId], height: sourceRow.height }
  const rows = [...remaining]
  rows.splice(zone === 'top' ? at : at + 1, 0, row)
  return { ...layout, rows, nextRowId: layout.nextRowId + 1 }
}

export function layoutReducer(layout: Layout, action: LayoutAction): Layout {
  switch (action.type) {
    case 'toggleChannel':
      return updatePanel(layout, layout.activeId, (ids) =>
        ids.includes(action.channelId)
          ? ids.filter((id) => id !== action.channelId)
          : [...ids, action.channelId],
      )
    case 'removeChannel':
      return updatePanel(layout, action.panelId, (ids) =>
        ids.filter((id) => id !== action.channelId),
      )
    case 'addPanel':
      return {
        panels: [...layout.panels, { id: layout.nextId, channelIds: [] }],
        rows: [
          ...layout.rows,
          { id: layout.nextRowId, panelIds: [layout.nextId], height: DEFAULT_ROW_HEIGHT },
        ],
        activeId: layout.nextId,
        nextId: layout.nextId + 1,
        nextRowId: layout.nextRowId + 1,
      }
    case 'removePanel': {
      if (layout.panels.length === 1) return updatePanel(layout, action.panelId, () => [])
      if (!layout.panels.some((p) => p.id === action.panelId)) return layout
      const next: Layout = {
        ...layout,
        panels: layout.panels.filter((p) => p.id !== action.panelId),
        rows: withoutPanel(layout.rows, action.panelId),
      }
      const activeId =
        layout.activeId === action.panelId ? orderedPanels(next)[0].id : layout.activeId
      return { ...next, activeId }
    }
    case 'setActive':
      return layout.activeId === action.panelId ? layout : { ...layout, activeId: action.panelId }
    case 'dropPanel':
      return dropPanel(layout, action.panelId, action.targetId, action.zone)
    case 'moveRow': {
      const from = layout.rows.findIndex((r) => r.id === action.rowId)
      if (
        from < 0 ||
        !Number.isInteger(action.toIndex) ||
        action.toIndex < 0 ||
        action.toIndex >= layout.rows.length ||
        from === action.toIndex
      )
        return layout
      const rows = [...layout.rows]
      rows.splice(action.toIndex, 0, ...rows.splice(from, 1))
      return { ...layout, rows }
    }
    case 'setRowHeight': {
      const height = clampHeight(action.height)
      const row = layout.rows.find((r) => r.id === action.rowId)
      if (!row || row.height === height) return layout
      return {
        ...layout,
        rows: layout.rows.map((r) => (r.id === action.rowId ? { ...r, height } : r)),
      }
    }
    case 'splitPanel': {
      const at = rowIndexOf(layout.rows, action.panelId)
      if (at < 0 || layout.rows[at].panelIds.length !== 2) return layout
      const row = layout.rows[at]
      const rows = [...layout.rows]
      rows[at] = { ...row, panelIds: row.panelIds.filter((id) => id !== action.panelId) }
      rows.splice(at + 1, 0, {
        id: layout.nextRowId,
        panelIds: [action.panelId],
        height: row.height,
      })
      return { ...layout, rows, nextRowId: layout.nextRowId + 1 }
    }
    case 'joinPanel': {
      const partnerId = joinTarget(layout.rows, action.panelId)
      if (partnerId === undefined) return layout
      const own = layout.rows[rowIndexOf(layout.rows, action.panelId)]
      const partner = layout.rows.find((r) => r.id === partnerId)!
      const before = layout.rows.indexOf(partner) < layout.rows.indexOf(own)
      const rows = layout.rows
        .filter((r) => r.id !== own.id)
        .map((r) =>
          r.id === partnerId
            ? {
                ...r,
                panelIds: before
                  ? [...r.panelIds, action.panelId]
                  : [action.panelId, ...r.panelIds],
              }
            : r,
        )
      return { ...layout, rows }
    }
    case 'setLayout':
      return action.layout
  }
}

function readStore(key: string): Record<string, unknown> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '{}')
    return saved && typeof saved === 'object' && !Array.isArray(saved)
      ? (saved as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function parseLayout(entry: unknown): Layout | null {
  const raw = asRecord(entry)
  if (!raw || !Array.isArray(raw.panels) || !Array.isArray(raw.rows)) return null
  if (raw.panels.length === 0 || raw.rows.length === 0) return null
  const ids = new Set<number>()
  const panels: Panel[] = []
  for (const item of raw.panels) {
    const p = asRecord(item)
    if (
      !p ||
      typeof p.id !== 'number' ||
      ids.has(p.id) ||
      !Array.isArray(p.channelIds) ||
      !p.channelIds.every((c) => typeof c === 'string')
    )
      return null
    ids.add(p.id)
    panels.push({ id: p.id, channelIds: p.channelIds as string[] })
  }
  const placed = new Set<number>()
  const rowIds = new Set<number>()
  const rows: Row[] = []
  for (const item of raw.rows) {
    const r = asRecord(item)
    if (
      !r ||
      typeof r.id !== 'number' ||
      rowIds.has(r.id) ||
      !Array.isArray(r.panelIds) ||
      r.panelIds.length < 1 ||
      r.panelIds.length > 2 ||
      typeof r.height !== 'number'
    )
      return null
    for (const id of r.panelIds) {
      if (typeof id !== 'number' || !ids.has(id) || placed.has(id)) return null
      placed.add(id)
    }
    rowIds.add(r.id)
    rows.push({ id: r.id, panelIds: r.panelIds as number[], height: clampHeight(r.height) })
  }
  if (placed.size !== panels.length) return null
  const activeId =
    typeof raw.activeId === 'number' && ids.has(raw.activeId) ? raw.activeId : panels[0].id
  const maxId = Math.max(...ids)
  const maxRow = Math.max(...rowIds)
  return {
    panels,
    rows,
    activeId,
    nextId: typeof raw.nextId === 'number' && raw.nextId > maxId ? raw.nextId : maxId + 1,
    nextRowId:
      typeof raw.nextRowId === 'number' && raw.nextRowId > maxRow ? raw.nextRowId : maxRow + 1,
  }
}

export function migrateLegacyLayout(entry: unknown): Layout | null {
  const raw = asRecord(entry)
  if (!raw || !Array.isArray(raw.panels) || raw.panels.length === 0) return null
  const items: {
    id: number
    channelIds: string[]
    row: number
    col: number
    wide: boolean
    height: number
  }[] = []
  const ids = new Set<number>()
  for (const [order, item] of raw.panels.entries()) {
    const p = asRecord(item)
    if (
      !p ||
      typeof p.id !== 'number' ||
      ids.has(p.id) ||
      !Array.isArray(p.channelIds) ||
      !p.channelIds.every((c) => typeof c === 'string')
    )
      return null
    ids.add(p.id)
    const slot = asRecord(p.slot)
    const rowSpan = typeof p.rowSpan === 'number' ? p.rowSpan : 1
    items.push({
      id: p.id,
      channelIds: p.channelIds as string[],
      row: slot && typeof slot.row === 'number' ? slot.row : order,
      col: slot && typeof slot.col === 'number' ? slot.col : 0,
      wide: p.colSpan === 2 || (typeof p.widthPct === 'number' && p.widthPct > 75),
      height: clampHeight(typeof p.height === 'number' ? p.height : rowSpan * DEFAULT_ROW_HEIGHT),
    })
  }
  items.sort((a, b) => a.row - b.row || a.col - b.col)
  const rows: Row[] = []
  for (let i = 0; i < items.length; i++) {
    const a = items[i]
    const b = items[i + 1]
    if (!a.wide && b && !b.wide && b.row === a.row) {
      rows.push({
        id: rows.length + 1,
        panelIds: [a.id, b.id],
        height: Math.max(a.height, b.height),
      })
      i++
    } else {
      rows.push({ id: rows.length + 1, panelIds: [a.id], height: a.height })
    }
  }
  const maxId = Math.max(...ids)
  const activeId =
    typeof raw.activeId === 'number' && ids.has(raw.activeId) ? raw.activeId : items[0].id
  return {
    panels: items.map((i) => ({ id: i.id, channelIds: i.channelIds })),
    rows,
    activeId,
    nextId: typeof raw.nextId === 'number' && raw.nextId > maxId ? raw.nextId : maxId + 1,
    nextRowId: rows.length + 1,
  }
}

export function loadPlotLayout(profile: string, fallback: Layout): Layout {
  const current = readStore(PLOT_LAYOUT_KEY)
  if (profile in current) return parseLayout(current[profile]) ?? fallback
  const legacy = readStore(LEGACY_PLOT_LAYOUT_KEY)
  return (profile in legacy ? migrateLegacyLayout(legacy[profile]) : null) ?? fallback
}

export function savePlotLayout(profile: string, layout: Layout) {
  try {
    localStorage.setItem(
      PLOT_LAYOUT_KEY,
      JSON.stringify({ ...readStore(PLOT_LAYOUT_KEY), [profile]: layout }),
    )
  } catch {
    return
  }
}
