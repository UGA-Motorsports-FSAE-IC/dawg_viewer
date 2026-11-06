import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_ROW_HEIGHT,
  MAX_ROW_HEIGHT,
  MIN_ROW_HEIGHT,
  detectDropZone,
  joinTarget,
  layoutReducer,
  loadPlotLayout,
  makeLayout,
  orderedPanels,
  savePlotLayout,
  type Layout,
} from './layout'

beforeEach(() => localStorage.clear())

const order = (l: Layout) => l.rows.map((r) => r.panelIds)

describe('layoutReducer', () => {
  it('keeps channel selection in the active panel', () => {
    let layout = makeLayout([['RPM'], ['TPS1']])
    layout = layoutReducer(layout, { type: 'setActive', panelId: 2 })
    layout = layoutReducer(layout, { type: 'toggleChannel', channelId: 'RPM' })
    expect(layout.panels.map((p) => p.channelIds)).toEqual([['RPM'], ['TPS1', 'RPM']])
    layout = layoutReducer(layout, { type: 'removeChannel', panelId: 2, channelId: 'TPS1' })
    expect(layout.panels[1].channelIds).toEqual(['RPM'])
  })

  it('stacks new plots and keeps one empty plot when the last is removed', () => {
    let layout = makeLayout([['RPM']])
    layout = layoutReducer(layout, { type: 'addPanel' })
    expect(order(layout)).toEqual([[1], [2]])
    expect(layout.activeId).toBe(2)
    layout = layoutReducer(layout, { type: 'removePanel', panelId: 2 })
    expect(layout.activeId).toBe(1)
    layout = layoutReducer(layout, { type: 'removePanel', panelId: 1 })
    expect(layout.panels).toEqual([{ id: 1, channelIds: [] }])
    expect(order(layout)).toEqual([[1]])
  })

  it('pairs plots by dropping on a side and stacks them by dropping on an edge', () => {
    let layout = makeLayout([['A'], ['B'], ['C']])
    layout = layoutReducer(layout, { type: 'dropPanel', panelId: 3, targetId: 1, zone: 'left' })
    expect(order(layout)).toEqual([[3, 1], [2]])
    layout = layoutReducer(layout, { type: 'dropPanel', panelId: 3, targetId: 2, zone: 'bottom' })
    expect(order(layout)).toEqual([[1], [2], [3]])
    layout = layoutReducer(layout, { type: 'dropPanel', panelId: 3, targetId: 1, zone: 'top' })
    expect(order(layout)).toEqual([[3], [1], [2]])
  })

  it('swaps plots when dropped in the middle or on the side of a pair', () => {
    let layout = makeLayout([['A'], ['B'], ['C']])
    layout = layoutReducer(layout, { type: 'dropPanel', panelId: 2, targetId: 1, zone: 'right' })
    expect(order(layout)).toEqual([[1, 2], [3]])
    layout = layoutReducer(layout, { type: 'dropPanel', panelId: 3, targetId: 1, zone: 'swap' })
    expect(order(layout)).toEqual([[3, 2], [1]])
    layout = layoutReducer(layout, { type: 'dropPanel', panelId: 1, targetId: 3, zone: 'left' })
    expect(order(layout)).toEqual([[1, 2], [3]])
  })

  it('moves a whole pair and gives it one shared height', () => {
    let layout = makeLayout([['A'], ['B'], ['C']])
    layout = layoutReducer(layout, { type: 'joinPanel', panelId: 2 })
    expect(order(layout)).toEqual([[1, 2], [3]])
    const pair = layout.rows[0]
    layout = layoutReducer(layout, { type: 'setRowHeight', rowId: pair.id, height: 333 })
    expect(layout.rows[0].height).toBe(333)
    layout = layoutReducer(layout, { type: 'moveRow', rowId: pair.id, toIndex: 1 })
    expect(order(layout)).toEqual([[3], [1, 2]])
    expect(layout.rows[1].height).toBe(333)
    expect(orderedPanels(layout).map((p) => p.id)).toEqual([3, 1, 2])
  })

  it('resizes by any pixel amount within bounds, with no snapping', () => {
    let layout = makeLayout([['A']])
    const rowId = layout.rows[0].id
    for (const h of [201, 257, 640]) {
      layout = layoutReducer(layout, { type: 'setRowHeight', rowId, height: h })
      expect(layout.rows[0].height).toBe(h)
    }
    layout = layoutReducer(layout, { type: 'setRowHeight', rowId, height: 5 })
    expect(layout.rows[0].height).toBe(MIN_ROW_HEIGHT)
    layout = layoutReducer(layout, { type: 'setRowHeight', rowId, height: 99999 })
    expect(layout.rows[0].height).toBe(MAX_ROW_HEIGHT)
  })

  it('splits a pair onto its own row and joins neighbours', () => {
    let layout = makeLayout([['A'], ['B']])
    expect(joinTarget(layout.rows, 1)).toBe(2)
    layout = layoutReducer(layout, { type: 'joinPanel', panelId: 1 })
    expect(order(layout)).toEqual([[1, 2]])
    expect(joinTarget(layout.rows, 1)).toBeUndefined()
    layout = layoutReducer(layout, { type: 'splitPanel', panelId: 1 })
    expect(order(layout)).toEqual([[2], [1]])
    expect(layout.rows[1].height).toBe(layout.rows[0].height)
  })

  it('removing one plot of a pair keeps the other with the row height', () => {
    let layout = makeLayout([['A'], ['B']])
    layout = layoutReducer(layout, { type: 'joinPanel', panelId: 2 })
    layout = layoutReducer(layout, { type: 'setRowHeight', rowId: layout.rows[0].id, height: 300 })
    layout = layoutReducer(layout, { type: 'removePanel', panelId: 1 })
    expect(order(layout)).toEqual([[2]])
    expect(layout.rows[0].height).toBe(300)
  })
})

