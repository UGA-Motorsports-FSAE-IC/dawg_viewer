import { useState } from 'react'
import { palette, setStreamColor, streamColor } from '../data/streamColors'

export function StreamColorPicker({ id }: { id: string }) {
  const color = streamColor(id)
  const [draft, setDraft] = useState(color)
  const valid = /^#[0-9a-f]{6}$/i.test(draft)
  const commit = () => {
    if (valid) setStreamColor(id, draft)
    else setDraft(color)
  }
  return (
    <div className="mb-3 text-xs">
      <div className="mb-1 flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1 truncate" title={id}>
          {id}
        </span>
        <button
          type="button"
          className="text-zinc-500 hover:text-zinc-100"
          onClick={() => {
            setStreamColor(id, null)
            setDraft(streamColor(id))
          }}
        >
          Reset
        </button>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label={`Colors for ${id}`}>
        {palette.map((choice) => (
          <button
            key={choice}
            type="button"
            aria-label={`Set ${id} to ${choice}`}
            aria-pressed={color.toLowerCase() === choice}
            className={`size-5 rounded-full border-2 ${color.toLowerCase() === choice ? 'border-zinc-100' : 'border-transparent'}`}
            style={{ background: choice }}
            onClick={() => {
              setStreamColor(id, choice)
              setDraft(choice)
            }}
          />
        ))}
      </div>
      <label className="mt-2 block text-zinc-400">
        Hex color
        <input
          aria-label={`Hex color for ${id}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit()
              e.currentTarget.blur()
            }
            if (e.key === 'Escape') setDraft(color)
          }}
          className={`mt-1 w-full rounded border bg-zinc-900 px-2 py-1 text-zinc-100 outline-none focus:border-red-500 ${valid ? 'border-zinc-700' : 'border-red-500'}`}
        />
      </label>
    </div>
  )
}
