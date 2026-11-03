import { beforeEach, describe, expect, it } from 'vitest'
import {
  detectSnapZone,
  layoutReducer,
  loadPlotLayout,
  makeLayout,
  panelColSpan,
  panelRowSpan,
  savePlotLayout,
} from './layout'

beforeEach(() => localStorage.clear())

describe('layoutReducer', () => {
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
    expect(layout.panels).toEqual([{ id: 1, channelIds: [] }])
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
  })

  it('saves and loads plot bento layouts per profile', () => {
    const fallback = makeLayout([['RPM']])
    let custom = makeLayout([['RPM', 'TPS1'], ['VSS']])
    custom = layoutReducer(custom, { type: 'togglePanelWidth', panelId: 1 })
    custom = layoutReducer(custom, { type: 'togglePanelHeight', panelId: 2 })

    savePlotLayout('car-a', custom)
    expect(loadPlotLayout('car-a', fallback)).toEqual(custom)
    expect(loadPlotLayout('car-b', fallback)).toEqual(fallback)

    localStorage.setItem('dawg.live-plots.v1', JSON.stringify({ 'car-a': { panels: 'invalid' } }))
    expect(loadPlotLayout('car-a', fallback)).toEqual(fallback)
  })
})