describe('detectDropZone', () => {
  it('uses edge bands and the middle swaps', () => {
    expect(detectDropZone(0.05, 0.5)).toBe('left')
    expect(detectDropZone(0.95, 0.5)).toBe('right')
    expect(detectDropZone(0.5, 0.05)).toBe('top')
    expect(detectDropZone(0.5, 0.95)).toBe('bottom')
    expect(detectDropZone(0.5, 0.5)).toBe('swap')
  })
})

describe('persistence', () => {
  it('saves and loads layouts per profile', () => {
    const fallback = makeLayout([['RPM']])
    let custom = makeLayout([['RPM', 'TPS1'], ['VSS']])
    custom = layoutReducer(custom, { type: 'joinPanel', panelId: 1 })
    custom = layoutReducer(custom, { type: 'setRowHeight', rowId: 1, height: 250 })
    savePlotLayout('car-a', custom)
    expect(loadPlotLayout('car-a', fallback)).toEqual(custom)
    expect(loadPlotLayout('car-b', fallback)).toEqual(fallback)
    localStorage.setItem('dawg.live-plots.v2', JSON.stringify({ 'car-a': { panels: 'invalid' } }))
    expect(loadPlotLayout('car-a', fallback)).toEqual(fallback)
  })

  it('migrates the old bento layout into rows', () => {
    localStorage.setItem(
      'dawg.live-plots.v1',
      JSON.stringify({
        car: {
          panels: [
            { id: 1, channelIds: ['A'], slot: { row: 0, col: 0 }, colSpan: 1, height: 200 },
            { id: 2, channelIds: ['B'], slot: { row: 0, col: 1 }, colSpan: 1, height: 300 },
            { id: 3, channelIds: ['C'], slot: { row: 1, col: 0 }, colSpan: 2, rowSpan: 2 },
          ],
          activeId: 2,
          nextId: 4,
        },
      }),
    )
    const layout = loadPlotLayout('car', makeLayout([['X']]))
    expect(order(layout)).toEqual([[1, 2], [3]])
    expect(layout.rows.map((r) => r.height)).toEqual([300, 2 * DEFAULT_ROW_HEIGHT])
    expect(layout.activeId).toBe(2)
  })
})
