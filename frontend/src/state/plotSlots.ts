import { DEFAULT_ROW_HEIGHT, panelColSpan, panelRowSpan, type Panel } from './layout'

export interface PlotSlot { row: number; col: 0 | 1 }

export function plotRowCount(panel: Panel): number {
  return Math.max(panelRowSpan(panel), Math.ceil((panel.height ?? 0) / (DEFAULT_ROW_HEIGHT + 6)))
}

function overlaps(a: Panel, b: Panel, total: number): boolean {
  if (!a.slot || !b.slot) return false
  return a.slot.col < b.slot.col + panelColSpan(b, total) &&
    b.slot.col < a.slot.col + panelColSpan(a, total) &&
    a.slot.row < b.slot.row + plotRowCount(b) &&
    b.slot.row < a.slot.row + plotRowCount(a)
}

export function validPlacement(panels: Panel[], total = panels.length): boolean {
  return panels.every((panel, index) =>
    !!panel.slot && panel.slot.row >= 0 && Number.isInteger(panel.slot.row) &&
    (panel.slot.col === 0 || panel.slot.col === 1) &&
    panel.slot.col + panelColSpan(panel, total) <= 2 &&
    panels.slice(index + 1).every((other) => !overlaps(panel, other, total)),
  )
}

export function assignPlotSlots(panels: Panel[]): Panel[] {
  const placed: Panel[] = []
  for (const panel of panels) {
    if (panel.slot && validPlacement([...placed, panel], panels.length)) {
      placed.push(panel)
      continue
    }
    let row = 0
    let col: 0 | 1 = 0
    while (true) {
      const candidate: Panel = { ...panel, slot: { row, col } }
      if (validPlacement([...placed, candidate], panels.length)) {
        placed.push(candidate)
        break
      }
      if (col === 0 && panelColSpan(panel, panels.length) === 1) col = 1
      else { row++; col = 0 }
    }
  }
  return placed
}

export function previewPlotPlacement(panels: Panel[], id: number, slot: PlotSlot): Panel[] | null {
  const placed = assignPlotSlots(panels)
  const source = placed.find((panel) => panel.id === id)
  if (!source) return null
  const otherPanels = placed.filter((panel) => panel.id !== id)
  const pointedPanel = otherPanels.find((panel) =>
    slot.col >= panel.slot!.col && slot.col < panel.slot!.col + panelColSpan(panel, placed.length) &&
    slot.row >= panel.slot!.row && slot.row < panel.slot!.row + plotRowCount(panel))
  // A tall plot hovered over the lower of two small plots should cover both rows.
  // Keep empty-space drops anchored to the exact row under the pointer.
  let destination = slot
  if (pointedPanel) {
    let mostDisplaced = -1
    for (let row = Math.max(0, slot.row - plotRowCount(source) + 1); row <= slot.row; row++) {
      const candidate = { ...source, slot: { row, col: slot.col } }
      const displaced = otherPanels.filter((panel) => overlaps(candidate, panel, placed.length))
      if (displaced.length > mostDisplaced) {
        mostDisplaced = displaced.length
        destination = candidate.slot
      }
    }
  }
  const atDestination = { ...source, slot: destination }
  const displacedIds = new Set(otherPanels.filter((panel) => overlaps(atDestination, panel, placed.length)).map((panel) => panel.id))
  const rowShift = source.slot!.row - destination.row
  const colShift = source.slot!.col - destination.col
  const next = placed.map((panel) => panel.id === id
    ? { ...panel, slot: destination }
    : displacedIds.has(panel.id)
      ? { ...panel, slot: { row: panel.slot!.row + rowShift, col: (panel.slot!.col + colShift) as 0 | 1 } }
      : panel)
  if (validPlacement(next)) return next
  // A larger target may not fit when translated cell-for-cell. A direct
  // one-panel swap can still fit in the source's original footprint.
  if (displacedIds.size === 1) {
    const swapped = placed.map((panel) => panel.id === id
      ? { ...panel, slot: destination }
      : displacedIds.has(panel.id) ? { ...panel, slot: source.slot } : panel)
    if (validPlacement(swapped)) return swapped
  }
  return null
}

export function placePanel(panels: Panel[], id: number, row: number, col: 0 | 1): Panel[] {
  const next = previewPlotPlacement(panels, id, { row, col })
  if (!next || next.every((panel, index) => panel.slot?.row === panels[index].slot?.row && panel.slot?.col === panels[index].slot?.col)) return panels
  return next
}
