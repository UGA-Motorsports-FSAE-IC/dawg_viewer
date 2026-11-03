export type BentoSpan = 1 | 2
export type SnapZone = 'left' | 'right' | 'top' | 'bottom'

export interface Panel {
  id: number
  channelIds: string[]
  colSpan?: BentoSpan
  rowSpan?: BentoSpan
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
  | { type: 'movePanel'; fromId: number; toId: number; snap?: SnapZone }
  | { type: 'togglePanelWidth'; panelId: number }
  | { type: 'togglePanelHeight'; panelId: number }
  | { type: 'resizePanel'; panelId: number; colSpan?: BentoSpan; rowSpan?: BentoSpan }
  | { type: 'setLayout'; layout: Layout }

const PLOT_LAYOUT_KEY = 'dawg.live-plots.v1'

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
    panels: panels.map((channelIds, i) => ({ id: i + 1, channelIds })),
    activeId: 1,
    nextId: panels.length + 1,
  }
}

export function panelColSpan(panel: Panel, totalPanels = 2): BentoSpan {
  if (panel.colSpan) return panel.colSpan
  return totalPanels === 1 ? 2 : 1
}

export function panelRowSpan(panel: Panel): BentoSpan {
  return panel.rowSpan ?? 1
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
  const snappedMoved =
    snap === 'left' || snap === 'right' ? { ...moved, colSpan: 1 as BentoSpan } : moved
  next.splice(insertAt, 0, snappedMoved)

  if (snap === 'left' || snap === 'right') {
    return next.map((p) => (p.id === toId ? { ...p, colSpan: 1 as BentoSpan } : p))
  }
  return next
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
        activeId: layout.nextId,
        nextId: layout.nextId + 1,
      }
    case 'removePanel': {
      if (layout.panels.length === 1) return updatePanel(layout, action.panelId, () => [])
      const panels = layout.panels.filter((p) => p.id !== action.panelId)
      const activeId = layout.activeId === action.panelId ? panels[0].id : layout.activeId
      return { ...layout, panels, activeId }
    }
    case 'setActive':
      return layout.activeId === action.panelId ? layout : { ...layout, activeId: action.panelId }
    case 'movePanel': {
      const panels = movePanels(layout.panels, action.fromId, action.toId, action.snap)
      return panels === layout.panels ? layout : { ...layout, panels }
    }
    case 'togglePanelWidth':
      return {
        ...layout,
        panels: layout.panels.map((p) =>
          p.id === action.panelId
            ? { ...p, colSpan: ((p.colSpan ?? 1) === 2 ? 1 : 2) as BentoSpan }
            : p,
        ),
      }
    case 'togglePanelHeight':
      return {
        ...layout,
        panels: layout.panels.map((p) =>
          p.id === action.panelId
            ? { ...p, rowSpan: ((p.rowSpan ?? 1) === 2 ? 1 : 2) as BentoSpan }
            : p,
        ),
      }
    case 'resizePanel':
      return {
        ...layout,
        panels: layout.panels.map((p) =>
          p.id === action.panelId
            ? {
                ...p,
                colSpan: action.colSpan ?? p.colSpan,
                rowSpan: action.rowSpan ?? p.rowSpan,
              }
            : p,
        ),
      }
    case 'setLayout':
      return action.layout
  }
}

export function loadPlotLayout(profile: string, fallback: Layout): Layout {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PLOT_LAYOUT_KEY) ?? '{}')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return fallback
    const entry = (saved as Record<string, unknown>)[profile]
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
      if (p.rowSpan !== undefined && p.rowSpan !== 1 && p.rowSpan !== 2) return fallback
      ids.add(p.id)
      const panel: Panel = { id: p.id, channelIds: p.channelIds as string[] }
      if (p.colSpan) panel.colSpan = p.colSpan
      if (p.rowSpan) panel.rowSpan = p.rowSpan
      panels.push(panel)
    }
    const maxId = Math.max(...panels.map((p) => p.id))
    const activeId =
      typeof raw.activeId === 'number' && ids.has(raw.activeId) ? raw.activeId : panels[0].id
    const nextId = typeof raw.nextId === 'number' && raw.nextId > maxId ? raw.nextId : maxId + 1
    return { panels, activeId, nextId }
  } catch {
    return fallback
  }
}

export function savePlotLayout(profile: string, layout: Layout) {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PLOT_LAYOUT_KEY) ?? '{}')
    const layouts =
      saved && typeof saved === 'object' && !Array.isArray(saved)
        ? (saved as Record<string, unknown>)
        : {}
    localStorage.setItem(PLOT_LAYOUT_KEY, JSON.stringify({ ...layouts, [profile]: layout }))
  } catch {
    localStorage.setItem(PLOT_LAYOUT_KEY, JSON.stringify({ [profile]: layout }))
  }
}
