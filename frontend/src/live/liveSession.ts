import type { Channel, Session } from '../data/session'
import { channels, colorFor, info, status, store } from './connection'

export const LIVE_PATH = 'live://session'

export function liveSession(): Session | null {
  const n = store.length
  if (n < 2) return null
  const time = store.times().slice()
  const metas = info.get()?.channels ?? {}
  const out: Channel[] = []
  for (const c of channels.get()) {
    const col = store.column(c.name)
    if (!col) continue
    const meta = metas[c.name] ?? c.meta
    out.push({
      id: c.name,
      name: c.name,
      group: 'Log',
      unit: meta?.unit ?? '',
      color: colorFor(c.name),
      precision: meta?.precision ?? 2,
      data: col.slice(),
    })
  }
  const duration = time[n - 1] - time[0]
  return {
    name: `Live data · ${status.get().profileName || 'logger'}`,
    path: LIVE_PATH,
    source: 'live',
    note: 'updates every second',
    sampleRate: duration > 0 ? Math.round((n - 1) / duration) : 0,
    time,
    channels: out,
    byId: new Map(out.map((c) => [c.id, c])),
  }
}
