import type { BentoRowSpan, BentoSpan, SnapZone } from './state/layout'

export const toolbarButton =
  'rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:text-zinc-600 disabled:hover:bg-transparent'

export const toolbarButtonActive =
  'rounded border border-red-500 bg-red-500/15 px-2.5 py-1 text-xs text-zinc-100'

export const plotStack =
  'flex min-h-0 min-w-0 flex-1 flex-wrap content-start items-start gap-1.5 overflow-x-hidden overflow-y-auto bg-zinc-900 p-1.5 [scrollbar-gutter:stable]'

const SNAP_CLASSES: Record<SnapZone, string> = {
  left: 'after:pointer-events-none after:absolute after:top-0 after:left-0 after:h-full after:w-1 after:bg-red-500',
  right:
    'after:pointer-events-none after:absolute after:top-0 after:right-0 after:h-full after:w-1 after:bg-red-500',
  top: 'after:pointer-events-none after:absolute after:top-0 after:left-0 after:h-1 after:w-full after:bg-red-500',
  bottom:
    'after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:h-1 after:w-full after:bg-red-500',
}

const ROW_SPAN_CLASSES: Record<BentoRowSpan, string> = {
  1: 'row-span-1',
  2: 'row-span-2',
  3: 'row-span-3',
  4: 'row-span-4',
}

export function bentoPanelClass(
  active: boolean,
  colSpan: BentoSpan,
  rowSpan: BentoRowSpan,
  dragging: boolean,
  snapZone: SnapZone | null,
): string {
  return [
    'relative flex min-h-[120px] min-w-0 shrink-0 flex-col overflow-hidden rounded-lg border border-zinc-800 border-l-2 bg-zinc-950',
    colSpan === 2 ? 'col-span-2' : 'col-span-1',
    ROW_SPAN_CLASSES[rowSpan],
    active ? 'border-l-red-500 ring-1 ring-red-500/30' : 'border-l-zinc-800',
    dragging ? 'opacity-40' : '',
    snapZone ? SNAP_CLASSES[snapZone] : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function panelWidthStyle(widthPct: number): string {
  return widthPct >= 99.5 ? '100%' : `calc(${widthPct}% - 0.25rem)`
}
