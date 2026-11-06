export type PlotLayoutMode = 'full' | 'bento'

const STORAGE_KEY = 'dawg.plot-layout-mode.v1'

export function loadPlotLayoutMode(): PlotLayoutMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'bento' ? 'bento' : 'full'
  } catch {
    return 'full'
  }
}

export function savePlotLayoutMode(mode: PlotLayoutMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Settings remain usable for this session when storage is unavailable.
  }
}
