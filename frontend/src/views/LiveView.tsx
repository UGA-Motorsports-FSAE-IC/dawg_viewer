import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type { ChannelMeta } from '../../bindings/dawg_viewer/internal/config/models'
import { ChannelEditor } from '../components/ChannelEditor'
import { ChannelList, type ListChannel } from '../components/ChannelList'
import { RangeBar } from '../components/RangeBar'
import { defaultGroup } from '../data/groups'
import { colorFor, onLiveFrame, startLive, store, useChannels, useInfo } from '../live/connection'
import { LiveMap } from '../live/LiveMap'
import { LivePlotPanel } from '../live/LivePlotPanel'
import { PinnedCards } from '../live/PinnedCards'
import { StatusHeader } from '../live/StatusHeader'
import { liveSync, resumeFollow, showWindow, useFollow } from '../live/follow'
import { layoutReducer, makeLayout } from '../state/layout'
import { toolbarButton, toolbarButtonActive } from '../ui'

const initialLayout = makeLayout([
  ['RPM', 'TPS1'],
  ['CLT1', 'OilTemp', 'RadTemp'],
  ['AccelX', 'AccelY'],
])

const WINDOWS: [number, string][] = [
  [10, '10 s'],
  [30, '30 s'],
  [60, '1 min'],
  [300, '5 min'],
  [Infinity, 'All'],
]

const NO_CHANNELS: string[] = []
const liveBounds = () => store.bounds()
const liveSubscribe = (fn: () => void) => onLiveFrame(fn)
const NO_METAS: Record<string, ChannelMeta | undefined> = {}

export function LiveView() {
  useEffect(startLive, [])
  const info = useInfo()
  const channels = useChannels()
  const metas = info?.channels ?? NO_METAS
  const [layout, dispatch] = useReducer(layoutReducer, initialLayout)
  const activePanel = layout.panels.find((p) => p.id === layout.activeId)

  const { follow, windowS } = useFollow()
  const [showMap, setShowMap] = useState(false)

  const known = useMemo(() => new Set(channels.map((c) => c.name)), [channels])
  const listChannels = useMemo<ListChannel[]>(
    () =>
      channels.map((c) => ({
        id: c.name,
        name: c.name,
        label: metas[c.name]?.label || undefined,
        group:
          metas[c.name]?.group || defaultGroup(c.name) || (c.id >= 0 ? 'From device' : 'Computed'),
        unit: metas[c.name]?.unit ?? '',
        color: colorFor(c.name),
      })),
    [channels, metas],
  )
  const [editing, setEditing] = useState<string | null>(null)
  const editingChannel = listChannels.find((c) => c.id === editing)
  const groups = useMemo(() => [...new Set(listChannels.map((c) => c.group))], [listChannels])
  const deviceIds = useMemo(
    () => new Set(channels.filter((c) => c.id >= 0).map((c) => c.name)),
    [channels],
  )
  const currentValue = useCallback(() => (editing ? store.latest(editing) : undefined), [editing])

  return (
    <div className="flex h-full flex-col">
      <StatusHeader />
      <div className="flex min-h-0 flex-1">
        <ChannelList
          channels={listChannels}
          selectedIds={activePanel?.channelIds ?? NO_CHANNELS}
          dispatch={dispatch}
          onEdit={setEditing}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <PinnedCards metas={metas} />
          <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
            {WINDOWS.map(([s, label]) => (
              <button
                key={label}
                type="button"
                className={windowS === s ? toolbarButtonActive : toolbarButton}
                onClick={() => showWindow(s)}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              className={follow ? toolbarButtonActive : toolbarButton}
              title="Keep the plots on the newest data"
              onClick={resumeFollow}
            >
              {follow ? '● Live' : 'Resume live'}
            </button>
            <button
              type="button"
              className={`${showMap ? toolbarButtonActive : toolbarButton} ml-auto`}
              title="Live position on the track and lap times"
              onClick={() => setShowMap((m) => !m)}
            >
              Track map
            </button>
            <button
              type="button"
              className={toolbarButton}
              onClick={() => dispatch({ type: 'addPanel' })}
            >
              Add plot
            </button>
          </div>
          <div className="flex min-h-0 flex-1">
            <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-px overflow-y-auto bg-zinc-800">
              {layout.panels.map((panel, i) => (
                <LivePlotPanel
                  key={panel.id}
                  panel={panel}
                  index={i}
                  active={panel.id === layout.activeId}
                  known={known}
                  metas={metas}
                  sync={liveSync}
                  dispatch={dispatch}
                />
              ))}
            </main>
            {showMap && <LiveMap onClose={() => setShowMap(false)} />}
          </div>
          <RangeBar sync={liveSync} bounds={liveBounds} subscribe={liveSubscribe} minSpan={1} />
        </div>
      </div>
      {editingChannel && (
        <ChannelEditor
          name={editingChannel.id}
          color={editingChannel.color}
          unit={editingChannel.unit}
          precision={metas[editingChannel.id]?.precision ?? 2}
          group={editingChannel.group}
          groups={groups}
          canCalibrate={deviceIds.has(editingChannel.id)}
          currentValue={currentValue}
          valueSource="Live value"
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
