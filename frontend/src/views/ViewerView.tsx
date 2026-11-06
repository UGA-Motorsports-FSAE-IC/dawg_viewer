import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { buildOverlay } from '../analysis/overlay'
import type { Lap } from '../analysis/track'
import type { Calibration } from '../../bindings/dawg_viewer/internal/config/models'
import { ChannelEditor } from '../components/ChannelEditor'
import { applyCal, inverter } from '../data/calibration'
import { ChannelList } from '../components/ChannelList'
import { FilterDialog, type FilterStart } from '../components/FilterDialog'
import { parseFilter } from '../analysis/filters'
import { HistogramPanel } from '../components/HistogramPanel'
import { AeroPanel } from '../components/AeroPanel'
import { LaunchPanel } from '../components/LaunchPanel'
import { MathEditor } from '../components/MathEditor'
import { PlotPanel } from '../components/PlotPanel'
import { Sidebar, type LapSelection } from '../components/Sidebar'
import { SpectrumPanel } from '../components/SpectrumPanel'
import { RangeBar } from '../components/RangeBar'
import { StatusBar } from '../components/StatusBar'
import { TrackMapPanel } from '../components/TrackMapPanel'
import { WorksheetTabs } from '../components/WorksheetTabs'
import { XYPanel } from '../components/XYPanel'
import type { Channel, Session } from '../data/session'
import { createViewSync } from '../plot/sync'
import { mathDefs, useTrack } from '../state/analysis'
import type { LayoutAction, PanelKind } from '../state/layout'
import { applySetup, currentSetup, onWorkbook, WORKBOOK_KEY } from '../state/setup'
import { download, load, pickTextFile, save } from '../state/storage'
import {
  activeSheet,
  defaultWorkbook,
  validWorkbook,
  workbookReducer,
  type Workbook,
} from '../state/workbook'
import { toolbarButton, toolbarButtonActive } from '../ui'
import { useAnalysis } from '../viewer/analysis'
import { distanceView, timeView } from '../viewer/xview'

const NO_CHANNELS: string[] = []

interface LiveProps {
  watching?: boolean
  waitingLive?: boolean
  onWatchLive?: () => void
  onStopLive?: () => void
}

interface Props extends LiveProps {
  session: Session | null
  loading: boolean
  error: string
  onOpenFile: () => void
  onReload?: () => void
}

export function ViewerView({
  session,
  loading,
  error,
  onOpenFile,
  onReload,
  watching,
  waitingLive,
  onWatchLive,
  onStopLive,
}: Props) {
  return (
    <div className="flex h-full flex-col">
      {session ? (
        <LoadedLog
          key={session.path}
          session={session}
          onOpenFile={onOpenFile}
          onReload={onReload}
          loading={loading}
          watching={watching}
          onWatchLive={onWatchLive}
          onStopLive={onStopLive}
        />
      ) : (
        <div className="grid flex-1 place-items-center">
          <div className="space-y-3 text-center">
            <p className="text-sm text-zinc-400">
              Open a CSV or .bin log, or pick one in the Logs tab.
            </p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                className={toolbarButton}
                disabled={loading}
                onClick={onOpenFile}
              >
                {loading ? 'Opening…' : 'Open log…'}
              </button>
              <button type="button" className={toolbarButton} onClick={onWatchLive}>
                ● Watch live data
              </button>
            </div>
            {waitingLive && (
              <p className="text-xs text-zinc-500">
                Waiting for live data. Connect to the car on the Live tab, or turn on Test mode.
              </p>
            )}
          </div>
        </div>
      )}
      {error && <p className="border-t border-zinc-800 px-3 py-1 text-xs text-red-300">{error}</p>}
    </div>
  )
}

const ADD: [PanelKind, string, string][] = [
  ['time', 'Plot', 'Channels against time (or lap distance when overlaying)'],
  ['xy', 'XY', 'One channel against another, e.g. a G-G diagram'],
  ['histogram', 'Histogram', 'How much of the time a channel spends at each value'],
  ['map', 'Track map', 'GPS track coloured by a channel'],
  ['spectrum', 'Spectrum', 'Frequency content (FFT) of channels, e.g. dampers or accelerometers'],
  ['launch', 'Launch', 'Launches: acceleration against the traction-limit target, and wheel slip'],
  ['aero', 'Aero', 'Grip against speed, compared with what the tyres and the aero should give'],
]

