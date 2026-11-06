import { beforeEach, describe, expect, it } from 'vitest'
import {
  computeEdgeResize,
  detectSnapZone,
  layoutReducer,
  loadPlotLayout,
  makeLayout,
  panelColSpan,
  panelRowSpan,
  savePlotLayout,
} from './layout'
import { previewPlotPlacement, validPlacement } from './plotSlots'

beforeEach(() => localStorage.clear())

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
    expect(layout.panels.map((panel) => panel.channelIds)).toEqual([['RPM'], ['TPS1', 'RPM']])
    layout = layoutReducer(layout, { type: 'removeChannel', panelId: 2, channelId: 'TPS1' })
    expect(layout.panels[1].channelIds).toEqual(['RPM'])
  })

  it('chooses a remaining panel when the active one is removed', () => {
    let layout = makeLayout([['RPM']])
    layout = layoutReducer(layout, { type: 'addPanel' })
    expect(layout.activeId).toBe(2)
    layout = layoutReducer(layout, { type: 'removePanel', panelId: 2 })
    expect(layout.activeId).toBe(1)
    layout = layoutReducer(layout, { type: 'removePanel', panelId: 1 })
    expect(layout.panels).toEqual([{ id: 1, channelIds: [], slot: { row: 0, col: 0 } }])
  })

  it('moves and snaps plots together in a bento grid', () => {
    let layout = makeLayout([['RPM'], ['TPS1'], ['CLT1']])
    layout = layoutReducer(layout, { type: 'togglePanelWidth', panelId: 1 })
    layout = layoutReducer(layout, { type: 'togglePanelWidth', panelId: 3 })
    expect(layout.panels[0].colSpan).toBe(2)
    expect(layout.panels[2].colSpan).toBe(2)

    // Snap panel 3 to the left of panel 1 -> places panel 3 before panel 1 and snaps both to 1-col side-by-side
    layout = layoutReducer(layout, { type: 'movePanel', fromId: 3, toId: 1, snap: 'left' })
    expect(layout.panels.map((p) => p.id)).toEqual([3, 1, 2])
    expect(layout.panels[0].colSpan).toBe(1)
    expect(layout.panels[1].colSpan).toBe(1)

    // Snap panel 3 to the bottom of panel 2 -> places panel 3 after panel 2
    layout = layoutReducer(layout, { type: 'movePanel', fromId: 3, toId: 2, snap: 'bottom' })
    expect(layout.panels.map((p) => p.id)).toEqual([1, 2, 3])

    // Direct move without snap zone
    layout = layoutReducer(layout, { type: 'movePanel', fromId: 3, toId: 1 })
    expect(layout.panels.map((p) => p.id)).toEqual([3, 1, 2])
  })

  it('moves a plot to the phantom index without changing its size', () => {
    let layout = makeLayout([['RPM'], ['TPS1'], ['CLT1']])
    layout = layoutReducer(layout, { type: 'togglePanelWidth', panelId: 1 })
    layout = layoutReducer(layout, { type: 'movePanelToIndex', panelId: 1, index: 2 })
    expect(layout.panels.map((panel) => panel.id)).toEqual([2, 3, 1])
    expect(layout.panels[2].colSpan).toBe(2)
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

  it('keeps wide and tall plots from overlapping and repacks after removal', () => {
    let layout = makeLayout([['RPM'], ['TPS1']])
    layout = layoutReducer(layout, { type: 'togglePanelWidth', panelId: 1 })
    layout = layoutReducer(layout, { type: 'togglePanelHeight', panelId: 1 })
    expect(validPlacement(layout.panels)).toBe(true)
    expect(layout.panels[1].slot).toEqual({ row: 2, col: 0 })
    layout = layoutReducer(layout, { type: 'placePanel', panelId: 2, row: 0, col: 1 })
    expect(validPlacement(layout.panels)).toBe(true)
    expect(layout.panels[0].slot).toEqual({ row: 2, col: 0 })
    layout = layoutReducer(layout, { type: 'removePanel', panelId: 1 })
    expect(layout.panels[0].slot).toEqual({ row: 0, col: 0 })
  })

  it('toggles and resizes bento panel spans and detects snap zones', () => {
    let layout = makeLayout([['RPM'], ['TPS1']])
    expect(panelColSpan(layout.panels[0], 1)).toBe(2)
    expect(panelColSpan(layout.panels[0], 2)).toBe(1)
    expect(panelRowSpan(layout.panels[0])).toBe(1)

    layout = layoutReducer(layout, { type: 'togglePanelHeight', panelId: 1 })
    expect(panelRowSpan(layout.panels[0])).toBe(2)
    layout = layoutReducer(layout, { type: 'togglePanelHeight', panelId: 1 })
    expect(panelRowSpan(layout.panels[0])).toBe(1)

    layout = layoutReducer(layout, {
      type: 'resizePanel',
      panelId: 2,
      colSpan: 2,
      rowSpan: 2,
    })
    expect(layout.panels[1].colSpan).toBe(2)
    expect(layout.panels[1].rowSpan).toBe(2)

    const rect = { left: 0, top: 0, width: 200, height: 100 }
    expect(detectSnapZone(10, 50, rect, 0, 1)).toBe('left')
    expect(detectSnapZone(190, 50, rect, 0, 1)).toBe('right')
    expect(detectSnapZone(100, 5, rect, 0, 1)).toBe('top')
    expect(detectSnapZone(100, 95, rect, 0, 1)).toBe('bottom')
    expect(detectSnapZone(0, 0, { left: 0, top: 0, width: 0, height: 0 }, 0, 1)).toBe('right')
    expect(detectSnapZone(0, 0, { left: 0, top: 0, width: 0, height: 0 }, 2, 0)).toBe('left')

    expect(computeEdgeResize('right', 50, 0, 1, 1)).toEqual({
      colSpan: 2,
      widthPct: 81.25,
    })
    expect(computeEdgeResize('left', -50, 0, 1, 1)).toEqual({
      colSpan: 2,
      widthPct: 81.25,
    })
    expect(computeEdgeResize('bottom', 0, 25, 1, 1)).toEqual({
      rowSpan: 1,
      height: 217,
    })
    expect(computeEdgeResize('bottom', 0, 60, 1, 1)).toEqual({
      rowSpan: 2,
      height: 252,
    })
    expect(computeEdgeResize('bottom', 0, 350, 1, 1)).toEqual({
      rowSpan: 3,
      height: 542,
    })
    expect(computeEdgeResize('corner', 60, 80, 1, 1)).toEqual({
      colSpan: 2,
      widthPct: 87.5,
      rowSpan: 2,
      height: 272,
    })
  })

  it('saves and loads plot bento layouts per profile', () => {
    const fallback = makeLayout([['RPM']])
    let custom = makeLayout([['RPM', 'TPS1'], ['VSS']])
    custom = layoutReducer(custom, { type: 'togglePanelWidth', panelId: 1 })
    custom = layoutReducer(custom, { type: 'togglePanelHeight', panelId: 2 })

    savePlotLayout('car-a', custom)
    expect(loadPlotLayout('car-a', fallback)).toEqual(custom)
    expect(loadPlotLayout('car-b', fallback)).toEqual(fallback)

    localStorage.setItem('dawg.live-plots.v3', JSON.stringify({ 'car-a': { panels: 'invalid' } }))
    expect(loadPlotLayout('car-a', fallback)).toEqual(fallback)
  })

  it('migrates the row layout without losing panel data', () => {
    localStorage.setItem(
      'dawg.live-plots.v2',
      JSON.stringify({
        car: {
          panels: [
            { id: 1, channelIds: ['RPM'] },
            { id: 2, channelIds: ['TPS1'], graph: { type: 'histogram', bins: 20 } },
          ],
          rows: [{ id: 1, panelIds: [2, 1], height: 300 }],
          activeId: 2,
          nextId: 3,
        },
      }),
    )
    const layout = loadPlotLayout('car', makeLayout([['fallback']]))
    expect(layout.panels.map((panel) => panel.id)).toEqual([2, 1])
    expect(layout.panels.map((panel) => panel.slot)).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ])
    expect(layout.panels[0].graph).toMatchObject({ type: 'histogram', bins: 20 })
    expect(layout.activeId).toBe(2)
  })
})
