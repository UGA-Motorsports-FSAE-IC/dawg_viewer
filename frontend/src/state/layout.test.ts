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
  it('caps each time-series panel at seven streams without affecting other panels', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    let layout = makeLayout([names, ['Other']])
    expect(layout.panels[0].channelIds).toEqual(names.slice(0, 7))
    layout = layoutReducer(layout, { type: 'toggleChannel', channelId: 'H' })
    expect(layout.panels[0].channelIds).toEqual(names.slice(0, 7))
    layout = layoutReducer(layout, { type: 'toggleChannel', channelId: 'A' })
    layout = layoutReducer(layout, { type: 'toggleChannel', channelId: 'H' })
    expect(layout.panels[0].channelIds).toEqual([...names.slice(1, 7), 'H'])
    expect(layout.panels[1].channelIds).toEqual(['Other'])
    localStorage.setItem(
      'dawg.live-plots.v1',
      JSON.stringify({ car: { ...layout, panels: [{ ...layout.panels[0], channelIds: names }] } }),
    )
    expect(loadPlotLayout('car', makeLayout([[]])).panels[0].channelIds).toEqual(names.slice(0, 7))
  })
  it('converts a multi-channel plot to a histogram of its first series', () => {
    let layout = makeLayout([['RPM', 'TPS1', 'VSS']])
    layout = layoutReducer(layout, { type: 'setGraphType', panelId: 1, graphType: 'histogram' })
    expect(layout.panels[0].channelIds).toEqual(['RPM'])
    expect(layout.panels[0].graph).toMatchObject({ type: 'histogram', bins: 30 })
    layout = layoutReducer(layout, { type: 'toggleChannel', channelId: 'CLT1' })
    expect(layout.panels[0].channelIds).toEqual(['CLT1'])
    layout = layoutReducer(layout, { type: 'setGraphType', panelId: 1, graphType: 'timeSeries' })
    expect(layout.panels[0].channelIds).toEqual(['CLT1'])
  })

  it('loads legacy layouts and validates histogram settings', () => {
    const layout = makeLayout([['RPM', 'TPS1']])
    savePlotLayout('legacy', layout)
    expect(loadPlotLayout('legacy', makeLayout([[]])).panels[0].graph).toBeUndefined()
    const histogram = layoutReducer(layout, {
      type: 'setGraphType',
      panelId: 1,
      graphType: 'histogram',
    })
    savePlotLayout('histogram', histogram)
    expect(loadPlotLayout('histogram', makeLayout([[]])).panels[0]).toEqual(histogram.panels[0])
  })
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

  it('swaps occupied slots and moves into empty space without shifting other plots', () => {
    let layout = makeLayout([['RPM'], ['TPS1'], ['CLT1']])
    expect(layout.panels.map((panel) => panel.slot)).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 0 },
    ])
    layout = layoutReducer(layout, { type: 'placePanel', panelId: 1, row: 0, col: 1 })
    expect(layout.panels.map((panel) => panel.slot)).toEqual([
      { row: 0, col: 1 },
      { row: 0, col: 0 },
      { row: 1, col: 0 },
    ])
    layout = layoutReducer(layout, { type: 'placePanel', panelId: 1, row: 3, col: 1 })
    expect(layout.panels.map((panel) => panel.slot)).toEqual([
      { row: 3, col: 1 },
      { row: 0, col: 0 },
      { row: 1, col: 0 },
    ])
    expect(validPlacement(layout.panels)).toBe(true)
  })

  it('moves both short plots into the space vacated by a tall plot', () => {
    const start = {
      panels: [
        { id: 1, channelIds: ['RPM'], rowSpan: 2 as const, slot: { row: 0, col: 0 as const } },
        { id: 2, channelIds: ['TPS1'], slot: { row: 0, col: 1 as const } },
        { id: 3, channelIds: ['CLT1'], slot: { row: 1, col: 1 as const } },
      ],
      activeId: 1,
      nextId: 4,
    }
    const expected = [
      { row: 0, col: 1 },
      { row: 0, col: 0 },
      { row: 1, col: 0 },
    ]
    // Hovering either short plot previews the same two-row replacement.
    expect(previewPlotPlacement(start.panels, 1, { row: 0, col: 1 })?.map((p) => p.slot)).toEqual(
      expected,
    )
    expect(previewPlotPlacement(start.panels, 1, { row: 1, col: 1 })?.map((p) => p.slot)).toEqual(
      expected,
    )
    const layout = layoutReducer(start, { type: 'placePanel', panelId: 1, row: 1, col: 1 })
    expect(layout.panels.map((panel) => panel.slot)).toEqual(expected)
    expect(validPlacement(layout.panels)).toBe(true)
    savePlotLayout('tall-swap', layout)
    expect(loadPlotLayout('tall-swap', makeLayout([['RPM']]))).toEqual(layout)
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
