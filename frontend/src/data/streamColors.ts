import { useSyncExternalStore } from 'react'
import { CHANNEL_COLORS } from './session'

const KEY = 'dawg.stream-colors.v1'
const listeners = new Set<() => void>()
const overrides = new Map<string, string>()
try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>
  for (const [id, color] of Object.entries(saved))
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) overrides.set(id, color)
} catch {
  /* storage may be unavailable */
}

export function streamColor(id: string): string {
  const override = overrides.get(id)
  if (override) return override
  let hash = 0
  for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0
  return CHANNEL_COLORS[(hash >>> 0) % CHANNEL_COLORS.length]
}

export function setStreamColor(id: string, color: string | null) {
  if (color !== null && !/^#[0-9a-f]{6}$/i.test(color)) return
  if (color === null) overrides.delete(id)
  else overrides.set(id, color)
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
