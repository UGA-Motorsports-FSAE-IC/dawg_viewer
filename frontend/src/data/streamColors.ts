import { useSyncExternalStore } from 'react'
import { CHANNEL_COLORS } from './session'

const KEY = 'dawg.stream-colors.v1'
const listeners = new Set<() => void>()
const overrides = new Map<string, string>()
const defaults = new Map<string, string>()
try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
  for (const [id, color] of Object.entries(saved))
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) overrides.set(id, color)
} catch {
  /* storage may be unavailable */
}

export const palette = CHANNEL_COLORS

export function streamColor(id: string, preferredIndex?: number): string {
  const override = overrides.get(id)
  if (!defaults.has(id))
    defaults.set(id, CHANNEL_COLORS[(preferredIndex ?? defaults.size) % CHANNEL_COLORS.length])
  return override ?? defaults.get(id)!
}

export function setStreamColor(id: string, color: string | null) {
  if (color !== null && !/^#[0-9a-f]{6}$/i.test(color)) return
  if (color === null) overrides.delete(id)
  else overrides.set(id, color.toLowerCase())
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(overrides)))
  } catch {
    /* keep in memory */
  }
  for (const listener of listeners) listener()
}

export function subscribeStreamColors(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

let revision = 0
subscribeStreamColors(() => {
  revision++
})
export function useStreamColors() {
  useSyncExternalStore(subscribeStreamColors, () => revision)
}
