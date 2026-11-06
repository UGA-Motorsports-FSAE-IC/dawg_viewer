import { useEffect, useReducer } from 'react'
import { ChannelList } from '../components/ChannelList'
import { PlotStack } from '../components/PlotStack'
import { PlotPanel } from '../components/PlotPanel'
import { StatusBar } from '../components/StatusBar'
import type { Session } from '../data/session'
import { createViewSync } from '../plot/sync'
import { layoutReducer, makeLayout } from '../state/layout'
import { toolbarButton } from '../ui'
import { startingPanels } from '../viewer/openLog'
import type { PlotLayoutMode } from '../settings/plotLayout'

const sync = createViewSync('viewer')
const NO_CHANNELS: string[] = []

interface Props {
  session: Session | null
  loading: boolean
  error: string
  onOpenFile: () => void
  plotLayoutMode: PlotLayoutMode
}

export function ViewerView({ session, loading, error, onOpenFile, plotLayoutMode }: Props) {
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      {session ? (
        <LoadedLog
          key={session.path}
          session={session}
          onOpenFile={onOpenFile}
          loading={loading}
          plotLayoutMode={plotLayoutMode}
        />
      ) : (
        <div className="grid flex-1 place-items-center">
          <div className="space-y-3 text-center">
            <p className="text-sm text-zinc-400">
              Open a CSV or .bin log, or pick one in the Logs tab.
            </p>
            <button type="button" className={toolbarButton} disabled={loading} onClick={onOpenFile}>
              {loading ? 'Opening…' : 'Open log…'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="border-t border-zinc-800 px-3 py-1 text-xs text-red-300">{error}</p>}
    </div>
  )
}

function LoadedLog({
  session,
  loading,
  onOpenFile,
  plotLayoutMode,
}: {
  session: Session
  loading: boolean
  onOpenFile: () => void
  plotLayoutMode: PlotLayoutMode
}) {
  const [layout, dispatch] = useReducer(layoutReducer, startingPanels(session), makeLayout)
  const activePanel = layout.panels.find((p) => p.id === layout.activeId)

  const resetZoom = () => {
    const { time } = session
    if (time.length > 1) sync.setRange({ min: time[0], max: time[time.length - 1] })
  }
  useEffect(resetZoom, [session])

  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
        <button type="button" className={toolbarButton} disabled={loading} onClick={onOpenFile}>
          {loading ? 'Opening…' : 'Open log…'}
        </button>
        <button
          type="button"
          className={toolbarButton}
          onClick={() => dispatch({ type: 'addPanel' })}
        >
          Add plot
        </button>
        <button type="button" className={toolbarButton} onClick={resetZoom}>
          Reset zoom
        </button>
        <span className="ml-auto truncate text-xs text-zinc-500" title={session.path}>
          {session.name}
          {session.note && <span className="text-zinc-600"> · {session.note}</span>}
        </span>
      </div>

      <div className="flex min-h-0 flex-1">
        <ChannelList
          channels={session.channels}
          selectedIds={activePanel?.channelIds ?? NO_CHANNELS}
          dispatch={dispatch}
        />
        <PlotStack
          panels={layout.panels}
          mode={plotLayoutMode}
          dispatch={dispatch}
          renderPanel={(panel, i) => (
            <PlotPanel
              key={panel.id}
              panel={panel}
              slotted
              panels={layout.panels}
              layoutMode={plotLayoutMode}
              index={i}
              active={panel.id === layout.activeId}
              session={session}
              sync={sync}
              dispatch={dispatch}
            />
          )}
        />
      </div>

      <StatusBar session={session} sync={sync} />
    </>
  )
}