function LoadedLog({
  session: loaded,
  loading,
  onOpenFile,
  onReload,
  watching,
  onWatchLive,
  onStopLive,
}: {
  session: Session
  loading: boolean
  onOpenFile: () => void
  onReload?: () => void
} & LiveProps) {
  const [recal, setRecal] = useState<{ session: Session; data: Map<string, Float64Array> } | null>(
    null,
  )
  const base = useMemo(() => {
    if (!recal || recal.session !== loaded) return loaded
    const channels = loaded.channels.map((c) => {
      const data = recal.data.get(c.id)
      return data ? { ...c, data } : c
    })
    return { ...loaded, channels, byId: new Map(channels.map((c) => [c.id, c])) }
  }, [loaded, recal])
  const analysis = useAnalysis(base)
  const { session, laps, gps, distance } = analysis
  const track = useTrack()

  const [workbook, dispatchWb] = useReducer(
    workbookReducer,
    null,
    () =>
      load<Workbook | null>(WORKBOOK_KEY, null, (v): v is Workbook => validWorkbook(v)) ??
      defaultWorkbook(new Set(base.channels.map((c) => c.id)), gps != null),
  )
  useEffect(() => {
    save(WORKBOOK_KEY, workbook)
  }, [workbook])
  const fresh = useCallback(
    () => defaultWorkbook(new Set(base.channels.map((c) => c.id)), gps != null),
    [base, gps],
  )
  useEffect(
    () =>
      onWorkbook((wb) => {
        dispatchWb({ type: 'replace', workbook: wb ?? fresh() })
      }),
    [fresh],
  )
  const sheet = activeSheet(workbook)
  const layout = sheet.layout
  const activePanel = layout.panels.find((p) => p.id === layout.activeId)
  const dispatch = useCallback((action: LayoutAction) => dispatchWb({ type: 'layout', action }), [])

  const [selection, setSelection] = useState<LapSelection>({ keys: [], refKey: '' })
  const [overlayOn, setOverlayOn] = useState(false)
  const shown = useMemo(() => {
    const picked = laps.filter((l) => selection.keys.includes(l.key))
    const ref = picked.find((l) => l.key === selection.refKey) ?? picked[0]
    return ref ? [ref, ...picked.filter((l) => l !== ref)] : []
  }, [laps, selection])
  const overlay = useMemo(
    () =>
      overlayOn && distance && shown.length > 0
        ? buildOverlay(base.time, distance, shown, track.normalize)
        : null,
    [overlayOn, distance, shown, base.time, track.normalize],
  )

  const tView = useMemo(() => timeView(base.time, laps), [base.time, laps])
  const dView = useMemo(() => (overlay ? distanceView(overlay) : null), [overlay])
  const view = dView ?? tView
  const sync = useMemo(() => createViewSync(dView ? 'viewer-distance' : 'viewer-time'), [dView])

  const pendingZoom = useRef<Lap | null>(null)
  const pendingRange = useRef<{ min: number; max: number } | null>(null)
  useEffect(() => {
    const lap = pendingZoom.current
    const range = pendingRange.current
    pendingZoom.current = null
    pendingRange.current = null
    if (lap && view.mode === 'time') sync.setRange({ min: lap.t0, max: lap.t1 })
    else if (range && view.mode === 'time') sync.setRange(range)
    else sync.setRange({ min: view.bounds[0], max: view.bounds[1] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync])

  const isLive = loaded.source === 'live'
  const [follow, setFollow] = useState(true)
  const ownRange = useRef(false)
  const liveEnd = useRef(0)
  const lastStart = useRef(0)
  useEffect(() => {
    if (!isLive || view.mode !== 'time') return
    const [b0, b1] = view.bounds
    liveEnd.current = b1
    const cur = sync.range()
    const fromStart = !cur || cur.min <= lastStart.current + 1e-6
    lastStart.current = b0
    if (!follow) return
    const span = cur ? Math.min(cur.max - cur.min, b1 - b0) : b1 - b0
    ownRange.current = true
    sync.setRange(fromStart ? { min: b0, max: b1 } : { min: Math.max(b0, b1 - span), max: b1 })
    ownRange.current = false
  }, [isLive, follow, view, sync])
  useEffect(() => {
    if (!isLive) return
    return sync.onRange((r) => {
      if (!ownRange.current && r.max < liveEnd.current - 0.25) setFollow(false)
    })
  }, [isLive, sync])

  const resetZoom = () => sync.setRange({ min: view.bounds[0], max: view.bounds[1] })
  const zoomTo = (min: number, max: number) => {
    if (view.mode === 'time') sync.setRange({ min, max })
    else {
      pendingRange.current = { min, max }
      setOverlayOn(false)
    }
  }
  const zoomLap = (lap: Lap) => {
    if (view.mode === 'time') sync.setRange({ min: lap.t0, max: lap.t1 })
    else {
      pendingZoom.current = lap
      setOverlayOn(false)
    }
  }

  const listChannels = useMemo(
    () => (dView ? [...session.channels, analysis.timeSlip] : session.channels),
    [dView, session.channels, analysis.timeSlip],
  )
  const extra = useMemo(() => [analysis.timeSlip], [analysis.timeSlip])

  const plotted = useMemo(() => {
    const ids = new Set(layout.panels.filter((p) => p.kind === 'time').flatMap((p) => p.channelIds))
    return [...ids].flatMap((id): Channel[] => {
      const ch = session.byId.get(id)
      return ch ? [ch] : []
    })
  }, [layout.panels, session])

  const [editing, setEditing] = useState<string | null>(null)
  const [filtering, setFiltering] = useState<FilterStart | null>(null)
  const editingChannel = editing ? session.byId.get(editing) : undefined
  const isLogChannel = useCallback((id: string) => base.byId.has(id), [base])
  const isMathChannel = useCallback(
    (id: string) => session.byId.get(id)?.group === 'Math',
    [session],
  )
  const groups = useMemo(() => [...new Set(session.channels.map((c) => c.group))], [session])
  const lastSample = useRef(-1)
  useEffect(() => {
    lastSample.current = -1
    return sync.onCursor((idx) => {
      if (idx != null) lastSample.current = view.samplesAt(idx)[0] ?? -1
    })
  }, [sync, view])
  const launchCursor = useCallback(() => {
    const i = lastSample.current
    return view.mode === 'time' && i >= 0 && i < base.time.length ? base.time[i] : null
  }, [view, base])
  const launchRange = useCallback(() => (view.mode === 'time' ? sync.range() : null), [view, sync])

  const cursorValue = useCallback(() => {
    const ch = editing ? session.byId.get(editing) : undefined
    const i = lastSample.current
    return ch && i >= 0 && i < ch.data.length ? ch.data[i] : undefined
  }, [editing, session])
  const recalibrate = (before: Calibration | undefined, after: Calibration | null) => {
    const id = editing
    const ch = id ? base.byId.get(id) : undefined
    if (!id || !ch) return
    if (base.source !== 'wide') {
      onReload?.()
      return
    }
    const inv = inverter(before)
    if (!inv) {
      setNotice(`Saved. Reopen the original .bin log to see ${id} with the new calibration.`)
      return
    }
    const data = ch.data.map((v) => applyCal(inv(v) ?? NaN, after))
    setRecal((r) => ({
      session: loaded,
      data: new Map([...(r && r.session === loaded ? r.data : []), [id, data]]),
    }))
    setNotice(`Recalibrated ${id} in this log`)
  }

  const viewBounds = useCallback((): [number, number] => view.bounds, [view])
  const markerXs = useMemo(() => view.markers.map((m) => m.x), [view])
  const [showSide, setShowSide] = useState(true)
  const [showMath, setShowMath] = useState(false)
  const [notice, setNotice] = useState('')

  const exportSetup = () => {
    download('dawg-viewer-setup.json', JSON.stringify({ ...currentSetup(), workbook }, null, 2))
  }
  const importSetup = async () => {
    const text = await pickTextFile('.json,application/json')
    if (!text) return
    try {
      applySetup(JSON.parse(text))
      setNotice('Setup imported')
    } catch (e) {
      setNotice(`Couldn't import: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  const deleteChannel = (id: string) => {
    mathDefs.set(mathDefs.get().filter((d) => d.name !== id))
    dispatchWb({
      type: 'replace',
      workbook: {
        ...workbook,
        sheets: workbook.sheets.map((sh) => ({
          ...sh,
          layout: {
            ...sh.layout,
            panels: sh.layout.panels.map((p) => ({
              ...p,
              channelIds: p.channelIds.filter((c) => c !== id),
            })),
          },
        })),
      },
    })
    setNotice(`Deleted ${id}`)
  }
  const resetSheets = () =>
    dispatchWb({
      type: 'replace',
      workbook: defaultWorkbook(new Set(session.channels.map((c) => c.id)), gps != null),
    })

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
        <button type="button" className={toolbarButton} disabled={loading} onClick={onOpenFile}>
          {loading ? 'Opening…' : 'Open log…'}
        </button>
        {watching ? (
          <>
            <button
              type="button"
              className={toolbarButtonActive}
              title="Stop updating and close the live data"
              onClick={onStopLive}
            >
              ● Live · stop
            </button>
            {!follow && (
              <button
                type="button"
                className={toolbarButton}
                title="Jump back to the newest data and keep up with it"
                onClick={() => setFollow(true)}
              >
                Follow live
              </button>
            )}
          </>
        ) : (
          onWatchLive && (
            <button
              type="button"
              className={toolbarButton}
              title="Show the live stream here, with these sheets and panels, updating every second"
              onClick={onWatchLive}
            >
              ● Watch live data
            </button>
          )
        )}
        <span className="ml-2 text-xs text-zinc-500">Add</span>
        {ADD.map(([kind, label, title]) => (
          <button
            key={kind}
            type="button"
            className={toolbarButton}
            title={title}
            onClick={() => dispatch({ type: 'addPanel', kind })}
          >
            {label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-zinc-800" />
        <button type="button" className={toolbarButton} onClick={resetZoom}>
          Reset zoom
        </button>
        <button
          type="button"
          className={toolbarButton}
          title="Make new channels from formulas"
          onClick={() => setShowMath(true)}
        >
          Math channels…
        </button>
        <button
          type="button"
          className={toolbarButton}
          title="Make filtered copies of one, several or every channel"
          onClick={() =>
            setFiltering({
              channelIds: (activePanel?.channelIds ?? []).filter((id) => session.byId.has(id)),
            })
          }
        >
          ∿ Filter…
        </button>
        {overlayOn && dView && (
          <button type="button" className={toolbarButtonActive} onClick={() => setOverlayOn(false)}>
            Overlay on · back to time
          </button>
        )}
        <span className="ml-auto truncate text-xs text-zinc-500" title={session.path}>
          {session.name}
          {session.note && <span className="text-zinc-600"> · {session.note}</span>}
        </span>
        <button
          type="button"
          className={showSide ? toolbarButtonActive : toolbarButton}
          title="Laps, statistics and values at the cursor"
          onClick={() => setShowSide((s) => !s)}
        >
          Laps & stats
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <ChannelList
          channels={listChannels}
          selectedIds={activePanel?.channelIds ?? NO_CHANNELS}
          dispatch={dispatch}
          onEdit={setEditing}
          editable={isLogChannel}
          onFilter={(id) => {
            const def = mathDefs.get().find((d) => d.name === id)
            const made = def ? parseFilter(def.expr) : null
            setFiltering(
              def && made && session.byId.has(made.source)
                ? {
                    channelIds: [made.source],
                    edit: { id: def.id, name: def.name, spec: made.spec },
                  }
                : { channelIds: [id] },
            )
          }}
          deletable={isMathChannel}
          onDelete={deleteChannel}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="grid min-h-0 min-w-0 flex-1 auto-rows-[minmax(17rem,1fr)] grid-cols-2 gap-px overflow-y-auto bg-zinc-800">
            {layout.panels.map((panel, i) => {
              const key = `${sheet.id}-${panel.id}`
              const common = {
                panel,
                index: i,
                active: panel.id === layout.activeId,
                session,
                view,
                sync,
                dispatch,
              }
              switch (panel.kind) {
                case 'xy':
                  return <XYPanel key={key} {...common} />
                case 'histogram':
                  return <HistogramPanel key={key} {...common} />
                case 'map':
                  return <TrackMapPanel key={key} {...common} gps={gps} />
                case 'spectrum':
                  return <SpectrumPanel key={key} {...common} onFilter={setFiltering} />
                case 'launch':
                  return (
                    <LaunchPanel
                      key={key}
                      panel={panel}
                      index={i}
                      active={panel.id === layout.activeId}
                      session={session}
                      gps={gps}
                      distance={distance}
                      distanceFromGps={analysis.distanceLabel === 'GPS'}
                      dispatch={dispatch}
                      onZoom={zoomTo}
                      cursorTime={launchCursor}
                      viewRange={launchRange}
                    />
                  )
                case 'aero':
                  return (
                    <AeroPanel
                      key={key}
                      {...common}
                      distance={distance}
                      distanceFromGps={analysis.distanceLabel === 'GPS'}
                    />
                  )
                default:
                  return <PlotPanel key={key} {...common} extraChannels={extra} />
              }
            })}
          </main>
          <RangeBar sync={sync} bounds={viewBounds} markers={markerXs} minSpan={view.minSpan} />
        </div>
        {showSide && (
          <Sidebar
            analysis={analysis}
            view={view}
            sync={sync}
            plotted={plotted}
            selection={selection}
            onSelection={setSelection}
            onZoomLap={zoomLap}
            overlay={overlayOn && dView != null}
            onOverlay={setOverlayOn}
            onClose={() => setShowSide(false)}
          />
        )}
      </div>

      <WorksheetTabs
        workbook={workbook}
        dispatch={dispatchWb}
        right={
          <>
            {notice && <span className="text-xs text-zinc-400">{notice}</span>}
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-200"
              title="Save worksheets, math channels and start/finish to a file for the team"
              onClick={exportSetup}
            >
              Export setup
            </button>
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-200"
              onClick={() => void importSetup()}
            >
              Import setup
            </button>
            <button
              type="button"
              className="text-xs text-zinc-500 hover:text-zinc-200"
              title="Replace the worksheets with the premade Driver / Engine / Chassis sheets"
              onClick={resetSheets}
            >
              Premade sheets
            </button>
          </>
        }
      />
      <StatusBar session={session} sync={sync} view={view} />
      {editingChannel && (
        <ChannelEditor
          name={editingChannel.id}
          color={editingChannel.color}
          unit={editingChannel.unit}
          precision={editingChannel.precision}
          group={editingChannel.group}
          groups={groups}
          canCalibrate
          currentValue={cursorValue}
          valueSource="Value at the cursor"
          onClose={() => setEditing(null)}
          onSaved={recalibrate}
        />
      )}
      {filtering && (
        <FilterDialog
          session={session}
          start={filtering}
          onClose={() => setFiltering(null)}
          onCreated={(names, panelId) => {
            const edited = filtering.edit
            setFiltering(null)
            if (edited) {
              setNotice(`Updated ${edited.name}`)
              return
            }
            const target = layout.panels.find((p) => p.id === panelId)
            if (target) {
              dispatch({
                type: 'setPanel',
                panelId: target.id,
                patch: {
                  channelIds: [...target.channelIds.filter((c) => !names.includes(c)), ...names],
                },
              })
            } else if (names.length === 1 && !activePanel?.channelIds.includes(names[0])) {
              dispatch({ type: 'toggleChannel', channelId: names[0] })
            }
            setNotice(
              names.length === 1
                ? `Made ${names[0]}. It's under Math in the channel list.`
                : `Made ${names.length} filtered channels. They're under Math in the channel list.`,
            )
          }}
        />
      )}
      {showMath && (
        <MathEditor
          channels={session.channels}
          errors={analysis.mathErrors}
          onClose={() => setShowMath(false)}
        />
      )}
    </>
  )
}
