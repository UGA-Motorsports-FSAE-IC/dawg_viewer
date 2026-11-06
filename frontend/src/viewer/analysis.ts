import { useMemo } from 'react'
import { fusePosition, type Fusion } from '../analysis/fusion'
import { computeAll } from '../analysis/math'
import {
  beaconCrossings,
  buildLaps,
  buildRuns,
  pairGates,
  runEnd,
  cumulativeDistance,
  findGps,
  findSpeed,
  guessSpeedUnit,
  lapColumns,
  lowerBound,
  TO_MPS,
  type DistanceSource,
  type Gps,
  type Lap,
} from '../analysis/track'
import type { ChannelMeta } from '../../bindings/dawg_viewer/internal/config/models'
import { defaultGroup } from '../data/groups'
import { CHANNEL_COLORS, type Channel, type Session } from '../data/session'
import { useInfo } from '../live/connection'
import { findLaunches, speedFromDistance } from '../analysis/launch'
import {
  useLaunchMarks,
  useMathDefs,
  useSplits,
  useTrack,
  type TrackSettings,
} from '../state/analysis'

export const TIMESLIP_ID = '__timeslip'

export interface Analysis {
  fusion: Fusion | null
  session: Session
  gps: Gps | null
  distance: Float64Array | null
  distanceLabel: string
  laps: Lap[]
  crossings: number[]
  mathErrors: Map<string, string>
  timeSlip: Channel
}

export function resolveDistanceSource(
  channels: Channel[],
  gps: Gps | null,
  t: TrackSettings,
): { source: DistanceSource; label: string } | null {
  const speed = (): { source: DistanceSource; label: string } | null => {
    const ch =
      (t.speedChannel && channels.find((c) => c.id === t.speedChannel)) || findSpeed(channels)
    if (!ch) return null
    const unit = t.speedUnit === 'auto' ? guessSpeedUnit(ch.unit) : t.speedUnit
    return { source: { kind: 'speed', channelId: ch.id, unit }, label: `${ch.name} (${unit})` }
  }
  if (t.distance === 'speed') return speed()
  if (gps) return { source: { kind: 'gps' }, label: 'GPS' }
  return t.distance === 'auto' ? speed() : null
}

function makeChannel(
  id: string,
  group: string,
  unit: string,
  precision: number,
  data: Float64Array,
  color: string,
): Channel {
  return { id, name: id, group, unit, precision, data, color }
}

export function withMeta(
  session: Session,
  metas: Record<string, ChannelMeta | undefined> | undefined,
): Session {
  const channels = session.channels.map((c) => {
    const m = metas?.[c.name]
    return {
      ...c,
      label: m?.label || undefined,
      color: m?.color || c.color,
      unit: m?.unit || c.unit,
      precision: m?.precision ?? c.precision,
      group: m?.group || defaultGroup(c.name) || c.group,
    }
  })
  return { ...session, channels, byId: new Map(channels.map((c) => [c.id, c])) }
}

