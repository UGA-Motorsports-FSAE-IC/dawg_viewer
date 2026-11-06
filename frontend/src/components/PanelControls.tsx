import type { Dispatch } from 'react'
import type { LayoutAction } from '../state/layout'

export interface PanelContext {
  paired: boolean
  canJoin: boolean
}

export function PanelControls({
  panelId,
  index,
  context,
  dispatch,
}: {
  panelId: number
  index: number
  context: PanelContext
  dispatch: Dispatch<LayoutAction>
}) {
  return (
    <>
      {context.paired && (
        <button
          type="button"
          aria-label={`Put plot ${index + 1} on its own row`}
          title="Put on its own row"
          className="text-zinc-500 hover:text-zinc-200"
          onClick={() => dispatch({ type: 'splitPanel', panelId })}
        >
          ⇵
        </button>
      )}
      {!context.paired && context.canJoin && (
        <button
          type="button"
          aria-label={`Put plot ${index + 1} side by side`}
          title="Put side by side with a neighbouring plot"
          className="text-zinc-500 hover:text-zinc-200"
          onClick={() => dispatch({ type: 'joinPanel', panelId })}
        >
          ⇄
        </button>
      )}
      <button
        type="button"
        aria-label={`Close plot ${index + 1}`}
        className="text-zinc-600 hover:text-zinc-200"
        onClick={() => dispatch({ type: 'removePanel', panelId })}
      >
        ✕
      </button>
    </>
  )
}
