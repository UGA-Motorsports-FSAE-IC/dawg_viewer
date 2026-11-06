export const toolbarButton =
  'rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:text-zinc-600 disabled:hover:bg-transparent'

export const toolbarButtonActive =
  'rounded border border-red-500 bg-red-500/15 px-2.5 py-1 text-xs text-zinc-100'

export const plotStack =
  'min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-zinc-900 p-1.5 [scrollbar-gutter:stable]'

export function plotPanelClass(active: boolean): string {
  return [
    'relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border border-zinc-800 border-l-2 bg-zinc-950',
    active ? 'border-l-red-500 ring-1 ring-red-500/30' : 'border-l-zinc-800',
  ].join(' ')
}