export function useAnalysis(raw: Session): Analysis {
  const metas = useInfo()?.channels ?? undefined
  const base = useMemo(() => withMeta(raw, metas), [raw, metas])
  const track = useTrack()
  const splitsByPath = useSplits()
  const defs = useMathDefs()
  const splitTimes = splitsByPath[raw.path]

  const rawGps = useMemo(() => findGps(base.channels), [base])
  const fusion = useMemo(() => {
    if (!rawGps || !track.fuse) return null
    const byName = (...names: string[]) =>
      names.map((n) => base.channels.find((c) => c.name.toLowerCase() === n)).find(Boolean)
    const sp = (track.speedChannel && base.byId.get(track.speedChannel)) || findSpeed(base.channels)
    const k = sp
      ? TO_MPS[track.speedUnit === 'auto' ? guessSpeedUnit(sp.unit) : track.speedUnit]
      : 1
    return fusePosition({
      time: base.time,
      lat: rawGps.lat,
      lon: rawGps.lon,
      speed: sp ? Float64Array.from(sp.data, (v) => v * k) : undefined,
      yaw: byName('yaw', 'heading', 'yawangle', 'course')?.data,
      latAccel: byName('accely', 'acc_y', 'latacc')?.data,
    })
  }, [base, rawGps, track.fuse, track.speedChannel, track.speedUnit])
  const gps = useMemo(
    () => (rawGps && fusion ? { ...rawGps, lat: fusion.lat, lon: fusion.lon } : rawGps),
    [rawGps, fusion],
  )

  const dist = useMemo(() => {
    const resolved = resolveDistanceSource(base.channels, gps, track)
    if (!resolved) return { distance: null, label: '' }
    return {
      distance: cumulativeDistance(base.time, base.channels, resolved.source, gps),
      label: resolved.label,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, gps, track.distance, track.speedChannel, track.speedUnit])

  const mode = track.lapMode ?? 'loop'
  const crossings = useMemo(
    () =>
      gps && track.beacon && (mode === 'loop' || mode === 'gates')
        ? beaconCrossings(base.time, gps, track.beacon, track.radius, track.minLap)
        : [],
    [base, gps, track.beacon, track.radius, track.minLap, mode],
  )
  const finishes = useMemo(
    () =>
      gps && track.finish && mode === 'gates'
        ? beaconCrossings(base.time, gps, track.finish, track.radius, 1)
        : [],
    [base, gps, track.finish, track.radius, mode],
  )
  const launchMarks = useLaunchMarks()[raw.path]

  const laps = useMemo(() => {
    const time = base.time
    if (mode === 'gates') return buildRuns(time, dist.distance, pairGates(crossings, finishes))
    if (mode === 'launch') {
      const sp = findSpeed(base.channels)
      const ground = dist.distance
        ? speedFromDistance(time, dist.distance)
        : sp
          ? Float64Array.from(sp.data, (v) => v * TO_MPS[guessSpeedUnit(sp.unit)])
          : null
      const found = ground ? findLaunches({ time, ground, window: 120 }) : []
      const length = track.runLength ?? 75
      const pairs: [number, number][] = found.map((l) => [
        l.start,
        runEnd(time, dist.distance, l.start, l.end, length),
      ])
      for (const [a, b] of launchMarks ?? []) {
        const i = lowerBound(time, a)
        const j = Math.min(time.length - 1, lowerBound(time, b))
        if (j > i) pairs.push([i, j])
      }
      return buildRuns(time, dist.distance, pairs)
    }
    const manual = (splitTimes ?? []).map((t) => lowerBound(time, t))
    return buildLaps(time, dist.distance, mode === 'manual' ? manual : [...crossings, ...manual])
  }, [base, dist.distance, crossings, finishes, splitTimes, mode, launchMarks, track.runLength])

  const extra = useMemo(() => {
    let color = base.channels.length
    const next = () => CHANNEL_COLORS[color++ % CHANNEL_COLORS.length]
    const out: Channel[] = []
    if (dist.distance) out.push(makeChannel('Distance', 'Analysis', 'm', 1, dist.distance, next()))
    if (laps.length > 0) {
      const cols = lapColumns(base.time, dist.distance, laps)
      out.push(makeChannel('Lap Number', 'Analysis', '', 0, cols.lapNo, next()))
      out.push(makeChannel('Lap Time', 'Analysis', 's', 2, cols.lapTime, next()))
      if (cols.lapDist)
        out.push(makeChannel('Lap Distance', 'Analysis', 'm', 1, cols.lapDist, next()))
    }
    return out.filter((c) => !base.byId.has(c.id))
  }, [base, dist.distance, laps])

  const math = useMemo(() => {
    const all = [...base.channels, ...extra]
    const byName = new Map(all.map((c) => [c.name, c.data]))
    const { results, errors } = computeAll(
      defs,
      { n: base.time.length, time: base.time, get: (name) => byName.get(name) },
      new Set(byName.keys()),
    )
    let color = all.length
    const channels: Channel[] = []
    for (const d of defs) {
      const r = results.get(d.id)
      if (!r) continue
      channels.push({
        id: r.name,
        name: r.name,
        group: 'Math',
        unit: d.unit,
        precision: d.precision,
        data: r.data,
        color: CHANNEL_COLORS[color++ % CHANNEL_COLORS.length],
      })
    }
    return { channels, errors }
  }, [base, extra, defs])

  const session = useMemo<Session>(() => {
    if (extra.length === 0 && math.channels.length === 0) return base
    const channels = [...base.channels, ...extra, ...math.channels]
    return { ...base, channels, byId: new Map(channels.map((c) => [c.id, c])) }
  }, [base, extra, math.channels])

  const timeSlip = useMemo(
    () => ({
      id: TIMESLIP_ID,
      name: 'Time slip',
      group: 'Analysis',
      unit: 's',
      precision: 3,
      data: new Float64Array(0),
      color: '#e4e4e7',
    }),
    [],
  )

  return {
    fusion,
    session,
    gps,
    distance: dist.distance,
    distanceLabel: dist.label,
    laps,
    crossings,
    mathErrors: math.errors,
    timeSlip,
  }
}
